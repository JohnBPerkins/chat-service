'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, Home, RotateCcw } from 'lucide-react'

// Force dynamic rendering for this page
export const dynamic = 'force-dynamic'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900">
      <div className="max-w-md w-full space-y-8 p-8 text-center">
        <div>
          <AlertTriangle className="mx-auto h-16 w-16 text-red-400" />
          <h2 className="mt-4 text-3xl font-bold text-white">
            Something went wrong
          </h2>
          <p className="mt-2 text-lg text-white/70">
            An error occurred while loading this page.
          </p>
        </div>

        <div className="space-y-4">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Try Again
          </button>

          <Link
            href="/"
            className="block px-6 py-3 border border-white/20 text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <Home className="w-4 h-4 inline mr-2" />
            Go Home
          </Link>
        </div>
      </div>
    </div>
  )
}