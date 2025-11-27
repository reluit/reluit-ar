'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RefreshCw, AlertCircle, Check, Loader2 } from 'lucide-react'
import type { Integration, IntegrationProvider, IntegrationStatus } from '@/types/database'
import { formatDistanceToNow } from 'date-fns'

interface IntegrationCardProps {
  provider: IntegrationProvider
  integration?: Integration
  onConnect: () => void
  onSync?: () => void
  onDisconnect?: () => void
  isSyncing?: boolean
}

const providerInfo: Record<IntegrationProvider, {
  name: string
  description: string
  icon: string
  color: string
}> = {
  stripe: {
    name: 'Stripe',
    description: 'Sync invoices and payments from Stripe Billing',
    icon: '💳',
    color: 'bg-[#635BFF]/10 text-[#635BFF]',
  },
  square: {
    name: 'Square',
    description: 'Import invoices from Square Invoices',
    icon: '⬛',
    color: 'bg-black/10 text-black dark:bg-white/10 dark:text-white',
  },
  quickbooks: {
    name: 'QuickBooks',
    description: 'Connect to QuickBooks Online for invoice sync',
    icon: '📗',
    color: 'bg-[#2CA01C]/10 text-[#2CA01C]',
  },
}

const statusConfig: Record<IntegrationStatus, {
  label: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
  icon: React.ReactNode
}> = {
  connected: {
    label: 'Connected',
    variant: 'default',
    icon: <Check className="h-3 w-3" />,
  },
  disconnected: {
    label: 'Not connected',
    variant: 'secondary',
    icon: null,
  },
  error: {
    label: 'Error',
    variant: 'destructive',
    icon: <AlertCircle className="h-3 w-3" />,
  },
  syncing: {
    label: 'Syncing',
    variant: 'outline',
    icon: <RefreshCw className="h-3 w-3 animate-spin" />,
  },
}

export function IntegrationCard({
  provider,
  integration,
  onConnect,
  onSync,
  onDisconnect,
  isSyncing = false,
}: IntegrationCardProps) {
  const info = providerInfo[provider]
  const status = integration?.status || 'disconnected'
  const statusInfo = statusConfig[isSyncing ? 'syncing' : status]
  const isConnected = status === 'connected'

  return (
    <Card className="relative overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${info.color}`}>
              {info.icon}
            </div>
            <div>
              <CardTitle className="text-lg">{info.name}</CardTitle>
              <CardDescription className="text-sm mt-0.5">
                {info.description}
              </CardDescription>
            </div>
          </div>
          <Badge variant={statusInfo.variant} className="gap-1">
            {statusInfo.icon}
            {statusInfo.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isConnected && integration?.last_sync && (
          <p className="text-xs text-muted-foreground mb-3">
            Last synced {formatDistanceToNow(new Date(integration.last_sync), { addSuffix: true })}
          </p>
        )}
        <div className="flex items-center gap-2">
          {isConnected ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={onSync}
                disabled={isSyncing}
                className="gap-2"
              >
                {isSyncing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Sync now
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onDisconnect}
                className="text-muted-foreground hover:text-destructive"
              >
                Disconnect
              </Button>
            </>
          ) : (
            <Button onClick={onConnect} size="sm">
              Connect {info.name}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

