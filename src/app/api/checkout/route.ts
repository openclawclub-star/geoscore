import { NextRequest } from 'next/server'
import Stripe from 'stripe'

export const TIERS = {
  single:  { label: 'Single Page',              pages: 1,  amount: 499  },
  starter: { label: 'Starter — up to 5 pages',  pages: 5,  amount: 799  },
  pro:     { label: 'Pro — up to 10 pages',      pages: 10, amount: 999  },
  full:    { label: 'Full Site — up to 20 pages',pages: 20, amount: 1499 },
  agency:  { label: 'Agency — up to 50 pages',  pages: 50, amount: 1999 },
} as const

export type TierKey = keyof typeof TIERS

export function getTierKey(pageCount: number): TierKey {
  if (pageCount <= 1)  return 'single'
  if (pageCount <= 5)  return 'starter'
  if (pageCount <= 10) return 'pro'
  if (pageCount <= 20) return 'full'
  return 'agency'
}

export async function POST(request: NextRequest) {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

    const { url, selectedPages, analysisData } = await request.json()
    const pages: string[] = selectedPages ?? [url]
    const tierKey = getTierKey(pages.length)
    const tier = TIERS[tierKey]

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `GEO Audit Fix — ${tier.label}`,
              description: `Fixed HTML for ${pages.length} page${pages.length > 1 ? 's' : ''} on ${url} — JSON-LD schema, meta tags, Open Graph, robots.txt, llms.txt, sitemap.`,
            },
            unit_amount: tier.amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/`,
      metadata: {
        targetUrl: url,
        tierKey,
        pageCount: String(pages.length),
        selectedPages: JSON.stringify(pages).slice(0, 490),
        analysisData: JSON.stringify(analysisData).slice(0, 490),
      },
    })

    return Response.json({ url: session.url })
  } catch (err) {
    console.error(err)
    return Response.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
