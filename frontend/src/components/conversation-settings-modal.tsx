'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Users, Edit2, UserPlus, UserMinus, Save, Loader2, Check } from 'lucide-react'
import { apiClient } from '@/lib/api'
import type { Conversation, User } from '@/types/chat'

interface ConversationSettingsModalProps {
  conversation: Conversation
  isOpen: boolean
  onClose: () => void
  onConversationUpdated?: (conversation: Conversation) => void
}

interface ParticipantsResponse {
  participants: User[]
}

export function ConversationSettingsModal({
  conversation,
  isOpen,
  onClose,
  onConversationUpdated
}: ConversationSettingsModalProps) {
  const { data: session } = useSession()
  const queryClient = useQueryClient()

  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [newTitle, setNewTitle] = useState(conversation.title || '')
  const [showAddFriends, setShowAddFriends] = useState(false)
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<'participants' | 'settings'>('participants')

  // Fetch participants
  const { data: participantsData, isLoading: participantsLoading } = useQuery<ParticipantsResponse>({
    queryKey: ['conversation-participants', conversation.id],
    queryFn: () => apiClient.getConversationParticipants(conversation.id),
    enabled: isOpen && !!session?.user?.email,
  })

  // Fetch friends for selection
  const { data: friends = [] } = useQuery<User[]>({
    queryKey: ['friends'],
    queryFn: () => apiClient.getFriends(),
    enabled: isOpen && showAddFriends,
  })

  // Update conversation title mutation
  const updateTitleMutation = useMutation({
    mutationFn: (title: string) => apiClient.updateConversationTitle(conversation.id, title),
    onSuccess: () => {
      // Update both conversation lists and the current conversation
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      queryClient.invalidateQueries({ queryKey: ['conversation-participants', conversation.id] })
      setIsEditingTitle(false)

      // Update the conversation object immediately in the parent component
      if (onConversationUpdated) {
        onConversationUpdated({
          ...conversation,
          title: newTitle.trim()
        })
      }
    },
  })

  // Add participants mutation (batch)
  const addParticipantsMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      // Add participants one by one
      for (const userId of userIds) {
        await apiClient.addParticipant(conversation.id, userId)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation-participants', conversation.id] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      setSelectedFriendIds(new Set())
      setShowAddFriends(false)
    },
  })

  // Remove participant mutation
  const removeParticipantMutation = useMutation({
    mutationFn: (userEmail: string) => apiClient.removeParticipant(conversation.id, userEmail),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation-participants', conversation.id] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })

  useEffect(() => {
    setNewTitle(conversation.title || '')
  }, [conversation.title])

  if (!isOpen) return null

  const handleUpdateTitle = (e: React.FormEvent) => {
    e.preventDefault()
    if (newTitle.trim() && newTitle !== conversation.title) {
      updateTitleMutation.mutate(newTitle.trim())
    }
  }

  const toggleFriendSelection = (friendId: string) => {
    const newSelection = new Set(selectedFriendIds)
    if (newSelection.has(friendId)) {
      newSelection.delete(friendId)
    } else {
      newSelection.add(friendId)
    }
    setSelectedFriendIds(newSelection)
  }

  const handleAddParticipants = () => {
    if (selectedFriendIds.size > 0) {
      addParticipantsMutation.mutate(Array.from(selectedFriendIds))
    }
  }

  const handleRemoveParticipant = (userId: string) => {
    if (confirm('Are you sure you want to remove this participant?')) {
      removeParticipantMutation.mutate(userId)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-xl max-h-[90vh] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
            Conversation Settings
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('participants')}
            className={`flex-1 px-4 py-3 text-sm font-medium ${
              activeTab === 'participants'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users className="w-4 h-4 inline mr-2" />
            Participants
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 px-4 py-3 text-sm font-medium ${
              activeTab === 'settings'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Edit2 className="w-4 h-4 inline mr-2" />
            Settings
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
          {activeTab === 'participants' && (
            <div className="space-y-6">
              {/* Add Participants from Friends */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-medium text-gray-900">
                    Add Participants
                  </h3>
                  {!showAddFriends ? (
                    <button
                      onClick={() => setShowAddFriends(true)}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center gap-2"
                    >
                      <UserPlus className="w-4 h-4" />
                      Add from Friends
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setShowAddFriends(false)
                        setSelectedFriendIds(new Set())
                      }}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
                    >
                      Cancel
                    </button>
                  )}
                </div>

                {showAddFriends && (
                  <div>
                    {friends.length === 0 ? (
                      <div className="text-center py-6 bg-gray-50 rounded-lg">
                        <Users className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-600 text-sm">No friends available to add</p>
                      </div>
                    ) : (
                      <div>
                        <div className="max-h-48 overflow-y-auto space-y-2 bg-gray-50 rounded-lg p-3 mb-3">
                          {friends
                            .filter(friend => !participantsData?.participants?.some(p => p.id === friend.id))
                            .map((friend) => (
                              <button
                                key={friend.id}
                                type="button"
                                onClick={() => toggleFriendSelection(friend.id)}
                                className={`w-full flex items-center gap-3 p-2 rounded-lg transition-all ${
                                  selectedFriendIds.has(friend.id)
                                    ? 'bg-blue-100 border-2 border-blue-500'
                                    : 'bg-white hover:bg-gray-100 border-2 border-transparent'
                                }`}
                              >
                                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center text-white font-medium text-sm flex-shrink-0">
                                  {friend.name?.charAt(0) || friend.email.charAt(0)}
                                </div>
                                <div className="flex-1 text-left min-w-0">
                                  <p className="text-gray-900 font-medium text-sm truncate">
                                    {friend.name || 'Unknown'}
                                  </p>
                                  <p className="text-gray-500 text-xs truncate">{friend.email}</p>
                                </div>
                                {selectedFriendIds.has(friend.id) && (
                                  <Check className="w-5 h-5 text-blue-600 flex-shrink-0" />
                                )}
                              </button>
                            ))}
                        </div>
                        <button
                          onClick={handleAddParticipants}
                          disabled={selectedFriendIds.size === 0 || addParticipantsMutation.isPending}
                          className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {addParticipantsMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <UserPlus className="w-4 h-4" />
                          )}
                          Add {selectedFriendIds.size} {selectedFriendIds.size === 1 ? 'Friend' : 'Friends'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Current Participants */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">
                  Current Participants ({participantsData?.participants?.length || 0})
                </h3>

                {participantsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {participantsData?.participants?.map((participant) => (
                      <div
                        key={participant.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                            {participant.name?.charAt(0) || participant.email.charAt(0)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {participant.name || 'Unknown User'}
                            </p>
                            <p className="text-sm text-gray-500">{participant.email}</p>
                          </div>
                          {participant.email === session?.user?.email && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                              You
                            </span>
                          )}
                        </div>

                        {participant.email !== session?.user?.email && (
                          <button
                            onClick={() => handleRemoveParticipant(participant.email)}
                            disabled={removeParticipantMutation.isPending}
                            className="p-1 text-red-600 hover:bg-red-50 rounded disabled:opacity-50"
                          >
                            <UserMinus className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="space-y-6">
              {/* Conversation Title */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">
                  Conversation Name
                </h3>

                {isEditingTitle ? (
                  <form onSubmit={handleUpdateTitle} className="flex gap-3">
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Enter conversation name"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900"
                      autoFocus
                    />
                    <button
                      type="submit"
                      disabled={!newTitle.trim() || updateTitleMutation.isPending}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {updateTitleMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingTitle(false)
                        setNewTitle(conversation.title || '')
                      }}
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-gray-900">
                      {conversation.title ||
                        (conversation.kind === 'group' ? 'Group Chat' : 'Direct Message')}
                    </span>
                    <button
                      onClick={() => setIsEditingTitle(true)}
                      className="p-1 text-gray-600 hover:bg-gray-200 rounded"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Conversation Info */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">
                  Information
                </h3>
                <div className="space-y-2 text-sm text-gray-600">
                  <p>Type: {conversation.kind === 'group' ? 'Group Chat' : 'Direct Message'}</p>
                  <p>Created: {new Date(conversation.createdAt).toLocaleDateString()}</p>
                  <p>Participants: {participantsData?.participants?.length || 0}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 sm:p-6 border-t border-gray-200 sticky bottom-0 bg-white">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}