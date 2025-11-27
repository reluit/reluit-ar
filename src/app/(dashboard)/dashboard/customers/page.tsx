'use client'

import React, { useEffect, useState } from 'react'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { createClient } from '@/lib/supabase/client'
import { Search, AlertTriangle, Users, Mail, ChevronRight } from 'lucide-react'

interface CustomerWithOverdue {
  id: string
  name: string
  email: string | null
  totalOverdue: number
  overdueCount: number
  maxDaysOverdue: number
  invoices: {
    id: string
    invoiceNumber: string
    amountDue: number
    daysOverdue: number
  }[]
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerWithOverdue[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    loadCustomers()
  }, [])

  async function loadCustomers() {
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

    // Get all unpaid invoices with customers
    const { data: invoices } = await supabase
      .from('invoices')
      .select(`
        id,
        invoice_number,
        external_id,
        amount_due,
        due_date,
        customer_id,
        customer:customers(id, name, email)
      `)
      .eq('org_id', org.id)
      .neq('status', 'paid')
      .neq('status', 'cancelled')
      .neq('status', 'void')

    if (!invoices) {
      setIsLoading(false)
      return
    }

    const now = new Date()

    // Group overdue invoices by customer
    const customerMap: Record<string, CustomerWithOverdue> = {}

    invoices.forEach(inv => {
      const dueDate = new Date(inv.due_date)
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
      
      // Only include overdue invoices
      if (daysOverdue <= 0) return

      const customer = inv.customer as { id: string; name: string; email: string | null } | null
      const customerId = customer?.id || inv.customer_id

      if (!customerMap[customerId]) {
        customerMap[customerId] = {
          id: customerId,
          name: customer?.name || 'Unknown Customer',
          email: customer?.email || null,
          totalOverdue: 0,
          overdueCount: 0,
          maxDaysOverdue: 0,
          invoices: [],
        }
      }

      customerMap[customerId].totalOverdue += Number(inv.amount_due)
      customerMap[customerId].overdueCount++
      customerMap[customerId].maxDaysOverdue = Math.max(customerMap[customerId].maxDaysOverdue, daysOverdue)
      customerMap[customerId].invoices.push({
        id: inv.id,
        invoiceNumber: inv.invoice_number || inv.external_id.slice(0, 8),
        amountDue: Number(inv.amount_due),
        daysOverdue,
      })
    })

    // Sort by total overdue amount descending
    const sortedCustomers = Object.values(customerMap).sort((a, b) => b.totalOverdue - a.totalOverdue)

    setCustomers(sortedCustomers)
    setIsLoading(false)
  }

  const filteredCustomers = customers.filter(cust => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      cust.name?.toLowerCase().includes(query) ||
      cust.email?.toLowerCase().includes(query)
    )
  })

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)

  const getInitials = (name: string) =>
    name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)

  const getUrgencyStyle = (daysOverdue: number) => {
    if (daysOverdue >= 60) return { bg: 'bg-red-900/20', text: 'text-red-400', border: 'border-red-900/30', label: 'Critical' }
    if (daysOverdue >= 30) return { bg: 'bg-red-600/20', text: 'text-red-500', border: 'border-red-600/30', label: 'Severe' }
    if (daysOverdue >= 14) return { bg: 'bg-orange-500/20', text: 'text-orange-500', border: 'border-orange-500/30', label: 'High' }
    return { bg: 'bg-amber-500/20', text: 'text-amber-500', border: 'border-amber-500/30', label: 'Moderate' }
  }

  const totalOverdueAmount = customers.reduce((sum, c) => sum + c.totalOverdue, 0)

  return (
    <div className="min-h-screen">
      <Header
        title="Customers with Overdue"
        description="Customers who have unpaid invoices past their due date"
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
                  <p className="text-2xl font-bold text-destructive">{formatCurrency(totalOverdueAmount)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <Users className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Customers Affected</p>
                  <p className="text-2xl font-bold">{customers.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Avg. per Customer</p>
                  <p className="text-2xl font-bold">
                    {customers.length > 0 ? formatCurrency(totalOverdueAmount / customers.length) : '$0'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Customers Table */}
        <Card>
          <CardHeader>
            <CardTitle>
              Customers with Overdue Invoices
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({filteredCustomers.length})
              </span>
            </CardTitle>
            <CardDescription>
              Sorted by total overdue amount (highest first)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-3">🎉</div>
                <p className="font-medium">No customers with overdue invoices!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  All your customers are current on payments
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Urgency</TableHead>
                    <TableHead>Overdue Invoices</TableHead>
                    <TableHead>Max Days Overdue</TableHead>
                    <TableHead>Total Overdue</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((customer) => {
                    const urgency = getUrgencyStyle(customer.maxDaysOverdue)
                    const isExpanded = expandedCustomer === customer.id

                    return (
                      <React.Fragment key={customer.id}>
                        <TableRow 
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setExpandedCustomer(isExpanded ? null : customer.id)}
                        >
                          <TableCell>
                            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9 border">
                                <AvatarFallback className="bg-destructive/10 text-destructive text-sm font-medium">
                                  {getInitials(customer.name)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{customer.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {customer.email || 'No email'}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`${urgency.bg} ${urgency.text} ${urgency.border}`}
                            >
                              {urgency.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">{customer.overdueCount}</span>
                            <span className="text-muted-foreground"> invoice{customer.overdueCount !== 1 ? 's' : ''}</span>
                          </TableCell>
                          <TableCell>
                            <span className={customer.maxDaysOverdue >= 30 ? 'text-destructive font-medium' : ''}>
                              {customer.maxDaysOverdue} days
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="font-semibold text-destructive">
                              {formatCurrency(customer.totalOverdue)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline" className="text-xs">
                              Auto-managed
                            </Badge>
                          </TableCell>
                        </TableRow>
                        {isExpanded && (
                          <TableRow>
                            <TableCell colSpan={7} className="bg-muted/30 p-0">
                              <div className="p-4 pl-12">
                                <p className="text-sm font-medium text-muted-foreground mb-3">Overdue Invoices</p>
                                <div className="space-y-2">
                                  {customer.invoices.map(inv => (
                                    <div key={inv.id} className="flex items-center justify-between p-3 rounded-lg bg-background border">
                                      <div className="flex items-center gap-4">
                                        <div className={`w-2 h-8 rounded-full ${
                                          inv.daysOverdue >= 60 ? 'bg-red-900' :
                                          inv.daysOverdue >= 30 ? 'bg-red-600' :
                                          inv.daysOverdue >= 14 ? 'bg-orange-500' : 'bg-amber-500'
                                        }`} />
                                        <div>
                                          <span className="font-mono text-sm">{inv.invoiceNumber}</span>
                                          <p className="text-sm text-muted-foreground">{inv.daysOverdue} days overdue</p>
                                        </div>
                                      </div>
                                      <span className="font-semibold text-destructive">
                                        {formatCurrency(inv.amountDue)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
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
