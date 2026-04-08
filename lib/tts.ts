// lib/tts.ts
// Generates a single continuous audio file from the full narration text.
// ElevenLabs (primary) or gTTS (fallback) — both output one .mp3 file.

import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'

const execAsync = promisify(exec)

async function getPython(): Promise<string> {
  for (const py of ['python', 'python3']) {
    try { await execAsync(`${py} --version`); return py } catch {}
  }
  throw new Error('Python not found. Install from python.org')
}

// ─── gTTS ─────────────────────────────────────────────────────────────────
// Free, unlimited, slightly robotic. Speed increased via FFmpeg atempo filter.
export async function ttsGtts(text: string, outputPath: string): Promise<void> {
  const py = await getPython()
  const safePath = outputPath.replace(/\\/g, '/')
  const tmpPath = safePath.replace(/\.mp3$/, '_raw.mp3')

  // Write python script to temp file to avoid shell quoting issues
  const pyScript = outputPath.replace(/\.mp3$/, '_tts.py')
  const script = `
import sys
try:
    from gtts import gTTS
except ImportError:
    print("ERROR: gtts not installed. Run: pip install gtts", file=sys.stderr)
    sys.exit(1)
tts = gTTS(text=${JSON.stringify(text)}, lang='en', slow=False, tld='com')
tts.save(${JSON.stringify(tmpPath)})
print("OK")
`.trim()

  fs.writeFileSync(pyScript, script, 'utf8')

  try {
    await execAsync(`${py} "${pyScript}"`, { timeout: 45000 })
  } catch (err: any) {
    if (err.stderr?.includes('gtts') || err.message?.includes('gtts')) {
      throw new Error('gTTS not installed. Run: pip install gtts')
    }
    throw err
  } finally {
    try { fs.unlinkSync(pyScript) } catch {}
  }

  if (!fs.existsSync(tmpPath) || fs.statSync(tmpPath).size === 0) {
    throw new Error('gTTS produced empty audio file')
  }

  // Speed up slightly with FFmpeg atempo (1.08x = natural fast narrator pace)
  // This removes the robotic slowness of gTTS without distortion
  const ffmpeg = process.env.FFMPEG_PATH
    ? `"${process.env.FFMPEG_PATH.replace(/\\/g, '/')}"`
    : 'ffmpeg'

  try {
    await execAsync(
      `${ffmpeg} -y -i "${tmpPath}" -filter:a "atempo=1.08" -c:a libmp3lame -b:a 128k "${safePath}"`,
      { timeout: 30000 }
    )
    fs.unlinkSync(tmpPath)
  } catch {
    // If speed-up fails, use raw file
    fs.renameSync(tmpPath, outputPath)
  }
}

// ─── ElevenLabs ───────────────────────────────────────────────────────────
// 10k chars/month free. Natural, emotional voice. Best quality.
export async function ttsElevenLabs(text: string, outputPath: string): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set')

  const voiceId = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJgB' // Adam

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: {
        stability: 0.42,
        similarity_boost: 0.82,
        style: 0.35,           // slight expressiveness
        use_speaker_boost: true,
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    if (res.status === 401) throw new Error(`ElevenLabs 401: Invalid API key`)
    if (res.status === 422) throw new Error(`ElevenLabs 422: ${body}`)
    throw new Error(`ElevenLabs ${res.status}: ${body}`)
  }

  fs.writeFileSync(outputPath, Buffer.from(await res.arrayBuffer()))
}

// ─── Main export ──────────────────────────────────────────────────────────
export async function generateVoice(text: string, outputPath: string): Promise<void> {
  const mode = process.env.TTS_MODE || 'gtts'
  const charCount = text.length

  console.log(`[TTS] Mode: ${mode} | ${charCount} chars | "${text.substring(0, 60)}..."`)

  if (mode === 'elevenlabs' && process.env.ELEVENLABS_API_KEY) {
    await ttsElevenLabs(text, outputPath)
  } else {
    if (mode === 'elevenlabs') {
      console.warn('[TTS] ElevenLabs selected but no API key — falling back to gTTS')
    }
    await ttsGtts(text, outputPath)
  }

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    throw new Error('TTS failed: output file empty or missing')
  }

  const kb = Math.round(fs.statSync(outputPath).size / 1024)
  console.log(`[TTS] Done: ${outputPath} (${kb}KB)`)
}

export function countChars(texts: string[]): number {
  return texts.reduce((s, t) => s + t.length, 0)
}