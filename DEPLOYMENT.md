# Deployment Guide - Reluit AI Agent System

This guide covers deploying the fully automated AI agent system to Vercel with cron jobs and webhooks.

## Prerequisites

- Vercel account
- Supabase project
- Resend account
- Google Gemini API key

## Step 1: Deploy to Vercel

1. **Push your code to GitHub**
   ```bash
   git add .
   git commit -m "Add AI agent system"
   git push origin main
   ```

2. **Import project to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Click "Add New Project"
   - Import your GitHub repository
   - Vercel will auto-detect Next.js

3. **Configure Environment Variables**
   In Vercel dashboard → Settings → Environment Variables, add:
   
   ```
   # Supabase
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   
   # Google Gemini
   GEMINI_API_KEY=your_gemini_key
   
   # Resend
   RESEND_API_KEY=your_resend_key
   RESEND_FROM_EMAIL=collections@yourdomain.com
   
   # App
   NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
   
   # Cron Secret (generate with: openssl rand -base64 32)
   CRON_SECRET=your_random_secret_here
   ```

## Step 2: Configure Vercel Cron Jobs

The `vercel.json` file is already configured with cron jobs:

```json
{
  "crons": [
    {
      "path": "/api/cron/execute-campaigns",
      "schedule": "0 * * * *"  // Every hour
    },
    {
      "path": "/api/cron/auto-create-campaigns",
      "schedule": "0 */6 * * *"  // Every 6 hours
    },
    {
      "path": "/api/cron/check-payments",
      "schedule": "*/15 * * * *"  // Every 15 minutes
    }
  ]
}
```

**After deployment:**
1. Go to Vercel Dashboard → Your Project → Settings → Cron Jobs
2. Verify the cron jobs are listed
3. Vercel will automatically set the `Authorization` header with your `CRON_SECRET`

## Step 3: Configure Resend Webhooks

### Outbound Webhooks (Email Events)

1. **Go to Resend Dashboard**
   - Navigate to [resend.com/webhooks](https://resend.com/webhooks)

2. **Create Webhook**
   - Endpoint URL: `https://your-app.vercel.app/api/webhooks/resend`
   - Events to subscribe:
     - ✅ `email.sent`
     - ✅ `email.delivered`
     - ✅ `email.opened`
     - ✅ `email.clicked`
     - ✅ `email.bounced`
     - ✅ `email.complained`

3. **Save Webhook Secret** (optional but recommended)
   - Copy the webhook secret
   - Add to Vercel env: `RESEND_WEBHOOK_SECRET`

### Inbound Email (Email Replies)

1. **Add Inbound Domain in Resend**
   - Go to Resend Dashboard → Domains
   - Add your domain (e.g., `yourdomain.com`)
   - Verify DNS records

2. **Configure Inbound Route**
   - Go to Resend Dashboard → Inbound
   - Add route: `replies@yourdomain.com`
   - Webhook URL: `https://your-app.vercel.app/api/webhooks/resend/inbound`

3. **Update Email Sending**
   - Configure reply-to addresses to use unique IDs
   - Format: `reply-{email_log_id}@yourdomain.com`

## Step 4: Verify Deployment

### Test Cron Jobs

1. **Manual Test**
   ```bash
   curl -X GET "https://your-app.vercel.app/api/cron/execute-campaigns" \
     -H "Authorization: Bearer YOUR_CRON_SECRET"
   ```

2. **Check Vercel Logs**
   - Go to Vercel Dashboard → Your Project → Logs
   - Look for cron job executions

### Test Webhooks

1. **Send Test Email**
   - Use your app to send a test email
   - Check Resend dashboard for webhook delivery

2. **Verify Email Logs**
   - Check your dashboard for email activity
   - Verify opens/clicks are tracked

## Step 5: Monitor & Debug

### Vercel Logs
- Real-time logs: Vercel Dashboard → Logs
- Function logs show cron executions
- Check for errors in webhook handlers

### Resend Dashboard
- Webhook delivery logs
- Email event tracking
- Inbound email processing

### Supabase
- Check `email_logs` table for email tracking
- Check `campaigns` table for campaign stats
- Monitor `payment_events` for payment tracking

## Cron Job Schedules

| Job | Schedule | Frequency | Purpose |
|-----|----------|-----------|---------|
| Execute Campaigns | `0 * * * *` | Every hour | Send scheduled emails |
| Auto-create Campaigns | `0 */6 * * *` | Every 6 hours | Create campaigns for overdue invoices |
| Check Payments | `*/15 * * * *` | Every 15 minutes | Update campaign status when paid |

## AI Agent Features

The AI agent automatically:

1. **Campaign Execution**
   - Sends emails based on campaign schedule
   - Determines optimal tone based on context
   - Tracks email attempts and timing

2. **Auto-Campaign Creation**
   - Creates campaigns for overdue invoices
   - Groups invoices by customer
   - Auto-activates campaigns

3. **Payment Detection**
   - Checks for payments every 15 minutes
   - Pauses campaigns when invoices paid
   - Updates campaign statistics

4. **Email Reply Handling** (when inbound configured)
   - Analyzes customer replies with AI
   - Determines customer intent
   - Pauses campaigns when customer responds positively
   - Escalates to human review when needed

## Troubleshooting

### Cron Jobs Not Running

1. **Check Vercel Cron Jobs**
   - Verify cron jobs are configured in dashboard
   - Check cron job status

2. **Verify CRON_SECRET**
   - Ensure `CRON_SECRET` is set in environment variables
   - Check authorization header matches

3. **Check Function Logs**
   - Look for errors in Vercel function logs
   - Verify database connections

### Webhooks Not Receiving Events

1. **Check Webhook URL**
   - Verify URL is correct and accessible
   - Test with curl or Postman

2. **Check Resend Dashboard**
   - Verify webhook is active
   - Check delivery logs for errors

3. **Verify Environment Variables**
   - Ensure all API keys are set
   - Check database connection

### Emails Not Sending

1. **Check Resend API Key**
   - Verify key is valid
   - Check sending domain is verified

2. **Check Campaign Status**
   - Ensure campaigns are `active`
   - Verify invoices are not paid

3. **Check Email Logs**
   - Look for errors in `email_logs` table
   - Verify customer emails are valid

## Production Checklist

- [ ] All environment variables set in Vercel
- [ ] Cron jobs configured and running
- [ ] Resend webhooks configured
- [ ] Inbound email configured (optional)
- [ ] Domain verified in Resend
- [ ] Database migrations applied
- [ ] Test emails sent successfully
- [ ] Webhook events being received
- [ ] Cron jobs executing on schedule

## Support

For issues:
1. Check Vercel function logs
2. Check Resend webhook logs
3. Check Supabase logs
4. Review error messages in dashboard

