import { NextRequest } from 'next/server'
import Stripe from 'stripe'

export async function POST(request: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  // If webhook secret is set, verify signature
  if (process.env.STRIPE_WEBHOOK_SECRET && sig) {
    try {
      const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object
        console.log('Payment completed:', session.id, 'for', session.metadata?.targetUrl)
        // Future: save to DB, send email, etc.
      }

      return Response.json({ received: true })
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      return Response.json({ error: 'Invalid signature' }, { status: 400 })
    }
  }

  // No webhook secret configured — just acknowledge
  return Response.json({ received: true })
}
