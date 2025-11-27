'use client'

import { useEffect, useState } from 'react'
import type { CreateTokenResponse, PipedreamClient } from '@pipedream/sdk/browser'
import { Header } from '@/components/dashboard/header'
import { IntegrationCard } from '@/components/integrations/integration-card'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Database, Integration, IntegrationProvider, Json } from '@/types/database'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Info } from 'lucide-react'

const PROVIDERS: IntegrationProvider[] = ['stripe', 'square', 'quickbooks']
const PIPEDREAM_APP_SLUGS: Record<IntegrationProvider, string> = {
  stripe: 'stripe',
  square: 'square',
  quickbooks: 'quickbooks',
}
const PIPEDREAM_ENV =
  (process.env.NEXT_PUBLIC_PIPEDREAM_ENV as 'development' | 'production') ||
  'development'
type ConnectedAccountPayload = {
  id?: string
  external_id?: string
  account_id?: string
  [key: string]: unknown
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [syncingProvider, setSyncingProvider] = useState<IntegrationProvider | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [pdClient, setPdClient] = useState<PipedreamClient | null>(null)
  const [isClientLoading, setIsClientLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    loadIntegrations()
  }, [])

  useEffect(() => {
    let isMounted = true

    async function initPipedreamClient() {
      if (!userId) return
      setIsClientLoading(true)
      try {
        const { PipedreamClient } = await import('@pipedream/sdk/browser')

        const client = new PipedreamClient({
          projectEnvironment: PIPEDREAM_ENV,
          externalUserId: userId,
          tokenCallback: async () => {
            const response = await fetch('/api/pipedream/connect-token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
            })

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}))
              console.error('Token fetch failed:', errorData)
              throw new Error('Unable to fetch connect token')
            }

            const data = await response.json()
            console.log('Token response:', data)
            
            // Return the full CreateTokenResponse object
            return {
              token: data.token,
              connectLinkUrl: data.connectLinkUrl,
              expiresAt: new Date(data.expiresAt),
            } as CreateTokenResponse
          },
        })

        if (isMounted) {
          setPdClient(client)
        }
      } catch (error) {
        console.error('Failed to initialize Pipedream client', error)
        toast.error('Unable to initialize Pipedream Connect')
      } finally {
        if (isMounted) {
          setIsClientLoading(false)
        }
      }
    }

    initPipedreamClient()

    return () => {
      isMounted = false
    }
  }, [userId])

  async function loadIntegrations() {
    setIsLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setIsLoading(false)
      return
    }

    setUserId(user.id)

    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    const organizationId = (org as { id: string } | null)?.id

    if (!organizationId) {
      setOrgId(null)
      setIsLoading(false)
      return
    }

    setOrgId(organizationId)

    const { data } = await supabase
      .from('integrations')
      .select('*')
      .eq('org_id', organizationId)

    setIntegrations((data as Integration[]) || [])
    setIsLoading(false)
  }

  async function handleConnect(provider: IntegrationProvider) {
    if (!orgId) {
      toast.error('Please complete onboarding before connecting integrations')
      return
    }

    if (!pdClient) {
      toast.error('Pipedream client not ready yet. Please try again.')
      return
    }

    const appSlug = PIPEDREAM_APP_SLUGS[provider]
    if (!appSlug) {
      toast.error('Unsupported provider')
      return
    }

    try {
      pdClient.connectAccount({
        app: appSlug,
        onSuccess: async (account: ConnectedAccountPayload) => {
          try {
            const cleanedMetadata: Json = account
              ? (JSON.parse(JSON.stringify(account)) as Json)
              : ({} as Json)
            const externalAccountId =
              account?.external_id ?? account?.account_id ?? account?.id ?? null
            const payload: Database['public']['Tables']['integrations']['Insert'] = {
              org_id: orgId,
              provider,
              status: 'connected',
              pipedream_account_id: account?.id ?? null,
              external_account_id: externalAccountId,
              metadata: cleanedMetadata,
              last_sync: new Date().toISOString(),
            }

            const { error } = await (supabase.from('integrations') as any).upsert(
              [payload],
              {
                onConflict: 'org_id,provider',
              }
            )

            if (error) {
              throw error
            }

            toast.success(`${provider} connected successfully!`)
            loadIntegrations()
          } catch (saveError) {
            console.error('Failed to persist integration:', saveError)
            toast.error('Connected, but failed to save integration. Please retry.')
          }
        },
        onClose: () => {
          toast.info('Connection flow closed')
        },
        onError: (error: Error) => {
          console.error('Pipedream connect error:', error)
          toast.error(`Failed to connect ${provider}`)
        },
      })
    } catch (error) {
      console.error('Failed to start Pipedream flow', error)
      toast.error('Unable to launch connection flow')
    }
  }

  async function handleSync(provider: IntegrationProvider) {
    setSyncingProvider(provider)
    
    try {
      const response = await fetch('/api/sweep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      })

      if (!response.ok) {
        throw new Error('Sync failed')
      }

      toast.success('Sync completed!')
      loadIntegrations()
    } catch {
      toast.error('Failed to sync. Please try again.')
    } finally {
      setSyncingProvider(null)
    }
  }

  async function handleDisconnect(provider: IntegrationProvider) {
    if (!orgId) {
      toast.error('No organization found')
      return
    }

    const updatePayload: Database['public']['Tables']['integrations']['Update'] = {
      status: 'disconnected',
      pipedream_account_id: null,
      external_account_id: null,
    }

    const { error } = await (supabase.from('integrations') as any).update(
      updatePayload as Database['public']['Tables']['integrations']['Update']
    )
      .eq('org_id', orgId)
      .eq('provider', provider)

    if (error) {
      toast.error('Failed to disconnect')
      return
    }

    toast.success(`${provider} disconnected`)
    loadIntegrations()
  }

  const getIntegration = (provider: IntegrationProvider) =>
    integrations.find(i => i.provider === provider)

  return (
    <div className="min-h-screen">
      <Header
        title="Integrations"
        description="Connect your payment and invoicing tools"
      />

      <div className="p-6 space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Connect your tools</AlertTitle>
          <AlertDescription>
            Link your payment platforms to automatically sync invoices and track payments in real-time.
            {isClientLoading && ' Initializing Pipedream Connect...'}
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {PROVIDERS.map(provider => (
            <IntegrationCard
              key={provider}
              provider={provider}
              integration={getIntegration(provider)}
              onConnect={() => handleConnect(provider)}
              onSync={() => handleSync(provider)}
              onDisconnect={() => handleDisconnect(provider)}
              isSyncing={syncingProvider === provider}
            />
          ))}
        </div>

        {/* Coming soon integrations */}
        <div className="mt-8">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">Coming soon</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {['Xero', 'FreshBooks', 'Wave', 'Zoho Invoice'].map(name => (
              <div
                key={name}
                className="p-4 rounded-lg border border-dashed border-border bg-muted/30 text-center"
              >
                <span className="text-sm text-muted-foreground">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

