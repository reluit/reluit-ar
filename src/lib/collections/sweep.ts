import { createServiceClient } from '@/lib/supabase/server'
import { getInvoiceTransformer, fetchInvoicesFromProvider, type ExternalInvoice } from '@/lib/pipedream/client'
import { classifyInvoiceRisk, calculateSweepSummary, determinePaymentBehavior, type SweepSummary } from './risk-classifier'
import type { Integration, IntegrationProvider, Customer, Invoice } from '@/types/database'

export interface SweepResult {
  success: boolean
  summary: SweepSummary
  invoicesProcessed: number
  customersUpdated: number
  errors: string[]
}

export async function runCollectionsSweep(orgId: string): Promise<SweepResult> {
  const supabase = await createServiceClient()
  const errors: string[] = []
  
  // Get the organization to find the owner (external user id for Pipedream)
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('owner_id')
    .eq('id', orgId)
    .single()

  if (orgError || !org) {
    return {
      success: false,
      summary: {} as SweepSummary,
      invoicesProcessed: 0,
      customersUpdated: 0,
      errors: [`Failed to fetch organization: ${orgError?.message || 'Not found'}`],
    }
  }

  const externalUserId = org.owner_id
  
  // Get all connected integrations for the org
  const { data: integrations, error: intError } = await supabase
    .from('integrations')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'connected')

  if (intError) {
    return {
      success: false,
      summary: {} as SweepSummary,
      invoicesProcessed: 0,
      customersUpdated: 0,
      errors: [`Failed to fetch integrations: ${intError.message}`],
    }
  }

  if (!integrations || integrations.length === 0) {
    return {
      success: false,
      summary: {} as SweepSummary,
      invoicesProcessed: 0,
      customersUpdated: 0,
      errors: ['No connected integrations found'],
    }
  }

  let totalInvoicesProcessed = 0
  let totalCustomersUpdated = 0
  const allInvoices: (Invoice & { customer?: Pick<Customer, 'name'> })[] = []

  // Process each integration
  for (const integration of integrations) {
    try {
      const result = await syncIntegrationInvoices(orgId, integration, externalUserId)
      totalInvoicesProcessed += result.invoicesProcessed
      totalCustomersUpdated += result.customersUpdated
      if (result.error) {
        errors.push(result.error)
      }
    } catch (err) {
      errors.push(`Failed to sync ${integration.provider}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  // Fetch all invoices for the org to calculate summary
  const { data: invoices, error: invError } = await supabase
    .from('invoices')
    .select(`
      *,
      customer:customers(name)
    `)
    .eq('org_id', orgId)
    .neq('status', 'paid')
    .neq('status', 'cancelled')
    .neq('status', 'void')

  if (invError) {
    errors.push(`Failed to fetch invoices: ${invError.message}`)
  }

  if (invoices) {
    allInvoices.push(...(invoices as unknown as (Invoice & { customer?: Pick<Customer, 'name'> })[]))
  }

  const summary = calculateSweepSummary(allInvoices)

  // Update org's last sweep time
  await supabase
    .from('organizations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', orgId)

  return {
    success: errors.length === 0,
    summary,
    invoicesProcessed: totalInvoicesProcessed,
    customersUpdated: totalCustomersUpdated,
    errors,
  }
}

async function syncIntegrationInvoices(
  orgId: string,
  integration: Integration,
  externalUserId: string
): Promise<{ invoicesProcessed: number; customersUpdated: number; error?: string }> {
  const supabase = await createServiceClient()
  
  // Get invoice data from provider via Pipedream
  let externalInvoices: ExternalInvoice[] = []
  
  try {
    console.log(`[Sweep] Fetching invoices from ${integration.provider} for org ${orgId}...`)
    
    // Fetch raw invoices from the provider using Pipedream proxy
    const rawInvoices = await fetchInvoicesFromProvider(integration, externalUserId)
    
    console.log(`[Sweep] Received ${rawInvoices.length} raw invoices from ${integration.provider}`)
    
    // Transform to our common format
    const transformer = getInvoiceTransformer(integration.provider as IntegrationProvider)
    externalInvoices = transformer(rawInvoices)
    
    console.log(`[Sweep] Transformed ${externalInvoices.length} invoices`)
  } catch (err) {
    console.error(`[Sweep] Error fetching from ${integration.provider}:`, err)
    return {
      invoicesProcessed: 0,
      customersUpdated: 0,
      error: `Failed to fetch from ${integration.provider}: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }
  }

  // Group invoices by customer
  const customerInvoices: Record<string, ExternalInvoice[]> = {}
  for (const inv of externalInvoices) {
    if (!customerInvoices[inv.customerId]) {
      customerInvoices[inv.customerId] = []
    }
    customerInvoices[inv.customerId].push(inv)
  }

  let customersUpdated = 0
  let invoicesProcessed = 0

  // Process each customer
  for (const [externalCustomerId, invoices] of Object.entries(customerInvoices)) {
    const firstInvoice = invoices[0]
    
    // Upsert customer
    const { data: customer, error: custError } = await supabase
      .from('customers')
      .upsert({
        org_id: orgId,
        external_id: externalCustomerId,
        integration_id: integration.id,
        name: firstInvoice.customerName,
        email: firstInvoice.customerEmail,
        metadata: {},
      }, {
        onConflict: 'org_id,external_id,integration_id',
      })
      .select()
      .single()

    if (custError) {
      console.error('Failed to upsert customer:', custError)
      continue
    }

    customersUpdated++

    // Process invoices for this customer
    for (const inv of invoices) {
      // Calculate risk level
      const { riskLevel } = classifyInvoiceRisk(
        {
          due_date: inv.dueDate,
          amount_due: inv.amountDue,
          status: inv.status as Invoice['status'],
        },
        customer
      )

      // Upsert invoice
      const { error: invError } = await supabase
        .from('invoices')
        .upsert({
          org_id: orgId,
          customer_id: customer.id,
          integration_id: integration.id,
          external_id: inv.id,
          invoice_number: inv.invoiceNumber,
          amount: inv.amount,
          amount_paid: inv.amountPaid,
          amount_due: inv.amountDue,
          currency: inv.currency,
          due_date: inv.dueDate,
          issued_date: inv.issuedDate,
          status: inv.status as Invoice['status'],
          risk_level: riskLevel,
          payment_url: inv.paymentUrl,
          pdf_url: inv.pdfUrl,
          metadata: inv.metadata,
        }, {
          onConflict: 'org_id,external_id,integration_id',
        })

      if (invError) {
        console.error('Failed to upsert invoice:', invError)
        continue
      }

      invoicesProcessed++
    }

    // Update customer payment behavior based on history
    const { data: customerInvoiceHistory } = await supabase
      .from('invoices')
      .select('due_date, status, updated_at')
      .eq('customer_id', customer.id)
      .eq('status', 'paid')

    if (customerInvoiceHistory && customerInvoiceHistory.length > 0) {
      const { behavior, avgDays } = determinePaymentBehavior(
        customerInvoiceHistory.map(inv => ({
          dueDate: inv.due_date,
          paidDate: inv.updated_at, // Using updated_at as proxy for paid date
        }))
      )

      await supabase
        .from('customers')
        .update({
          payment_behavior: behavior,
          avg_days_to_pay: avgDays,
        })
        .eq('id', customer.id)
    }
  }

  // Update integration last sync time
  await supabase
    .from('integrations')
    .update({
      last_sync: new Date().toISOString(),
      status: 'connected',
    })
    .eq('id', integration.id)

  return {
    invoicesProcessed,
    customersUpdated,
  }
}

// Manual sync for a single integration
export async function syncSingleIntegration(orgId: string, integrationId: string): Promise<{
  success: boolean
  invoicesProcessed: number
  customersUpdated: number
  error?: string
}> {
  const supabase = await createServiceClient()
  
  // Get the organization to find the owner (external user id for Pipedream)
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('owner_id')
    .eq('id', orgId)
    .single()

  if (orgError || !org) {
    return {
      success: false,
      invoicesProcessed: 0,
      customersUpdated: 0,
      error: `Failed to fetch organization: ${orgError?.message || 'Not found'}`,
    }
  }

  const externalUserId = org.owner_id
  
  const { data: integration, error } = await supabase
    .from('integrations')
    .select('*')
    .eq('id', integrationId)
    .eq('org_id', orgId)
    .single()

  if (error || !integration) {
    return {
      success: false,
      invoicesProcessed: 0,
      customersUpdated: 0,
      error: 'Integration not found',
    }
  }

  // Mark as syncing
  await supabase
    .from('integrations')
    .update({ status: 'syncing' })
    .eq('id', integrationId)

  const result = await syncIntegrationInvoices(orgId, integration as Integration, externalUserId)

  return {
    success: !result.error,
    invoicesProcessed: result.invoicesProcessed,
    customersUpdated: result.customersUpdated,
    error: result.error,
  }
}

