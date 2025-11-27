'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'
import { formatDistanceToNow, format } from 'date-fns'
import {
  ArrowLeft,
  Mail,
  FileText,
  Activity,
  Edit,
  Save,
  X,
  Download,
  ExternalLink,
  Send,
  CheckCircle2,
  Clock,
  AlertCircle,
  Eye,
  Palette,
  Image,
  MessageSquare,
  Phone,
  Zap,
  Settings,
  Play,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Campaign, EmailLog, Invoice, EmailTemplate, CampaignStatus } from '@/types/database'

interface CampaignWithDetails extends Campaign {
  invoices: (Invoice & { customer: { name: string; email: string | null } })[]
  emailLogs: EmailLog[]
  templates: EmailTemplate[]
}

export default function CampaignDetailPage() {
  const params = useParams()
  const router = useRouter()
  const campaignId = params.id as string
  const supabase = createClient()

  const [campaign, setCampaign] = useState<CampaignWithDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null)
  const [templateSubject, setTemplateSubject] = useState('')
  const [templateBody, setTemplateBody] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [isRunningNow, setIsRunningNow] = useState(false)
  const [isSendingTest, setIsSendingTest] = useState<string | null>(null)
  
  // Template customization state
  const [templateCustomization, setTemplateCustomization] = useState({
    primaryColor: '#10b981',
    buttonColor: '#10b981',
    buttonText: 'Pay Now',
    buttonStyle: 'rounded',
    showLogo: false,
    logoUrl: '',
    companyName: '',
    footerText: '',
    includePayButton: true,
    includeInvoiceLink: true,
  })

  useEffect(() => {
    loadCampaign()
  }, [campaignId])

  async function loadCampaign() {
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

    // Load campaign
    const { data: campaignData } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('org_id', org.id)
      .single()

    if (!campaignData) {
      setIsLoading(false)
      return
    }

    // Load organization details for default company name
    const { data: orgDetails } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', org.id)
      .single()

    if (orgDetails && !templateCustomization.companyName) {
      setTemplateCustomization(prev => ({ ...prev, companyName: orgDetails.name }))
    }

    // Load invoices
    const { data: invoices } = await supabase
      .from('invoices')
      .select(`
        *,
        customer:customers(name, email)
      `)
      .in('id', campaignData.target_invoice_ids || [])

    // Load email logs
    const { data: emailLogs } = await supabase
      .from('email_logs')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })

    // Load email templates
    const { data: templates } = await supabase
      .from('email_templates')
      .select('*')
      .eq('org_id', org.id)
      .order('created_at', { ascending: false })

    setCampaign({
      ...campaignData,
      invoices: (invoices || []) as any,
      emailLogs: emailLogs || [],
      templates: templates || [],
    } as CampaignWithDetails)
    setIsLoading(false)
  }

  async function updateCampaignStatus(status: CampaignStatus) {
    const { error } = await supabase
      .from('campaigns')
      .update({ status })
      .eq('id', campaignId)

    if (error) {
      toast.error('Failed to update campaign')
      return
    }

    toast.success(`Campaign ${status === 'active' ? 'activated' : 'paused'}`)
    loadCampaign()
  }

  async function startEditingTemplate(template: EmailTemplate) {
    setEditingTemplate(template.id)
    setTemplateSubject(template.subject)
    setTemplateBody(template.body)
    
    // Load customization from template metadata if available
    const metadata = (template as any).metadata || {}
    if (metadata.customization) {
      setTemplateCustomization({ ...templateCustomization, ...metadata.customization })
    }
  }

  async function saveTemplate(templateId: string) {
    const { error } = await supabase
      .from('email_templates')
      .update({
        subject: templateSubject,
        body: templateBody,
        metadata: {
          customization: templateCustomization,
        },
      })
      .eq('id', templateId)

    if (error) {
      toast.error('Failed to save template')
      return
    }

    toast.success('Template updated')
    setEditingTemplate(null)
    loadCampaign()
  }

  async function handleRunNow() {
    setIsRunningNow(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/execute`, {
        method: 'POST',
      })
      
      if (res.ok) {
        const result = await res.json()
        toast.success(`Campaign executed! ${result.emailsSent || 0} emails sent.`)
        loadCampaign() // Reload to show updates
      } else {
        const error = await res.json()
        toast.error(error.error || 'Failed to execute campaign')
      }
    } catch (error) {
      console.error('Error executing campaign:', error)
      toast.error('Failed to execute campaign')
    } finally {
      setIsRunningNow(false)
    }
  }

  async function handleSendTestEmail(templateId: string) {
    setIsSendingTest(templateId)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) {
        toast.error('No email address found')
        return
      }

      const template = campaign?.templates.find(t => t.id === templateId)
      if (!template) {
        toast.error('Template not found')
        return
      }

      const res = await fetch('/api/email/test-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          campaignId,
          to: user.email,
        }),
      })

      if (res.ok) {
        toast.success(`Test email sent to ${user.email}`)
      } else {
        const error = await res.json()
        toast.error(error.error || 'Failed to send test email')
      }
    } catch (error) {
      console.error('Error sending test email:', error)
      toast.error('Failed to send test email')
    } finally {
      setIsSendingTest(null)
    }
  }

  function renderEmailPreview() {
    const sampleInvoice = campaign?.invoices[0]
    const sampleCustomer = sampleInvoice?.customer
    
    // Use actual data or show placeholder message if no data
    if (!sampleInvoice || !sampleCustomer) {
      return (
        <div className="border rounded-lg p-8 text-center text-muted-foreground">
          <p>No invoice data available for preview.</p>
          <p className="text-sm mt-2">Add invoices to the campaign to see a preview.</p>
        </div>
      )
    }
    
    // Replace template variables with actual data
    let previewBody = templateBody
      .replace(/\{\{customerName\}\}/g, sampleCustomer.name)
      .replace(/\{\{invoiceNumber\}\}/g, sampleInvoice.invoice_number || sampleInvoice.external_id.slice(0, 8))
      .replace(/\{\{amount\}\}/g, formatCurrency(sampleInvoice.amount_due))
      .replace(/\{\{dueDate\}\}/g, format(new Date(sampleInvoice.due_date), 'MMM d, yyyy'))
      .replace(/\{\{companyName\}\}/g, templateCustomization.companyName || campaign?.name || 'Your Company')

    const previewSubject = templateSubject
      .replace(/\{\{customerName\}\}/g, sampleCustomer.name)
      .replace(/\{\{invoiceNumber\}\}/g, sampleInvoice.invoice_number || sampleInvoice.external_id.slice(0, 8))
      .replace(/\{\{amount\}\}/g, formatCurrency(sampleInvoice.amount_due))
      .replace(/\{\{dueDate\}\}/g, format(new Date(sampleInvoice.due_date), 'MMM d, yyyy'))
      .replace(/\{\{companyName\}\}/g, templateCustomization.companyName || campaign?.name || 'Your Company')

    return (
      <div className="border rounded-lg overflow-hidden bg-white">
        <div className="bg-muted px-4 py-2 border-b flex items-center justify-between">
          <p className="text-sm font-medium">Email Preview</p>
          {sampleCustomer?.email && (
            <div className="text-xs text-muted-foreground">
              To: {sampleCustomer.email}
            </div>
          )}
        </div>
        <div className="p-6 bg-gray-50">
          <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-sm border">
            {/* Header */}
            {templateCustomization.showLogo && templateCustomization.logoUrl && (
              <div className="p-6 border-b">
                <img src={templateCustomization.logoUrl} alt="Logo" className="h-12" />
              </div>
            )}
            
            {/* Subject */}
            <div className="px-6 pt-6 pb-2">
              <p className="text-xs text-muted-foreground mb-1">Subject:</p>
              <p className="font-semibold">{previewSubject}</p>
            </div>

            {/* Body */}
            <div className="px-6 py-4">
              <div className="prose prose-sm max-w-none">
                {previewBody.split('\n').map((line, i) => (
                  <p key={i} className="mb-3 text-gray-700">{line || '\u00A0'}</p>
                ))}
              </div>

              {/* Pay Button */}
              {templateCustomization.includePayButton && (
                <div className="mt-6 text-center">
                  <button
                    style={{
                      backgroundColor: templateCustomization.buttonColor,
                      borderRadius: templateCustomization.buttonStyle === 'rounded' ? '8px' : '4px',
                    }}
                    className="px-8 py-3 text-white font-semibold hover:opacity-90 transition-opacity"
                  >
                    {templateCustomization.buttonText}
                  </button>
                </div>
              )}

              {/* Invoice Link */}
              {templateCustomization.includeInvoiceLink && (
                <div className="mt-4 text-center">
                  <a href="#" className="text-sm text-blue-600 underline">
                    View Invoice PDF
                  </a>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t">
              <p className="text-xs text-gray-500 text-center">
                {templateCustomization.footerText || 'This email was sent by Reluit on behalf of the sender.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  async function createTemplate() {
    if (!campaign) return

    const { error } = await supabase
      .from('email_templates')
      .insert({
        org_id: campaign.org_id,
        name: 'New Template',
        subject: 'Invoice Reminder',
        body: 'Dear {{customerName}},\n\nThis is a reminder about invoice {{invoiceNumber}} for {{amount}}.\n\nPlease make payment at your earliest convenience.\n\nThank you,\n{{companyName}}',
        tone: 'professional',
        stage: 'reminder',
      })

    if (error) {
      toast.error('Failed to create template')
      return
    }

    toast.success('Template created')
    loadCampaign()
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
      sent: { variant: 'default', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
      delivered: { variant: 'default', className: 'bg-green-500/10 text-green-600 border-green-500/20' },
      opened: { variant: 'default', className: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
      clicked: { variant: 'default', className: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20' },
      bounced: { variant: 'destructive', className: '' },
      failed: { variant: 'destructive', className: '' },
    }
    const style = styles[status] || { variant: 'outline', className: '' }
    return <Badge variant={style.variant} className={style.className}>{status}</Badge>
  }

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <Header title="Campaign Details" />
        <div className="p-6">
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="min-h-screen">
        <Header title="Campaign Not Found" />
        <div className="p-6">
          <Card>
            <CardContent className="pt-6">
              <p>Campaign not found</p>
              <Button asChild className="mt-4">
                <Link href="/dashboard/campaigns">Back to Campaigns</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  const stats = campaign.stats

  return (
    <div className="min-h-screen">
      <Header
        title={campaign.name}
        description={campaign.description || 'Campaign details and management'}
      />

      <div className="p-6 space-y-6">
        {/* Header Actions */}
        <div className="flex items-center justify-between">
          <Button variant="outline" asChild>
            <Link href="/dashboard/campaigns">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Campaigns
            </Link>
          </Button>
          <div className="flex gap-2">
            {campaign.status === 'active' ? (
              <Button variant="outline" onClick={() => updateCampaignStatus('paused')}>
                Pause Campaign
              </Button>
            ) : campaign.status === 'paused' ? (
              <Button onClick={() => updateCampaignStatus('active')}>
                Activate Campaign
              </Button>
            ) : null}
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Mail className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Emails Sent</p>
                  <p className="text-2xl font-bold">{stats.emailsSent}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Opened</p>
                  <p className="text-2xl font-bold">
                    {stats.emailsSent > 0 ? Math.round((stats.emailsOpened / stats.emailsSent) * 100) : 0}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <ExternalLink className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Clicked</p>
                  <p className="text-2xl font-bold">
                    {stats.emailsSent > 0 ? Math.round((stats.emailsClicked / stats.emailsSent) * 100) : 0}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Collected</p>
                  <p className="text-2xl font-bold text-emerald-600">{formatCurrency(stats.amountCollected)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="invoices" className="space-y-4">
          <TabsList>
            <TabsTrigger value="invoices">
              <FileText className="h-4 w-4 mr-2" />
              Invoices ({campaign.invoices.length})
            </TabsTrigger>
            <TabsTrigger value="templates">
              <Mail className="h-4 w-4 mr-2" />
              Email Templates ({campaign.templates.length})
            </TabsTrigger>
            <TabsTrigger value="sms">
              <MessageSquare className="h-4 w-4 mr-2" />
              SMS
            </TabsTrigger>
            <TabsTrigger value="phone">
              <Phone className="h-4 w-4 mr-2" />
              Phone Calls
            </TabsTrigger>
            <TabsTrigger value="automation">
              <Zap className="h-4 w-4 mr-2" />
              Automation
            </TabsTrigger>
            <TabsTrigger value="activity">
              <Activity className="h-4 w-4 mr-2" />
              Activity ({campaign.emailLogs.length})
            </TabsTrigger>
          </TabsList>

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Invoices in Campaign</CardTitle>
                <CardDescription>
                  {stats.totalInvoices} invoices · {formatCurrency(stats.totalAmount)} total
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {campaign.invoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <div>
                            <p className="font-medium">
                              {invoice.customer?.name || 'Unknown Customer'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {invoice.invoice_number || invoice.external_id.slice(0, 8)}
                            </p>
                          </div>
                          <Badge variant="outline">{invoice.risk_level}</Badge>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{formatCurrency(invoice.amount_due)}</p>
                        <p className="text-sm text-muted-foreground">
                          Due {format(new Date(invoice.due_date), 'MMM d, yyyy')}
                        </p>
                      </div>
                      <div className="ml-4 flex gap-2">
                        {invoice.pdf_url && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={invoice.pdf_url} target="_blank" rel="noopener noreferrer">
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        {invoice.payment_url && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={invoice.payment_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Email Templates Tab */}
          <TabsContent value="templates" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Email Templates</CardTitle>
                    <CardDescription>
                      Customize email templates for different campaign stages
                    </CardDescription>
                  </div>
                  <Button onClick={createTemplate}>
                    <Mail className="h-4 w-4 mr-2" />
                    New Template
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {campaign.templates.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Mail className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No templates yet. Create your first template.</p>
                    </div>
                  ) : (
                    campaign.templates.map((template) => (
                      <Card key={template.id}>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <div>
                              <CardTitle className="text-base">{template.name}</CardTitle>
                              <div className="flex gap-2 mt-2">
                                <Badge variant="outline">{template.tone}</Badge>
                                <Badge variant="outline">{template.stage}</Badge>
                                {template.is_default && (
                                  <Badge variant="default">Default</Badge>
                                )}
                              </div>
                            </div>
                            {editingTemplate === template.id ? (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => saveTemplate(template.id)}
                                >
                                  <Save className="h-4 w-4 mr-2" />
                                  Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingTemplate(null)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => startEditingTemplate(template)}
                              >
                                <Edit className="h-4 w-4 mr-2" />
                                Edit
                              </Button>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent>
                          {editingTemplate === template.id ? (
                            <div className="space-y-6">
                              {/* Basic Content */}
                              <div className="space-y-4">
                                <div className="space-y-2">
                                  <Label>Subject</Label>
                                  <Input
                                    value={templateSubject}
                                    onChange={(e) => setTemplateSubject(e.target.value)}
                                    placeholder="Email subject"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Body</Label>
                                  <Textarea
                                    value={templateBody}
                                    onChange={(e) => setTemplateBody(e.target.value)}
                                    placeholder="Email body"
                                    rows={8}
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Available variables: {'{'}customerName{'}'}, {'{'}invoiceNumber{'}'}, {'{'}amount{'}'}, {'{'}dueDate{'}'}, {'{'}companyName{'}'}
                                  </p>
                                </div>
                              </div>

                              {/* Customization Options */}
                              <div className="border-t pt-4 space-y-4">
                                <div className="flex items-center gap-2">
                                  <Palette className="h-4 w-4 text-muted-foreground" />
                                  <Label className="text-base font-semibold">Customization</Label>
                                </div>

                                {/* Colors */}
                                <div className="grid gap-4 md:grid-cols-2">
                                  <div className="space-y-2">
                                    <Label>Primary Color</Label>
                                    <div className="flex gap-2">
                                      <Input
                                        type="color"
                                        value={templateCustomization.primaryColor}
                                        onChange={(e) => setTemplateCustomization({ ...templateCustomization, primaryColor: e.target.value })}
                                        className="h-10 w-20"
                                      />
                                      <Input
                                        type="text"
                                        value={templateCustomization.primaryColor}
                                        onChange={(e) => setTemplateCustomization({ ...templateCustomization, primaryColor: e.target.value })}
                                        placeholder="#10b981"
                                        className="flex-1"
                                      />
                                    </div>
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Button Color</Label>
                                    <div className="flex gap-2">
                                      <Input
                                        type="color"
                                        value={templateCustomization.buttonColor}
                                        onChange={(e) => setTemplateCustomization({ ...templateCustomization, buttonColor: e.target.value })}
                                        className="h-10 w-20"
                                      />
                                      <Input
                                        type="text"
                                        value={templateCustomization.buttonColor}
                                        onChange={(e) => setTemplateCustomization({ ...templateCustomization, buttonColor: e.target.value })}
                                        placeholder="#10b981"
                                        className="flex-1"
                                      />
                                    </div>
                                  </div>
                                </div>

                                {/* Branding */}
                                <div className="space-y-4">
                                  <div className="space-y-2">
                                    <Label>Company Name</Label>
                                    <Input
                                      value={templateCustomization.companyName}
                                      onChange={(e) => setTemplateCustomization({ ...templateCustomization, companyName: e.target.value })}
                                      placeholder="Your Company Name"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      <Checkbox
                                        id={`logo-${template.id}`}
                                        checked={templateCustomization.showLogo}
                                        onCheckedChange={(checked) => setTemplateCustomization({ ...templateCustomization, showLogo: !!checked })}
                                      />
                                      <Label htmlFor={`logo-${template.id}`} className="cursor-pointer">
                                        Show Logo
                                      </Label>
                                    </div>
                                    {templateCustomization.showLogo && (
                                      <Input
                                        value={templateCustomization.logoUrl}
                                        onChange={(e) => setTemplateCustomization({ ...templateCustomization, logoUrl: e.target.value })}
                                        placeholder="https://example.com/logo.png"
                                      />
                                    )}
                                  </div>
                                </div>

                                {/* Pay Button Options */}
                                <div className="space-y-4 border-t pt-4">
                                  <div className="flex items-center gap-2">
                                    <Checkbox
                                      id={`pay-button-${template.id}`}
                                      checked={templateCustomization.includePayButton}
                                      onCheckedChange={(checked) => setTemplateCustomization({ ...templateCustomization, includePayButton: !!checked })}
                                    />
                                    <Label htmlFor={`pay-button-${template.id}`} className="cursor-pointer font-medium">
                                      Include Pay Button
                                    </Label>
                                  </div>
                                  {templateCustomization.includePayButton && (
                                    <div className="grid gap-4 md:grid-cols-2 pl-6">
                                      <div className="space-y-2">
                                        <Label>Button Text</Label>
                                        <Input
                                          value={templateCustomization.buttonText}
                                          onChange={(e) => setTemplateCustomization({ ...templateCustomization, buttonText: e.target.value })}
                                          placeholder="Pay Now"
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <Label>Button Style</Label>
                                        <Select
                                          value={templateCustomization.buttonStyle}
                                          onValueChange={(value) => setTemplateCustomization({ ...templateCustomization, buttonStyle: value })}
                                        >
                                          <SelectTrigger>
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="rounded">Rounded</SelectItem>
                                            <SelectItem value="square">Square</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-2 pl-6">
                                    <Checkbox
                                      id={`invoice-link-${template.id}`}
                                      checked={templateCustomization.includeInvoiceLink}
                                      onCheckedChange={(checked) => setTemplateCustomization({ ...templateCustomization, includeInvoiceLink: !!checked })}
                                    />
                                    <Label htmlFor={`invoice-link-${template.id}`} className="cursor-pointer">
                                      Include Invoice PDF Link
                                    </Label>
                                  </div>
                                </div>

                                {/* Footer */}
                                <div className="space-y-2 border-t pt-4">
                                  <Label>Footer Text</Label>
                                  <Textarea
                                    value={templateCustomization.footerText}
                                    onChange={(e) => setTemplateCustomization({ ...templateCustomization, footerText: e.target.value })}
                                    placeholder="This email was sent by Reluit on behalf of the sender."
                                    rows={2}
                                  />
                                </div>
                              </div>

                              {/* Preview */}
                              <div className="border-t pt-4">
                                <div className="flex items-center justify-between mb-4">
                                  <div className="flex items-center gap-2">
                                    <Eye className="h-4 w-4 text-muted-foreground" />
                                    <Label className="text-base font-semibold">Preview</Label>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setShowPreview(!showPreview)}
                                    >
                                      {showPreview ? 'Hide' : 'Show'} Preview
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleSendTestEmail(template.id)}
                                      disabled={isSendingTest === template.id}
                                    >
                                      {isSendingTest === template.id ? (
                                        <>
                                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                          Sending...
                                        </>
                                      ) : (
                                        <>
                                          <Send className="h-4 w-4 mr-2" />
                                          Send Test
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                </div>
                                {showPreview && renderEmailPreview()}
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div>
                                <p className="text-sm font-medium mb-1">Subject:</p>
                                <p className="text-sm text-muted-foreground">{template.subject}</p>
                              </div>
                              <div>
                                <p className="text-sm font-medium mb-1">Body:</p>
                                <div className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted p-3 rounded">
                                  {template.body}
                                </div>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SMS Tab - Coming Soon */}
          <TabsContent value="sms" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>SMS Campaigns</CardTitle>
                <CardDescription>
                  Send automated SMS reminders to customers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 mb-4">
                    <MessageSquare className="h-8 w-8 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Coming Soon</h3>
                  <p className="text-muted-foreground max-w-md mx-auto mb-6">
                    SMS campaigns are currently under development. You'll be able to send automated text message reminders to customers about their overdue invoices.
                  </p>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p className="font-medium">Planned Features:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Automated SMS reminders</li>
                      <li>Customizable message templates</li>
                      <li>Delivery tracking and analytics</li>
                      <li>Two-way SMS conversations</li>
                      <li>Integration with email campaigns</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Phone Calls Tab - Coming Soon */}
          <TabsContent value="phone" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Phone Call Campaigns</CardTitle>
                <CardDescription>
                  Automated phone calls for high-priority collections
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 mb-4">
                    <Phone className="h-8 w-8 text-green-600" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Coming Soon</h3>
                  <p className="text-muted-foreground max-w-md mx-auto mb-6">
                    Automated phone call campaigns are coming soon. Reach out to customers directly with AI-powered voice calls for critical overdue invoices.
                  </p>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p className="font-medium">Planned Features:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>AI-powered voice calls</li>
                      <li>Natural conversation flow</li>
                      <li>Payment processing via phone</li>
                      <li>Call recording and transcription</li>
                      <li>Escalation to human agents</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Automation Tab */}
          <TabsContent value="automation" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Automation Settings</CardTitle>
                <CardDescription>
                  Configure automated workflows for this campaign
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Auto-send Settings */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">Email Automation</h3>
                  </div>
                  
                  <div className="space-y-4 pl-7">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-1">
                        <Label className="font-medium">Auto-send Emails</Label>
                        <p className="text-sm text-muted-foreground">
                          Automatically send emails based on campaign schedule
                        </p>
                      </div>
                      <Checkbox checked={campaign.status === 'active'} disabled />
                    </div>

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-1">
                        <Label className="font-medium">Smart Timing</Label>
                        <p className="text-sm text-muted-foreground">
                          Send emails at optimal times based on customer timezone
                        </p>
                      </div>
                      <Checkbox defaultChecked />
                    </div>

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-1">
                        <Label className="font-medium">Auto-pause on Payment</Label>
                        <p className="text-sm text-muted-foreground">
                          Automatically pause campaign when invoice is paid
                        </p>
                      </div>
                      <Checkbox defaultChecked />
                    </div>

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-1">
                        <Label className="font-medium">Escalate Tone Automatically</Label>
                        <p className="text-sm text-muted-foreground">
                          Automatically increase email tone urgency with each follow-up
                        </p>
                      </div>
                      <Checkbox checked={campaign.config?.escalateTone} disabled />
                    </div>
                  </div>
                </div>

                {/* AI Agent Settings */}
                <div className="space-y-4 border-t pt-6">
                  <div className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">AI Agent Management</h3>
                  </div>
                  
                  <div className="space-y-4 pl-7">
                    <div className="p-4 border rounded-lg bg-muted/50">
                      <div className="flex items-start gap-3">
                        <div className="mt-1">
                          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                        </div>
                        <div className="flex-1">
                          <Label className="font-medium">AI Agent Active</Label>
                          <p className="text-sm text-muted-foreground mt-1">
                            The AI agent is managing all communications for this campaign. It will:
                          </p>
                          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground mt-2 ml-2">
                            <li>Generate personalized email content</li>
                            <li>Respond to customer replies automatically</li>
                            <li>Adjust tone and messaging based on customer behavior</li>
                            <li>Schedule follow-ups at optimal times</li>
                            <li>Escalate to human review when needed</li>
                          </ul>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-1">
                        <Label className="font-medium">Auto-respond to Replies</Label>
                        <p className="text-sm text-muted-foreground">
                          AI agent automatically responds to customer email replies
                        </p>
                      </div>
                      <Checkbox defaultChecked />
                    </div>

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-1">
                        <Label className="font-medium">Smart Escalation</Label>
                        <p className="text-sm text-muted-foreground">
                          Automatically flag conversations needing human attention
                        </p>
                      </div>
                      <Checkbox defaultChecked />
                    </div>
                  </div>
                </div>

                {/* Campaign Schedule */}
                <div className="space-y-4 border-t pt-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-primary" />
                      <h3 className="text-lg font-semibold">Campaign Schedule</h3>
                    </div>
                    <Button
                      size="sm"
                      onClick={handleRunNow}
                      disabled={isRunningNow || campaign.status !== 'active'}
                    >
                      {isRunningNow ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Running...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Run Now
                        </>
                      )}
                    </Button>
                  </div>
                  
                  {/* Cron Schedule Info */}
                  <div className="pl-7 space-y-4">
                    <div className="p-4 border rounded-lg bg-muted/50">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-medium text-sm">Daily Automation</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Runs daily at 9 AM UTC to process all tasks
                            </p>
                          </div>
                          <Badge variant="outline" className="font-mono text-xs">
                            Daily
                          </Badge>
                        </div>
                        <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg">
                          <p className="text-xs font-medium text-blue-900 dark:text-blue-100 mb-1">
                            ⚡ Use "Run Now" for immediate execution
                          </p>
                          <p className="text-xs text-blue-700 dark:text-blue-300">
                            The daily cron job handles: campaign execution, auto-creation, payment checks, and scheduled tasks. For faster processing, use the "Run Now" button.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Campaign Stages */}
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-muted-foreground">Email Stages:</p>
                      {campaign.config?.stages?.map((stage, index) => (
                        <div key={index} className="p-4 border rounded-lg">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium capitalize">{stage.stage.replace('_', ' ')}</p>
                              <p className="text-sm text-muted-foreground">
                                {stage.daysTrigger === 0 
                                  ? 'Immediately' 
                                  : `After ${stage.daysTrigger} days`} · {stage.tone} tone
                              </p>
                            </div>
                            <Badge variant="outline">{stage.tone}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                  <p className="text-sm font-medium text-primary mb-1">✨ Fully Automated</p>
                  <p className="text-sm text-muted-foreground">
                    This campaign runs completely automatically. No manual work required. The AI agent handles all communications, scheduling, and follow-ups.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Email Activity</CardTitle>
                <CardDescription>
                  Track all emails sent through this campaign
                </CardDescription>
              </CardHeader>
              <CardContent>
                {campaign.emailLogs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No emails sent yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {campaign.emailLogs.map((log) => {
                      const invoice = campaign.invoices.find((inv) => inv.id === log.invoice_id)
                      return (
                        <div
                          key={log.id}
                          className="flex items-start gap-4 p-4 border rounded-lg"
                        >
                          <div className="mt-1">
                            {log.status === 'sent' || log.status === 'delivered' ? (
                              <CheckCircle2 className="h-5 w-5 text-green-600" />
                            ) : log.status === 'opened' || log.status === 'clicked' ? (
                              <CheckCircle2 className="h-5 w-5 text-blue-600" />
                            ) : log.status === 'failed' || log.status === 'bounced' ? (
                              <AlertCircle className="h-5 w-5 text-red-600" />
                            ) : (
                              <Clock className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium">{log.to_email}</p>
                              {getStatusBadge(log.status)}
                            </div>
                            <p className="text-sm font-medium mb-1">{log.subject}</p>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {log.body}
                            </p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                              {invoice && (
                                <span>
                                  Invoice: {invoice.invoice_number || invoice.external_id.slice(0, 8)}
                                </span>
                              )}
                              {log.sent_at && (
                                <span>
                                  Sent: {formatDistanceToNow(new Date(log.sent_at), { addSuffix: true })}
                                </span>
                              )}
                              {log.opened_at && (
                                <span>
                                  Opened: {formatDistanceToNow(new Date(log.opened_at), { addSuffix: true })}
                                </span>
                              )}
                              {log.clicked_at && (
                                <span>
                                  Clicked: {formatDistanceToNow(new Date(log.clicked_at), { addSuffix: true })}
                                </span>
                              )}
                            </div>
                            {log.error_message && (
                              <p className="text-xs text-red-600 mt-1">
                                Error: {log.error_message}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

