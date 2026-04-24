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

function scoreColor(score: number) {
  if (score >= 70) return 'text-emerald-400'
  if (score >= 45) return 'text-yellow-400'
  return 'text-red-400'
}

function scoreRingColor(score: number) {
  if (score >= 70) return '#34d399'
  if (score >= 45) return '#facc15'
  return '#f87171'
}

function severityColor(s: string) {
  if (s === 'critical') return 'bg-red-500/10 border-red-500/30 text-red-400'
  if (s === 'high') return 'bg-orange-500/10 border-orange-500/30 text-orange-400'
  return 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
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
        <circle cx="72" cy="72" r={r} fill="none" stroke="#1f2937" strokeWidth="12" />
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
        <div className="text-xs text-gray-500">/ 100</div>
      </div>
    </div>
  )
}

function ResultsContent() {
  const params = useSearchParams()
  const router = useRouter()
  const [checkoutLoading, setCheckoutLoading] = useState(false)

  let data: GeoResult | null = null
  try {
    const raw = params.get('data')
    if (raw) data = JSON.parse(decodeURIComponent(raw))
  } catch {
    data = null
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">
        No results found. <button onClick={() => router.push('/')} className="ml-2 text-emerald-400 underline">Start over</button>
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
    // Store URL so success page can use it
    if (data?.url) sessionStorage.setItem('geo_target_url', data.url)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: data!.url, analysisData: data }),
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
    <main className="min-h-screen bg-gray-950">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <button onClick={() => router.push('/')} className="text-xl font-bold text-white hover:opacity-80">
          GEO<span className="text-emerald-400">Score</span>
        </button>
        <button onClick={() => router.push('/')} className="text-sm text-gray-400 hover:text-white">
          ← Check another site
        </button>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="text-gray-500 text-sm mb-1">{hostname}</div>
          <h1 className="text-2xl font-bold text-white">GEO Visibility Report</h1>
          {data.businessType && (
            <span className="inline-block mt-2 text-xs bg-gray-800 text-gray-400 px-3 py-1 rounded-full">
              Detected: {data.businessType}
            </span>
          )}
        </div>

        {/* Score + CTA */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6 flex flex-col sm:flex-row items-center gap-6">
          <ScoreRing score={data.score} />
          <div className="flex-1 text-center sm:text-left">
            <div className={`text-lg font-bold mb-1 ${scoreColor(data.score)}`}>
              Grade: {data.grade} — {data.score < 35 ? 'Critical' : data.score < 60 ? 'Needs Work' : 'Good'}
            </div>
            <p className="text-gray-400 text-sm mb-4">
              {criticalCount > 0
                ? `${criticalCount} critical issue${criticalCount > 1 ? 's' : ''} found that are blocking AI search visibility.`
                : 'Some improvements available to boost AI search visibility.'}
            </p>
            <button
              onClick={handleCheckout}
              disabled={checkoutLoading}
              className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-gray-950 font-bold px-6 py-3 rounded-xl transition-colors text-sm"
            >
              {checkoutLoading ? 'Redirecting…' : '🔧 Fix My Code — $4.99'}
            </button>
            <p className="text-gray-600 text-xs mt-2">
              Get fixed HTML + robots.txt + llms.txt — instant download after payment
            </p>
          </div>
        </div>

        {/* Category Scores */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <h2 className="text-white font-semibold mb-4">Score Breakdown</h2>
          <div className="space-y-3">
            {cats.map(cat => {
              const pct = Math.round((cat.value / cat.max) * 100)
              return (
                <div key={cat.label}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-300">{cat.label}</span>
                    <span className="text-gray-400">{cat.value} / {cat.max}</span>
                  </div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: pct >= 70 ? '#34d399' : pct >= 40 ? '#facc15' : '#f87171',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Quick Checks */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
          <h2 className="text-white font-semibold mb-4">Quick Checks</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'HTTPS', pass: data.hasHttps },
              { label: 'Indexable', pass: !data.hasNoindex },
              { label: 'robots.txt', pass: data.hasRobots },
              { label: 'sitemap.xml', pass: data.hasSitemap },
              { label: 'JSON-LD Schema', pass: data.hasSchema },
              { label: 'llms.txt', pass: data.hasLlmsTxt },
            ].map(item => (
              <div key={item.label} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${item.pass ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400' : 'border-red-500/20 bg-red-500/5 text-red-400'}`}>
                <span>{item.pass ? '✓' : '✗'}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Issues */}
        {data.issues.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
            <h2 className="text-white font-semibold mb-4">Issues Found ({data.issues.length})</h2>
            <div className="space-y-3">
              {data.issues.map((issue, i) => (
                <div key={i} className={`border rounded-xl p-4 ${severityColor(issue.severity)}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wide opacity-70">{severityLabel(issue.severity)}</span>
                    <span className="font-semibold text-sm">{issue.title}</span>
                  </div>
                  <p className="text-xs opacity-80">{issue.detail}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Positives */}
        {data.positives.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6">
            <h2 className="text-white font-semibold mb-4">What&apos;s Working</h2>
            <ul className="space-y-2">
              {data.positives.map((p, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-emerald-400">
                  <span>✓</span><span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Bottom CTA */}
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6 text-center">
          <h3 className="text-white font-bold text-lg mb-2">Fix everything for $4.99</h3>
          <p className="text-gray-400 text-sm mb-4">
            We&apos;ll rewrite your HTML with all fixes applied — JSON-LD schema, meta tags, Open Graph, canonical tag, and more.
            Plus a ready-to-upload robots.txt and llms.txt. Just paste and you&apos;re done.
          </p>
          <button
            onClick={handleCheckout}
            disabled={checkoutLoading}
            className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-gray-950 font-bold px-8 py-3 rounded-xl transition-colors"
          >
            {checkoutLoading ? 'Redirecting to checkout…' : 'Get Fixed Code — $4.99'}
          </button>
        </div>
      </div>
    </main>
  )
}

export default function ResultsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">
        Loading results…
      </div>
    }>
      <ResultsContent />
    </Suspense>
  )
}
