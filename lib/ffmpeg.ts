// lib/ffmpeg.ts
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import os from 'os'

const execAsync = promisify(exec)

export interface VideoScene {
  imagePath: string
  audioPath: string
  caption: string
  duration: number
}

function ffPath(p: string): string {
  return p.replace(/\\/g, '/')
}

const WINDOWS_FFMPEG_PATHS = [
  'C:/Users/Admin/AppData/Local/Microsoft/WinGet/Links/ffmpeg.exe',
  'C:/ffmpeg/bin/ffmpeg.exe',
  'C:/Program Files/ffmpeg/bin/ffmpeg.exe',
]

const WINDOWS_FFPROBE_PATHS = [
  'C:/Users/Admin/AppData/Local/Microsoft/WinGet/Links/ffprobe.exe',
  'C:/ffmpeg/bin/ffprobe.exe',
  'C:/Program Files/ffmpeg/bin/ffprobe.exe',
]

const WINDOWS_FONT_SOURCES = [
  'C:/Windows/Fonts/arial.ttf',
  'C:/Windows/Fonts/calibri.ttf',
  'C:/Windows/Fonts/segoeui.ttf',
  'C:/Windows/Fonts/tahoma.ttf',
  'C:/Windows/Fonts/verdana.ttf',
]

// Copy a system font into a temp folder whose path has NO colon.
// FFmpeg's filter parser treats ':' as a key=value delimiter even inside
// quoted strings and filter-script files — the only 100% reliable fix is
// a path that contains no colon at all.
let _cachedFontPath: string | null = null
function getSafeFont(): string | null {
  if (_cachedFontPath && fs.existsSync(_cachedFontPath)) return _cachedFontPath

  for (const src of WINDOWS_FONT_SOURCES) {
    try {
      if (!fs.existsSync(src)) continue
      // os.tmpdir() returns something like C:\Users\...\AppData\Local\Temp
      // We place the font at a path with no colon by using a relative-style
      // temp folder under the user's home that we know has no colon after
      // the drive prefix — we strip the drive letter entirely and use a
      // UNC-style workaround: copy to %TEMP%\ffont\arial.ttf then reference
      // it via the 8.3 / relative trick... actually the simplest approach:
      // just use a path under the system drive root where there is no colon.
      // The trick: use //?/C:/... No — that doesn't help the filter parser.
      //
      // REAL fix: copy font to a path with no colon at all by using a
      // subdirectory of the current working directory (relative path).
      const destDir = path.join(process.cwd(), '.ffmpeg-fonts')
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
      const destPath = path.join(destDir, path.basename(src))
      if (!fs.existsSync(destPath)) fs.copyFileSync(src, destPath)
      // Use a relative path — no drive letter, no colon
      _cachedFontPath = destPath
      return _cachedFontPath
    } catch { /* try next */ }
  }
  return null
}

// Convert an absolute path to a relative path from cwd, using forward slashes.
// This removes the drive-letter colon that breaks FFmpeg's filter parser.
function toRelativeFfPath(absPath: string): string {
  const rel = path.relative(process.cwd(), absPath)
  return rel.replace(/\\/g, '/')
}

async function findExe(name: 'ffmpeg' | 'ffprobe'): Promise<string> {
  try { await execAsync(`${name} -version`); return name } catch { /* not in PATH */ }

  const candidates = name === 'ffmpeg' ? WINDOWS_FFMPEG_PATHS : WINDOWS_FFPROBE_PATHS
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        await execAsync(`"${candidate}" -version`)
        return `"${candidate}"`
      }
    } catch { /* try next */ }
  }

  try {
    const { stdout } = await execAsync('where ' + name)
    const found = stdout.trim().split('\n')[0].trim()
    if (found) return `"${found}"`
  } catch { /* not found */ }

  throw new Error(`${name} not found. Add FFMPEG_PATH to your .env.local`)
}

let _ffmpeg: string | null = null
let _ffprobe: string | null = null

async function getFFmpeg(): Promise<string> {
  if (process.env.FFMPEG_PATH) return `"${process.env.FFMPEG_PATH.replace(/\\/g, '/')}"`
  if (!_ffmpeg) _ffmpeg = await findExe('ffmpeg')
  return _ffmpeg
}

async function getFFprobe(): Promise<string> {
  if (process.env.FFPROBE_PATH) return `"${process.env.FFPROBE_PATH.replace(/\\/g, '/')}"`
  if (!_ffprobe) _ffprobe = await findExe('ffprobe')
  return _ffprobe
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
      `${ffprobe} -v quiet -show_entries format=duration -of csv=p=0 "${ffPath(audioPath)}"`
    )
    return parseFloat(stdout.trim()) || 5
  } catch { return 5 }
}

function sanitizeCaption(text: string): string {
  return text
    .replace(/['"\\]/g, '')
    .replace(/:/g, ' ')
    .replace(/[\r\n]/g, ' ')
    .replace(/[[\]]/g, '')
    .replace(/,/g, ' ')
    .substring(0, 80)
}

export async function buildSceneClip(
  scene: VideoScene,
  outputPath: string,
  sceneIndex: number
): Promise<void> {
  const hasImage = fs.existsSync(scene.imagePath) && fs.statSync(scene.imagePath).size > 0
  const caption = sanitizeCaption(scene.caption)

  const kenBurns = sceneIndex % 2 === 0
    ? "scale=1920:1080,zoompan=z='min(zoom+0.0008,1.1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080"
    : "scale=1920:1080,zoompan=z='if(lte(zoom,1.0),1.08,max(1.001,zoom-0.0008))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080"

  // Get font as a RELATIVE path — relative paths have no drive colon,
  // so FFmpeg's filter parser cannot mistake ':' for an option separator.
  const fontAbsPath = getSafeFont()
  const fontRelPath = fontAbsPath ? toRelativeFfPath(fontAbsPath) : null

  const fontPart = fontRelPath ? `fontfile=${fontRelPath}:` : ''
  const drawtext = `drawtext=${fontPart}text='${caption}':fontsize=52:fontcolor=white:bordercolor=black:borderw=3:x=(w-text_w)/2:y=h-140:box=1:boxcolor=black@0.5:boxborderw=15`

  const videoFilter = hasImage
    ? `[0:v]${kenBurns},${drawtext}[v]`
    : `[0:v]${drawtext}[v]`

  const inputFlag = hasImage
    ? `-loop 1 -t ${scene.duration} -i "${ffPath(scene.imagePath)}"`
    : `-f lavfi -i color=c=0x1a1a2e:size=1920x1080:rate=25`

  const ffmpeg = await getFFmpeg()

  // Use -/filter_complex (new syntax) which reads the filter from a file,
  // combined with our colon-free relative font path
  const filterScriptPath = outputPath.replace(/\.mp4$/, '_filter.txt')
  fs.writeFileSync(filterScriptPath, videoFilter, 'utf8')

  const cmd = [
    `${ffmpeg} -y`,
    inputFlag,
    `-i "${ffPath(scene.audioPath)}"`,
    `-/filter_complex "${ffPath(filterScriptPath)}"`,
    `-map "[v]" -map 1:a`,
    `-t ${scene.duration}`,
    `-c:v libx264 -preset fast -crf 23`,
    `-c:a aac -b:a 128k`,
    `-pix_fmt yuv420p`,
    `-movflags +faststart`,
    `"${ffPath(outputPath)}"`,
  ].join(' ')

  try {
    await execAsync(cmd, { timeout: 120000 })
  } finally {
    try { fs.unlinkSync(filterScriptPath) } catch { /* ignore */ }
  }
}

export async function concatenateScenes(
  clipPaths: string[],
  outputPath: string,
  tempDir: string
): Promise<void> {
  const listFile = path.join(tempDir, 'concat_list.txt')
  const listContent = clipPaths
    .filter(p => fs.existsSync(p))
    .map(p => `file '${ffPath(p)}'`)
    .join('\n')

  fs.writeFileSync(listFile, listContent)

  const ffmpeg = await getFFmpeg()
  const cmd = [
    `${ffmpeg} -y`,
    `-f concat -safe 0 -i "${ffPath(listFile)}"`,
    `-c:v libx264 -preset fast -crf 22`,
    `-c:a aac -b:a 192k`,
    `-pix_fmt yuv420p`,
    `-movflags +faststart`,
    `"${ffPath(outputPath)}"`,
  ].join(' ')

  await execAsync(cmd, { timeout: 300000 })
}

export async function addIntroTitle(
  title: string,
  duration: number,
  outputPath: string
): Promise<void> {
  const safeTitle = sanitizeCaption(title)
  const fontAbsPath = getSafeFont()
  const fontRelPath = fontAbsPath ? toRelativeFfPath(fontAbsPath) : null
  const fontPart = fontRelPath ? `fontfile=${fontRelPath}:` : ''

  const filterContent = `[0:v]drawtext=${fontPart}text='${safeTitle}':fontsize=80:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2[v]`
  const filterScriptPath = outputPath.replace(/\.mp4$/, '_filter.txt')
  fs.writeFileSync(filterScriptPath, filterContent, 'utf8')

  const ffmpeg = await getFFmpeg()
  const cmd = [
    `${ffmpeg} -y`,
    `-f lavfi -t ${duration} -i color=c=0x0f0f23:size=1920x1080:rate=25`,
    `-f lavfi -t ${duration} -i anullsrc=r=44100:cl=stereo`,
    `-/filter_complex "${ffPath(filterScriptPath)}"`,
    `-map "[v]" -map 1:a`,
    `-c:v libx264 -preset fast -crf 22`,
    `-c:a aac -b:a 128k`,
    `-pix_fmt yuv420p`,
    `"${outputPath}"`,
  ].join(' ')

  try {
    await execAsync(cmd, { timeout: 30000 })
  } finally {
    try { fs.unlinkSync(filterScriptPath) } catch { /* ignore */ }
  }
}

export function cleanupTempFiles(paths: string[]): void {
  for (const p of paths) {
    try { if (fs.existsSync(p)) fs.unlinkSync(p) } catch { /* ignore */ }
  }
}