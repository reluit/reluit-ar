'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/dashboard/header'
import { StatsCard } from '@/components/dashboard/stats-card'
import { OverdueChart } from '@/components/dashboard/overdue-chart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import Link from 'next/link'
import { format } from 'date-fns'
import {
  DollarSign,
  AlertTriangle,
  Clock,
  TrendingDown,
  ArrowRight,
  Plug,
  Mail,
  CalendarClock,
  Users,
  ExternalLink,
} from 'lucide-react'

interface OverdueInvoice {
  id: string
  invoiceNumber: string
  customer: { id: string; name: string; email: string } | null
  amountDue: number
  currency: string
  dueDate: string
  daysOverdue: number
  paymentUrl?: string
}

interface OverdueCustomer {
  customer: { id: string; name: string; email: string }
  totalAmount: number
  invoiceCount: number
  maxDaysOverdue: number
}

interface OverdueSummary {
  totalOverdue: number
  totalOverdueAmount: number
  agingBreakdown: {
    days1to7: { count: number; amount: number }
    days8to14: { count: number; amount: number }
    days15to30: { count: number; amount: number }
    days31to60: { count: number; amount: number }
    days60plus: { count: number; amount: number }
  }
  topOverdueCustomers: OverdueCustomer[]
  averageDaysOverdue: number
  oldestOverdue: { invoice: unknown; daysOverdue: number } | null
  overdueInvoices: OverdueInvoice[]
}

export default function DashboardPage() {
  const [user, setUser] = useState<{ email: string; user_metadata: { full_name?: string } } | null>(null)
  const [summary, setSummary] = useState<OverdueSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSweeping, setIsSweeping] = useState(false)
  const [hasIntegrations, setHasIntegrations] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      setUser(user as typeof user & { user_metadata: { full_name?: string } })
      
      // Check for integrations
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('owner_id', user.id)
        .single()

      if (org) {
        const { data: integrations } = await supabase
          .from('integrations')
          .select('id')
          .eq('org_id', org.id)
          .eq('status', 'connected')

        setHasIntegrations((integrations?.length || 0) > 0)
      }
    }

    // Load overdue summary
    try {
      const res = await fetch('/api/sweep')
      if (res.ok) {
        const data = await res.json()
        setSummary(data)
      }
    } catch (err) {
      console.error('Failed to load overdue data:', err)
    }

    setIsLoading(false)
  }

  async function handleSweep() {
    setIsSweeping(true)
    try {
      const res = await fetch('/api/sweep', { method: 'POST' })
      if (res.ok) {
        const result = await res.json()
        if (result.success) {
          toast.success(`Sync complete! Processed ${result.invoicesProcessed} invoices.`)
        } else {
          toast.warning('Sync completed with some errors')
        }
        loadData()
      } else {
        toast.error('Failed to sync')
      }
    } catch {
      toast.error('Failed to sync')
    } finally {
      setIsSweeping(false)
    }
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value)

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)

  const getUrgencyBadge = (daysOverdue: number) => {
    if (daysOverdue >= 60) return { label: 'Critical', className: 'bg-red-900/20 text-red-400 border-red-900/30' }
    if (daysOverdue >= 30) return { label: 'Severe', className: 'bg-red-600/20 text-red-500 border-red-600/30' }
    if (daysOverdue >= 14) return { label: 'High', className: 'bg-orange-500/20 text-orange-500 border-orange-500/30' }
    return { label: 'Moderate', className: 'bg-amber-500/20 text-amber-500 border-amber-500/30' }
  }

  // Calculate critical amount (30+ days overdue)
  const criticalAmount = summary 
    ? (summary.agingBreakdown.days31to60.amount + summary.agingBreakdown.days60plus.amount)
    : 0
  
  const criticalCount = summary 
    ? (summary.agingBreakdown.days31to60.count + summary.agingBreakdown.days60plus.count)
    : 0

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <Header title="Overdue Invoices" />
        <div className="p-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-32" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Empty state - no integrations
  if (!hasIntegrations) {
    return (
      <div className="min-h-screen">
        <Header
          title="Overdue Invoices"
          user={user ? { email: user.email, name: user.user_metadata.full_name } : undefined}
        />
        <div className="p-6">
          <Card className="max-w-2xl mx-auto mt-12 border-dashed">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Plug className="h-8 w-8 text-primary" />
              </div>
              <CardTitle className="text-2xl">Connect your billing platform</CardTitle>
              <CardDescription className="text-base">
                Link Stripe, QuickBooks, or other platforms to start tracking overdue invoices.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center pb-8">
              <Button asChild size="lg" className="gap-2">
                <Link href="/dashboard/integrations">
                  Connect Integration
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // No overdue invoices - celebrate!
  if (summary && summary.totalOverdue === 0) {
    return (
      <div className="min-h-screen">
        <Header
          title="Overdue Invoices"
          user={user ? { email: user.email, name: user.user_metadata.full_name } : undefined}
          showSweepButton
          onSweep={handleSweep}
          isSweeping={isSweeping}
        />
        <div className="p-6">
          <Card className="max-w-2xl mx-auto mt-12">
            <CardHeader className="text-center">
              <div className="mx-auto w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mb-4">
                <span className="text-4xl">🎉</span>
              </div>
              <CardTitle className="text-2xl text-success">All caught up!</CardTitle>
              <CardDescription className="text-base">
                You have no overdue invoices. Great job staying on top of collections!
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center pb-8">
              <Button variant="outline" asChild>
                <Link href="/dashboard/invoices">
                  View All Invoices
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Overdue Invoices"
        user={user ? { email: user.email, name: user.user_metadata.full_name } : undefined}
        showSweepButton
        onSweep={handleSweep}
        isSweeping={isSweeping}
      />

      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Overdue"
            value={formatCurrency(summary?.totalOverdueAmount || 0)}
            description={`${summary?.totalOverdue || 0} unpaid invoices`}
            icon={<DollarSign className="h-4 w-4 text-destructive" />}
            variant="danger"
          />
          <StatsCard
            title="Critical (30+ days)"
            value={formatCurrency(criticalAmount)}
            description={`${criticalCount} invoices need urgent action`}
            icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
            variant="danger"
          />
          <StatsCard
            title="Avg. Days Overdue"
            value={`${summary?.averageDaysOverdue || 0} days`}
            description="Average collection delay"
            icon={<Clock className="h-4 w-4 text-warning" />}
            variant="warning"
          />
          <StatsCard
            title="Customers Affected"
            value={summary?.topOverdueCustomers?.length || 0}
            description="With overdue invoices"
            icon={<Users className="h-4 w-4 text-muted-foreground" />}
          />
        </div>

        {/* Main content grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Aging Breakdown Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-muted-foreground" />
                Aging Breakdown
              </CardTitle>
              <CardDescription>
                Overdue amounts by how long they&apos;ve been past due
              </CardDescription>
            </CardHeader>
            <CardContent>
              {summary?.agingBreakdown && (
                <OverdueChart data={summary.agingBreakdown} />
              )}
            </CardContent>
          </Card>

          {/* Top Overdue Customers */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-destructive" />
                Top Overdue Customers
              </CardTitle>
              <CardDescription>
                Customers with the highest outstanding amounts
              </CardDescription>
            </CardHeader>
            <CardContent>
              {summary?.topOverdueCustomers && summary.topOverdueCustomers.length > 0 ? (
                <div className="space-y-4">
                  {summary.topOverdueCustomers.map((item, index) => {
                    const urgency = getUrgencyBadge(item.maxDaysOverdue)
                    return (
                      <div key={item.customer.id || index} className="flex items-center gap-4">
                        <Avatar className="h-10 w-10 border">
                          <AvatarFallback className="bg-destructive/10 text-destructive text-sm font-medium">
                            {getInitials(item.customer.name || 'UN')}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{item.customer.name}</p>
                            <Badge variant="outline" className={urgency.className}>
                              {urgency.label}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {item.invoiceCount} invoice{item.invoiceCount !== 1 ? 's' : ''} • {item.maxDaysOverdue} days max
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-destructive">
                            {formatCurrency(item.totalAmount)}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No overdue customers
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Overdue Invoices */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Overdue Invoices
              </CardTitle>
              <CardDescription>
                Invoices that have passed their due date
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/invoices">
                View All
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {summary?.overdueInvoices && summary.overdueInvoices.length > 0 ? (
              <div className="space-y-3">
                {summary.overdueInvoices.map((invoice) => {
                  const urgency = getUrgencyBadge(invoice.daysOverdue)
                  return (
                    <div
                      key={invoice.id}
                      className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex-shrink-0">
                        <div className={`w-2 h-12 rounded-full ${
                          invoice.daysOverdue >= 60 ? 'bg-red-900' :
                          invoice.daysOverdue >= 30 ? 'bg-red-600' :
                          invoice.daysOverdue >= 14 ? 'bg-orange-500' : 'bg-amber-500'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium">{invoice.customer?.name || 'Unknown Customer'}</p>
                          <Badge variant="outline" className={urgency.className}>
                            {invoice.daysOverdue} days overdue
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                          <span className="font-mono">{invoice.invoiceNumber}</span>
                          <span>•</span>
                          <span>Due {format(new Date(invoice.dueDate), 'MMM d, yyyy')}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-lg text-destructive">
                          {formatCurrency(invoice.amountDue)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <Mail className="h-3.5 w-3.5" />
                          Remind
                        </Button>
                        {invoice.paymentUrl && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                            <a href={invoice.paymentUrl} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No overdue invoices found
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
