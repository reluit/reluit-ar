# Task Scheduling System

The AI Agent can now schedule tasks for future execution, allowing for intelligent follow-ups and automated workflows.

## Overview

The task scheduling system allows the AI agent to:
- Schedule follow-up emails at optimal times
- Schedule payment checks
- Schedule campaign escalations
- Schedule custom tasks
- Automatically retry failed tasks with exponential backoff

## Database Schema

A new `scheduled_tasks` table stores all scheduled tasks:

```sql
CREATE TABLE scheduled_tasks (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL,
  campaign_id UUID,
  invoice_id UUID,
  customer_id UUID,
  task_type TEXT NOT NULL,
  task_data JSONB,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending',
  executed_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

## Task Types

### `send_email`
Sends a collection email to a customer.

**Task Data:**
- `tone`: Email tone (friendly, professional, firm, urgent)
- `templateId`: Optional template ID
- `subject`: Optional custom subject
- `body`: Optional custom body

**Example:**
```typescript
await taskScheduler.scheduleFollowUpEmail({
  orgId: '...',
  campaignId: '...',
  invoiceId: '...',
  customerId: '...',
  daysFromNow: 5,
  tone: 'professional',
})
```

### `check_payment`
Checks if invoices in a campaign have been paid.

**Task Data:**
- None required

**Example:**
```typescript
await taskScheduler.schedulePaymentCheck({
  orgId: '...',
  campaignId: '...',
  hoursFromNow: 24,
})
```

### `follow_up`
Alias for `send_email` - schedules a follow-up email.

### `escalate`
Escalates campaign tone to a more urgent level.

**Task Data:**
- `newTone`: The escalated tone to use

**Example:**
```typescript
await taskScheduler.scheduleEscalation({
  orgId: '...',
  campaignId: '...',
  daysFromNow: 10,
  newTone: 'urgent',
})
```

### `pause_campaign`
Pauses a campaign and cancels remaining tasks.

### `resume_campaign`
Resumes a paused campaign.

### `custom`
Custom task type for future extensibility.

## How It Works

### 1. Task Creation

When the AI agent needs to schedule a future action:

```typescript
// Schedule a follow-up email in 5 days
await taskScheduler.scheduleFollowUpEmail({
  orgId: campaign.org_id,
  campaignId: campaign.id,
  invoiceId: invoice.id,
  customerId: customer.id,
  daysFromNow: 5,
  tone: 'professional',
})
```

### 2. Task Execution

A cron job runs every 5 minutes (`/api/cron/execute-scheduled-tasks`):

1. Finds all pending tasks scheduled for now or earlier
2. Marks task as "executing"
3. Executes the task based on its type
4. Marks as "completed" or "failed"
5. Retries failed tasks with exponential backoff

### 3. Automatic Scheduling

The AI agent automatically schedules tasks when:

- **Campaign Created**: Schedules initial emails for all invoices
- **Email Sent**: Schedules next follow-up based on campaign schedule
- **Email Too Early**: Schedules follow-up for when it's time
- **Payment Check Needed**: Schedules payment verification

## Smart Scheduling Features

### Optimal Timing
- Follow-ups scheduled at 10 AM (configurable)
- Respects `daysBetweenEmails` setting
- Accounts for customer timezone (future)

### Automatic Retries
- Failed tasks retry automatically
- Exponential backoff: 5min, 15min, 1hr
- Max retries: 3 (configurable)

### Task Cancellation
- Tasks automatically cancelled when:
  - Campaign paused
  - Invoice paid
  - Campaign completed
  - Max attempts reached

## Integration with Campaign Execution

### When Email Sent
```typescript
// After sending email, schedule next follow-up
if (sendResult?.success && attemptCount + 1 < config.maxAttempts) {
  await taskScheduler.scheduleFollowUpEmail({
    orgId: campaign.org_id,
    campaignId: campaign.id,
    invoiceId: invoice.id,
    customerId: customer.id,
    daysFromNow: config.daysBetweenEmails,
    tone: nextStage.tone,
  })
}
```

### When Email Too Early
```typescript
// If not enough time has passed, schedule for later
if (daysSinceLastEmail < config.daysBetweenEmails) {
  await taskScheduler.scheduleFollowUpEmail({
    orgId: campaign.org_id,
    campaignId: campaign.id,
    invoiceId: invoice.id,
    customerId: customer.id,
    daysFromNow: daysUntilNext,
    tone: stage.tone,
  })
}
```

## Cron Job Configuration

Added to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/execute-scheduled-tasks",
      "schedule": "*/5 * * * *"  // Every 5 minutes
    }
  ]
}
```

## API Endpoints

### Execute Scheduled Tasks
`GET /api/cron/execute-scheduled-tasks`

- Runs every 5 minutes
- Requires `CRON_SECRET` authorization
- Executes all pending tasks ready to run

## Benefits

1. **Intelligent Timing**: Tasks scheduled at optimal times
2. **Automatic Follow-ups**: No manual intervention needed
3. **Resilient**: Automatic retries with backoff
4. **Flexible**: Supports multiple task types
5. **Scalable**: Handles thousands of scheduled tasks

## Example Workflow

1. **Campaign Created** → Initial emails scheduled for 30 minutes later
2. **Email Sent** → Next follow-up scheduled for 5 days later
3. **Customer Opens Email** → Payment check scheduled for 24 hours later
4. **No Payment** → Escalation scheduled for 10 days later
5. **Payment Received** → All remaining tasks cancelled automatically

## Monitoring

Check scheduled tasks in database:

```sql
-- Pending tasks
SELECT * FROM scheduled_tasks 
WHERE status = 'pending' 
ORDER BY scheduled_for;

-- Failed tasks
SELECT * FROM scheduled_tasks 
WHERE status = 'failed';

-- Task execution stats
SELECT 
  task_type,
  status,
  COUNT(*) as count
FROM scheduled_tasks
GROUP BY task_type, status;
```

## Future Enhancements

- [ ] Timezone-aware scheduling
- [ ] Priority levels for tasks
- [ ] Task dependencies
- [ ] Recurring tasks
- [ ] Task batching for efficiency
- [ ] Webhook notifications for task completion

