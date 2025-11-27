import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { AIAgent } from '@/lib/ai-agent/executor'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const campaignId = params.id

    // Get campaign
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select(`
        *,
        invoices:campaign_invoices(
          invoice:invoices(
            *,
            customer:customers(*)
          )
        )
      `)
      .eq('id', campaignId)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      )
    }

    // Check if user owns the organization
    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('id', campaign.org_id)
      .eq('owner_id', user.id)
      .single()

    if (!org) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Execute campaign
    const aiAgent = new AIAgent()
    const result = await aiAgent.executeCampaign(campaignId)

    return NextResponse.json({
      success: true,
      emailsSent: result.emailsSent || 0,
      scheduled: result.scheduled || 0,
      skipped: result.skipped || 0,
    })
  } catch (error: any) {
    console.error('Error executing campaign:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to execute campaign' },
      { status: 500 }
    )
  }
}

