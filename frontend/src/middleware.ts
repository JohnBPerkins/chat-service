import { withAuth } from 'next-auth/middleware'

export default withAuth(
  function middleware(req) {
    // Add any additional middleware logic here
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: '/auth/signin',
    },
  }
)

export const config = {
  matcher: [
    // Only protect specific routes that require authentication
    // The home page (/) should be accessible to show the SPA interface
    '/dashboard/:path*',
    '/settings/:path*',
    '/profile/:path*',
    // Add other protected routes here as needed
  ],
}