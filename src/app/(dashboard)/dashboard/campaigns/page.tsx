'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'
import { formatDistanceToNow } from 'date-fns'
import {
  Play,
  Pause,
  MoreHorizontal,
  Mail,
  DollarSign,
  MousePointerClick,
  Megaphone,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import type { Campaign, CampaignStatus, CampaignStats } from '@/types/database'

const statusBadgeStyles: Record<CampaignStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
  draft: { variant: 'outline', className: '' },
  active: { variant: 'default', className: 'bg-success text-success-foreground' },
  paused: { variant: 'secondary', className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' },
  completed: { variant: 'secondary', className: '' },
}

export default function CampaignsPage() {
  const router = useRouter()
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    loadCampaigns()
  }, [])

  async function loadCampaigns() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (!org) {
      setIsLoading(false)
      return
    }

    const { data } = await supabase
      .from('campaigns')
      .select('*')
      .eq('org_id', org.id)
      .order('created_at', { ascending: false })

    setCampaigns((data as Campaign[]) || [])
    setIsLoading(false)
  }

  async function updateCampaignStatus(id: string, status: CampaignStatus) {
    const { error } = await supabase
      .from('campaigns')
      .update({ status })
      .eq('id', id)

    if (error) {
      toast.error('Failed to update campaign')
      return
    }

    toast.success(`Campaign ${status === 'active' ? 'activated' : status === 'paused' ? 'paused' : 'updated'}`)
    loadCampaigns()
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount)

  return (
    <div className="min-h-screen">
      <Header
        title="Campaigns"
        description="Manage your automated collection campaigns"
      />

      <div className="p-6 space-y-6">
        {/* Campaigns Grid */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <Card className="max-w-lg mx-auto">
            <CardHeader className="text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Megaphone className="h-7 w-7 text-primary" />
              </div>
              <CardTitle>No campaigns yet</CardTitle>
              <CardDescription>
                Campaigns are automatically created for customers with overdue invoices. Check back soon!
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((campaign) => {
              const stats = campaign.stats as CampaignStats
              const statusStyle = statusBadgeStyles[campaign.status]

              return (
                <Card key={campaign.id} className="relative cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push(`/dashboard/campaigns/${campaign.id}`)}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-lg">{campaign.name}</CardTitle>
                        <CardDescription>
                          Created {formatDistanceToNow(new Date(campaign.created_at), { addSuffix: true })}
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={statusStyle.variant} className={statusStyle.className}>
                          {campaign.status}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {campaign.status === 'active' ? (
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); updateCampaignStatus(campaign.id, 'paused'); }}>
                                <Pause className="mr-2 h-4 w-4" />
                                Pause Campaign
                              </DropdownMenuItem>
                            ) : campaign.status !== 'completed' ? (
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); updateCampaignStatus(campaign.id, 'active'); }}>
                                <Play className="mr-2 h-4 w-4" />
                                Activate Campaign
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem asChild>
                              <Link href={`/dashboard/campaigns/${campaign.id}`} onClick={(e) => e.stopPropagation()}>
                                View Details
                              </Link>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {campaign.description && (
                      <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                        {campaign.description}
                      </p>
                    )}
                    
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border">
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                          <Mail className="h-3.5 w-3.5" />
                        </div>
                        <p className="text-lg font-semibold">{stats.emailsSent}</p>
                        <p className="text-xs text-muted-foreground">Sent</p>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                          <MousePointerClick className="h-3.5 w-3.5" />
                        </div>
                        <p className="text-lg font-semibold">
                          {stats.emailsSent > 0 
                            ? Math.round((stats.emailsOpened / stats.emailsSent) * 100) 
                            : 0}%
                        </p>
                        <p className="text-xs text-muted-foreground">Opened</p>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
                          <DollarSign className="h-3.5 w-3.5" />
                        </div>
                        <p className="text-lg font-semibold text-success">
                          {formatCurrency(stats.amountCollected)}
                        </p>
                        <p className="text-xs text-muted-foreground">Collected</p>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-border">
                      <p className="text-xs text-muted-foreground">
                        {stats.totalInvoices} invoices · {formatCurrency(stats.totalAmount)} total
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

