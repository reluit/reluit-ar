import { createClient } from '@/lib/supabase/server'
import { agentTools, type AgentTool } from './tools'
import { taskScheduler } from './scheduler'
import { determineOptimalTiming, type CustomerContext, type InvoiceContext, type CampaignContext } from './context'
import { generateCollectionEmail } from '@/lib/gemini/client'
import { differenceInDays, parseISO, addDays } from 'date-fns'
import type { Campaign, CampaignConfig, EmailTone } from '@/types/database'

/**
 * AI Agent that manages campaign execution and decision-making
 */
export class AIAgent {
  /**
   * Execute a campaign - send emails based on schedule
   */
  async executeCampaign(campaignId: string) {
    const supabase = await createClient()
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single()

    if (!campaign || campaign.status !== 'active') {
      return { executed: false, reason: 'Campaign not active' }
    }

    const config = campaign.config as CampaignConfig
    const now = new Date()

    // Get all invoices in campaign
    const { data: invoices } = await supabase
      .from('invoices')
      .select(`
        *,
        customer:customers(id, name, email, payment_behavior)
      `)
      .in('id', campaign.target_invoice_ids || [])
      .eq('org_id', campaign.org_id)
      .neq('status', 'paid')

    if (!invoices || invoices.length === 0) {
      // All invoices paid, pause campaign
      await supabase
        .from('campaigns')
        .update({ status: 'completed' })
        .eq('id', campaignId)
      return { executed: false, reason: 'All invoices paid' }
    }

    const results = []

    // Process each invoice
    for (const invoice of invoices) {
      const result = await this.processInvoiceForCampaign(campaign, invoice, config, now)
      results.push(result)
    }

    return {
      executed: true,
      invoicesProcessed: results.length,
      emailsSent: results.filter(r => r.emailSent).length,
      results,
    }
  }

  /**
   * Process a single invoice for campaign execution
   */
  private async processInvoiceForCampaign(
    campaign: Campaign,
    invoice: any,
    config: CampaignConfig,
    now: Date
  ) {
    const customer = invoice.customer
    if (!customer?.email) {
      return { invoiceId: invoice.id, emailSent: false, reason: 'No customer email' }
    }

    // Check if customer requested to stop contact (FDCPA requirement)
    const customerMetadata = customer.metadata as any
    if (customerMetadata?.stopContact) {
      return { invoiceId: invoice.id, emailSent: false, reason: 'Customer requested to stop contact' }
    }

    // Check if invoice is paid
    const paymentCheck = await agentTools.find(t => t.name === 'checkInvoicePaymentStatus')
      ?.execute({ invoiceId: invoice.id, orgId: campaign.org_id })

    if (paymentCheck?.isPaid) {
      return { invoiceId: invoice.id, emailSent: false, reason: 'Invoice paid' }
    }

    // Get email attempt count
    const attemptData = await agentTools.find(t => t.name === 'getEmailAttemptCount')
      ?.execute({ invoiceId: invoice.id })

    const attemptCount = attemptData?.attemptCount || 0

    // Check if we've exceeded max attempts
    if (attemptCount >= config.maxAttempts) {
      return { invoiceId: invoice.id, emailSent: false, reason: 'Max attempts reached' }
    }

    // Determine which stage we're at
    const daysOverdue = differenceInDays(now, parseISO(invoice.due_date))
    const stage = this.determineCampaignStage(config, attemptCount, daysOverdue)

    if (!stage) {
      return { invoiceId: invoice.id, emailSent: false, reason: 'No stage match' }
    }

    // Use context-aware timing decision
    const customerData = await agentTools.find(t => t.name === 'getCustomerPaymentHistory')
      ?.execute({ customerId: customer.id, orgId: campaign.org_id })
    
    const lastEmail = await agentTools.find(t => t.name === 'getLastEmailInteraction')
      ?.execute({ invoiceId: invoice.id })

    const daysSinceLastEmail = lastEmail?.hasInteraction && lastEmail.sentAt
      ? differenceInDays(now, parseISO(lastEmail.sentAt))
      : 999

    // Get email engagement for customer
    const engagementData = await agentTools.find(t => t.name === 'analyzeCustomerResponse')
      ?.execute({ customerId: customer.id, orgId: campaign.org_id })

    // Build context for optimal timing
    const timingDecision = determineOptimalTiming({
      invoice: {
        daysOverdue,
        amountDue: Number(invoice.amount_due),
        previousAttempts: attemptCount,
        lastEmailInteraction: {
          wasOpened: lastEmail?.wasOpened || false,
          wasClicked: lastEmail?.wasClicked || false,
          daysSinceLastEmail,
        },
        riskLevel: invoice.risk_level,
      },
      campaign: {
        stage: stage.stage,
        attemptNumber: attemptCount + 1,
        maxAttempts: config.maxAttempts,
        daysBetweenEmails: config.daysBetweenEmails,
        escalateTone: config.escalateTone,
      },
      customer: {
        paymentBehavior: customer.payment_behavior,
        avgDaysToPay: customerData?.avgDaysToPay || null,
        totalInvoices: customerData?.totalInvoices || 0,
        totalPaid: customerData?.totalPaid || 0,
        totalOutstanding: customerData?.totalOutstanding || 0,
        recentPayments: customerData?.recentPayments || [],
        emailEngagement: {
          openRate: engagementData?.openRate || 0,
          clickRate: engagementData?.clickRate || 0,
          isEngaged: engagementData?.isEngaged || false,
          isActive: engagementData?.isActive || false,
        },
      },
    })

    if (!timingDecision.shouldSendNow && timingDecision.scheduleFor) {
      // Schedule follow-up for optimal time
      await taskScheduler.scheduleTask({
        taskType: 'send_email',
        orgId: campaign.org_id,
        campaignId: campaign.id,
        invoiceId: invoice.id,
        customerId: customer.id,
        scheduledFor: timingDecision.scheduleFor,
        taskData: {
          tone: stage.tone,
        },
        metadata: {
          reason: timingDecision.reason,
          optimalTiming: true,
        },
      })

      return {
        invoiceId: invoice.id,
        emailSent: false,
        reason: timingDecision.reason,
        scheduled: true,
        scheduledFor: timingDecision.scheduleFor.toISOString(),
      }
    }

    // Send email using the tool
    const sendResult = await agentTools.find(t => t.name === 'sendCollectionEmail')
      ?.execute({
        invoiceId: invoice.id,
        campaignId: campaign.id,
        orgId: campaign.org_id,
        tone: stage.tone,
      })

    // Schedule next follow-up if not at max attempts
    if (sendResult?.success && attemptCount + 1 < config.maxAttempts) {
      const nextStage = config.stages[Math.min(attemptCount + 1, config.stages.length - 1)]
      if (nextStage) {
        await taskScheduler.scheduleFollowUpEmail({
          orgId: campaign.org_id,
          campaignId: campaign.id,
          invoiceId: invoice.id,
          customerId: customer.id,
          daysFromNow: config.daysBetweenEmails,
          tone: nextStage.tone,
        })
      }
    }

    return {
      invoiceId: invoice.id,
      emailSent: sendResult?.success || false,
      tone: stage.tone,
      attemptNumber: attemptCount + 1,
      error: sendResult?.error,
      nextFollowUpScheduled: sendResult?.success && attemptCount + 1 < config.maxAttempts,
    }
  }

  /**
   * Determine which campaign stage to use
   */
  private determineCampaignStage(
    config: CampaignConfig,
    attemptCount: number,
    daysOverdue: number
  ) {
    if (!config.stages || config.stages.length === 0) {
      return null
    }

    // Find stage based on attempt count and days overdue
    for (const stage of config.stages) {
      if (attemptCount === 0 && stage.daysTrigger === 0) {
        return stage
      }
      if (daysOverdue >= stage.daysTrigger && attemptCount === config.stages.indexOf(stage)) {
        return stage
      }
    }

    // Default to last stage if we've exceeded
    return config.stages[config.stages.length - 1]
  }

  /**
   * Auto-create campaigns for overdue invoices
   */
  async autoCreateCampaigns(orgId: string) {
    const supabase = await createClient()
    // Get all overdue invoices without active campaigns
    const { data: invoices } = await supabase
      .from('invoices')
      .select(`
        id,
        customer_id,
        amount_due,
        due_date,
        customer:customers(id, name, email)
      `)
      .eq('org_id', orgId)
      .neq('status', 'paid')
      .neq('status', 'cancelled')
      .neq('status', 'void')
      .lt('due_date', new Date().toISOString().split('T')[0])

    if (!invoices || invoices.length === 0) {
      return { campaignsCreated: 0 }
    }

    // Get existing campaigns
    const { data: existingCampaigns } = await supabase
      .from('campaigns')
      .select('target_invoice_ids')
      .eq('org_id', orgId)
      .in('status', ['draft', 'active', 'paused'])

    const existingInvoiceIds = new Set<string>()
    existingCampaigns?.forEach(campaign => {
      campaign.target_invoice_ids?.forEach((id: string) => existingInvoiceIds.add(id))
    })

    // Group invoices by customer
    const customerInvoices: Record<string, typeof invoices> = {}
    invoices.forEach((inv) => {
      if (existingInvoiceIds.has(inv.id)) {
        return // Skip invoices already in campaigns
      }
      const customerId = inv.customer_id
      if (!customerInvoices[customerId]) {
        customerInvoices[customerId] = []
      }
      customerInvoices[customerId].push(inv)
    })

    const campaignsCreated: string[] = []

    // Create campaign for each customer
    for (const [customerId, customerInvs] of Object.entries(customerInvoices)) {
      const customer = customerInvs[0].customer as { id: string; name: string; email: string | null } | null
      const invoiceIds = customerInvs.map((inv) => inv.id)
      const totalAmount = customerInvs.reduce((sum, inv) => sum + Number(inv.amount_due), 0)

      const config: CampaignConfig = {
        maxAttempts: 4,
        daysBetweenEmails: 5,
        escalateTone: true,
        includePayButton: true,
        attachInvoice: true,
        stages: [
          { stage: 'reminder', daysTrigger: 0, tone: 'friendly' },
          { stage: 'follow_up', daysTrigger: 5, tone: 'professional' },
          { stage: 'escalation', daysTrigger: 10, tone: 'firm' },
          { stage: 'final_notice', daysTrigger: 15, tone: 'urgent' },
        ],
      }

      const campaignName = customer
        ? `Collection Campaign - ${customer.name}`
        : `Collection Campaign - Customer ${customerId.slice(0, 8)}`

      const { data: campaign, error } = await supabase
        .from('campaigns')
        .insert({
          org_id: orgId,
          name: campaignName,
          description: `Auto-created campaign for ${invoiceIds.length} overdue invoice(s)`,
          status: 'active', // Auto-activate
          config,
          target_invoice_ids: invoiceIds,
          stats: {
            totalInvoices: invoiceIds.length,
            totalAmount,
            emailsSent: 0,
            emailsOpened: 0,
            emailsClicked: 0,
            paymentsReceived: 0,
            amountCollected: 0,
          },
        })
        .select()
        .single()

      if (!error && campaign) {
        campaignsCreated.push(campaign.id)

        // Schedule initial emails for each invoice
        for (const invoice of customerInvs) {
          const customer = invoice.customer as { id: string; name: string; email: string | null } | null
          if (customer?.email) {
            try {
              // Schedule first email 30 minutes from now
              const firstEmailTime = new Date()
              firstEmailTime.setMinutes(firstEmailTime.getMinutes() + 30)

              await taskScheduler.scheduleTask({
                taskType: 'send_email',
                orgId,
                campaignId: campaign.id,
                invoiceId: invoice.id,
                customerId: customer.id,
                scheduledFor: firstEmailTime,
                taskData: {
                  tone: config.stages[0]?.tone || 'friendly',
                },
                metadata: {
                  isInitialEmail: true,
                  campaignAutoCreated: true,
                },
              })
            } catch (err) {
              console.error(`Failed to schedule initial email for invoice ${invoice.id}:`, err)
            }
          }
        }
      }
    }

    return {
      campaignsCreated: campaignsCreated.length,
      campaignIds: campaignsCreated,
    }
  }

  /**
   * Handle email reply (future: integrate with Resend inbound email)
   */
  async handleEmailReply(emailLogId: string, replyContent: string) {
    const supabase = await createClient()
    const { data: emailLog } = await supabase
      .from('email_logs')
      .select(`
        *,
        invoice:invoices(*, customer:customers(*)),
        campaign:campaigns(*)
      `)
      .eq('id', emailLogId)
      .single()

    if (!emailLog) {
      return { handled: false, reason: 'Email log not found' }
    }

    // Use AI to analyze reply and determine action
    // This integrates with Gemini to understand customer intent
    const { gemini } = await import('@/lib/gemini/client')
    
    const analysisPrompt = `Analyze this customer email reply to a collection email. Determine:
1. Customer intent (paid, will_pay, needs_time, dispute, stop_request, other)
2. Urgency level (low, medium, high)
3. Whether it needs human review (true/false)
4. Suggested action (pause_campaign, continue_campaign, escalate, respond, stop_contact)

Customer reply:
${replyContent.substring(0, 1000)}

Return ONLY a JSON object:
{
  "intent": "paid|will_pay|needs_time|dispute|stop_request|other",
  "urgency": "low|medium|high",
  "needsHumanReview": true|false,
  "suggestedAction": "pause_campaign|continue_campaign|escalate|respond|stop_contact",
  "summary": "brief summary"
}`

    try {
      const result = await gemini.generateContent(analysisPrompt)
      const response = result.response.text()
      const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const analysis = JSON.parse(cleaned)
      
      return {
        handled: true,
        action: analysis.suggestedAction,
        needsHumanReview: analysis.needsHumanReview,
        intent: analysis.intent,
        suggestedResponse: analysis.summary,
      }
    } catch (error) {
      console.error('Failed to analyze reply:', error)
      // Default to human review if analysis fails
      return {
        handled: true,
        action: 'escalate',
        needsHumanReview: true,
        suggestedResponse: 'Unable to analyze reply - requires human review',
      }
    }
  }
}

export const aiAgent = new AIAgent()

