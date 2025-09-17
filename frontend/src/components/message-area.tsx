'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { Send, Loader2, Users, Trash2 } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import { v4 as uuidv4 } from 'uuid'
import { useWebSocket } from '@/hooks/use-websocket'
import { useTyping } from '@/hooks/use-typing'
import { useReadReceipts } from '@/hooks/use-read-receipts'
import { usePaginatedMessages } from '@/hooks/use-paginated-messages'
import { useIntersectionObserver } from '@/hooks/use-intersection-observer'
import { TypingIndicator } from './typing-indicator'
import type { Conversation } from '@/types/chat'

interface MessageAreaProps {
  conversation: Conversation
  isConnected: boolean
  onConversationDeleted?: () => void
}

export function MessageArea({ conversation, isConnected, onConversationDeleted }: MessageAreaProps) {
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

  const deleteConversationMutation = useMutation({
    mutationFn: () => apiClient.deleteConversation(conversation.id),
    onMutate: async () => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['conversations'] })

      // Snapshot the previous value
      const previousConversations = queryClient.getQueryData(['conversations'])

      // Optimistically update to the new value
      queryClient.setQueryData(['conversations'], (old: Conversation[] | undefined) => {
        if (Array.isArray(old)) {
          return old.filter(conv => conv.id !== conversation.id)
        }
        return old
      })

      // Immediately clear the selected conversation
      onConversationDeleted?.()

      // Return a context object with the snapshotted value
      return { previousConversations }
    },
    onError: (err, variables, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      queryClient.setQueryData(['conversations'], context?.previousConversations)
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
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

  const handleDeleteConversation = () => {
    if (window.confirm('Are you sure you want to delete this conversation? This action cannot be undone.')) {
      deleteConversationMutation.mutate()
    }
  }

  if (isLoadingInitial) {
    return (
      <div className="h-full bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 flex flex-col shadow-2xl">
        <div className="p-6 border-b border-white/10">
          <div className="animate-pulse">
            <div className="h-6 bg-white/10 rounded w-1/3 mb-2"></div>
            <div className="h-4 bg-white/10 rounded w-1/5"></div>
          </div>
        </div>
        <div className="flex-1 p-6 space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse flex gap-3">
              <div className="w-10 h-10 bg-white/10 rounded-2xl"></div>
              <div className="flex-1">
                <div className="h-4 bg-white/10 rounded mb-2 w-1/4"></div>
                <div className="h-4 bg-white/10 rounded w-3/4"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 flex items-center justify-center shadow-2xl">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-red-400 text-2xl">⚠️</span>
          </div>
          <p className="text-red-300 mb-4">Failed to load messages</p>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['messages', conversation.id, 'paginated'] })}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-all duration-300 hover:scale-105"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 flex flex-col shadow-2xl">
      {/* Header */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
              conversation.kind === 'group'
                ? 'bg-gradient-to-r from-blue-500 to-purple-500'
                : 'bg-white/10'
            }`}>
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">
                {conversation.title ||
                 (conversation.kind === 'group' ? 'Group Chat' : 'Direct Message')}
              </h2>
              <div className="flex items-center gap-2 text-sm text-white/60">
                <span>{conversation.participants?.length || 0} participants</span>
                {!isConnected && (
                  <>
                    <span>•</span>
                    <span className="text-red-400">Offline</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={handleDeleteConversation}
            disabled={deleteConversationMutation.isPending}
            className="p-2 text-white/60 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Delete conversation"
          >
            {deleteConversationMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Trash2 className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Load more trigger */}
        {hasMore && (
          <div ref={targetRef} className="flex justify-center py-4">
            {isLoadingMore ? (
              <div className="flex items-center gap-2 text-white/60">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Loading more messages...</span>
              </div>
            ) : (
              <button
                onClick={loadMoreMessages}
                className="text-sm text-blue-400 hover:text-blue-300 hover:underline"
              >
                Load more messages
              </button>
            )}
          </div>
        )}

        {messages.length === 0 && !isLoadingInitial ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-white/10 rounded-3xl flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">💬</span>
            </div>
            <p className="text-white/70 mb-2">No messages yet</p>
            <p className="text-white/50 text-sm">Send the first message to start the conversation</p>
          </div>
        ) : (
          messages.filter(message => message).map((message) => (
            <div key={message.id} className="flex gap-3 group">
              <img
                src={message.sender?.avatarUrl || '/default-avatar.svg'}
                alt={message.sender?.name || 'User'}
                className="w-10 h-10 rounded-2xl flex-shrink-0"
                onError={(e) => {
                  e.currentTarget.src = '/default-avatar.svg'
                }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-white">
                    {message.sender?.name || 'Unknown User'}
                  </span>
                  <span className="text-xs text-white/50">
                    {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
                  </span>
                </div>
                <div className="bg-white/5 backdrop-blur-sm rounded-2xl rounded-tl-lg p-4 border border-white/10">
                  <p className="text-white/90 whitespace-pre-wrap">{message.body}</p>
                </div>
              </div>
            </div>
          ))
        )}

        {/* Typing Indicator */}
        <TypingIndicator text={typingText} show={isAnyoneTyping} />

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="p-6 border-t border-white/10">
        <form onSubmit={handleSendMessage} className="flex gap-3">
          <div className="flex-1">
            <textarea
              value={messageText}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              onBlur={stopTyping}
              placeholder="Type a message..."
              className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 resize-none transition-all duration-300 focus:outline-none focus:border-blue-400 focus:bg-white/15 focus:shadow-lg focus:scale-[1.02]"
              rows={1}
              style={{ minHeight: '48px', maxHeight: '120px' }}
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
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-xl font-medium transition-all duration-300 hover:shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center gap-2"
          >
            {sendMessageMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </form>
      </div>
    </div>
  )
}