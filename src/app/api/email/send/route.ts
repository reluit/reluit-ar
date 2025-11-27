import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendCollectionEmail } from '@/lib/resend/client'
import { generateCollectionEmail } from '@/lib/gemini/client'
import { differenceInDays, parseISO } from 'date-fns'
import type { EmailTone, OrganizationSettings } from '@/types/database'

interface SendEmailRequest {
  invoiceId: string
  customSubject?: string
  customBody?: string
  tone?: EmailTone
  useAiGeneration?: boolean
  templateId?: string
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization with settings
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, brand_voice, settings')
      .eq('owner_id', user.id)
      .single()

    if (orgError || !org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const body: SendEmailRequest = await request.json()
    const { invoiceId, customSubject, customBody, tone = 'professional', useAiGeneration = true } = body

    // Get invoice with customer details
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select(`
        *,
        customer:customers(id, name, email)
      `)
      .eq('id', invoiceId)
      .eq('org_id', org.id)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const customer = invoice.customer as { id: string; name: string; email: string | null }
    
    if (!customer?.email) {
      return NextResponse.json({ error: 'Customer email not found' }, { status: 400 })
    }

    // Get email count for this invoice (previous attempts)
    const { count: previousAttempts } = await supabase
      .from('email_logs')
      .select('*', { count: 'exact', head: true })
      .eq('invoice_id', invoiceId)

    let subject: string
    let emailBody: string

    if (customSubject && customBody) {
      // Use custom content
      subject = customSubject
      emailBody = customBody
    } else if (useAiGeneration) {
      // Generate with AI
      const daysOverdue = differenceInDays(new Date(), parseISO(invoice.due_date))
      
      const generated = await generateCollectionEmail({
        customerName: customer.name,
        customerEmail: customer.email,
        invoiceNumber: invoice.invoice_number || invoice.external_id,
        invoiceAmount: invoice.amount_due,
        currency: invoice.currency,
        dueDate: invoice.due_date,
        daysOverdue,
        previousAttempts: previousAttempts || 0,
        paymentHistory: 'average',
        brandVoice: org.brand_voice || undefined,
        tone,
        companyName: org.name,
        paymentUrl: invoice.payment_url || undefined,
      })

      subject = generated.subject
      emailBody = generated.body
    } else {
      return NextResponse.json({ error: 'Subject and body required when AI generation disabled' }, { status: 400 })
    }

    // Get org settings for email configuration
    const settings = (org.settings as OrganizationSettings) || {}
    const fromName = settings.emailFromName || org.name || 'Collections'
    const replyTo = settings.emailReplyTo || user.email

    // Get template customization if template_id is provided
    let customization = undefined
    if (body.templateId) {
      const { data: template } = await supabase
        .from('email_templates')
        .select('metadata')
        .eq('id', body.templateId)
        .single()
      
      if (template?.metadata?.customization) {
        customization = template.metadata.customization
      }
    }

    // Send the email
    const result = await sendCollectionEmail({
      to: customer.email,
      subject,
      body: emailBody,
      fromName,
      replyTo,
      paymentUrl: invoice.payment_url || undefined,
      invoicePdfUrl: invoice.pdf_url || undefined,
      customization,
    })

    if (result.error) {
      // Log failed email
      await supabase.from('email_logs').insert({
        org_id: org.id,
        invoice_id: invoiceId,
        customer_id: customer.id,
        subject,
        body: emailBody,
        to_email: customer.email,
        status: 'failed',
        error_message: result.error.message,
      })

      return NextResponse.json({ error: 'Failed to send email', details: result.error }, { status: 500 })
    }

    // Log successful email
    await supabase.from('email_logs').insert({
      org_id: org.id,
      invoice_id: invoiceId,
      customer_id: customer.id,
      subject,
      body: emailBody,
      to_email: customer.email,
      status: 'sent',
      sent_at: new Date().toISOString(),
      metadata: { resend_id: result.data?.id },
    })

    return NextResponse.json({
      success: true,
      emailId: result.data?.id,
      subject,
      to: customer.email,
    })
  } catch (error) {
    console.error('Email send error:', error)
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 }
    )
  }
}

// Batch send emails for a campaign
export async function PUT(request: Request) {
  try {
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, brand_voice, settings')
      .eq('owner_id', user.id)
      .single()

    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const body = await request.json()
    const { invoiceIds, tone = 'professional' } = body as { invoiceIds: string[]; tone?: EmailTone }

    if (!invoiceIds || invoiceIds.length === 0) {
      return NextResponse.json({ error: 'No invoices specified' }, { status: 400 })
    }

    // Limit batch size
    if (invoiceIds.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 invoices per batch' }, { status: 400 })
    }

    const results: { invoiceId: string; success: boolean; error?: string }[] = []
    const settings = (org.settings as OrganizationSettings) || {}
    const fromName = settings.emailFromName || org.name || 'Collections'
    const replyTo = settings.emailReplyTo || user.email

    for (const invoiceId of invoiceIds) {
      try {
        const { data: invoice } = await supabase
          .from('invoices')
          .select(`*, customer:customers(id, name, email)`)
          .eq('id', invoiceId)
          .eq('org_id', org.id)
          .single()

        if (!invoice) {
          results.push({ invoiceId, success: false, error: 'Invoice not found' })
          continue
        }

        const customer = invoice.customer as { id: string; name: string; email: string | null }
        
        if (!customer?.email) {
          results.push({ invoiceId, success: false, error: 'Customer email missing' })
          continue
        }

        const { count: previousAttempts } = await supabase
          .from('email_logs')
          .select('*', { count: 'exact', head: true })
          .eq('invoice_id', invoiceId)

        const daysOverdue = differenceInDays(new Date(), parseISO(invoice.due_date))
        
        const generated = await generateCollectionEmail({
          customerName: customer.name,
          customerEmail: customer.email,
          invoiceNumber: invoice.invoice_number || invoice.external_id,
          invoiceAmount: invoice.amount_due,
          currency: invoice.currency,
          dueDate: invoice.due_date,
          daysOverdue,
          previousAttempts: previousAttempts || 0,
          paymentHistory: 'average',
          brandVoice: org.brand_voice || undefined,
          tone,
          companyName: org.name,
          paymentUrl: invoice.payment_url || undefined,
        })

        const result = await sendCollectionEmail({
          to: customer.email,
          subject: generated.subject,
          body: generated.body,
          fromName,
          replyTo,
          paymentUrl: invoice.payment_url || undefined,
          invoicePdfUrl: invoice.pdf_url || undefined,
        })

        if (result.error) {
          await supabase.from('email_logs').insert({
            org_id: org.id,
            invoice_id: invoiceId,
            customer_id: customer.id,
            subject: generated.subject,
            body: generated.body,
            to_email: customer.email,
            status: 'failed',
            error_message: result.error.message,
          })
          results.push({ invoiceId, success: false, error: result.error.message })
        } else {
          await supabase.from('email_logs').insert({
            org_id: org.id,
            invoice_id: invoiceId,
            customer_id: customer.id,
            subject: generated.subject,
            body: generated.body,
            to_email: customer.email,
            status: 'sent',
            sent_at: new Date().toISOString(),
            metadata: { resend_id: result.data?.id },
          })
          results.push({ invoiceId, success: true })
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (err) {
        results.push({ invoiceId, success: false, error: 'Processing error' })
      }
    }

    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    return NextResponse.json({
      total: invoiceIds.length,
      successful,
      failed,
      results,
    })
  } catch (error) {
    console.error('Batch email error:', error)
    return NextResponse.json(
      { error: 'Failed to send batch emails' },
      { status: 500 }
    )
  }
}

