import type { IntegrationProvider, Integration } from '@/types/database'

// Server-side Pipedream client configuration
// Using REST API approach for flexibility
export interface PipedreamClientConfig {
  projectId: string
  clientId: string
  clientSecret: string
  environment: 'development' | 'production'
}

export function createPipedreamClient(): PipedreamClientConfig {
  return {
    projectId: process.env.PIPEDREAM_PROJECT_ID || '',
    clientId: process.env.PIPEDREAM_CLIENT_ID || '',
    clientSecret: process.env.PIPEDREAM_CLIENT_SECRET || '',
    environment: (process.env.NEXT_PUBLIC_PIPEDREAM_ENV as 'development' | 'production') || 'development',
  }
}

// Cache for OAuth access tokens
let cachedAccessToken: { token: string; expiresAt: number } | null = null

/**
 * Get OAuth access token for Pipedream API
 * Uses client credentials flow
 */
async function getOAuthAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5 minute buffer)
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cachedAccessToken.token
  }

  const config = createPipedreamClient()
  
  const response = await fetch('https://api.pipedream.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to get OAuth token: ${error}`)
  }

  const data = await response.json()
  
  // Cache the token (expires_in is in seconds)
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  }

  return data.access_token
}

/**
 * Make a proxy request to an upstream API via Pipedream
 * This allows making authenticated requests to APIs like Stripe using the connected account
 */
export async function makeProxyRequest(
  url: string,
  options: {
    method?: string
    body?: unknown
    headers?: Record<string, string>
  },
  params: {
    externalUserId: string
    accountId: string
  }
): Promise<Response> {
  const config = createPipedreamClient()
  const accessToken = await getOAuthAccessToken()
  
  // URL-safe base64 encode the target URL
  const encodedUrl = Buffer.from(url).toString('base64url')
  
  const proxyUrl = new URL(`https://api.pipedream.com/v1/connect/${config.projectId}/proxy/${encodedUrl}`)
  proxyUrl.searchParams.set('external_user_id', params.externalUserId)
  proxyUrl.searchParams.set('account_id', params.accountId)
  
  const response = await fetch(proxyUrl.toString(), {
    method: options.method || 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-PD-Environment': config.environment,
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  return response
}

// Helper to make Pipedream API calls (for non-proxy operations)
export async function pipedreamRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const accessToken = await getOAuthAccessToken()
  const config = createPipedreamClient()
  
  return fetch(`https://api.pipedream.com/v1/${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-PD-Environment': config.environment,
      ...options.headers,
    },
  })
}

// App slugs for each integration
export const PIPEDREAM_APPS = {
  stripe: 'stripe',
  square: 'square',
  quickbooks: 'quickbooks_sandbox', // Use 'quickbooks' for production
} as const

export type PipedreamApp = keyof typeof PIPEDREAM_APPS

// Fetch invoices from connected integrations
export interface FetchInvoicesResult {
  invoices: ExternalInvoice[]
  customers: ExternalCustomer[]
}

export interface ExternalInvoice {
  id: string
  customerId: string
  customerName: string
  customerEmail: string | null
  invoiceNumber: string | null
  amount: number
  amountPaid: number
  amountDue: number
  currency: string
  dueDate: string
  issuedDate: string
  status: string
  paymentUrl: string | null
  pdfUrl: string | null
  metadata: Record<string, unknown>
}

export interface ExternalCustomer {
  id: string
  name: string
  email: string | null
  phone: string | null
  metadata: Record<string, unknown>
}

// Transform Stripe invoice data
export function transformStripeInvoices(invoices: unknown[]): ExternalInvoice[] {
  return (invoices as StripeInvoice[]).map(inv => ({
    id: inv.id,
    customerId: inv.customer,
    customerName: inv.customer_name || 'Unknown',
    customerEmail: inv.customer_email,
    invoiceNumber: inv.number,
    amount: inv.total / 100, // Stripe uses cents
    amountPaid: inv.amount_paid / 100,
    amountDue: inv.amount_due / 100,
    currency: inv.currency.toUpperCase(),
    dueDate: inv.due_date ? new Date(inv.due_date * 1000).toISOString() : new Date().toISOString(),
    issuedDate: new Date(inv.created * 1000).toISOString(),
    status: mapStripeStatus(inv.status),
    paymentUrl: inv.hosted_invoice_url,
    pdfUrl: inv.invoice_pdf,
    metadata: { stripe: inv },
  }))
}

function mapStripeStatus(status: string): string {
  const statusMap: Record<string, string> = {
    draft: 'draft',
    open: 'pending',
    paid: 'paid',
    uncollectible: 'cancelled',
    void: 'void',
  }
  return statusMap[status] || 'pending'
}

interface StripeInvoice {
  id: string
  customer: string
  customer_name: string | null
  customer_email: string | null
  number: string | null
  total: number
  amount_paid: number
  amount_due: number
  currency: string
  due_date: number | null
  created: number
  status: string
  hosted_invoice_url: string | null
  invoice_pdf: string | null
}

// Transform Square invoice data
export function transformSquareInvoices(invoices: unknown[]): ExternalInvoice[] {
  return (invoices as SquareInvoice[]).map(inv => {
    const primaryRecipient = inv.primary_recipient
    return {
      id: inv.id,
      customerId: primaryRecipient?.customer_id || 'unknown',
      customerName: primaryRecipient?.given_name 
        ? `${primaryRecipient.given_name} ${primaryRecipient.family_name || ''}`.trim()
        : 'Unknown',
      customerEmail: primaryRecipient?.email_address || null,
      invoiceNumber: inv.invoice_number,
      amount: parseInt(inv.payment_requests?.[0]?.computed_amount_money?.amount || '0') / 100,
      amountPaid: 0, // Square tracks this differently
      amountDue: parseInt(inv.payment_requests?.[0]?.computed_amount_money?.amount || '0') / 100,
      currency: inv.payment_requests?.[0]?.computed_amount_money?.currency || 'USD',
      dueDate: inv.payment_requests?.[0]?.due_date || new Date().toISOString(),
      issuedDate: inv.created_at,
      status: mapSquareStatus(inv.status),
      paymentUrl: inv.public_url,
      pdfUrl: null,
      metadata: { square: inv },
    }
  })
}

function mapSquareStatus(status: string): string {
  const statusMap: Record<string, string> = {
    DRAFT: 'draft',
    UNPAID: 'pending',
    SCHEDULED: 'pending',
    PARTIALLY_PAID: 'pending',
    PAID: 'paid',
    PARTIALLY_REFUNDED: 'paid',
    REFUNDED: 'cancelled',
    CANCELED: 'cancelled',
  }
  return statusMap[status] || 'pending'
}

interface SquareInvoice {
  id: string
  invoice_number: string
  status: string
  created_at: string
  public_url: string | null
  primary_recipient?: {
    customer_id: string
    given_name?: string
    family_name?: string
    email_address?: string
  }
  payment_requests?: {
    due_date?: string
    computed_amount_money?: {
      amount: string
      currency: string
    }
  }[]
}

// Transform QuickBooks invoice data
export function transformQuickBooksInvoices(invoices: unknown[]): ExternalInvoice[] {
  return (invoices as QuickBooksInvoice[]).map(inv => ({
    id: inv.Id,
    customerId: inv.CustomerRef?.value || 'unknown',
    customerName: inv.CustomerRef?.name || 'Unknown',
    customerEmail: inv.BillEmail?.Address || null,
    invoiceNumber: inv.DocNumber,
    amount: parseFloat(inv.TotalAmt),
    amountPaid: parseFloat(inv.TotalAmt) - parseFloat(inv.Balance),
    amountDue: parseFloat(inv.Balance),
    currency: inv.CurrencyRef?.value || 'USD',
    dueDate: inv.DueDate,
    issuedDate: inv.TxnDate,
    status: parseFloat(inv.Balance) === 0 ? 'paid' : 'pending',
    paymentUrl: null, // QuickBooks doesn't provide direct payment links
    pdfUrl: null,
    metadata: { quickbooks: inv },
  }))
}

interface QuickBooksInvoice {
  Id: string
  DocNumber: string
  TotalAmt: string
  Balance: string
  TxnDate: string
  DueDate: string
  CustomerRef?: {
    value: string
    name: string
  }
  BillEmail?: {
    Address: string
  }
  CurrencyRef?: {
    value: string
  }
}

// Get appropriate transformer for provider
export function getInvoiceTransformer(provider: IntegrationProvider) {
  switch (provider) {
    case 'stripe':
      return transformStripeInvoices
    case 'square':
      return transformSquareInvoices
    case 'quickbooks':
      return transformQuickBooksInvoices
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

// ==========================================
// Provider-specific invoice fetching functions
// ==========================================

/**
 * Fetch invoices from Stripe using Pipedream proxy
 * @param integration - The integration record with pipedream_account_id
 * @param externalUserId - The external user ID in your system (Supabase user id)
 * @returns Array of raw Stripe invoice objects
 */
export async function fetchStripeInvoices(
  integration: Integration,
  externalUserId: string
): Promise<StripeInvoice[]> {
  if (!integration.pipedream_account_id) {
    throw new Error('No Pipedream account connected for this integration')
  }

  const allInvoices: StripeInvoice[] = []
  let hasMore = true
  let startingAfter: string | undefined

  // Paginate through all invoices
  while (hasMore) {
    const params = new URLSearchParams()
    params.set('limit', '100')
    // Only get open/uncollectible invoices (not drafts, paid ones still useful for history)
    params.set('expand[]', 'data.customer')
    if (startingAfter) {
      params.set('starting_after', startingAfter)
    }

    const url = `https://api.stripe.com/v1/invoices?${params.toString()}`
    
    const response = await makeProxyRequest(
      url,
      { method: 'GET' },
      {
        externalUserId,
        accountId: integration.pipedream_account_id,
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Stripe API error:', response.status, errorText)
      throw new Error(`Failed to fetch Stripe invoices: ${response.status} - ${errorText}`)
    }

    const data = await response.json() as {
      data: StripeInvoice[]
      has_more: boolean
    }

    allInvoices.push(...data.data)
    hasMore = data.has_more
    
    if (data.data.length > 0) {
      startingAfter = data.data[data.data.length - 1].id
    } else {
      hasMore = false
    }

    // Safety limit to prevent infinite loops
    if (allInvoices.length > 10000) {
      console.warn('Hit safety limit of 10000 invoices')
      break
    }
  }

  return allInvoices
}

/**
 * Fetch invoices from a provider using the connected Pipedream account
 * @param integration - The integration record
 * @param externalUserId - The external user ID (Supabase user id)
 * @returns Array of raw invoice objects from the provider
 */
export async function fetchInvoicesFromProvider(
  integration: Integration,
  externalUserId: string
): Promise<unknown[]> {
  switch (integration.provider) {
    case 'stripe':
      return fetchStripeInvoices(integration, externalUserId)
    case 'square':
      // Square invoice fetching - use Pipedream workflow
      // Configure workflow to fetch Square invoices and return in expected format
      throw new Error('Square integration: Configure Pipedream workflow to fetch invoices')
      console.log('Square invoice fetching not yet implemented')
      return []
    case 'quickbooks':
      // QuickBooks invoice fetching - use Pipedream workflow
      // Configure workflow to fetch QuickBooks invoices and return in expected format
      throw new Error('QuickBooks integration: Configure Pipedream workflow to fetch invoices')
      console.log('QuickBooks invoice fetching not yet implemented')
      return []
    default:
      throw new Error(`Unknown provider: ${integration.provider}`)
  }
}

