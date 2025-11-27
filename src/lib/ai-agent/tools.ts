import { createClient } from '@/lib/supabase/server'
import { sendCollectionEmail } from '@/lib/resend/client'
import { generateCollectionEmail } from '@/lib/gemini/client'
import { addFDCPADisclosures, getNextCompliantTime, isCompliantTime } from '@/lib/fdcpa/compliance'
import { differenceInDays, parseISO } from 'date-fns'
import type { EmailTone, Campaign, Invoice, Customer } from '@/types/database'

export interface AgentTool {
  name: string
  description: string
  execute: (params: any) => Promise<any>
}

/**
 * Tool: Check if invoice has been paid
 */
export async function checkInvoicePaymentStatus(invoiceId: string, orgId: string) {
  const supabase = await createClient()
  
  const { data: invoice } = await supabase
    .from('invoices')
    .select('status, amount_due, amount_paid')
    .eq('id', invoiceId)
    .eq('org_id', orgId)
    .single()

  if (!invoice) {
    return { error: 'Invoice not found' }
  }

  return {
    status: invoice.status,
    isPaid: invoice.status === 'paid',
    amountDue: Number(invoice.amount_due),
    amountPaid: Number(invoice.amount_paid),
  }
}

/**
 * Tool: Get customer payment history
 */
export async function getCustomerPaymentHistory(customerId: string, orgId: string) {
  const supabase = await createClient()
  
  const { data: customer } = await supabase
    .from('customers')
    .select('payment_behavior, avg_days_to_pay, total_invoices, total_paid, total_outstanding')
    .eq('id', customerId)
    .eq('org_id', orgId)
    .single()

  if (!customer) {
    return { error: 'Customer not found' }
  }

  // Get recent payment events
  const { data: recentPayments } = await supabase
    .from('payment_events')
    .select('amount, received_at')
    .eq('customer_id', customerId)
    .eq('org_id', orgId)
    .order('received_at', { ascending: false })
    .limit(5)

  return {
    paymentBehavior: customer.payment_behavior,
    avgDaysToPay: customer.avg_days_to_pay,
    totalInvoices: customer.total_invoices,
    totalPaid: Number(customer.total_paid),
    totalOutstanding: Number(customer.total_outstanding),
    recentPayments: recentPayments || [],
  }
}

/**
 * Tool: Count email attempts for invoice
 */
export async function getEmailAttemptCount(invoiceId: string) {
  const supabase = await createClient()
  
  const { count } = await supabase
    .from('email_logs')
    .select('*', { count: 'exact', head: true })
    .eq('invoice_id', invoiceId)
    .in('status', ['sent', 'delivered', 'opened', 'clicked'])

  return {
    attemptCount: count || 0,
  }
}

/**
 * Tool: Get last email interaction
 */
export async function getLastEmailInteraction(invoiceId: string) {
  const supabase = await createClient()
  
  const { data: lastEmail } = await supabase
    .from('email_logs')
    .select('status, sent_at, opened_at, clicked_at, subject')
    .eq('invoice_id', invoiceId)
    .order('sent_at', { ascending: false })
    .limit(1)
    .single()

  if (!lastEmail) {
    return { hasInteraction: false }
  }

  return {
    hasInteraction: true,
    status: lastEmail.status,
    sentAt: lastEmail.sent_at,
    openedAt: lastEmail.opened_at,
    clickedAt: lastEmail.clicked_at,
    subject: lastEmail.subject,
    wasOpened: !!lastEmail.opened_at,
    wasClicked: !!lastEmail.clicked_at,
  }
}

/**
 * Tool: Determine optimal tone based on context
 */
export async function determineOptimalTone(params: {
  daysOverdue: number
  attemptCount: number
  paymentBehavior: string
  invoiceAmount: number
}): Promise<EmailTone> {
  const { daysOverdue, attemptCount, paymentBehavior, invoiceAmount } = params

  // Escalate tone based on attempts
  if (attemptCount >= 3 || daysOverdue >= 30) {
    return 'urgent'
  }
  if (attemptCount >= 2 || daysOverdue >= 14) {
    return 'firm'
  }
  if (paymentBehavior === 'excellent' || paymentBehavior === 'good') {
    return 'friendly'
  }
  return 'professional'
}

/**
 * Tool: Send collection email
 */
export async function sendCollectionEmailTool(params: {
  invoiceId: string
  campaignId: string
  orgId: string
  tone?: EmailTone
  templateId?: string
}) {
  const supabase = await createClient()
  const { invoiceId, campaignId, orgId, tone, templateId } = params

  // Get invoice with customer
  const { data: invoice } = await supabase
    .from('invoices')
    .select(`
      *,
      customer:customers(id, name, email, payment_behavior)
    `)
    .eq('id', invoiceId)
    .eq('org_id', orgId)
    .single()

  if (!invoice) {
    return { error: 'Invoice not found' }
  }

  const customer = invoice.customer as Customer & { email: string | null }
  if (!customer?.email) {
    return { error: 'Customer email not found' }
  }

  // Get organization
  const { data: org } = await supabase
    .from('organizations')
    .select('name, brand_voice, settings')
    .eq('id', orgId)
    .single()

  if (!org) {
    return { error: 'Organization not found' }
  }

  // Get email attempt count
  const attemptData = await getEmailAttemptCount(invoiceId)
  const daysOverdue = differenceInDays(new Date(), parseISO(invoice.due_date))

  // Determine tone if not provided
  const emailTone = tone || await determineOptimalTone({
    daysOverdue,
    attemptCount: attemptData.attemptCount,
    paymentBehavior: customer.payment_behavior,
    invoiceAmount: Number(invoice.amount_due),
  })

  // Get template customization if templateId provided
  let customization = undefined
  if (templateId) {
    const { data: template } = await supabase
      .from('email_templates')
      .select('metadata, subject, body')
      .eq('id', templateId)
      .single()
    
    if (template?.metadata?.customization) {
      customization = template.metadata.customization
    }
  }

  // Build comprehensive context for AI
  const { buildAgentContext, determineOptimalTone, getPersonalizationHints, getEscalationRecommendation } = await import('./context')
  
  const customerContext = {
    paymentBehavior: customer.payment_behavior,
    avgDaysToPay: customer.avg_days_to_pay,
    totalInvoices: customer.total_invoices,
    totalPaid: customer.total_paid,
    totalOutstanding: customer.total_outstanding,
    recentPayments: [],
    emailEngagement: {
      openRate: 0,
      clickRate: 0,
      isEngaged: false,
      isActive: false,
    },
  }

  // Get email engagement data
  try {
    const engagementData = await analyzeCustomerResponse(customer.id, org.id)
    if (engagementData.hasHistory) {
      customerContext.emailEngagement = {
        openRate: engagementData.openRate || 0,
        clickRate: engagementData.clickRate || 0,
        isEngaged: engagementData.isEngaged || false,
        isActive: engagementData.isActive || false,
      }
    }
  } catch (err) {
    console.error('Failed to get engagement data:', err)
  }

  const invoiceContext = {
    daysOverdue,
    amountDue: Number(invoice.amount_due),
    previousAttempts: attemptData.attemptCount,
    lastEmailInteraction: {
      wasOpened: false,
      wasClicked: false,
      daysSinceLastEmail: 0,
    },
    riskLevel: invoice.risk_level,
  }

  // Get last email interaction
  const lastEmail = await getLastEmailInteraction(invoice.id)
  if (lastEmail.hasInteraction) {
    invoiceContext.lastEmailInteraction = {
      wasOpened: lastEmail.wasOpened || false,
      wasClicked: lastEmail.wasClicked || false,
      daysSinceLastEmail: lastEmail.sentAt ? differenceInDays(new Date(), parseISO(lastEmail.sentAt)) : 0,
    }
  }

  const campaignContext = {
    stage: 'reminder' as const,
    attemptNumber: attemptData.attemptCount + 1,
    maxAttempts: 4,
    daysBetweenEmails: 5,
    escalateTone: true,
  }

  // Build context string
  const contextString = buildAgentContext({
    customer: customerContext,
    invoice: invoiceContext,
    campaign: campaignContext,
    brandVoice: org.brand_voice || undefined,
    companyName: org.name,
  })

  // Get optimal tone (may override provided tone)
  const optimalTone = determineOptimalTone({
    customer: customerContext,
    invoice: invoiceContext,
    campaign: campaignContext,
  })

  // Get personalization hints
  const personalizationHints = getPersonalizationHints({
    customer: customerContext,
    invoice: invoiceContext,
    campaign: campaignContext,
  })

  // Get escalation recommendation
  const escalationRecommendation = getEscalationRecommendation({
    customer: customerContext,
    invoice: invoiceContext,
    campaign: campaignContext,
  })

  // Use optimal tone if escalation recommended
  const finalTone = escalationRecommendation.shouldEscalate && escalationRecommendation.newTone
    ? escalationRecommendation.newTone
    : emailTone || optimalTone

  // Generate email content with full context
  const generated = await generateCollectionEmail({
    customerName: customer.name,
    customerEmail: customer.email,
    invoiceNumber: invoice.invoice_number || invoice.external_id,
    invoiceAmount: invoice.amount_due,
    currency: invoice.currency,
    dueDate: invoice.due_date,
    daysOverdue,
    previousAttempts: attemptData.attemptCount,
    paymentHistory: customer.payment_behavior,
    brandVoice: org.brand_voice || undefined,
    tone: finalTone,
    companyName: org.name,
    paymentUrl: invoice.payment_url || undefined,
    context: contextString,
    personalizationHints,
    escalationRecommendation,
  })

  // Add FDCPA compliance disclosures
  const isFirstContact = attemptData.attemptCount === 0
  const settings = (org.settings as any) || {}
  const timezone = settings.timezone || 'America/New_York'
  
  const compliantBody = addFDCPADisclosures(
    generated.body,
    {
      isFirstContact,
      creditorName: org.name,
      debtAmount: Number(invoice.amount_due),
      currency: invoice.currency,
      invoiceNumber: invoice.invoice_number || invoice.external_id,
      orgName: org.name,
      orgAddress: settings.orgAddress,
      orgPhone: settings.orgPhone,
      consumerEmail: customer.email,
      consumerName: customer.name,
    },
    isFirstContact // Include validation notice on first contact
  )

  // Get org settings
  const fromName = settings.emailFromName || org.name || 'Collections'
  const replyTo = settings.emailReplyTo

  // Check FDCPA time compliance
  const now = new Date()
  const compliantTime = isCompliantTime(now, timezone)
  
  // If not compliant time, schedule for next compliant time
  if (!compliantTime) {
    const nextCompliantTime = getNextCompliantTime(timezone)
    return {
      error: 'FDCPA time restriction',
      scheduled: true,
      scheduledFor: nextCompliantTime.toISOString(),
      reason: 'Email must be sent between 8 AM and 9 PM in consumer timezone',
    }
  }

  // Send email with FDCPA-compliant body
  const result = await sendCollectionEmail({
    to: customer.email,
    subject: generated.subject,
    body: compliantBody,
    fromName,
    replyTo,
    paymentUrl: invoice.payment_url || undefined,
    invoicePdfUrl: invoice.pdf_url || undefined,
    customization,
  })

  if (result.error) {
    // Log failed email
    await supabase.from('email_logs').insert({
      org_id: orgId,
      campaign_id: campaignId,
      invoice_id: invoiceId,
      customer_id: customer.id,
      template_id: templateId || null,
      subject: generated.subject,
      body: generated.body,
      to_email: customer.email,
      status: 'failed',
      error_message: result.error.message,
    })
    return { error: result.error.message }
  }

    // Log successful email
    await supabase.from('email_logs').insert({
      org_id: orgId,
      campaign_id: campaignId,
      invoice_id: invoiceId,
      customer_id: customer.id,
      template_id: templateId || null,
      subject: generated.subject,
      body: compliantBody, // Store FDCPA-compliant version
      to_email: customer.email,
      status: 'sent',
      sent_at: new Date().toISOString(),
      metadata: {
        resend_id: result.data?.id,
        fdcpa_compliant: true,
        is_first_contact: isFirstContact,
        sent_at_compliant_time: compliantTime,
      },
    })

  // Update campaign stats
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('stats')
    .eq('id', campaignId)
    .single()

  if (campaign) {
    const stats = campaign.stats as any
    await supabase
      .from('campaigns')
      .update({
        stats: {
          ...stats,
          emailsSent: (stats.emailsSent || 0) + 1,
        },
      })
      .eq('id', campaignId)
  }

  return {
    success: true,
    emailId: result.data?.id,
    tone: emailTone,
    attemptNumber: attemptData.attemptCount + 1,
  }
}

/**
 * Tool: Pause campaign if invoice paid
 */
export async function pauseCampaignIfPaid(campaignId: string, orgId: string) {
  const supabase = await createClient()
  
  // Get campaign invoices
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('target_invoice_ids')
    .eq('id', campaignId)
    .eq('org_id', orgId)
    .single()

  if (!campaign) {
    return { error: 'Campaign not found' }
  }

  // Check if all invoices are paid
  const { data: invoices } = await supabase
    .from('invoices')
    .select('status')
    .in('id', campaign.target_invoice_ids || [])
    .eq('org_id', orgId)

  const allPaid = invoices?.every(inv => inv.status === 'paid') || false

  if (allPaid) {
    await supabase
      .from('campaigns')
      .update({ status: 'completed' })
      .eq('id', campaignId)
    
    return { paused: true, reason: 'All invoices paid' }
  }

  return { paused: false, unpaidInvoices: invoices?.filter(inv => inv.status !== 'paid').length || 0 }
}

/**
 * Tool: Analyze customer response patterns
 */
export async function analyzeCustomerResponse(customerId: string, orgId: string) {
  const supabase = await createClient()
  
  // Get email interactions
  const { data: emails } = await supabase
    .from('email_logs')
    .select('status, opened_at, clicked_at, sent_at')
    .eq('customer_id', customerId)
    .eq('org_id', orgId)
    .order('sent_at', { ascending: false })
    .limit(10)

  if (!emails || emails.length === 0) {
    return { hasHistory: false }
  }

  const openedCount = emails.filter(e => e.opened_at).length
  const clickedCount = emails.filter(e => e.clicked_at).length
  const openRate = emails.length > 0 ? (openedCount / emails.length) * 100 : 0
  const clickRate = emails.length > 0 ? (clickedCount / emails.length) * 100 : 0

  return {
    hasHistory: true,
    totalEmails: emails.length,
    openRate,
    clickRate,
    isEngaged: openRate > 50,
    isActive: clickedCount > 0,
  }
}

/**
 * All available tools for the AI agent
 */
export const agentTools: AgentTool[] = [
  {
    name: 'checkInvoicePaymentStatus',
    description: 'Check if an invoice has been paid',
    execute: ({ invoiceId, orgId }: { invoiceId: string; orgId: string }) =>
      checkInvoicePaymentStatus(invoiceId, orgId),
  },
  {
    name: 'getCustomerPaymentHistory',
    description: 'Get customer payment history and behavior',
    execute: ({ customerId, orgId }: { customerId: string; orgId: string }) =>
      getCustomerPaymentHistory(customerId, orgId),
  },
  {
    name: 'getEmailAttemptCount',
    description: 'Get number of email attempts for an invoice',
    execute: ({ invoiceId }: { invoiceId: string }) =>
      getEmailAttemptCount(invoiceId),
  },
  {
    name: 'getLastEmailInteraction',
    description: 'Get details of the last email sent to customer',
    execute: ({ invoiceId }: { invoiceId: string }) =>
      getLastEmailInteraction(invoiceId),
  },
  {
    name: 'sendCollectionEmail',
    description: 'Send a collection email to a customer',
    execute: (params: {
      invoiceId: string
      campaignId: string
      orgId: string
      tone?: EmailTone
      templateId?: string
    }) => sendCollectionEmailTool(params),
  },
  {
    name: 'pauseCampaignIfPaid',
    description: 'Pause campaign if all invoices are paid',
    execute: ({ campaignId, orgId }: { campaignId: string; orgId: string }) =>
      pauseCampaignIfPaid(campaignId, orgId),
  },
  {
    name: 'analyzeCustomerResponse',
    description: 'Analyze customer email engagement patterns',
    execute: ({ customerId, orgId }: { customerId: string; orgId: string }) =>
      analyzeCustomerResponse(customerId, orgId),
  },
]

