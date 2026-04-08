// app/api/generate-script/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { groqChat } from '@/lib/groq'

export async function POST(req: NextRequest) {
  try {
    const { topic, style, duration } = await req.json()
    if (!topic || topic.trim().length < 3) {
      return NextResponse.json({ error: 'Topic is required (minimum 3 characters)' }, { status: 400 })
    }

    const targetDuration = Math.min(duration || 35, 40)
    const targetWords = Math.floor(targetDuration * 2.5)
    const targetLines = Math.round(targetWords / 4)

    const systemPrompt = `You are a viral YouTube Shorts scriptwriter. Write punchy, fast-paced scripts for short-form vertical video.
Always respond with ONLY valid JSON. No markdown, no explanation, no extra text.`

    const userPrompt = `Write a ${targetDuration}-second YouTube Shorts script about: "${topic}"
Style: ${style || 'Dramatic, mysterious, fast-paced'}

Voice pace: 2.5 words per second. Word budget: ${targetWords} words total across all lines.

Return ONLY this JSON:
{
  "title": "Hook-style title under 60 chars",
  "lines": [
    {
      "text": "3 to 6 words max per line",
      "highlight": "oneword",
      "imageKeyword": "specific pexels search term"
    }
  ],
  "tags": ["tag1","tag2","tag3","tag4","tag5"]
}

STRICT RULES:
- "text": 3-6 words MAXIMUM. No exceptions. Short = punchy.
- Aim for ${targetLines} lines total.
- "highlight": one word from that line. Lowercase. No punctuation. Most emotional word.
- "imageKeyword": 2-4 specific words for Pexels image search. Change every 2-3 lines.
- ASCII only. No apostrophes, no dashes, no quotes, no special characters.
- Line 1 = HOOK. Shocking or mysterious. Must stop the scroll.
- Each line = natural pause point in narration. Lines flow as one continuous story.
- End with the most shocking reveal or twist.
- Style: ${style || 'dark dramatic mystery'}. Build tension relentlessly.`

    const raw = await groqChat([{ role: 'user', content: userPrompt }], {
      systemPrompt, maxTokens: 2000, temperature: 0.82
    })

    let script
    try {
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      script = JSON.parse(cleaned)
    } catch {
      return NextResponse.json({ error: 'Script parse failed. Please try again.' }, { status: 500 })
    }

    if (!script.lines || !Array.isArray(script.lines) || script.lines.length < 3) {
      return NextResponse.json({ error: 'Invalid script. Please try again.' }, { status: 500 })
    }

    script.lines = script.lines.map((line: any, i: number) => {
      const cleanText = (line.text || '')
        .replace(/[^\x00-\x7F]/g, '').replace(/['"\\]/g, '').replace(/\s+/g, ' ').trim()
      const words = cleanText.split(' ').filter(Boolean).slice(0, 6)
      const text = words.join(' ')

      const cleanHighlight = (line.highlight || '')
        .replace(/[^\x00-\x7F]/g, '').replace(/[^A-Za-z]/g, '').toLowerCase().trim()
      const textLower = text.toLowerCase()
      const highlight = textLower.includes(cleanHighlight) && cleanHighlight.length > 1
        ? cleanHighlight
        : words[words.length - 1]?.replace(/[^A-Za-z]/g, '').toLowerCase() || 'now'

      const imageKeyword = (line.imageKeyword || 'ancient history dramatic')
        .replace(/[^\x00-\x7F]/g, '').replace(/['"]/g, '').trim()

      return { id: i, text, highlight, imageKeyword, isHook: i === 0 }
    })

    return NextResponse.json({ success: true, script })
  } catch (error: any) {
    console.error('[generate-script] Error:', error)
    return NextResponse.json({ error: error.message || 'Script generation failed' }, { status: 500 })
  }
}