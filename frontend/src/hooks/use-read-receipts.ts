import { useEffect, useRef } from 'react'
import { useWebSocket } from './use-websocket'
import type { Message } from '@/types/chat'

interface UseReadReceiptsOptions {
  conversationId: string
  messages: Message[]
  currentUserId: string
}

export function useReadReceipts({ conversationId, messages, currentUserId }: UseReadReceiptsOptions) {
  const { markAsRead } = useWebSocket()
  const lastReadMessageRef = useRef<number | null>(null)

  useEffect(() => {
    if (!messages.length) return

    // Find the last message from another user
    const lastMessage = messages
      .filter(msg => msg.senderId !== currentUserId)
      .sort((a, b) => b.id - a.id)[0]

    if (lastMessage && lastMessage.id !== lastReadMessageRef.current) {
      // Mark message as read
      markAsRead(conversationId, lastMessage.id)
      lastReadMessageRef.current = lastMessage.id
    }
  }, [conversationId, messages, currentUserId, markAsRead])

  return {
    // Could add more read receipt functionality here
    // like tracking which users have read which messages
  }
}