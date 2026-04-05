// lib/groq.ts
// Smart Groq client with automatic rate limit handling,
// retry logic, and model fallback strategy.

import Groq from 'groq-sdk'

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
})

// Rate limit tracker (in-memory, resets with server restart)
// For production: use Redis or a database
const rateLimitTracker = {
  requests: [] as number[],
  tokens: 0,
  tokenResetTime: Date.now() + 60000,

  // Check if we're within limits before sending
  canRequest(): boolean {
    const now = Date.now()
    // Remove requests older than 1 minute
    this.requests = this.requests.filter(t => now - t < 60000)
    return this.requests.length < 25 // Stay safely under 30 RPM
  },

  recordRequest(tokens: number) {
    this.requests.push(Date.now())
    if (Date.now() > this.tokenResetTime) {
      this.tokens = 0
      this.tokenResetTime = Date.now() + 60000
    }
    this.tokens += tokens
  },

  // How long to wait if rate limited (ms)
  waitTime(): number {
    if (this.requests.length === 0) return 0
    const oldest = Math.min(...this.requests)
    return Math.max(0, 60000 - (Date.now() - oldest))
  }
}

// Model priority list - falls back if primary is rate limited
const MODEL_PRIORITY = [
  process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',  // Higher limits, fallback
]

// Sleep utility
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// Main chat function with retry + fallback logic
export async function groqChat(
  messages: Groq.Chat.ChatCompletionMessageParam[],
  options: {
    maxTokens?: number
    temperature?: number
    retries?: number
    systemPrompt?: string
  } = {}
): Promise<string> {
  const {
    maxTokens = 1024,
    temperature = 0.7,
    retries = 3,
    systemPrompt,
  } = options

  const fullMessages: Groq.Chat.ChatCompletionMessageParam[] = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages

  for (let attempt = 0; attempt < retries; attempt++) {
    // Check local rate limit before even trying
    if (!rateLimitTracker.canRequest()) {
      const wait = rateLimitTracker.waitTime()
      console.log(`[Groq] Local rate limit: waiting ${wait}ms`)
      await sleep(wait + 100)
    }

    // Try each model in priority order
    for (const model of MODEL_PRIORITY) {
      try {
        console.log(`[Groq] Attempt ${attempt + 1} with model: ${model}`)

        const response = await groq.chat.completions.create({
          model,
          messages: fullMessages,
          max_tokens: maxTokens,
          temperature,
        })

        const content = response.choices[0]?.message?.content || ''
        const tokensUsed = response.usage?.total_tokens || 0
        rateLimitTracker.recordRequest(tokensUsed)

        console.log(`[Groq] Success. Tokens used: ${tokensUsed}`)
        return content

      } catch (error: any) {
        // Rate limit hit → try next model or wait
        if (error?.status === 429) {
          console.warn(`[Groq] 429 on model ${model}, trying next...`)
          // Extract retry-after from headers if available
          const retryAfter = error?.headers?.['retry-after']
          if (retryAfter && model === MODEL_PRIORITY[MODEL_PRIORITY.length - 1]) {
            const waitMs = parseInt(retryAfter) * 1000 || 5000
            console.log(`[Groq] All models rate limited. Waiting ${waitMs}ms...`)
            await sleep(waitMs)
          }
          continue // Try next model
        }

        // Auth error - no point retrying
        if (error?.status === 401) {
          throw new Error('Invalid Groq API key. Check your GROQ_API_KEY in .env.local')
        }

        // Other errors: exponential backoff
        const backoff = Math.pow(2, attempt) * 1000
        console.warn(`[Groq] Error: ${error.message}. Retrying in ${backoff}ms...`)
        await sleep(backoff)
        break // Break model loop, try whole attempt again
      }
    }
  }

  throw new Error('Groq: All retry attempts exhausted. Try again in a moment.')
}

export { groq }
