import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { agentTools } from '@/lib/ai-agent/tools'

/**
 * Vercel Cron Job: Check for payments and update campaign status
 * Runs every 15 minutes
 * 
 * Configure in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/check-payments",
 *     "schedule": "*/15 * * * *"
 *   }]
 * }
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()

    // Get all active campaigns
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, org_id, target_invoice_ids, stats')
      .eq('status', 'active')

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({
        executed: true,
        campaignsChecked: 0,
        message: 'No active campaigns',
      })
    }

    const results = []

    for (const campaign of campaigns) {
      try {
        // Check if all invoices are paid
        const pauseResult = await agentTools
          .find(t => t.name === 'pauseCampaignIfPaid')
          ?.execute({ campaignId: campaign.id, orgId: campaign.org_id })

        if (pauseResult?.paused) {
          // Update campaign stats with payment info
          const { data: invoices } = await supabase
            .from('invoices')
            .select('amount_paid')
            .in('id', campaign.target_invoice_ids || [])
            .eq('org_id', campaign.org_id)

          const totalPaid = invoices?.reduce(
            (sum, inv) => sum + Number(inv.amount_paid || 0),
            0
          ) || 0

          const stats = campaign.stats as any
          await supabase
            .from('campaigns')
            .update({
              stats: {
                ...stats,
                paymentsReceived: (campaign.target_invoice_ids?.length || 0),
                amountCollected: totalPaid,
              },
            })
            .eq('id', campaign.id)

          results.push({
            campaignId: campaign.id,
            paused: true,
            amountCollected: totalPaid,
          })
        } else {
          results.push({
            campaignId: campaign.id,
            paused: false,
            unpaidInvoices: pauseResult?.unpaidInvoices || 0,
          })
        }
      } catch (error) {
        console.error(`Error checking payments for campaign ${campaign.id}:`, error)
        results.push({
          campaignId: campaign.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    const pausedCount = results.filter(r => r.paused).length

    return NextResponse.json({
      executed: true,
      timestamp: new Date().toISOString(),
      campaignsChecked: campaigns.length,
      campaignsPaused: pausedCount,
      results,
    })
  } catch (error) {
    console.error('Payment check cron job error:', error)
    return NextResponse.json(
      {
        error: 'Failed to check payments',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

