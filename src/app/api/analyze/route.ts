import { NextRequest } from 'next/server'

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
  issues: GeoIssue[]
  positives: string[]
  businessType: string
  hasHttps: boolean
  hasRobots: boolean
  hasLlmsTxt: boolean
  hasSitemap: boolean
  hasSchema: boolean
  hasNoindex: boolean
  title: string
  description: string
}

async function fetchUrl(url: string): Promise<{ html: string; status: number; ok: boolean }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'GeoScoreBot/1.0' },
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

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()
    if (!url) return Response.json({ error: 'URL is required' }, { status: 400 })

    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return Response.json({ error: 'Invalid URL' }, { status: 400 })
    }

    const origin = parsedUrl.origin
    const isHttps = parsedUrl.protocol === 'https:'

    // Fetch all resources in parallel
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
    const hasRobots = robotsTxt.ok && robotsTxt.status === 200 && robotsTxt.html.includes('User-agent')
    const hasLlmsTxt = llmsTxt.ok && llmsTxt.status === 200
    const hasSitemap = sitemapXml.ok && sitemapXml.status === 200
    const businessType = detectBusinessType(html)

    // Check for placeholder title
    const isTitlePlaceholder = !pageTitle ||
      /bootstrap|template|html5|untitled|coming soon/i.test(pageTitle)

    // Check for og tags
    const hasOgTitle = /<meta[^>]+property=["']og:title["']/i.test(html)
    const hasOgDesc = /<meta[^>]+property=["']og:description["']/i.test(html)
    const hasCanonical = /<link[^>]+rel=["']canonical["']/i.test(html)

    // Score each category (out of max)
    let aiCitability = 25
    let technical = 15
    let structuredData = 10
    let platformOpt = 10
    let brandAuthority = 10
    let contentQuality = 12

    const issues: GeoIssue[] = []
    const positives: string[] = []

    // AI Citability
    if (hasNoindex) {
      aiCitability -= 20
      issues.push({ severity: 'critical', title: 'Site blocked from indexing', detail: 'meta robots is set to noindex — AI crawlers cannot index this page.' })
    }
    if (!hasLlmsTxt) {
      aiCitability -= 3
      issues.push({ severity: 'high', title: 'No llms.txt file', detail: 'llms.txt is the emerging standard for telling AI systems about your site.' })
    } else {
      positives.push('llms.txt file found — AI platforms can read your site description')
    }
    if (!hasRobots) {
      aiCitability -= 2
      issues.push({ severity: 'high', title: 'No robots.txt', detail: 'AI crawlers have no guidance on what they can access.' })
    } else {
      positives.push('robots.txt present')
    }

    // Technical
    if (!isHttps) {
      technical -= 10
      issues.push({ severity: 'critical', title: 'No HTTPS', detail: 'Site runs on HTTP only. Browsers show security warnings and crawlers deprioritize HTTP sites.' })
    } else {
      positives.push('HTTPS enabled')
    }
    if (!hasSitemap) {
      technical -= 3
      issues.push({ severity: 'medium', title: 'No sitemap.xml', detail: 'Without a sitemap, crawlers may miss pages.' })
    } else {
      positives.push('sitemap.xml found')
    }

    // Structured Data
    if (!schemaPresent) {
      structuredData -= 10
      issues.push({ severity: 'critical', title: 'No structured data (JSON-LD)', detail: 'AI engines cannot parse your business entity, services, or contact info without schema markup.' })
    } else {
      positives.push('Structured data (JSON-LD) detected')
      structuredData = 10
    }

    // Platform Optimization
    if (isTitlePlaceholder) {
      platformOpt -= 6
      issues.push({ severity: 'critical', title: 'Generic page title', detail: `Title "${pageTitle}" appears to be a template placeholder — not branded.` })
    }
    if (!metaDesc) {
      platformOpt -= 2
      issues.push({ severity: 'high', title: 'Missing meta description', detail: 'No meta description found. AI platforms use this for summaries.' })
    }
    if (!hasOgTitle || !hasOgDesc) {
      platformOpt -= 2
      issues.push({ severity: 'medium', title: 'Missing Open Graph tags', detail: 'og:title and og:description are needed for AI platform cards and social sharing.' })
    }
    if (!hasCanonical) {
      issues.push({ severity: 'medium', title: 'No canonical tag', detail: 'A canonical tag prevents duplicate content issues.' })
    }

    // Brand Authority (basic signals)
    if (html.includes('linkedin.com') || html.includes('twitter.com') || html.includes('facebook.com')) {
      brandAuthority += 5
      positives.push('Social media links present')
    }

    // Content Quality
    const wordCount = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').length
    if (wordCount > 500) {
      contentQuality += 5
      positives.push('Substantial page content detected')
    }
    if (/years? experience|certified|gsma|nsys|iso/i.test(html)) {
      contentQuality += 3
      positives.push('Credibility signals found (certifications/experience)')
    }

    const score = Math.max(0, Math.min(100,
      aiCitability + brandAuthority + contentQuality + technical + structuredData + platformOpt
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
      issues,
      positives,
      businessType,
      hasHttps: isHttps,
      hasRobots,
      hasLlmsTxt,
      hasSitemap,
      hasSchema: schemaPresent,
      hasNoindex,
      title: pageTitle,
      description: metaDesc,
    }

    return Response.json(result)
  } catch (err) {
    console.error(err)
    return Response.json({ error: 'Analysis failed. Please try again.' }, { status: 500 })
  }
}
