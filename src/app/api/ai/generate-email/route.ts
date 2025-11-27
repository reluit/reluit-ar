import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateCollectionEmail } from '@/lib/gemini/client'
import { differenceInDays, parseISO } from 'date-fns'
import type { EmailTone } from '@/types/database'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: org } = await supabase
      .from('organizations')
      .select('name, brand_voice')
      .eq('owner_id', user.id)
      .single()

    const body = await request.json()
    const {
      customerName,
      customerEmail,
      invoiceNumber,
      invoiceAmount,
      currency = 'USD',
      dueDate,
      previousAttempts = 0,
      paymentHistory = 'average',
      tone = 'professional' as EmailTone,
      paymentUrl,
    } = body

    // Calculate days overdue
    const daysOverdue = differenceInDays(new Date(), parseISO(dueDate))

    // Generate email using Gemini
    const result = await generateCollectionEmail({
      customerName,
      customerEmail: customerEmail || '',
      invoiceNumber,
      invoiceAmount,
      currency,
      dueDate,
      daysOverdue,
      previousAttempts,
      paymentHistory,
      brandVoice: org?.brand_voice || undefined,
      tone,
      companyName: org?.name || 'Our Company',
      paymentUrl,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error('Email generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate email' },
      { status: 500 }
    )
  }
}

