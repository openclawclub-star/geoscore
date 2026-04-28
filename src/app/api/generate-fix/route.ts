import { NextRequest } from 'next/server'
import Stripe from 'stripe'
import JSZip from 'jszip'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function fetchPage(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'GeoAuditBot/1.0' },
      signal: AbortSignal.timeout(15000),
    })
    return await res.text()
  } catch {
    return ''
  }
}

function extractBodyText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000)
}

async function fixPageHtmlWithAI(
  html: string,
  pageUrl: string,
  siteName: string,
): Promise<string> {
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i)
  const currentHead = headMatch ? headMatch[1] : ''
  const bodyText = extractBodyText(html)

  const prompt = `You are a GEO (Generative Engine Optimization) expert. Fix the HTML <head> section for maximum AI search visibility.

URL: ${pageUrl}
Site name: ${siteName}
Page content (first 2000 chars):
${bodyText}

Current <head> contents:
${currentHead}

Return ONLY the complete contents that should go inside <head>...</head> — no <head> tags, no markdown, no explanation. Include:
1. Proper <title> (keep if good, improve if missing or generic — max 60 chars)
2. <meta name="description"> (clear, specific, 120-160 chars)
3. <meta name="robots" content="index, follow">
4. <link rel="canonical" href="${pageUrl}">
5. Open Graph: og:type, og:url, og:title, og:description, og:site_name
6. JSON-LD structured data using schema.org — pick the most appropriate @type for this business
7. Preserve any existing valid tags that are already correct
8. Add speakable spec pointing to h1 and h2`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    })

    let fixedHead = message.content[0].type === 'text' ? message.content[0].text : ''
    if (!fixedHead) return html

    // Strip markdown code fences if Claude wrapped the response
    fixedHead = fixedHead.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()

    return html.replace(/<head[^>]*>[\s\S]*?<\/head>/i, `<head>\n${fixedHead}\n</head>`)
  } catch (err) {
    console.error('AI head fix failed for', pageUrl, err)
    return html
  }
}

async function generateLlmsTxtWithAI(
  siteName: string,
  origin: string,
  pages: string[],
  bodyText: string,
): Promise<string> {
  const prompt = `You are a GEO expert. Write an llms.txt file for this website so AI assistants can understand and cite it accurately.

Site name: ${siteName}
Homepage URL: ${origin}
Pages:
${pages.map(p => `- ${p}`).join('\n')}

Homepage content (first 2000 chars):
${bodyText}

Write a well-structured llms.txt following the llms.txt specification:
- Start with # ${siteName}
- A clear > blockquote description (1-2 sentences)
- ## About section (3-5 sentences explaining what this site does)
- ## Pages section listing the pages
- ## Contact section with the website URL
- Keep it concise and factual — AI assistants will use this to cite the site

Return only the llms.txt content, no markdown code fences.`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })
    return message.content[0].type === 'text' ? message.content[0].text : fallbackLlmsTxt(siteName, origin, pages, bodyText)
  } catch {
    return fallbackLlmsTxt(siteName, origin, pages, bodyText)
  }
}

function fallbackLlmsTxt(siteName: string, origin: string, pages: string[], bodyText: string): string {
  return `# ${siteName}

> ${bodyText.slice(0, 300)}

## About
${bodyText.slice(0, 500)}

## Contact
- Website: ${origin}

## Pages
${pages.map(p => `- ${p}`).join('\n')}`
}

// Run up to `limit` promises at a time
async function pLimit<T>(fns: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = []
  let i = 0
  async function worker() {
    while (i < fns.length) {
      const idx = i++
      results[idx] = await fns[idx]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, fns.length) }, worker))
  return results
}

export async function POST(request: NextRequest) {
  try {
    const { url, sessionId, selectedPages } = await request.json()

    if (!url || !sessionId) {
      return Response.json({ error: 'Missing parameters' }, { status: 400 })
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
    const session = await stripe.checkout.sessions.retrieve(sessionId)
    if (session.payment_status !== 'paid') {
      return Response.json({ error: 'Payment not completed.' }, { status: 402 })
    }

    const pages: string[] = selectedPages?.length ? selectedPages : [url]

    const homeHtml = await fetchPage(url)
    if (!homeHtml) {
      return Response.json({ error: 'Could not fetch the page. Please try again.' }, { status: 500 })
    }

    const parsedUrl = new URL(url)
    const origin = parsedUrl.origin
    const domain = parsedUrl.hostname

    const titleMatch = homeHtml.match(/<title[^>]*>([^<]+)<\/title>/i)
    const rawTitle = titleMatch ? titleMatch[1].trim() : domain
    const rawSiteName = rawTitle.split(/[|\-–]/)[0].trim()
    const isPlaceholderName = !rawSiteName || /bootstrap|template|html5|untitled|coming soon/i.test(rawSiteName)
    const siteName = isPlaceholderName ? domain.replace('www.', '') : rawSiteName
    const bodyText = extractBodyText(homeHtml)

    const zip = new JSZip()
    const htmlFolder = zip.folder('html-pages')!

    // Fix pages with AI, max 3 concurrent Claude calls
    const pageFns = pages.map(pageUrl => async () => {
      const html = pageUrl === url ? homeHtml : await fetchPage(pageUrl)
      if (!html) return
      const fixed = await fixPageHtmlWithAI(html, pageUrl, siteName)
      const headMatch = fixed.match(/<head[^>]*>([\s\S]*?)<\/head>/i)
      const headContent = headMatch ? `<head>\n${headMatch[1]}\n</head>` : fixed
      const pagePath = new URL(pageUrl).pathname
      const filename = pagePath === '/'
        ? 'index.html'
        : pagePath.replace(/^\//, '').replace(/\//g, '-').replace(/\.html?$/, '') + '.html'
      htmlFolder.file(filename, headContent)
    })
    await pLimit(pageFns, 3)

    const robotsTxt = `User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: GoogleOther
Allow: /

Sitemap: ${origin}/sitemap.xml`

    const llmsTxt = await generateLlmsTxtWithAI(siteName, origin, pages, bodyText)

    const now = new Date().toISOString().split('T')[0]
    const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(p => `  <url>
    <loc>${p}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${new URL(p).pathname === '/' ? '1.0' : '0.8'}</priority>
  </url>`).join('\n')}
</urlset>`

    zip.file('robots.txt', robotsTxt)
    zip.file('llms.txt', llmsTxt)
    zip.file('sitemap.xml', sitemapXml)
    zip.file('README.txt', `GEO AUDIT FIX — ${domain}
Generated: ${new Date().toLocaleString()}
Pages fixed: ${pages.length}

${pages.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}

================================================================
FILES IN THIS ZIP
================================================================

html-pages/       AI-fixed HTML for each page (title, meta, OG tags, JSON-LD)
robots.txt        Upload to ${origin}/robots.txt
llms.txt          Upload to ${origin}/llms.txt
sitemap.xml       Upload to ${origin}/sitemap.xml

================================================================
WHAT IS A CMS?
================================================================

A CMS (Content Management System) is the software you use to build and
manage your website without writing code. Common examples:

  - WordPress    — the most popular CMS, used by ~40% of all websites
  - Wix          — drag-and-drop website builder
  - Squarespace  — design-focused website builder
  - Shopify      — e-commerce platform with built-in CMS
  - Custom/HTML  — you or a developer built the site with raw HTML files

Not sure which one you have?
  - If you log in to edit your site at wordpress.com or your host's wp-admin
    page → you're on WordPress
  - If you log in at wix.com → Wix
  - If you log in at squarespace.com → Squarespace
  - If you log in at shopify.com → Shopify
  - If your developer gave you HTML files or you edit files via FTP → Custom/HTML

================================================================
STEP 1 — APPLY THE FIXED HTML TO YOUR PAGES
================================================================

Open the html-pages/ folder. Each file corresponds to one page.
Each HTML file contains ONLY the <head>...</head> section — no body content.

HOW TO COPY THE HEAD CONTENT:
1. Open the HTML file in your browser (double-click it)
2. Right-click anywhere on the page and select "View Page Source"
3. Select and copy everything between (and including) <head> and </head>
4. Open your existing page file and replace its <head>...</head> section
   with the copied content
5. Do NOT touch anything inside the <body> section —
   your page content, images, and layout stay exactly the same

IMPORTANT: Save a backup of your original page file before making any changes.

--- WordPress ---
1. Install the free plugin "Header Footer Code Manager" (search in Plugins > Add New)
2. Go to the plugin > Add New Script
3. Open your fixed HTML file in a browser, right-click > View Page Source
4. Copy everything between <head> and </head>
5. Paste it into the script editor box
6. Set Location to "Inside <head>"
7. Under "Display On", select the specific page this file belongs to
8. Click Save
Repeat for each page in html-pages/.

--- Wix ---
1. Open Wix Editor and click on the page you want to fix
2. Click Settings (top menu) > Advanced
3. Open your fixed HTML file in a browser, right-click > View Page Source
4. Copy everything between <head> and </head>
5. Paste into the "Additional tags" box
6. Click Apply, then Publish
Repeat for each page.

--- Squarespace ---
1. Go to Pages > click the page you want to fix
2. Click the gear icon (Settings) > Advanced tab
3. Open your fixed HTML file in a browser, right-click > View Page Source
4. Copy everything between <head> and </head>
5. Paste into the "Page Header Code Injection" box
6. Click Save
Repeat for each page.

--- Shopify ---
1. Go to Online Store > Themes > click Edit Code
2. Find the Liquid template for the page (e.g. index.liquid for homepage,
   page.liquid for regular pages, product.liquid for product pages)
3. Open your fixed HTML file in a browser, right-click > View Page Source
4. Copy everything between <head> and </head>
5. Paste just before the closing </head> tag in the Liquid file
6. Click Save
Note: In Shopify, one template covers multiple pages — add only the tags
that apply to all pages sharing that template, or use Liquid conditionals.

--- Custom / Static HTML Site ---
1. Open your fixed HTML file in a browser (double-click it)
2. Right-click anywhere on the page and select "View Page Source"
3. Select and copy everything between <head> and </head>
4. Connect to your server via FTP (FileZilla) or cPanel File Manager
5. Download and open the matching live HTML file on your server
6. Replace the existing <head>...</head> content with the copied code
7. Save and re-upload the file
Repeat for each page.

*** REMINDER: Only replace the <head> section. Never touch the <body>. ***

================================================================
STEP 2 — UPLOAD robots.txt
================================================================

robots.txt tells search engines and AI crawlers (ChatGPT, Claude, Perplexity)
they are allowed to read your site. Upload it to: ${origin}/robots.txt

--- WordPress ---
1. Log in to your hosting cPanel > File Manager > public_html
2. Upload robots.txt to the public_html folder (replace if one already exists)
   OR use a plugin like Yoast SEO: SEO > Tools > File Editor > robots.txt

--- Wix ---
Free plans: not supported.
Paid plans: Settings > SEO > Crawlers & Indexing > Edit robots.txt

--- Squarespace ---
Not supported directly via file upload.
Go to Settings > SEO > Crawlers & Indexing and edit the robots settings there.

--- Shopify ---
1. Go to Online Store > Themes > Edit Code
2. Find robots.txt.liquid and replace its contents with the robots.txt from this zip
3. Click Save

--- Custom / Static HTML Site ---
Upload robots.txt to your public_html (web root) folder via FTP or cPanel File Manager.

================================================================
STEP 3 — UPLOAD llms.txt
================================================================

llms.txt helps AI assistants (ChatGPT, Claude, Perplexity) understand and
accurately cite your website. Upload it to: ${origin}/llms.txt

--- WordPress ---
Upload via cPanel File Manager or FTP to public_html/llms.txt

--- Wix / Squarespace / Shopify ---
These platforms do not support arbitrary root-level files.
Workaround: Create a new page at the path /llms on your site and paste
the full llms.txt content as plain text (no HTML formatting).

--- Custom / Static HTML Site ---
Upload llms.txt to public_html/llms.txt via FTP or cPanel File Manager.

================================================================
STEP 4 — UPLOAD sitemap.xml
================================================================

A sitemap tells search engines all the pages on your site.
Target URL: ${origin}/sitemap.xml

--- WordPress ---
If you use Yoast SEO or Rank Math: SKIP this step — they auto-generate one.
Otherwise: upload sitemap.xml to public_html via cPanel File Manager.

--- Wix ---
Wix auto-generates a sitemap. SKIP this step.

--- Squarespace ---
Squarespace auto-generates a sitemap. SKIP this step.

--- Shopify ---
Shopify auto-generates a sitemap. SKIP this step.

--- Custom / Static HTML Site ---
Upload sitemap.xml to public_html/sitemap.xml via FTP or cPanel File Manager.

AFTER UPLOADING: Submit your sitemap URL in Google Search Console:
  1. Go to https://search.google.com/search-console
  2. Select your property > Sitemaps
  3. Enter: ${origin}/sitemap.xml and click Submit

================================================================
NEED HELP?
================================================================

Visit our web site and use the Contact Us form on the website.
Please include your domain name so we can help you faster.
`)

    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })

    return new Response(zipBuffer as BodyInit, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="geoaudit-fix-${domain}.zip"`,
      },
    })
  } catch (err) {
    console.error(err)
    return Response.json({ error: 'Code generation failed' }, { status: 500 })
  }
}
