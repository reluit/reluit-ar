# Resend Webhook Setup Guide

This guide will help you configure Resend webhooks to automatically track email events (sent, delivered, opened, clicked, bounced) in your Reluit application.

## Step 1: Get Your Webhook URL

Your webhook endpoint is located at:
```
https://yourdomain.com/api/webhooks/resend
```

**For local development:**
- Use a tool like [ngrok](https://ngrok.com/) to expose your local server
- Example: `https://abc123.ngrok.io/api/webhooks/resend`

**For production:**
- Use your deployed domain
- Example: `https://app.reluit.com/api/webhooks/resend`

## Step 2: Configure Webhook in Resend Dashboard

1. **Log in to Resend**
   - Go to [https://resend.com](https://resend.com)
   - Sign in to your account

2. **Navigate to Webhooks**
   - Click on **Settings** in the left sidebar
   - Click on **Webhooks** in the settings menu
   - Or go directly to: [https://resend.com/webhooks](https://resend.com/webhooks)

3. **Create New Webhook**
   - Click the **"Add Webhook"** or **"Create Webhook"** button
   - Enter your webhook URL in the **"Endpoint URL"** field:
     ```
     https://yourdomain.com/api/webhooks/resend
     ```

4. **Select Events to Subscribe To**
   Select the following events (checkboxes):
   - ✅ `email.sent` - When an email is sent
   - ✅ `email.delivered` - When an email is delivered
   - ✅ `email.opened` - When an email is opened
   - ✅ `email.clicked` - When a link in an email is clicked
   - ✅ `email.bounced` - When an email bounces
   - ✅ `email.complained` - When someone marks email as spam

5. **Save the Webhook**
   - Click **"Save"** or **"Create Webhook"**
   - Resend will generate a webhook secret (save this for verification if needed)

## Step 3: Test the Webhook

1. **Send a Test Email**
   - Send an email through your Reluit application
   - Check the Resend dashboard for webhook delivery status

2. **Verify Webhook Receives Events**
   - Check your application logs for webhook requests
   - Verify email logs are being updated in your dashboard

## Step 4: Verify Webhook Signature (Optional but Recommended)

For production, you should verify webhook signatures to ensure requests are coming from Resend.

1. **Get Your Webhook Secret**
   - In Resend dashboard, go to your webhook settings
   - Copy the webhook secret

2. **Add to Environment Variables**
   ```bash
   RESEND_WEBHOOK_SECRET=your_webhook_secret_here
   ```

3. **Update Webhook Handler**
   The webhook handler at `/api/webhooks/resend/route.ts` includes placeholder code for signature verification. Uncomment and implement it:

   ```typescript
   // In route.ts
   const signature = headersList.get('resend-signature')
   const secret = process.env.RESEND_WEBHOOK_SECRET
   
   if (!verifySignature(signature, body, secret)) {
     return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
   }
   ```

## Webhook Event Payloads

Resend sends webhook events in the following format:

```json
{
  "type": "email.sent",
  "data": {
    "email_id": "abc123",
    "to": "customer@example.com",
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

### Event Types:

- **email.sent**: Email was successfully sent
- **email.delivered**: Email was delivered to recipient's mailbox
- **email.opened**: Recipient opened the email
- **email.clicked**: Recipient clicked a link in the email
- **email.bounced**: Email bounced (hard or soft bounce)
- **email.complained**: Recipient marked email as spam

## Troubleshooting

### Webhook Not Receiving Events

1. **Check Webhook URL**
   - Ensure the URL is correct and accessible
   - Test with `curl` or Postman

2. **Check Resend Dashboard**
   - Go to webhook settings
   - Check delivery logs for errors
   - Verify events are being sent

3. **Check Application Logs**
   - Look for webhook requests in your server logs
   - Check for errors in webhook processing

### Webhook Returns 401/403

- Verify webhook signature if implemented
- Check that webhook secret matches in environment variables

### Events Not Updating Database

- Check database connection
- Verify email_logs table exists
- Check campaign_id matches in email logs

## Additional Resources

- [Resend Webhook Documentation](https://resend.com/docs/dashboard/webhooks)
- [Resend API Reference](https://resend.com/docs/api-reference)
- [Webhook Best Practices](https://resend.com/docs/dashboard/webhooks#best-practices)

## Quick Reference

**Webhook Endpoint:** `/api/webhooks/resend`  
**Method:** POST  
**Content-Type:** application/json  
**Required Events:** email.sent, email.delivered, email.opened, email.clicked, email.bounced, email.complained

