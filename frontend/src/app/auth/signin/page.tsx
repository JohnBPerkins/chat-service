'use client'

import { getProviders, signIn, getSession } from 'next-auth/react'

// Force dynamic rendering for this page
export const dynamic = 'force-dynamic'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Github, LogIn } from 'lucide-react'
import type { ClientSafeProvider } from 'next-auth/react'

export default function SignIn() {
  const [providers, setProviders] = useState<Record<string, ClientSafeProvider> | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/'

  useEffect(() => {
    const fetchProviders = async () => {
      const res = await getProviders()
      setProviders(res)
    }

    const checkSession = async () => {
      const session = await getSession()
      if (session) {
        router.push(callbackUrl)
      }
    }

    fetchProviders()
    checkSession()
  }, [callbackUrl, router])

  const handleSignIn = async (providerId: string) => {
    setLoading(providerId)
    try {
      await signIn(providerId, { callbackUrl })
    } catch (error) {
      console.error('Sign in error:', error)
    } finally {
      setLoading(null)
    }
  }

  const getProviderIcon = (providerId: string) => {
    switch (providerId) {
      case 'github':
        return <Github className="w-5 h-5" />
      default:
        return <LogIn className="w-5 h-5" />
    }
  }

  const getProviderName = (providerId: string) => {
    switch (providerId) {
      case 'github':
        return 'GitHub'
      case 'google':
        return 'Google'
      default:
        return providerId.charAt(0).toUpperCase() + providerId.slice(1)
    }
  }

  if (!providers) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const providersList = Object.values(providers)

  if (providersList.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-8 p-8">
          <div className="text-center">
            <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
              OAuth Not Configured
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              No OAuth providers are configured. Please set up GitHub or Google OAuth credentials.
            </p>
            <div className="mt-6 text-left bg-gray-100 p-4 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">To set up OAuth:</h3>
              <ol className="text-sm text-gray-700 space-y-1">
                <li>1. Create OAuth apps on GitHub and/or Google</li>
                <li>2. Add credentials to your .env.local file</li>
                <li>3. Restart the development server</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Sign in to Chat Service
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Choose your preferred authentication method
          </p>
        </div>

        <div className="space-y-4">
          {providersList.map((provider) => (
            <button
              key={provider.name}
              onClick={() => handleSignIn(provider.id)}
              disabled={loading === provider.id}
              className="w-full flex justify-center items-center gap-3 py-3 px-4 border border-gray-300 rounded-lg shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading === provider.id ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              ) : (
                getProviderIcon(provider.id)
              )}
              Sign in with {getProviderName(provider.id)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}