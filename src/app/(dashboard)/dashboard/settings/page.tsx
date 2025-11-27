'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/dashboard/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Loader2, Save, Mail, Send, Globe, Lock, CheckCircle2 } from 'lucide-react'
import type { Organization, OrganizationSettings, EmailTone } from '@/types/database'

export default function SettingsPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isSendingTest, setIsSendingTest] = useState(false)
  const [org, setOrg] = useState<Organization | null>(null)
  const [userEmail, setUserEmail] = useState('')
  
  // Form state
  const [orgName, setOrgName] = useState('')
  const [brandVoice, setBrandVoice] = useState('')
  const [settings, setSettings] = useState<OrganizationSettings>({
    timezone: 'America/New_York',
    currency: 'USD',
    defaultTone: 'professional',
    digestFrequency: 'weekly',
    emailFromName: '',
    emailReplyTo: '',
  })

  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setUserEmail(user.email || '')

    const { data: orgData } = await supabase
      .from('organizations')
      .select('*')
      .eq('owner_id', user.id)
      .single()

    if (orgData) {
      setOrg(orgData as Organization)
      setOrgName(orgData.name)
      setBrandVoice(orgData.brand_voice || '')
      const existingSettings = (orgData.settings as OrganizationSettings) || {}
      setSettings({
        timezone: existingSettings.timezone || 'America/New_York',
        currency: existingSettings.currency || 'USD',
        defaultTone: existingSettings.defaultTone || 'professional',
        digestFrequency: existingSettings.digestFrequency || 'weekly',
        emailFromName: existingSettings.emailFromName || orgData.name || '',
        emailReplyTo: existingSettings.emailReplyTo || user.email || '',
      })
    }

    setIsLoading(false)
  }

  async function sendTestEmail() {
    setIsSendingTest(true)
    try {
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: userEmail }),
      })

      const data = await res.json()
      
      if (res.ok) {
        toast.success('Test email sent! Check your inbox.')
      } else {
        toast.error(data.error || 'Failed to send test email')
      }
    } catch {
      toast.error('Failed to send test email')
    } finally {
      setIsSendingTest(false)
    }
  }

  async function handleSave() {
    if (!org) return

    setIsSaving(true)

    const { error } = await supabase
      .from('organizations')
      .update({
        name: orgName,
        brand_voice: brandVoice || null,
        settings,
      })
      .eq('id', org.id)

    if (error) {
      toast.error('Failed to save settings')
    } else {
      toast.success('Settings saved!')
    }

    setIsSaving(false)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <Header title="Settings" />
        <div className="p-6 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Settings"
        description="Manage your organization and preferences"
      />

      <div className="p-6 max-w-2xl space-y-6">
        {/* Account */}
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Your account information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={userEmail} disabled className="bg-muted" />
            </div>
          </CardContent>
        </Card>

        {/* Organization */}
        <Card>
          <CardHeader>
            <CardTitle>Organization</CardTitle>
            <CardDescription>Your business details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization Name</Label>
              <Input
                id="orgName"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Acme Inc."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brandVoice">Brand Voice</Label>
              <Textarea
                id="brandVoice"
                value={brandVoice}
                onChange={(e) => setBrandVoice(e.target.value)}
                placeholder="Describe your brand's communication style. E.g., 'Friendly and casual, we use first names and avoid corporate jargon.'"
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                This helps our AI generate emails that match your brand
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Preferences */}
        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
            <CardDescription>Default settings for collections</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Default Currency</Label>
                <Select
                  value={settings.currency}
                  onValueChange={(v) => setSettings({ ...settings, currency: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                    <SelectItem value="GBP">GBP (£)</SelectItem>
                    <SelectItem value="CAD">CAD ($)</SelectItem>
                    <SelectItem value="AUD">AUD ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Default Email Tone</Label>
                <Select
                  value={settings.defaultTone}
                  onValueChange={(v) => setSettings({ ...settings, defaultTone: v as EmailTone })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="friendly">Friendly</SelectItem>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="firm">Firm</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Digest Emails</Label>
              <Select
                value={settings.digestFrequency}
                onValueChange={(v) => setSettings({ ...settings, digestFrequency: v as 'daily' | 'weekly' | 'never' })}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="never">Never</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Receive summary emails about your collection activity
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Email Sending */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Email Sending
                </CardTitle>
                <CardDescription>Configure how collection emails are sent</CardDescription>
              </div>
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Active
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Current sending status */}
            <div className="p-4 rounded-lg bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900/50 dark:to-slate-800/50 border">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-full bg-emerald-100 dark:bg-emerald-900/50">
                  <Send className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="font-medium text-sm">Sending via Reluit</p>
                  <p className="text-xs text-muted-foreground">collections@reluit.com</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Emails are sent from Reluit&apos;s verified domain with your organization name in the sender field.
              </p>
            </div>

            <Separator />

            {/* Email identity settings */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="emailFromName">Sender Name</Label>
                <Input
                  id="emailFromName"
                  value={settings.emailFromName || ''}
                  onChange={(e) => setSettings({ ...settings, emailFromName: e.target.value })}
                  placeholder={orgName || 'Your Company'}
                />
                <p className="text-xs text-muted-foreground">
                  Appears as the sender in customer inboxes
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="emailReplyTo">Reply-To Email</Label>
                <Input
                  id="emailReplyTo"
                  type="email"
                  value={settings.emailReplyTo || ''}
                  onChange={(e) => setSettings({ ...settings, emailReplyTo: e.target.value })}
                  placeholder={userEmail || 'you@example.com'}
                />
                <p className="text-xs text-muted-foreground">
                  Customer replies will be sent to this address
                </p>
              </div>
            </div>

            {/* Test email */}
            <div className="flex items-center justify-between pt-2">
              <div>
                <p className="text-sm font-medium">Test Your Setup</p>
                <p className="text-xs text-muted-foreground">
                  Send a test email to {userEmail}
                </p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={sendTestEmail}
                disabled={isSendingTest}
              >
                {isSendingTest ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Send Test
              </Button>
            </div>

            <Separator />

            {/* Custom domain - Coming Soon */}
            <div className="relative">
              <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] rounded-lg z-10 flex items-center justify-center">
                <Badge variant="outline" className="bg-background border-amber-300 text-amber-700 dark:text-amber-400">
                  <Lock className="h-3 w-3 mr-1" />
                  Coming Soon
                </Badge>
              </div>
              <div className="p-4 rounded-lg border border-dashed opacity-60">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-full bg-slate-100 dark:bg-slate-800">
                    <Globe className="h-4 w-4 text-slate-500" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Custom Sending Domain</p>
                    <p className="text-xs text-muted-foreground">Send emails from your own domain</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-muted-foreground">Your Domain</Label>
                  <Input disabled placeholder="mail.yourdomain.com" className="bg-muted" />
                  <p className="text-xs text-muted-foreground">
                    Connect your domain to send emails as collections@yourdomain.com
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  )
}

