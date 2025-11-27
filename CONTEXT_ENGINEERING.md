# Context Engineering for AI Agent

This document explains the comprehensive context engineering system that enables the AI agent to effectively manage collection campaigns.

## Overview

The AI agent receives rich, contextual information to make intelligent decisions about:
- What tone to use
- When to send emails
- What content to include
- How to escalate
- How to handle responses

## Context Sources

### 1. Customer Context

**Payment Behavior**:
- `excellent` - Always pays on time
- `good` - Usually pays on time
- `average` - Mixed payment history
- `slow` - Often pays late
- `problematic` - Frequently late or disputes

**Payment Metrics**:
- Average days to pay
- Total invoices
- Total paid vs outstanding
- Recent payment history

**Email Engagement**:
- Open rate percentage
- Click rate percentage
- Engagement status (engaged/not engaged)
- Activity status (active/inactive)

### 2. Invoice Context

**Status Information**:
- Days overdue
- Amount due
- Risk level (low/at_risk/overdue/critical)
- Previous email attempts

**Email Interaction**:
- Last email opened?
- Last email clicked?
- Days since last email
- Email engagement pattern

### 3. Campaign Context

**Stage Information**:
- Current stage (reminder/follow_up/escalation/final_notice)
- Attempt number
- Max attempts allowed
- Days between emails setting
- Tone escalation enabled

### 4. Company Context

**Branding**:
- Company name
- Brand voice guidelines
- Email settings
- Customization preferences

## Context Engineering Functions

### `buildAgentContext()`

Builds comprehensive context string for AI decision-making.

**Input**: Customer, invoice, campaign, company data
**Output**: Formatted context string with all relevant information

**Includes**:
- Customer profile summary
- Invoice status summary
- Campaign status summary
- Decision guidelines
- Tone selection rules
- Timing decisions
- Content strategy
- Escalation criteria
- Response handling

### `determineOptimalTone()`

Intelligently determines the best tone based on all context.

**Factors Considered**:
1. Customer payment behavior
2. Days overdue
3. Number of attempts
4. Email engagement
5. Risk level

**Output**: `friendly` | `professional` | `firm` | `urgent`

### `determineOptimalTiming()`

Decides when to send the next email.

**Factors Considered**:
1. Days since last email
2. Campaign `daysBetweenEmails` setting
3. Customer engagement (clicked/opened)
4. Urgency level
5. Optimal send times (Tuesday-Thursday, 10 AM - 2 PM)

**Output**: 
- `shouldSendNow`: boolean
- `scheduleFor`: Date (if scheduling)
- `reason`: string explanation

### `getPersonalizationHints()`

Provides hints for personalizing email content.

**Hints Include**:
- Customer behavior-based phrases
- Engagement acknowledgments
- Amount-based offers
- Days overdue mentions

**Output**: Array of personalization hints

### `getEscalationRecommendation()`

Recommends when and how to escalate.

**Considers**:
- Days overdue thresholds
- Attempt count thresholds
- Engagement patterns
- Payment behavior

**Output**:
- `shouldEscalate`: boolean
- `newTone`: Recommended tone
- `reason`: Why escalation needed
- `actions`: What to do

## Context Flow

```
1. Campaign Execution Triggered
   ↓
2. Load Customer Data
   - Payment history
   - Email engagement
   - Recent payments
   ↓
3. Load Invoice Data
   - Status
   - Previous attempts
   - Last email interaction
   ↓
4. Build Comprehensive Context
   - Customer context
   - Invoice context
   - Campaign context
   - Company context
   ↓
5. Make Decisions
   - Determine optimal tone
   - Determine optimal timing
   - Get personalization hints
   - Get escalation recommendations
   ↓
6. Generate Email
   - Use all context in prompt
   - Include personalization hints
   - Apply escalation recommendations
   ↓
7. Execute or Schedule
   - Send now if timing optimal
   - Schedule if too early
   ↓
8. Schedule Next Follow-up
   - Based on campaign schedule
   - Using optimal timing
```

## Context in Email Generation

The AI receives this context in the email generation prompt:

1. **Core Context**: Customer, invoice, campaign details
2. **Context String**: Comprehensive formatted context
3. **Personalization Hints**: Specific hints for content
4. **Escalation Recommendation**: When/how to escalate

This ensures:
- Personalized content
- Appropriate tone
- Relevant messaging
- Proper escalation
- Clear call-to-action

## Decision-Making Examples

### Example 1: Excellent Payer, First Attempt

**Context**:
- Payment behavior: excellent
- Days overdue: 5
- Attempts: 0
- Engagement: N/A

**Decisions**:
- Tone: `friendly`
- Timing: Send now
- Content: "We noticed this is unusual for you..."
- Escalation: None needed

### Example 2: Problematic Payer, Third Attempt

**Context**:
- Payment behavior: problematic
- Days overdue: 20
- Attempts: 2
- Engagement: Not opening emails

**Decisions**:
- Tone: `firm`
- Timing: Send now
- Content: Reference payment history, mention consequences
- Escalation: Escalate to firm tone, try different subject

### Example 3: Average Payer, Customer Clicked

**Context**:
- Payment behavior: average
- Days overdue: 10
- Attempts: 1
- Engagement: Clicked last email

**Decisions**:
- Tone: `professional`
- Timing: Wait 2-3 days (customer processing payment)
- Content: "We noticed you viewed the payment link..."
- Escalation: None, wait for payment

## Benefits of Context Engineering

1. **Intelligent Decisions**: Agent makes smart choices based on full context
2. **Personalization**: Every email is personalized to the customer
3. **Optimal Timing**: Emails sent at the right time
4. **Appropriate Escalation**: Escalates when needed, not too early/late
5. **Relationship Preservation**: Maintains relationships while collecting
6. **Higher Conversion**: Better emails = more payments

## Continuous Improvement

The context system learns from:
- Email engagement patterns
- Payment timing patterns
- Customer response patterns
- Tone effectiveness
- Timing effectiveness

This data is used to:
- Refine tone selection
- Optimize timing decisions
- Improve personalization
- Better predict outcomes

