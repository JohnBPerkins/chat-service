import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useQueryClient } from '@tanstack/react-query'
import { getChatWebSocket } from '@/lib/websocket'
import type {
  MessageAckFrame,
  MessageNewFrame,
  TypingUpdateEventFrame,
  ReceiptUpdateFrame,
  ErrorFrame,
} from '@/types/chat'

interface UseWebSocketOptions {
  onMessageReceived?: (message: MessageNewFrame) => void
  onMessageAck?: (ack: MessageAckFrame) => void
  onTypingUpdate?: (typing: TypingUpdateEventFrame) => void
  onReceiptUpdate?: (receipt: ReceiptUpdateFrame) => void
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

    ws.on('typing.update', (data: TypingUpdateEventFrame) => {
      console.log('Typing update:', data)
      options.onTypingUpdate?.(data)
    })

    ws.on('receipt.update', (data: ReceiptUpdateFrame) => {
      console.log('Receipt update:', data)
      options.onReceiptUpdate?.(data)
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
      ws.off('typing.update')
      ws.off('receipt.update')
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

  return {
    isConnected,
    connectionError,
    subscribe,
    unsubscribe,
    sendMessage,
    updateTyping,
    markAsRead,
    webSocket: wsRef.current,
  }
}