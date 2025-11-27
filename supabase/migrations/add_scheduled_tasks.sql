-- Add scheduled_tasks table for AI agent task scheduling
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL, -- 'send_email', 'check_payment', 'follow_up', 'escalate', etc.
  task_data JSONB DEFAULT '{}', -- Task-specific data (email content, tone, etc.)
  scheduled_for TIMESTAMPTZ NOT NULL, -- When to execute the task
  status TEXT DEFAULT 'pending', -- 'pending', 'executing', 'completed', 'failed', 'cancelled'
  executed_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_scheduled_tasks_org ON scheduled_tasks(org_id);
CREATE INDEX idx_scheduled_tasks_campaign ON scheduled_tasks(campaign_id);
CREATE INDEX idx_scheduled_tasks_status ON scheduled_tasks(status);
CREATE INDEX idx_scheduled_tasks_scheduled_for ON scheduled_tasks(scheduled_for);
CREATE INDEX idx_scheduled_tasks_pending ON scheduled_tasks(scheduled_for, status) WHERE status = 'pending';

-- Updated at trigger
CREATE TRIGGER update_scheduled_tasks_updated_at BEFORE UPDATE ON scheduled_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE scheduled_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scheduled tasks"
  ON scheduled_tasks FOR SELECT
  USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage own scheduled tasks"
  ON scheduled_tasks FOR ALL
  USING (org_id = get_user_org_id());

