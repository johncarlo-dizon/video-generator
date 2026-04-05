// lib/tts.ts
// Text-to-Speech with two free modes:
// 1. gTTS (Google TTS via Python) - UNLIMITED FREE, lower quality
// 2. ElevenLabs - 10,000 chars/month free, professional quality
//
// Set TTS_MODE in .env.local to switch between them

import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import fs from 'fs'

const execAsync = promisify(exec)

// Detect Python executable (Windows uses 'python', Linux/Mac uses 'python3')
async function getPythonExe(): Promise<string> {
  for (const py of ['python', 'python3']) {
    try {
      await execAsync(`${py} --version`)
      return py
    } catch { /* try next */ }
  }
  throw new Error('Python not found. Install Python from python.org')
}

// gTTS: Uses Python's gtts library - completely free, no API key needed
// Install: pip install gtts  (or: python -m pip install gtts)
export async function ttsGtts(text: string, outputPath: string): Promise<void> {
  const pyExe = await getPythonExe()

  // Write a temp Python script file — avoids all shell escaping issues on Windows
  const scriptPath = outputPath.replace(/\.mp3$/, '_tts.py')
  // Safely embed text using JSON.stringify so any quotes/backslashes are escaped
  const safeText = JSON.stringify(text)

  // Windows paths need forward slashes inside Python strings
  const safePath = outputPath.replace(/\\/g, '/')

  const pyScript = `
import sys
try:
    from gtts import gTTS
except ImportError:
    print("ModuleNotFoundError: gtts not installed", file=sys.stderr)
    sys.exit(1)
tts = gTTS(text=${safeText}, lang='en', slow=False)
tts.save(${JSON.stringify(safePath)})
print("OK")
`
  fs.writeFileSync(scriptPath, pyScript, 'utf8')

  try {
    await execAsync(`${pyExe} "${scriptPath}"`, { timeout: 30000 })
  } catch (err: any) {
    if (err.stderr?.includes('ModuleNotFoundError') || err.message.includes('ModuleNotFoundError')) {
      throw new Error(
        'gTTS not installed. Run in your terminal:\n' +
        '  python -m pip install gtts\n' +
        'Or set TTS_MODE=elevenlabs in .env.local'
      )
    }
    throw err
  } finally {
    // Clean up temp script
    try { fs.unlinkSync(scriptPath) } catch { /* ignore */ }
  }
}

// ElevenLabs: Free tier = 10,000 chars/month
// Best voice for YouTube: "Rachel" (professional, clear)
export async function ttsElevenLabs(
  text: string,
  outputPath: string,
  voiceId: string = '21m00Tcm4TlvDq8ikWAM' // Rachel voice
): Promise<void> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not set in .env.local')

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    }
  )

  if (!res.ok) {
    const body = await res.text()
    if (res.status === 401) throw new Error('Invalid ElevenLabs API key')
    if (res.status === 429) throw new Error('ElevenLabs rate limit hit')
    throw new Error(`ElevenLabs error ${res.status}: ${body}`)
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(outputPath, buffer)
}

// Main TTS function — auto-selects based on TTS_MODE env var
export async function generateVoice(
  text: string,
  outputPath: string
): Promise<void> {
  const mode = process.env.TTS_MODE || 'gtts'

  console.log(`[TTS] Using mode: ${mode}`)
  console.log(`[TTS] Text length: ${text.length} chars`)

  if (mode === 'elevenlabs' && process.env.ELEVENLABS_API_KEY) {
    await ttsElevenLabs(text, outputPath)
  } else {
    await ttsGtts(text, outputPath)
  }

  // Verify file was created
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    throw new Error('TTS failed: output file is empty or missing')
  }

  console.log(`[TTS] Audio saved: ${outputPath}`)
}

// Count chars to estimate ElevenLabs usage
export function countChars(scripts: string[]): number {
  return scripts.reduce((sum, s) => sum + s.length, 0)
}
