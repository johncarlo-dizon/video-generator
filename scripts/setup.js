// scripts/setup.js
// Run: node scripts/setup.js
// Creates .env.local from template — works on Windows, Mac, Linux

const fs = require('fs')
const path = require('path')

const src = path.join(__dirname, '..', '.env.local.example')
const dest = path.join(__dirname, '..', '.env.local')

if (fs.existsSync(dest)) {
  console.log('✅ .env.local already exists — skipping.')
  console.log('   Edit it to add your API keys:\n')
} else {
  fs.copyFileSync(src, dest)
  console.log('✅ Created .env.local from template.\n')
  console.log('   ⚠️  Now open .env.local and add your API keys:\n')
}

console.log('   Required:')
console.log('   GROQ_API_KEY    → https://console.groq.com  (free, no card)')
console.log('   PEXELS_API_KEY  → https://pexels.com/api    (free, instant)')
console.log('')
console.log('   Optional (leave blank to use free gTTS voice):')
console.log('   ELEVENLABS_API_KEY → https://elevenlabs.io  (10k chars/month free)')
console.log('')
console.log('   Then run: npm run dev')
console.log('   Open:    http://localhost:3000')
