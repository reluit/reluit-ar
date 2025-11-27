import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { CampaignConfig, CampaignStats } from '@/types/database'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    // Check if called from cron (with secret) or authenticated user
    const authHeader = request.headers.get('authorization')
    const isCronCall = authHeader === `Bearer ${process.env.CRON_SECRET}`
    
    let orgId: string | null = null
    
    if (isCronCall) {
      // Called from cron - get orgId from body
      const body = await request.json()
      orgId = body.orgId
    } else {
      // Called by authenticated user
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('owner_id', user.id)
        .single()

      if (!org) {
        return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
      }
      
      orgId = org.id
    }

    if (!orgId) {
      return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })
    }

    const body = await request.json()
    const { customerId } = body as { customerId?: string }

    // Get overdue invoices for the customer (or all customers if no customerId specified)
    let query = supabase
      .from('invoices')
      .select(`
        id,
        customer_id,
        amount_due,
        due_date,
        customer:customers(id, name, email)
      `)
      .eq('org_id', orgId)
      .neq('status', 'paid')
      .neq('status', 'cancelled')
      .neq('status', 'void')
      .lt('due_date', new Date().toISOString().split('T')[0]) // Overdue invoices

    if (customerId) {
      query = query.eq('customer_id', customerId)
    }

    const { data: invoices } = await query

    if (!invoices || invoices.length === 0) {
      return NextResponse.json({ 
        message: 'No overdue invoices found',
        campaignsCreated: 0 
      })
    }

    // Group invoices by customer
    const customerInvoices: Record<string, typeof invoices> = {}
    invoices.forEach((inv) => {
      const customerId = inv.customer_id
      if (!customerInvoices[customerId]) {
        customerInvoices[customerId] = []
      }
      customerInvoices[customerId].push(inv)
    })

    const campaignsCreated: string[] = []

    // Create a campaign for each customer
    for (const [customerId, customerInvs] of Object.entries(customerInvoices)) {
      const customer = customerInvs[0].customer as { id: string; name: string; email: string | null } | null
      const invoiceIds = customerInvs.map((inv) => inv.id)
      const totalAmount = customerInvs.reduce((sum, inv) => sum + Number(inv.amount_due), 0)

      // Check if campaign already exists for this customer
      const { data: existingCampaigns } = await supabase
        .from('campaigns')
        .select('id')
        .eq('org_id', orgId)
        .contains('target_invoice_ids', invoiceIds.slice(0, 1)) // Check if any invoice is already in a campaign

      // Skip if campaign already exists
      if (existingCampaigns && existingCampaigns.length > 0) {
        continue
      }

      // Default campaign config
      const config: CampaignConfig = {
        maxAttempts: 4,
        daysBetweenEmails: 5,
        escalateTone: true,
        includePayButton: true,
        attachInvoice: true,
        stages: [
          { stage: 'reminder', daysTrigger: 0, tone: 'friendly' },
          { stage: 'follow_up', daysTrigger: 5, tone: 'professional' },
          { stage: 'escalation', daysTrigger: 10, tone: 'firm' },
          { stage: 'final_notice', daysTrigger: 15, tone: 'urgent' },
        ],
      }

      const stats: CampaignStats = {
        totalInvoices: invoiceIds.length,
        totalAmount,
        emailsSent: 0,
        emailsOpened: 0,
        emailsClicked: 0,
        paymentsReceived: 0,
        amountCollected: 0,
      }

      const campaignName = customer
        ? `Collection Campaign - ${customer.name}`
        : `Collection Campaign - Customer ${customerId.slice(0, 8)}`

      const { data: campaign, error } = await supabase
        .from('campaigns')
        .insert({
          org_id: orgId,
          name: campaignName,
          description: `Auto-created campaign for ${invoiceIds.length} overdue invoice(s)`,
          status: 'draft',
          config,
          target_invoice_ids: invoiceIds,
          stats,
        })
        .select()
        .single()

      if (error) {
        console.error('Failed to create campaign:', error)
        continue
      }

      campaignsCreated.push(campaign.id)
    }

    return NextResponse.json({
      success: true,
      campaignsCreated: campaignsCreated.length,
      campaignIds: campaignsCreated,
    })
  } catch (error) {
    console.error('Auto-create campaign error:', error)
    return NextResponse.json(
      { error: 'Failed to create campaigns' },
      { status: 500 }
    )
  }
}

