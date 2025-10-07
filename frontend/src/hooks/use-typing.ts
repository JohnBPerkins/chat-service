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
  const updateTypingRef = useRef<((conversationId: string, isTyping: boolean) => void) | null>(null)

  // Helper to get user name from participants
  const getUserName = useCallback((userId: string): string => {
    const participant = participants.find(p => p.userId === userId)
    return participant?.user?.name || participant?.user?.email || 'Someone'
  }, [participants])

  const { updateTyping: updateTypingWs } = useWebSocket({
    onTypingUpdate: (data: TypingUpdateEventFrame) => {
      console.log('📨 Received typing update:', data)

      if (data.conversationId !== conversationId) {
        console.log('⚠️ Different conversation, ignoring')
        return
      }

      if (data.userId === currentUserId) {
        console.log('⚠️ Own typing event, ignoring')
        return
      }

      setTypingUsers(prev => {
        const newTypingUsers = new Map(prev)

        if (data.isTyping) {
          console.log('👤 User started typing:', getUserName(data.userId))
          newTypingUsers.set(data.userId, {
            userId: data.userId,
            name: getUserName(data.userId),
            timestamp: Date.now(),
          })
        } else {
          console.log('👤 User stopped typing:', getUserName(data.userId))
          newTypingUsers.delete(data.userId)
        }

        console.log('Current typing users:', Array.from(newTypingUsers.values()))
        return newTypingUsers
      })
    }
  })

  // Store updateTyping in ref so callbacks don't recreate
  updateTypingRef.current = updateTypingWs

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
      console.log('🟢 Sending typing: true')
      updateTypingRef.current?.(conversationId, true)
      isTypingRef.current = true
      setIsTyping(true)
    } else {
      console.log('⚪ Already typing, just resetting timeout')
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Set timeout to stop typing after inactivity
    typingTimeoutRef.current = setTimeout(() => {
      console.log('⏱️ Typing timeout fired after inactivity')
      // Call stopTyping inline to avoid closure issues
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
        typingTimeoutRef.current = undefined
      }
      if (isTypingRef.current) {
        console.log('🔴 Sending typing: false (from timeout)')
        updateTypingRef.current?.(conversationId, false)
        isTypingRef.current = false
        setIsTyping(false)
      }
    }, typingTimeout)
  }, [conversationId, typingTimeout])

  const stopTyping = useCallback(() => {
    console.log('🔴 stopTyping called, isTypingRef.current:', isTypingRef.current)

    // Always clear timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = undefined
    }

    // Only send false if we're currently typing
    if (isTypingRef.current) {
      console.log('🔴 Sending typing: false (from stopTyping)')
      updateTypingRef.current?.(conversationId, false)
      isTypingRef.current = false
      setIsTyping(false)
    } else {
      console.log('⚪ Already stopped, not sending false')
    }
  }, [conversationId])

  // Cleanup on unmount or conversation change
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
        typingTimeoutRef.current = undefined
      }
      // Send false typing indicator on unmount if we were typing
      if (isTypingRef.current) {
        updateTypingRef.current?.(conversationId, false)
        isTypingRef.current = false
      }
    }
  }, [conversationId])

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

  const typingText = getTypingText()
  const isAnyoneTyping = typingUsers.size > 0

  // Debug logging for rendering
  console.log('🎨 Typing render state:', {
    typingUsersCount: typingUsers.size,
    isAnyoneTyping,
    typingText,
    typingUsers: Array.from(typingUsers.values())
  })

  return {
    typingUsers: getTypingUsers(),
    typingText,
    isAnyoneTyping,
    startTyping,
    stopTyping,
    isTyping,
  }
}