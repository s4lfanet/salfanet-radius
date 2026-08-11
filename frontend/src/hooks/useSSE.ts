import { useEffect, useRef, useCallback } from 'react'

interface SSEOptions {
  onConnected?: () => void
  onError?: (error: Event) => void
  onReconnecting?: () => void
  autoReconnect?: boolean
  reconnectInterval?: number
}

export function useSSE<T = any>(
  url: string,
  onMessage: (event: string, data: T) => void,
  options: SSEOptions = {}
) {
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const {
    onConnected,
    onError,
    onReconnecting,
    autoReconnect = true,
    reconnectInterval = 3000,
  } = options

  const connect = useCallback(() => {
    // Cleanup previous connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    try {
      const eventSource = new EventSource(url)
      eventSourceRef.current = eventSource

      // Handle connection established
      eventSource.addEventListener('connected', () => {
        console.log('[SSE] Connected to', url)
        onConnected?.()
      })

      // Handle generic messages
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          onMessage('message', data)
        } catch (e) {
          console.error('[SSE] Failed to parse message:', e)
        }
      }

      // Handle custom events
      eventSource.addEventListener('voucher-stats', (event: any) => {
        try {
          const data = JSON.parse(event.data)
          onMessage('voucher-stats', data)
        } catch (e) {
          console.error('[SSE] Failed to parse voucher-stats:', e)
        }
      })

      eventSource.addEventListener('voucher-changed', (event: any) => {
        try {
          const data = JSON.parse(event.data)
          onMessage('voucher-changed', data)
        } catch (e) {
          console.error('[SSE] Failed to parse voucher-changed:', e)
        }
      })

      // Handle errors
      eventSource.onerror = (error) => {
        console.error('[SSE] Connection error:', error)
        onError?.(error)

        // Auto-reconnect
        if (autoReconnect && eventSource.readyState === EventSource.CLOSED) {
          onReconnecting?.()
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('[SSE] Reconnecting...')
            connect()
          }, reconnectInterval)
        }
      }
    } catch (error) {
      console.error('[SSE] Failed to create EventSource:', error)
    }
  }, [url, onMessage, onConnected, onError, onReconnecting, autoReconnect, reconnectInterval])

  useEffect(() => {
    connect()

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [connect])

  return {
    reconnect: connect,
    disconnect: () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    },
  }
}
