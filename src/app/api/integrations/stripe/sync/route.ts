import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncSingleIntegration } from '@/lib/collections/sweep'

/**
 * POST /api/integrations/stripe/sync
 * Manually sync invoices from Stripe
 */
export async function POST() {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (orgError || !org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Get Stripe integration
    const { data: integration, error: intError } = await supabase
      .from('integrations')
      .select('*')
      .eq('org_id', org.id)
      .eq('provider', 'stripe')
      .single()

    if (intError || !integration) {
      return NextResponse.json(
        { error: 'Stripe integration not found. Please connect Stripe first.' },
        { status: 404 }
      )
    }

    if (integration.status !== 'connected') {
      return NextResponse.json(
        { error: 'Stripe is not connected. Please reconnect.' },
        { status: 400 }
      )
    }

    console.log(`[API] Starting Stripe sync for org ${org.id}, integration ${integration.id}`)

    // Run the sync
    const result = await syncSingleIntegration(org.id, integration.id)

    console.log('[API] Stripe sync result:', result)

    if (!result.success) {
      return NextResponse.json(
        { 
          error: result.error || 'Sync failed',
          invoicesProcessed: result.invoicesProcessed,
          customersUpdated: result.customersUpdated,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      invoicesProcessed: result.invoicesProcessed,
      customersUpdated: result.customersUpdated,
      message: `Successfully synced ${result.invoicesProcessed} invoices and ${result.customersUpdated} customers from Stripe`,
    })
  } catch (error) {
    console.error('[API] Stripe sync error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/integrations/stripe/sync
 * Get the current sync status
 */
export async function GET() {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (orgError || !org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Get Stripe integration
    const { data: integration, error: intError } = await supabase
      .from('integrations')
      .select('*')
      .eq('org_id', org.id)
      .eq('provider', 'stripe')
      .single()

    if (intError || !integration) {
      return NextResponse.json({
        connected: false,
        message: 'Stripe not connected',
      })
    }

    // Get invoice count
    const { count: invoiceCount } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('integration_id', integration.id)

    // Get customer count
    const { count: customerCount } = await supabase
      .from('customers')
      .select('*', { count: 'exact', head: true })
      .eq('integration_id', integration.id)

    return NextResponse.json({
      connected: integration.status === 'connected',
      status: integration.status,
      lastSync: integration.last_sync,
      invoiceCount: invoiceCount || 0,
      customerCount: customerCount || 0,
      pipedreamAccountId: integration.pipedream_account_id,
    })
  } catch (error) {
    console.error('[API] Stripe status error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

