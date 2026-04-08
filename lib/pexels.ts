// lib/pexels.ts
// FIXED: searchImages now properly exported for use in generate-video
// FIXED: Multiple images per scene support
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
  count: number = 3
): Promise<PexelsPhoto[]> {
  const apiKey = process.env.PEXELS_API_KEY
  if (!apiKey) {
    throw new Error('PEXELS_API_KEY is not set in .env.local')
  }

  // Use portrait orientation for 9:16 Shorts format
  const url = `${PEXELS_BASE}/search?query=${encodeURIComponent(query)}&per_page=${count}&orientation=portrait`

  try {
    const res = await fetch(url, {
      headers: { Authorization: apiKey },
    })

    if (!res.ok) {
      if (res.status === 429) throw new Error('Pexels rate limit hit. Try again in an hour.')
      // Don't throw for other errors — return empty so fallback works
      console.warn(`[Pexels] API error ${res.status} for query: ${query}`)
      return []
    }

    const data = await res.json()
    return (data.photos || []) as PexelsPhoto[]
  } catch (err: any) {
    console.warn(`[Pexels] Request failed for "${query}":`, err.message)
    return []
  }
}

// Get ONE image URL for a scene — with fallback chain
export async function getSceneImage(keyword: string): Promise<string> {
  // Try primary keyword
  let photos = await searchImages(keyword, 3)

  // Try simplified keyword if no results
  if (photos.length === 0) {
    const simplified = keyword.split(' ').slice(0, 2).join(' ')
    photos = await searchImages(simplified, 3)
  }

  // Final fallback
  if (photos.length === 0) {
    photos = await searchImages('ancient history ruins', 3)
  }

  if (photos.length === 0) return ''

  // Pick random from results for variety
  const pick = photos[Math.floor(Math.random() * photos.length)]
  return pick.src.large || pick.src.medium || ''
}

// Get MULTIPLE image URLs for a scene
// FIX: This is the key function for avoiding boring repeating images
export async function getSceneImages(keyword: string, count: number = 3): Promise<string[]> {
  let photos = await searchImages(keyword, count + 2) // Fetch extra in case some fail

  // Fallback chain
  if (photos.length < count) {
    const simplified = keyword.split(' ').slice(0, 2).join(' ')
    const more = await searchImages(simplified, count)
    photos = [...photos, ...more]
  }

  if (photos.length < count) {
    const fallback = await searchImages('ancient rome history', count)
    photos = [...photos, ...fallback]
  }

  // Deduplicate by id
  const seen = new Set<number>()
  const unique = photos.filter(p => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })

  return unique
    .slice(0, count)
    .map(p => p.src.large || p.src.medium || '')
    .filter(Boolean)
}