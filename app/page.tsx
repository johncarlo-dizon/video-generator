'use client'
// app/page.tsx — AI Video Generator UI

import { useState, useRef } from 'react'
import styles from './page.module.css'

type Step = 'idle' | 'scripting' | 'generating' | 'done' | 'error'

interface ScriptLine {
  id: number
  text: string
  highlight: string
  imageKeyword: string
  isHook: boolean
}

interface Script {
  title: string
  lines: ScriptLine[]
  tags: string[]
}

const VIDEO_STYLES = [
  { value: 'Dark dramatic mystery', label: '🔮 Mystery' },
  { value: 'Energetic motivational', label: '⚡ Motivation' },
  { value: 'Curious educational facts', label: '🧠 Facts' },
  { value: 'Dark shocking history documentary', label: '📜 History' },
  { value: 'Suspenseful true crime', label: '🔍 True Crime' },
  { value: 'Inspiring success story', label: '🚀 Success' },
]

export default function Home() {
  const [topic, setTopic] = useState('')
  const [style, setStyle] = useState(VIDEO_STYLES[0].value)
  const [duration, setDuration] = useState(35)
  const [step, setStep] = useState<Step>('idle')
  const [script, setScript] = useState<Script | null>(null)
  const [videoSrc, setVideoSrc] = useState<string | null>(null)
  const [videoTitle, setVideoTitle] = useState('')
  const [videoTags, setVideoTags] = useState<string[]>([])
  const [error, setError] = useState('')
  const [showScript, setShowScript] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)

  const isGenerating = step === 'scripting' || step === 'generating'

  async function generate() {
    if (!topic.trim() || isGenerating) return
    setError('')
    setVideoSrc(null)
    setScript(null)
    setStep('scripting')
    setStatusMsg('Writing script...')

    try {
      // Step 1: Script
      const scriptRes = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, style, duration }),
      })
      const scriptData = await scriptRes.json()
      if (!scriptRes.ok) throw new Error(scriptData.error)
      setScript(scriptData.script)

      // Step 2: Full video pipeline
      setStep('generating')
      setStatusMsg('Generating voice, fetching visuals, assembling...')

      const videoRes = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: scriptData.script }),
      })
      const videoData = await videoRes.json()
      if (!videoRes.ok) throw new Error(videoData.error)

      setVideoSrc(`data:video/mp4;base64,${videoData.video}`)
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
    a.download = `${videoTitle || 'short'}.mp4`
    a.click()
  }

  function reset() {
    setStep('idle')
    setError('')
    setVideoSrc(null)
    setScript(null)
    setTopic('')
    setStatusMsg('')
  }

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoMark}>▶</span>
          <span className={styles.logoText}>ShortForge</span>
          <span className={styles.logoBeta}>AI</span>
        </div>
        <div className={styles.badge}>
          <span className={styles.dot} />
          Free · Groq + ElevenLabs
        </div>
      </header>

      <div className={styles.container}>

        {/* ── Hero ── */}
        <div className={styles.hero}>
          <h1 className={styles.heroTitle}>
            YouTube Shorts<br />
            <span className={styles.accent}>in 60 seconds</span>
          </h1>
          <p className={styles.heroSub}>
            Type a topic. Get a viral-ready Short with synced subtitles, voiceover, and cinematic visuals.
          </p>
        </div>

        {/* ── Input ── */}
        {(step === 'idle' || step === 'error') && (
          <div className={styles.card}>
            <div className={styles.inputGroup}>
              <label className={styles.label}>Topic</label>
              <textarea
                className={styles.textarea}
                placeholder="e.g. The dark secret of Roman gladiators, Why 5am changes your life, The photo taken seconds before disaster..."
                value={topic}
                onChange={e => setTopic(e.target.value)}
                rows={3}
                maxLength={300}
              />
              <span className={styles.charCount}>{topic.length}/300</span>
            </div>

            <div className={styles.row}>
              <div className={styles.inputGroup}>
                <label className={styles.label}>Style</label>
                <div className={styles.styleGrid}>
                  {VIDEO_STYLES.map(s => (
                    <button
                      key={s.value}
                      className={`${styles.styleBtn} ${style === s.value ? styles.styleBtnActive : ''}`}
                      onClick={() => setStyle(s.value)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.label}>Duration: <strong>{duration}s</strong></label>
                <input
                  type="range"
                  className={styles.range}
                  min={20}
                  max={40}
                  step={5}
                  value={duration}
                  onChange={e => setDuration(Number(e.target.value))}
                />
                <div className={styles.rangeLabels}>
                  <span>20s</span><span>30s</span><span>40s</span>
                </div>
              </div>
            </div>

            {step === 'error' && (
              <div className={styles.errorBox}>⚠ {error}</div>
            )}

            <button
              className={styles.btnPrimary}
              onClick={generate}
              disabled={topic.trim().length < 3}
            >
              Generate Short →
            </button>
          </div>
        )}

        {/* ── Progress ── */}
        {isGenerating && (
          <div className={styles.card}>
            <div className={styles.progressHeader}>
              <span className={styles.spinner} />
              <span className={styles.progressTitle}>{statusMsg}</span>
            </div>

            {script && (
              <div className={styles.scriptPreview}>
                <div className={styles.previewTitle}>{script.title}</div>
                <div className={styles.previewLines}>
                  {script.lines.slice(0, 5).map((line, i) => (
                    <div key={i} className={styles.previewLine}>
                      <span className={styles.previewNum}>{i + 1}</span>
                      <span>{line.text}</span>
                    </div>
                  ))}
                  {script.lines.length > 5 && (
                    <div className={styles.previewMore}>+{script.lines.length - 5} more lines</div>
                  )}
                </div>
              </div>
            )}

            <p className={styles.progressNote}>
              Typically 30–90 seconds · FFmpeg assembles locally · No cloud upload
            </p>
          </div>
        )}

        {/* ── Result ── */}
        {step === 'done' && videoSrc && (
          <div className={styles.resultCard}>
            <div className={styles.videoWrap}>
              <video
                ref={videoRef}
                src={videoSrc}
                controls
                autoPlay
                loop
                className={styles.video}
                playsInline
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

              <div className={styles.actions}>
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
                  New Short
                </button>
              </div>
            </div>

            {showScript && script && (
              <div className={styles.scriptFull}>
                <h3 className={styles.scriptHeader}>Script Lines</h3>
                {script.lines.map((line, i) => (
                  <div key={line.id} className={`${styles.lineRow} ${i === 0 ? styles.hookRow : ''}`}>
                    <span className={styles.lineNum}>{i + 1}</span>
                    <div className={styles.lineContent}>
                      <span className={styles.lineText}>{line.text}</span>
                      <span className={styles.lineMeta}>
                        highlight: <em>{line.highlight}</em> · visual: {line.imageKeyword}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Feature grid ── */}
        {step === 'idle' && (
          <div className={styles.features}>
            {[
              { icon: '🎙', title: 'Natural voiceover', desc: 'Full narration as one smooth take. No robotic pauses.' },
              { icon: '📝', title: 'Synced subtitles', desc: 'Poppins Bold captions timed to each word. Yellow keyword highlights.' },
              { icon: '🖼', title: 'Cinematic visuals', desc: 'Slow zoom & pan on every image. Changes every 1-2 seconds.' },
              { icon: '⚡', title: 'Fast as hell', desc: 'Groq writes the script in under 1 second. Video in ~60 seconds.' },
            ].map(f => (
              <div key={f.title} className={styles.featureCard}>
                <span className={styles.featureIcon}>{f.icon}</span>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        )}

      </div>
    </main>
  )
}