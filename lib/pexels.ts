// lib/pexels.ts
// Free Pexels API for video visuals
// Limits: 200 req/hour, 20,000 req/month - completely free

const PEXELS_BASE = 'https://api.pexels.com/v1'

export interface PexelsPhoto {
  id: number
  url: string
  photographer: string
  src: {
    original: string
    large2x: string
    large: string
    medium: string
    small: string
  }
  alt: string
}

export async function searchImages(
  query: string,
  count: number = 1
): Promise<PexelsPhoto[]> {
  const apiKey = process.env.PEXELS_API_KEY
  if (!apiKey) {
    throw new Error('PEXELS_API_KEY is not set in .env.local')
  }

  const url = `${PEXELS_BASE}/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`

  const res = await fetch(url, {
    headers: { Authorization: apiKey },
  })

  if (!res.ok) {
    if (res.status === 429) throw new Error('Pexels rate limit hit. Try again in an hour.')
    throw new Error(`Pexels API error: ${res.status}`)
  }

  const data = await res.json()
  return data.photos as PexelsPhoto[]
}

// Get one image URL for a scene keyword
export async function getSceneImage(keyword: string): Promise<string> {
  try {
    const photos = await searchImages(keyword, 3)
    if (photos.length === 0) {
      // Fallback to generic keyword
      const fallback = await searchImages('nature landscape', 1)
      return fallback[0]?.src.large || ''
    }
    // Pick a random one from the top 3
    const pick = photos[Math.floor(Math.random() * photos.length)]
    return pick.src.large
  } catch (err) {
    console.warn(`[Pexels] Failed for "${keyword}":`, err)
    return '' // Empty = use solid color fallback in FFmpeg
  }
}
