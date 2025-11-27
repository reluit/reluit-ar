import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export const gemini = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

export interface EmailGenerationParams {
  customerName: string
  customerEmail: string
  invoiceNumber: string
  invoiceAmount: number
  currency: string
  dueDate: string
  daysOverdue: number
  previousAttempts: number
  paymentHistory: 'excellent' | 'good' | 'average' | 'slow' | 'problematic'
  brandVoice?: string
  tone: 'friendly' | 'professional' | 'firm' | 'urgent'
  companyName: string
  paymentUrl?: string
}

export async function generateCollectionEmail(params: EmailGenerationParams & {
  context?: string
  personalizationHints?: string[]
  escalationRecommendation?: any
}): Promise<{
  subject: string
  body: string
}> {
  const {
    customerName,
    invoiceNumber,
    invoiceAmount,
    currency,
    dueDate,
    daysOverdue,
    previousAttempts,
    paymentHistory,
    brandVoice,
    tone,
    companyName,
    paymentUrl,
    context,
    personalizationHints,
    escalationRecommendation,
  } = params

  const toneGuidance = {
    friendly: 'warm, helpful, and understanding. Use casual language and express genuine care for the relationship. Assume this is an oversight.',
    professional: 'polite, business-like, and respectful. Maintain formality while being approachable. Balance relationship and urgency.',
    firm: 'direct and clear about expectations. Be assertive but not aggressive. Emphasize the importance of prompt payment and consequences of non-payment.',
    urgent: 'emphasize immediacy and consequences. Be very direct about the need for immediate action while remaining professional. Mention potential consequences clearly.',
  }

  // Build comprehensive context prompt
  let contextSection = ''
  if (context) {
    contextSection = `\n\n## Additional Context:\n${context}\n`
  }

  let personalizationSection = ''
  if (personalizationHints && personalizationHints.length > 0) {
    personalizationSection = `\n\n## Personalization Hints:\n${personalizationHints.map(h => `- ${h}`).join('\n')}\n`
  }

  let escalationSection = ''
  if (escalationRecommendation?.shouldEscalate) {
    escalationSection = `\n\n## Escalation Guidance:\n- Reason: ${escalationRecommendation.reason}\n- Actions: ${escalationRecommendation.actions.join(', ')}\n`
  }

  const prompt = `You are an expert AI agent managing collection campaigns. Your goal is to get invoices paid while maintaining positive customer relationships.

## Core Principles:
1. Every customer interaction matters - maintain professionalism
2. Personalize based on customer history and behavior
3. Escalate appropriately but don't burn bridges
4. Be clear, concise, and action-oriented
5. Always provide a clear path to resolution

## Current Email Context:
- Customer Name: ${customerName}
- Invoice Number: ${invoiceNumber}
- Amount Due: ${currency} ${invoiceAmount.toFixed(2)}
- Due Date: ${dueDate}
- Days Overdue: ${daysOverdue > 0 ? `${daysOverdue} days overdue` : 'Due soon'}
- Previous Follow-up Attempts: ${previousAttempts}
- Customer Payment History: ${paymentHistory}
- Company Name: ${companyName}
${brandVoice ? `- Brand Voice Guidelines: ${brandVoice}` : ''}
${paymentUrl ? `- Payment Link: ${paymentUrl}` : ''}

## Tone: ${tone}
${toneGuidance[tone]}
${contextSection}${personalizationSection}${escalationSection}
## Email Requirements:

1. **Length**: Keep body concise (max 150 words) - busy customers appreciate brevity
2. **Subject Line**: 
   - Be specific and action-oriented
   - Include invoice number or amount
   - Match urgency level (friendly = softer, urgent = direct)
   - Examples: "Payment Reminder: Invoice ${invoiceNumber}" or "Urgent: ${invoiceNumber} Payment Required"

3. **Body Structure**:
   - Opening: Personalized greeting based on payment history
   - Context: Brief mention of invoice (number, amount, days overdue)
   - Value: Why prompt payment matters (if appropriate for tone)
   - Action: Clear call-to-action with payment link
   - Closing: Professional sign-off with company name

4. **Personalization Rules**:
   - Excellent/Good payers: "We noticed this is unusual..." - maintain relationship
   - Average payers: Professional but friendly - balance relationship and urgency
   - Problematic payers: Direct and clear - focus on resolution
   - If previous attempts: Acknowledge them ("Following up on our previous email...")
   - If customer clicked: "We noticed you viewed the payment link..."
   - If customer opened: Reference their engagement

5. **Tone-Specific Guidelines**:
   - Friendly: Assume oversight, offer help, maintain warmth
   - Professional: Business-like, clear expectations, respectful
   - Firm: Direct about consequences, set deadlines, emphasize importance
   - Urgent: Immediate action required, mention consequences, final opportunity

6. **Content Rules**:
   - Do NOT use placeholder brackets like [Name] - use actual values provided
   - Do NOT be aggressive or threatening (even in urgent tone)
   - Do NOT make assumptions about why payment is late
   - Do NOT use prohibited language (threaten, arrest, jail, lawsuit, garnish, seize, criminal)
   - DO provide clear next steps
   - DO include payment link prominently if available
   - DO offer assistance if appropriate ("If you have questions, please reply...")
   - DO be accurate about debt amount and details

7. **FDCPA Compliance Requirements**:
   - This email will automatically include required FDCPA disclosures in the footer
   - Do NOT include Mini-Miranda or validation notice in the body - these are added automatically
   - Focus on the main message content only
   - Be professional and respectful at all times
   - Never threaten legal action or consequences that cannot be legally pursued

8. **Escalation Handling**:
   ${previousAttempts > 0 ? `- This is attempt #${previousAttempts + 1} - acknowledge previous contact` : '- This is the first contact - friendly reminder'}
   ${daysOverdue >= 30 ? '- 30+ days overdue - mention potential consequences professionally (but do not threaten)' : ''}
   ${daysOverdue >= 14 ? '- 14+ days overdue - increase urgency appropriately' : ''}

Return ONLY a JSON object with this exact structure (no markdown, no code blocks):
{"subject": "email subject line", "body": "email body text"}

The body should use \\n for line breaks. Make it natural, conversational, and effective. Remember: FDCPA disclosures will be added automatically, so focus only on the main message content.`

  const result = await gemini.generateContent(prompt)
  const response = result.response.text()
  
  // Parse the JSON response
  try {
    // Remove any potential markdown code blocks
    const cleanedResponse = response
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()
    
    const parsed = JSON.parse(cleanedResponse)
    return {
      subject: parsed.subject,
      body: parsed.body,
    }
  } catch {
    // Fallback if parsing fails
    console.error('Failed to parse Gemini response:', response)
    return {
      subject: `Payment Reminder: Invoice ${invoiceNumber} - ${currency} ${invoiceAmount.toFixed(2)}`,
      body: `Hi ${customerName},\n\nThis is a reminder that invoice ${invoiceNumber} for ${currency} ${invoiceAmount.toFixed(2)} is ${daysOverdue > 0 ? `${daysOverdue} days overdue` : 'due soon'}.\n\nPlease arrange payment at your earliest convenience.\n\nBest regards,\n${companyName}`,
    }
  }
}

export async function analyzeBrandVoice(sampleEmails: string[]): Promise<string> {
  const prompt = `Analyze the following sample emails and describe the brand voice/tone in 2-3 sentences. Focus on:
- Formality level
- Personality traits
- Communication style

Sample emails:
${sampleEmails.map((email, i) => `Email ${i + 1}:\n${email}`).join('\n\n')}

Return ONLY a brief description of the brand voice (no JSON, no markdown).`

  const result = await gemini.generateContent(prompt)
  return result.response.text().trim()
}

export async function suggestOptimalCadence(params: {
  avgDaysOverdue: number
  paymentBehavior: string
  invoiceAmount: number
}): Promise<{
  daysBetweenEmails: number
  maxAttempts: number
  toneProgression: string[]
}> {
  const prompt = `Based on the following customer data, suggest an optimal collection email cadence:
- Average Days Overdue: ${params.avgDaysOverdue}
- Payment Behavior: ${params.paymentBehavior}
- Invoice Amount: $${params.invoiceAmount}

Return ONLY a JSON object with this structure:
{"daysBetweenEmails": number, "maxAttempts": number, "toneProgression": ["tone1", "tone2", ...]}

Where tones can be: friendly, professional, firm, urgent`

  const result = await gemini.generateContent(prompt)
  const response = result.response.text()
  
  try {
    const cleanedResponse = response
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim()
    return JSON.parse(cleanedResponse)
  } catch {
    return {
      daysBetweenEmails: 5,
      maxAttempts: 4,
      toneProgression: ['friendly', 'professional', 'firm', 'urgent'],
    }
  }
}

