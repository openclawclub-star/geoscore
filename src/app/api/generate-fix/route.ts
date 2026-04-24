import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { url, sessionId } = await request.json()

    if (!url || !sessionId) {
      return Response.json({ error: 'Missing parameters' }, { status: 400 })
    }

    // Fetch the page HTML
    let html = ''
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'GeoScoreBot/1.0' },
        signal: AbortSignal.timeout(15000),
      })
      html = await res.text()
    } catch {
      return Response.json({ error: 'Could not fetch the page. Please try again.' }, { status: 500 })
    }

    if (!html) {
      return Response.json({ error: 'Empty page response' }, { status: 500 })
    }

    const parsedUrl = new URL(url)
    const domain = parsedUrl.hostname
    const origin = parsedUrl.origin

    // Extract existing title to check if it's a placeholder
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const existingTitle = titleMatch ? titleMatch[1].trim() : ''
    const isPlaceholder = !existingTitle || /bootstrap|template|html5|untitled/i.test(existingTitle)

    // Extract meta description
    const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)
    const existingDesc = descMatch ? descMatch[1] : ''

    // Extract page text for context
    const pageText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000)

    // Build smart replacements
    const newTitle = isPlaceholder
      ? `${domain.replace('www.', '').split('.')[0].charAt(0).toUpperCase() + domain.replace('www.', '').split('.')[0].slice(1)} | Professional Services — ${domain}`
      : existingTitle

    const newDesc = existingDesc || `${newTitle}. Visit ${origin} to learn more.`

    // Build JSON-LD schema
    const schema = {
      '@context': 'https://schema.org',
      '@type': ['Organization', 'LocalBusiness'],
      name: newTitle.split('|')[0].trim(),
      url: origin,
      description: newDesc,
      address: {
        '@type': 'PostalAddress',
        addressCountry: 'HK',
      },
    }

    // Apply fixes to HTML
    let fixed = html

    // 1. Fix noindex
    fixed = fixed.replace(
      /<meta[^>]+name=["']robots["'][^>]*>/gi,
      '<meta name="robots" content="index, follow" />'
    )

    // 2. Fix title
    if (isPlaceholder) {
      fixed = fixed.replace(
        /<title[^>]*>[^<]+<\/title>/i,
        `<title>${newTitle}</title>`
      )
    }

    // 3. Fix/add meta description
    if (!existingDesc) {
      fixed = fixed.replace(
        /<meta[^>]+name=["']description["'][^>]*>/i,
        `<meta name="description" content="${newDesc}">`
      )
    }

    // 4. Add canonical, OG tags, and JSON-LD just before </head>
    const additions = `
    <link rel="canonical" href="${origin}/">

    <!-- Open Graph -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${origin}/">
    <meta property="og:title" content="${newTitle}">
    <meta property="og:description" content="${newDesc}">
    <meta property="og:site_name" content="${newTitle.split('|')[0].trim()}">

    <!-- Structured Data (JSON-LD) -->
    <script type="application/ld+json">
    ${JSON.stringify(schema, null, 2)}
    </script>`

    // Only add if not already present
    if (!/<link[^>]+rel=["']canonical["']/i.test(fixed)) {
      fixed = fixed.replace(/<\/head>/i, `${additions}\n</head>`)
    }

    // 5. Update copyright year
    fixed = fixed.replace(/©\s*20\d\d/g, `© ${new Date().getFullYear()}`)
    fixed = fixed.replace(/copyright\s+20\d\d/gi, `Copyright ${new Date().getFullYear()}`)

    // 6. Fix empty alt tags on logo/about images with descriptive text
    fixed = fixed.replace(/alt=""\s*>/g, `alt="${newTitle.split('|')[0].trim()}" >`)

    // Generate robots.txt content
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

    // Generate llms.txt content
    const llmsTxt = `# ${newTitle.split('|')[0].trim()}

> ${newDesc}

## About
${pageText.slice(0, 500)}

## Contact
- Website: ${origin}

## Services
Visit ${origin} for full details.`

    return Response.json({
      fixedHtml: fixed,
      robotsTxt,
      llmsTxt,
      domain,
    })
  } catch (err) {
    console.error(err)
    return Response.json({ error: 'Code generation failed' }, { status: 500 })
  }
}
