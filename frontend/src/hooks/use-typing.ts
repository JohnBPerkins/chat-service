import { useState, useEffect, useRef, useCallback } from 'react'
import { useWebSocket } from './use-websocket'
import type { TypingUpdateEventFrame } from '@/types/chat'

interface TypingUser {
  userId: string
  name: string
  timestamp: number
}

interface UseTypingOptions {
  conversationId: string
  currentUserId: string
  typingTimeout?: number // milliseconds
}

export function useTyping({ conversationId, currentUserId, typingTimeout = 3000 }: UseTypingOptions) {
  const [typingUsers, setTypingUsers] = useState<Map<string, TypingUser>>(new Map())
  const [isTyping, setIsTyping] = useState(false)
  const typingTimeoutRef = useRef<NodeJS.Timeout>()
  const lastTypingTimeRef = useRef<number>(0)

  const { updateTyping } = useWebSocket({
    onTypingUpdate: (data: TypingUpdateEventFrame) => {
      if (data.conversationId !== conversationId || data.userId === currentUserId) {
        return
      }

      setTypingUsers(prev => {
        const newTypingUsers = new Map(prev)

        if (data.isTyping) {
          newTypingUsers.set(data.userId, {
            userId: data.userId,
            name: data.userId, // In real app, we'd get this from user data
            timestamp: Date.now(),
          })
        } else {
          newTypingUsers.delete(data.userId)
        }

        return newTypingUsers
      })
    }
  })

  // Clean up old typing indicators
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setTypingUsers(prev => {
        const newTypingUsers = new Map()

        for (const [userId, user] of prev) {
          if (now - user.timestamp < typingTimeout) {
            newTypingUsers.set(userId, user)
          }
        }

        return newTypingUsers.size !== prev.size ? newTypingUsers : prev
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [typingTimeout])

  const startTyping = useCallback(() => {
    const now = Date.now()

    // Only send typing indicator if we haven't sent one recently
    if (now - lastTypingTimeRef.current > 1000) {
      updateTyping(conversationId, true)
      lastTypingTimeRef.current = now
    }

    setIsTyping(true)

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Set timeout to stop typing
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping()
    }, typingTimeout)
  }, [conversationId, updateTyping, typingTimeout])

  const stopTyping = useCallback(() => {
    if (isTyping) {
      updateTyping(conversationId, false)
      setIsTyping(false)
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = undefined
    }
  }, [conversationId, updateTyping, isTyping])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
      if (isTyping) {
        updateTyping(conversationId, false)
      }
    }
  }, [conversationId, updateTyping, isTyping])

  const getTypingUsers = useCallback(() => {
    return Array.from(typingUsers.values())
  }, [typingUsers])

  const getTypingText = useCallback(() => {
    const users = getTypingUsers()

    if (users.length === 0) {
      return ''
    }

    if (users.length === 1) {
      return `${users[0].name} is typing...`
    }

    if (users.length === 2) {
      return `${users[0].name} and ${users[1].name} are typing...`
    }

    return `${users[0].name} and ${users.length - 1} others are typing...`
  }, [getTypingUsers])

  return {
    typingUsers: getTypingUsers(),
    typingText: getTypingText(),
    isAnyoneTyping: typingUsers.size > 0,
    startTyping,
    stopTyping,
    isTyping,
  }
}