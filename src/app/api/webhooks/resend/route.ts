import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

// Resend webhook signature verification would go here
// For now, we'll accept webhooks (in production, verify the signature)

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const headersList = await headers()
    
    // In production, verify webhook signature here
    // const signature = headersList.get('resend-signature')
    // if (!verifySignature(signature, body)) {
    //   return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    // }

    const { type, data } = body

    // Handle different webhook event types
    switch (type) {
      case 'email.sent':
        await handleEmailSent(data)
        break
      case 'email.delivered':
        await handleEmailDelivered(data)
        break
      case 'email.opened':
        await handleEmailOpened(data)
        break
      case 'email.clicked':
        await handleEmailClicked(data)
        break
      case 'email.bounced':
        await handleEmailBounced(data)
        break
      case 'email.complained':
        await handleEmailComplained(data)
        break
      default:
        console.log('Unhandled webhook type:', type)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}

async function handleEmailSent(data: { email_id: string; to: string; created_at: string }) {
  const supabase = await createClient()
  
  // Find email log by resend email ID
  const { data: emailLogs } = await supabase
    .from('email_logs')
    .select('id, campaign_id, invoice_id')
    .eq('metadata->>resend_id', data.email_id)
    .eq('status', 'pending')
    .limit(1)

  if (emailLogs && emailLogs.length > 0) {
    const log = emailLogs[0]
    await supabase
      .from('email_logs')
      .update({
        status: 'sent',
        sent_at: data.created_at,
      })
      .eq('id', log.id)

    // Update campaign stats
    if (log.campaign_id) {
      await updateCampaignStats(log.campaign_id, 'emailsSent', 1)
    }
  }
}

async function handleEmailDelivered(data: { email_id: string; created_at: string }) {
  const supabase = await createClient()
  
  const { data: emailLogs } = await supabase
    .from('email_logs')
    .select('id, campaign_id')
    .eq('metadata->>resend_id', data.email_id)
    .limit(1)

  if (emailLogs && emailLogs.length > 0) {
    const log = emailLogs[0]
    await supabase
      .from('email_logs')
      .update({
        status: 'delivered',
      })
      .eq('id', log.id)
  }
}

async function handleEmailOpened(data: { email_id: string; created_at: string }) {
  const supabase = await createClient()
  
  const { data: emailLogs } = await supabase
    .from('email_logs')
    .select('id, campaign_id')
    .eq('metadata->>resend_id', data.email_id)
    .eq('status', 'sent')
    .limit(1)

  if (emailLogs && emailLogs.length > 0) {
    const log = emailLogs[0]
    await supabase
      .from('email_logs')
      .update({
        status: 'opened',
        opened_at: data.created_at,
      })
      .eq('id', log.id)

    // Update campaign stats
    if (log.campaign_id) {
      await updateCampaignStats(log.campaign_id, 'emailsOpened', 1)
    }
  }
}

async function handleEmailClicked(data: { email_id: string; created_at: string; link: string }) {
  const supabase = await createClient()
  
  const { data: emailLogs } = await supabase
    .from('email_logs')
    .select('id, campaign_id')
    .eq('metadata->>resend_id', data.email_id)
    .in('status', ['sent', 'opened'])
    .limit(1)

  if (emailLogs && emailLogs.length > 0) {
    const log = emailLogs[0]
    await supabase
      .from('email_logs')
      .update({
        status: 'clicked',
        clicked_at: data.created_at,
        metadata: { ...(log as any).metadata, clicked_link: data.link },
      })
      .eq('id', log.id)

    // Update campaign stats
    if (log.campaign_id) {
      await updateCampaignStats(log.campaign_id, 'emailsClicked', 1)
    }
  }
}

async function handleEmailBounced(data: { email_id: string; bounce_type: string; created_at: string }) {
  const supabase = await createClient()
  
  const { data: emailLogs } = await supabase
    .from('email_logs')
    .select('id, campaign_id')
    .eq('metadata->>resend_id', data.email_id)
    .limit(1)

  if (emailLogs && emailLogs.length > 0) {
    const log = emailLogs[0]
    await supabase
      .from('email_logs')
      .update({
        status: 'bounced',
        error_message: `Bounce: ${data.bounce_type}`,
      })
      .eq('id', log.id)
  }
}

async function handleEmailComplained(data: { email_id: string; created_at: string }) {
  const supabase = await createClient()
  
  const { data: emailLogs } = await supabase
    .from('email_logs')
    .select('id')
    .eq('metadata->>resend_id', data.email_id)
    .limit(1)

  if (emailLogs && emailLogs.length > 0) {
    const log = emailLogs[0]
    await supabase
      .from('email_logs')
      .update({
        metadata: { ...(log as any).metadata, complained: true, complained_at: data.created_at },
      })
      .eq('id', log.id)
  }
}

async function updateCampaignStats(
  campaignId: string,
  statField: 'emailsSent' | 'emailsOpened' | 'emailsClicked',
  increment: number
) {
  const supabase = await createClient()
  
  // Get current campaign
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('stats')
    .eq('id', campaignId)
    .single()

  if (!campaign) return

  const stats = campaign.stats as any
  const newStats = {
    ...stats,
    [statField]: (stats[statField] || 0) + increment,
  }

  await supabase
    .from('campaigns')
    .update({ stats: newStats })
    .eq('id', campaignId)
}

