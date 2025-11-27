export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type RiskLevel = 'low' | 'at_risk' | 'overdue' | 'critical'
export type InvoiceStatus = 'draft' | 'pending' | 'paid' | 'overdue' | 'cancelled' | 'void'
export type PaymentBehavior = 'excellent' | 'good' | 'average' | 'slow' | 'problematic'
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed'
export type IntegrationProvider = 'stripe' | 'square' | 'quickbooks'
export type IntegrationStatus = 'connected' | 'disconnected' | 'error' | 'syncing'
export type EmailTone = 'friendly' | 'professional' | 'firm' | 'urgent'
export type CampaignStage = 'reminder' | 'follow_up' | 'escalation' | 'final_notice'

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          owner_id: string
          settings: OrganizationSettings
          brand_voice: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          owner_id: string
          settings?: OrganizationSettings
          brand_voice?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          owner_id?: string
          settings?: OrganizationSettings
          brand_voice?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      integrations: {
        Row: {
          id: string
          org_id: string
          provider: IntegrationProvider
          pipedream_account_id: string | null
          external_account_id: string | null
          status: IntegrationStatus
          last_sync: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          provider: IntegrationProvider
          pipedream_account_id?: string | null
          external_account_id?: string | null
          status?: IntegrationStatus
          last_sync?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          provider?: IntegrationProvider
          pipedream_account_id?: string | null
          external_account_id?: string | null
          status?: IntegrationStatus
          last_sync?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
      customers: {
        Row: {
          id: string
          org_id: string
          external_id: string
          integration_id: string
          name: string
          email: string | null
          phone: string | null
          payment_behavior: PaymentBehavior
          avg_days_to_pay: number | null
          total_invoices: number
          total_paid: number
          total_outstanding: number
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          external_id: string
          integration_id: string
          name: string
          email?: string | null
          phone?: string | null
          payment_behavior?: PaymentBehavior
          avg_days_to_pay?: number | null
          total_invoices?: number
          total_paid?: number
          total_outstanding?: number
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          external_id?: string
          integration_id?: string
          name?: string
          email?: string | null
          phone?: string | null
          payment_behavior?: PaymentBehavior
          avg_days_to_pay?: number | null
          total_invoices?: number
          total_paid?: number
          total_outstanding?: number
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
      invoices: {
        Row: {
          id: string
          org_id: string
          customer_id: string
          integration_id: string
          external_id: string
          invoice_number: string | null
          amount: number
          amount_paid: number
          amount_due: number
          currency: string
          due_date: string
          issued_date: string
          status: InvoiceStatus
          risk_level: RiskLevel
          payment_url: string | null
          pdf_url: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          customer_id: string
          integration_id: string
          external_id: string
          invoice_number?: string | null
          amount: number
          amount_paid?: number
          amount_due: number
          currency?: string
          due_date: string
          issued_date: string
          status?: InvoiceStatus
          risk_level?: RiskLevel
          payment_url?: string | null
          pdf_url?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          customer_id?: string
          integration_id?: string
          external_id?: string
          invoice_number?: string | null
          amount?: number
          amount_paid?: number
          amount_due?: number
          currency?: string
          due_date?: string
          issued_date?: string
          status?: InvoiceStatus
          risk_level?: RiskLevel
          payment_url?: string | null
          pdf_url?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
      campaigns: {
        Row: {
          id: string
          org_id: string
          name: string
          description: string | null
          status: CampaignStatus
          config: CampaignConfig
          target_invoice_ids: string[]
          stats: CampaignStats
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          description?: string | null
          status?: CampaignStatus
          config?: CampaignConfig
          target_invoice_ids?: string[]
          stats?: CampaignStats
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          description?: string | null
          status?: CampaignStatus
          config?: CampaignConfig
          target_invoice_ids?: string[]
          stats?: CampaignStats
          created_at?: string
          updated_at?: string
        }
      }
      email_templates: {
        Row: {
          id: string
          org_id: string
          name: string
          subject: string
          body: string
          tone: EmailTone
          stage: CampaignStage
          is_default: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          name: string
          subject: string
          body: string
          tone?: EmailTone
          stage?: CampaignStage
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          name?: string
          subject?: string
          body?: string
          tone?: EmailTone
          stage?: CampaignStage
          is_default?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      email_logs: {
        Row: {
          id: string
          org_id: string
          campaign_id: string | null
          invoice_id: string
          customer_id: string
          template_id: string | null
          subject: string
          body: string
          to_email: string
          status: 'pending' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed'
          sent_at: string | null
          opened_at: string | null
          clicked_at: string | null
          error_message: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          campaign_id?: string | null
          invoice_id: string
          customer_id: string
          template_id?: string | null
          subject: string
          body: string
          to_email: string
          status?: 'pending' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed'
          sent_at?: string | null
          opened_at?: string | null
          clicked_at?: string | null
          error_message?: string | null
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          campaign_id?: string | null
          invoice_id?: string
          customer_id?: string
          template_id?: string | null
          subject?: string
          body?: string
          to_email?: string
          status?: 'pending' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed'
          sent_at?: string | null
          opened_at?: string | null
          clicked_at?: string | null
          error_message?: string | null
          metadata?: Json
          created_at?: string
        }
      }
      payment_events: {
        Row: {
          id: string
          org_id: string
          invoice_id: string
          customer_id: string
          integration_id: string
          external_payment_id: string | null
          amount: number
          currency: string
          payment_method: string | null
          received_at: string
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          org_id: string
          invoice_id: string
          customer_id: string
          integration_id: string
          external_payment_id?: string | null
          amount: number
          currency?: string
          payment_method?: string | null
          received_at: string
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          invoice_id?: string
          customer_id?: string
          integration_id?: string
          external_payment_id?: string | null
          amount?: number
          currency?: string
          payment_method?: string | null
          received_at?: string
          metadata?: Json
          created_at?: string
        }
      }
      subscriptions: {
        Row: {
          id: string
          org_id: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          plan: 'free' | 'pro' | 'enterprise'
          status: 'active' | 'cancelled' | 'past_due' | 'trialing'
          current_period_start: string | null
          current_period_end: string | null
          invoice_limit: number
          email_limit: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          org_id: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          plan?: 'free' | 'pro' | 'enterprise'
          status?: 'active' | 'cancelled' | 'past_due' | 'trialing'
          current_period_start?: string | null
          current_period_end?: string | null
          invoice_limit?: number
          email_limit?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          plan?: 'free' | 'pro' | 'enterprise'
          status?: 'active' | 'cancelled' | 'past_due' | 'trialing'
          current_period_start?: string | null
          current_period_end?: string | null
          invoice_limit?: number
          email_limit?: number
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      risk_level: RiskLevel
      invoice_status: InvoiceStatus
      payment_behavior: PaymentBehavior
      campaign_status: CampaignStatus
      integration_provider: IntegrationProvider
      integration_status: IntegrationStatus
      email_tone: EmailTone
      campaign_stage: CampaignStage
    }
  }
}

// Additional types
export interface OrganizationSettings {
  timezone?: string
  currency?: string
  emailSignature?: string
  autoSweepEnabled?: boolean
  sweepFrequency?: 'daily' | 'weekly' | 'manual'
  defaultTone?: EmailTone
  digestFrequency?: 'daily' | 'weekly' | 'never'
  // Email sending configuration
  emailFromName?: string
  emailReplyTo?: string
  // Custom domain (coming soon)
  customDomainEnabled?: boolean
  customDomain?: string
  customDomainVerified?: boolean
}

export interface CampaignConfig {
  maxAttempts: number
  daysBetweenEmails: number
  escalateTone: boolean
  includePayButton: boolean
  attachInvoice: boolean
  stages: {
    stage: CampaignStage
    daysTrigger: number
    tone: EmailTone
    templateId?: string
  }[]
}

export interface CampaignStats {
  totalInvoices: number
  totalAmount: number
  emailsSent: number
  emailsOpened: number
  emailsClicked: number
  paymentsReceived: number
  amountCollected: number
}

// Helper types for row access
export type Organization = Database['public']['Tables']['organizations']['Row']
export type Integration = Database['public']['Tables']['integrations']['Row']
export type Customer = Database['public']['Tables']['customers']['Row']
export type Invoice = Database['public']['Tables']['invoices']['Row']
export type Campaign = Database['public']['Tables']['campaigns']['Row']
export type EmailTemplate = Database['public']['Tables']['email_templates']['Row']
export type EmailLog = Database['public']['Tables']['email_logs']['Row']
export type PaymentEvent = Database['public']['Tables']['payment_events']['Row']
export type Subscription = Database['public']['Tables']['subscriptions']['Row']

