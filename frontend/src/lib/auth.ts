import { NextAuthOptions } from 'next-auth'
import GithubProvider from 'next-auth/providers/github'
import GoogleProvider from 'next-auth/providers/google'

const providers = []

// Only add GitHub provider if credentials are configured
if (process.env.GITHUB_ID && process.env.GITHUB_SECRET) {
  providers.push(
    GithubProvider({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    })
  )
}

// Only add Google provider if credentials are configured
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  )
}

export const authOptions: NextAuthOptions = {
  providers,
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, user, account }) {
      // Initial sign in
      if (account && user) {
        token.accessToken = account.access_token
        token.provider = account.provider
        // Upsert user in our backend
        await upsertUser(user)
      }

      return token
    },
    async session({ session, token }) {
      // Send properties to the client
      if (token.accessToken) {
        session.accessToken = token.accessToken as string
      }
      if (token.provider) {
        session.provider = token.provider as string
      }
      if (token.sub) {
        session.user.id = token.sub
      }

      return session
    },
  },
  pages: {
    signIn: '/',
    error: '/',
  },
}

async function upsertUser(user: { email?: string | null; name?: string | null; image?: string | null }) {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080'}/v1/users/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        // Note: In production, we'd send the JWT token here
      },
      body: JSON.stringify({
        id: user.email, // Use email as user ID
        email: user.email,
        name: user.name,
        avatarUrl: user.image,
      }),
    })

    if (!response.ok) {
      console.warn('Failed to upsert user:', response.statusText)
    }
  } catch (error) {
    console.warn('Failed to upsert user:', error)
  }
}