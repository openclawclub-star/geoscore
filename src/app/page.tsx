'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

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

    try {
      new URL(target)
    } catch {
      setError('Please enter a valid URL.')
      return
    }

    setLoading(true)
    try {
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
    <main className="min-h-screen bg-gray-950 flex flex-col">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <span className="text-xl font-bold text-white">GEO<span className="text-emerald-400">Score</span></span>
        <span className="text-sm text-gray-400">Free AI Visibility Checker</span>
      </nav>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-20">
        <div className="max-w-2xl w-full text-center">
          <div className="inline-block bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold px-3 py-1 rounded-full mb-6 uppercase tracking-wider">
            Free GEO Analysis
          </div>

          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 leading-tight">
            Is your website visible to<br />
            <span className="text-emerald-400">AI search engines?</span>
          </h1>

          <p className="text-gray-400 text-lg mb-10">
            ChatGPT, Perplexity, and Google AI Overviews now answer questions directly.
            Check if your site gets cited — free in 60 seconds.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 mb-4">
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="yourdomain.com"
              className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-5 py-4 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 text-base"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !url.trim()}
              className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-gray-950 font-bold px-8 py-4 rounded-xl transition-colors text-base whitespace-nowrap"
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
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <p className="text-gray-600 text-xs mt-6">
            No account required. Instant results. Fix your code for $4.99.
          </p>
        </div>

        {/* How it works */}
        <div className="max-w-3xl w-full mt-24 grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
          {[
            { step: '01', title: 'Enter your URL', desc: 'Paste any website URL and hit check.' },
            { step: '02', title: 'Get your GEO score', desc: 'We scan 6 categories and score 0–100 instantly.' },
            { step: '03', title: 'Get the fixed code', desc: 'Pay $4.99 and download your fixed HTML — ready to paste.' },
          ].map(item => (
            <div key={item.step} className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <div className="text-emerald-400 font-bold text-sm mb-2">{item.step}</div>
              <div className="text-white font-semibold mb-1">{item.title}</div>
              <div className="text-gray-500 text-sm">{item.desc}</div>
            </div>
          ))}
        </div>

        {/* AI platforms */}
        <div className="max-w-2xl w-full mt-16 text-center">
          <p className="text-gray-600 text-xs uppercase tracking-widest mb-4">Optimizes visibility on</p>
          <div className="flex flex-wrap justify-center gap-4 text-gray-500 text-sm font-medium">
            {['ChatGPT', 'Perplexity', 'Google AI Overviews', 'Claude', 'Gemini', 'Bing Copilot'].map(p => (
              <span key={p} className="bg-gray-900 border border-gray-800 px-4 py-2 rounded-full">{p}</span>
            ))}
          </div>
        </div>
      </div>

      <footer className="border-t border-gray-800 py-6 text-center text-gray-600 text-xs">
        GEOScore © 2026 — Built for the AI search era
      </footer>
    </main>
  )
}
