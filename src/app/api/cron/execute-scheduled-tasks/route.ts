import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { taskScheduler, type ScheduledTask } from '@/lib/ai-agent/scheduler'
import { agentTools } from '@/lib/ai-agent/tools'
import { aiAgent } from '@/lib/ai-agent/executor'

/**
 * Vercel Cron Job: Execute scheduled tasks
 * Runs every 5 minutes
 * 
 * Configure in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/execute-scheduled-tasks",
 *     "schedule": "*/5 * * * *"
 *   }]
 * }
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get pending tasks ready for execution
    const tasks = await taskScheduler.getPendingTasks(50)

    if (tasks.length === 0) {
      return NextResponse.json({
        executed: true,
        tasksProcessed: 0,
        message: 'No pending tasks',
      })
    }

    const results = []

    // Execute each task
    for (const task of tasks) {
      try {
        // Mark as executing
        await taskScheduler.markExecuting(task.id)

        const result = await executeTask(task)
        
        if (result.success) {
          await taskScheduler.markCompleted(task.id, result)
          results.push({
            taskId: task.id,
            taskType: task.task_type,
            success: true,
            result: result.message,
          })
        } else {
          await taskScheduler.markFailed(task.id, result.error || 'Task execution failed', true)
          results.push({
            taskId: task.id,
            taskType: task.task_type,
            success: false,
            error: result.error,
          })
        }
      } catch (error) {
        console.error(`Error executing task ${task.id}:`, error)
        await taskScheduler.markFailed(
          task.id,
          error instanceof Error ? error.message : 'Unknown error',
          true
        )
        results.push({
          taskId: task.id,
          taskType: task.task_type,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    return NextResponse.json({
      executed: true,
      timestamp: new Date().toISOString(),
      tasksProcessed: tasks.length,
      successful,
      failed,
      results,
    })
  } catch (error) {
    console.error('Scheduled tasks cron job error:', error)
    return NextResponse.json(
      {
        error: 'Failed to execute scheduled tasks',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * Execute a scheduled task based on its type
 */
async function executeTask(task: ScheduledTask): Promise<{ success: boolean; message?: string; error?: string }> {
  const { task_type, task_data, org_id, campaign_id, invoice_id, customer_id } = task

  switch (task_type) {
    case 'send_email':
      if (!invoice_id || !campaign_id) {
        return { success: false, error: 'Missing invoice_id or campaign_id' }
      }

      const sendResult = await agentTools
        .find(t => t.name === 'sendCollectionEmail')
        ?.execute({
          invoiceId: invoice_id,
          campaignId: campaign_id,
          orgId: org_id,
          tone: task_data?.tone,
          templateId: task_data?.templateId,
        })

      if (sendResult?.error) {
        return { success: false, error: sendResult.error }
      }

      return {
        success: true,
        message: `Email sent successfully (attempt ${sendResult?.attemptNumber || 1})`,
      }

    case 'check_payment':
      if (!campaign_id) {
        return { success: false, error: 'Missing campaign_id' }
      }

      const paymentResult = await agentTools
        .find(t => t.name === 'pauseCampaignIfPaid')
        ?.execute({ campaignId: campaign_id, orgId: org_id })

      if (paymentResult?.paused) {
        // Cancel any remaining scheduled tasks for this campaign
        await taskScheduler.cancelTasks({
          orgId: org_id,
          campaignId: campaign_id,
        })

        return {
          success: true,
          message: `Campaign paused - all invoices paid. Cancelled ${paymentResult.paused ? 'remaining tasks' : '0 tasks'}`,
        }
      }

      return {
        success: true,
        message: `Payment check completed - ${paymentResult?.unpaidInvoices || 0} unpaid invoices`,
      }

    case 'follow_up':
      // Follow-up is essentially a send_email task
      return executeTask({ ...task, task_type: 'send_email' })

    case 'escalate':
      if (!campaign_id) {
        return { success: false, error: 'Missing campaign_id' }
      }

      // Update campaign config to use new tone
      const supabaseEscalate = await createClient()
      const { data: campaign } = await supabaseEscalate
        .from('campaigns')
        .select('config')
        .eq('id', campaign_id)
        .single()

      if (campaign) {
        const config = campaign.config as any
        // Update stages to use escalated tone
        if (config.stages && task_data?.newTone) {
          const updatedStages = config.stages.map((stage: any) => ({
            ...stage,
            tone: task_data.newTone,
          }))

          await supabaseEscalate
            .from('campaigns')
            .update({
              config: {
                ...config,
                stages: updatedStages,
              },
            })
            .eq('id', campaign_id)
        }
      }

      return {
        success: true,
        message: `Campaign escalated to ${task_data?.newTone || 'urgent'} tone`,
      }

    case 'pause_campaign':
      if (!campaign_id) {
        return { success: false, error: 'Missing campaign_id' }
      }

      const supabase = await createClient()
      await supabase
        .from('campaigns')
        .update({ status: 'paused' })
        .eq('id', campaign_id)
        .eq('org_id', org_id)

      // Cancel remaining tasks
      await taskScheduler.cancelTasks({
        orgId: org_id,
        campaignId: campaign_id,
      })

      return {
        success: true,
        message: 'Campaign paused and remaining tasks cancelled',
      }

    case 'resume_campaign':
      if (!campaign_id) {
        return { success: false, error: 'Missing campaign_id' }
      }

      const supabaseResume = await createClient()
      await supabaseResume
        .from('campaigns')
        .update({ status: 'active' })
        .eq('id', campaign_id)
        .eq('org_id', org_id)

      return {
        success: true,
        message: 'Campaign resumed',
      }

    default:
      return {
        success: false,
        error: `Unknown task type: ${task_type}`,
      }
  }
}

