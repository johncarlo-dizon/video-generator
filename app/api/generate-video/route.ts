// app/api/generate-video/route.ts
// Full pipeline: script → images → voice → FFmpeg assembly → .mp4
// This is the main orchestrator route

import { NextRequest, NextResponse } from 'next/server'
import { groqChat } from '@/lib/groq'
import { getSceneImage, searchImages } from '@/lib/pexels'
import { generateVoice } from '@/lib/tts'
import {
  checkFFmpeg,
  downloadImage,
  getAudioDuration,
  buildSceneClip,
  concatenateScenes,
  cleanupTempFiles,
} from '@/lib/ffmpeg'
import path from 'path'
import fs from 'fs'
import os from 'os'

// Increase timeout for this route (video takes time)
export const maxDuration = 300 // 5 minutes

export async function POST(req: NextRequest) {
  const tempFiles: string[] = []
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aivid-'))

  try {
    const { script } = await req.json()

    if (!script || !script.scenes) {
      return NextResponse.json({ error: 'Script with scenes required' }, { status: 400 })
    }

    // Check FFmpeg is available
    const ffmpegAvailable = await checkFFmpeg()
    if (!ffmpegAvailable) {
      return NextResponse.json({
        error: 'FFmpeg not installed. Run: sudo apt install ffmpeg (Linux) or brew install ffmpeg (Mac)',
      }, { status: 500 })
    }

    console.log(`[generate-video] Starting pipeline for: ${script.title}`)
    console.log(`[generate-video] Scenes: ${script.scenes.length}`)

    const clipPaths: string[] = []

    // Process each scene
    for (let i = 0; i < script.scenes.length; i++) {
      const scene = script.scenes[i]
      console.log(`[generate-video] Processing scene ${i + 1}/${script.scenes.length}: ${scene.caption}`)

      // Step 1: Download scene image from Pexels
      const imagePath = path.join(tempDir, `scene-${i}.jpg`)
      const imageUrl = await getSceneImage(scene.imageKeyword || scene.caption)
      const imageDownloaded = await downloadImage(imageUrl, imagePath)
      if (imageDownloaded) tempFiles.push(imagePath)

      // Step 2: Generate voice for scene narration
      const audioPath = path.join(tempDir, `audio-${i}.mp3`)
      await generateVoice(scene.narration, audioPath)
      tempFiles.push(audioPath)

      // Step 3: Get actual audio duration
      const duration = await getAudioDuration(audioPath)

      // Step 4: Build video clip for this scene
      const clipPath = path.join(tempDir, `clip-${i}.mp4`)
      await buildSceneClip(
        {
          imagePath,
          audioPath,
          caption: scene.caption,
          duration: Math.max(duration, scene.duration || 8),
        },
        clipPath,
        i
      )
      tempFiles.push(clipPath)
      clipPaths.push(clipPath)

      console.log(`[generate-video] Scene ${i + 1} done (${duration.toFixed(1)}s)`)
    }

    // Step 5: Concatenate all clips into final video
    const finalVideoPath = path.join(tempDir, 'final.mp4')
    await concatenateScenes(clipPaths, finalVideoPath, tempDir)

    // Step 6: Read video and return as base64
    const videoBuffer = fs.readFileSync(finalVideoPath)
    const videoBase64 = videoBuffer.toString('base64')
    const fileSizeKB = Math.round(videoBuffer.length / 1024)

    console.log(`[generate-video] Complete! Size: ${fileSizeKB}KB`)

    // Cleanup temp files
    cleanupTempFiles(tempFiles)
    cleanupTempFiles([finalVideoPath])
    try { fs.rmdirSync(tempDir) } catch {}

    return NextResponse.json({
      success: true,
      video: videoBase64,
      mimeType: 'video/mp4',
      fileSizekb: fileSizeKB,
      title: script.title,
      tags: script.tags || [],
    })

  } catch (error: any) {
    // Cleanup on error too
    cleanupTempFiles(tempFiles)
    try { fs.rmSync(tempDir, { recursive: true }) } catch {}

    console.error('[generate-video] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Video generation failed' },
      { status: 500 }
    )
  }
}
