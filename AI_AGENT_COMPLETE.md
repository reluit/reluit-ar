# Complete AI Agent System

## Overview

The AI Agent is a fully automated system that manages collection campaigns with comprehensive context engineering, intelligent decision-making, and automated task scheduling.

## System Architecture

### Core Components

1. **Context Engine** (`src/lib/ai-agent/context.ts`)
   - Builds comprehensive context for decision-making
   - Determines optimal tone, timing, and escalation
   - Provides personalization hints
   - Makes escalation recommendations

2. **Agent Tools** (`src/lib/ai-agent/tools.ts`)
   - 7 tools for the AI agent
   - Check payment status
   - Get customer history
   - Send emails with full context
   - Analyze engagement

3. **Task Scheduler** (`src/lib/ai-agent/scheduler.ts`)
   - Schedule future tasks
   - Follow-up emails
   - Payment checks
   - Campaign escalations

4. **Agent Executor** (`src/lib/ai-agent/executor.ts`)
   - Executes campaigns
   - Makes intelligent decisions
   - Uses context for optimal actions
   - Schedules future tasks

5. **Cron Jobs** (`src/app/api/cron/`)
   - Execute campaigns (hourly)
   - Auto-create campaigns (every 6 hours)
   - Check payments (every 15 minutes)
   - Execute scheduled tasks (every 5 minutes)

## Context Engineering

### What Context Includes

**Customer Context**:
- Payment behavior (excellent/good/average/slow/problematic)
- Payment metrics (avg days to pay, totals)
- Email engagement (open rate, click rate)
- Recent payment history

**Invoice Context**:
- Days overdue
- Amount due
- Previous attempts
- Last email interaction (opened/clicked)
- Risk level

**Campaign Context**:
- Current stage
- Attempt number
- Max attempts
- Days between emails
- Tone escalation settings

**Company Context**:
- Company name
- Brand voice
- Email settings

### How Context is Used

1. **Tone Selection**: Context determines optimal tone
   - Excellent payers → Friendly longer
   - Problematic payers → Escalate faster
   - 30+ days overdue → Urgent
   - Customer clicked → Professional acknowledgment

2. **Timing Decisions**: Context determines when to send
   - Respects `daysBetweenEmails`
   - Accounts for customer engagement
   - Optimizes send times (Tuesday-Thursday, 10 AM - 2 PM)
   - Waits if customer clicked (payment processing)

3. **Content Personalization**: Context provides hints
   - "This is unusual for you" (excellent payers)
   - "We noticed you viewed the payment link" (clicked)
   - "Following up on our previous email" (opened)
   - Payment plan offers (large amounts)

4. **Escalation Decisions**: Context determines escalation
   - 30+ days overdue → Escalate to urgent
   - 3+ attempts → Escalate tone
   - No opens after 2+ attempts → Escalate

## Decision-Making Process

### Step-by-Step Flow

1. **Campaign Triggered**
   - Cron job or scheduled task
   - Load campaign and invoices

2. **For Each Invoice**:
   - Check if paid → Skip if paid
   - Check attempt count → Skip if max reached
   - Load customer data → Payment history, engagement
   - Load invoice data → Status, previous attempts
   - Load last email → Opened/clicked status

3. **Build Context**:
   - Customer context
   - Invoice context
   - Campaign context
   - Company context

4. **Make Decisions**:
   - Determine optimal tone
   - Determine optimal timing
   - Get personalization hints
   - Get escalation recommendations

5. **Generate Email**:
   - Use all context in prompt
   - Include personalization hints
   - Apply escalation recommendations
   - Generate personalized content

6. **Execute or Schedule**:
   - Send now if timing optimal
   - Schedule if too early
   - Schedule next follow-up

7. **Update Stats**:
   - Log email sent
   - Update campaign stats
   - Track engagement

## Key Features

### Intelligent Tone Selection

The agent selects tone based on:
- Customer payment behavior
- Days overdue
- Number of attempts
- Email engagement
- Risk level

**Examples**:
- Excellent payer, 5 days overdue, 1st attempt → Friendly
- Problematic payer, 20 days overdue, 3rd attempt → Firm
- Average payer, 30+ days overdue → Urgent

### Smart Timing

The agent schedules emails:
- Respects `daysBetweenEmails` setting
- Waits if customer clicked (payment processing)
- Optimizes for Tuesday-Thursday, 10 AM - 2 PM
- Sends immediately if high urgency

### Personalized Content

Every email is personalized:
- References customer payment history
- Acknowledges email engagement
- Mentions previous attempts appropriately
- Offers payment plans for large amounts
- Adjusts based on customer behavior

### Automatic Escalation

Escalates intelligently:
- Based on days overdue
- Based on attempt count
- Based on engagement patterns
- Never too early or too late

### Task Scheduling

Schedules future tasks:
- Follow-up emails
- Payment checks
- Campaign escalations
- Custom tasks

## Example Scenarios

### Scenario 1: Excellent Payer, First Attempt

**Context**:
- Payment behavior: excellent
- Days overdue: 5
- Attempts: 0

**Agent Actions**:
1. Determines tone: Friendly
2. Determines timing: Send now
3. Generates email: "We noticed this is unusual for you..."
4. Schedules follow-up: 5 days from now, professional tone

### Scenario 2: Problematic Payer, Multiple Attempts

**Context**:
- Payment behavior: problematic
- Days overdue: 25
- Attempts: 3
- Not opening emails

**Agent Actions**:
1. Determines tone: Urgent
2. Determines timing: Send now
3. Generates email: References payment history, mentions consequences
4. Escalates: Flags for human review if no response

### Scenario 3: Customer Clicked Payment Link

**Context**:
- Customer clicked last email
- Days overdue: 10
- Attempts: 1

**Agent Actions**:
1. Determines tone: Professional
2. Determines timing: Wait 2-3 days (payment processing)
3. Schedules follow-up: 2 days from now
4. Generates email: "We noticed you viewed the payment link..."

## Automation Features

### Fully Automated
- ✅ Campaign creation
- ✅ Email sending
- ✅ Tone escalation
- ✅ Payment detection
- ✅ Task scheduling
- ✅ Follow-up management
- ✅ Statistics tracking

### AI-Powered
- ✅ Email content generation
- ✅ Tone determination
- ✅ Timing optimization
- ✅ Personalization
- ✅ Escalation decisions
- ✅ Reply analysis

### Zero Manual Work
- ✅ No need to create campaigns
- ✅ No need to send emails
- ✅ No need to track payments
- ✅ No need to schedule follow-ups
- ✅ No need to update statistics
- ✅ No need to handle replies (when inbound configured)

## Monitoring & Analytics

### Track
- Email open rates
- Email click rates
- Payment conversion rates
- Time to payment
- Tone effectiveness
- Timing effectiveness

### Optimize
- Send times
- Tone selection
- Personalization
- Escalation timing
- Content strategy

## Files Created

### Core System
- `src/lib/ai-agent/context.ts` - Context engineering
- `src/lib/ai-agent/tools.ts` - Agent tools (updated with context)
- `src/lib/ai-agent/scheduler.ts` - Task scheduling
- `src/lib/ai-agent/executor.ts` - Campaign execution (updated with context)
- `src/lib/gemini/client.ts` - Email generation (updated with context)

### Cron Jobs
- `src/app/api/cron/execute-campaigns/route.ts`
- `src/app/api/cron/auto-create-campaigns/route.ts`
- `src/app/api/cron/check-payments/route.ts`
- `src/app/api/cron/execute-scheduled-tasks/route.ts`

### Documentation
- `CONTEXT_ENGINEERING.md` - Context system details
- `AI_AGENT_COMPLETE.md` - This file
- `agent-instructions.md` - Agent instructions
- `TASK_SCHEDULING.md` - Task scheduling guide

## Database Migration

Run this migration to add scheduled tasks table:

```sql
-- See: supabase/migrations/add_scheduled_tasks.sql
```

## Configuration

### Vercel Cron Jobs

Configured in `vercel.json`:
- Execute campaigns: Every hour
- Auto-create campaigns: Every 6 hours
- Check payments: Every 15 minutes
- Execute scheduled tasks: Every 5 minutes

### Environment Variables

Required:
- `CRON_SECRET` - For cron job authentication
- `GEMINI_API_KEY` - For AI content generation
- `RESEND_API_KEY` - For email sending
- Supabase credentials

## Benefits

1. **Intelligent**: Makes smart decisions based on full context
2. **Personalized**: Every email is personalized to the customer
3. **Optimal Timing**: Emails sent at the right time
4. **Appropriate Escalation**: Escalates when needed
5. **Relationship Preservation**: Maintains relationships while collecting
6. **Higher Conversion**: Better emails = more payments
7. **Fully Automated**: Zero manual work required
8. **Scalable**: Handles thousands of campaigns

## Next Steps

1. Run database migration
2. Deploy to Vercel
3. Configure cron jobs
4. Set up Resend webhooks
5. Monitor and optimize

The AI agent is now fully equipped with comprehensive context engineering to effectively manage all collection communications!

