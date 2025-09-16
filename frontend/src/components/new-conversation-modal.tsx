'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Users, User as UserIcon } from 'lucide-react'
import { apiClient } from '@/lib/api'
import type { Conversation, CreateConversationRequest } from '@/types/chat'

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
  const [conversationType, setConversationType] = useState<'dm' | 'group'>('dm')
  const [title, setTitle] = useState('')
  const [memberEmails, setMemberEmails] = useState('')
  const queryClient = useQueryClient()

  const createConversationMutation = useMutation({
    mutationFn: (data: CreateConversationRequest) => apiClient.createConversation(data),
    onSuccess: (conversation) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      onConversationCreated(conversation)
      onClose()
      setTitle('')
      setMemberEmails('')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const emails = memberEmails
      .split(',')
      .map((email) => email.trim())
      .filter((email) => email.length > 0)

    if (emails.length === 0) {
      alert('Please enter at least one member email')
      return
    }

    const data: CreateConversationRequest = {
      kind: conversationType,
      members: emails, // In real implementation, these would be user IDs
    }

    if (conversationType === 'group' && title.trim()) {
      data.title = title.trim()
    }

    createConversationMutation.mutate(data)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-md mx-4 border border-white/20">
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-xl font-semibold text-white">New Conversation</h2>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white hover:bg-white/10 rounded-xl p-2 transition-all duration-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Conversation Type */}
          <div>
            <label className="block text-sm font-medium text-white mb-3">
              Conversation Type
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConversationType('dm')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 border rounded-xl text-sm font-medium transition-all duration-300 ${
                  conversationType === 'dm'
                    ? 'border-blue-400 bg-blue-500/20 text-blue-300'
                    : 'border-white/20 text-white/80 hover:bg-white/10 hover:border-white/30'
                }`}
              >
                <UserIcon className="w-4 h-4" />
                Direct Message
              </button>
              <button
                type="button"
                onClick={() => setConversationType('group')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 border rounded-xl text-sm font-medium transition-all duration-300 ${
                  conversationType === 'group'
                    ? 'border-blue-400 bg-blue-500/20 text-blue-300'
                    : 'border-white/20 text-white/80 hover:bg-white/10 hover:border-white/30'
                }`}
              >
                <Users className="w-4 h-4" />
                Group Chat
              </button>
            </div>
          </div>

          {/* Title (for group chats) */}
          {conversationType === 'group' && (
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
          )}

          {/* Member Emails */}
          <div>
            <label
              htmlFor="members"
              className="block text-sm font-medium text-white mb-2"
            >
              Member Emails
            </label>
            <textarea
              id="members"
              value={memberEmails}
              onChange={(e) => setMemberEmails(e.target.value)}
              placeholder="Enter email addresses separated by commas"
              rows={3}
              className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl text-white placeholder-white/50 resize-none transition-all duration-300 focus:outline-none focus:border-blue-400 focus:bg-white/15"
            />
            <p className="mt-2 text-xs text-white/60">
              Separate multiple emails with commas
            </p>
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
              disabled={createConversationMutation.isPending}
              className="flex-1 py-3 px-4 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-xl text-sm font-medium transition-all duration-300 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createConversationMutation.isPending ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}