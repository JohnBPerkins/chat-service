'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import { ConversationSidebar } from './conversation-sidebar'
import { MessageArea } from './message-area'
import { AuthPrompt } from './auth-prompt'
import { useWebSocket } from '@/hooks/use-websocket'
import { apiClient } from '@/lib/api'
import type { Conversation } from '@/types/chat'

export function ChatApp() {
  const { data: session, status } = useSession()
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const { isConnected, connectionError } = useWebSocket()

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

  return (
    <div className="h-full flex gap-6">
      {/* Sidebar */}
      <div className="w-80 flex-shrink-0">
        <ConversationSidebar
          selectedConversation={selectedConversation}
          onConversationSelect={setSelectedConversation}
          isAuthenticated={isAuthenticated}
          isConnected={isConnected}
          connectionError={connectionError}
        />
      </div>

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
            <div className="text-center">
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
}