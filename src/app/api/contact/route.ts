import { NextRequest } from 'next/server'
import nodemailer from 'nodemailer'

export async function POST(request: NextRequest) {
  try {
    const { name, email, subject, message } = await request.json()

    if (!name || !email || !message) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    })

    await transporter.sendMail({
      from: `"GEOFix Contact" <${process.env.GMAIL_USER}>`,
      to: 'openclawclub@gmail.com',
      replyTo: email,
      subject: `[GEOFix] ${subject || 'New message'}`,
      text: `Name: ${name}\nEmail: ${email}\nSubject: ${subject}\n\n${message}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#10b981;">New GEOFix Message</h2>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px 0;color:#6b7280;width:80px;"><strong>Name</strong></td><td style="padding:8px 0;">${name}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;"><strong>Email</strong></td><td style="padding:8px 0;"><a href="mailto:${email}">${email}</a></td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;"><strong>Subject</strong></td><td style="padding:8px 0;">${subject || '—'}</td></tr>
          </table>
          <hr style="margin:16px 0;border:none;border-top:1px solid #e5e7eb;">
          <p style="white-space:pre-wrap;color:#111827;">${message}</p>
        </div>
      `,
    })

    return Response.json({ ok: true })
  } catch (err) {
    console.error('Contact email error:', err)
    return Response.json({ error: 'Failed to send message. Please try again.' }, { status: 500 })
  }
}
