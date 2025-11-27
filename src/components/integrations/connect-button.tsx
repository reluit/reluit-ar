'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Check, ExternalLink } from 'lucide-react'
import type { IntegrationProvider } from '@/types/database'

interface ConnectButtonProps {
  provider: IntegrationProvider
  isConnected: boolean
  onConnect: () => Promise<void>
  onDisconnect: () => Promise<void>
}

export function ConnectButton({
  provider,
  isConnected,
  onConnect,
  onDisconnect,
}: ConnectButtonProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleClick = async () => {
    setIsLoading(true)
    try {
      if (isConnected) {
        await onDisconnect()
      } else {
        await onConnect()
      }
    } finally {
      setIsLoading(false)
    }
  }

  if (isConnected) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm text-success">
          <Check className="h-4 w-4" />
          Connected
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={handleClick}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            'Disconnect'
          )}
        </Button>
      </div>
    )
  }

  return (
    <Button
      onClick={handleClick}
      disabled={isLoading}
      size="sm"
      className="gap-2"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          Connect
          <ExternalLink className="h-3.5 w-3.5" />
        </>
      )}
    </Button>
  )
}

