import { NextRequest } from 'next/server'
import * as cheerio from 'cheerio'

interface GeoIssue {
  severity: 'critical' | 'high' | 'medium'
  title: string
  detail: string
}

interface GeoResult {
  url: string
  score: number
  grade: string
  categories: {
    aiCitability: number
    brandAuthority: number
    contentQuality: number
    technical: number
    structuredData: number
    platformOptimization: number
  }
  // Per-platform scores (0-100 each)
  platforms: {
    googleAIO: number
    chatgpt: number
    perplexity: number
    gemini: number
    bingCopilot: number
  }
  issues: GeoIssue[]
  positives: string[]
  businessType: string
  hasHttps: boolean
  hasRobots: boolean
  hasLlmsTxt: boolean
  hasSitemap: boolean
  hasSchema: boolean
  hasNoindex: boolean
  hasSameAs: boolean
  hasSpeakable: boolean
  blockedCrawlers: string[]
  title: string
  description: string
  wordCount: number
  discoveredPages: string[]
}

// Tier 1 critical AI crawlers (from geo-seo-claude research)
const AI_CRAWLERS_TIER1 = ['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot', 'ChatGPT-User']
const AI_CRAWLERS_TIER2 = ['Google-Extended', 'GoogleOther', 'Applebot-Extended', 'Amazonbot', 'FacebookBot']
const AI_CRAWLERS_TIER3 = ['CCBot', 'anthropic-ai']

async function fetchUrl(url: string): Promise<{ html: string; status: number; ok: boolean }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'GeoAuditBot/1.0' },
      signal: AbortSignal.timeout(15000),
    })
    const html = await res.text()
    return { html, status: res.status, ok: res.ok }
  } catch {
    return { html: '', status: 0, ok: false }
  }
}

function extractMeta(html: string, name: string): string {
  const patterns = [
    new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, 'i'),
  ]
  for (const p of patterns) {
    const m = html.match(p)
    if (m) return m[1]
  }
  return ''
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return m ? m[1].trim() : ''
}

function hasJsonLd(html: string): boolean {
  return /<script[^>]+type=["']application\/ld\+json["'][^>]*>/i.test(html)
}

function hasSameAsProperty(html: string): boolean {
  return /"sameAs"\s*:/i.test(html)
}

function hasSpeakableProperty(html: string): boolean {
  return /"speakable"\s*:/i.test(html)
}

// Check which AI crawlers are blocked in robots.txt
function detectBlockedCrawlers(robotsTxt: string): string[] {
  if (!robotsTxt) return []
  const blocked: string[] = []
  const allCrawlers = [...AI_CRAWLERS_TIER1, ...AI_CRAWLERS_TIER2, ...AI_CRAWLERS_TIER3]

  // Look for Disallow: / patterns for each crawler
  for (const crawler of allCrawlers) {
    const pattern = new RegExp(`User-agent:\\s*${crawler}[\\s\\S]*?Disallow:\\s*/`, 'i')
    if (pattern.test(robotsTxt)) {
      blocked.push(crawler)
    }
  }
  return blocked
}

// Detect client-side only rendering — AI crawlers can't see JS-rendered content
function detectClientSideRendering(html: string, wordCount: number): boolean {
  // Empty framework root containers = content only appears after JS runs
  if (/<div\s+id=["'](root|app)["']\s*><\/div>/i.test(html)) return true
  if (/<div\s+id=["'](__next|__nuxt)["']\s*>\s*<\/div>/i.test(html)) return true
  // <noscript> warning about JS being required
  if (/<noscript>[^<]{0,200}(javascript|js\s+enabled|enable javascript)/i.test(html)) return true
  // Many script tags but almost no visible text
  const scriptCount = (html.match(/<script/gi) || []).length
  if (scriptCount > 8 && wordCount < 150) return true
  return false
}

function detectBusinessType(html: string): string {
  const lower = html.toLowerCase()
  if (/pricing|free trial|sign up|\/app|dashboard|saas/i.test(lower)) return 'SaaS'
  if (/add to cart|shop now|buy now|product|checkout/i.test(lower)) return 'E-commerce'
  if (/our blog|article|byline|published|author/i.test(lower)) return 'Publisher'
  if (/portfolio|case stud|our services|client logos/i.test(lower)) return 'Agency'
  if (/near me|directions|opening hours|\+[0-9]|address/i.test(lower)) return 'Local Business'
  return 'Business'
}

function scoreGrade(score: number): string {
  if (score >= 80) return 'A'
  if (score >= 65) return 'B'
  if (score >= 50) return 'C'
  if (score >= 35) return 'D'
  return 'F'
}

// Citability scoring — based on geo-seo-claude research
// Definition patterns increase citation rate by 2.1x
function scoreCitability(html: string, wordCount: number): number {
  let score = 0
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

  // Answer block quality (30 pts)
  if (/is (a|an|the)\s+\w+\s+that/i.test(text)) score += 10 // definition patterns
  if (text.split(' ').slice(0, 60).join(' ').length > 200) score += 8 // early answers
  if (/<h[1-6][^>]*>\s*\w.*\?/i.test(html)) score += 7 // question headings
  if (/according to|research shows|studies show/i.test(text)) score += 5 // citations

  // Self-containment (25 pts) — optimal 134-167 words per block
  if (wordCount >= 134 && wordCount <= 500) score += 15
  else if (wordCount > 500) score += 10
  // Low pronoun density
  const pronouns = (text.match(/\b(it|they|them|their|this|that)\b/gi) || []).length
  const pronounRatio = pronouns / Math.max(wordCount, 1)
  if (pronounRatio < 0.03) score += 10
  else if (pronounRatio < 0.06) score += 5

  // Statistical density (15 pts)
  const percentages = (text.match(/\d+(\.\d+)?%/g) || []).length
  const dollarAmounts = (text.match(/\$[\d,]+/g) || []).length
  const years = (text.match(/\b(20\d{2})\b/g) || []).length
  score += Math.min(percentages * 2, 6)
  score += Math.min(dollarAmounts * 2, 5)
  score += Math.min(years, 4)

  // Uniqueness signals (10 pts)
  if (/case stud|we found|our research|survey of/i.test(text)) score += 5
  if (/tool|platform|software|service/i.test(text)) score += 3
  if (/example|for instance|such as/i.test(text)) score += 2

  return Math.min(score, 100)
}

function discoverPages(html: string, origin: string): string[] {
  const $ = cheerio.load(html)
  const seen = new Set<string>()
  const pages: string[] = []

  const skip = /\.(css|js|png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|pdf|zip)$/i
  const skipPaths = /^\/(admin|wp-admin|wp-login|wp-json|feed|tag|category|author|cdn|static|assets|_next)/i

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || ''
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return

    let full: string
    try {
      full = new URL(href, origin).href
    } catch { return }

    if (!full.startsWith(origin)) return
    const normalized = full.split('#')[0].replace(/\/$/, '') || origin
    if (skip.test(normalized)) return
    const path = new URL(normalized).pathname
    if (skipPaths.test(path)) return
    if (seen.has(normalized)) return

    seen.add(normalized)
    pages.push(normalized)
  })

  pages.sort((a, b) => {
    const pa = new URL(a).pathname
    const pb = new URL(b).pathname
    return pa.split('/').length - pb.split('/').length || pa.localeCompare(pb)
  })

  return pages.slice(0, 50)
}

export async function POST(request: NextRequest) {
  try {
    const { url, checkOnly } = await request.json()
    if (!url) return Response.json({ error: 'URL is required' }, { status: 400 })

    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return Response.json({ error: 'Invalid URL' }, { status: 400 })
    }

    if (checkOnly) {
      try {
        const res = await fetch(url, {
          method: 'HEAD',
          headers: { 'User-Agent': 'GeoAuditBot/1.0' },
          signal: AbortSignal.timeout(8000),
        })
        if (res.ok || res.status < 500) {
          return Response.json({ reachable: true })
        }
        return Response.json({ unreachable: true })
      } catch {
        return Response.json({ unreachable: true })
      }
    }

    const origin = parsedUrl.origin
    const isHttps = parsedUrl.protocol === 'https:'

    const [homePage, robotsTxt, llmsTxt, sitemapXml] = await Promise.all([
      fetchUrl(url),
      fetchUrl(`${origin}/robots.txt`),
      fetchUrl(`${origin}/llms.txt`),
      fetchUrl(`${origin}/sitemap.xml`),
    ])

    const html = homePage.html
    const pageTitle = extractTitle(html)
    const metaDesc = extractMeta(html, 'description')
    const robotsMeta = extractMeta(html, 'robots')
    const hasNoindex = /noindex/i.test(robotsMeta)
    const schemaPresent = hasJsonLd(html)
    const hasSameAs = hasSameAsProperty(html)
    const hasSpeakable = hasSpeakableProperty(html)
    const hasRobots = robotsTxt.ok && robotsTxt.status === 200 && robotsTxt.html.includes('User-agent')
    const hasLlmsTxt = llmsTxt.ok && llmsTxt.status === 200
    const hasSitemap = sitemapXml.ok && sitemapXml.status === 200
    const businessType = detectBusinessType(html)
    const blockedCrawlers = detectBlockedCrawlers(robotsTxt.html)
    const discoveredPages = discoverPages(html, origin).filter(p => p !== url && p !== url.replace(/\/$/, ''))

    const isTitlePlaceholder = !pageTitle ||
      /bootstrap|template|html5|untitled|coming soon/i.test(pageTitle)

    const hasOgTitle = /<meta[^>]+property=["']og:title["']/i.test(html)
    const hasOgDesc = /<meta[^>]+property=["']og:description["']/i.test(html)
    const hasCanonical = /<link[^>]+rel=["']canonical["']/i.test(html)
    const hasSocialLinks = /linkedin\.com|twitter\.com|facebook\.com|instagram\.com|youtube\.com/i.test(html)
    const hasRedditMentions = /reddit\.com/i.test(html)
    const hasYoutube = /youtube\.com/i.test(html)

    const rawText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    const wordCount = rawText.split(' ').length
    const hasLongContent = wordCount > 800
    const hasCredibilitySignals = /years? experience|certified|iso |award|founded|since \d{4}/i.test(html)
    const hasAuthorInfo = /author|written by|byline/i.test(html)
    const hasStats = /\d+(\.\d+)?%|\$[\d,]+|\d+[\s,]+\w+ (users|customers|clients)/i.test(html)

    const citabilityRaw = scoreCitability(html, wordCount)
    const isClientRendered = detectClientSideRendering(html, wordCount)

    const issues: GeoIssue[] = []
    const positives: string[] = []

    // ── AI CITABILITY (25 pts) ───────────────────────────────────────────────
    let aiCitability = 25

    if (hasNoindex) {
      aiCitability -= 20
      issues.push({ severity: 'critical', title: 'Site blocked from indexing', detail: 'meta robots noindex — AI crawlers cannot index this page.' })
    }
    if (blockedCrawlers.length > 0) {
      const tier1Blocked = blockedCrawlers.filter(c => AI_CRAWLERS_TIER1.includes(c))
      if (tier1Blocked.length > 0) {
        aiCitability -= Math.min(tier1Blocked.length * 4, 12)
        issues.push({ severity: 'critical', title: `Critical AI crawlers blocked: ${tier1Blocked.join(', ')}`, detail: 'Your robots.txt is blocking major AI search engines from reading your site.' })
      }
    }
    if (!hasLlmsTxt) {
      aiCitability -= 3
      issues.push({ severity: 'high', title: 'No llms.txt file', detail: 'llms.txt tells AI platforms what your site does — an emerging standard that boosts AI citations.' })
    } else {
      positives.push('llms.txt found — AI platforms can read your site description')
    }
    if (!hasRobots) {
      aiCitability -= 2
      issues.push({ severity: 'high', title: 'No robots.txt', detail: 'AI crawlers have no guidance on what they can access.' })
    } else {
      positives.push('robots.txt present — crawlers have access guidance')
    }

    // ── BRAND AUTHORITY (20 pts) ─────────────────────────────────────────────
    let brandAuthority = 8 // base
    if (hasSocialLinks) {
      brandAuthority += 5
      positives.push('Social media links present')
    } else {
      issues.push({ severity: 'medium', title: 'No social media links', detail: 'AI engines use social presence as a trust signal. Add links to LinkedIn, YouTube, or Facebook.' })
    }
    if (hasYoutube) {
      brandAuthority += 4
      positives.push('YouTube presence detected — strong AI visibility signal')
    }
    if (hasRedditMentions) {
      brandAuthority += 3
      positives.push('Reddit mentions detected — Perplexity heavily weights Reddit')
    }

    // ── CONTENT QUALITY / E-E-A-T (20 pts) ──────────────────────────────────
    let contentQuality = 8 // base
    if (hasLongContent) {
      contentQuality += 5
      positives.push(`Strong content depth (${wordCount.toLocaleString()} words detected)`)
    } else {
      issues.push({ severity: 'medium', title: 'Thin page content', detail: `Page has ~${wordCount} words. AI engines prefer 800+ words for citation. Add more detail about your business.` })
    }
    if (hasCredibilitySignals) {
      contentQuality += 4
      positives.push('Credibility signals found (experience, certifications, founding date)')
    }
    if (hasAuthorInfo) {
      contentQuality += 2
      positives.push('Author information present — good E-E-A-T signal')
    }
    if (hasStats) {
      contentQuality += 1
      positives.push('Statistics and data present — increases AI citability by 2x')
    }
    if (citabilityRaw > 60) {
      positives.push('Content is well-structured for AI citation')
    }

    // ── TECHNICAL (15 pts) ───────────────────────────────────────────────────
    let technical = 15
    if (!isHttps) {
      technical -= 10
      issues.push({ severity: 'critical', title: 'No HTTPS', detail: 'Site runs on HTTP only. AI crawlers deprioritize insecure sites.' })
    } else {
      positives.push('HTTPS enabled — secure and trusted by AI crawlers')
    }
    if (isClientRendered) {
      technical -= 5
      issues.push({ severity: 'critical', title: 'JavaScript-only rendering detected', detail: 'Content is rendered by JavaScript. AI crawlers (GPTBot, ClaudeBot, PerplexityBot) do not execute JS — your page appears empty to them. Move content to server-rendered HTML.' })
    }
    if (!hasSitemap) {
      technical -= 3
      issues.push({ severity: 'medium', title: 'No sitemap.xml', detail: 'Without a sitemap, AI crawlers may miss pages on your site.' })
    } else {
      positives.push('sitemap.xml found — helps crawlers discover all pages')
    }
    if (!hasCanonical) {
      technical -= 2
      issues.push({ severity: 'medium', title: 'No canonical tag', detail: 'Canonical tags prevent duplicate content issues with AI crawlers.' })
    }

    // ── STRUCTURED DATA (10 pts) ─────────────────────────────────────────────
    let structuredData = 0
    if (schemaPresent) {
      structuredData += 5
      positives.push('JSON-LD structured data detected')
    } else {
      issues.push({ severity: 'critical', title: 'No structured data (JSON-LD)', detail: 'AI engines cannot identify your business type, services, or contact info without schema markup.' })
    }
    if (hasSameAs) {
      structuredData += 3
      positives.push('sameAs property found — the most important GEO schema signal')
    } else if (schemaPresent) {
      issues.push({ severity: 'high', title: 'Missing sameAs in schema', detail: 'sameAs links (LinkedIn, YouTube, Wikipedia) are the single most important GEO schema property for cross-platform entity recognition.' })
    }
    if (hasSpeakable) {
      structuredData += 2
      positives.push('speakable property found — direct GEO signal for AI assistants')
    }

    // ── PLATFORM OPTIMIZATION (10 pts) ──────────────────────────────────────
    let platformOpt = 10
    if (isTitlePlaceholder) {
      platformOpt -= 4
      issues.push({ severity: 'critical', title: 'Generic page title', detail: `Title "${pageTitle}" looks like a placeholder. Replace with your real business name and service.` })
    }
    if (!metaDesc) {
      platformOpt -= 3
      issues.push({ severity: 'high', title: 'Missing meta description', detail: 'AI platforms use your meta description for summaries and citations.' })
    } else {
      positives.push('Meta description present')
    }
    if (!hasOgTitle || !hasOgDesc) {
      platformOpt -= 3
      issues.push({ severity: 'medium', title: 'Missing Open Graph tags', detail: 'og:title and og:description are used by AI platforms for link previews and content cards.' })
    } else {
      positives.push('Open Graph tags present')
    }

    // ── WEIGHTED FINAL SCORE (research-backed weights from geo-seo-claude) ───
    // AI Citability 25% + Brand Authority 20% + Content 20% + Technical 15% + Schema 10% + Platform 10%
    const score = Math.round(Math.max(0, Math.min(100,
      (Math.max(0, aiCitability) / 25 * 100) * 0.25 +
      (Math.max(0, brandAuthority) / 20 * 100) * 0.20 +
      (Math.max(0, contentQuality) / 20 * 100) * 0.20 +
      (Math.max(0, technical) / 15 * 100) * 0.15 +
      (Math.max(0, structuredData) / 10 * 100) * 0.10 +
      (Math.max(0, platformOpt) / 10 * 100) * 0.10
    )))

    // ── PER-PLATFORM SCORES ──────────────────────────────────────────────────
    // Based on platform-specific requirements from geo-seo-claude research

    // Google AI Overviews — needs top-10 ranking signals, structured content, stats
    const googleAIO = Math.round(Math.min(100,
      (isHttps ? 15 : 0) +
      (schemaPresent ? 15 : 0) +
      (metaDesc ? 10 : 0) +
      (hasStats ? 15 : 0) +
      (hasLongContent ? 15 : 0) +
      (hasSitemap ? 10 : 0) +
      (hasCanonical ? 10 : 0) +
      (!hasNoindex ? 10 : 0)
    ))

    // ChatGPT — needs entity recognition, sameAs, Wikipedia-like signals
    const chatgpt = Math.round(Math.min(100,
      (hasSameAs ? 25 : 0) +
      (schemaPresent ? 15 : 0) +
      (isHttps ? 10 : 0) +
      (hasLongContent ? 10 : 0) +
      (hasSocialLinks ? 10 : 0) +
      (hasStats ? 10 : 0) +
      (hasRobots && blockedCrawlers.filter(c => c === 'GPTBot' || c === 'OAI-SearchBot').length === 0 ? 10 : 0) +
      (metaDesc ? 10 : 0)
    ))

    // Perplexity — heavily weights community signals, fresh content, quotable sections
    const perplexity = Math.round(Math.min(100,
      (hasRedditMentions ? 20 : 0) +
      (hasLlmsTxt ? 15 : 0) +
      (hasStats ? 15 : 0) +
      (hasLongContent ? 15 : 0) +
      (isHttps ? 10 : 0) +
      (hasSitemap ? 10 : 0) +
      (schemaPresent ? 10 : 0) +
      (blockedCrawlers.filter(c => c === 'PerplexityBot').length === 0 ? 5 : 0)
    ))

    // Gemini — Google ecosystem, YouTube, Knowledge Panel signals
    const gemini = Math.round(Math.min(100,
      (hasSameAs ? 20 : 0) +
      (hasYoutube ? 20 : 0) +
      (schemaPresent ? 15 : 0) +
      (isHttps ? 10 : 0) +
      (hasSocialLinks ? 10 : 0) +
      (metaDesc ? 10 : 0) +
      (hasSitemap ? 10 : 0) +
      (hasLongContent ? 5 : 0)
    ))

    // Bing Copilot — IndexNow, Bing index, LinkedIn, fast load signals
    const bingCopilot = Math.round(Math.min(100,
      (isHttps ? 20 : 0) +
      (hasSitemap ? 20 : 0) +
      (metaDesc ? 15 : 0) +
      (hasSocialLinks ? 10 : 0) +
      (schemaPresent ? 15 : 0) +
      (hasCanonical ? 10 : 0) +
      (hasRobots ? 10 : 0)
    ))

    const result: GeoResult = {
      url,
      score,
      grade: scoreGrade(score),
      categories: {
        aiCitability: Math.max(0, aiCitability),
        brandAuthority: Math.max(0, brandAuthority),
        contentQuality: Math.max(0, contentQuality),
        technical: Math.max(0, technical),
        structuredData: Math.max(0, structuredData),
        platformOptimization: Math.max(0, platformOpt),
      },
      platforms: { googleAIO, chatgpt, perplexity, gemini, bingCopilot },
      issues,
      positives,
      businessType,
      hasHttps: isHttps,
      hasRobots,
      hasLlmsTxt,
      hasSitemap,
      hasSchema: schemaPresent,
      hasNoindex,
      hasSameAs,
      hasSpeakable,
      blockedCrawlers,
      title: pageTitle,
      description: metaDesc,
      wordCount,
      discoveredPages,
    }

    return Response.json(result)
  } catch (err) {
    console.error(err)
    return Response.json({ error: 'Analysis failed. Please try again.' }, { status: 500 })
  }
}
