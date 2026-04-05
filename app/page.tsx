'use client'
// app/page.tsx — Main UI for AI Video Generator

import { useState, useRef } from 'react'
import styles from './page.module.css'

type Step = 'idle' | 'scripting' | 'voicing' | 'visuals' | 'assembling' | 'done' | 'error'

interface Scene {
  id: number
  narration: string
  caption: string
  imageKeyword: string
  duration: number
}

interface Script {
  title: string
  hook: string
  scenes: Scene[]
  callToAction: string
  tags: string[]
}

const STEPS = [
  { key: 'scripting', label: 'Writing Script', icon: '✍️' },
  { key: 'voicing',   label: 'Generating Voice', icon: '🎙️' },
  { key: 'visuals',   label: 'Fetching Visuals', icon: '🖼️' },
  { key: 'assembling',label: 'Assembling Video', icon: '🎬' },
]

const VIDEO_STYLES = [
  'Educational & Clear',
  'Storytelling',
  'Motivational',
  'Listicle (Top 5...)',
  'Tutorial / How-To',
  'Shocking Facts',
]

export default function Home() {
  const [topic, setTopic] = useState('')
  const [style, setStyle] = useState(VIDEO_STYLES[0])
  const [duration, setDuration] = useState(60)
  const [step, setStep] = useState<Step>('idle')
  const [script, setScript] = useState<Script | null>(null)
  const [videoSrc, setVideoSrc] = useState<string | null>(null)
  const [videoTitle, setVideoTitle] = useState('')
  const [videoTags, setVideoTags] = useState<string[]>([])
  const [error, setError] = useState('')
  const [showScript, setShowScript] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const isGenerating = ['scripting', 'voicing', 'visuals', 'assembling'].includes(step)

  async function generate() {
    if (!topic.trim() || isGenerating) return
    setError('')
    setVideoSrc(null)
    setScript(null)
    setStep('scripting')

    try {
      // Step 1: Generate script with Groq
      const scriptRes = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, style, duration }),
      })
      const scriptData = await scriptRes.json()
      if (!scriptRes.ok) throw new Error(scriptData.error)
      setScript(scriptData.script)
      setStep('voicing')

      // Step 2 + 3 + 4: Full video pipeline
      setStep('visuals')
      await new Promise(r => setTimeout(r, 300)) // Brief UI update
      setStep('assembling')

      const videoRes = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: scriptData.script }),
      })
      const videoData = await videoRes.json()
      if (!videoRes.ok) throw new Error(videoData.error)

      // Set video for playback
      const src = `data:video/mp4;base64,${videoData.video}`
      setVideoSrc(src)
      setVideoTitle(videoData.title || scriptData.script.title)
      setVideoTags(videoData.tags || [])
      setStep('done')

    } catch (err: any) {
      setError(err.message || 'Something went wrong')
      setStep('error')
    }
  }

  function downloadVideo() {
    if (!videoSrc) return
    const a = document.createElement('a')
    a.href = videoSrc
    a.download = `${videoTitle || 'ai-video'}.mp4`
    a.click()
  }

  function reset() {
    setStep('idle')
    setError('')
    setVideoSrc(null)
    setScript(null)
    setTopic('')
  }

  const currentStepIndex = STEPS.findIndex(s => s.key === step)

  return (
    <main className={styles.main}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>⬡</span>
          <span className={styles.logoText}>VideoForge AI</span>
        </div>
        <div className={styles.headerBadge}>
          <span className={styles.dot} />
          Free · Groq Powered
        </div>
      </header>

      <div className={styles.container}>
        {/* Hero */}
        <div className={styles.hero}>
          <h1 className={styles.heroTitle}>
            Turn any idea into a<br />
            <span className={styles.heroGradient}>YouTube-ready video</span>
          </h1>
          <p className={styles.heroSub}>
            AI writes the script, speaks the narration, finds visuals, and assembles your video. Free. No limits on scripts.
          </p>
        </div>

        {/* Input form */}
        {step === 'idle' || step === 'error' ? (
          <div className={styles.card}>
            <div className={styles.inputGroup}>
              <label className={styles.label}>What's your video about?</label>
              <textarea
                className={styles.textarea}
                placeholder="e.g. 5 habits that changed my life, How black holes work, Why you should wake up at 5am..."
                value={topic}
                onChange={e => setTopic(e.target.value)}
                rows={3}
                maxLength={300}
              />
              <span className={styles.charCount}>{topic.length}/300</span>
            </div>

            <div className={styles.row}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Video style</label>
                <select
                  className={styles.select}
                  value={style}
                  onChange={e => setStyle(e.target.value)}
                >
                  {VIDEO_STYLES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.label}>Duration: <strong>{duration}s</strong></label>
                <input
                  type="range"
                  className={styles.range}
                  min={30}
                  max={120}
                  step={10}
                  value={duration}
                  onChange={e => setDuration(Number(e.target.value))}
                />
                <div className={styles.rangeLabels}>
                  <span>30s</span><span>75s</span><span>2min</span>
                </div>
              </div>
            </div>

            {step === 'error' && (
              <div className={styles.errorBox}>
                <span>⚠</span> {error}
              </div>
            )}

            <button
              className={styles.btnPrimary}
              onClick={generate}
              disabled={topic.trim().length < 3}
            >
              Generate Video →
            </button>
          </div>
        ) : null}

        {/* Progress */}
        {isGenerating && (
          <div className={styles.card}>
            <h2 className={styles.progressTitle}>Creating your video...</h2>
            <div className={styles.steps}>
              {STEPS.map((s, i) => {
                const done = i < currentStepIndex
                const active = i === currentStepIndex
                return (
                  <div
                    key={s.key}
                    className={`${styles.stepItem} ${done ? styles.stepDone : ''} ${active ? styles.stepActive : ''}`}
                  >
                    <div className={styles.stepIcon}>
                      {done ? '✓' : active ? <span className={styles.spinner} /> : s.icon}
                    </div>
                    <span className={styles.stepLabel}>{s.label}</span>
                  </div>
                )
              })}
            </div>

            {script && (
              <div className={styles.scriptPreview}>
                <strong>"{script.title}"</strong>
                <span className={styles.hookBadge}>Hook: {script.hook}</span>
              </div>
            )}

            <p className={styles.progressNote}>
              This takes 30–120 seconds depending on video length.<br />
              Groq generates your script in &lt;1 second ⚡
            </p>
          </div>
        )}

        {/* Result */}
        {step === 'done' && videoSrc && (
          <div className={styles.resultCard}>
            <div className={styles.videoWrap}>
              <video
                ref={videoRef}
                src={videoSrc}
                controls
                className={styles.video}
                autoPlay
              />
            </div>

            <div className={styles.resultMeta}>
              <h2 className={styles.resultTitle}>{videoTitle}</h2>

              {videoTags.length > 0 && (
                <div className={styles.tags}>
                  {videoTags.map(tag => (
                    <span key={tag} className={styles.tag}>#{tag}</span>
                  ))}
                </div>
              )}

              <div className={styles.resultActions}>
                <button className={styles.btnPrimary} onClick={downloadVideo}>
                  ↓ Download .mp4
                </button>
                <button
                  className={styles.btnSecondary}
                  onClick={() => setShowScript(!showScript)}
                >
                  {showScript ? 'Hide' : 'View'} Script
                </button>
                <button className={styles.btnGhost} onClick={reset}>
                  Make Another
                </button>
              </div>
            </div>

            {/* Script breakdown */}
            {showScript && script && (
              <div className={styles.scriptFull}>
                <h3 className={styles.scriptHeader}>📄 Full Script</h3>
                <div className={styles.scriptHook}>
                  <strong>Hook:</strong> {script.hook}
                </div>
                {script.scenes.map((scene, i) => (
                  <div key={scene.id} className={styles.sceneRow}>
                    <div className={styles.sceneNum}>Scene {i + 1}</div>
                    <div className={styles.sceneContent}>
                      <div className={styles.sceneNarration}>{scene.narration}</div>
                      <div className={styles.sceneMeta}>
                        📌 Caption: "{scene.caption}" &nbsp;·&nbsp;
                        🖼 Visual: {scene.imageKeyword} &nbsp;·&nbsp;
                        ⏱ {scene.duration}s
                      </div>
                    </div>
                  </div>
                ))}
                <div className={styles.scriptCta}>
                  <strong>CTA:</strong> {script.callToAction}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Info cards */}
        {step === 'idle' && (
          <div className={styles.infoGrid}>
            <div className={styles.infoCard}>
              <div className={styles.infoIcon}>⚡</div>
              <h3>Groq — 0.3s scripts</h3>
              <p>LPU chips make Groq the fastest AI API alive. Script generation takes under 1 second. Free tier: 14,400 requests/day on Llama 3.1 8B.</p>
            </div>
            <div className={styles.infoCard}>
              <div className={styles.infoIcon}>🖼</div>
              <h3>Pexels — Free visuals</h3>
              <p>200 requests/hour, 20,000/month. Completely free, no watermarks, commercial license. AI picks keywords per scene automatically.</p>
            </div>
            <div className={styles.infoCard}>
              <div className={styles.infoIcon}>🎙</div>
              <h3>gTTS — Unlimited voice</h3>
              <p>Google Text-to-Speech via Python — no API key, no limits, completely free. Switch to ElevenLabs free tier for premium voice quality.</p>
            </div>
            <div className={styles.infoCard}>
              <div className={styles.infoIcon}>🎬</div>
              <h3>FFmpeg — Assembly engine</h3>
              <p>Open source video assembly. Ken Burns zoom effect, auto-captions, audio sync. Runs locally on your server. No cloud cost.</p>
            </div>
          </div>
        )}

        {/* Groq limits notice */}
        {step === 'idle' && (
          <div className={styles.limitsBox}>
            <h3 className={styles.limitsTitle}>📊 Groq Free Tier Reality Check</h3>
            <div className={styles.limitsGrid}>
              <div className={styles.limitItem}>
                <span className={styles.limitModel}>llama-3.1-8b-instant</span>
                <span className={styles.limitVal}>14,400 req/day · 30 RPM · 500K TPD</span>
                <span className={styles.limitTag}>Best for volume</span>
              </div>
              <div className={styles.limitItem}>
                <span className={styles.limitModel}>llama-3.3-70b-versatile</span>
                <span className={styles.limitVal}>1,000 req/day · 30 RPM · 500K TPD</span>
                <span className={styles.limitTag}>Best quality</span>
              </div>
              <div className={styles.limitItem}>
                <span className={styles.limitModel}>llama-4-scout-17b</span>
                <span className={styles.limitVal}>1,000 req/day · 30 TPM · 500K TPD</span>
                <span className={styles.limitTag}>Latest model</span>
              </div>
            </div>
            <p className={styles.limitsNote}>
              ✅ No credit card needed · If rate limited, app auto-retries with fallback model · Free forever
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
