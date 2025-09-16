package middleware

import (
	"net/http"
	"sync"
	"time"
)

// TokenBucket implements a simple token bucket rate limiter
type TokenBucket struct {
	capacity   int
	tokens     int
	refillRate time.Duration
	lastRefill time.Time
	mu         sync.Mutex
}

func NewTokenBucket(capacity int, refillRate time.Duration) *TokenBucket {
	return &TokenBucket{
		capacity:   capacity,
		tokens:     capacity,
		refillRate: refillRate,
		lastRefill: time.Now(),
	}
}

func (tb *TokenBucket) Allow() bool {
	tb.mu.Lock()
	defer tb.mu.Unlock()

	now := time.Now()
	elapsed := now.Sub(tb.lastRefill)

	// Refill tokens based on elapsed time
	tokensToAdd := int(elapsed / tb.refillRate)
	if tokensToAdd > 0 {
		tb.tokens = min(tb.capacity, tb.tokens+tokensToAdd)
		tb.lastRefill = now
	}

	if tb.tokens > 0 {
		tb.tokens--
		return true
	}

	return false
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// RateLimiter manages rate limits per user
type RateLimiter struct {
	buckets map[string]*TokenBucket
	mu      sync.RWMutex
}

func NewRateLimiter() *RateLimiter {
	return &RateLimiter{
		buckets: make(map[string]*TokenBucket),
	}
}

func (rl *RateLimiter) Allow(userID string) bool {
	rl.mu.RLock()
	bucket, exists := rl.buckets[userID]
	rl.mu.RUnlock()

	if !exists {
		rl.mu.Lock()
		// Double-check in case another goroutine created it
		if bucket, exists = rl.buckets[userID]; !exists {
			// 10 messages per 5 seconds
			bucket = NewTokenBucket(10, 500*time.Millisecond)
			rl.buckets[userID] = bucket
		}
		rl.mu.Unlock()
	}

	return bucket.Allow()
}

// MessageRateLimitMiddleware creates a rate limiting middleware for message endpoints
func MessageRateLimitMiddleware(limiter *RateLimiter) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, ok := GetUserIDFromContext(r.Context())
			if !ok {
				http.Error(w, "User ID not found", http.StatusUnauthorized)
				return
			}

			if !limiter.Allow(userID) {
				http.Error(w, "Rate limit exceeded", http.StatusTooManyRequests)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}