// app/api/generate-video/route.ts
// New pipeline:
//  1. Generate full narration text from all lines
//  2. TTS the full narration as ONE audio file
//  3. Compute per-line timing based on word count
//  4. Fetch images (one per ~1.5s)
//  5. Build image clips (video only)
//  6. Generate ASS subtitle file with timed lines + keyword highlights
//  7. Assemble: concat clips + audio + burn subs → final.mp4

import { NextRequest, NextResponse } from 'next/server'
import { searchImages } from '@/lib/pexels'
import { generateVoice } from '@/lib/tts'
import {
  checkFFmpeg,
  downloadImage,
  getAudioDuration,
  buildImageClip,
  assembleVideo,
  generateASSSubtitles,
  cleanupTempFiles,
  SubtitleLine,
} from '@/lib/ffmpeg'
import path from 'path'
import fs from 'fs'
import os from 'os'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const tempFiles: string[] = []
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aivid-'))

  try {
    const { script } = await req.json()

    if (!script || !script.lines || !Array.isArray(script.lines)) {
      return NextResponse.json({ error: 'Script with lines required' }, { status: 400 })
    }

    const ok = await checkFFmpeg()
    if (!ok) {
      return NextResponse.json({ error: 'FFmpeg not found. Check FFMPEG_PATH in .env.local' }, { status: 500 })
    }

    const lines = script.lines as Array<{
      id: number
      text: string
      highlight: string
      imageKeyword: string
      isHook: boolean
    }>

    console.log(`[generate-video] "${script.title}" — ${lines.length} subtitle lines`)

    // ── Step 1: Build full narration script ──────────────────────────────────
    // Join all lines into continuous narration text
    const fullNarration = lines.map(l => l.text).join(' ')
    console.log(`[generate-video] Narration: "${fullNarration.substring(0, 80)}..." (${fullNarration.split(' ').length} words)`)

    // ── Step 2: Generate single TTS audio file ───────────────────────────────
    const audioPath = path.join(tempDir, 'narration.mp3')
    await generateVoice(fullNarration, audioPath)
    tempFiles.push(audioPath)

    const totalAudioDuration = await getAudioDuration(audioPath)
    console.log(`[generate-video] Audio duration: ${totalAudioDuration.toFixed(2)}s`)

    // ── Step 3: Compute per-line timing ──────────────────────────────────────
    // Distribute audio time proportionally by word count per line
    const wordCounts = lines.map(l => Math.max(1, l.text.split(' ').filter(Boolean).length))
    const totalWords = wordCounts.reduce((a, b) => a + b, 0)

    const subtitleLines: SubtitleLine[] = []
    let cursor = 0.05  // slight offset so first line doesn't clip

    lines.forEach((line, i) => {
      const proportion = wordCounts[i] / totalWords
      const lineDuration = proportion * (totalAudioDuration - 0.1)
      const startTime = cursor
      const endTime = cursor + lineDuration

      subtitleLines.push({
        id: line.id,
        text: line.text,
        highlight: line.highlight,
        startTime,
        endTime,
        isHook: i === 0,
      })

      cursor = endTime
    })

    console.log(`[generate-video] Timing computed: ${subtitleLines.length} cues across ${totalAudioDuration.toFixed(2)}s`)

    // ── Step 4: Determine image clips ────────────────────────────────────────
    // Each image covers ~1.5–2.5s. Group consecutive lines with same keyword.
    const IMAGE_DURATION = 1.8  // seconds per image clip

    // Build clip list from subtitle timing
    interface ClipSpec { imagePath: string; duration: number; zoomMode: number }
    const clips: ClipSpec[] = []

    let clipCursor = 0
    let imageIndex = 0
    const downloadedImages: Map<string, string> = new Map()

    // Group lines into image segments
    const totalVideoDuration = totalAudioDuration
    while (clipCursor < totalVideoDuration - 0.1) {
      const clipDuration = Math.min(IMAGE_DURATION, totalVideoDuration - clipCursor)
      if (clipDuration < 0.3) break

      // Find which line is active at this clip's midpoint
      const midPoint = clipCursor + clipDuration / 2
      const activeLine = subtitleLines.find(l => l.startTime <= midPoint && l.endTime > midPoint)
        ?? subtitleLines[subtitleLines.length - 1]

      const keyword = activeLine?.imageKeyword || lines[0]?.imageKeyword || 'ancient history'

      clips.push({
        imagePath: `__FETCH__${keyword}__IDX__${imageIndex}`,
        duration: clipDuration,
        zoomMode: imageIndex % 4,
      })

      clipCursor += clipDuration
      imageIndex++
    }

    console.log(`[generate-video] Need ${clips.length} image clips`)

    // ── Step 5: Fetch and download images ────────────────────────────────────
    // Batch fetch by unique keywords
    const keywordGroups: Map<string, number[]> = new Map()
    clips.forEach((clip, i) => {
      const match = clip.imagePath.match(/^__FETCH__(.+)__IDX__\d+$/)
      if (!match) return
      const kw = match[1]
      if (!keywordGroups.has(kw)) keywordGroups.set(kw, [])
      keywordGroups.get(kw)!.push(i)
    })

    const fetchedImageUrls: Map<string, string[]> = new Map()
    for (const [kw] of keywordGroups) {
      try {
        const photos = await searchImages(kw, 4)
        const urls = photos.map((p: any) => p.src.large).filter(Boolean)
        if (urls.length === 0) {
          const fallback = await searchImages('ancient history dramatic', 4)
          fetchedImageUrls.set(kw, fallback.map((p: any) => p.src.large).filter(Boolean))
        } else {
          fetchedImageUrls.set(kw, urls)
        }
      } catch {
        fetchedImageUrls.set(kw, [])
      }
    }

    // Track index per keyword to cycle through images
    const keywordUsageCount: Map<string, number> = new Map()

    // Download all needed images and resolve clip paths
    const resolvedClips: Array<{ imagePath: string; duration: number; zoomMode: number }> = []

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i]
      const match = clip.imagePath.match(/^__FETCH__(.+)__IDX__\d+$/)
      if (!match) { resolvedClips.push(clip); continue }

      const kw = match[1]
      const urls = fetchedImageUrls.get(kw) || []
      const useCount = keywordUsageCount.get(kw) || 0
      const url = urls[useCount % Math.max(urls.length, 1)] || ''
      keywordUsageCount.set(kw, useCount + 1)

      const imgKey = `${kw}_${useCount}`
      let imgPath = ''

      if (url && !downloadedImages.has(imgKey)) {
        imgPath = path.join(tempDir, `img_${i}.jpg`)
        const ok = await downloadImage(url, imgPath)
        if (ok) {
          downloadedImages.set(imgKey, imgPath)
          tempFiles.push(imgPath)
        }
      } else if (downloadedImages.has(imgKey)) {
        imgPath = downloadedImages.get(imgKey)!
      }

      resolvedClips.push({ imagePath: imgPath, duration: clip.duration, zoomMode: clip.zoomMode })
    }

    // ── Step 6: Build image video clips ──────────────────────────────────────
    const clipPaths: string[] = []
    for (let i = 0; i < resolvedClips.length; i++) {
      const clip = resolvedClips[i]
      const clipPath = path.join(tempDir, `clip_${i}.mp4`)

      console.log(`[generate-video] Building clip ${i + 1}/${resolvedClips.length} (${clip.duration.toFixed(2)}s)`)
      await buildImageClip(clip.imagePath, clip.duration, clipPath, clip.zoomMode)

      clipPaths.push(clipPath)
      tempFiles.push(clipPath)
    }

    // ── Step 7: Generate ASS subtitle file ───────────────────────────────────
    const fontPath = '/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf'
    const assContent = generateASSSubtitles(subtitleLines, fontPath)
    const assPath = path.join(tempDir, 'subs.ass')
    fs.writeFileSync(assPath, assContent, 'utf8')
    tempFiles.push(assPath)

    // ── Step 8: Final assembly ────────────────────────────────────────────────
    console.log(`[generate-video] Assembling final video...`)
    const finalPath = path.join(tempDir, 'final.mp4')
    await assembleVideo(clipPaths, audioPath, assContent, finalPath, tempDir)

    const videoBuffer = fs.readFileSync(finalPath)
    const videoBase64 = videoBuffer.toString('base64')
    const fileSizeKB = Math.round(videoBuffer.length / 1024)

    console.log(`[generate-video] Done! ${fileSizeKB}KB, ${totalAudioDuration.toFixed(1)}s`)

    cleanupTempFiles(tempFiles)
    cleanupTempFiles([finalPath, assPath])
    try { fs.rmdirSync(tempDir) } catch {}

    return NextResponse.json({
      success: true,
      video: videoBase64,
      mimeType: 'video/mp4',
      fileSizekb: fileSizeKB,
      title: script.title,
      tags: script.tags || [],
      duration: Math.round(totalAudioDuration),
    })

  } catch (error: any) {
    cleanupTempFiles(tempFiles)
    try { fs.rmSync(tempDir, { recursive: true }) } catch {}
    console.error('[generate-video] Error:', error)
    return NextResponse.json({ error: error.message || 'Video generation failed' }, { status: 500 })
  }
}