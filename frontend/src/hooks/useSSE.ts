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
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Store callbacks in refs so they don't affect connect's dependency array
  const onMessageRef = useRef(onMessage)
  const onConnectedRef = useRef(options.onConnected)
  const onErrorRef = useRef(options.onError)
  const onReconnectingRef = useRef(options.onReconnecting)
  const autoReconnectRef = useRef(options.autoReconnect ?? true)
  const reconnectIntervalRef = useRef(options.reconnectInterval ?? 3000)

  // Update refs on every render (they always have latest values)
  onMessageRef.current = onMessage
  onConnectedRef.current = options.onConnected
  onErrorRef.current = options.onError
  onReconnectingRef.current = options.onReconnecting
  autoReconnectRef.current = options.autoReconnect ?? true
  reconnectIntervalRef.current = options.reconnectInterval ?? 3000

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
        onConnectedRef.current?.()
      })

      // Handle generic messages
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          onMessageRef.current('message', data)
        } catch (e) {
          console.error('[SSE] Failed to parse message:', e)
        }
      }

      // Handle custom events
      eventSource.addEventListener('voucher-stats', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data)
          onMessageRef.current('voucher-stats', data)
        } catch (e) {
          console.error('[SSE] Failed to parse voucher-stats:', e)
        }
      })

      eventSource.addEventListener('voucher-changed', (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data)
          onMessageRef.current('voucher-changed', data)
        } catch (e) {
          console.error('[SSE] Failed to parse voucher-changed:', e)
        }
      })

      // Handle errors
      eventSource.onerror = (error) => {
        console.error('[SSE] Connection error:', error)
        onErrorRef.current?.(error)

        // Auto-reconnect
        if (autoReconnectRef.current && eventSource.readyState === EventSource.CLOSED) {
          onReconnectingRef.current?.()
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('[SSE] Reconnecting...')
            connect()
          }, reconnectIntervalRef.current)
        }
      }
    } catch (error) {
      console.error('[SSE] Failed to create EventSource:', error)
    }
  }, [url]) // Only depend on url — callbacks are in refs

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
