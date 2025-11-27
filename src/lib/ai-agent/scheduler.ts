import { createClient } from '@/lib/supabase/server'
import type { EmailTone } from '@/types/database'

export type TaskType = 
  | 'send_email'
  | 'check_payment'
  | 'follow_up'
  | 'escalate'
  | 'pause_campaign'
  | 'resume_campaign'
  | 'custom'

export interface ScheduledTaskData {
  taskType: TaskType
  orgId: string
  campaignId?: string
  invoiceId?: string
  customerId?: string
  scheduledFor: Date
  taskData?: {
    tone?: EmailTone
    subject?: string
    body?: string
    templateId?: string
    maxRetries?: number
    [key: string]: any
  }
  metadata?: Record<string, any>
}

export interface ScheduledTask {
  id: string
  org_id: string
  campaign_id?: string
  invoice_id?: string
  customer_id?: string
  task_type: TaskType
  task_data: any
  scheduled_for: string
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'cancelled'
  executed_at?: string
  error_message?: string
  retry_count: number
  max_retries: number
  metadata: any
  created_at: string
  updated_at: string
}

/**
 * Task Scheduler - Allows AI agent to schedule future tasks
 */
export class TaskScheduler {
  /**
   * Schedule a task for future execution
   */
  async scheduleTask(params: ScheduledTaskData): Promise<string> {
    const supabase = await createClient()

    const { data: task, error } = await supabase
      .from('scheduled_tasks')
      .insert({
        org_id: params.orgId,
        campaign_id: params.campaignId,
        invoice_id: params.invoiceId,
        customer_id: params.customerId,
        task_type: params.taskType,
        task_data: params.taskData || {},
        scheduled_for: params.scheduledFor.toISOString(),
        status: 'pending',
        metadata: params.metadata || {},
        max_retries: params.taskData?.maxRetries || 3,
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to schedule task: ${error.message}`)
    }

    return task.id
  }

  /**
   * Schedule a follow-up email
   */
  async scheduleFollowUpEmail(params: {
    orgId: string
    campaignId: string
    invoiceId: string
    customerId: string
    daysFromNow: number
    tone?: EmailTone
    templateId?: string
    timezone?: string
  }): Promise<string> {
    const { getNextCompliantTime } = await import('@/lib/fdcpa/compliance')
    const timezone = params.timezone || 'America/New_York'
    
    const scheduledFor = new Date()
    scheduledFor.setDate(scheduledFor.getDate() + params.daysFromNow)
    // Use FDCPA-compliant time (8 AM - 9 PM), default to 10 AM
    const compliantTime = getNextCompliantTime(timezone)
    scheduledFor.setHours(compliantTime.getHours(), compliantTime.getMinutes(), 0, 0)

    return this.scheduleTask({
      taskType: 'send_email',
      orgId: params.orgId,
      campaignId: params.campaignId,
      invoiceId: params.invoiceId,
      customerId: params.customerId,
      scheduledFor,
      taskData: {
        tone: params.tone,
        templateId: params.templateId,
      },
      metadata: {
        isFollowUp: true,
        daysFromNow: params.daysFromNow,
      },
    })
  }

  /**
   * Schedule a payment check
   */
  async schedulePaymentCheck(params: {
    orgId: string
    campaignId: string
    hoursFromNow: number
  }): Promise<string> {
    const scheduledFor = new Date()
    scheduledFor.setHours(scheduledFor.getHours() + params.hoursFromNow)

    return this.scheduleTask({
      taskType: 'check_payment',
      orgId: params.orgId,
      campaignId: params.campaignId,
      scheduledFor,
      taskData: {},
      metadata: {
        isPaymentCheck: true,
      },
    })
  }

  /**
   * Schedule campaign escalation
   */
  async scheduleEscalation(params: {
    orgId: string
    campaignId: string
    daysFromNow: number
    newTone: EmailTone
  }): Promise<string> {
    const scheduledFor = new Date()
    scheduledFor.setDate(scheduledFor.getDate() + params.daysFromNow)

    return this.scheduleTask({
      taskType: 'escalate',
      orgId: params.orgId,
      campaignId: params.campaignId,
      scheduledFor,
      taskData: {
        newTone: params.newTone,
      },
      metadata: {
        isEscalation: true,
      },
    })
  }

  /**
   * Cancel scheduled tasks for a campaign/invoice
   */
  async cancelTasks(params: {
    orgId: string
    campaignId?: string
    invoiceId?: string
    taskType?: TaskType
  }): Promise<number> {
    const supabase = await createClient()

    let query = supabase
      .from('scheduled_tasks')
      .update({ status: 'cancelled' })
      .eq('org_id', params.orgId)
      .eq('status', 'pending')

    if (params.campaignId) {
      query = query.eq('campaign_id', params.campaignId)
    }
    if (params.invoiceId) {
      query = query.eq('invoice_id', params.invoiceId)
    }
    if (params.taskType) {
      query = query.eq('task_type', params.taskType)
    }

    const { data, error } = await query.select()

    if (error) {
      throw new Error(`Failed to cancel tasks: ${error.message}`)
    }

    return data?.length || 0
  }

  /**
   * Get pending tasks scheduled for execution
   */
  async getPendingTasks(limit: number = 100): Promise<ScheduledTask[]> {
    const supabase = await createClient()
    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from('scheduled_tasks')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_for', now)
      .order('scheduled_for', { ascending: true })
      .limit(limit)

    if (error) {
      throw new Error(`Failed to get pending tasks: ${error.message}`)
    }

    return (data || []) as ScheduledTask[]
  }

  /**
   * Mark task as executing
   */
  async markExecuting(taskId: string): Promise<void> {
    const supabase = await createClient()

    await supabase
      .from('scheduled_tasks')
      .update({ status: 'executing' })
      .eq('id', taskId)
  }

  /**
   * Mark task as completed
   */
  async markCompleted(taskId: string, result?: any): Promise<void> {
    const supabase = await createClient()

    await supabase
      .from('scheduled_tasks')
      .update({
        status: 'completed',
        executed_at: new Date().toISOString(),
        metadata: result ? { ...result } : undefined,
      })
      .eq('id', taskId)
  }

  /**
   * Mark task as failed
   */
  async markFailed(taskId: string, error: string, retry: boolean = true): Promise<void> {
    const supabase = await createClient()

    // Get current task
    const { data: task } = await supabase
      .from('scheduled_tasks')
      .select('retry_count, max_retries')
      .eq('id', taskId)
      .single()

    const retryCount = (task?.retry_count || 0) + 1
    const shouldRetry = retry && retryCount < (task?.max_retries || 3)

    await supabase
      .from('scheduled_tasks')
      .update({
        status: shouldRetry ? 'pending' : 'failed',
        error_message: error,
        retry_count: retryCount,
        // Reschedule for retry (exponential backoff: 5min, 15min, 1hr)
        scheduled_for: shouldRetry
          ? new Date(Date.now() + Math.pow(3, retryCount) * 5 * 60 * 1000).toISOString()
          : undefined,
      })
      .eq('id', taskId)
  }
}

export const taskScheduler = new TaskScheduler()

