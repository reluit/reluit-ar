import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PipedreamClient } from '@pipedream/sdk'

export async function POST() {
  console.log('[API /pipedream/connect-token] Request received')
  
  try {
    const supabase = await createClient()
    
    // Get the current user
    console.log('[API /pipedream/connect-token] Getting user from Supabase...')
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      console.log('[API /pipedream/connect-token] Unauthorized - no user found')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log(`[API /pipedream/connect-token] User authenticated: ${user.id}`)

    // Validate required environment variables
    const clientId = process.env.PIPEDREAM_CLIENT_ID
    const clientSecret = process.env.PIPEDREAM_CLIENT_SECRET
    const projectId = process.env.PIPEDREAM_PROJECT_ID
    
    console.log('[API /pipedream/connect-token] Checking Pipedream credentials...', { 
      hasClientId: !!clientId, 
      hasClientSecret: !!clientSecret, 
      hasProjectId: !!projectId,
      projectId: projectId ? `${projectId.substring(0, 8)}...` : 'missing'
    })
    
    if (!clientId || !clientSecret || !projectId) {
      console.error('[API /pipedream/connect-token] Missing Pipedream credentials')
      return NextResponse.json(
        { error: 'Pipedream configuration missing' },
        { status: 500 }
      )
    }

    // Create Pipedream client
    console.log('[API /pipedream/connect-token] Creating PipedreamClient...')
    const pd = new PipedreamClient({
      clientId,
      clientSecret,
      projectId,
      projectEnvironment: 'development', // Change to 'production' for prod
    })

    // Generate a connect token using the Supabase user ID as external user ID
    console.log(`[API /pipedream/connect-token] Creating token for externalUserId: ${user.id}`)
    const response = await pd.tokens.create({
      externalUserId: user.id,
    })

    console.log('[API /pipedream/connect-token] Token created successfully:', {
      hasToken: !!response.token,
      hasConnectLinkUrl: !!response.connectLinkUrl,
      expiresAt: response.expiresAt,
    })
    
    // Return the token response - the SDK expects { token, connectLinkUrl, expiresAt }
    return NextResponse.json({
      token: response.token,
      connectLinkUrl: response.connectLinkUrl,
      expiresAt: response.expiresAt instanceof Date 
        ? response.expiresAt.toISOString() 
        : response.expiresAt,
    })
  } catch (error) {
    console.error('[API /pipedream/connect-token] Failed to create connect token:', error)
    return NextResponse.json(
      { error: 'Failed to create connect token', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
