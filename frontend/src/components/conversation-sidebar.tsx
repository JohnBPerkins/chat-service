'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSession, signOut } from 'next-auth/react'
import { formatDistanceToNow } from 'date-fns'
import { Users, User as UserIcon, Plus, Settings, LogOut, WifiOff, Wifi } from 'lucide-react'
import { apiClient } from '@/lib/api'
import { NewConversationModal } from './new-conversation-modal'
import type { Conversation } from '@/types/chat'

interface ConversationSidebarProps {
  selectedConversation: Conversation | null
  onConversationSelect: (conversation: Conversation) => void
  isAuthenticated: boolean
  isConnected: boolean
  connectionError: string | null
}

export function ConversationSidebar({
  selectedConversation,
  onConversationSelect,
  isAuthenticated,
  isConnected,
  connectionError
}: ConversationSidebarProps) {
  const { data: session } = useSession()
  const [isNewConversationOpen, setIsNewConversationOpen] = useState(false)

  const {
    data: conversations,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => apiClient.getConversations(),
    enabled: Boolean(isAuthenticated),
    refetchInterval: 30000,
  })

  const handleSignOut = () => {
    signOut({ callbackUrl: '/' })
  }

  return (
    <div className="h-full bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 flex flex-col shadow-2xl">
      {/* Header */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Conversations</h2>
          {isAuthenticated && (
            <button
              onClick={() => setIsNewConversationOpen(true)}
              className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-300 hover:scale-110"
              title="New conversation"
            >
              <Plus className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Connection Status */}
        <div className="flex items-center gap-2 text-sm">
          {isConnected ? (
            <div className="flex items-center gap-2 text-green-400">
              <Wifi className="w-4 h-4" />
              <span>Connected</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-400" title={connectionError || 'Disconnected'}>
              <WifiOff className="w-4 h-4" />
              <span>Offline</span>
            </div>
          )}
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-hidden">
        {!isAuthenticated ? (
          <div className="p-6 text-center">
            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Users className="w-6 h-6 text-white/60" />
            </div>
            <p className="text-white/70 text-sm mb-2">Sign in to see your conversations</p>
            <p className="text-white/50 text-xs">Connect with friends and colleagues</p>
          </div>
        ) : isLoading ? (
          <div className="p-6 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white/10 rounded-2xl"></div>
                  <div className="flex-1 min-w-0">
                    <div className="h-4 bg-white/10 rounded mb-2"></div>
                    <div className="h-3 bg-white/10 rounded w-2/3"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-6 text-center">
            <div className="w-12 h-12 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-red-400 text-lg">⚠️</span>
            </div>
            <p className="text-red-300 text-sm mb-2">Failed to load conversations</p>
            <button
              onClick={() => window.location.reload()}
              className="text-blue-400 hover:text-blue-300 text-sm hover:underline"
            >
              Try again
            </button>
          </div>
        ) : !conversations?.length ? (
          <div className="p-6 text-center">
            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Users className="w-6 h-6 text-white/60" />
            </div>
            <p className="text-white/70 text-sm mb-2">No conversations yet</p>
            <p className="text-white/50 text-xs">Start a new conversation to get started</p>
          </div>
        ) : (
          <div className="overflow-y-auto p-4 space-y-2">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => onConversationSelect(conversation)}
                className={`w-full p-4 text-left rounded-xl transition-all duration-300 hover:bg-white/10 hover:scale-[1.02] ${
                  selectedConversation?.id === conversation.id
                    ? 'bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-400/30'
                    : 'hover:shadow-lg'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0">
                    {conversation.kind === 'group' ? (
                      <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center">
                        <Users className="w-6 h-6 text-white" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
                        <UserIcon className="w-6 h-6 text-white/80" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm font-medium text-white truncate">
                        {conversation.title ||
                         (conversation.kind === 'group' ? 'Group Chat' : 'Direct Message')}
                      </h3>
                      <span className="text-xs text-white/50">
                        {formatDistanceToNow(new Date(conversation.lastMessageAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>

                    {conversation.lastMessage && (
                      <p className="text-sm text-white/70 truncate">
                        {conversation.lastMessage.body}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* User Info */}
      {isAuthenticated && session && (
        <div className="p-6 border-t border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <img
                src={session.user.image || '/default-avatar.svg'}
                alt={session.user.name || 'User'}
                className="w-10 h-10 rounded-2xl"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">
                  {session.user.name}
                </p>
                <p className="text-xs text-white/60 truncate">{session.user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-300"
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={handleSignOut}
                className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-all duration-300"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Conversation Modal */}
      {isNewConversationOpen && (
        <NewConversationModal
          isOpen={isNewConversationOpen}
          onClose={() => setIsNewConversationOpen(false)}
          onConversationCreated={onConversationSelect}
        />
      )}
    </div>
  )
}