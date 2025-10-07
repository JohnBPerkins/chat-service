import { useState, useEffect, useRef, useCallback } from 'react'
import { useWebSocket } from './use-websocket'
import type { TypingUpdateEventFrame, Participant } from '@/types/chat'

interface TypingUser {
  userId: string
  name: string
  timestamp: number
}

interface UseTypingOptions {
  conversationId: string
  currentUserId: string
  participants?: Participant[]
  typingTimeout?: number // milliseconds
}

export function useTyping({ conversationId, currentUserId, participants = [], typingTimeout = 3000 }: UseTypingOptions) {
  const [typingUsers, setTypingUsers] = useState<Map<string, TypingUser>>(new Map())
  const [isTyping, setIsTyping] = useState(false)
  const typingTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const lastTypingTimeRef = useRef<number>(0)
  const isTypingRef = useRef(false)

  // Helper to get user name from participants
  const getUserName = useCallback((userId: string): string => {
    const participant = participants.find(p => p.userId === userId)
    return participant?.user?.name || participant?.user?.email || 'Someone'
  }, [participants])

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
            name: getUserName(data.userId),
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
    // If not currently typing, send the initial true
    if (!isTypingRef.current) {
      updateTyping(conversationId, true)
      isTypingRef.current = true
      setIsTyping(true)
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Set timeout to stop typing after inactivity
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping()
    }, typingTimeout)
  }, [conversationId, updateTyping, typingTimeout])

  const stopTyping = useCallback(() => {
    // Always clear timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = undefined
    }

    // Only send false if we're currently typing
    if (isTypingRef.current) {
      updateTyping(conversationId, false)
      isTypingRef.current = false
      setIsTyping(false)
    }
  }, [conversationId, updateTyping])

  // Cleanup on unmount or conversation change
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
        typingTimeoutRef.current = undefined
      }
      // Send false typing indicator on unmount if we were typing
      if (isTypingRef.current) {
        updateTyping(conversationId, false)
        isTypingRef.current = false
      }
    }
  }, [conversationId, updateTyping])

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