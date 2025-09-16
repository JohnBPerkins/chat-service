'use client'

import { useState, useEffect } from 'react'
import { getProviders, signIn, getSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Github, LogIn, MessageCircle, Users, Zap, Shield } from 'lucide-react'
import type { ClientSafeProvider } from 'next-auth/react'

export function AuthPrompt() {
  const [providers, setProviders] = useState<Record<string, ClientSafeProvider> | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const fetchProviders = async () => {
      const res = await getProviders()
      setProviders(res)
    }

    const checkSession = async () => {
      const session = await getSession()
      if (session) {
        // Session exists, the parent component will handle showing the authenticated UI
        return
      }
    }

    fetchProviders()
    checkSession()
  }, [router])

  const handleSignIn = async (providerId: string) => {
    setLoading(providerId)
    try {
      await signIn(providerId, { callbackUrl: '/' })
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
      case 'google':
        return (
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
        )
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

  const providersList = providers ? Object.values(providers) : []

  return (
    <div className="h-full bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 flex flex-col shadow-2xl overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 lg:p-8">
        <div className="max-w-xl mx-auto text-center h-full flex flex-col justify-center">
          {/* Hero Section */}
          <div className="mb-8">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-500 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <MessageCircle className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-3">
              Welcome to
              <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent block">
                Chat Service
              </span>
            </h2>
            <p className="text-lg text-white/70 leading-relaxed">
              Real-time messaging with typing indicators, read receipts, and seamless conversation management.
            </p>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Zap className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="text-white font-semibold mb-1 text-sm">Real-time</h3>
              <p className="text-white/60 text-xs">Instant messaging</p>
            </div>

            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Users className="w-5 h-5 text-purple-400" />
              </div>
              <h3 className="text-white font-semibold mb-1 text-sm">Collaborative</h3>
              <p className="text-white/60 text-xs">Group & direct chats</p>
            </div>

            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Shield className="w-5 h-5 text-green-400" />
              </div>
              <h3 className="text-white font-semibold mb-1 text-sm">Secure</h3>
              <p className="text-white/60 text-xs">OAuth & encryption</p>
            </div>
          </div>

          {/* Authentication */}
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10">
            <h3 className="text-xl font-semibold text-white mb-4 text-center">Get Started</h3>

            {!providers ? (
              <div className="flex items-center justify-center py-6">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-white/20 border-t-white/60"></div>
              </div>
            ) : providersList.length === 0 ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <span className="text-orange-400 text-lg">⚙️</span>
                </div>
                <h4 className="text-white font-medium mb-2">OAuth Not Configured</h4>
                <p className="text-white/60 text-sm mb-3">
                  No OAuth providers are configured.
                </p>
                <div className="bg-white/5 rounded-lg p-3 text-left">
                  <h5 className="text-white font-medium mb-2 text-sm">Setup OAuth:</h5>
                  <ol className="text-white/70 text-xs space-y-1">
                    <li>1. Create OAuth apps</li>
                    <li>2. Add credentials to .env.local</li>
                    <li>3. Restart server</li>
                  </ol>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-white/80 text-center mb-4 text-sm">Choose your authentication method:</p>

                {providersList.map((provider) => (
                  <button
                    key={provider.name}
                    onClick={() => handleSignIn(provider.id)}
                    disabled={loading === provider.id}
                    className="w-full flex justify-center items-center gap-3 py-3 px-4 bg-white/10 hover:bg-white/15 border border-white/20 hover:border-white/30 rounded-lg shadow-lg hover:shadow-xl text-white font-medium transition-all duration-300 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 text-sm"
                  >
                    {loading === provider.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/20 border-t-white"></div>
                    ) : (
                      getProviderIcon(provider.id)
                    )}
                    {loading === provider.id ? 'Signing in...' : `Continue with ${getProviderName(provider.id)}`}
                  </button>
                ))}

                <p className="text-white/50 text-xs text-center mt-4 pt-3 border-t border-white/10">
                  By signing in, you agree to our terms of service and privacy policy.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}