'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { UserPlus, Users, Check, X, Loader2 } from 'lucide-react'
import { apiClient } from '@/lib/api'
import type { User, FriendRequest } from '@/types/chat'

interface FriendsPanelProps {
  onSendFriendRequest: (email: string) => void
  onRespondToRequest: (requestId: string, accept: boolean) => void
}

export function FriendsPanel({ onSendFriendRequest, onRespondToRequest }: FriendsPanelProps) {
  const [isAddFriendOpen, setIsAddFriendOpen] = useState(false)
  const [friendEmail, setFriendEmail] = useState('')
  const [activeTab, setActiveTab] = useState<'friends' | 'requests'>('friends')
  const queryClient = useQueryClient()

  // Fetch friends
  const { data: friends = [], isLoading: friendsLoading } = useQuery<User[]>({
    queryKey: ['friends'],
    queryFn: () => apiClient.getFriends(),
  })

  // Fetch pending friend requests
  const { data: requests = [], isLoading: requestsLoading } = useQuery<FriendRequest[]>({
    queryKey: ['friend-requests'],
    queryFn: () => apiClient.getPendingFriendRequests(),
  })

  const handleSendRequest = (e: React.FormEvent) => {
    e.preventDefault()
    if (friendEmail.trim()) {
      onSendFriendRequest(friendEmail.trim())
      setFriendEmail('')
      setIsAddFriendOpen(false)
    }
  }

  const handleAccept = (requestId: string) => {
    onRespondToRequest(requestId, true)
  }

  const handleReject = (requestId: string) => {
    onRespondToRequest(requestId, false)
  }

  const pendingCount = requests.length

  return (
    <div className="h-full flex flex-col bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20">
      {/* Header with tabs */}
      <div className="border-b border-white/10 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">Friends</h2>
          <button
            onClick={() => setIsAddFriendOpen(!isAddFriendOpen)}
            className="p-2 rounded-xl bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 transition-all"
            title="Add Friend"
          >
            <UserPlus className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('friends')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'friends'
                ? 'bg-white/20 text-white'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
          >
            Friends ({friends.length})
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all relative ${
              activeTab === 'requests'
                ? 'bg-white/20 text-white'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
          >
            Requests
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Add friend form */}
      {isAddFriendOpen && (
        <div className="border-b border-white/10 p-4 bg-white/5">
          <form onSubmit={handleSendRequest} className="flex gap-2">
            <input
              type="email"
              value={friendEmail}
              onChange={(e) => setFriendEmail(e.target.value)}
              placeholder="Enter friend's email"
              className="flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 text-sm focus:outline-none focus:border-blue-400"
              autoFocus
            />
            <button
              type="submit"
              disabled={!friendEmail.trim()}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </form>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'friends' && (
          <div className="space-y-2">
            {friendsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-white/60" />
              </div>
            ) : friends.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-12 h-12 text-white/30 mx-auto mb-2" />
                <p className="text-white/60 text-sm">No friends yet</p>
                <p className="text-white/40 text-xs mt-1">Add friends to start chatting</p>
              </div>
            ) : (
              friends.map((friend) => (
                <div
                  key={friend.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-white font-medium flex-shrink-0">
                    {friend.name?.charAt(0) || friend.email.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm truncate">
                      {friend.name || 'Unknown'}
                    </p>
                    <p className="text-white/60 text-xs truncate">{friend.email}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'requests' && (
          <div className="space-y-2">
            {requestsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-white/60" />
              </div>
            ) : requests.length === 0 ? (
              <div className="text-center py-8">
                <UserPlus className="w-12 h-12 text-white/30 mx-auto mb-2" />
                <p className="text-white/60 text-sm">No pending requests</p>
              </div>
            ) : (
              requests.map((request) => (
                <div
                  key={request.id}
                  className="p-3 rounded-xl bg-white/5 border border-white/10"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-white font-medium flex-shrink-0">
                      {request.fromUser?.name?.charAt(0) || request.fromUser?.email.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium text-sm">
                        {request.fromUser?.name || 'Unknown User'}
                      </p>
                      <p className="text-white/60 text-xs truncate">
                        {request.fromUser?.email}
                      </p>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleAccept(request.id)}
                          className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-green-500/20 text-green-300 hover:bg-green-500/30 rounded-lg text-xs font-medium transition-all"
                        >
                          <Check className="w-3 h-3" />
                          Accept
                        </button>
                        <button
                          onClick={() => handleReject(request.id)}
                          className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-red-500/20 text-red-300 hover:bg-red-500/30 rounded-lg text-xs font-medium transition-all"
                        >
                          <X className="w-3 h-3" />
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
