import type { Invoice, Customer, RiskLevel } from '@/types/database'
import { differenceInDays, parseISO } from 'date-fns'

export interface RiskClassificationResult {
  riskLevel: RiskLevel
  daysOverdue: number
  riskScore: number // 0-100
  factors: string[]
}

export function classifyInvoiceRisk(
  invoice: Pick<Invoice, 'due_date' | 'amount_due' | 'status'>,
  customer?: Pick<Customer, 'payment_behavior' | 'avg_days_to_pay'>
): RiskClassificationResult {
  const now = new Date()
  const dueDate = typeof invoice.due_date === 'string' ? parseISO(invoice.due_date) : invoice.due_date
  const daysOverdue = differenceInDays(now, dueDate)
  
  const factors: string[] = []
  let riskScore = 0

  // Base risk from days overdue
  if (daysOverdue > 60) {
    riskScore += 50
    factors.push('More than 60 days overdue')
  } else if (daysOverdue > 30) {
    riskScore += 40
    factors.push('More than 30 days overdue')
  } else if (daysOverdue > 14) {
    riskScore += 30
    factors.push('More than 14 days overdue')
  } else if (daysOverdue > 7) {
    riskScore += 20
    factors.push('More than 7 days overdue')
  } else if (daysOverdue > 0) {
    riskScore += 10
    factors.push('Past due date')
  } else if (daysOverdue > -7) {
    riskScore += 5
    factors.push('Due within 7 days')
  }

  // Adjust based on customer payment behavior
  if (customer) {
    switch (customer.payment_behavior) {
      case 'problematic':
        riskScore += 25
        factors.push('Customer has problematic payment history')
        break
      case 'slow':
        riskScore += 15
        factors.push('Customer typically pays late')
        break
      case 'average':
        riskScore += 5
        factors.push('Customer has average payment history')
        break
      case 'good':
        riskScore -= 5
        break
      case 'excellent':
        riskScore -= 10
        factors.push('Customer has excellent payment history')
        break
    }

    // Adjust based on average days to pay
    if (customer.avg_days_to_pay) {
      if (customer.avg_days_to_pay > 45) {
        riskScore += 10
        factors.push(`Average payment time: ${customer.avg_days_to_pay} days`)
      } else if (customer.avg_days_to_pay > 30) {
        riskScore += 5
      }
    }
  }

  // Adjust based on invoice amount (larger = more important to track)
  if (invoice.amount_due > 10000) {
    riskScore += 5
    factors.push('High value invoice')
  } else if (invoice.amount_due > 5000) {
    riskScore += 3
  }

  // Clamp score
  riskScore = Math.max(0, Math.min(100, riskScore))

  // Determine risk level
  let riskLevel: RiskLevel
  if (daysOverdue > 30) {
    riskLevel = 'critical'
  } else if (daysOverdue > 0) {
    riskLevel = 'overdue'
  } else if (riskScore >= 30 || (daysOverdue > -7 && customer?.payment_behavior === 'problematic')) {
    riskLevel = 'at_risk'
  } else {
    riskLevel = 'low'
  }

  return {
    riskLevel,
    daysOverdue,
    riskScore,
    factors: factors.length > 0 ? factors : ['No significant risk factors'],
  }
}

export interface SweepSummary {
  totalInvoices: number
  totalAmount: number
  totalAmountDue: number
  
  // By risk level
  lowRisk: { count: number; amount: number }
  atRisk: { count: number; amount: number }
  overdue: { count: number; amount: number }
  critical: { count: number; amount: number }
  
  // Cash at risk (overdue + at_risk + critical)
  cashAtRisk: number
  cashAtRiskPercentage: number
  
  // Top offenders
  topOverdueCustomers: {
    customerId: string
    customerName: string
    totalDue: number
    invoiceCount: number
  }[]
}

export function calculateSweepSummary(
  invoices: (Invoice & { customer?: Pick<Customer, 'name'> })[]
): SweepSummary {
  const summary: SweepSummary = {
    totalInvoices: invoices.length,
    totalAmount: 0,
    totalAmountDue: 0,
    lowRisk: { count: 0, amount: 0 },
    atRisk: { count: 0, amount: 0 },
    overdue: { count: 0, amount: 0 },
    critical: { count: 0, amount: 0 },
    cashAtRisk: 0,
    cashAtRiskPercentage: 0,
    topOverdueCustomers: [],
  }

  const customerTotals: Record<string, { name: string; total: number; count: number }> = {}

  for (const invoice of invoices) {
    summary.totalAmount += invoice.amount
    summary.totalAmountDue += invoice.amount_due

    // Count by risk level
    switch (invoice.risk_level) {
      case 'low':
        summary.lowRisk.count++
        summary.lowRisk.amount += invoice.amount_due
        break
      case 'at_risk':
        summary.atRisk.count++
        summary.atRisk.amount += invoice.amount_due
        break
      case 'overdue':
        summary.overdue.count++
        summary.overdue.amount += invoice.amount_due
        break
      case 'critical':
        summary.critical.count++
        summary.critical.amount += invoice.amount_due
        break
    }

    // Track customer totals for overdue invoices
    if (invoice.risk_level !== 'low' && invoice.amount_due > 0) {
      if (!customerTotals[invoice.customer_id]) {
        customerTotals[invoice.customer_id] = {
          name: invoice.customer?.name || 'Unknown',
          total: 0,
          count: 0,
        }
      }
      customerTotals[invoice.customer_id].total += invoice.amount_due
      customerTotals[invoice.customer_id].count++
    }
  }

  // Calculate cash at risk
  summary.cashAtRisk = summary.atRisk.amount + summary.overdue.amount + summary.critical.amount
  summary.cashAtRiskPercentage = summary.totalAmountDue > 0
    ? (summary.cashAtRisk / summary.totalAmountDue) * 100
    : 0

  // Get top overdue customers
  summary.topOverdueCustomers = Object.entries(customerTotals)
    .map(([customerId, data]) => ({
      customerId,
      customerName: data.name,
      totalDue: data.total,
      invoiceCount: data.count,
    }))
    .sort((a, b) => b.totalDue - a.totalDue)
    .slice(0, 5)

  return summary
}

export function determinePaymentBehavior(
  invoiceHistory: { dueDate: string; paidDate: string | null }[]
): { behavior: 'excellent' | 'good' | 'average' | 'slow' | 'problematic'; avgDays: number } {
  if (invoiceHistory.length === 0) {
    return { behavior: 'average', avgDays: 0 }
  }

  const paidInvoices = invoiceHistory.filter(inv => inv.paidDate)
  if (paidInvoices.length === 0) {
    return { behavior: 'problematic', avgDays: 0 }
  }

  const daysToPayList = paidInvoices.map(inv => {
    const due = parseISO(inv.dueDate)
    const paid = parseISO(inv.paidDate!)
    return differenceInDays(paid, due)
  })

  const avgDays = daysToPayList.reduce((a, b) => a + b, 0) / daysToPayList.length
  const onTimeRate = daysToPayList.filter(d => d <= 0).length / daysToPayList.length

  let behavior: 'excellent' | 'good' | 'average' | 'slow' | 'problematic'
  
  if (onTimeRate >= 0.9 && avgDays <= 0) {
    behavior = 'excellent'
  } else if (onTimeRate >= 0.7 && avgDays <= 7) {
    behavior = 'good'
  } else if (avgDays <= 14) {
    behavior = 'average'
  } else if (avgDays <= 30) {
    behavior = 'slow'
  } else {
    behavior = 'problematic'
  }

  return { behavior, avgDays: Math.round(avgDays) }
}

