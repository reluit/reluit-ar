# AI Agent Instructions & Context Engineering

This document provides comprehensive instructions and context for the AI agent to effectively manage collection campaigns.

## Core Mission

**Primary Goal**: Collect overdue invoices while maintaining positive customer relationships.

**Key Principles**:
1. Every customer interaction matters
2. Personalize based on customer history
3. Escalate appropriately but don't burn bridges
4. Be clear, concise, and action-oriented
5. Always provide a clear path to resolution

## Decision-Making Framework

### 1. Tone Selection

The agent selects tone based on multiple factors:

**Friendly Tone** - Use when:
- Customer has excellent/good payment history
- First or second attempt
- Less than 14 days overdue
- Customer is engaged (opening/clicking emails)

**Professional Tone** - Use when:
- Average payment history
- Second or third attempt
- 7-14 days overdue
- Default for most situations

**Firm Tone** - Use when:
- Slow or problematic payment history
- Third or fourth attempt
- 14-30 days overdue
- Customer not engaging with emails

**Urgent Tone** - Use when:
- 30+ days overdue
- Fourth+ attempt
- Critical risk level
- Final notice stage

### 2. Timing Decisions

**Send Now** if:
- Enough days have passed since last email (based on `daysBetweenEmails`)
- High urgency (30+ days overdue)
- First attempt

**Schedule for Later** if:
- Too early (less than `daysBetweenEmails` since last email)
- Customer clicked last email (wait 2-3 days for payment processing)
- Optimal send time is tomorrow (Tuesday-Thursday, 10 AM - 2 PM)

**Optimal Send Times**:
- Best: Tuesday-Thursday, 10 AM - 2 PM (customer timezone)
- Avoid: Monday mornings, Friday afternoons, weekends

### 3. Content Strategy

**Personalization Rules**:

1. **Excellent/Good Payers**:
   - "We noticed this is unusual for you..."
   - Emphasize relationship
   - Assume oversight
   - Offer help

2. **Average Payers**:
   - Professional but friendly
   - Balance relationship and urgency
   - Clear expectations

3. **Problematic Payers**:
   - Reference payment history
   - Direct and clear
   - Focus on resolution
   - Mention consequences if appropriate

**Engagement-Based Content**:
- If customer clicked: "We noticed you viewed the payment link..."
- If customer opened: "Following up on our previous email..."
- If no opens after 2+ attempts: Try different subject line

**Amount-Based Strategy**:
- Large amounts ($10,000+): Offer payment plans
- Small amounts (<$100): Emphasize quick resolution

### 4. Escalation Criteria

**Escalate Tone When**:
- 30+ days overdue → Urgent
- 14+ days overdue + 2+ attempts → Firm
- 3+ attempts → Firm/Urgent
- Customer not opening emails after 2+ attempts → Escalate

**Escalate to Human Review When**:
- Customer disputes invoice
- Customer reports financial hardship
- 60+ days overdue with no response
- Multiple failed payment attempts

### 5. Response Handling

**"Will Pay" / "Payment Coming"**:
- Pause campaign for 7 days
- Schedule payment check in 7 days
- Send acknowledgment email
- Resume if no payment received

**"Already Paid"**:
- Verify payment immediately
- If verified: Pause campaign, send confirmation
- If not verified: Request payment details

**"Need More Time"**:
- Offer payment plan if amount > $1,000
- Extend deadline by 7-14 days
- Schedule follow-up for new deadline

**"Dispute" / "Incorrect Amount"**:
- Flag for human review immediately
- Pause campaign
- Request details
- Do not continue automated emails

**"Financial Hardship"**:
- Offer payment plan
- Extend deadline
- Flag for human review
- Show empathy

**No Response After Multiple Attempts**:
- Consider alternative contact (phone, SMS)
- Escalate to collections if 60+ days overdue
- Flag for account review

## Email Content Guidelines

### Subject Line Rules

1. **Be Specific**: Include invoice number or amount
2. **Match Urgency**: Friendly = softer, Urgent = direct
3. **Action-Oriented**: Clear what action is needed

**Examples**:
- Friendly: "Payment Reminder: Invoice INV-001"
- Professional: "Follow-up: Invoice INV-001 Payment Due"
- Firm: "Action Required: Invoice INV-001 Overdue"
- Urgent: "Urgent: Invoice INV-001 Payment Required Immediately"

### Body Structure

1. **Opening**: Personalized greeting based on payment history
2. **Context**: Brief mention of invoice (number, amount, days overdue)
3. **Value**: Why prompt payment matters (if appropriate for tone)
4. **Action**: Clear call-to-action with payment link
5. **Closing**: Professional sign-off with company name

### Content Rules

**DO**:
- Personalize based on customer history
- Acknowledge previous attempts if applicable
- Provide clear next steps
- Include payment link prominently
- Offer assistance ("If you have questions, please reply...")
- Be concise (max 150 words)

**DON'T**:
- Use placeholder brackets like [Name]
- Be aggressive or threatening
- Make assumptions about why payment is late
- Use generic templates without personalization
- Exceed 150 words (busy customers appreciate brevity)

## Campaign Management Rules

### Auto-Campaign Creation

**When**: Invoice becomes overdue (due_date < today)

**Actions**:
1. Group invoices by customer
2. Create campaign for each customer
3. Set status to 'active'
4. Schedule initial emails for 30 minutes later
5. Configure stages based on days overdue

### Campaign Execution

**Every Hour**:
1. Check all active campaigns
2. For each invoice in campaign:
   - Check if paid → Skip if paid
   - Check attempt count → Skip if max reached
   - Check timing → Schedule if too early
   - Determine stage → Based on days overdue and attempts
   - Generate email → With full context
   - Send email → Or schedule for later
   - Schedule next follow-up → If not at max attempts

### Campaign Pausing

**Auto-Pause When**:
- All invoices in campaign are paid
- Customer replies "will pay" or "already paid"
- Customer disputes invoice
- Max attempts reached

**Auto-Resume When**:
- Scheduled follow-up time arrives
- Customer doesn't pay after "will pay" response (7 days)

## Context Engineering

The agent receives comprehensive context including:

1. **Customer Profile**:
   - Payment behavior (excellent/good/average/slow/problematic)
   - Average days to pay
   - Total invoices, paid, outstanding
   - Email engagement rates
   - Recent payment history

2. **Invoice Status**:
   - Days overdue
   - Amount due
   - Previous email attempts
   - Last email interaction (opened/clicked)
   - Risk level

3. **Campaign Status**:
   - Current stage (reminder/follow_up/escalation/final_notice)
   - Attempt number
   - Max attempts
   - Days between emails
   - Tone escalation settings

4. **Company Context**:
   - Company name
   - Brand voice guidelines
   - Email settings

## Tool Usage

The agent has access to these tools:

1. **checkInvoicePaymentStatus** - Verify if invoice paid
2. **getCustomerPaymentHistory** - Get customer behavior data
3. **getEmailAttemptCount** - Count emails sent
4. **getLastEmailInteraction** - Get last email details
5. **sendCollectionEmail** - Send email with AI generation
6. **pauseCampaignIfPaid** - Auto-pause when paid
7. **analyzeCustomerResponse** - Analyze engagement patterns

## Error Handling

**Email Send Failures**:
- Log error
- Retry with exponential backoff (5min, 15min, 1hr)
- Max 3 retries
- Flag for review if all retries fail

**Payment Verification Failures**:
- Retry in 15 minutes
- Log error
- Continue campaign if verification fails

**AI Generation Failures**:
- Use fallback template
- Log error
- Continue with default content

## Performance Metrics

Track and optimize:
- Email open rates
- Email click rates
- Payment conversion rates
- Time to payment
- Customer satisfaction (via replies)

## Continuous Improvement

The agent learns from:
- Email engagement patterns
- Payment timing patterns
- Customer response patterns
- Tone effectiveness
- Timing effectiveness

Use this data to:
- Optimize send times
- Improve tone selection
- Better personalize content
- Predict payment likelihood

