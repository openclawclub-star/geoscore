'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

function SuccessContent() {
  const params = useSearchParams()
  const router = useRouter()
  const sessionId = params.get('session_id')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [files, setFiles] = useState<{ fixedHtml: string; robotsTxt: string; llmsTxt: string; domain: string } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const stored = sessionStorage.getItem('geo_target_url')
    if (stored) setUrl(stored)
  }, [])

  async function generateFix() {
    if (!url || !sessionId) {
      setError('Missing URL or session. Please contact support.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/generate-fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, sessionId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setFiles(data)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Generation failed. Please email us.')
    } finally {
      setLoading(false)
    }
  }

  function download(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
  }

  return (
    <main className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 py-16">
      <nav className="fixed top-0 left-0 right-0 border-b border-gray-800 px-6 py-4">
        <button onClick={() => router.push('/')} className="text-xl font-bold text-white hover:opacity-80">
          GEO<span className="text-emerald-400">Score</span>
        </button>
      </nav>

      <div className="max-w-xl w-full text-center mt-16">
        <div className="text-5xl mb-4">🎉</div>
        <h1 className="text-3xl font-bold text-white mb-2">Payment Successful!</h1>
        <p className="text-gray-400 mb-8">
          Your fixed files are ready. Click below to generate and download them.
        </p>

        {!files && (
          <>
            {url ? (
              <div className="mb-6 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm text-gray-400">
                Generating fixes for: <span className="text-white">{url}</span>
              </div>
            ) : (
              <div className="mb-6">
                <p className="text-gray-400 text-sm mb-3">Enter the URL you checked:</p>
                <input
                  type="text"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://yoursite.com"
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 mb-3"
                />
              </div>
            )}

            <button
              onClick={generateFix}
              disabled={loading || !url}
              className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-gray-950 font-bold px-8 py-4 rounded-xl transition-colors w-full"
            >
              {loading ? 'Generating your fixed files…' : 'Generate My Fixed Files'}
            </button>

            {error && (
              <div className="mt-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                {error}
              </div>
            )}
          </>
        )}

        {files && (
          <div className="space-y-4 text-left">
            <h2 className="text-white font-semibold text-lg text-center mb-2">Your files are ready</h2>

            {[
              {
                label: 'index.html',
                desc: 'Your fixed homepage — paste this into your CMS/backend admin',
                content: files.fixedHtml,
                filename: 'index-fixed.html',
                icon: '📄',
              },
              {
                label: 'robots.txt',
                desc: 'Upload to your web root — allows all AI crawlers',
                content: files.robotsTxt,
                filename: 'robots.txt',
                icon: '🤖',
              },
              {
                label: 'llms.txt',
                desc: 'Upload to your web root — tells AI platforms about your business',
                content: files.llmsTxt,
                filename: 'llms.txt',
                icon: '🧠',
              },
            ].map(file => (
              <div key={file.label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{file.icon}</span>
                    <div>
                      <div className="text-white font-mono font-semibold text-sm">{file.label}</div>
                      <div className="text-gray-500 text-xs mt-0.5">{file.desc}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => download(file.content, file.filename)}
                    className="bg-emerald-500 hover:bg-emerald-400 text-gray-950 font-bold px-4 py-2 rounded-lg text-sm whitespace-nowrap transition-colors"
                  >
                    Download
                  </button>
                </div>
              </div>
            ))}

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-sm text-blue-300">
              <strong>How to use:</strong> Download all 3 files. Paste the HTML into your CMS backend.
              Upload robots.txt and llms.txt to your website&apos;s root folder (same location as your homepage).
            </div>

            <button
              onClick={() => router.push('/')}
              className="w-full text-center text-gray-500 hover:text-gray-300 text-sm py-2 transition-colors"
            >
              Check another site →
            </button>
          </div>
        )}
      </div>
    </main>
  )
}

export default function SuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">
        Loading…
      </div>
    }>
      <SuccessContent />
    </Suspense>
  )
}
