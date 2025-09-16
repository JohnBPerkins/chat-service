'use client'

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { formatDistanceToNow } from 'date-fns'
import { Users, User as UserIcon } from 'lucide-react'
import type { Conversation } from '@/types/chat'

interface ConversationListProps {
  selectedConversation: Conversation | null
  onConversationSelect: (conversation: Conversation) => void
}

export function ConversationList({
  selectedConversation,
  onConversationSelect,
}: ConversationListProps) {
  const {
    data: conversations,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => apiClient.getConversations(),
    refetchInterval: 30000, // Refetch every 30 seconds
  })

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                <div className="flex-1 min-w-0">
                  <div className="h-4 bg-gray-200 rounded mb-1"></div>
                  <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-red-600">Failed to load conversations</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 text-sm text-blue-600 hover:text-blue-700"
        >
          Try again
        </button>
      </div>
    )
  }

  if (!conversations?.length) {
    return (
      <div className="p-4 text-center">
        <Users className="mx-auto h-8 w-8 text-gray-400" />
        <p className="mt-2 text-sm text-gray-500">No conversations yet</p>
        <p className="text-xs text-gray-400">Start a new conversation to get started</p>
      </div>
    )
  }

  return (
    <div className="overflow-y-auto">
      <div className="p-2">
        {conversations.map((conversation) => (
          <button
            key={conversation.id}
            onClick={() => onConversationSelect(conversation)}
            className={`w-full p-3 text-left rounded-lg hover:bg-gray-50 transition-colors ${
              selectedConversation?.id === conversation.id
                ? 'bg-blue-50 border border-blue-200'
                : ''
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                {conversation.kind === 'group' ? (
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <Users className="w-5 h-5 text-blue-600" />
                  </div>
                ) : (
                  <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                    <UserIcon className="w-5 h-5 text-gray-600" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-900 truncate">
                    {conversation.title ||
                     (conversation.kind === 'group' ? 'Group Chat' : 'Direct Message')}
                  </h3>
                  <span className="text-xs text-gray-500">
                    {formatDistanceToNow(new Date(conversation.lastMessageAt), {
                      addSuffix: true,
                    })}
                  </span>
                </div>

                {conversation.lastMessage && (
                  <p className="text-sm text-gray-500 truncate mt-1">
                    {conversation.lastMessage.body}
                  </p>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}