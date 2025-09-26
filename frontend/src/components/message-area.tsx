'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { Send, Loader2, Users, Trash2, Settings, X } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { formatRelativeTime } from '@/utils/time'
import { v4 as uuidv4 } from 'uuid'
import { useWebSocket } from '@/hooks/use-websocket'
import { useTyping } from '@/hooks/use-typing'
import { useReadReceipts } from '@/hooks/use-read-receipts'
import { usePaginatedMessages } from '@/hooks/use-paginated-messages'
import { useIntersectionObserver } from '@/hooks/use-intersection-observer'
import { TypingIndicator } from './typing-indicator'
import { ConversationSettingsModal } from './conversation-settings-modal'
import type { Conversation } from '@/types/chat'

interface MessageAreaProps {
  conversation: Conversation
  isConnected: boolean
  onConversationDeleted?: () => void
  onConversationUpdated?: (conversation: Conversation) => void
}

export function MessageArea({
  conversation,
  isConnected,
  onConversationDeleted,
  onConversationUpdated,
}: MessageAreaProps) {
  const { data: session } = useSession()
  const [messageText, setMessageText] = useState('')
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  const { subscribe, unsubscribe, sendMessage } = useWebSocket()

  const { typingText, isAnyoneTyping, startTyping, stopTyping } = useTyping({
    conversationId: conversation.id,
    currentUserId: session?.user.id || '',
  })

  // Use paginated messages with infinite scrolling
  const { messages, hasMore, isLoadingInitial, isLoadingMore, loadMoreMessages, error } =
    usePaginatedMessages({
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

  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: number) => {
      console.log('Calling deleteMessage API with ID:', messageId)
      const result = await apiClient.deleteMessage(messageId)
      console.log('Delete API result:', result)
      return result
    },
    onMutate: async (messageId: number) => {
      console.log('onMutate called for messageId:', messageId)
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['messages', conversation.id, 'paginated'] })

      // Snapshot the previous value
      const previousMessages = queryClient.getQueryData(['messages', conversation.id, 'paginated'])

      // Optimistically update to remove the message
      queryClient.setQueryData(['messages', conversation.id, 'paginated'], (old: any) => {
        if (!old?.pages) return old

        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            messages: page.messages.filter((msg: any) => msg.id !== messageId)
          }))
        }
      })

      // Return a context object with the snapshotted value
      return { previousMessages }
    },
    onError: (err, messageId, context) => {
      console.error('Delete message error:', err)
      // If the mutation fails, use the context to roll back
      queryClient.setQueryData(['messages', conversation.id, 'paginated'], context?.previousMessages)
    },
    onSuccess: (data, messageId) => {
      console.log('Delete message success:', { data, messageId })
    },
    onSettled: () => {
      console.log('Delete message settled')
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: ['messages', conversation.id, 'paginated'] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
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
    } catch {
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
    if (
      window.confirm(
        'Are you sure you want to delete this conversation? This action cannot be undone.'
      )
    ) {
      deleteConversationMutation.mutate()
    }
  }

  const handleDeleteMessage = (messageId: number) => {
    console.log('Delete message clicked:', messageId)
    console.log('Current user email:', session?.user?.email)
    if (window.confirm('Are you sure you want to delete this message?')) {
      console.log('User confirmed deletion, calling mutation...')
      deleteMessageMutation.mutate(messageId)
    }
  }

  if (isLoadingInitial) {
    return (
      <div className="flex h-full flex-col rounded-2xl border border-white/20 bg-white/10 shadow-2xl backdrop-blur-xl">
        <div className="border-b border-white/10 p-6">
          <div className="animate-pulse">
            <div className="mb-2 h-6 w-1/3 rounded bg-white/10"></div>
            <div className="h-4 w-1/5 rounded bg-white/10"></div>
          </div>
        </div>
        <div className="flex-1 space-y-4 p-6">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex animate-pulse gap-3">
              <div className="h-10 w-10 rounded-2xl bg-white/10"></div>
              <div className="flex-1">
                <div className="mb-2 h-4 w-1/4 rounded bg-white/10"></div>
                <div className="h-4 w-3/4 rounded bg-white/10"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-white/20 bg-white/10 shadow-2xl backdrop-blur-xl">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/20">
            <span className="text-2xl text-red-400">⚠️</span>
          </div>
          <p className="mb-4 text-red-300">Failed to load messages</p>
          <button
            onClick={() =>
              queryClient.invalidateQueries({
                queryKey: ['messages', conversation.id, 'paginated'],
              })
            }
            className="rounded-xl bg-blue-500 px-6 py-3 text-white transition-all duration-300 hover:scale-105 hover:bg-blue-600"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/20 bg-white/10 shadow-2xl backdrop-blur-xl">
      {/* Header */}
      <div className="border-b border-white/10 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
                conversation.kind === 'group'
                  ? 'bg-gradient-to-r from-blue-500 to-purple-500'
                  : 'bg-white/10'
              }`}
            >
              <Users className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">
                {conversation.title ||
                  (conversation.kind === 'group' ? 'Group Chat' : 'Direct Message')}
              </h2>
              <div className="flex items-center gap-2 text-sm text-white/60">
                <span>{conversation.participants?.length || 0} participants</span>
                {session?.accessToken && !isConnected && (
                  <>
                    <span>•</span>
                    <span className="text-red-400">Offline</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="rounded-xl p-2 text-white/60 transition-all duration-300 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              title="Conversation Settings"
            >
              <Settings className="h-5 w-5" />
            </button>
            <button
              onClick={handleDeleteConversation}
              disabled={deleteConversationMutation.isPending}
              className="rounded-xl p-2 text-white/60 transition-all duration-300 hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
              title="Delete conversation"
            >
              {deleteConversationMutation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Trash2 className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {/* Load more trigger */}
        {hasMore && (
          <div ref={targetRef} className="flex justify-center py-4">
            {isLoadingMore ? (
              <div className="flex items-center gap-2 text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" />
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
          <div className="py-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/10">
              <span className="text-2xl">💬</span>
            </div>
            <p className="mb-2 text-white/70">No messages yet</p>
            <p className="text-sm text-white/50">
              Send the first message to start the conversation
            </p>
          </div>
        ) : (
          (() => {
            const filteredMessages = messages.filter(m => m)
            const messageGroups: Array<{
              sender: any
              messages: any[]
              firstMessageTime: string
            }> = []

            // Group consecutive messages by sender
            filteredMessages.forEach((message, index) => {
              const previousMessage = index > 0 ? filteredMessages[index - 1] : null
              const isNewGroup = !previousMessage || previousMessage.sender?.id !== message.sender?.id

              if (isNewGroup) {
                messageGroups.push({
                  sender: message.sender,
                  messages: [message],
                  firstMessageTime: message.createdAt
                })
              } else {
                messageGroups[messageGroups.length - 1].messages.push(message)
              }
            })

            return messageGroups.map((group, groupIndex) => (
              <div key={`group-${groupIndex}`} className="group flex gap-3">
                {/* Avatar */}
                <img
                  src={group.sender?.avatarUrl || '/default-avatar.svg'}
                  alt={group.sender?.name || 'User'}
                  className="h-10 w-10 flex-shrink-0 rounded-2xl"
                  onError={e => {
                    e.currentTarget.src = '/default-avatar.svg'
                  }}
                />

                <div className="min-w-0 flex-1">
                  {/* Header */}
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-sm font-medium text-white">
                      {group.sender?.name || 'Unknown User'}
                    </span>
                    <span className="text-xs text-white/50">
                      {formatRelativeTime(new Date(group.firstMessageTime))}
                    </span>
                  </div>

                  {/* Single connected bubble for all messages in group */}
                  <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm overflow-hidden">
                    {group.messages.map((message, messageIndex) => {
                      // Fix padding for single vs multiple messages
                      let paddingClass = ''
                      if (group.messages.length === 1) {
                        // Single message: full padding
                        paddingClass = 'p-4'
                      } else if (messageIndex === 0) {
                        // First in group: top padding, small bottom
                        paddingClass = 'pt-4 px-4 pb-1'
                      } else if (messageIndex === group.messages.length - 1) {
                        // Last in group: small top, full bottom
                        paddingClass = 'pt-1 px-4 pb-4'
                      } else {
                        // Middle: small vertical padding
                        paddingClass = 'py-1 px-4'
                      }

                      return (
                      <div key={message.id} className={`group/message ${paddingClass} hover:bg-white/5 transition-colors relative`}>
                        <div className="flex items-start justify-between">
                          <p className="whitespace-pre-wrap text-white/90 flex-1">{message.body}</p>
                          {/* Delete button - only show for current user's messages */}
                          {(() => {
                            const shouldShow = message.senderId === session?.user?.email
                            console.log('Delete button check:', {
                              messageId: message.id,
                              senderId: message.senderId,
                              currentUserEmail: session?.user?.email,
                              shouldShow
                            })
                            return shouldShow
                          })() && (
                            <button
                              onClick={() => handleDeleteMessage(message.id)}
                              disabled={deleteMessageMutation.isPending}
                              className="ml-2 opacity-0 group-hover/message:opacity-100 p-1 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 flex-shrink-0"
                              title="Delete message"
                            >
                              {deleteMessageMutation.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <X className="h-3 w-3" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))
          })()
        )}

        {/* Typing Indicator */}
        <TypingIndicator text={typingText} show={isAnyoneTyping} />

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      <div className="border-t border-white/10 p-6">
        <form onSubmit={handleSendMessage} className="flex gap-3">
          <div className="flex-1">
            <textarea
              value={messageText}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              onBlur={stopTyping}
              placeholder="Type a message..."
              className="w-full resize-none rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-white placeholder-white/50 backdrop-blur-sm transition-all duration-300 focus:scale-[1.02] focus:border-blue-400 focus:bg-white/15 focus:shadow-lg focus:outline-none"
              rows={1}
              style={{ minHeight: '48px', maxHeight: '120px' }}
              onInput={e => {
                const target = e.target as HTMLTextAreaElement
                target.style.height = 'auto'
                target.style.height = target.scrollHeight + 'px'
              }}
            />
          </div>
          <button
            type="submit"
            disabled={!messageText.trim() || sendMessageMutation.isPending}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 px-6 py-3 font-medium text-white transition-all duration-300 hover:scale-105 hover:from-blue-600 hover:to-purple-700 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            {sendMessageMutation.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </form>
      </div>

      {/* Settings Modal */}
      <ConversationSettingsModal
        conversation={conversation}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onConversationUpdated={onConversationUpdated}
      />
    </div>
  )
}
