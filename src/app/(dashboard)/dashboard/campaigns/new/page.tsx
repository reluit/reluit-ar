'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Sparkles,
  Mail,
  Check,
} from 'lucide-react'
import Link from 'next/link'
import type { Invoice, Customer, RiskLevel, EmailTone, CampaignStage } from '@/types/database'

type InvoiceWithCustomer = Invoice & { customer: Pick<Customer, 'name' | 'email'> }

const TONES: { value: EmailTone; label: string; description: string }[] = [
  { value: 'friendly', label: 'Friendly', description: 'Warm and understanding' },
  { value: 'professional', label: 'Professional', description: 'Business-like and polite' },
  { value: 'firm', label: 'Firm', description: 'Direct and clear' },
  { value: 'urgent', label: 'Urgent', description: 'Emphasizes immediacy' },
]

export default function NewCampaignPage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState(1)
  const [isLoading, setIsLoading] = useState(false)
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false)
  const [invoices, setInvoices] = useState<InvoiceWithCustomer[]>([])
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([])
  const [riskFilter, setRiskFilter] = useState<RiskLevel | 'all'>('all')

  // Campaign config
  const [campaignName, setCampaignName] = useState('')
  const [campaignDescription, setCampaignDescription] = useState('')
  const [startingTone, setStartingTone] = useState<EmailTone>('friendly')
  const [escalateTone, setEscalateTone] = useState(true)
  const [daysBetweenEmails, setDaysBetweenEmails] = useState(5)
  const [maxAttempts, setMaxAttempts] = useState(4)
  const [includePayButton, setIncludePayButton] = useState(true)
  const [attachInvoice, setAttachInvoice] = useState(false)

  // Preview
  const [previewEmail, setPreviewEmail] = useState<{ subject: string; body: string } | null>(null)

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

    if (!org) return

    const orgId = (org as { id: string }).id

    const { data } = await supabase
      .from('invoices')
      .select(`
        *,
        customer:customers(name, email)
      `)
      .eq('org_id', orgId)
      .neq('status', 'paid')
      .neq('status', 'cancelled')
      .order('risk_level', { ascending: false })

    setInvoices((data as unknown as InvoiceWithCustomer[]) || [])
  }

  const filteredInvoices = invoices.filter(inv => {
    if (riskFilter === 'all') return true
    return inv.risk_level === riskFilter
  })

  const toggleInvoice = (id: string) => {
    setSelectedInvoiceIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const selectAll = () => {
    if (selectedInvoiceIds.length === filteredInvoices.length) {
      setSelectedInvoiceIds([])
    } else {
      setSelectedInvoiceIds(filteredInvoices.map(i => i.id))
    }
  }

  const selectedTotal = invoices
    .filter(inv => selectedInvoiceIds.includes(inv.id))
    .reduce((sum, inv) => sum + inv.amount_due, 0)

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)

  async function generatePreview() {
    if (selectedInvoiceIds.length === 0) return

    setIsGeneratingPreview(true)
    const sampleInvoice = invoices.find(inv => selectedInvoiceIds.includes(inv.id))
    
    if (!sampleInvoice) {
      setIsGeneratingPreview(false)
      return
    }

    try {
      const res = await fetch('/api/ai/generate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: sampleInvoice.customer?.name || 'Customer',
          invoiceNumber: sampleInvoice.invoice_number || sampleInvoice.external_id,
          invoiceAmount: sampleInvoice.amount_due,
          currency: sampleInvoice.currency,
          dueDate: sampleInvoice.due_date,
          tone: startingTone,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setPreviewEmail(data)
      } else {
        toast.error('Failed to generate preview')
      }
    } catch {
      toast.error('Failed to generate preview')
    } finally {
      setIsGeneratingPreview(false)
    }
  }

  async function createCampaign() {
    if (!campaignName || selectedInvoiceIds.length === 0) {
      toast.error('Please provide a name and select invoices')
      return
    }

    setIsLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('owner_id', user.id)
        .single()

      if (!org) throw new Error('Organization not found')

      const stages: { stage: CampaignStage; daysTrigger: number; tone: EmailTone }[] = []
      const toneProgression: EmailTone[] = escalateTone
        ? ['friendly', 'professional', 'firm', 'urgent']
        : [startingTone, startingTone, startingTone, startingTone]
      
      const startIndex = toneProgression.indexOf(startingTone)
      
      for (let i = 0; i < maxAttempts; i++) {
        const stageTypes: CampaignStage[] = ['reminder', 'follow_up', 'escalation', 'final_notice']
        stages.push({
          stage: stageTypes[Math.min(i, 3)],
          daysTrigger: i * daysBetweenEmails,
          tone: toneProgression[Math.min(startIndex + i, 3)],
        })
      }

      const { error } = await supabase
        .from('campaigns')
        .insert({
          org_id: org.id,
          name: campaignName,
          description: campaignDescription,
          status: 'draft',
          target_invoice_ids: selectedInvoiceIds,
          config: {
            maxAttempts,
            daysBetweenEmails,
            escalateTone,
            includePayButton,
            attachInvoice,
            stages,
          },
          stats: {
            totalInvoices: selectedInvoiceIds.length,
            totalAmount: selectedTotal,
            emailsSent: 0,
            emailsOpened: 0,
            emailsClicked: 0,
            paymentsReceived: 0,
            amountCollected: 0,
          },
        })

      if (error) throw error

      toast.success('Campaign created!')
      router.push('/dashboard/campaigns')
    } catch (err) {
      console.error(err)
      toast.error('Failed to create campaign')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Create Campaign"
        description="Set up an automated collection campaign"
      />

      <div className="p-6 max-w-4xl mx-auto">
        {/* Progress */}
        <div className="flex items-center gap-4 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step >= s
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {step > s ? <Check className="h-4 w-4" /> : s}
              </div>
              {s < 3 && (
                <div
                  className={`w-16 h-0.5 mx-2 ${
                    step > s ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Select Invoices */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Select Invoices</CardTitle>
              <CardDescription>
                Choose which invoices to include in this campaign
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Select value={riskFilter} onValueChange={(v) => setRiskFilter(v as RiskLevel | 'all')}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by risk" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Invoices</SelectItem>
                    <SelectItem value="at_risk">At Risk</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={selectAll}>
                  {selectedInvoiceIds.length === filteredInvoices.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>

              <div className="border rounded-lg max-h-[400px] overflow-y-auto">
                {filteredInvoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="flex items-center gap-4 p-4 border-b last:border-b-0 hover:bg-muted/50 cursor-pointer"
                    onClick={() => toggleInvoice(invoice.id)}
                  >
                    <Checkbox
                      checked={selectedInvoiceIds.includes(invoice.id)}
                      onCheckedChange={() => toggleInvoice(invoice.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{invoice.customer?.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {invoice.invoice_number || invoice.external_id.slice(0, 8)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatCurrency(invoice.amount_due)}</p>
                      <Badge variant="outline" className="text-xs">
                        {invoice.risk_level.replace('_', ' ')}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>

              {selectedInvoiceIds.length > 0 && (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="font-medium">
                    {selectedInvoiceIds.length} invoices selected
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Total: {formatCurrency(selectedTotal)}
                  </p>
                </div>
              )}

              <div className="flex justify-between pt-4">
                <Button variant="outline" asChild>
                  <Link href="/dashboard/campaigns">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Cancel
                  </Link>
                </Button>
                <Button
                  onClick={() => setStep(2)}
                  disabled={selectedInvoiceIds.length === 0}
                >
                  Continue
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Configure Campaign */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Configure Campaign</CardTitle>
              <CardDescription>
                Set up how your collection emails will be sent
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Campaign Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Q4 Overdue Collection"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tone">Starting Tone</Label>
                  <Select value={startingTone} onValueChange={(v) => setStartingTone(v as EmailTone)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TONES.map((tone) => (
                        <SelectItem key={tone.value} value={tone.value}>
                          <div>
                            <p>{tone.label}</p>
                            <p className="text-xs text-muted-foreground">{tone.description}</p>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Notes about this campaign..."
                  value={campaignDescription}
                  onChange={(e) => setCampaignDescription(e.target.value)}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="days">Days Between Emails</Label>
                  <Select
                    value={daysBetweenEmails.toString()}
                    onValueChange={(v) => setDaysBetweenEmails(parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3 days</SelectItem>
                      <SelectItem value="5">5 days</SelectItem>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="10">10 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="attempts">Max Follow-ups</Label>
                  <Select
                    value={maxAttempts.toString()}
                    onValueChange={(v) => setMaxAttempts(parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2 emails</SelectItem>
                      <SelectItem value="3">3 emails</SelectItem>
                      <SelectItem value="4">4 emails</SelectItem>
                      <SelectItem value="5">5 emails</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="escalate"
                    checked={escalateTone}
                    onCheckedChange={(c) => setEscalateTone(!!c)}
                  />
                  <Label htmlFor="escalate" className="cursor-pointer">
                    Escalate tone with each follow-up
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="payButton"
                    checked={includePayButton}
                    onCheckedChange={(c) => setIncludePayButton(!!c)}
                  />
                  <Label htmlFor="payButton" className="cursor-pointer">
                    Include pay button in emails
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="attachInvoice"
                    checked={attachInvoice}
                    onCheckedChange={(c) => setAttachInvoice(!!c)}
                  />
                  <Label htmlFor="attachInvoice" className="cursor-pointer">
                    Attach invoice PDF (if available)
                  </Label>
                </div>
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button onClick={() => { setStep(3); generatePreview(); }} disabled={!campaignName}>
                  Preview
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Preview & Launch */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Preview & Launch</CardTitle>
              <CardDescription>
                Review your campaign before activating
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Campaign Summary */}
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <h4 className="font-medium">{campaignName}</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Invoices:</span> {selectedInvoiceIds.length}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total:</span> {formatCurrency(selectedTotal)}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Schedule:</span> Every {daysBetweenEmails} days
                  </div>
                  <div>
                    <span className="text-muted-foreground">Max emails:</span> {maxAttempts}
                  </div>
                </div>
              </div>

              {/* Email Preview */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email Preview
                  </Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={generatePreview}
                    disabled={isGeneratingPreview}
                  >
                    {isGeneratingPreview ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Regenerate
                      </>
                    )}
                  </Button>
                </div>
                
                {isGeneratingPreview ? (
                  <div className="border rounded-lg p-8 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : previewEmail ? (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-muted px-4 py-2 border-b">
                      <p className="text-sm">
                        <span className="text-muted-foreground">Subject:</span>{' '}
                        <span className="font-medium">{previewEmail.subject}</span>
                      </p>
                    </div>
                    <div className="p-4 whitespace-pre-wrap text-sm">
                      {previewEmail.body}
                    </div>
                  </div>
                ) : (
                  <div className="border rounded-lg p-8 text-center text-muted-foreground">
                    Click "Regenerate" to preview email
                  </div>
                )}
              </div>

              <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back
                </Button>
                <Button onClick={createCampaign} disabled={isLoading}>
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Check className="h-4 w-4 mr-2" />
                  )}
                  Create Campaign
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

