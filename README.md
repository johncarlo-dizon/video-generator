# 🎬 AI Video Generator — Next.js

Generate YouTube-ready videos from a text prompt using 100% free tools.
**Groq** writes the script, **gTTS/ElevenLabs** narrates it, **Pexels** provides visuals, **FFmpeg** assembles everything.

---

## 🚀 Quick Start

### 1. Prerequisites
```bash
# Node.js 18+ required
node --version

# Install Python gTTS (unlimited free TTS)
pip install gtts

# Install FFmpeg (video assembly engine)
# Linux/Ubuntu:
sudo apt install ffmpeg

# macOS:
brew install ffmpeg

# Windows: Download from https://ffmpeg.org/download.html
# Then add ffmpeg to your PATH
```

### 2. Get Free API Keys

| Service | Where | Cost | Limit |
|---------|-------|------|-------|
| **Groq** | [console.groq.com](https://console.groq.com) | FREE | 14,400 req/day |
| **Pexels** | [pexels.com/api](https://www.pexels.com/api/) | FREE | 20,000 req/month |
| **ElevenLabs** | [elevenlabs.io](https://elevenlabs.io) | FREE tier | 10,000 chars/month |

### 3. Setup
```bash
# Clone / download this project
cd ai-video-gen

# Install dependencies
npm install

# Copy environment template
cp .env.local.example .env.local

# Edit .env.local with your keys
nano .env.local  # or use VS Code

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## ⚡ Groq — Pros, Cons & How to Maximize It

### ✅ PROS
- **Insanely fast**: Script generation in 0.3–1 second (10-100x faster than OpenAI)
- **Truly free**: No credit card, no expiry, no hidden charges
- **Auto-fallback**: This app automatically switches to llama-3.1-8b-instant if 70B is rate limited
- **Cached tokens free**: Repeated system prompts don't count against limits
- **OpenAI compatible**: Same API structure — easy to swap if needed

### ❌ CONS
- **30 RPM hard limit**: Only 1 request every 2 seconds on free tier
- **1,000 req/day on 70B**: Fine for personal use, tight for a public app
- **No streaming on free tier**: Must wait for full response
- **Model deprecations**: They retire models every few months (see docs/deprecations)
- **Org-level limits**: If you share an API key across projects, all share the quota

### 🎯 HOW TO USE WITHOUT HITTING LIMITS

**Strategy 1: Use the right model for the job**
```
GROQ_MODEL=llama-3.3-70b-versatile  # Best quality (1,000 req/day)
GROQ_MODEL=llama-3.1-8b-instant     # Best volume (14,400 req/day)
```

**Strategy 2: Our app's built-in protection**
- Local rate limiter tracks requests per minute (stays under 25 RPM)
- Auto-retries on 429 errors with exponential backoff
- Falls back to 8B model if 70B is rate limited
- Reads retry-after headers to wait the exact right amount

**Strategy 3: Batch at off-peak hours**
Groq limits reset daily. Schedule bulk generation overnight.

**Strategy 4: Minimize tokens per request**
- Our script prompt is optimized to use ~800 tokens
- Each video script costs roughly 1,200–1,500 tokens total
- At 500K TPD on 8B: ~330 videos per day free

**Strategy 5: Multiple API keys (legal)**
Create multiple Groq accounts (different email addresses).
Update `GROQ_API_KEY` and round-robin between them for high volume.

---

## 📁 Project Structure

```
ai-video-gen/
├── app/
│   ├── api/
│   │   ├── generate-script/route.ts   ← Groq script generation
│   │   ├── generate-voice/route.ts    ← TTS audio generation
│   │   └── generate-video/route.ts    ← Full pipeline orchestrator
│   ├── layout.tsx
│   ├── page.tsx                       ← Main UI
│   ├── page.module.css
│   └── globals.css
├── lib/
│   ├── groq.ts        ← Groq client + retry logic + rate limiter
│   ├── pexels.ts      ← Free image API
│   ├── tts.ts         ← gTTS + ElevenLabs voice generation
│   └── ffmpeg.ts      ← Video assembly (scenes → .mp4)
├── .env.local.example ← Copy to .env.local
├── next.config.js
└── package.json
```

---

## 🔧 Configuration Options

```env
# Switch TTS mode (in .env.local)
TTS_MODE=gtts           # Unlimited free, lower quality
TTS_MODE=elevenlabs     # 10k chars/month free, professional quality

# Switch Groq model
GROQ_MODEL=llama-3.3-70b-versatile  # Smart, 1k req/day
GROQ_MODEL=llama-3.1-8b-instant     # Fast, 14.4k req/day

# Video length
MAX_VIDEO_DURATION=120  # Up to 2 minutes
```

---

## 🚢 Deploy to Production (Free)

### Option A: Vercel + Railway
1. Push to GitHub
2. Deploy Next.js app to [Vercel](https://vercel.com) (free)
3. Deploy a separate FFmpeg worker on [Railway](https://railway.app) (free tier)
4. Call Railway from your Vercel API routes for FFmpeg processing

### Option B: Single VPS
Get a free Oracle Cloud Always Free VM (2 CPU, 1GB RAM):
```bash
# Install everything on the VM
sudo apt update && sudo apt install -y nodejs npm python3 pip ffmpeg
pip install gtts
git clone your-repo
cd ai-video-gen && npm install && npm run build
npm start
```

**Note**: Vercel serverless functions time out at 10 seconds on free tier.
FFmpeg assembly takes 30-120 seconds. Use Railway or a VPS for production.

---

## 🎯 YouTube Strategy (Built In)

The app generates:
- ✅ Hook-optimized title
- ✅ Retention-focused script structure  
- ✅ 5 SEO hashtags per video
- ✅ Clear call-to-action
- ✅ Scene captions for accessibility

**Post-production tips:**
1. Download the .mp4
2. Upload to YouTube Shorts (under 60s) or regular (60-120s)
3. Use the generated tags in your YouTube description
4. Post consistently — use this tool to produce 1 video/day free

---

## 📊 Cost Breakdown

| Component | Cost | Daily Limit |
|-----------|------|------------|
| Groq (script) | $0 | ~300 videos |
| Pexels (images) | $0 | ~200 req/hr |
| gTTS (voice) | $0 | Unlimited |
| FFmpeg (assembly) | $0 | Unlimited |
| Vercel (hosting) | $0 | 100GB bandwidth |
| **TOTAL** | **$0** | **~200 videos/day** |

---

## 🛠 Troubleshooting

**"gTTS not installed"**
```bash
pip install gtts
# or
pip3 install gtts
```

**"FFmpeg not found"**
```bash
# Check if installed:
ffmpeg -version
# If not found, install per your OS (see Prerequisites above)
```

**"429 Too Many Requests from Groq"**
- Wait 60 seconds, the app will auto-retry
- Switch `GROQ_MODEL` to `llama-3.1-8b-instant` for higher limits
- Create a second Groq API key and alternate

**"Video generation times out on Vercel"**
- Vercel free tier = 10s timeout. FFmpeg needs 30-120s.
- Solution: Deploy to Railway.app or a VPS (Oracle Free Tier)

---

Built with ❤️ — 100% free, no subscriptions, no watermarks.
