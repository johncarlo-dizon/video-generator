// lib/ffmpeg.ts
// Complete rewrite: ASS subtitle track, proper Ken Burns, clean assembly pipeline
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'

const execAsync = promisify(exec)

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SubtitleLine {
  id: number
  text: string
  highlight: string   // one word to colour yellow
  startTime: number   // seconds from video start
  endTime: number     // seconds from video start
  isHook: boolean
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

function fp(p: string): string {
  return p.replace(/\\/g, '/')
}

const FFMPEG_CANDIDATES = [
  process.env.FFMPEG_PATH,
  'C:/Users/Admin/AppData/Local/Microsoft/WinGet/Links/ffmpeg.exe',
  'C:/ffmpeg/bin/ffmpeg.exe',
  'ffmpeg',
].filter(Boolean) as string[]

const FFPROBE_CANDIDATES = [
  process.env.FFPROBE_PATH,
  'C:/Users/Admin/AppData/Local/Microsoft/WinGet/Links/ffprobe.exe',
  'C:/ffmpeg/bin/ffprobe.exe',
  'ffprobe',
].filter(Boolean) as string[]

const FONT_CANDIDATES = [
  // Linux
  '/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  // Windows
  'C:/Windows/Fonts/Poppins-Bold.ttf',
  'C:/Windows/Fonts/arial.ttf',
]

let _ffmpeg: string | null = null
let _ffprobe: string | null = null
let _font: string | null = null

async function getFFmpeg(): Promise<string> {
  if (_ffmpeg) return _ffmpeg
  for (const c of FFMPEG_CANDIDATES) {
    try { await execAsync(`"${c}" -version`); _ffmpeg = `"${c}"`; return _ffmpeg } catch {}
  }
  throw new Error('FFmpeg not found. Set FFMPEG_PATH in .env.local')
}

async function getFFprobe(): Promise<string> {
  if (_ffprobe) return _ffprobe
  for (const c of FFPROBE_CANDIDATES) {
    try { await execAsync(`"${c}" -version`); _ffprobe = `"${c}"`; return _ffprobe } catch {}
  }
  throw new Error('FFprobe not found.')
}

function getFont(): string {
  if (_font) return _font
  for (const f of FONT_CANDIDATES) {
    if (fs.existsSync(f)) { _font = f; return _font }
  }
  // Windows fallback: copy arial to local cache
  const destDir = path.join(process.cwd(), '.ffmpeg-fonts')
  const src = 'C:/Windows/Fonts/arial.ttf'
  try {
    if (fs.existsSync(src)) {
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
      const dest = path.join(destDir, 'arial.ttf')
      if (!fs.existsSync(dest)) fs.copyFileSync(src, dest)
      _font = dest; return _font
    }
  } catch {}
  return ''
}

export async function checkFFmpeg(): Promise<boolean> {
  try { await getFFmpeg(); return true } catch { return false }
}

export async function downloadImage(url: string, destPath: string): Promise<boolean> {
  if (!url) return false
  try {
    const res = await fetch(url)
    if (!res.ok) return false
    fs.writeFileSync(destPath, Buffer.from(await res.arrayBuffer()))
    return true
  } catch { return false }
}

export async function getAudioDuration(audioPath: string): Promise<number> {
  try {
    const ffprobe = await getFFprobe()
    const { stdout } = await execAsync(
      `${ffprobe} -v quiet -show_entries format=duration -of csv=p=0 "${fp(audioPath)}"`
    )
    return parseFloat(stdout.trim()) || 5
  } catch { return 5 }
}

// ─── ASS Subtitle Generator ──────────────────────────────────────────────────

function toASS(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const cs = Math.round((sec % 1) * 100)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

export function generateASSSubtitles(lines: SubtitleLine[], fontPath: string): string {
  const fontName = fontPath.includes('Poppins') ? 'Poppins' : 'Arial'

  // ASS colours: &HAABBGGRR
  const WHITE    = '&H00FFFFFF'
  const YELLOW   = '&H0000D6FF'  // FFD600 yellow in BGR
  const BLACK_BG = '&HC8000000'  // semi-transparent black

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hook,${fontName},108,${WHITE},${WHITE},&H00000000,${BLACK_BG},-1,0,0,0,100,100,2,0,1,4,4,2,80,80,300,1
Style: Sub,${fontName},80,${WHITE},${WHITE},&H00000000,${BLACK_BG},-1,0,0,0,100,100,1,0,1,3,3,2,80,80,275,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`

  const events = lines.map(line => {
    const styleName = line.isHook ? 'Hook' : 'Sub'
    const start = toASS(line.startTime)
    const end = toASS(line.endTime)
    const highlightLower = line.highlight.toLowerCase()

    // Highlight key word yellow
    const words = line.text.split(' ')
    let found = false
    const formatted = words.map(word => {
      const clean = word.toLowerCase().replace(/[^a-z]/g, '')
      if (!found && clean === highlightLower) {
        found = true
        return `{\\c${YELLOW}\\b1}${word}{\\r}`
      }
      return word
    }).join(' ')

    // Animation: hook gets scale pop, others get fast fade-in
    const anim = line.isHook
      ? `{\\fad(100,0)\\t(0,120,\\fscx104\\fscy104)\\fscx100\\fscy100}`
      : `{\\fad(80,0)}`

    return `Dialogue: 0,${start},${end},${styleName},,0,0,0,,${anim}${formatted}`
  }).join('\n')

  return header + '\n' + events + '\n'
}

// ─── Ken Burns filter ────────────────────────────────────────────────────────

function kenBurnsFilter(duration: number, mode: number, fps: number): string {
  const frames = Math.max(Math.ceil(duration * fps), 2)
  const base = `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920`

  switch (mode % 4) {
    case 0: return `${base},zoompan=z='min(zoom+0.0004,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=${fps}`
    case 1: return `${base},zoompan=z='if(lte(zoom,1.0),1.07,max(1.001,zoom-0.0004))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=${fps}`
    case 2: return `${base},zoompan=z='1.06':x='iw/2-(iw/zoom/2)+(iw*0.04)*on/${frames}':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=${fps}`
    case 3: return `${base},zoompan=z='1.06':x='(iw/2-(iw/zoom/2))-(iw*0.04)*on/${frames}':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=${fps}`
    default: return `${base},zoompan=z='1.05':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=1080x1920:fps=${fps}`
  }
}

// ─── Build single image clip (video only, no audio) ──────────────────────────

export async function buildImageClip(
  imagePath: string,
  duration: number,
  outputPath: string,
  zoomMode: number
): Promise<void> {
  const ffmpeg = await getFFmpeg()
  const fps = 25
  const hasImage = !!(imagePath && fs.existsSync(imagePath) && fs.statSync(imagePath).size > 500)

  const filterScript = outputPath.replace(/\.mp4$/, '.filter')

  let imageInput: string
  let filterContent: string

  if (hasImage) {
    imageInput = `-loop 1 -t ${(duration + 0.5).toFixed(3)} -i "${fp(imagePath)}"`
    filterContent = `[0:v]${kenBurnsFilter(duration, zoomMode, fps)}[v]`
  } else {
    imageInput = `-f lavfi -i color=c=0x0d0d1a:size=1080x1920:rate=${fps}`
    filterContent = `[0:v]scale=1080:1920[v]`
  }

  fs.writeFileSync(filterScript, filterContent, 'utf8')

  const cmd = [
    `${ffmpeg} -y`,
    imageInput,
    `-filter_complex_script "${fp(filterScript)}"`,
    `-map "[v]"`,
    `-t ${duration.toFixed(3)}`,
    `-r ${fps}`,
    `-c:v libx264 -preset fast -crf 22`,
    `-pix_fmt yuv420p`,
    `-an`,
    `"${fp(outputPath)}"`,
  ].join(' ')

  try {
    await execAsync(cmd, { timeout: 120000 })
  } finally {
    try { fs.unlinkSync(filterScript) } catch {}
  }
}

// ─── Final assembly: concat + audio + ASS subtitles ──────────────────────────

export async function assembleVideo(
  clipPaths: string[],
  audioPath: string,
  assContent: string,
  outputPath: string,
  tempDir: string
): Promise<void> {
  const ffmpeg = await getFFmpeg()
  const fontPath = getFont()

  const validClips = clipPaths.filter(p => {
    try { return fs.existsSync(p) && fs.statSync(p).size > 500 } catch { return false }
  })
  if (validClips.length === 0) throw new Error('No valid clips to assemble')

  // Write ASS to file
  const assPath = path.join(tempDir, 'subs.ass')
  fs.writeFileSync(assPath, assContent, 'utf8')

  // Step 1: Concat video clips
  const listFile = path.join(tempDir, 'concat.txt')
  fs.writeFileSync(listFile, validClips.map(p => `file '${fp(p)}'`).join('\n'), 'utf8')

  const concatPath = path.join(tempDir, 'concat_raw.mp4')
  await execAsync(
    `${ffmpeg} -y -f concat -safe 0 -i "${fp(listFile)}" -c:v copy -an "${fp(concatPath)}"`,
    { timeout: 120000 }
  )

  // Step 2: Add audio + burn ASS subtitles
  // For Windows: ASS path needs colon escaped. For Linux: use as-is.
  const isWindows = process.platform === 'win32'
  const assEscaped = isWindows
    ? fp(assPath).replace(/:/g, '\\:')
    : fp(assPath)
  const fontDir = fontPath ? fp(path.dirname(fontPath)) : ''
  const fontDirEscaped = isWindows && fontDir ? fontDir.replace(/:/g, '\\:') : fontDir

  const subFilter = fontDir
    ? `ass='${assEscaped}':fontsdir='${fontDirEscaped}'`
    : `ass='${assEscaped}'`

  const filterScript = path.join(tempDir, 'final.filter')
  fs.writeFileSync(filterScript, `[0:v]${subFilter}[v]`, 'utf8')

  const finalCmd = [
    `${ffmpeg} -y`,
    `-i "${fp(concatPath)}"`,
    `-i "${fp(audioPath)}"`,
    `-filter_complex_script "${fp(filterScript)}"`,
    `-map "[v]" -map 1:a`,
    `-shortest`,
    `-c:v libx264 -preset fast -crf 21`,
    `-c:a aac -b:a 192k`,
    `-pix_fmt yuv420p`,
    `-movflags +faststart`,
    `"${fp(outputPath)}"`,
  ].join(' ')

  try {
    await execAsync(finalCmd, { timeout: 300000 })
  } finally {
    try { fs.unlinkSync(filterScript) } catch {}
    try { fs.unlinkSync(concatPath) } catch {}
    try { fs.unlinkSync(listFile) } catch {}
  }
}

export function cleanupTempFiles(paths: string[]): void {
  for (const p of paths) {
    try { if (p && fs.existsSync(p)) fs.unlinkSync(p) } catch {}
  }
}