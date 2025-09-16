import { useState, useCallback } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import type { Message, PaginatedMessagesResponse } from '@/types/chat'

interface UsePaginatedMessagesOptions {
  conversationId: string
  pageSize?: number
}

export function usePaginatedMessages({ conversationId, pageSize = 50 }: UsePaginatedMessagesOptions) {
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['messages', conversationId, 'paginated'],
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.getMessages(conversationId, pageParam, pageSize)
      return response
    },
    getNextPageParam: (lastPage: PaginatedMessagesResponse) => {
      return lastPage.hasMore ? lastPage.nextCursor : undefined
    },
    initialPageParam: undefined as string | undefined,
    enabled: !!conversationId,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60, // 1 minute
  })

  // Flatten all messages from all pages
  const allMessages: Message[] = data?.pages.flatMap(page => page.messages) || []

  // Sort messages by creation time (oldest first for display)
  const messages = allMessages.sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime()
    const timeB = new Date(b.createdAt).getTime()

    if (timeA === timeB) {
      // If timestamps are the same, sort by ID (Snowflake)
      return a.id - b.id
    }

    return timeA - timeB
  })

  const loadMoreMessages = useCallback(async () => {
    if (hasNextPage && !isFetchingNextPage && !isLoadingMore) {
      setIsLoadingMore(true)
      try {
        await fetchNextPage()
      } finally {
        setIsLoadingMore(false)
      }
    }
  }, [hasNextPage, isFetchingNextPage, isLoadingMore, fetchNextPage])

  const hasMore = hasNextPage
  const isLoadingInitial = isLoading
  const isLoadingNextPage = isFetchingNextPage || isLoadingMore

  return {
    messages,
    hasMore,
    isLoadingInitial,
    isLoadingMore: isLoadingNextPage,
    loadMoreMessages,
    error,
    refetch,
    totalPages: data?.pages.length || 0,
  }
}