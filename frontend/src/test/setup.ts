import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll, vi } from 'vitest'
import React from 'react'

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: vi.fn(),
      replace: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
    }
  },
  useSearchParams() {
    return new URLSearchParams()
  },
  usePathname() {
    return '/'
  },
}))

// Mock Next.js image
vi.mock('next/image', () => ({
  default: (props: any) => {
    return React.createElement('img', props)
  },
}))

// Mock Next.js link
vi.mock('next/link', () => ({
  default: ({ children, ...props }: any) => {
    return React.createElement('a', props, children)
  },
}))

// Mock NextAuth
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({
    data: null,
    status: 'unauthenticated',
  })),
  signIn: vi.fn(),
  signOut: vi.fn(),
  getProviders: vi.fn(),
  getSession: vi.fn(),
  SessionProvider: ({ children }: any) => children,
}))

// Mock environment variables
Object.defineProperty(window, 'location', {
  value: {
    hostname: 'localhost',
    port: '3000',
    protocol: 'http:',
  },
  writable: true,
})

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Setup DOM environment
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})
