import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { aiAgent } from '@/lib/ai-agent/executor'
import { generateCollectionEmail } from '@/lib/gemini/client'

/**
 * Handle inbound email replies from Resend
 * Configure in Resend: Add inbound domain and set webhook to this endpoint
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    
    // Resend inbound email format
    const {
      from,
      to,
      subject,
      text,
      html,
      headers,
    } = body

    const supabase = await createClient()

    // Extract email log ID or invoice ID from headers/reply-to
    // Resend adds In-Reply-To header with original message ID
    const inReplyTo = headers?.['in-reply-to'] || headers?.['In-Reply-To']
    const replyToEmail = to // The email address that received the reply

    // Find the original email log by matching the reply-to address
    // You'll need to configure Resend to use a unique reply-to per email
    // Format: reply-{email_log_id}@yourdomain.com
    const emailLogIdMatch = replyToEmail?.match(/reply-([a-f0-9-]+)@/)
    const emailLogId = emailLogIdMatch?.[1]

    if (!emailLogId) {
      // Try to find by customer email and recent email
      const { data: emailLogs } = await supabase
        .from('email_logs')
        .select('id, invoice_id, campaign_id, customer_id')
        .eq('to_email', from)
        .order('sent_at', { ascending: false })
        .limit(1)

      if (!emailLogs || emailLogs.length === 0) {
        return NextResponse.json({ received: true, handled: false, reason: 'No matching email found' })
      }

      const log = emailLogs[0]
      
      // Use AI to analyze the reply
      await handleCustomerReply(log.id, from, text || html || '', supabase)
      
      return NextResponse.json({ received: true, handled: true })
    }

    // Handle reply using AI agent
    await handleCustomerReply(emailLogId, from, text || html || '', supabase)

    return NextResponse.json({ received: true, handled: true })
  } catch (error) {
    console.error('Inbound email error:', error)
    return NextResponse.json(
      { error: 'Failed to process inbound email' },
      { status: 500 }
    )
  }
}

async function handleCustomerReply(
  emailLogId: string,
  fromEmail: string,
  replyContent: string,
  supabase: any
) {
  // Get the original email log
  const { data: emailLog } = await supabase
    .from('email_logs')
    .select(`
      *,
      invoice:invoices(*, customer:customers(*)),
      campaign:campaigns(*)
    `)
    .eq('id', emailLogId)
    .single()

  if (!emailLog) {
    return
  }

  // Check for STOP request (FDCPA requirement)
  const replyLower = replyContent.toLowerCase()
  const isStopRequest = replyLower.includes('stop') || 
                        replyLower.includes('cease') || 
                        replyLower.includes('do not contact') ||
                        replyLower.includes('opt out')

  if (isStopRequest) {
    // Handle stop request - mark customer preference
    await supabase
      .from('customers')
      .update({
        metadata: {
          ...(emailLog.customer?.metadata || {}),
          stopContact: true,
          stopContactDate: new Date().toISOString(),
        },
      })
      .eq('id', emailLog.customer_id)

    // Pause all active campaigns for this customer
    await supabase
      .from('campaigns')
      .update({ status: 'paused' })
      .eq('customer_id', emailLog.customer_id)
      .eq('status', 'active')

    // Log the stop request
    await supabase.from('email_logs').insert({
      org_id: emailLog.org_id,
      campaign_id: emailLog.campaign_id,
      invoice_id: emailLog.invoice_id,
      customer_id: emailLog.customer_id,
      subject: `Re: ${emailLog.subject}`,
      body: replyContent,
      to_email: fromEmail,
      status: 'delivered',
      metadata: {
        is_reply: true,
        is_stop_request: true,
        original_email_id: emailLogId,
        fdcpa_compliant: true,
      },
    })

    return // Stop processing - customer requested no contact
  }

  // Use AI to analyze the reply
  const analysis = await analyzeCustomerReply(replyContent, emailLog)

  // Log the reply
  await supabase.from('email_logs').insert({
    org_id: emailLog.org_id,
    campaign_id: emailLog.campaign_id,
    invoice_id: emailLog.invoice_id,
    customer_id: emailLog.customer_id,
    subject: `Re: ${emailLog.subject}`,
    body: replyContent,
    to_email: fromEmail, // Actually from customer
    status: 'delivered',
    metadata: {
      is_reply: true,
      original_email_id: emailLogId,
      analysis,
    },
  })

  // If customer says they'll pay or have paid, pause campaign
  if (analysis.intent === 'will_pay' || analysis.intent === 'paid') {
    if (emailLog.campaign_id) {
      await supabase
        .from('campaigns')
        .update({ status: 'paused' })
        .eq('id', emailLog.campaign_id)
    }
  }

  // If needs human review, flag it
  if (analysis.needsHumanReview) {
    // Could create a notification or flag in database
    console.log('Customer reply needs human review:', emailLogId)
  }
}

async function analyzeCustomerReply(replyContent: string, originalEmail: any) {
  // Use Gemini to analyze customer intent
  const prompt = `Analyze this customer email reply to a collection email. Determine:
1. Customer intent (paid, will_pay, needs_time, dispute, other)
2. Urgency level (low, medium, high)
3. Whether it needs human review (true/false)
4. Suggested action (pause_campaign, continue_campaign, escalate, respond)

Original email was about invoice ${originalEmail.invoice?.invoice_number || 'unknown'}.

Customer reply:
${replyContent.substring(0, 1000)}

Return ONLY a JSON object:
{
  "intent": "paid|will_pay|needs_time|dispute|other",
  "urgency": "low|medium|high",
  "needsHumanReview": true|false,
  "suggestedAction": "pause_campaign|continue_campaign|escalate|respond",
  "summary": "brief summary"
}`

  try {
    const { gemini } = await import('@/lib/gemini/client')
    const result = await gemini.generateContent(prompt)
    const response = result.response.text()
    const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(cleaned)
  } catch (error) {
    console.error('Failed to analyze reply:', error)
    return {
      intent: 'other',
      urgency: 'medium',
      needsHumanReview: true,
      suggestedAction: 'escalate',
      summary: 'Unable to analyze reply',
    }
  }
}

