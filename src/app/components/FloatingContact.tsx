'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function FloatingContact() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Popup card */}
      {open && (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-lg p-5 w-72">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-bold text-gray-900 text-sm">Need help?</p>
              <p className="text-gray-400 text-xs">We reply within a few hours</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-300 hover:text-gray-500 text-lg leading-none"
            >
              ✕
            </button>
          </div>

          <div className="space-y-2">
            <button
              onClick={() => { setOpen(false); router.push('/contact') }}
              className="w-full flex items-center gap-3 px-4 py-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors text-left"
            >
              <span className="text-xl">✉</span>
              <div>
                <p className="text-sm font-semibold text-emerald-700">Send a message</p>
                <p className="text-xs text-emerald-500">Questions, issues, custom plans</p>
              </div>
            </button>

          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="bg-emerald-500 hover:bg-emerald-600 text-white w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-colors text-2xl"
        aria-label="Contact support"
      >
        {open ? '✕' : '💬'}
      </button>
    </div>
  )
}
