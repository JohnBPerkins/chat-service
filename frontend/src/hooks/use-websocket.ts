import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useQueryClient } from '@tanstack/react-query'
import { getChatWebSocket } from '@/lib/websocket'
import type {
  MessageAckFrame,
  MessageNewFrame,
  MessageEditedFrame,
  MessageDeletedFrame,
  TypingUpdateEventFrame,
  ReceiptUpdateFrame,
  ParticipantUpdateFrame,
  ConversationUpdateFrame,
  ErrorFrame,
  FriendRequestReceivedFrame,
  FriendRequestAcceptedFrame,
  FriendRequestRejectedFrame,
  FriendRemovedFrame,
  ConversationAddedFrame,
  ConversationRemovedFrame,
} from '@/types/chat'

interface UseWebSocketOptions {
  onMessageReceived?: (message: MessageNewFrame) => void
  onMessageAck?: (ack: MessageAckFrame) => void
  onMessageEdited?: (edit: MessageEditedFrame) => void
  onMessageDeleted?: (deletion: MessageDeletedFrame) => void
  onTypingUpdate?: (typing: TypingUpdateEventFrame) => void
  onReceiptUpdate?: (receipt: ReceiptUpdateFrame) => void
  onParticipantUpdate?: (participant: ParticipantUpdateFrame) => void
  onConversationUpdate?: (conversation: ConversationUpdateFrame) => void
  onFriendRequestReceived?: (request: FriendRequestReceivedFrame) => void
  onFriendRequestAccepted?: (acceptance: FriendRequestAcceptedFrame) => void
  onFriendRequestRejected?: (rejection: FriendRequestRejectedFrame) => void
  onFriendRemoved?: (removal: FriendRemovedFrame) => void
  onConversationAdded?: (addition: ConversationAddedFrame) => void
  onConversationRemoved?: (removal: ConversationRemovedFrame) => void
  onError?: (error: ErrorFrame) => void
}

// Global ref shared across ALL useWebSocket calls to accumulate callbacks
const globalOptionsRef: { current: UseWebSocketOptions } = { current: {} }

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { data: session } = useSession()
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const wsRef = useRef(getChatWebSocket())
  const queryClient = useQueryClient()

  // IMPORTANT: Merge new callbacks into the GLOBAL ref (shared across all calls)
  globalOptionsRef.current = {
    ...globalOptionsRef.current,
    ...options,
  }

  console.log('🔄 useWebSocket render, options:', {
    hasOnTypingUpdate: !!options.onTypingUpdate,
    globalRefHasIt: !!globalOptionsRef.current.onTypingUpdate
  })

  useEffect(() => {
    const ws = wsRef.current

    if (!session?.accessToken) {
      return
    }

    console.log('🔄 useWebSocket effect running, globalOptionsRef.current:', {
      hasOnTypingUpdate: !!globalOptionsRef.current.onTypingUpdate
    })

    // Set up event handlers
    ws.on('open', () => {
      console.log('WebSocket connection established')
      setIsConnected(true)
      setConnectionError(null)
    })

    ws.on('close', () => {
      console.log('WebSocket connection closed')
      setIsConnected(false)
    })

    ws.on('reconnect', () => {
      console.log('WebSocket reconnected')
      setIsConnected(true)
      setConnectionError(null)
      // Refresh conversations and messages after reconnection
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    })

    ws.on('message.new', (data: MessageNewFrame) => {
      console.log('New message received:', data)

      // Invalidate and refetch messages for the conversation
      queryClient.invalidateQueries({
        queryKey: ['messages', data.conversationId]
      })

      // Update conversation list (for last message)
      queryClient.invalidateQueries({
        queryKey: ['conversations']
      })

      globalOptionsRef.current.onMessageReceived?.(data)
    })

    ws.on('message.ack', (data: MessageAckFrame) => {
      console.log('Message acknowledged:', data)
      globalOptionsRef.current.onMessageAck?.(data)
    })

    ws.on('message.edited', (data: MessageEditedFrame) => {
      console.log('Message edited:', data)

      // Invalidate and refetch messages for the conversation
      queryClient.invalidateQueries({
        queryKey: ['messages', data.conversationId]
      })

      globalOptionsRef.current.onMessageEdited?.(data)
    })

    ws.on('message.deleted', (data: MessageDeletedFrame) => {
      console.log('Message deleted:', data)

      // Invalidate and refetch messages for the conversation to remove the deleted message
      queryClient.invalidateQueries({
        queryKey: ['messages', data.conversationId]
      })

      // Update conversation list (may affect last message)
      queryClient.invalidateQueries({
        queryKey: ['conversations']
      })

      globalOptionsRef.current.onMessageDeleted?.(data)
    })

    ws.on('typing.update', (data: TypingUpdateEventFrame) => {
      console.log('Typing update:', data)
      console.log('🔍 globalOptionsRef.current.onTypingUpdate exists?', !!globalOptionsRef.current.onTypingUpdate)
      console.log('🔍 globalOptionsRef.current:', globalOptionsRef.current)
      globalOptionsRef.current.onTypingUpdate?.(data)
      console.log('🔍 Called onTypingUpdate callback')
    })

    ws.on('receipt.update', (data: ReceiptUpdateFrame) => {
      console.log('Receipt update:', data)
      globalOptionsRef.current.onReceiptUpdate?.(data)
    })

    ws.on('participant.update', (data: ParticipantUpdateFrame) => {
      console.log('Participant update:', data)

      // Invalidate conversations list to update participant counts and info
      queryClient.invalidateQueries({
        queryKey: ['conversations']
      })

      // Invalidate conversation participants
      queryClient.invalidateQueries({
        queryKey: ['participants', data.conversationId]
      })

      globalOptionsRef.current.onParticipantUpdate?.(data)
    })

    ws.on('conversation.update', (data: ConversationUpdateFrame) => {
      console.log('Conversation update:', data)

      // Update conversations query cache directly
      queryClient.setQueryData(['conversations'], (oldData: any) => {
        if (!oldData) return oldData

        return oldData.map((conversation: any) => {
          if (conversation.id === data.conversationId) {
            return {
              ...conversation,
              title: data.title !== undefined ? data.title : conversation.title,
            }
          }
          return conversation
        })
      })

      // Also invalidate to ensure consistency
      queryClient.invalidateQueries({
        queryKey: ['conversations']
      })

      globalOptionsRef.current.onConversationUpdate?.(data)
    })

    ws.on('friend.request.received', (data: FriendRequestReceivedFrame) => {
      console.log('Friend request received:', data)

      // Invalidate friend requests query to show new request
      queryClient.invalidateQueries({
        queryKey: ['friend-requests']
      })

      globalOptionsRef.current.onFriendRequestReceived?.(data)
    })

    ws.on('friend.request.accepted', (data: FriendRequestAcceptedFrame) => {
      console.log('Friend request accepted:', data)

      // Invalidate friends and conversations lists
      queryClient.invalidateQueries({
        queryKey: ['friends']
      })
      queryClient.invalidateQueries({
        queryKey: ['conversations']
      })
      queryClient.invalidateQueries({
        queryKey: ['friend-requests']
      })

      globalOptionsRef.current.onFriendRequestAccepted?.(data)
    })

    ws.on('friend.request.rejected', (data: FriendRequestRejectedFrame) => {
      console.log('Friend request rejected:', data)

      // Invalidate friend requests to remove rejected request
      queryClient.invalidateQueries({
        queryKey: ['friend-requests']
      })

      globalOptionsRef.current.onFriendRequestRejected?.(data)
    })

    ws.on('friend.removed', (data: FriendRemovedFrame) => {
      console.log('Friend removed:', data)

      // Invalidate friends list and conversations
      queryClient.invalidateQueries({
        queryKey: ['friends']
      })
      queryClient.invalidateQueries({
        queryKey: ['conversations']
      })

      globalOptionsRef.current.onFriendRemoved?.(data)
    })

    ws.on('conversation.added', (data: ConversationAddedFrame) => {
      console.log('Conversation added:', data)

      // Invalidate conversations list to show new conversation
      queryClient.invalidateQueries({
        queryKey: ['conversations']
      })

      globalOptionsRef.current.onConversationAdded?.(data)
    })

    ws.on('conversation.removed', (data: ConversationRemovedFrame) => {
      console.log('Conversation removed:', data)

      // Invalidate conversations list to remove conversation
      queryClient.invalidateQueries({
        queryKey: ['conversations']
      })

      // Invalidate messages for this conversation
      queryClient.invalidateQueries({
        queryKey: ['messages', data.conversationId]
      })

      globalOptionsRef.current.onConversationRemoved?.(data)
    })

    ws.on('error', (data: ErrorFrame) => {
      console.error('WebSocket error:', data)
      setConnectionError(data.message)
      globalOptionsRef.current.onError?.(data)
    })

    // Connect to WebSocket
    ws.connect().catch((error) => {
      console.error('Failed to connect to WebSocket:', error)
      setConnectionError(error.message)
    })

    // Cleanup on unmount
    return () => {
      ws.off('open')
      ws.off('close')
      ws.off('reconnect')
      ws.off('message.new')
      ws.off('message.ack')
      ws.off('message.edited')
      ws.off('message.deleted')
      ws.off('typing.update')
      ws.off('receipt.update')
      ws.off('participant.update')
      ws.off('conversation.update')
      ws.off('friend.request.received')
      ws.off('friend.request.accepted')
      ws.off('friend.request.rejected')
      ws.off('friend.removed')
      ws.off('conversation.added')
      ws.off('conversation.removed')
      ws.off('error')
    }
  }, [session?.accessToken, queryClient])

  // Disconnect when session ends
  useEffect(() => {
    const ws = wsRef.current

    if (!session) {
      ws.disconnect()
      setIsConnected(false)
    }
  }, [session])

  const subscribe = (conversationId: string) => {
    wsRef.current.subscribe(conversationId)
  }

  const unsubscribe = (conversationId: string) => {
    wsRef.current.unsubscribe(conversationId)
  }

  const sendMessage = (conversationId: string, clientMsgId: string, body: string) => {
    wsRef.current.sendMessage(conversationId, clientMsgId, body)
  }

  const updateTyping = (conversationId: string, isTyping: boolean) => {
    wsRef.current.updateTyping(conversationId, isTyping)
  }

  const markAsRead = (conversationId: string, messageId: number) => {
    wsRef.current.markAsRead(conversationId, messageId)
  }

  const sendFriendRequest = (toUserEmail: string) => {
    wsRef.current.sendFriendRequest(toUserEmail)
  }

  const respondToFriendRequest = (requestId: string, accept: boolean) => {
    wsRef.current.respondToFriendRequest(requestId, accept)
  }

  const removeFriend = (friendId: string) => {
    wsRef.current.removeFriend(friendId)
  }

  const editMessage = (conversationId: string, messageId: number, body: string) => {
    wsRef.current.editMessage(conversationId, messageId, body)
  }

  return {
    isConnected,
    connectionError,
    subscribe,
    unsubscribe,
    sendMessage,
    editMessage,
    updateTyping,
    markAsRead,
    sendFriendRequest,
    respondToFriendRequest,
    removeFriend,
    webSocket: wsRef.current,
  }
}