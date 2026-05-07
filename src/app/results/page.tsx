'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense, useState } from 'react'

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
  platforms?: {
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
  hasSameAs?: boolean
  hasSpeakable?: boolean
  blockedCrawlers?: string[]
  wordCount?: number
  title: string
  description: string
  discoveredPages: string[]
}

const TIERS = {
  single:  { label: 'Single Page',  maxPages: 1,  price: '$4.99'  },
  starter: { label: 'Starter',      maxPages: 5,  price: '$7.99'  },
  pro:     { label: 'Pro',          maxPages: 10, price: '$9.99'  },
  full:    { label: 'Full Site',    maxPages: 20, price: '$14.99' },
  agency:  { label: 'Agency',       maxPages: 50, price: '$19.99' },
} as const

function getTierKey(count: number): keyof typeof TIERS {
  if (count <= 1)  return 'single'
  if (count <= 5)  return 'starter'
  if (count <= 10) return 'pro'
  if (count <= 20) return 'full'
  return 'agency'
}

function scoreColor(score: number) {
  if (score >= 70) return 'text-emerald-600'
  if (score >= 45) return 'text-yellow-600'
  return 'text-red-500'
}

function scoreRingColor(score: number) {
  if (score >= 70) return '#10b981'
  if (score >= 45) return '#ca8a04'
  return '#ef4444'
}

const fixInstructions: Record<string, { steps: string[]; code?: string }> = {
  'Site blocked from indexing': {
    steps: ['Find the <meta name="robots"> tag in your HTML <head>.', 'Change the content value to "index, follow".'],
    code: '<meta name="robots" content="index, follow">',
  },
  'No llms.txt file': {
    steps: ['Create a plain text file named llms.txt in your website root folder (same place as robots.txt).', 'Add a short description of your business and services.'],
    code: '# Your Business Name\n\n> One-line description of what you do.\n\n## Services\nList your services here.\n\n## Contact\nWebsite: https://yourdomain.com',
  },
  'No robots.txt': {
    steps: ['Create a plain text file named robots.txt in your website root folder.', 'Add the content below and upload it.'],
    code: 'User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nSitemap: https://yourdomain.com/sitemap.xml',
  },
  'No HTTPS': {
    steps: ['Contact your web host and enable SSL/TLS (most hosts offer free Let\'s Encrypt certs).', 'In cPanel: look for "SSL/TLS" or "Let\'s Encrypt" in your hosting panel.', 'Once enabled, add a redirect from HTTP to HTTPS.'],
  },
  'No sitemap.xml': {
    steps: ['If using WordPress: install the Yoast SEO plugin — it generates a sitemap automatically.', 'If using other CMS: check settings for a sitemap option.', 'Manually: create sitemap.xml listing your page URLs and upload to your root folder.'],
    code: '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://yourdomain.com/</loc></url>\n</urlset>',
  },
  'No structured data (JSON-LD)': {
    steps: ['Add a <script type="application/ld+json"> block inside your <head> tag.', 'Paste the JSON-LD code below and update the values for your business.'],
    code: '<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "Organization",\n  "name": "Your Business Name",\n  "url": "https://yourdomain.com",\n  "description": "What your business does."\n}\n</script>',
  },
  'Generic page title': {
    steps: ['Find the <title> tag in your HTML <head>.', 'Replace the placeholder text with your real business name and a short description.'],
    code: '<title>Your Business Name | What You Do</title>',
  },
  'Missing meta description': {
    steps: ['Add a <meta name="description"> tag inside your HTML <head>.', 'Write 1-2 sentences describing your business (150-160 characters ideal).'],
    code: '<meta name="description" content="Your business description here. Keep it under 160 characters.">',
  },
  'Missing Open Graph tags': {
    steps: ['Add these tags inside your HTML <head> section.', 'Update the values with your real title, description, and domain.'],
    code: '<meta property="og:type" content="website">\n<meta property="og:title" content="Your Business Name">\n<meta property="og:description" content="Your business description.">\n<meta property="og:url" content="https://yourdomain.com/">',
  },
  'No canonical tag': {
    steps: ['Add a canonical link tag inside your HTML <head> to tell search engines the preferred URL.'],
    code: '<link rel="canonical" href="https://yourdomain.com/">',
  },
  'JavaScript-only rendering detected': {
    steps: [
      'AI crawlers do not run JavaScript — they only read the raw HTML your server sends.',
      'If you use React, Vue, or a similar framework, enable Server-Side Rendering (SSR) so content exists in the initial HTML.',
      'For WordPress: no action needed — WordPress renders server-side by default.',
      'For Next.js: use getServerSideProps or the App Router (default SSR).',
      'For Vue/Nuxt: enable SSR mode in nuxt.config.ts.',
      'Quick check: right-click your page → View Page Source. If you see mostly <script> tags with little text, your content is client-rendered.',
    ],
  },
}

function severityColor(s: string) {
  if (s === 'critical') return 'bg-red-50 border-red-200 text-red-700'
  if (s === 'high') return 'bg-orange-50 border-orange-200 text-orange-700'
  return 'bg-yellow-50 border-yellow-200 text-yellow-700'
}

function severityLabel(s: string) {
  if (s === 'critical') return 'Critical'
  if (s === 'high') return 'High'
  return 'Medium'
}

function ScoreRing({ score }: { score: number }) {
  const r = 54
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ
  const color = scoreRingColor(score)
  return (
    <div className="relative w-36 h-36 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="144" height="144" viewBox="0 0 144 144">
        <circle cx="72" cy="72" r={r} fill="none" stroke="#e5e7eb" strokeWidth="12" />
        <circle
          cx="72" cy="72" r={r} fill="none"
          stroke={color} strokeWidth="12"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease' }}
        />
      </svg>
      <div className="text-center">
        <div className={`text-3xl font-bold ${scoreColor(score)}`}>{score}</div>
        <div className="text-xs text-gray-400">/ 100</div>
      </div>
    </div>
  )
}

function IssueCard({ issue }: { issue: GeoIssue }) {
  const [open, setOpen] = useState(false)
  const fix = fixInstructions[issue.title]

  return (
    <div className={`border rounded-xl overflow-hidden ${severityColor(issue.severity)}`}>
      <div className="p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wide opacity-60">{severityLabel(issue.severity)}</span>
            <span className="font-semibold text-sm">{issue.title}</span>
          </div>
          {fix && (
            <button
              onClick={() => setOpen(o => !o)}
              className="text-xs opacity-60 hover:opacity-100 underline whitespace-nowrap transition-opacity font-medium"
            >
              {open ? 'Hide fix ▲' : 'How to fix ▼'}
            </button>
          )}
        </div>
        <p className="text-xs opacity-75 mt-1">{issue.detail}</p>
      </div>

      {open && fix && (
        <div className="border-t border-current/10 bg-white/60 p-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-2">Steps to fix manually:</p>
            <ol className="space-y-1">
              {fix.steps.map((step, i) => (
                <li key={i} className="text-xs text-gray-600 flex gap-2">
                  <span className="text-gray-400 shrink-0">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
          {fix.code && (
            <div>
              <p className="text-xs font-semibold text-gray-700 mb-1">Code to add:</p>
              <pre className="text-xs bg-gray-100 text-emerald-700 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all border border-gray-200">{fix.code}</pre>
            </div>
          )}
          <p className="text-xs text-gray-400">
            Don&apos;t want to do this manually?{' '}
            <span className="text-emerald-600 font-semibold">Get all fixes applied automatically ↓</span>
          </p>
        </div>
      )}
    </div>
  )
}

function ResultsContent() {
  const params = useSearchParams()
  const router = useRouter()
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set())

  let data: GeoResult | null = null
  try {
    const raw = params.get('data')
    if (raw) data = JSON.parse(decodeURIComponent(raw))
  } catch {
    data = null
  }

  const allPages = data ? [...new Set([data.url, ...(data.discoveredPages ?? [])])] : []
  const effectiveSelected = selectedPages.size === 0 && data
    ? new Set([data.url])
    : selectedPages

  function togglePage(pageUrl: string) {
    setSelectedPages(prev => {
      const next = new Set(prev.size === 0 ? [data!.url] : prev)
      if (next.has(pageUrl)) {
        if (next.size > 1) next.delete(pageUrl)
      } else {
        next.add(pageUrl)
      }
      return next
    })
  }

  function selectTier(tierKey: keyof typeof TIERS) {
    const tier = TIERS[tierKey]
    const toSelect = allPages.slice(0, tier.maxPages)
    setSelectedPages(new Set(toSelect))
  }

  const selectedCount = effectiveSelected.size
  const tierKey = getTierKey(selectedCount)
  const tier = TIERS[tierKey]

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">
        No results found. <button onClick={() => router.push('/')} className="ml-2 text-emerald-600 underline">Start over</button>
      </div>
    )
  }

  const cats = [
    { label: 'AI Citability', value: data.categories.aiCitability, max: 25 },
    { label: 'Brand Authority', value: data.categories.brandAuthority, max: 20 },
    { label: 'Content Quality', value: data.categories.contentQuality, max: 20 },
    { label: 'Technical', value: data.categories.technical, max: 15 },
    { label: 'Structured Data', value: data.categories.structuredData, max: 10 },
    { label: 'Platform Optimization', value: data.categories.platformOptimization, max: 10 },
  ]

  async function handleCheckout() {
    setCheckoutLoading(true)
    const pages = Array.from(effectiveSelected)
    if (data?.url) {
      sessionStorage.setItem('geo_target_url', data.url)
      sessionStorage.setItem('geo_selected_pages', JSON.stringify(pages))
      sessionStorage.setItem('geo_analysis', JSON.stringify(data))
    }
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: data!.url, selectedPages: pages, analysisData: data }),
      })
      const json = await res.json()
      if (json.url) {
        window.location.href = json.url
      } else {
        alert('Could not start checkout. Please try again.')
      }
    } catch {
      alert('Checkout failed. Please try again.')
    } finally {
      setCheckoutLoading(false)
    }
  }

  const criticalCount = data.issues.filter(i => i.severity === 'critical').length
  const hostname = (() => { try { return new URL(data.url).hostname } catch { return data.url } })()

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="border-b border-gray-200 bg-white px-6 py-4 flex items-center justify-between">
        <button onClick={() => router.push('/')} className="text-xl font-bold text-gray-900 hover:opacity-80">
          GEO<span className="text-emerald-500">Fix</span>
        </button>
        <button onClick={() => router.push('/')} className="text-sm text-gray-500 hover:text-gray-900">
          ← Check another site
        </button>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="text-gray-400 text-sm mb-1">{hostname}</div>
          <h1 className="text-2xl font-bold text-gray-900">GEO Visibility Report</h1>
          {data.businessType && (
            <span className="inline-block mt-2 text-xs bg-gray-100 text-gray-500 px-3 py-1 rounded-full border border-gray-200">
              Detected: {data.businessType}
            </span>
          )}
        </div>

        {/* Score + summary */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 flex flex-col sm:flex-row items-center gap-6 shadow-sm">
          <ScoreRing score={data.score} />
          <div className="flex-1 text-center sm:text-left">
            <div className={`text-lg font-bold mb-1 ${scoreColor(data.score)}`}>
              Grade: {data.grade} — {data.score < 35 ? 'Critical' : data.score < 60 ? 'Needs Work' : 'Good'}
            </div>
            <p className="text-gray-600 text-sm">
              {criticalCount > 0
                ? `${criticalCount} critical issue${criticalCount > 1 ? 's' : ''} found blocking AI search visibility.`
                : 'Some improvements available to boost AI search visibility.'}
            </p>
            {data.discoveredPages?.length > 0 && (
              <p className="text-gray-400 text-xs mt-1">
                {data.discoveredPages.length} additional page{data.discoveredPages.length > 1 ? 's' : ''} found on this domain.
              </p>
            )}
          </div>
        </div>

        {/* Category Scores */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 shadow-sm">
          <h2 className="text-gray-900 font-semibold mb-4">Score Breakdown</h2>
          <div className="space-y-3">
            {cats.map(cat => {
              const pct = Math.round((cat.value / cat.max) * 100)
              return (
                <div key={cat.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700">{cat.label}</span>
                    <span className="text-gray-400">{cat.value} / {cat.max}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: pct >= 70 ? '#10b981' : pct >= 40 ? '#ca8a04' : '#ef4444',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Quick Checks */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 shadow-sm">
          <h2 className="text-gray-900 font-semibold mb-4">Quick Checks</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'HTTPS', pass: data.hasHttps },
              { label: 'Indexable', pass: !data.hasNoindex },
              { label: 'robots.txt', pass: data.hasRobots },
              { label: 'sitemap.xml', pass: data.hasSitemap },
              { label: 'JSON-LD Schema', pass: data.hasSchema },
              { label: 'llms.txt', pass: data.hasLlmsTxt },
            ].map(item => (
              <div key={item.label} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium ${item.pass ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-600'}`}>
                <span>{item.pass ? '✓' : '✗'}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Platform Readiness */}
        {data.platforms && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 shadow-sm">
            <h2 className="text-gray-900 font-semibold mb-4">Platform Readiness</h2>
            <div className="space-y-3">
              {[
                { label: 'Google AI Overviews', value: data.platforms.googleAIO, icon: '🔍' },
                { label: 'ChatGPT Search', value: data.platforms.chatgpt, icon: '🤖' },
                { label: 'Perplexity AI', value: data.platforms.perplexity, icon: '⚡' },
                { label: 'Google Gemini', value: data.platforms.gemini, icon: '✨' },
                { label: 'Bing Copilot', value: data.platforms.bingCopilot, icon: '🔷' },
              ].map(p => (
                <div key={p.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700">{p.icon} {p.label}</span>
                    <span className={`font-semibold ${p.value >= 70 ? 'text-emerald-600' : p.value >= 45 ? 'text-yellow-600' : 'text-red-500'}`}>{p.value}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${p.value}%`,
                        backgroundColor: p.value >= 70 ? '#10b981' : p.value >= 45 ? '#ca8a04' : '#ef4444',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {data.blockedCrawlers && data.blockedCrawlers.length > 0 && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                <span className="font-semibold">⚠ Blocked AI crawlers: </span>
                {data.blockedCrawlers.join(', ')}
                <span className="text-red-500"> — these platforms cannot index your site.</span>
              </div>
            )}
          </div>
        )}

        {/* Issues */}
        {data.issues.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 shadow-sm">
            <h2 className="text-gray-900 text-xl font-bold mb-1">Issues Found ({data.issues.length})</h2>
            <p className="text-gray-500 text-sm font-medium mb-1">Each issue includes free manual fix instructions. Or get all fixes applied automatically below.</p>
            <p className="text-amber-700 text-sm font-bold bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 mb-4">Note: This score is for this URL only. To audit other pages from the same domain, enter them individually on the home page.</p>
            <div className="space-y-3">
              {data.issues.map((issue, i) => (
                <IssueCard key={i} issue={issue} />
              ))}
            </div>
          </div>
        )}

        {/* Positives */}
        {data.positives.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 shadow-sm">
            <h2 className="text-gray-900 font-semibold mb-4">What&apos;s Working</h2>
            <ul className="space-y-2">
              {data.positives.map((p, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-emerald-700">
                  <span>✓</span><span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Page Selector + Pricing */}
        <div className="bg-white border border-emerald-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-gray-900 text-xl font-bold mb-1">Skip the manual work — get the fixed code <span className="text-emerald-500 text-sm font-semibold">(one-time fee)</span></h2>
          <p className="text-gray-500 text-sm font-medium mb-5">
            Select the pages you want fixed. Our AI will analyze each page and automatically apply all fixes — delivering a zip file
            with AI-corrected HTML, JSON-LD schema, meta tags, Open Graph, canonical tag, robots.txt, llms.txt, and sitemap.xml.
            Just upload the files to your website — no technical skills required.
          </p>

          {/* Quick tier buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-5">
            {(Object.entries(TIERS) as [keyof typeof TIERS, typeof TIERS[keyof typeof TIERS]][]).map(([key, t]) => {
              const isActive = tierKey === key && selectedCount > 0
              const unavailable = allPages.length < t.maxPages && allPages.length > 0 && key !== 'single' && allPages.length < t.maxPages
              return (
                <button
                  key={key}
                  onClick={() => selectTier(key)}
                  className={`rounded-xl border p-3 text-center transition-all ${isActive
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-gray-200 hover:border-emerald-300 bg-gray-50'
                  } ${unavailable ? 'opacity-40' : ''}`}
                >
                  <div className={`font-bold text-sm ${isActive ? 'text-emerald-600' : 'text-gray-900'}`}>{t.price}</div>
                  <div className="text-gray-500 text-xs mt-0.5">{t.label}</div>
                  <div className="text-gray-400 text-xs">
                    {key === 'single' ? '1 page' : `up to ${t.maxPages} pages`}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Page checkboxes */}
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1 mb-5 border border-gray-100 rounded-xl p-3 bg-gray-50">
            {allPages.map((pageUrl) => {
              const checked = effectiveSelected.has(pageUrl)
              const path = (() => { try { return new URL(pageUrl).pathname || '/' } catch { return pageUrl } })()
              return (
                <label key={pageUrl} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePage(pageUrl)}
                    className="w-4 h-4 accent-emerald-500 shrink-0"
                  />
                  <span className={`text-sm font-mono truncate ${checked ? 'text-gray-900' : 'text-gray-400'}`}>
                    {path === '/' ? '/ (homepage)' : path}
                  </span>
                </label>
              )
            })}
          </div>

          {/* Checkout CTA */}
          <div className="pt-5 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <span className="text-gray-900 font-bold text-lg">{tier.price}</span>
              <span className="text-gray-500 text-sm ml-2">
                — {selectedCount} page{selectedCount > 1 ? 's' : ''} selected ({tier.label})
              </span>
            </div>
            <button
              onClick={handleCheckout}
              disabled={checkoutLoading || selectedCount === 0}
              className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold px-8 py-3 rounded-xl transition-colors text-sm whitespace-nowrap shadow-sm"
            >
              {checkoutLoading ? 'Redirecting…' : `Get Fixed Code — ${tier.price}`}
            </button>
          </div>
          <p className="text-gray-400 text-xs mt-2 text-center sm:text-right">
            Instant zip download after payment — paste and you&apos;re done
          </p>
        </div>
      </div>
    </main>
  )
}

export default function ResultsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">
        Loading results…
      </div>
    }>
      <ResultsContent />
    </Suspense>
  )
}
