import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendTestEmail } from '@/lib/resend/client'
import type { OrganizationSettings } from '@/types/database'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, settings')
      .eq('owner_id', user.id)
      .single()

    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const body = await request.json()
    const { to } = body as { to?: string }
    
    // Send test email to the provided address or user's email
    const recipientEmail = to || user.email
    if (!recipientEmail) {
      return NextResponse.json({ error: 'No email address provided' }, { status: 400 })
    }

    const settings = (org.settings as OrganizationSettings) || {}
    const fromName = settings.emailFromName || org.name || 'Your Company'
    const replyTo = settings.emailReplyTo || user.email

    const result = await sendTestEmail({
      to: recipientEmail,
      fromName,
      replyTo,
    })

    if (result.error) {
      return NextResponse.json(
        { error: 'Failed to send test email', details: result.error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Test email sent to ${recipientEmail}`,
      emailId: result.data?.id,
    })
  } catch (error) {
    console.error('Test email error:', error)
    return NextResponse.json(
      { error: 'Failed to send test email' },
      { status: 500 }
    )
  }
}

