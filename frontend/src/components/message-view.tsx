'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { Send, MoreVertical, Loader2 } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import { v4 as uuidv4 } from 'uuid'
import { useWebSocket } from '@/hooks/use-websocket'
import { useTyping } from '@/hooks/use-typing'
import { useReadReceipts } from '@/hooks/use-read-receipts'
import { usePaginatedMessages } from '@/hooks/use-paginated-messages'
import { useIntersectionObserver } from '@/hooks/use-intersection-observer'
import { TypingIndicator } from './typing-indicator'
import type { Conversation, Message } from '@/types/chat'

interface MessageViewProps {
  conversation: Conversation
}

export function MessageView({ conversation }: MessageViewProps) {
  const { data: session } = useSession()
  const [messageText, setMessageText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const { subscribe, unsubscribe, sendMessage } = useWebSocket()

  const {
    typingText,
    isAnyoneTyping,
    startTyping,
    stopTyping
  } = useTyping({
    conversationId: conversation.id,
    currentUserId: session?.user.id || '',
  })

  // Use paginated messages with infinite scrolling
  const {
    messages,
    hasMore,
    isLoadingInitial,
    isLoadingMore,
    loadMoreMessages,
    error,
  } = usePaginatedMessages({
    conversationId: conversation.id,
    pageSize: 50,
  })

  // Handle read receipts
  useReadReceipts({
    conversationId: conversation.id,
    messages,
    currentUserId: session?.user.id || '',
  })

  // Intersection observer for loading more messages
  const { targetRef } = useIntersectionObserver(
    useCallback(() => {
      if (hasMore && !isLoadingMore) {
        loadMoreMessages()
      }
    }, [hasMore, isLoadingMore, loadMoreMessages]),
    {
      enabled: hasMore && !isLoadingMore,
      threshold: 0.1,
      rootMargin: '100px',
    }
  )

  const sendMessageMutation = useMutation({
    mutationFn: apiClient.sendMessage,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', conversation.id, 'paginated'] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      setMessageText('')
      stopTyping()
    },
  })

  // Subscribe to conversation on mount
  useEffect(() => {
    subscribe(conversation.id)
    return () => {
      unsubscribe(conversation.id)
      stopTyping()
    }
  }, [conversation.id, subscribe, unsubscribe, stopTyping])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages.length])

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()

    if (!messageText.trim() || !session?.user.id) return

    const clientMsgId = uuidv4()
    const body = messageText.trim()

    // Try WebSocket first, fallback to HTTP
    try {
      sendMessage(conversation.id, clientMsgId, body)
      setMessageText('')
      stopTyping()
    } catch (error) {
      // Fallback to HTTP API
      sendMessageMutation.mutate({
        conversationId: conversation.id,
        clientMsgId,
        body,
      })
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageText(e.target.value)

    if (e.target.value.trim()) {
      startTyping()
    } else {
      stopTyping()
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage(e)
    }
  }

  if (isLoadingInitial) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          </div>
        </div>
        <div className="flex-1 p-4 space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse flex gap-3">
              <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded mb-2 w-1/4"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-600">Failed to load messages</p>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['messages', conversation.id, 'paginated'] })}
            className="mt-2 text-sm text-blue-600 hover:text-blue-700"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  // messages variable is already defined from usePaginatedMessages

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {conversation.title ||
               (conversation.kind === 'group' ? 'Group Chat' : 'Direct Message')}
            </h2>
            <p className="text-sm text-gray-500">
              {conversation.participants?.length || 0} participants
            </p>
          </div>
          <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Load more trigger (at the top for reverse chronological loading) */}
        {hasMore && (
          <div ref={targetRef} className="flex justify-center py-4">
            {isLoadingMore ? (
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading more messages...</span>
              </div>
            ) : (
              <button
                onClick={loadMoreMessages}
                className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
              >
                Load more messages
              </button>
            )}
          </div>
        )}

        {messages.length === 0 && !isLoadingInitial ? (
          <div className="text-center text-gray-500 py-8">
            <p>No messages yet</p>
            <p className="text-sm">Send the first message to start the conversation</p>
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className="flex gap-3">
              <img
                src={message.sender?.avatarUrl || '/default-avatar.svg'}
                alt={message.sender?.name || 'User'}
                className="w-8 h-8 rounded-full flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-gray-900">
                    {message.sender?.name || 'Unknown User'}
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{message.body}</p>
              </div>
            </div>
          ))
        )}

        {/* Typing Indicator */}
        <TypingIndicator text={typingText} show={isAnyoneTyping} />

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="p-4 border-t border-gray-200 bg-white">
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <div className="flex-1">
            <textarea
              value={messageText}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              onBlur={stopTyping}
              placeholder="Type a message..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows={1}
              style={{ minHeight: '40px', maxHeight: '120px' }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement
                target.style.height = 'auto'
                target.style.height = target.scrollHeight + 'px'
              }}
            />
          </div>
          <button
            type="submit"
            disabled={!messageText.trim() || sendMessageMutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  )
}