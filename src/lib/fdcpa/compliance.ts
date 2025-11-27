/**
 * FDCPA Compliance Utilities
 * Fair Debt Collection Practices Act compliance functions
 */

export interface FDCPAComplianceData {
  isFirstContact: boolean
  creditorName: string
  debtAmount: number
  currency: string
  invoiceNumber: string
  orgName: string
  orgAddress?: string
  orgPhone?: string
  consumerEmail: string
  consumerName: string
}

/**
 * Generate FDCPA Mini-Miranda disclosure
 * Required in all collection communications
 */
export function getMiniMirandaDisclosure(): string {
  return 'This is an attempt to collect a debt and any information obtained will be used for that purpose.'
}

/**
 * Generate FDCPA Validation Notice
 * Required within 5 days of initial communication
 */
export function getValidationNotice(data: FDCPAComplianceData): string {
  return `NOTICE: You have 30 days to dispute this debt. If you do not dispute it within 30 days, we will assume it is valid.

If you dispute this debt, we will obtain verification of the debt and mail you a copy. If you request it in writing within 30 days, we will provide you with the name and address of the original creditor.

This communication is from a debt collector.`
}

/**
 * Generate FDCPA-compliant email footer
 */
export function getFDCPAFooter(data: FDCPAComplianceData): string {
  const lines = [
    '---',
    getMiniMirandaDisclosure(),
    '',
    'You have the right to request that we stop contacting you about this debt. To do so, please reply to this email with "STOP" or contact us at the information below.',
    '',
    `Creditor: ${data.creditorName}`,
    `Debt Amount: ${data.currency} ${data.debtAmount.toFixed(2)}`,
    `Invoice Number: ${data.invoiceNumber}`,
  ]

  if (data.orgAddress) {
    lines.push(`Address: ${data.orgAddress}`)
  }
  if (data.orgPhone) {
    lines.push(`Phone: ${data.orgPhone}`)
  }

  lines.push('', 'This communication is from a debt collector.')

  return lines.join('\n')
}

/**
 * Check if communication time is FDCPA compliant
 * Must be between 8 AM and 9 PM in consumer's timezone
 */
export function isCompliantTime(date: Date, timezone: string = 'America/New_York'): boolean {
  // Convert to consumer's timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  })

  const hour = parseInt(formatter.format(date))
  return hour >= 8 && hour < 21 // 8 AM to 8:59 PM
}

/**
 * Get next compliant send time
 * Returns next available time between 8 AM and 9 PM
 */
export function getNextCompliantTime(timezone: string = 'America/New_York'): Date {
  const now = new Date()
  const nextTime = new Date(now)

  // Get current hour in consumer timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  })

  const currentHour = parseInt(formatter.format(now))

  if (currentHour < 8) {
    // Before 8 AM - schedule for 8 AM today
    nextTime.setHours(8, 0, 0, 0)
  } else if (currentHour >= 21) {
    // After 9 PM - schedule for 8 AM tomorrow
    nextTime.setDate(nextTime.getDate() + 1)
    nextTime.setHours(8, 0, 0, 0)
  } else {
    // Within compliant hours - can send now or schedule for optimal time (10 AM - 2 PM)
    if (currentHour < 10) {
      nextTime.setHours(10, 0, 0, 0)
    } else if (currentHour >= 14) {
      // After 2 PM, schedule for tomorrow 10 AM
      nextTime.setDate(nextTime.getDate() + 1)
      nextTime.setHours(10, 0, 0, 0)
    } else {
      // Between 10 AM and 2 PM - can send now
      return now
    }
  }

  return nextTime
}

/**
 * Generate FDCPA-compliant email body with required disclosures
 */
export function addFDCPADisclosures(
  emailBody: string,
  data: FDCPAComplianceData,
  includeValidationNotice: boolean = false
): string {
  let compliantBody = emailBody

  // Add validation notice if first contact
  if (includeValidationNotice || data.isFirstContact) {
    compliantBody += '\n\n' + getValidationNotice(data)
  }

  // Always add footer with Mini-Miranda
  compliantBody += '\n\n' + getFDCPAFooter(data)

  return compliantBody
}

/**
 * Check if email content is FDCPA compliant
 */
export function validateFDCPACompliance(emailBody: string): {
  compliant: boolean
  issues: string[]
} {
  const issues: string[] = []

  // Check for Mini-Miranda
  const hasMiniMiranda = emailBody.toLowerCase().includes('attempt to collect a debt')
  if (!hasMiniMiranda) {
    issues.push('Missing Mini-Miranda disclosure')
  }

  // Check for prohibited language
  const prohibitedPhrases = [
    'threaten',
    'arrest',
    'jail',
    'lawsuit',
    'garnish',
    'seize',
    'criminal',
  ]

  const lowerBody = emailBody.toLowerCase()
  for (const phrase of prohibitedPhrases) {
    if (lowerBody.includes(phrase)) {
      issues.push(`Potentially prohibited language: "${phrase}"`)
    }
  }

  return {
    compliant: issues.length === 0,
    issues,
  }
}

