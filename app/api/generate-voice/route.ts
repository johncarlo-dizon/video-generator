// app/api/generate-voice/route.ts
// Converts script narration text to audio using gTTS (free) or ElevenLabs

import { NextRequest, NextResponse } from 'next/server'
import { generateVoice } from '@/lib/tts'
import path from 'path'
import fs from 'fs'
import os from 'os'

export async function POST(req: NextRequest) {
  try {
    const { scenes } = await req.json()

    if (!scenes || !Array.isArray(scenes)) {
      return NextResponse.json({ error: 'Scenes array required' }, { status: 400 })
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aivid-voice-'))
    const audioPaths: string[] = []

    // Generate audio for each scene
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i]
      const audioPath = path.join(tempDir, `scene-${i}.mp3`)

      const text = scene.narration || scene.caption || `Scene ${i + 1}`
      await generateVoice(text, audioPath)
      audioPaths.push(audioPath)
    }

    // Return audio as base64 so frontend can pass to next step
    const audioData = audioPaths.map((p, i) => ({
      sceneId: scenes[i].id,
      path: p,
      base64: fs.readFileSync(p).toString('base64'),
    }))

    return NextResponse.json({
      success: true,
      audioData,
      tempDir,
      mode: process.env.TTS_MODE || 'gtts',
    })

  } catch (error: any) {
    console.error('[generate-voice] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Voice generation failed' },
      { status: 500 }
    )
  }
}
