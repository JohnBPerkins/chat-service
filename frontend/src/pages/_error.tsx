import * as React from 'react'
import { NextPageContext } from 'next'
import { AppProps } from 'next/app'
import Link from 'next/link'

interface ErrorProps {
  statusCode?: number
  hasGetInitialPropsRun?: boolean
  err?: Error & { statusCode?: number }
}

function Error({ statusCode, hasGetInitialPropsRun, err }: ErrorProps) {
  if (!hasGetInitialPropsRun && err) {
    // getInitialProps was not able to run - log the error
    console.error(err)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #3730a3 100%)',
      color: 'white',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{
        textAlign: 'center',
        padding: '2rem',
        maxWidth: '28rem'
      }}>
        <h1 style={{
          fontSize: '6rem',
          fontWeight: 'bold',
          opacity: 0.2,
          margin: 0
        }}>
          {statusCode || 'Error'}
        </h1>
        <h2 style={{
          fontSize: '2rem',
          fontWeight: 'bold',
          margin: '1rem 0'
        }}>
          {statusCode === 404 ? 'Page Not Found' : 'Something went wrong'}
        </h2>
        <p style={{
          fontSize: '1.1rem',
          opacity: 0.8,
          margin: '1rem 0 2rem'
        }}>
          {statusCode === 404
            ? "The page you're looking for doesn't exist."
            : 'An error occurred while loading this page.'
          }
        </p>
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.5rem',
            backgroundColor: '#2563eb',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '0.5rem',
            transition: 'background-color 0.2s'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1d4ed8'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
        >
          ← Go Home
        </Link>
      </div>
    </div>
  )
}

Error.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404
  return { statusCode }
}

export default Error