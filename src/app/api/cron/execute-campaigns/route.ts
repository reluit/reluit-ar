import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { aiAgent } from '@/lib/ai-agent/executor'

/**
 * Vercel Cron Job: Execute active campaigns
 * Runs every hour
 * 
 * Configure in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/execute-campaigns",
 *     "schedule": "0 * * * *"
 *   }]
 * }
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret (Vercel sets this header)
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()

    // Get all active campaigns
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('id, org_id')
      .eq('status', 'active')

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({
        executed: true,
        campaignsProcessed: 0,
        message: 'No active campaigns',
      })
    }

    const results = []

    // Execute each campaign
    for (const campaign of campaigns) {
      try {
        const result = await aiAgent.executeCampaign(campaign.id)
        results.push({
          campaignId: campaign.id,
          ...result,
        })
      } catch (error) {
        console.error(`Error executing campaign ${campaign.id}:`, error)
        results.push({
          campaignId: campaign.id,
          executed: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    const totalEmailsSent = results.reduce((sum, r) => sum + (r.emailsSent || 0), 0)

    return NextResponse.json({
      executed: true,
      timestamp: new Date().toISOString(),
      campaignsProcessed: campaigns.length,
      totalEmailsSent,
      results,
    })
  } catch (error) {
    console.error('Cron job error:', error)
    return NextResponse.json(
      {
        error: 'Failed to execute campaigns',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

