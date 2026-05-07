'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

interface GeoResult {
  hasHttps: boolean
  hasRobots: boolean
  hasLlmsTxt: boolean
  hasSitemap: boolean
  hasSchema: boolean
  hasNoindex: boolean
  issues: { severity: string; title: string }[]
}

interface PlatformGuide {
  name: string
  steps: { task: string; detail: string }[]
}

interface ManualItem {
  label: string
  intro: string
  bullets: { platform: string; steps: string }[]
}

const PLATFORM_GUIDES: PlatformGuide[] = [
  {
    name: 'WordPress',
    steps: [
      { task: 'Upload robots.txt', detail: 'Go to your hosting cPanel → File Manager → public_html → upload robots.txt there.' },
      { task: 'Upload llms.txt', detail: 'Upload via cPanel File Manager or FTP to public_html/llms.txt.' },
      { task: 'Upload sitemap.xml', detail: 'If you use Yoast SEO or Rank Math — skip this, it auto-generates one. Otherwise upload sitemap.xml to public_html via cPanel. After uploading, submit the URL in Google Search Console → Sitemaps.' },
      { task: 'Apply <head> tags', detail: '1. Install the free "Header Footer Code Manager" plugin\n2. Go to the plugin → Add New Script\n3. Open your fixed HTML file, copy everything between <head> and </head>\n4. Paste it into the script box\n5. Set location to "Inside <head>"\n6. Under "Display On", choose the specific page\n7. Save' },
    ],
  },
  {
    name: 'Wix',
    steps: [
      { task: 'Upload robots.txt', detail: 'Free plans: not supported. Paid plans: Settings → SEO → robots.txt editor.' },
      { task: 'Upload llms.txt', detail: "Wix doesn't support arbitrary root files. Workaround: create a new page at /llms and paste the llms.txt content as plain text." },
      { task: 'Upload sitemap.xml', detail: 'Wix auto-generates a sitemap — skip this step.' },
      { task: 'Apply <head> tags', detail: '1. Open Wix Editor and select the page\n2. Click Settings → Advanced\n3. Open your fixed HTML file, copy everything between <head> and </head>\n4. Paste into the "Additional tags" box\n5. Save and publish' },
    ],
  },
  {
    name: 'Squarespace',
    steps: [
      { task: 'Upload robots.txt', detail: 'Not supported directly. Use Settings → SEO → Crawlers & Indexing instead.' },
      { task: 'Upload llms.txt', detail: "Squarespace doesn't support arbitrary root files. Workaround: create a new page at /llms and paste the llms.txt content as plain text." },
      { task: 'Upload sitemap.xml', detail: 'Auto-generated — skip this step.' },
      { task: 'Apply <head> tags', detail: '1. Go to Pages → click the page → Settings → Advanced\n2. Open your fixed HTML file, copy everything between <head> and </head>\n3. Paste into "Page Header Code Injection"\n4. Save' },
    ],
  },
  {
    name: 'Shopify',
    steps: [
      { task: 'Upload robots.txt', detail: 'Online Store → Themes → Edit Code → find robots.txt.liquid and replace.' },
      { task: 'Upload llms.txt', detail: "Shopify doesn't support arbitrary root files. Workaround: create a new page at /llms and paste the llms.txt content as plain text." },
      { task: 'Upload sitemap.xml', detail: 'Auto-generated — skip this step.' },
      { task: 'Apply <head> tags', detail: '1. Go to Online Store → Themes → Edit Code\n2. Find the template for the page (e.g. index.liquid)\n3. Open your fixed HTML file, copy everything between <head> and </head>\n4. Paste just before the closing </head> tag in the template\n5. Save' },
    ],
  },
  {
    name: 'Custom / HTML site',
    steps: [
      { task: 'Upload robots.txt', detail: 'Upload via FTP or cPanel File Manager to the public_html folder.' },
      { task: 'Upload llms.txt', detail: 'Upload via FTP or File Manager to public_html/llms.txt.' },
      { task: 'Upload sitemap.xml', detail: 'Upload via FTP or cPanel to public_html/sitemap.xml. After uploading, submit the URL in Google Search Console → Sitemaps.' },
      { task: 'Apply <head> tags', detail: '1. Open your fixed HTML file from the zip\n2. Copy everything between <head> and </head>\n3. Open your live HTML file via FTP or cPanel File Manager\n4. Replace the existing <head>...</head> content with the copied code\n5. Save and upload' },
    ],
  },
]

function getPostFixChecklist(analysis: GeoResult) {
  const autoFixed: string[] = []
  const stillManual: ManualItem[] = []

  const issueTitles = new Set(analysis.issues.map(i => i.title))

  if (issueTitles.has('Generic page title'))
    autoFixed.push('Page title replaced with branded title')
  if (issueTitles.has('Missing meta description'))
    autoFixed.push('Meta description added')
  if (issueTitles.has('Missing Open Graph tags'))
    autoFixed.push('Open Graph tags (og:title, og:description, og:url) added')
  if (issueTitles.has('No canonical tag'))
    autoFixed.push('Canonical tag added')
  if (issueTitles.has('No structured data (JSON-LD)'))
    autoFixed.push('JSON-LD schema markup added')
  if (issueTitles.has('Site blocked from indexing'))
    autoFixed.push('meta robots changed from noindex to index, follow')

  if (!analysis.hasHttps) {
    stillManual.push({
      label: 'Enable HTTPS on your website',
      intro: 'Your site runs on HTTP only. Enable a free SSL certificate through your hosting provider.',
      bullets: [
        { platform: 'cPanel hosting',      steps: "Log in to cPanel → SSL/TLS → Let's Encrypt → issue a certificate. Then enable \"Force HTTPS\" redirect." },
        { platform: 'WordPress (managed)', steps: 'Most managed WordPress hosts (Kinsta, WP Engine, SiteGround) have a one-click SSL button in their dashboard.' },
        { platform: 'Wix',                 steps: 'SSL is enabled automatically — check Settings → Domain to confirm.' },
        { platform: 'Squarespace',         steps: "SSL is automatic. Go to Settings → Security to confirm it's enabled." },
        { platform: 'Shopify',             steps: 'SSL is enabled by default on all Shopify stores.' },
      ],
    })
  }

  const hasContentIssue = !analysis.hasSchema ||
    analysis.issues.some(i => i.title.includes('Content') || i.title.includes('credib'))
  if (hasContentIssue) {
    stillManual.push({
      label: 'Improve your page content',
      intro: 'AI engines need enough content to understand and cite your site. Aim for at least 300 words on your homepage.',
      bullets: [
        { platform: 'What to add',    steps: 'Your business name, what you do, who you serve, why customers choose you, and your location if local.' },
        { platform: 'Where to add it', steps: 'Edit your homepage in your CMS and add a clear "About us" or "What we do" paragraph.' },
        { platform: 'Why it matters', steps: 'More quality content = better AI citation chances. ChatGPT and Perplexity cite pages that clearly explain what a business does.' },
      ],
    })
  }

  stillManual.push({
    label: 'Add social media links to your site',
    intro: 'AI engines use social presence as a trust signal. Add links to your profiles in your website footer.',
    bullets: [
      { platform: 'What to add',  steps: 'Links to your LinkedIn, Facebook, Instagram, or Twitter/X profiles.' },
      { platform: 'Where to add', steps: 'Edit your website footer in your CMS and add social media icon links.' },
      { platform: 'Why it matters', steps: 'Social links help AI engines verify your business is real and active.' },
    ],
  })

  return { autoFixed, stillManual }
}

function SuccessContent() {
  const params = useSearchParams()
  const router = useRouter()
  const sessionId = params.get('session_id')
  const [url, setUrl] = useState('')
  const [selectedPages, setSelectedPages] = useState<string[]>([])
  const [analysis, setAnalysis] = useState<GeoResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null)
  const [expandedManual, setExpandedManual] = useState<number | null>(null)

  useEffect(() => {
    const storedUrl = sessionStorage.getItem('geo_target_url')
    const storedPages = sessionStorage.getItem('geo_selected_pages')
    const storedAnalysis = sessionStorage.getItem('geo_analysis')
    if (storedUrl) setUrl(storedUrl)
    if (storedPages) { try { setSelectedPages(JSON.parse(storedPages)) } catch { /* ignore */ } }
    if (storedAnalysis) { try { setAnalysis(JSON.parse(storedAnalysis)) } catch { /* ignore */ } }
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
        body: JSON.stringify({ url, sessionId, selectedPages: selectedPages.length ? selectedPages : [url] }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Generation failed')
      }
      const blob = await res.blob()
      const domain = (() => { try { return new URL(url).hostname } catch { return 'site' } })()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `geoaudit-fix-${domain}.zip`
      a.click()
      setDone(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Generation failed. Please email us.')
    } finally {
      setLoading(false)
    }
  }

  const pageCount = selectedPages.length || 1
  const checklist = analysis ? getPostFixChecklist(analysis) : null

  return (
    <main className="min-h-screen bg-gray-50 pb-16">
      <nav className="border-b border-gray-200 bg-white px-6 py-4">
        <button onClick={() => router.push('/')} className="text-xl font-bold text-gray-900 hover:opacity-80">
          GEO<span className="text-emerald-500">Fix</span>
        </button>
      </nav>

      <div className="max-w-2xl mx-auto px-4 pt-12">
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">{done ? '📦' : '🎉'}</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {done ? 'Download started!' : 'Payment Successful!'}
          </h1>
          <p className="text-gray-500">
            {done
              ? 'Your zip file is downloading. Follow the steps below to apply everything.'
              : `Ready to generate fixed files for ${pageCount} page${pageCount > 1 ? 's' : ''}. Click below to download.`}
          </p>
        </div>

        {url && (
          <div className="mb-5 bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-500 shadow-sm">
            Site: <span className="text-gray-900 font-medium">{url}</span>
            {selectedPages.length > 1 && (
              <span className="text-gray-400 text-xs ml-2">({selectedPages.length} pages)</span>
            )}
          </div>
        )}

        {!url && (
          <div className="mb-5">
            <p className="text-gray-500 text-sm mb-2">Enter the URL you checked:</p>
            <input
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://yoursite.com"
              className="w-full bg-white border border-gray-300 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:border-emerald-500 shadow-sm"
            />
          </div>
        )}

        {!done ? (
          <button
            onClick={generateFix}
            disabled={loading || !url}
            className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold px-8 py-4 rounded-xl transition-colors w-full shadow-sm mb-4"
          >
            {loading ? 'Generating your zip file…' : 'Download My Fixed Files (zip)'}
          </button>
        ) : (
          <button
            onClick={generateFix}
            disabled={loading}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-6 py-3 rounded-xl transition-colors text-sm w-full border border-gray-200 mb-6"
          >
            Download again
          </button>
        )}

        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {done && checklist && (
          <div className="space-y-5">

            {/* Auto-fixed */}
            {checklist.autoFixed.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                <h2 className="text-gray-900 font-semibold mb-3 flex items-center gap-2">
                  <span className="text-emerald-500">✓</span> Auto-fixed in your HTML
                </h2>
                <ul className="space-y-2">
                  {checklist.autoFixed.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-emerald-700">
                      <span className="mt-0.5 shrink-0">✓</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Simple Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 shadow-sm">
              <h2 className="text-gray-900 font-semibold mb-1">📋 Simple Instructions</h2>
              <p className="text-blue-700 text-base mb-4">Familiar with your CMS? Here&apos;s all you need to know.</p>
              <ol className="space-y-3">
                <li className="flex gap-3 text-sm text-blue-900">
                  <span className="bg-blue-200 text-blue-800 font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0 text-xs mt-0.5">1</span>
                  <span>Upload <strong>robots.txt</strong>, <strong>llms.txt</strong>, and <strong>sitemap.xml</strong> from the zip to your website&apos;s root folder (so they&apos;re accessible at yourdomain.com/robots.txt, etc.).</span>
                </li>
                <li className="flex gap-3 text-sm text-blue-900">
                  <span className="bg-blue-200 text-blue-800 font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0 text-xs mt-0.5">2</span>
                  <span><strong>Before making any changes, save a backup of your original page file</strong> — so you can restore it if needed.</span>
                </li>
                <li className="flex gap-3 text-sm text-blue-900">
                  <span className="bg-blue-200 text-blue-800 font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0 text-xs mt-0.5">3</span>
                  <span>
                    Open the HTML file(s) from the <strong>html-pages/</strong> folder in your browser. Then:
                    <ol className="mt-2 space-y-1 list-none">
                      <li>① Right-click anywhere on the page and select <strong>View Page Source</strong></li>
                      <li>② Select and copy everything between and including <code className="bg-blue-100 px-1 rounded">&lt;head&gt;</code> and <code className="bg-blue-100 px-1 rounded">&lt;/head&gt;</code></li>
                      <li>③ Open your existing page file and replace its <code className="bg-blue-100 px-1 rounded">&lt;head&gt;…&lt;/head&gt;</code> section with the copied content</li>
                      <li>④ <strong>Do not touch anything inside the <code className="bg-blue-100 px-1 rounded">&lt;body&gt;</code> section</strong> — your page content, images, and layout stay exactly the same</li>
                    </ol>
                  </span>
                </li>
              </ol>
            </div>

            {/* Detailed Instructions by Platform */}
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <h2 className="text-gray-900 font-semibold mb-1">🔧 Detailed Instructions by Platform</h2>
              <p className="text-gray-400 text-base mb-3">Find your platform below — expand it for step-by-step guidance.</p>
              <div className="space-y-2">
                {PLATFORM_GUIDES.map((platform) => (
                  <div key={platform.name} className="border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedPlatform(expandedPlatform === platform.name ? null : platform.name)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                    >
                      <span className="text-sm font-semibold text-gray-800">{platform.name}</span>
                      <span className="text-gray-400 text-xs">{expandedPlatform === platform.name ? '▲' : '▼'}</span>
                    </button>
                    {expandedPlatform === platform.name && (
                      <div className="px-4 pb-4 bg-gray-50 space-y-4">
                        {platform.steps.map((step, j) => (
                          <div key={j}>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">{step.task}</p>
                            <ol className="space-y-1">
                              {step.detail.split('\n').map((line, k) => (
                                <li key={k} className="text-sm text-gray-700">{line}</li>
                              ))}
                            </ol>
                          </div>
                        ))}
                        <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          Reminder: only replace the &lt;head&gt; section — never touch the &lt;body&gt; content.
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Still manual */}
            {checklist.stillManual.length > 0 && (
              <div className="bg-white border border-orange-200 rounded-2xl p-5 shadow-sm">
                <h2 className="text-gray-900 font-semibold mb-1">⚠️ Still needs manual action</h2>
                <p className="text-gray-400 text-xs mb-3">These issues cannot be fixed automatically — you&apos;ll need to do them yourself.</p>
                <div className="space-y-2">
                  {checklist.stillManual.map((item, i) => (
                    <div key={i} className="border border-orange-100 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setExpandedManual(expandedManual === i ? null : i)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-orange-50 transition-colors"
                      >
                        <span className="text-sm font-medium text-orange-800">{item.label}</span>
                        <span className="text-orange-400 text-xs">{expandedManual === i ? '▲' : '▼'}</span>
                      </button>
                      {expandedManual === i && (
                        <div className="px-4 pb-4 bg-orange-50">
                          <p className="text-sm text-orange-700 mb-3">{item.intro}</p>
                          <div className="space-y-4">
                            {item.bullets.map((b, j) => (
                              <div key={j}>
                                <p className="text-sm font-bold text-orange-900 mb-1">{b.platform}</p>
                                <ol className="space-y-1">
                                  {b.steps.split('\n').map((step, k) => (
                                    <li key={k} className="text-sm text-orange-800">{step}</li>
                                  ))}
                                </ol>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

        <button
          onClick={() => router.push('/')}
          className="mt-8 w-full text-center text-gray-400 hover:text-gray-600 text-sm py-2 transition-colors"
        >
          Check another site →
        </button>
      </div>
    </main>
  )
}

export default function SuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400">
        Loading…
      </div>
    }>
      <SuccessContent />
    </Suspense>
  )
}
