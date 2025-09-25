'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Users, Edit2, UserPlus, UserMinus, Save, Loader2 } from 'lucide-react'
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
  const [newParticipantEmail, setNewParticipantEmail] = useState('')
  const [activeTab, setActiveTab] = useState<'participants' | 'settings'>('participants')

  // Fetch participants
  const { data: participantsData, isLoading: participantsLoading } = useQuery<ParticipantsResponse>({
    queryKey: ['conversation-participants', conversation.id],
    queryFn: () => apiClient.getConversationParticipants(conversation.id),
    enabled: isOpen && !!session?.user?.email,
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

  // Add participant mutation
  const addParticipantMutation = useMutation({
    mutationFn: (userEmail: string) => apiClient.addParticipant(conversation.id, userEmail),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation-participants', conversation.id] })
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      setNewParticipantEmail('')
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

  const handleAddParticipant = (e: React.FormEvent) => {
    e.preventDefault()
    if (newParticipantEmail.trim()) {
      addParticipantMutation.mutate(newParticipantEmail.trim())
    }
  }

  const handleRemoveParticipant = (userId: string) => {
    if (confirm('Are you sure you want to remove this participant?')) {
      removeParticipantMutation.mutate(userId)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-2xl mx-4 bg-white rounded-lg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
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
        <div className="p-6">
          {activeTab === 'participants' && (
            <div className="space-y-6">
              {/* Add Participant */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">
                  Add Participant
                </h3>
                <form onSubmit={handleAddParticipant} className="flex gap-3">
                  <input
                    type="email"
                    value={newParticipantEmail}
                    onChange={(e) => setNewParticipantEmail(e.target.value)}
                    placeholder="Enter email address"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900"
                  />
                  <button
                    type="submit"
                    disabled={!newParticipantEmail.trim() || addParticipantMutation.isPending}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {addParticipantMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <UserPlus className="w-4 h-4" />
                    )}
                    Add
                  </button>
                </form>
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
        <div className="flex justify-end p-6 border-t border-gray-200">
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