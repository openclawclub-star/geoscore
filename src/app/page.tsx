'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const HOW_IT_WORKS = [
  { step: '01', title: 'Enter your URL', desc: 'Paste any website URL and hit check. No account needed.' },
  { step: '02', title: 'Get your free GEO score', desc: 'We scan 6 AI visibility categories and score 0–100 instantly. Every issue is explained clearly — you choose how to fix it.' },
  { step: '03-A', title: 'Option A — Fix it yourself (Free)', desc: 'Follow the free step-by-step instructions and fix every issue yourself. Most people get it done in under 1 hour.' },
  { step: '03-B', title: 'Option B — Download & upload ($4.99+)', desc: 'Skip the manual work. Download your AI-generated fixed files and upload directly to your site. Works with WordPress, Wix, Squarespace, Shopify, and custom HTML sites.' },
]

export default function Home() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    let target = url.trim()
    if (!target) return

    if (!/^https?:\/\//i.test(target)) {
      target = 'http://' + target
    }

    let parsed: URL
    try {
      parsed = new URL(target)
    } catch {
      setError('Please enter a valid URL.')
      return
    }

    // Must have a real domain with a dot (e.g. example.com, not just "abc")
    if (!parsed.hostname.includes('.') || parsed.hostname.length < 4) {
      setError('Please enter a valid domain (e.g. yoursite.com).')
      return
    }

    setLoading(true)
    try {
      // Quick reachability check before full analysis
      const reachable = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target, checkOnly: true }),
      })
      const reachableData = await reachable.json()
      if (reachableData.unreachable) {
        setError('This website could not be reached. Please check the URL and try again.')
        setLoading(false)
        return
      }

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: target }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Analysis failed')
      const encoded = encodeURIComponent(JSON.stringify(data))
      router.push(`/results?data=${encoded}`)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      {/* Nav */}
      <nav className="border-b border-gray-200 bg-white px-6 py-4 flex items-center justify-between">
        <span className="text-xl font-bold text-gray-900">GEO<span className="text-emerald-500">Fix</span></span>
        <div className="flex items-center gap-4">
          <span className="hidden sm:block text-base font-bold text-gray-500">Audit. Fix. Upload. Done.</span>
          <a href="/contact" className="text-base font-bold text-gray-500 hover:text-emerald-600 transition-colors">Contact</a>
        </div>
      </nav>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="max-w-2xl w-full text-center">
          <div className="inline-block bg-emerald-50 border border-emerald-200 text-emerald-600 text-lg font-bold px-5 py-2 rounded-full mb-6 uppercase tracking-wider">
            Free GEOFix — Two Ways to Fix
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4 leading-tight">
            Other GEO tools give you a report.<br />
            <span className="text-emerald-500">We give you the fixed files.</span>
          </h1>

          <p className="text-gray-500 text-lg mb-2">
            Over 60% of searches are now handled by AI engines like ChatGPT, Perplexity, and Google AI Overviews — and most websites are invisible to them.
          </p>
          <p className="text-gray-500 text-lg mb-6">
            Our GEO (Generative Engine Optimization) audit finds exactly what&apos;s blocking AI from recommending your site — then gives you two ways to fix it.
          </p>

          <div className="flex flex-wrap justify-center gap-6 text-base font-bold mb-3">
            <div className="flex items-center gap-2 text-gray-700">
              <span className="text-emerald-500 font-bold text-lg">✓</span>
              Free instant GEO score
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <span className="text-emerald-500 font-bold text-lg">✓</span>
              No sign up required
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-6 text-base font-bold mb-8">
            <div className="flex items-center gap-2 text-gray-700">
              <span className="text-emerald-500 font-bold text-lg">✓</span>
              Fix it yourself free — step-by-step instructions included
            </div>
            <div className="flex items-center gap-2 text-gray-700">
              <span className="text-emerald-500 font-bold text-lg">✓</span>
              Or download AI-fixed files from $4.99 and upload directly
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 mb-4">
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="yourdomain.com"
              className="flex-1 bg-white border border-gray-300 rounded-xl px-5 py-4 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 text-base shadow-sm"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-8 py-4 rounded-xl transition-colors text-base whitespace-nowrap shadow-sm"
            >
              {loading ? 'Analyzing…' : 'Check My Score →'}
            </button>
          </form>

          {loading && (
            <div className="text-sm text-gray-400 animate-pulse">
              Fetching page, checking robots.txt, scanning structured data…
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {error}
            </div>
          )}

        </div>

        {/* How it works */}
        <div className="max-w-4xl w-full mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-center">
          {(HOW_IT_WORKS).map(item => (
            <div key={item.step} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <div className="text-emerald-500 font-bold text-sm mb-2">{item.step}</div>
              <div className="text-gray-900 font-semibold mb-1">{item.title}</div>
              <div className="text-gray-500 text-sm">{item.desc}</div>
            </div>
          ))}
        </div>

        <p className="text-gray-700 text-lg font-semibold mt-8 text-center">
          No more reading through pages of reports. Just get it fixed — right away.
        </p>

        {/* AI platforms */}
        <div className="max-w-2xl w-full mt-16 text-center">
          <p className="text-gray-400 text-xs uppercase tracking-widest mb-4">Optimizes visibility on</p>
          <div className="flex flex-wrap justify-center gap-4 text-gray-500 text-sm font-medium">
            {['ChatGPT', 'Perplexity', 'Google AI Overviews', 'Claude', 'Gemini', 'Bing Copilot'].map(p => (
              <span key={p} className="bg-white border border-gray-200 px-4 py-2 rounded-full shadow-sm">{p}</span>
            ))}
          </div>
        </div>
      </div>

      <footer className="border-t border-gray-200 bg-white py-6 text-center text-gray-400 text-xs">
        GEO Fix © 2026 — Built for the AI search era
      </footer>
    </main>
  )
}
