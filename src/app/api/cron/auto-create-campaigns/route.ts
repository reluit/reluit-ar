import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { aiAgent } from '@/lib/ai-agent/executor'

/**
 * Vercel Cron Job: Auto-create campaigns for overdue invoices
 * Runs every 6 hours
 * 
 * Configure in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/auto-create-campaigns",
 *     "schedule": "0 */6 * * *"
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

    // Get all organizations
    const { data: organizations } = await supabase
      .from('organizations')
      .select('id')

    if (!organizations || organizations.length === 0) {
      return NextResponse.json({
        executed: true,
        organizationsProcessed: 0,
        message: 'No organizations found',
      })
    }

    const results = []

    // Auto-create campaigns for each organization
    for (const org of organizations) {
      try {
        const result = await aiAgent.autoCreateCampaigns(org.id)
        results.push({
          orgId: org.id,
          ...result,
        })
      } catch (error) {
        console.error(`Error auto-creating campaigns for org ${org.id}:`, error)
        results.push({
          orgId: org.id,
          campaignsCreated: 0,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    const totalCampaignsCreated = results.reduce(
      (sum, r) => sum + (r.campaignsCreated || 0),
      0
    )

    return NextResponse.json({
      executed: true,
      timestamp: new Date().toISOString(),
      organizationsProcessed: organizations.length,
      totalCampaignsCreated,
      results,
    })
  } catch (error) {
    console.error('Auto-create cron job error:', error)
    return NextResponse.json(
      {
        error: 'Failed to auto-create campaigns',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

