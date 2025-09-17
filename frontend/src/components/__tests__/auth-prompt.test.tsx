import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

// Mock next-auth
vi.mock('next-auth/react', () => ({
  signIn: vi.fn(),
  useSession: () => ({
    data: null,
    status: 'unauthenticated',
  }),
}))

import { AuthPrompt } from '../auth-prompt'

describe('AuthPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders sign in prompt', () => {
    render(<AuthPrompt />)

    expect(screen.getByText('Welcome to Chat Service')).toBeInTheDocument()
    expect(screen.getByText(/Sign in to start chatting/)).toBeInTheDocument()
  })

  it('shows sign in button', () => {
    render(<AuthPrompt />)

    const signInButton = screen.getByRole('button', { name: /sign in/i })
    expect(signInButton).toBeInTheDocument()
  })

  it('displays features list', () => {
    render(<AuthPrompt />)

    expect(screen.getByText('Real-time messaging')).toBeInTheDocument()
    expect(screen.getByText('Create group conversations')).toBeInTheDocument()
    expect(screen.getByText('Share files and images')).toBeInTheDocument()
  })
})
