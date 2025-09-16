import { getSession } from 'next-auth/react'
import type {
  User,
  Conversation,
  Message,
  CreateConversationRequest,
  SendMessageRequest,
  PaginatedMessagesResponse,
  ApiError,
} from '@/types/chat'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8080'

class ApiClient {
  private async getAuthHeaders(): Promise<HeadersInit> {
    const session = await getSession()
    if (!session?.accessToken) {
      throw new Error('No authentication token available')
    }

    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.accessToken}`,
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`
    const headers = await this.getAuthHeaders()

    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers,
      },
    })

    if (!response.ok) {
      let error: ApiError
      try {
        error = await response.json()
      } catch {
        error = {
          error: 'REQUEST_FAILED',
          message: `Request failed with status ${response.status}`,
        }
      }
      throw new Error(error.message || 'Request failed')
    }

    return response.json()
  }

  // User APIs
  async getCurrentUser(): Promise<User> {
    return this.request<User>('/v1/me')
  }

  async upsertUser(userData: Partial<User>): Promise<User> {
    return this.request<User>('/v1/users/me', {
      method: 'PUT',
      body: JSON.stringify(userData),
    })
  }

  // Conversation APIs
  async getConversations(): Promise<Conversation[]> {
    return this.request<Conversation[]>('/v1/conversations')
  }

  async createConversation(data: CreateConversationRequest): Promise<Conversation> {
    return this.request<Conversation>('/v1/conversations', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  // Message APIs
  async getMessages(
    conversationId: string,
    before?: string,
    limit: number = 50
  ): Promise<PaginatedMessagesResponse> {
    const params = new URLSearchParams({ limit: limit.toString() })
    if (before) {
      params.append('before', before)
    }

    return this.request<PaginatedMessagesResponse>(
      `/v1/conversations/${conversationId}/messages?${params}`
    )
  }

  async sendMessage(data: SendMessageRequest): Promise<Message> {
    return this.request<Message>('/v1/messages', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async markMessageAsRead(conversationId: string, messageId: number): Promise<void> {
    await this.request(`/v1/messages/${messageId}/read`, {
      method: 'POST',
      body: JSON.stringify({ conversationId }),
    })
  }
}

export const apiClient = new ApiClient()