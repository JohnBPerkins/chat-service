'use client'

import { useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { MessageCircle, Settings, LogOut, Plus, WifiOff } from 'lucide-react'
import { ConversationList } from './conversation-list'
import { MessageView } from './message-view'
import { NewConversationModal } from './new-conversation-modal'
import { useWebSocket } from '@/hooks/use-websocket'
import type { Conversation } from '@/types/chat'

export function ChatLayout() {
  const { data: session } = useSession()
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [isNewConversationOpen, setIsNewConversationOpen] = useState(false)

  const { isConnected, connectionError } = useWebSocket()

  const handleSignOut = () => {
    signOut({ callbackUrl: '/auth/signin' })
  }

  if (!session) {
    return null
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-6 h-6 text-blue-600" />
              <h1 className="font-semibold text-gray-900">Chat Service</h1>
              {!isConnected && (
                <div className="flex items-center gap-1 text-red-500" title={connectionError || 'Disconnected'}>
                  <WifiOff className="w-4 h-4" />
                  <span className="text-xs">Offline</span>
                </div>
              )}
            </div>
            <button
              onClick={() => setIsNewConversationOpen(true)}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              title="New conversation"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-hidden">
          <ConversationList
            selectedConversation={selectedConversation}
            onConversationSelect={setSelectedConversation}
          />
        </div>

        {/* User Info */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img
                src={session.user.image || '/default-avatar.svg'}
                alt={session.user.name || 'User'}
                className="w-8 h-8 rounded-full"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {session.user.name}
                </p>
                <p className="text-xs text-gray-500 truncate">{session.user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={handleSignOut}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <MessageView conversation={selectedConversation} />
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center">
              <MessageCircle className="mx-auto h-12 w-12 text-gray-400" />
              <h2 className="mt-4 text-lg font-medium text-gray-900">
                Select a conversation
              </h2>
              <p className="mt-2 text-sm text-gray-500">
                Choose a conversation from the sidebar to start chatting
              </p>
            </div>
          </div>
        )}
      </div>

      {/* New Conversation Modal */}
      {isNewConversationOpen && (
        <NewConversationModal
          isOpen={isNewConversationOpen}
          onClose={() => setIsNewConversationOpen(false)}
          onConversationCreated={setSelectedConversation}
        />
      )}
    </div>
  )
}