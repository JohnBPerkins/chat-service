'use client'

import Link from 'next/link'
import { Home } from 'lucide-react'

// Force dynamic rendering for this page
export const dynamic = 'force-dynamic'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900">
      <div className="max-w-md w-full space-y-8 p-8 text-center">
        <div>
          <h1 className="text-9xl font-bold text-white opacity-20">404</h1>
          <h2 className="mt-4 text-3xl font-bold text-white">
            Page Not Found
          </h2>
          <p className="mt-2 text-lg text-white/70">
            The page you&apos;re looking for doesn&apos;t exist.
          </p>
        </div>

        <div className="space-y-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Home className="w-4 h-4" />
            Go Home
          </Link>
        </div>
      </div>
    </div>
  )
}