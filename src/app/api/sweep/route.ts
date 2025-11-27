import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { runCollectionsSweep, syncSingleIntegration } from '@/lib/collections/sweep'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (orgError || !org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const body = await request.json().catch(() => ({}))
    const { provider, integrationId } = body

    let result

    if (integrationId) {
      // Sync single integration
      result = await syncSingleIntegration(org.id, integrationId)
    } else if (provider) {
      // Get integration by provider
      const { data: integration } = await supabase
        .from('integrations')
        .select('id')
        .eq('org_id', org.id)
        .eq('provider', provider)
        .single()

      if (integration) {
        result = await syncSingleIntegration(org.id, integration.id)
      } else {
        return NextResponse.json({ error: 'Integration not found' }, { status: 404 })
      }
    } else {
      // Run full sweep
      result = await runCollectionsSweep(org.id)
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Sweep error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (orgError || !org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Get all unpaid invoices
    const { data: invoices } = await supabase
      .from('invoices')
      .select(`
        *,
        customer:customers(id, name, email)
      `)
      .eq('org_id', org.id)
      .neq('status', 'paid')
      .neq('status', 'cancelled')
      .neq('status', 'void')

    if (!invoices || invoices.length === 0) {
      return NextResponse.json({ 
        totalOverdue: 0,
        totalOverdueAmount: 0,
        overdueInvoices: [],
        agingBreakdown: {
          days1to7: { count: 0, amount: 0 },
          days8to14: { count: 0, amount: 0 },
          days15to30: { count: 0, amount: 0 },
          days31to60: { count: 0, amount: 0 },
          days60plus: { count: 0, amount: 0 },
        },
        topOverdueCustomers: [],
        averageDaysOverdue: 0,
        oldestOverdue: null,
      })
    }

    const now = new Date()

    // Filter to only overdue invoices (past due date)
    const overdueInvoices = invoices.filter(inv => {
      const dueDate = new Date(inv.due_date)
      return dueDate < now
    })

    // Calculate days overdue for each invoice
    const invoicesWithDaysOverdue = overdueInvoices.map(inv => {
      const dueDate = new Date(inv.due_date)
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
      return { ...inv, daysOverdue }
    })

    // Sort by days overdue descending
    invoicesWithDaysOverdue.sort((a, b) => b.daysOverdue - a.daysOverdue)

    // Calculate aging breakdown
    const agingBreakdown = {
      days1to7: { count: 0, amount: 0 },
      days8to14: { count: 0, amount: 0 },
      days15to30: { count: 0, amount: 0 },
      days31to60: { count: 0, amount: 0 },
      days60plus: { count: 0, amount: 0 },
    }

    invoicesWithDaysOverdue.forEach(inv => {
      const amount = Number(inv.amount_due)
      if (inv.daysOverdue <= 7) {
        agingBreakdown.days1to7.count++
        agingBreakdown.days1to7.amount += amount
      } else if (inv.daysOverdue <= 14) {
        agingBreakdown.days8to14.count++
        agingBreakdown.days8to14.amount += amount
      } else if (inv.daysOverdue <= 30) {
        agingBreakdown.days15to30.count++
        agingBreakdown.days15to30.amount += amount
      } else if (inv.daysOverdue <= 60) {
        agingBreakdown.days31to60.count++
        agingBreakdown.days31to60.amount += amount
      } else {
        agingBreakdown.days60plus.count++
        agingBreakdown.days60plus.amount += amount
      }
    })

    // Calculate total overdue amount
    const totalOverdueAmount = invoicesWithDaysOverdue.reduce((sum, inv) => sum + Number(inv.amount_due), 0)

    // Calculate average days overdue
    const averageDaysOverdue = invoicesWithDaysOverdue.length > 0 
      ? Math.round(invoicesWithDaysOverdue.reduce((sum, inv) => sum + inv.daysOverdue, 0) / invoicesWithDaysOverdue.length)
      : 0

    // Get top customers with overdue invoices
    const customerOverdue: Record<string, { customer: { id: string; name: string; email: string }, totalAmount: number, invoiceCount: number, maxDaysOverdue: number }> = {}
    
    invoicesWithDaysOverdue.forEach(inv => {
      const customerId = inv.customer?.id || inv.customer_id
      if (!customerOverdue[customerId]) {
        customerOverdue[customerId] = {
          customer: inv.customer || { id: customerId, name: 'Unknown', email: '' },
          totalAmount: 0,
          invoiceCount: 0,
          maxDaysOverdue: 0,
        }
      }
      customerOverdue[customerId].totalAmount += Number(inv.amount_due)
      customerOverdue[customerId].invoiceCount++
      customerOverdue[customerId].maxDaysOverdue = Math.max(customerOverdue[customerId].maxDaysOverdue, inv.daysOverdue)
    })

    const topOverdueCustomers = Object.values(customerOverdue)
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 5)

    // Get oldest overdue invoice
    const oldestOverdue = invoicesWithDaysOverdue.length > 0 ? {
      invoice: invoicesWithDaysOverdue[0],
      daysOverdue: invoicesWithDaysOverdue[0].daysOverdue,
    } : null

    // Get recent overdue invoices (top 10)
    const recentOverdue = invoicesWithDaysOverdue.slice(0, 10).map(inv => ({
      id: inv.id,
      invoiceNumber: inv.invoice_number || inv.external_id.slice(0, 8),
      customer: inv.customer,
      amountDue: inv.amount_due,
      currency: inv.currency,
      dueDate: inv.due_date,
      daysOverdue: inv.daysOverdue,
      paymentUrl: inv.payment_url,
    }))

    const summary = {
      totalOverdue: invoicesWithDaysOverdue.length,
      totalOverdueAmount,
      agingBreakdown,
      topOverdueCustomers,
      averageDaysOverdue,
      oldestOverdue,
      overdueInvoices: recentOverdue,
    }

    return NextResponse.json(summary)
  } catch (error) {
    console.error('Sweep GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
