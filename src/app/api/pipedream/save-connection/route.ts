import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { IntegrationProvider } from '@/types/database'

export async function POST(request: NextRequest) {
  console.log('[API /pipedream/save-connection] Request received')
  
  try {
    const supabase = await createClient()
    
    // Get the current user
    console.log('[API /pipedream/save-connection] Getting user from Supabase...')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.log('[API /pipedream/save-connection] Unauthorized - no user found')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log(`[API /pipedream/save-connection] User authenticated: ${user.id}`)

    const body = await request.json()
    const { provider, accountId } = body as { 
      provider: IntegrationProvider
      accountId: string 
    }

    console.log(`[API /pipedream/save-connection] Saving connection - provider: ${provider}, accountId: ${accountId}`)

    if (!provider || !accountId) {
      console.log('[API /pipedream/save-connection] Missing provider or accountId')
      return NextResponse.json(
        { error: 'Missing provider or accountId' },
        { status: 400 }
      )
    }

    // Get or create organization for the user
    let orgId: string | null = null
    
    console.log('[API /pipedream/save-connection] Looking up organization...')
    const { data: existingOrg } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (existingOrg) {
      orgId = existingOrg.id
      console.log(`[API /pipedream/save-connection] Found existing organization: ${orgId}`)
    } else {
      // Create org if it doesn't exist
      console.log('[API /pipedream/save-connection] Creating new organization...')
      const userName = (user.email || 'user').split('@')[0]
      const { data: newOrg, error: createOrgError } = await supabase
        .from('organizations')
        .insert({
          name: `${userName}'s Organization`,
          owner_id: user.id,
          settings: {
            timezone: 'America/New_York',
            currency: 'USD',
            defaultTone: 'professional',
            digestFrequency: 'weekly',
          },
        })
        .select('id')
        .single()

      if (createOrgError || !newOrg) {
        console.error('[API /pipedream/save-connection] Failed to create organization:', createOrgError)
        return NextResponse.json(
          { error: 'Failed to create organization' },
          { status: 500 }
        )
      }

      orgId = newOrg.id
      console.log(`[API /pipedream/save-connection] Created new organization: ${orgId}`)

      // Also create free subscription
      await supabase
        .from('subscriptions')
        .insert({
          org_id: orgId,
          plan: 'free',
          status: 'active',
          invoice_limit: 25,
          email_limit: 0,
        })
      console.log('[API /pipedream/save-connection] Created free subscription')
    }

    // Save or update the integration
    console.log(`[API /pipedream/save-connection] Upserting integration for org: ${orgId}`)
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .upsert({
        org_id: orgId,
        provider,
        status: 'connected',
        pipedream_account_id: accountId,
        last_sync: new Date().toISOString(),
      }, {
        onConflict: 'org_id,provider',
      })
      .select()
      .single()

    if (integrationError) {
      console.error('[API /pipedream/save-connection] Failed to save integration:', integrationError)
      return NextResponse.json(
        { error: 'Failed to save integration' },
        { status: 500 }
      )
    }

    console.log(`[API /pipedream/save-connection] Integration saved successfully:`, integration?.id)
    return NextResponse.json({ 
      success: true, 
      integration 
    })
  } catch (error) {
    console.error('[API /pipedream/save-connection] Failed to save connection:', error)
    return NextResponse.json(
      { error: 'Failed to save connection', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
