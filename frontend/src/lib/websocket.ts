import { getSession } from 'next-auth/react'
import type {
  WSFrame,
  AuthFrame,
  SubscribeFrame,
  UnsubscribeFrame,
  MessageSendFrame,
  TypingUpdateFrame,
  ReceiptReadFrame,
  MessageAckFrame,
  MessageNewFrame,
  TypingUpdateEventFrame,
  ReceiptUpdateFrame,
  ErrorFrame,
} from '@/types/chat'

type EventHandler<T = any> = (data: T) => void

interface WebSocketEventHandlers {
  'message.ack': EventHandler<MessageAckFrame>
  'message.new': EventHandler<MessageNewFrame>
  'typing.update': EventHandler<TypingUpdateEventFrame>
  'receipt.update': EventHandler<ReceiptUpdateFrame>
  'error': EventHandler<ErrorFrame>
  'open': EventHandler<void>
  'close': EventHandler<void>
  'reconnect': EventHandler<void>
}

export class ChatWebSocket {
  private ws: WebSocket | null = null
  private eventHandlers: Partial<WebSocketEventHandlers> = {}
  private subscriptions = new Set<string>()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private isAuthenticated = false
  private pendingSubscriptions: string[] = []

  constructor(private wsUrl: string = process.env.NEXT_PUBLIC_WS_BASE_URL || 'ws://localhost:8080') {}

  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    const session = await getSession()
    if (!session?.accessToken) {
      throw new Error('No authentication token available')
    }

    try {
      // Use subprotocol for JWT authentication
      this.ws = new WebSocket(`${this.wsUrl}/ws`, [`bearer`, session.accessToken])

      this.ws.onopen = () => {
        console.log('WebSocket connected')
        this.isAuthenticated = true
        this.reconnectAttempts = 0
        this.eventHandlers.open?.()

        // Resubscribe to conversations after reconnection
        this.pendingSubscriptions.forEach(conversationId => {
          this.subscribe(conversationId)
        })
        this.pendingSubscriptions = []
      }

      this.ws.onmessage = (event) => {
        try {
          const frame: WSFrame = JSON.parse(event.data)
          this.handleMessage(frame)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }

      this.ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason)
        this.isAuthenticated = false
        this.eventHandlers.close?.()

        // Attempt to reconnect unless it was a clean close
        if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnect()
        }
      }

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }

    } catch (error) {
      console.error('Failed to connect WebSocket:', error)
      throw error
    }
  }

  private async attemptReconnect(): Promise<void> {
    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)

    console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`)

    setTimeout(() => {
      // Store current subscriptions for resubscription
      this.pendingSubscriptions = Array.from(this.subscriptions)
      this.connect().then(() => {
        this.eventHandlers.reconnect?.()
      }).catch((error) => {
        console.error('Reconnection failed:', error)
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnect()
        }
      })
    }, delay)
  }

  private handleMessage(frame: WSFrame): void {
    const handler = this.eventHandlers[frame.type as keyof WebSocketEventHandlers]
    if (handler) {
      handler(frame.data)
    } else {
      console.warn('Unhandled WebSocket message type:', frame.type)
    }
  }

  private sendFrame<T>(type: string, data: T): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected, cannot send frame:', type)
      return
    }

    const frame: WSFrame<T> = {
      type,
      ts: Date.now(),
      data,
    }

    this.ws.send(JSON.stringify(frame))
  }

  // Event handling
  on<K extends keyof WebSocketEventHandlers>(
    event: K,
    handler: WebSocketEventHandlers[K]
  ): void {
    this.eventHandlers[event] = handler
  }

  off<K extends keyof WebSocketEventHandlers>(event: K): void {
    delete this.eventHandlers[event]
  }

  // Conversation management
  subscribe(conversationId: string): void {
    if (!this.isAuthenticated) {
      this.pendingSubscriptions.push(conversationId)
      return
    }

    if (this.subscriptions.has(conversationId)) {
      return
    }

    this.subscriptions.add(conversationId)
    this.sendFrame<SubscribeFrame>('subscribe', { conversationId })
  }

  unsubscribe(conversationId: string): void {
    if (!this.subscriptions.has(conversationId)) {
      return
    }

    this.subscriptions.delete(conversationId)
    this.sendFrame<UnsubscribeFrame>('unsubscribe', { conversationId })
  }

  // Message operations
  sendMessage(conversationId: string, clientMsgId: string, body: string): void {
    this.sendFrame<MessageSendFrame>('message.send', {
      conversationId,
      clientMsgId,
      body,
    })
  }

  // Typing indicators
  updateTyping(conversationId: string, isTyping: boolean): void {
    this.sendFrame<TypingUpdateFrame>('typing.update', {
      conversationId,
      isTyping,
    })
  }

  // Read receipts
  markAsRead(conversationId: string, messageId: number): void {
    this.sendFrame<ReceiptReadFrame>('receipt.read', {
      conversationId,
      messageId,
    })
  }

  // Connection management
  disconnect(): void {
    this.subscriptions.clear()
    this.pendingSubscriptions = []

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.isAuthenticated
  }

  getSubscriptions(): Set<string> {
    return new Set(this.subscriptions)
  }
}

// Global WebSocket instance
let chatWebSocket: ChatWebSocket | null = null

export function getChatWebSocket(): ChatWebSocket {
  if (!chatWebSocket) {
    chatWebSocket = new ChatWebSocket()
  }
  return chatWebSocket
}