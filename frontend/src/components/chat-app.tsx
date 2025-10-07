'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import { Menu, X } from 'lucide-react'
import { ConversationSidebar } from './conversation-sidebar'
import { MessageArea } from './message-area'
import { AuthPrompt } from './auth-prompt'
import { useWebSocket } from '@/hooks/use-websocket'
import { apiClient } from '@/lib/api'
import type { Conversation } from '@/types/chat'

export function ChatApp() {
  const { data: session, status } = useSession()
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)

  const {
    isConnected,
    connectionError,
    sendFriendRequest,
    respondToFriendRequest,
    removeFriend
  } = useWebSocket({
    onFriendRequestReceived: (data) => {
      console.log('Friend request received:', data)
      // Notifications are handled by query invalidation in useWebSocket
    },
    onFriendRequestAccepted: (data) => {
      console.log('Friend request accepted:', data)
      // The new conversation will appear automatically via query invalidation
    },
    onFriendRequestRejected: (data) => {
      console.log('Friend request rejected:', data)
    },
    onFriendRemoved: (data) => {
      console.log('Friend removed:', data)
      // Clear selected conversation if it was the DM with removed friend
      if (selectedConversation?.id === data.conversationId) {
        setSelectedConversation(null)
      }
    },
    onConversationRemoved: (data) => {
      console.log('🔍 DEBUG: Conversation removed event received:', data)
      console.log('🔍 DEBUG: Current selectedConversation:', selectedConversation)
      console.log('🔍 DEBUG: Comparison:', {
        dataConversationId: data.conversationId,
        selectedId: selectedConversation?.id,
        matches: selectedConversation?.id === data.conversationId
      })

      // Clear selected conversation if user was removed from it
      if (selectedConversation?.id === data.conversationId) {
        console.log('🔍 DEBUG: Match found! Clearing selected conversation...')
        setSelectedConversation(null)
      } else {
        console.log('🔍 DEBUG: No match, not clearing selected conversation')
      }
    },
  })

  const isAuthenticated = status === 'authenticated' && !!session

  // Get conversations to keep selected conversation in sync
  const { data: conversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => apiClient.getConversations(),
    enabled: isAuthenticated,
  })

  // Keep selected conversation in sync with conversations query data
  useEffect(() => {
    if (selectedConversation && conversations) {
      const updatedConversation = conversations.find(c => c.id === selectedConversation.id)
      if (updatedConversation && (
        updatedConversation.title !== selectedConversation.title ||
        updatedConversation.participants?.length !== selectedConversation.participants?.length
      )) {
        setSelectedConversation(updatedConversation)
      }
    }
  }, [conversations, selectedConversation])

  // Show loading state instead of flashing auth prompt
  if (status === 'loading') {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
            <span className="text-2xl">💬</span>
          </div>
          <p className="text-white/70">Loading...</p>
        </div>
      </div>
    )
  }

  // Close mobile sidebar when conversation is selected
  const handleConversationSelect = (conversation: Conversation) => {
    setSelectedConversation(conversation)
    setIsMobileSidebarOpen(false)
  }

  return (
    <div className="h-full flex gap-6 relative">
      {/* Mobile Menu Button - show when authenticated and no conversation selected */}
      {isAuthenticated && !selectedConversation && (
        <button
          onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
          className="lg:hidden fixed top-4 left-4 z-50 p-3 bg-white/10 backdrop-blur-xl rounded-xl border border-white/20 text-white hover:bg-white/20 transition-all"
          aria-label="Toggle menu"
        >
          {isMobileSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      )}

      {/* Mobile Back Button (when conversation is selected) */}
      {selectedConversation && (
        <button
          onClick={() => setSelectedConversation(null)}
          className="lg:hidden fixed top-4 left-4 z-50 p-3 bg-white/10 backdrop-blur-xl rounded-xl border border-white/20 text-white hover:bg-white/20 transition-all"
          aria-label="Back to conversations"
        >
          <X className="w-6 h-6" />
        </button>
      )}

      {/* Sidebar - Desktop: always visible, Mobile: overlay when authenticated */}
      <div className={`
        w-80 flex-shrink-0
        lg:relative lg:block
        fixed inset-y-0 left-0 z-40
        transition-transform duration-300 ease-in-out
        ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${selectedConversation ? 'hidden lg:block' : ''}
        ${!isAuthenticated ? 'hidden lg:block' : ''}
      `}>
        <ConversationSidebar
          selectedConversation={selectedConversation}
          onConversationSelect={handleConversationSelect}
          isAuthenticated={isAuthenticated}
          isConnected={isConnected}
          connectionError={connectionError}
          onSendFriendRequest={sendFriendRequest}
          onRespondToFriendRequest={respondToFriendRequest}
          onRemoveFriend={removeFriend}
        />
      </div>

      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-30"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {!isAuthenticated ? (
          <AuthPrompt />
        ) : selectedConversation ? (
          <MessageArea
            conversation={selectedConversation}
            isConnected={isConnected}
            onConversationDeleted={() => setSelectedConversation(null)}
            onConversationUpdated={setSelectedConversation}
          />
        ) : (
          <div className="h-full bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 flex items-center justify-center">
            <div className="text-center px-4">
              <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">💬</span>
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">
                Select a conversation
              </h2>
              <p className="text-white/70">
                Choose a conversation from the sidebar to start chatting
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}// Cache bust
