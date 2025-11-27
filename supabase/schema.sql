-- Reluit Database Schema
-- Run this in your Supabase SQL editor to set up the database

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Custom types (enums)
CREATE TYPE risk_level AS ENUM ('low', 'at_risk', 'overdue', 'critical');
CREATE TYPE invoice_status AS ENUM ('draft', 'pending', 'paid', 'overdue', 'cancelled', 'void');
CREATE TYPE payment_behavior AS ENUM ('excellent', 'good', 'average', 'slow', 'problematic');
CREATE TYPE campaign_status AS ENUM ('draft', 'active', 'paused', 'completed');
CREATE TYPE integration_provider AS ENUM ('stripe', 'square', 'quickbooks');
CREATE TYPE integration_status AS ENUM ('connected', 'disconnected', 'error', 'syncing');
CREATE TYPE email_tone AS ENUM ('friendly', 'professional', 'firm', 'urgent');
CREATE TYPE campaign_stage AS ENUM ('reminder', 'follow_up', 'escalation', 'final_notice');
CREATE TYPE subscription_plan AS ENUM ('free', 'pro', 'enterprise');
CREATE TYPE subscription_status AS ENUM ('active', 'cancelled', 'past_due', 'trialing');
CREATE TYPE email_log_status AS ENUM ('pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed');

-- Organizations table
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  settings JSONB DEFAULT '{}',
  brand_voice TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Integrations table
CREATE TABLE integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider integration_provider NOT NULL,
  pipedream_account_id TEXT,
  external_account_id TEXT,
  status integration_status DEFAULT 'disconnected',
  last_sync TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, provider)
);

-- Customers table
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  payment_behavior payment_behavior DEFAULT 'average',
  avg_days_to_pay INTEGER,
  total_invoices INTEGER DEFAULT 0,
  total_paid NUMERIC(12,2) DEFAULT 0,
  total_outstanding NUMERIC(12,2) DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, external_id, integration_id)
);

-- Invoices table
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  invoice_number TEXT,
  amount NUMERIC(12,2) NOT NULL,
  amount_paid NUMERIC(12,2) DEFAULT 0,
  amount_due NUMERIC(12,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  due_date DATE NOT NULL,
  issued_date DATE NOT NULL,
  status invoice_status DEFAULT 'pending',
  risk_level risk_level DEFAULT 'low',
  payment_url TEXT,
  pdf_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, external_id, integration_id)
);

-- Campaigns table
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status campaign_status DEFAULT 'draft',
  config JSONB DEFAULT '{"maxAttempts": 4, "daysBetweenEmails": 5, "escalateTone": true, "includePayButton": true, "attachInvoice": false, "stages": []}',
  target_invoice_ids UUID[] DEFAULT '{}',
  stats JSONB DEFAULT '{"totalInvoices": 0, "totalAmount": 0, "emailsSent": 0, "emailsOpened": 0, "emailsClicked": 0, "paymentsReceived": 0, "amountCollected": 0}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email templates table
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  tone email_tone DEFAULT 'professional',
  stage campaign_stage DEFAULT 'reminder',
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Email logs table
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  to_email TEXT NOT NULL,
  status email_log_status DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payment events table
CREATE TABLE payment_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  external_payment_id TEXT,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  payment_method TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscriptions table
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE UNIQUE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan subscription_plan DEFAULT 'free',
  status subscription_status DEFAULT 'active',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  invoice_limit INTEGER DEFAULT 25,
  email_limit INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_integrations_org ON integrations(org_id);
CREATE INDEX idx_customers_org ON customers(org_id);
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_invoices_org ON invoices(org_id);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_risk_level ON invoices(risk_level);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);
CREATE INDEX idx_campaigns_org ON campaigns(org_id);
CREATE INDEX idx_campaigns_status ON campaigns(status);
CREATE INDEX idx_email_logs_org ON email_logs(org_id);
CREATE INDEX idx_email_logs_campaign ON email_logs(campaign_id);
CREATE INDEX idx_email_logs_invoice ON email_logs(invoice_id);
CREATE INDEX idx_payment_events_org ON payment_events(org_id);
CREATE INDEX idx_payment_events_invoice ON payment_events(invoice_id);

-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Organizations policies
CREATE POLICY "Users can view own organizations"
  ON organizations FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can update own organizations"
  ON organizations FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own organizations"
  ON organizations FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Helper function to get user's org_id
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
  SELECT id FROM organizations WHERE owner_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER;

-- Integrations policies
CREATE POLICY "Users can view own integrations"
  ON integrations FOR SELECT
  USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage own integrations"
  ON integrations FOR ALL
  USING (org_id = get_user_org_id());

-- Customers policies
CREATE POLICY "Users can view own customers"
  ON customers FOR SELECT
  USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage own customers"
  ON customers FOR ALL
  USING (org_id = get_user_org_id());

-- Invoices policies
CREATE POLICY "Users can view own invoices"
  ON invoices FOR SELECT
  USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage own invoices"
  ON invoices FOR ALL
  USING (org_id = get_user_org_id());

-- Campaigns policies
CREATE POLICY "Users can view own campaigns"
  ON campaigns FOR SELECT
  USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage own campaigns"
  ON campaigns FOR ALL
  USING (org_id = get_user_org_id());

-- Email templates policies
CREATE POLICY "Users can view own templates"
  ON email_templates FOR SELECT
  USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage own templates"
  ON email_templates FOR ALL
  USING (org_id = get_user_org_id());

-- Email logs policies
CREATE POLICY "Users can view own email logs"
  ON email_logs FOR SELECT
  USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage own email logs"
  ON email_logs FOR ALL
  USING (org_id = get_user_org_id());

-- Payment events policies
CREATE POLICY "Users can view own payment events"
  ON payment_events FOR SELECT
  USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage own payment events"
  ON payment_events FOR ALL
  USING (org_id = get_user_org_id());

-- Subscriptions policies
CREATE POLICY "Users can view own subscription"
  ON subscriptions FOR SELECT
  USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage own subscription"
  ON subscriptions FOR ALL
  USING (org_id = get_user_org_id());

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

