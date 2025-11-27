import { Resend } from 'resend'

export const resend = new Resend(process.env.RESEND_API_KEY)

// Reluit's default sending domain - used when org doesn't have custom domain
const RELUIT_SENDING_DOMAIN = 'reluit.com'
const DEFAULT_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || `collections@${RELUIT_SENDING_DOMAIN}`

export interface EmailCustomization {
  primaryColor?: string
  buttonColor?: string
  buttonText?: string
  buttonStyle?: 'rounded' | 'square'
  showLogo?: boolean
  logoUrl?: string
  companyName?: string
  footerText?: string
  includePayButton?: boolean
  includeInvoiceLink?: boolean
}

export interface SendCollectionEmailParams {
  to: string
  subject: string
  body: string
  fromName?: string
  replyTo?: string
  invoicePdfUrl?: string
  paymentUrl?: string
  customization?: EmailCustomization
  // Future: custom domain support
  customDomain?: string
  customDomainVerified?: boolean
}

export interface SendEmailResult {
  data?: { id: string }
  error?: { message: string; name?: string }
}

export async function sendCollectionEmail(params: SendCollectionEmailParams): Promise<SendEmailResult> {
  const {
    to,
    subject,
    body,
    fromName = 'Collections',
    replyTo,
    invoicePdfUrl,
    paymentUrl,
    customization,
    customDomain,
    customDomainVerified,
  } = params

  // Determine sending email address
  // Future: when custom domain is verified, use that instead
  let fromEmail = DEFAULT_FROM_EMAIL
  if (customDomain && customDomainVerified) {
    fromEmail = `collections@${customDomain}`
  }
  
  // Build HTML email with pay button and customizations
  const htmlBody = buildEmailHtml({
    body,
    paymentUrl,
    invoicePdfUrl,
    customization,
  })

  try {
    const result = await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      subject,
      html: htmlBody,
      text: body, // Plain text fallback
      replyTo: replyTo || fromEmail,
    })

    return result
  } catch (err) {
    console.error('Resend error:', err)
    return {
      error: { message: err instanceof Error ? err.message : 'Failed to send email' }
    }
  }
}

// Send a test email to verify configuration
export async function sendTestEmail(params: {
  to: string
  fromName: string
  replyTo?: string
}): Promise<SendEmailResult> {
  const { to, fromName, replyTo } = params

  try {
    const result = await resend.emails.send({
      from: `${fromName} <${DEFAULT_FROM_EMAIL}>`,
      to: [to],
      subject: 'Test Email from Reluit',
      html: buildTestEmailHtml(fromName),
      text: `This is a test email from ${fromName} via Reluit. Your email configuration is working correctly!`,
      replyTo: replyTo || DEFAULT_FROM_EMAIL,
    })

    return result
  } catch (err) {
    console.error('Resend test email error:', err)
    return {
      error: { message: err instanceof Error ? err.message : 'Failed to send test email' }
    }
  }
}

function buildTestEmailHtml(fromName: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 40px 20px;">
  <table width="600" align="center" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
    <tr>
      <td style="padding: 40px; text-align: center;">
        <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 50%; margin: 0 auto 24px; display: flex; align-items: center; justify-content: center;">
          <span style="font-size: 28px;">✓</span>
        </div>
        <h1 style="margin: 0 0 16px 0; font-size: 24px; color: #1a1a2e;">Email Configuration Working!</h1>
        <p style="margin: 0 0 24px 0; color: #64748b; line-height: 1.6;">
          This is a test email from <strong>${fromName}</strong> via Reluit.
          <br><br>
          Your email sending configuration is set up correctly and ready to send collection emails to your customers.
        </p>
        <div style="padding: 16px; background-color: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0;">
          <p style="margin: 0; font-size: 14px; color: #166534;">
            ✓ Email delivery verified
          </p>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding: 24px 40px; background-color: #f8fafc; border-radius: 0 0 12px 12px;">
        <p style="margin: 0; font-size: 12px; color: #64748b; text-align: center;">
          Sent via Reluit · Automated Collections Platform
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
`
}

function buildEmailHtml(params: {
  body: string
  paymentUrl?: string
  invoicePdfUrl?: string
  customization?: EmailCustomization
}): string {
  const { body, paymentUrl, invoicePdfUrl, customization } = params
  
  const primaryColor = customization?.primaryColor || '#10b981'
  const buttonColor = customization?.buttonColor || '#10b981'
  const buttonText = customization?.buttonText || 'Pay Now'
  const buttonStyle = customization?.buttonStyle || 'rounded'
  const borderRadius = buttonStyle === 'rounded' ? '8px' : '4px'
  const showLogo = customization?.showLogo && customization?.logoUrl
  const companyName = customization?.companyName || ''
  const footerText = customization?.footerText || 'This email was sent by Reluit on behalf of the sender.\nIf you have questions about this invoice, please reply directly to this email.'
  const includePayButton = customization?.includePayButton !== false
  const includeInvoiceLink = customization?.includeInvoiceLink !== false
  
  // Convert line breaks to HTML
  const formattedBody = body
    .split('\n')
    .map(line => `<p style="margin: 0 0 12px 0; line-height: 1.6;">${line || '&nbsp;'}</p>`)
    .join('')

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice Reminder</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; line-height: 1.6; color: #1a1a2e; background-color: #f8fafc; margin: 0; padding: 0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
          ${showLogo ? `
          <!-- Logo Header -->
          <tr>
            <td style="padding: 32px 40px 24px 40px; border-bottom: 1px solid #e2e8f0; text-align: center;">
              <img src="${customization?.logoUrl}" alt="${companyName}" style="max-height: 60px; max-width: 200px;" />
            </td>
          </tr>
          ` : `
          <!-- Header -->
          <tr>
            <td style="padding: 32px 40px 24px 40px; border-bottom: 1px solid #e2e8f0;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: ${primaryColor};">${companyName || 'Invoice Reminder'}</h1>
            </td>
          </tr>
          `}
          
          <!-- Body -->
          <tr>
            <td style="padding: 32px 40px;">
              ${formattedBody}
              
              ${paymentUrl && includePayButton ? `
              <!-- Pay Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 24px;">
                <tr>
                  <td align="center">
                    <a href="${paymentUrl}" style="display: inline-block; background-color: ${buttonColor}; color: #ffffff; font-weight: 600; font-size: 16px; padding: 14px 32px; border-radius: ${borderRadius}; text-decoration: none; transition: background-color 0.2s;">
                      ${buttonText}
                    </a>
                  </td>
                </tr>
              </table>
              ` : ''}
              
              ${invoicePdfUrl && includeInvoiceLink ? `
              <!-- View Invoice Link -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 16px;">
                <tr>
                  <td align="center">
                    <a href="${invoicePdfUrl}" style="color: ${primaryColor}; font-size: 14px; text-decoration: underline;">
                      View Invoice PDF
                    </a>
                  </td>
                </tr>
              </table>
              ` : ''}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; background-color: #f8fafc; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; font-size: 12px; color: #64748b; text-align: center; white-space: pre-line;">
                ${footerText}
              </p>
              <!-- FDCPA Disclosures (if included in body) -->
              ${body.includes('This is an attempt to collect a debt') ? `
              <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
                <p style="margin: 0; font-size: 11px; color: #64748b; line-height: 1.5;">
                  This communication is from a debt collector. You have the right to request that we stop contacting you about this debt. To do so, please reply to this email with "STOP".
                </p>
              </div>
              ` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
}

export async function sendDigestEmail(params: {
  to: string
  orgName: string
  weeklyStats: {
    amountCollected: number
    invoicesPaid: number
    emailsSent: number
    outstandingAmount: number
    overdueCount: number
  }
}) {
  const { to, orgName, weeklyStats } = params
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'digest@reluit.com'

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; margin: 0; padding: 40px 20px;">
  <table width="600" align="center" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
    <tr>
      <td style="padding: 32px 40px;">
        <h1 style="margin: 0 0 24px 0; font-size: 24px; color: #1a1a2e;">Weekly Collections Digest</h1>
        <p style="margin: 0 0 24px 0; color: #64748b;">Here's how ${orgName} did this week:</p>
        
        <!-- Stats Grid -->
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="50%" style="padding: 16px; background-color: #ecfdf5; border-radius: 8px;">
              <p style="margin: 0; font-size: 12px; color: #10b981; text-transform: uppercase;">Collected</p>
              <p style="margin: 4px 0 0 0; font-size: 28px; font-weight: 700; color: #065f46;">$${weeklyStats.amountCollected.toLocaleString()}</p>
            </td>
            <td width="16"></td>
            <td width="50%" style="padding: 16px; background-color: #f0fdf4; border-radius: 8px;">
              <p style="margin: 0; font-size: 12px; color: #22c55e; text-transform: uppercase;">Invoices Paid</p>
              <p style="margin: 4px 0 0 0; font-size: 28px; font-weight: 700; color: #166534;">${weeklyStats.invoicesPaid}</p>
            </td>
          </tr>
          <tr><td colspan="3" height="16"></td></tr>
          <tr>
            <td width="50%" style="padding: 16px; background-color: #fef3c7; border-radius: 8px;">
              <p style="margin: 0; font-size: 12px; color: #d97706; text-transform: uppercase;">Outstanding</p>
              <p style="margin: 4px 0 0 0; font-size: 28px; font-weight: 700; color: #92400e;">$${weeklyStats.outstandingAmount.toLocaleString()}</p>
            </td>
            <td width="16"></td>
            <td width="50%" style="padding: 16px; background-color: #fee2e2; border-radius: 8px;">
              <p style="margin: 0; font-size: 12px; color: #ef4444; text-transform: uppercase;">Overdue</p>
              <p style="margin: 4px 0 0 0; font-size: 28px; font-weight: 700; color: #991b1b;">${weeklyStats.overdueCount}</p>
            </td>
          </tr>
        </table>
        
        <p style="margin: 24px 0 0 0; font-size: 14px; color: #64748b;">
          ${weeklyStats.emailsSent} collection emails sent this week.
        </p>
        
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="display: inline-block; margin-top: 24px; background-color: #10b981; color: #ffffff; font-weight: 600; padding: 12px 24px; border-radius: 8px; text-decoration: none;">
          View Dashboard
        </a>
      </td>
    </tr>
  </table>
</body>
</html>
`

  return resend.emails.send({
    from: `Reluit <${fromEmail}>`,
    to: [to],
    subject: `${orgName} - Weekly Collections Digest`,
    html,
  })
}

