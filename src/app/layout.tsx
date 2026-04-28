import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import FloatingContact from "./components/FloatingContact";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GEO Audit — Free AI Visibility Audit + Fix Service",
  description:
    "Check how visible your website is to ChatGPT, Perplexity, and Google AI Overviews. Get a free GEO audit in 60 seconds, free manual fix instructions, and auto-fix code downloads from $4.99.",
  keywords: [
    "GEO audit", "AI visibility checker", "AI SEO audit", "ChatGPT SEO",
    "Perplexity SEO", "Google AI Overviews", "llms.txt generator",
    "JSON-LD schema fix", "AI search optimization", "GEO fix service",
  ],
  openGraph: {
    title: "GEO Audit — Free AI Visibility Audit + Fix Service",
    description: "Check if your website gets cited by ChatGPT, Perplexity, and Google AI Overviews. Free audit + auto-fix from $4.99.",
    type: "website",
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'GEO Audit',
  url: 'https://geoaudit.app',
  description: 'Free AI visibility audit and fix service. Check if your website is cited by ChatGPT, Perplexity, and Google AI Overviews. Get a free GEO audit and fix issues from $4.99.',
  applicationCategory: 'WebApplication',
  operatingSystem: 'Web',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    description: 'Free GEO audit. Fix service from $4.99.',
  },
  provider: {
    '@type': 'Organization',
    name: 'GEO Audit',
    url: 'https://geoaudit.app',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-900">
        {children}
        <FloatingContact />
      </body>
    </html>
  );
}
