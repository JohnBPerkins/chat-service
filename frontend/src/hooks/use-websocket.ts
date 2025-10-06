import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useQueryClient } from '@tanstack/react-query'
import { getChatWebSocket } from '@/lib/websocket'
import type {
  MessageAckFrame,
  MessageNewFrame,
  MessageDeletedFrame,
  TypingUpdateEventFrame,
  ReceiptUpdateFrame,
  ParticipantUpdateFrame,
  ConversationUpdateFrame,
  ErrorFrame,
  FriendRequestReceivedFrame,
  FriendRequestAcceptedFrame,
  FriendRequestRejectedFrame,
} from '@/types/chat'

interface UseWebSocketOptions {
  onMessageReceived?: (message: MessageNewFrame) => void
  onMessageAck?: (ack: MessageAckFrame) => void
  onMessageDeleted?: (deletion: MessageDeletedFrame) => void
  onTypingUpdate?: (typing: TypingUpdateEventFrame) => void
  onReceiptUpdate?: (receipt: ReceiptUpdateFrame) => void
  onParticipantUpdate?: (participant: ParticipantUpdateFrame) => void
  onConversationUpdate?: (conversation: ConversationUpdateFrame) => void
  onFriendRequestReceived?: (request: FriendRequestReceivedFrame) => void
  onFriendRequestAccepted?: (acceptance: FriendRequestAcceptedFrame) => void
  onFriendRequestRejected?: (rejection: FriendRequestRejectedFrame) => void
  onError?: (error: ErrorFrame) => void
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const { data: session } = useSession()
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const wsRef = useRef(getChatWebSocket())
  const queryClient = useQueryClient()

  useEffect(() => {
    const ws = wsRef.current

    if (!session?.accessToken) {
      return
    }

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

      options.onMessageReceived?.(data)
    })

    ws.on('message.ack', (data: MessageAckFrame) => {
      console.log('Message acknowledged:', data)
      options.onMessageAck?.(data)
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

      options.onMessageDeleted?.(data)
    })

    ws.on('typing.update', (data: TypingUpdateEventFrame) => {
      console.log('Typing update:', data)
      options.onTypingUpdate?.(data)
    })

    ws.on('receipt.update', (data: ReceiptUpdateFrame) => {
      console.log('Receipt update:', data)
      options.onReceiptUpdate?.(data)
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

      options.onParticipantUpdate?.(data)
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

      options.onConversationUpdate?.(data)
    })

    ws.on('friend.request.received', (data: FriendRequestReceivedFrame) => {
      console.log('Friend request received:', data)

      // Invalidate friend requests query to show new request
      queryClient.invalidateQueries({
        queryKey: ['friend-requests']
      })

      options.onFriendRequestReceived?.(data)
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

      options.onFriendRequestAccepted?.(data)
    })

    ws.on('friend.request.rejected', (data: FriendRequestRejectedFrame) => {
      console.log('Friend request rejected:', data)

      // Invalidate friend requests to remove rejected request
      queryClient.invalidateQueries({
        queryKey: ['friend-requests']
      })

      options.onFriendRequestRejected?.(data)
    })

    ws.on('error', (data: ErrorFrame) => {
      console.error('WebSocket error:', data)
      setConnectionError(data.message)
      options.onError?.(data)
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
      ws.off('message.deleted')
      ws.off('typing.update')
      ws.off('receipt.update')
      ws.off('participant.update')
      ws.off('conversation.update')
      ws.off('friend.request.received')
      ws.off('friend.request.accepted')
      ws.off('friend.request.rejected')
      ws.off('error')
    }
  }, [session?.accessToken, queryClient, options])

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

  return {
    isConnected,
    connectionError,
    subscribe,
    unsubscribe,
    sendMessage,
    updateTyping,
    markAsRead,
    sendFriendRequest,
    respondToFriendRequest,
    webSocket: wsRef.current,
  }
}