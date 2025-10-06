'use client'

import { useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { X, Users, User as UserIcon, Check } from 'lucide-react'
import { apiClient } from '@/lib/api'
import type { Conversation, CreateConversationRequest, User } from '@/types/chat'

interface NewConversationModalProps {
  isOpen: boolean
  onClose: () => void
  onConversationCreated: (conversation: Conversation) => void
}

export function NewConversationModal({
  isOpen,
  onClose,
  onConversationCreated,
}: NewConversationModalProps) {
  const [conversationType, setConversationType] = useState<'dm' | 'group'>('group')
  const [title, setTitle] = useState('')
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set())
  const queryClient = useQueryClient()

  // Fetch friends for selection
  const { data: friends = [] } = useQuery<User[]>({
    queryKey: ['friends'],
    queryFn: () => apiClient.getFriends(),
    enabled: isOpen,
  })

  const createConversationMutation = useMutation({
    mutationFn: (data: CreateConversationRequest) => apiClient.createConversation(data),
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      onConversationCreated(conversation)
      onClose()
      setTitle('')
      setSelectedFriendIds(new Set())
    },
  })

  const toggleFriendSelection = (friendId: string) => {
    const newSelection = new Set(selectedFriendIds)
    if (newSelection.has(friendId)) {
      newSelection.delete(friendId)
    } else {
      newSelection.add(friendId)
    }
    setSelectedFriendIds(newSelection)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (selectedFriendIds.size === 0) {
      alert('Please select at least one friend')
      return
    }

    const data: CreateConversationRequest = {
      kind: 'group',
      members: Array.from(selectedFriendIds),
    }

    if (title.trim()) {
      data.title = title.trim()
    }

    createConversationMutation.mutate(data)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-md border border-white/20 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-white/10 sticky top-0 bg-white/10 backdrop-blur-xl z-10">
          <h2 className="text-lg sm:text-xl font-semibold text-white">New Conversation</h2>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white hover:bg-white/10 rounded-xl p-2 transition-all duration-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Title */}
          <div>
            <label
              htmlFor="title"
              className="block text-sm font-medium text-white mb-2"
            >
              Group Name (optional)
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter group name"
              className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 transition-all duration-300 focus:outline-none focus:border-blue-400 focus:bg-white/15"
            />
          </div>

          {/* Select Friends */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Select Friends ({selectedFriendIds.size} selected)
            </label>
            {friends.length === 0 ? (
              <div className="text-center py-8 bg-white/5 rounded-xl">
                <UserIcon className="w-10 h-10 text-white/30 mx-auto mb-2" />
                <p className="text-white/60 text-sm">No friends yet</p>
                <p className="text-white/40 text-xs mt-1">Add friends first to create group chats</p>
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-2 bg-white/5 rounded-xl p-3">
                {friends.map((friend) => (
                  <button
                    key={friend.id}
                    type="button"
                    onClick={() => toggleFriendSelection(friend.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${
                      selectedFriendIds.has(friend.id)
                        ? 'bg-blue-500/30 border-2 border-blue-400'
                        : 'bg-white/5 hover:bg-white/10 border-2 border-transparent'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-white font-medium flex-shrink-0">
                      {friend.name?.charAt(0) || friend.email.charAt(0)}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-white font-medium text-sm truncate">
                        {friend.name || 'Unknown'}
                      </p>
                      <p className="text-white/60 text-xs truncate">{friend.email}</p>
                    </div>
                    {selectedFriendIds.has(friend.id) && (
                      <Check className="w-5 h-5 text-blue-300 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 border border-white/20 rounded-xl text-sm font-medium text-white/80 hover:bg-white/10 hover:border-white/30 transition-all duration-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createConversationMutation.isPending || selectedFriendIds.size === 0}
              className="flex-1 py-3 px-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-xl text-sm font-medium transition-all duration-300 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createConversationMutation.isPending ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}