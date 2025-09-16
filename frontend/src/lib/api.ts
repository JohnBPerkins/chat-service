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
    return {
      'Content-Type': 'application/json',
    }
  }

  private async getUserId(): Promise<string> {
    const session = await getSession()
    if (!session?.user?.email) {
      throw new Error('No authenticated user')
    }
    // Use email as user ID for now (in production, map this properly)
    return session.user.email
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
    const userId = await this.getUserId()
    return this.request<User>(`/v1/me?userId=${encodeURIComponent(userId)}`)
  }

  async upsertUser(userData: Partial<User>): Promise<User> {
    const userId = await this.getUserId()
    // Include the user ID in the userData
    const userDataWithId = { ...userData, id: userId }
    return this.request<User>('/v1/users/me', {
      method: 'PUT',
      body: JSON.stringify(userDataWithId),
    })
  }

  // Conversation APIs
  async getConversations(): Promise<Conversation[]> {
    const userId = await this.getUserId()
    return this.request<Conversation[]>(`/v1/conversations?userId=${encodeURIComponent(userId)}`)
  }

  async createConversation(data: CreateConversationRequest): Promise<Conversation> {
    const userId = await this.getUserId()
    return this.request<Conversation>(`/v1/conversations?userId=${encodeURIComponent(userId)}`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const userId = await this.getUserId()
    await this.request(`/v1/conversations/${conversationId}?userId=${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    })
  }

  // Message APIs
  async getMessages(
    conversationId: string,
    before?: string,
    limit: number = 50
  ): Promise<PaginatedMessagesResponse> {
    const userId = await this.getUserId()
    const params = new URLSearchParams({
      limit: limit.toString(),
      userId: userId
    })
    if (before) {
      params.append('before', before)
    }

    return this.request<PaginatedMessagesResponse>(
      `/v1/conversations/${conversationId}/messages?${params}`
    )
  }

  async sendMessage(data: SendMessageRequest): Promise<Message> {
    const userId = await this.getUserId()
    return this.request<Message>(`/v1/messages?userId=${encodeURIComponent(userId)}`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async markMessageAsRead(conversationId: string, messageId: number): Promise<void> {
    const userId = await this.getUserId()
    await this.request(`/v1/messages/${messageId}/read?userId=${encodeURIComponent(userId)}`, {
      method: 'POST',
      body: JSON.stringify({ conversationId }),
    })
  }
}

export const apiClient = new ApiClient()