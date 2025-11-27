'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import {
  Search,
  Filter,
  ExternalLink,
  Mail,
  MoreHorizontal,
  AlertTriangle,
  Clock,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Invoice, Customer } from '@/types/database'

type InvoiceWithCustomer = Invoice & { customer: Pick<Customer, 'name' | 'email'> }

type AgingFilter = 'all' | '1-7' | '8-14' | '15-30' | '31-60' | '60+'

const agingLabels: Record<AgingFilter, string> = {
  all: 'All Overdue',
  '1-7': '1-7 Days Overdue',
  '8-14': '8-14 Days Overdue',
  '15-30': '15-30 Days Overdue',
  '31-60': '31-60 Days Overdue',
  '60+': '60+ Days Overdue',
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<(InvoiceWithCustomer & { daysOverdue: number })[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [agingFilter, setAgingFilter] = useState<AgingFilter>('all')
  const [totalOverdue, setTotalOverdue] = useState(0)
  const supabase = createClient()

  useEffect(() => {
    loadInvoices()
  }, [])

  async function loadInvoices() {
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

    // Only get unpaid invoices
    const { data } = await supabase
      .from('invoices')
      .select(`
        *,
        customer:customers(name, email)
      `)
      .eq('org_id', org.id)
      .neq('status', 'paid')
      .neq('status', 'cancelled')
      .neq('status', 'void')
      .order('due_date', { ascending: true })

    const now = new Date()
    
    // Filter to only overdue and calculate days
    const overdueInvoices = ((data as unknown as InvoiceWithCustomer[]) || [])
      .map(inv => {
        const dueDate = new Date(inv.due_date)
        const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
        return { ...inv, daysOverdue }
      })
      .filter(inv => inv.daysOverdue > 0) // Only overdue
      .sort((a, b) => b.daysOverdue - a.daysOverdue) // Most overdue first

    setInvoices(overdueInvoices)
    setTotalOverdue(overdueInvoices.reduce((sum, inv) => sum + Number(inv.amount_due), 0))
    setIsLoading(false)
  }

  const filteredInvoices = invoices.filter(inv => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matchesSearch = (
        inv.customer?.name?.toLowerCase().includes(query) ||
        inv.invoice_number?.toLowerCase().includes(query) ||
        inv.customer?.email?.toLowerCase().includes(query)
      )
      if (!matchesSearch) return false
    }

    // Aging filter
    if (agingFilter !== 'all') {
      switch (agingFilter) {
        case '1-7':
          if (inv.daysOverdue < 1 || inv.daysOverdue > 7) return false
          break
        case '8-14':
          if (inv.daysOverdue < 8 || inv.daysOverdue > 14) return false
          break
        case '15-30':
          if (inv.daysOverdue < 15 || inv.daysOverdue > 30) return false
          break
        case '31-60':
          if (inv.daysOverdue < 31 || inv.daysOverdue > 60) return false
          break
        case '60+':
          if (inv.daysOverdue <= 60) return false
          break
      }
    }

    return true
  })

  const formatCurrency = (amount: number, currency: string = 'USD') =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount)

  const getUrgencyStyle = (daysOverdue: number) => {
    if (daysOverdue >= 60) return { bg: 'bg-red-900/20', text: 'text-red-400', border: 'border-red-900/30', label: 'Critical' }
    if (daysOverdue >= 30) return { bg: 'bg-red-600/20', text: 'text-red-500', border: 'border-red-600/30', label: 'Severe' }
    if (daysOverdue >= 14) return { bg: 'bg-orange-500/20', text: 'text-orange-500', border: 'border-orange-500/30', label: 'High' }
    return { bg: 'bg-amber-500/20', text: 'text-amber-500', border: 'border-amber-500/30', label: 'Moderate' }
  }

  const filteredTotal = filteredInvoices.reduce((sum, inv) => sum + Number(inv.amount_due), 0)

  return (
    <div className="min-h-screen">
      <Header
        title="Overdue Invoices"
        description="Track and collect on past-due invoices"
      />

      <div className="p-6 space-y-6">
        {/* Summary Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="bg-destructive/5 border-destructive/20">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Overdue</p>
                  <p className="text-2xl font-bold text-destructive">{formatCurrency(totalOverdue)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Overdue Invoices</p>
                  <p className="text-2xl font-bold">{invoices.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <Filter className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Filtered Total</p>
                  <p className="text-2xl font-bold">{formatCurrency(filteredTotal)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by customer, invoice number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={agingFilter} onValueChange={(v) => setAgingFilter(v as AgingFilter)}>
            <SelectTrigger className="w-[200px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filter by aging" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Overdue</SelectItem>
              <SelectItem value="1-7">1-7 Days</SelectItem>
              <SelectItem value="8-14">8-14 Days</SelectItem>
              <SelectItem value="15-30">15-30 Days</SelectItem>
              <SelectItem value="31-60">31-60 Days</SelectItem>
              <SelectItem value="60+">60+ Days (Critical)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Invoices Table */}
        <Card>
          <CardHeader>
            <CardTitle>
              {agingLabels[agingFilter]}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? 's' : ''})
              </span>
            </CardTitle>
            <CardDescription>
              Sorted by days overdue (most urgent first)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredInvoices.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">🎉</div>
                <p className="font-medium">No overdue invoices!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {searchQuery || agingFilter !== 'all' 
                    ? 'Try adjusting your filters'
                    : 'All invoices are current'}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">Urgency</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Amount Due</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Days Overdue</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map((invoice) => {
                    const urgency = getUrgencyStyle(invoice.daysOverdue)

                    return (
                      <TableRow key={invoice.id} className="group">
                        <TableCell>
                          <div className={`w-3 h-10 rounded-full ${
                            invoice.daysOverdue >= 60 ? 'bg-red-900' :
                            invoice.daysOverdue >= 30 ? 'bg-red-600' :
                            invoice.daysOverdue >= 14 ? 'bg-orange-500' : 'bg-amber-500'
                          }`} />
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{invoice.customer?.name || 'Unknown'}</p>
                            <p className="text-sm text-muted-foreground">
                              {invoice.customer?.email || 'No email'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm">
                            {invoice.invoice_number || invoice.external_id.slice(0, 8)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <p className="font-semibold text-destructive">
                            {formatCurrency(invoice.amount_due, invoice.currency)}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p>{format(new Date(invoice.due_date), 'MMM d, yyyy')}</p>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`${urgency.bg} ${urgency.text} ${urgency.border}`}
                          >
                            {invoice.daysOverdue} days • {urgency.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="outline" size="sm" className="gap-1.5 h-8">
                              <Mail className="h-3.5 w-3.5" />
                              Remind
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {invoice.payment_url && (
                                  <DropdownMenuItem asChild>
                                    <a
                                      href={invoice.payment_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <ExternalLink className="mr-2 h-4 w-4" />
                                      Payment Link
                                    </a>
                                  </DropdownMenuItem>
                                )}
                                {invoice.pdf_url && (
                                  <DropdownMenuItem asChild>
                                    <a
                                      href={invoice.pdf_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <ExternalLink className="mr-2 h-4 w-4" />
                                      View PDF
                                    </a>
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
