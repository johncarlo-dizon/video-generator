// app/api/generate-script/route.ts
// Generates a video script using Groq (free, ultra-fast)
// Returns structured JSON with scenes, each with text + image keyword

import { NextRequest, NextResponse } from 'next/server'
import { groqChat } from '@/lib/groq'

export async function POST(req: NextRequest) {
  try {
    const { topic, style, duration } = await req.json()

    if (!topic || topic.trim().length < 3) {
      return NextResponse.json(
        { error: 'Topic is required (minimum 3 characters)' },
        { status: 400 }
      )
    }

    const maxScenes = Math.min(Math.floor((duration || 60) / 10), 6)

    const systemPrompt = `You are an expert YouTube short-form video scriptwriter.
Your scripts are engaging, punchy, and optimized for retention.
Always respond with ONLY valid JSON, no markdown, no explanation.`

    const userPrompt = `Create a ${duration || 60}-second YouTube video script about: "${topic}"
Style: ${style || 'educational and engaging'}

Return ONLY this JSON structure with ${maxScenes} scenes:
{
  "title": "Video title (hook-style, max 60 chars)",
  "hook": "Opening hook sentence (makes viewer stay)",
  "scenes": [
    {
      "id": 1,
      "narration": "What the narrator says (15-20 words max per scene)",
      "caption": "Short on-screen text (max 8 words)",
      "imageKeyword": "Pexels search keyword for background image (2-3 words)",
      "duration": 10
    }
  ],
  "callToAction": "Subscribe/like call to action (1 sentence)",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}

Rules:
- Each scene narration should be short and powerful
- Image keywords must be concrete and visual (e.g. "mountain sunrise" not "success")  
- Total narration when read aloud should be ~${duration || 60} seconds
- Make the hook irresistible in the first 3 seconds
- Tags should be SEO-optimized for YouTube`

    const raw = await groqChat(
      [{ role: 'user', content: userPrompt }],
      {
        systemPrompt,
        maxTokens: 1500,
        temperature: 0.8,
      }
    )

    // Parse JSON response - strip any markdown if model added it
    let script
    try {
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      script = JSON.parse(cleaned)
    } catch {
      return NextResponse.json(
        { error: 'Script generation failed to parse. Please try again.' },
        { status: 500 }
      )
    }

    // Validate required fields
    if (!script.scenes || !Array.isArray(script.scenes)) {
      return NextResponse.json(
        { error: 'Invalid script structure received. Please try again.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, script })

  } catch (error: any) {
    console.error('[generate-script] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Script generation failed' },
      { status: 500 }
    )
  }
}
