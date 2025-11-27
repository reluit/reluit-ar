/**
 * AI Agent Context Engineering
 * Comprehensive context and instructions for effective campaign management
 */

export interface CustomerContext {
  paymentBehavior: 'excellent' | 'good' | 'average' | 'slow' | 'problematic'
  avgDaysToPay: number | null
  totalInvoices: number
  totalPaid: number
  totalOutstanding: number
  recentPayments: Array<{ amount: number; received_at: string }>
  emailEngagement: {
    openRate: number
    clickRate: number
    isEngaged: boolean
    isActive: boolean
  }
}

export interface InvoiceContext {
  daysOverdue: number
  amountDue: number
  previousAttempts: number
  lastEmailInteraction: {
    wasOpened: boolean
    wasClicked: boolean
    daysSinceLastEmail: number
  }
  riskLevel: 'low' | 'at_risk' | 'overdue' | 'critical'
}

export interface CampaignContext {
  stage: 'reminder' | 'follow_up' | 'escalation' | 'final_notice'
  attemptNumber: number
  maxAttempts: number
  daysBetweenEmails: number
  escalateTone: boolean
}

/**
 * Get comprehensive context for AI decision-making
 */
export function buildAgentContext(params: {
  customer: CustomerContext
  invoice: InvoiceContext
  campaign: CampaignContext
  brandVoice?: string
  companyName: string
}): string {
  const { customer, invoice, campaign, brandVoice, companyName } = params

  return `
# AI Agent Context for Collection Campaign Management

## Customer Profile
- Payment Behavior: ${customer.paymentBehavior}
- Average Days to Pay: ${customer.avgDaysToPay || 'Unknown'}
- Total Invoices: ${customer.totalInvoices}
- Total Paid: $${customer.totalPaid.toLocaleString()}
- Total Outstanding: $${customer.totalOutstanding.toLocaleString()}
- Email Engagement Rate: ${customer.emailEngagement.openRate.toFixed(1)}% opens, ${customer.emailEngagement.clickRate.toFixed(1)}% clicks
- Engagement Status: ${customer.emailEngagement.isEngaged ? 'Engaged' : 'Not Engaged'}, ${customer.emailEngagement.isActive ? 'Active' : 'Inactive'}

## Invoice Status
- Days Overdue: ${invoice.daysOverdue} days
- Amount Due: $${invoice.amountDue.toLocaleString()}
- Risk Level: ${invoice.riskLevel}
- Previous Email Attempts: ${invoice.previousAttempts}
- Last Email: ${invoice.lastEmailInteraction.wasOpened ? 'Opened' : 'Not Opened'}, ${invoice.lastEmailInteraction.wasClicked ? 'Clicked' : 'Not Clicked'}
- Days Since Last Email: ${invoice.lastEmailInteraction.daysSinceLastEmail}

## Campaign Status
- Current Stage: ${campaign.stage}
- Attempt Number: ${campaign.attemptNumber} of ${campaign.maxAttempts}
- Days Between Emails: ${campaign.daysBetweenEmails}
- Tone Escalation: ${campaign.escalateTone ? 'Enabled' : 'Disabled'}

## Company Context
- Company Name: ${companyName}
${brandVoice ? `- Brand Voice: ${brandVoice}` : ''}

## Decision Guidelines

### Tone Selection
${getToneGuidelines(customer, invoice, campaign)}

### Timing Decisions
${getTimingGuidelines(invoice, campaign)}

### Content Strategy
${getContentStrategy(customer, invoice, campaign)}

### Escalation Criteria
${getEscalationCriteria(invoice, campaign)}

### Response Handling
${getResponseHandlingGuidelines(customer)}
`
}

/**
 * Tone selection guidelines based on context
 */
function getToneGuidelines(
  customer: CustomerContext,
  invoice: InvoiceContext,
  campaign: CampaignContext
): string {
  const guidelines = []

  // Customer behavior-based tone
  if (customer.paymentBehavior === 'excellent' || customer.paymentBehavior === 'good') {
    guidelines.push('- Use FRIENDLY tone for excellent/good payers - maintain relationship')
    guidelines.push('- Emphasize that this is unusual and you value their business')
    guidelines.push('- Assume it\'s an oversight or temporary issue')
  } else if (customer.paymentBehavior === 'problematic') {
    guidelines.push('- Use FIRM or URGENT tone for problematic payers')
    guidelines.push('- Be direct about consequences and expectations')
    guidelines.push('- Less relationship-focused, more business-focused')
  } else {
    guidelines.push('- Use PROFESSIONAL tone for average payers')
    guidelines.push('- Balance relationship and urgency')
  }

  // Days overdue-based tone
  if (invoice.daysOverdue >= 30) {
    guidelines.push('- Use URGENT tone for invoices 30+ days overdue')
    guidelines.push('- Emphasize immediate action required')
  } else if (invoice.daysOverdue >= 14) {
    guidelines.push('- Use FIRM tone for invoices 14+ days overdue')
    guidelines.push('- Increase urgency while remaining professional')
  }

  // Attempt-based tone escalation
  if (campaign.attemptNumber >= 3) {
    guidelines.push('- Use URGENT tone after 3+ attempts')
    guidelines.push('- Mention potential consequences (collections, account hold, etc.)')
  } else if (campaign.attemptNumber >= 2) {
    guidelines.push('- Escalate to FIRM tone after 2+ attempts')
    guidelines.push('- Increase urgency and clarity')
  }

  // Engagement-based tone
  if (customer.emailEngagement.isActive && invoice.lastEmailInteraction.wasClicked) {
    guidelines.push('- Customer is engaged - use PROFESSIONAL tone')
    guidelines.push('- Acknowledge their engagement and provide clear next steps')
  } else if (!invoice.lastEmailInteraction.wasOpened && invoice.previousAttempts >= 2) {
    guidelines.push('- Customer not opening emails - consider URGENT tone')
    guidelines.push('- May need alternative contact method')
  }

  return guidelines.join('\n')
}

/**
 * Timing decision guidelines
 */
function getTimingGuidelines(invoice: InvoiceContext, campaign: CampaignContext): string {
  const guidelines = []

  // Respect days between emails
  if (invoice.lastEmailInteraction.daysSinceLastEmail < campaign.daysBetweenEmails) {
    const daysRemaining = campaign.daysBetweenEmails - invoice.lastEmailInteraction.daysSinceLastEmail
    guidelines.push(`- Too early to send - wait ${daysRemaining} more days`)
    guidelines.push(`- Schedule follow-up for ${daysRemaining} days from now`)
  } else {
    guidelines.push('- Timing is appropriate - proceed with email')
  }

  // Urgency-based timing
  if (invoice.daysOverdue >= 30) {
    guidelines.push('- High urgency - send immediately if timing allows')
  } else if (invoice.daysOverdue >= 14) {
    guidelines.push('- Moderate urgency - send within 24 hours')
  }

  // Engagement-based timing
  if (invoice.lastEmailInteraction.wasClicked) {
    guidelines.push('- Customer clicked last email - wait 2-3 days before follow-up')
    guidelines.push('- They may be processing payment')
  } else if (invoice.lastEmailInteraction.wasOpened && !invoice.lastEmailInteraction.wasClicked) {
    guidelines.push('- Customer opened but didn\'t click - follow up in 3-5 days')
  } else if (!invoice.lastEmailInteraction.wasOpened && invoice.previousAttempts >= 2) {
    guidelines.push('- Customer not opening emails - consider shorter intervals (2-3 days)')
  }

  // Optimal send times (FDCPA compliant: 8 AM - 9 PM)
  guidelines.push('- FDCPA Requirement: Emails must be sent between 8 AM and 9 PM in consumer timezone')
  guidelines.push('- Best send times: Tuesday-Thursday, 10 AM - 2 PM (customer timezone)')
  guidelines.push('- Avoid: Monday mornings, Friday afternoons, weekends, before 8 AM, after 9 PM')

  return guidelines.join('\n')
}

/**
 * Content strategy guidelines
 */
function getContentStrategy(
  customer: CustomerContext,
  invoice: InvoiceContext,
  campaign: CampaignContext
): string {
  const strategies = []

  // Personalization
  if (customer.paymentBehavior === 'excellent') {
    strategies.push('- Personalize: "We noticed this is unusual for you..."')
    strategies.push('- Emphasize: Relationship and quick resolution')
  } else if (customer.paymentBehavior === 'problematic') {
    strategies.push('- Personalize: Reference payment history')
    strategies.push('- Emphasize: Consequences and clear expectations')
  }

  // Amount-based strategy
  if (invoice.amountDue >= 10000) {
    strategies.push('- Large amount: Offer payment plan options')
    strategies.push('- Emphasize: Willingness to work with them')
  } else if (invoice.amountDue < 100) {
    strategies.push('- Small amount: Quick resolution focus')
    strategies.push('- Emphasize: Simple payment process')
  }

  // Stage-based content
  if (campaign.stage === 'reminder') {
    strategies.push('- Reminder stage: Friendly, assume oversight')
    strategies.push('- Include: Clear payment instructions and link')
  } else if (campaign.stage === 'follow_up') {
    strategies.push('- Follow-up stage: Professional, acknowledge previous contact')
    strategies.push('- Include: Updated balance and payment options')
  } else if (campaign.stage === 'escalation') {
    strategies.push('- Escalation stage: Firm, clear about consequences')
    strategies.push('- Include: Payment deadline and next steps')
  } else if (campaign.stage === 'final_notice') {
    strategies.push('- Final notice: Urgent, last chance messaging')
    strategies.push('- Include: Consequences (collections, account hold, etc.)')
  }

  // Engagement-based content
  if (invoice.lastEmailInteraction.wasClicked) {
    strategies.push('- Customer clicked: Acknowledge their interest')
    strategies.push('- Include: "We noticed you viewed the payment link..."')
  } else if (invoice.lastEmailInteraction.wasOpened) {
    strategies.push('- Customer opened: Reference their engagement')
    strategies.push('- Include: "Following up on our previous email..."')
  }

  // Attempt-based content
  if (campaign.attemptNumber === 1) {
    strategies.push('- First attempt: Friendly reminder, assume oversight')
  } else if (campaign.attemptNumber === 2) {
    strategies.push('- Second attempt: Professional follow-up, acknowledge previous contact')
  } else if (campaign.attemptNumber >= 3) {
    strategies.push('- Multiple attempts: Escalate urgency, mention previous attempts')
    strategies.push('- Include: "This is our [X] attempt to contact you..."')
  }

  return strategies.join('\n')
}

/**
 * Escalation criteria
 */
function getEscalationCriteria(invoice: InvoiceContext, campaign: CampaignContext): string {
  const criteria = []

  criteria.push('## When to Escalate:')
  criteria.push('')
  criteria.push('1. Days Overdue:')
  criteria.push('   - 0-7 days: Friendly reminder')
  criteria.push('   - 8-14 days: Professional follow-up')
  criteria.push('   - 15-30 days: Firm escalation')
  criteria.push('   - 30+ days: Urgent final notice')
  criteria.push('')
  criteria.push('2. Attempt Count:')
  criteria.push('   - 1st attempt: Friendly')
  criteria.push('   - 2nd attempt: Professional')
  criteria.push('   - 3rd attempt: Firm')
  criteria.push('   - 4th+ attempt: Urgent')
  criteria.push('')
  criteria.push('3. Engagement:')
  criteria.push('   - No opens after 2 attempts: Escalate tone')
  criteria.push('   - Opens but no clicks: Increase urgency')
  criteria.push('   - Clicks but no payment: Offer assistance')
  criteria.push('')
  criteria.push('4. Payment Behavior:')
  criteria.push('   - Excellent/Good: Stay friendly longer')
  criteria.push('   - Average: Escalate after 2 attempts')
  criteria.push('   - Slow/Problematic: Escalate faster')

  return criteria.join('\n')
}

/**
 * Response handling guidelines
 */
function getResponseHandlingGuidelines(customer: CustomerContext): string {
  const guidelines = []

  guidelines.push('## Customer Reply Handling:')
  guidelines.push('')
  guidelines.push('1. "Will Pay" / "Payment Coming":')
  guidelines.push('   - Pause campaign for 7 days')
  guidelines.push('   - Schedule payment check in 7 days')
  guidelines.push('   - Send acknowledgment email')
  guidelines.push('')
  guidelines.push('2. "Already Paid":')
  guidelines.push('   - Verify payment immediately')
  guidelines.push('   - If verified: Pause campaign, send confirmation')
  guidelines.push('   - If not verified: Request payment details')
  guidelines.push('')
  guidelines.push('3. "Need More Time":')
  guidelines.push('   - Offer payment plan if amount > $1000')
  guidelines.push('   - Extend deadline by 7-14 days')
  guidelines.push('   - Schedule follow-up for new deadline')
  guidelines.push('')
  guidelines.push('4. "Dispute" / "Incorrect Amount":')
  guidelines.push('   - Flag for human review immediately')
  guidelines.push('   - Pause campaign')
  guidelines.push('   - Request details')
  guidelines.push('')
  guidelines.push('5. "Financial Hardship":')
  guidelines.push('   - Offer payment plan')
  guidelines.push('   - Extend deadline')
  guidelines.push('   - Flag for human review')
  guidelines.push('')
  guidelines.push('6. No Response After Multiple Attempts:')
  guidelines.push('   - Consider alternative contact (phone, SMS)')
  guidelines.push('   - Escalate to collections if 60+ days overdue')
  guidelines.push('   - Flag for account review')

  return guidelines.join('\n')
}

/**
 * Get optimal tone based on all context
 */
export function determineOptimalTone(params: {
  customer: CustomerContext
  invoice: InvoiceContext
  campaign: CampaignContext
}): 'friendly' | 'professional' | 'firm' | 'urgent' {
  const { customer, invoice, campaign } = params

  // Critical: 30+ days overdue or 4+ attempts
  if (invoice.daysOverdue >= 30 || campaign.attemptNumber >= 4) {
    return 'urgent'
  }

  // High urgency: 14+ days overdue or 3+ attempts
  if (invoice.daysOverdue >= 14 || campaign.attemptNumber >= 3) {
    return 'firm'
  }

  // Excellent payers: Stay friendly longer
  if (customer.paymentBehavior === 'excellent' || customer.paymentBehavior === 'good') {
    if (campaign.attemptNumber <= 2 && invoice.daysOverdue < 14) {
      return 'friendly'
    }
    return 'professional'
  }

  // Problematic payers: Escalate faster
  if (customer.paymentBehavior === 'problematic') {
    if (campaign.attemptNumber >= 2 || invoice.daysOverdue >= 7) {
      return 'firm'
    }
  }

  // Default: Professional
  return 'professional'
}

/**
 * Get optimal timing for next email
 */
export function determineOptimalTiming(params: {
  invoice: InvoiceContext
  campaign: CampaignContext
  customer: CustomerContext
}): { shouldSendNow: boolean; scheduleFor?: Date; reason: string } {
  const { invoice, campaign, customer } = params

  const daysSinceLastEmail = invoice.lastEmailInteraction.daysSinceLastEmail

  // Too early - schedule for later
  if (daysSinceLastEmail < campaign.daysBetweenEmails) {
    const scheduleFor = new Date()
    scheduleFor.setDate(scheduleFor.getDate() + (campaign.daysBetweenEmails - daysSinceLastEmail))
    scheduleFor.setHours(10, 0, 0, 0) // 10 AM

    return {
      shouldSendNow: false,
      scheduleFor,
      reason: `Too early - wait ${campaign.daysBetweenEmails - daysSinceLastEmail} more days`,
    }
  }

  // Customer clicked - wait a bit longer
  if (invoice.lastEmailInteraction.wasClicked) {
    const scheduleFor = new Date()
    scheduleFor.setDate(scheduleFor.getDate() + 2)
    scheduleFor.setHours(10, 0, 0, 0)

    return {
      shouldSendNow: false,
      scheduleFor,
      reason: 'Customer clicked last email - wait 2 days for payment processing',
    }
  }

  // High urgency - send now (if FDCPA compliant time)
  if (invoice.daysOverdue >= 30) {
    const timezone = 'America/New_York' // Default, should come from org settings
    if (isCompliantTime(new Date(), timezone)) {
      return {
        shouldSendNow: true,
        reason: 'High urgency - 30+ days overdue',
      }
    } else {
      const nextTime = getNextCompliantTime(timezone)
      return {
        shouldSendNow: false,
        scheduleFor: nextTime,
        reason: 'High urgency but outside FDCPA compliant hours - scheduled for next compliant time',
      }
    }
  }

  // Normal timing - send now (if FDCPA compliant)
  if (daysSinceLastEmail >= campaign.daysBetweenEmails) {
    const timezone = 'America/New_York' // Default, should come from org settings
    if (isCompliantTime(new Date(), timezone)) {
      return {
        shouldSendNow: true,
        reason: 'Timing appropriate - enough days have passed',
      }
    } else {
      const nextTime = getNextCompliantTime(timezone)
      return {
        shouldSendNow: false,
        scheduleFor: nextTime,
        reason: 'FDCPA time restriction - scheduled for next compliant time',
      }
    }
  }

  // Default: schedule for optimal time (FDCPA compliant)
  const timezone = 'America/New_York' // Default, should come from org settings
  const scheduleFor = getNextCompliantTime(timezone)
  // Also respect daysBetweenEmails
  if (daysSinceLastEmail < campaign.daysBetweenEmails) {
    scheduleFor.setDate(scheduleFor.getDate() + (campaign.daysBetweenEmails - daysSinceLastEmail))
  }

  return {
    shouldSendNow: false,
    scheduleFor,
    reason: 'Schedule for optimal timing (FDCPA compliant)',
  }
}

/**
 * Get content personalization hints
 */
export function getPersonalizationHints(params: {
  customer: CustomerContext
  invoice: InvoiceContext
  campaign: CampaignContext
}): string[] {
  const { customer, invoice, campaign } = params
  const hints = []

  // Customer behavior hints
  if (customer.paymentBehavior === 'excellent') {
    hints.push('Mention: "This is unusual for you"')
    hints.push('Emphasize: Relationship and quick resolution')
  } else if (customer.paymentBehavior === 'problematic') {
    hints.push('Reference: Payment history')
    hints.push('Emphasize: Consequences')
  }

  // Engagement hints
  if (invoice.lastEmailInteraction.wasClicked) {
    hints.push('Acknowledge: "We noticed you viewed the payment link"')
  } else if (invoice.lastEmailInteraction.wasOpened) {
    hints.push('Reference: "Following up on our previous email"')
  } else if (invoice.previousAttempts >= 2) {
    hints.push('Mention: "This is our [X] attempt to contact you"')
  }

  // Amount hints
  if (invoice.amountDue >= 10000) {
    hints.push('Offer: Payment plan options')
  } else if (invoice.amountDue < 100) {
    hints.push('Emphasize: Quick and easy payment')
  }

  // Days overdue hints
  if (invoice.daysOverdue >= 30) {
    hints.push('Mention: Consequences (collections, account hold)')
  } else if (invoice.daysOverdue >= 14) {
    hints.push('Emphasize: Payment deadline')
  }

  return hints
}

/**
 * Get escalation recommendations
 */
export function getEscalationRecommendation(params: {
  customer: CustomerContext
  invoice: InvoiceContext
  campaign: CampaignContext
}): {
  shouldEscalate: boolean
  newTone?: 'friendly' | 'professional' | 'firm' | 'urgent'
  reason: string
  actions: string[]
} {
  const { customer, invoice, campaign } = params

  // Already at max attempts
  if (campaign.attemptNumber >= campaign.maxAttempts) {
    return {
      shouldEscalate: false,
      reason: 'Max attempts reached',
      actions: ['Pause campaign', 'Flag for human review', 'Consider alternative contact methods'],
    }
  }

  // Critical escalation needed
  if (invoice.daysOverdue >= 30 && campaign.attemptNumber >= 3) {
    return {
      shouldEscalate: true,
      newTone: 'urgent',
      reason: '30+ days overdue with 3+ attempts',
      actions: ['Escalate to urgent tone', 'Mention consequences', 'Set final deadline'],
    }
  }

  // Moderate escalation
  if (invoice.daysOverdue >= 14 && campaign.attemptNumber >= 2) {
    return {
      shouldEscalate: true,
      newTone: 'firm',
      reason: '14+ days overdue with 2+ attempts',
      actions: ['Escalate to firm tone', 'Increase urgency', 'Set clear deadline'],
    }
  }

  // Engagement-based escalation
  if (!invoice.lastEmailInteraction.wasOpened && invoice.previousAttempts >= 2) {
    return {
      shouldEscalate: true,
      newTone: 'firm',
      reason: 'Customer not opening emails after 2+ attempts',
      actions: ['Try different subject line', 'Consider alternative contact', 'Escalate tone'],
    }
  }

  return {
    shouldEscalate: false,
    reason: 'No escalation needed at this time',
    actions: ['Continue with current tone', 'Monitor engagement'],
  }
}

