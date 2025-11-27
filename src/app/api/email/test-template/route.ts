import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendCollectionEmail } from '@/lib/resend/client'
import { addFDCPADisclosures } from '@/lib/fdcpa/compliance'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { templateId, campaignId, to } = body

    if (!templateId || !to) {
      return NextResponse.json(
        { error: 'Template ID and recipient email required' },
        { status: 400 }
      )
    }

    // Get template
    const { data: template, error: templateError } = await supabase
      .from('email_templates')
      .select('*')
      .eq('id', templateId)
      .single()

    if (templateError || !template) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      )
    }

    // Get campaign and org
    const { data: campaign } = await supabase
      .from('campaigns')
      .select(`
        *,
        org:organizations(*)
      `)
      .eq('id', campaignId)
      .single()

    if (!campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      )
    }

    const org = campaign.org as any
    const settings = (org.settings as any) || {}

    // Prepare email content
    let emailBody = template.body
    let emailSubject = template.subject

    // Replace template variables with test data
    emailBody = emailBody
      .replace(/\{\{customerName\}\}/g, 'Test Customer')
      .replace(/\{\{invoiceNumber\}\}/g, 'TEST-001')
      .replace(/\{\{amount\}\}/g, '$1,000.00')
      .replace(/\{\{dueDate\}\}/g, new Date().toLocaleDateString())
      .replace(/\{\{companyName\}\}/g, org.name || 'Your Company')

    emailSubject = emailSubject
      .replace(/\{\{customerName\}\}/g, 'Test Customer')
      .replace(/\{\{invoiceNumber\}\}/g, 'TEST-001')
      .replace(/\{\{amount\}\}/g, '$1,000.00')
      .replace(/\{\{dueDate\}\}/g, new Date().toLocaleDateString())
      .replace(/\{\{companyName\}\}/g, org.name || 'Your Company')

    // Add FDCPA disclosures for test
    const compliantBody = addFDCPADisclosures(
      emailBody,
      {
        isFirstContact: true,
        creditorName: org.name,
        debtAmount: 1000,
        currency: 'USD',
        invoiceNumber: 'TEST-001',
        orgName: org.name,
        orgAddress: settings.orgAddress,
        orgPhone: settings.orgPhone,
        consumerEmail: to,
        consumerName: 'Test Customer',
      },
      true // Include validation notice
    )

    // Get customization
    const customization = template.metadata?.customization || {}

    // Send test email
    const result = await sendCollectionEmail({
      to,
      subject: `[TEST] ${emailSubject}`,
      body: compliantBody,
      fromName: settings.emailFromName || org.name || 'Collections',
      replyTo: settings.emailReplyTo || user.email,
      customization,
    })

    if (result.error) {
      return NextResponse.json(
        { error: 'Failed to send test email', details: result.error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Test email sent to ${to}`,
      emailId: result.data?.id,
    })
  } catch (error: any) {
    console.error('Test template email error:', error)
    return NextResponse.json(
      { error: 'Failed to send test email' },
      { status: 500 }
    )
  }
}

