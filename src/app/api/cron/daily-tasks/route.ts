import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AIAgent } from '@/lib/ai-agent/executor'
import { TaskScheduler } from '@/lib/ai-agent/scheduler'

/**
 * Daily cron job that runs all scheduled tasks
 * Runs once per day at 9 AM UTC (Vercel Hobby tier limitation)
 * 
 * This endpoint:
 * 1. Executes all active campaigns
 * 2. Auto-creates campaigns for new overdue invoices
 * 3. Checks for payments
 * 4. Executes scheduled tasks
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const cronSecret = searchParams.get('cron_secret')

  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient()
  const scheduler = new TaskScheduler()
  const aiAgent = new AIAgent()

  const results = {
    campaignsExecuted: 0,
    campaignsCreated: 0,
    paymentsChecked: 0,
    scheduledTasksExecuted: 0,
    errors: [] as string[],
  }

  try {
    // 1. Execute all active campaigns
    try {
      const { data: activeCampaigns } = await supabase
        .from('campaigns')
        .select('id')
        .eq('status', 'active')

      if (activeCampaigns) {
        for (const campaign of activeCampaigns) {
          try {
            await aiAgent.executeCampaign(campaign.id)
            results.campaignsExecuted++
          } catch (error: any) {
            results.errors.push(`Campaign ${campaign.id}: ${error.message}`)
          }
        }
      }
    } catch (error: any) {
      results.errors.push(`Execute campaigns: ${error.message}`)
    }

    // 2. Auto-create campaigns for overdue invoices
    try {
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id')

      if (orgs) {
        for (const org of orgs) {
          try {
            // Call auto-create directly instead of HTTP fetch
            const { data: invoices } = await supabase
              .from('invoices')
              .select(`
                id,
                customer_id,
                amount_due,
                due_date,
                customer:customers(id, name, email)
              `)
              .eq('org_id', org.id)
              .neq('status', 'paid')
              .neq('status', 'cancelled')
              .neq('status', 'void')
              .lt('due_date', new Date().toISOString().split('T')[0])

            if (invoices && invoices.length > 0) {
              // Group by customer and create campaigns
              const customerInvoices: Record<string, typeof invoices> = {}
              invoices.forEach((inv) => {
                const customerId = inv.customer_id
                if (!customerInvoices[customerId]) {
                  customerInvoices[customerId] = []
                }
                customerInvoices[customerId].push(inv)
              })

              for (const [customerId, customerInvs] of Object.entries(customerInvoices)) {
                const invoiceIds = customerInvs.map((inv) => inv.id)
                
                // Check if campaign already exists
                const { data: existingCampaigns } = await supabase
                  .from('campaigns')
                  .select('id')
                  .eq('org_id', org.id)
                  .eq('status', 'active')
                  .contains('target_invoice_ids', invoiceIds.slice(0, 1))

                if (existingCampaigns && existingCampaigns.length > 0) {
                  continue
                }

                // Create campaign (simplified - you can import the full logic)
                const customer = customerInvs[0].customer as any
                const totalAmount = customerInvs.reduce((sum, inv) => sum + Number(inv.amount_due), 0)
                
                const config = {
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

                const stats = {
                  totalInvoices: invoiceIds.length,
                  totalAmount,
                  emailsSent: 0,
                  emailsOpened: 0,
                  emailsClicked: 0,
                  paymentsReceived: 0,
                  amountCollected: 0,
                }

                const campaignName = customer
                  ? `Collection Campaign - ${customer.name}`
                  : `Collection Campaign - Customer ${customerId.slice(0, 8)}`

                const { error: createError } = await supabase
                  .from('campaigns')
                  .insert({
                    org_id: org.id,
                    name: campaignName,
                    description: `Auto-created campaign for ${invoiceIds.length} overdue invoice(s)`,
                    status: 'active',
                    config,
                    target_invoice_ids: invoiceIds,
                    stats,
                  })

                if (!createError) {
                  results.campaignsCreated++
                }
              }
            }
          } catch (error: any) {
            results.errors.push(`Auto-create campaigns for org ${org.id}: ${error.message}`)
          }
        }
      }
    } catch (error: any) {
      results.errors.push(`Auto-create campaigns: ${error.message}`)
    }

    // 3. Check payments
    try {
      const { data: activeCampaigns } = await supabase
        .from('campaigns')
        .select(`
          id,
          invoices:campaign_invoices(
            invoice:invoices(id, status, payment_date)
          )
        `)
        .eq('status', 'active')

      if (activeCampaigns) {
        for (const campaign of activeCampaigns) {
          const invoices = campaign.invoices as any[]
          for (const item of invoices || []) {
            const invoice = item.invoice
            if (invoice && invoice.status === 'paid') {
              // Campaign will be paused automatically by the executor
              results.paymentsChecked++
            }
          }
        }
      }
    } catch (error: any) {
      results.errors.push(`Check payments: ${error.message}`)
    }

    // 4. Execute scheduled tasks
    try {
      const dueTasks = await scheduler.getDueTasks()
      for (const task of dueTasks) {
        await scheduler.updateTaskStatus(task.id, 'in_progress')
        try {
          const result = await aiAgent.processScheduledTask(task)
          await scheduler.updateTaskStatus(task.id, 'completed', result)
          results.scheduledTasksExecuted++
        } catch (error: any) {
          console.error(`Error executing task ${task.id}:`, error)
          await scheduler.updateTaskStatus(task.id, 'failed', undefined, error.message)
          results.errors.push(`Task ${task.id}: ${error.message}`)
        }
      }
    } catch (error: any) {
      results.errors.push(`Execute scheduled tasks: ${error.message}`)
    }

    return NextResponse.json({
      success: true,
      ...results,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('Error in daily-tasks cron:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        ...results,
      },
      { status: 500 }
    )
  }
}

