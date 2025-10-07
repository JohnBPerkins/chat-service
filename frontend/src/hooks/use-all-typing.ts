import { useState, useEffect, useCallback } from 'react'
import { useWebSocket } from './use-websocket'
import type { TypingUpdateEventFrame } from '@/types/chat'

interface TypingInfo {
  userId: string
  timestamp: number
}

// Track typing indicators across all conversations
export function useAllTyping(typingTimeout = 3000) {
  // Map of conversationId -> Map of userId -> TypingInfo
  const [typingByConversation, setTypingByConversation] = useState<Map<string, Map<string, TypingInfo>>>(new Map())

  const { } = useWebSocket({
    onTypingUpdate: (data: TypingUpdateEventFrame) => {
      setTypingByConversation(prev => {
        const newState = new Map(prev)
        const conversationTypers = new Map(prev.get(data.conversationId) || new Map())

        if (data.isTyping) {
          conversationTypers.set(data.userId, {
            userId: data.userId,
            timestamp: Date.now(),
          })
        } else {
          conversationTypers.delete(data.userId)
        }

        if (conversationTypers.size > 0) {
          newState.set(data.conversationId, conversationTypers)
        } else {
          newState.delete(data.conversationId)
        }

        return newState
      })
    }
  })

  // Clean up old typing indicators
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setTypingByConversation(prev => {
        const newState = new Map<string, Map<string, TypingInfo>>()
        let hasChanges = false

        for (const [conversationId, typers] of prev) {
          const validTypers = new Map<string, TypingInfo>()

          for (const [userId, info] of typers) {
            if (now - info.timestamp < typingTimeout) {
              validTypers.set(userId, info)
            } else {
              hasChanges = true
            }
          }

          if (validTypers.size > 0) {
            newState.set(conversationId, validTypers)
          } else if (prev.has(conversationId)) {
            hasChanges = true
          }
        }

        return hasChanges ? newState : prev
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [typingTimeout])

  const isAnyoneTypingInConversation = useCallback((conversationId: string): boolean => {
    const typers = typingByConversation.get(conversationId)
    return typers ? typers.size > 0 : false
  }, [typingByConversation])

  const getTypingCountInConversation = useCallback((conversationId: string): number => {
    const typers = typingByConversation.get(conversationId)
    return typers ? typers.size : 0
  }, [typingByConversation])

  return {
    isAnyoneTypingInConversation,
    getTypingCountInConversation,
  }
}
