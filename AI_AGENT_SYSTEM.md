# AI Agent System Overview

The Reluit AI Agent is a fully automated system that manages all collection communications without any manual intervention.

## Architecture

### Core Components

1. **AI Agent Executor** (`src/lib/ai-agent/executor.ts`)
   - Main orchestrator for campaign execution
   - Handles decision-making and scheduling
   - Manages campaign lifecycle

2. **Agent Tools** (`src/lib/ai-agent/tools.ts`)
   - Set of tools the AI agent can use
   - Check payment status
   - Send emails
   - Analyze customer behavior
   - Pause campaigns

3. **Cron Jobs** (`src/app/api/cron/`)
   - Scheduled tasks that run automatically
   - Execute campaigns
   - Auto-create campaigns
   - Check for payments

4. **Webhook Handlers** (`src/app/api/webhooks/`)
   - Handle email events (sent, opened, clicked)
   - Process inbound email replies
   - Update campaign statistics

## How It Works

### 1. Auto-Campaign Creation

**Cron Job:** Runs every 6 hours (`/api/cron/auto-create-campaigns`)

- Scans for overdue invoices
- Groups invoices by customer
- Creates campaigns automatically
- Activates campaigns immediately

**No manual work required** - campaigns are created automatically when invoices become overdue.

### 2. Campaign Execution

**Cron Job:** Runs every hour (`/api/cron/execute-campaigns`)

For each active campaign:
1. Checks if invoices are paid → pauses if all paid
2. Determines which emails to send based on:
   - Days overdue
   - Number of previous attempts
   - Campaign schedule
3. Uses AI to determine optimal tone
4. Generates personalized email content
5. Sends emails automatically
6. Logs all activity

**Smart Scheduling:**
- Respects `daysBetweenEmails` setting
- Escalates tone automatically
- Stops at max attempts

### 3. Payment Detection

**Cron Job:** Runs every 15 minutes (`/api/cron/check-payments`)

- Checks all active campaigns
- Verifies if invoices are paid
- Automatically pauses campaigns when paid
- Updates campaign statistics

**Instant Updates:** Campaigns pause immediately when payments are detected.

### 4. Email Event Tracking

**Webhook:** `/api/webhooks/resend`

Tracks:
- Email sent → Updates campaign stats
- Email opened → Tracks engagement
- Email clicked → Tracks interest
- Email bounced → Handles errors

**Real-time Updates:** All events update campaign statistics instantly.

### 5. Email Reply Handling

**Webhook:** `/api/webhooks/resend/inbound` (when configured)

When customer replies:
1. AI analyzes the reply content
2. Determines customer intent:
   - Paid / Will pay → Pause campaign
   - Needs time → Continue with adjusted schedule
   - Dispute → Escalate to human
3. Logs the reply
4. Takes appropriate action

**Intelligent Responses:** AI understands customer intent and responds appropriately.

## Agent Tools

The AI agent has access to these tools:

### `checkInvoicePaymentStatus`
- Checks if invoice is paid
- Returns payment status and amounts

### `getCustomerPaymentHistory`
- Gets customer payment behavior
- Returns payment patterns and history

### `getEmailAttemptCount`
- Counts emails sent for an invoice
- Used to determine if max attempts reached

### `getLastEmailInteraction`
- Gets details of last email sent
- Checks if email was opened/clicked
- Used for timing decisions

### `sendCollectionEmail`
- Sends email to customer
- Uses AI to generate content
- Applies template customizations
- Updates campaign stats

### `pauseCampaignIfPaid`
- Checks if all invoices paid
- Pauses campaign automatically

### `analyzeCustomerResponse`
- Analyzes email engagement
- Determines customer responsiveness
- Used for personalization

## Decision Making

The AI agent makes decisions based on:

1. **Invoice Status**
   - Paid → Pause campaign
   - Overdue → Continue campaign

2. **Email History**
   - Attempt count → Don't exceed max
   - Last email date → Respect timing
   - Engagement → Adjust tone

3. **Customer Behavior**
   - Payment history → Adjust approach
   - Email engagement → Personalize
   - Response patterns → Optimize

4. **Campaign Schedule**
   - Stage progression → Escalate tone
   - Days between emails → Respect cadence
   - Max attempts → Stop when reached

## Automation Features

### Fully Automated
- ✅ Campaign creation
- ✅ Email sending
- ✅ Tone escalation
- ✅ Payment detection
- ✅ Campaign pausing
- ✅ Statistics tracking

### AI-Powered
- ✅ Email content generation
- ✅ Tone determination
- ✅ Reply analysis
- ✅ Customer behavior analysis
- ✅ Optimal timing decisions

### Zero Manual Work
- ✅ No need to create campaigns
- ✅ No need to send emails
- ✅ No need to track payments
- ✅ No need to update statistics
- ✅ No need to handle replies (when inbound configured)

## Configuration

### Cron Jobs

Configured in `vercel.json`:
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

### Environment Variables

Required:
- `CRON_SECRET` - For cron job authentication
- `GEMINI_API_KEY` - For AI content generation
- `RESEND_API_KEY` - For email sending
- Supabase credentials

## Monitoring

### Vercel Logs
- View cron job executions
- Check for errors
- Monitor performance

### Dashboard
- Campaign statistics
- Email activity
- Payment tracking

### Resend Dashboard
- Webhook delivery
- Email events
- Inbound processing

## Future Enhancements

- [ ] SMS campaign automation
- [ ] Phone call automation
- [ ] Advanced reply handling
- [ ] Multi-language support
- [ ] A/B testing
- [ ] Predictive analytics

