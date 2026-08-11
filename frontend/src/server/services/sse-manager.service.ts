import 'server-only'
/**
 * SSE Manager for Broadcasting Real-time Updates
 * Manages Server-Sent Events connections and broadcasts
 */

type SSEController = ReadableStreamDefaultController<any>

class SSEManager {
  private clients: Map<string, Set<SSEController>> = new Map()

  /**
   * Add client to specific channel
   */
  addClient(channel: string, controller: SSEController) {
    if (!this.clients.has(channel)) {
      this.clients.set(channel, new Set())
    }
    this.clients.get(channel)!.add(controller)
    console.log(`[SSE] Client connected to ${channel}. Total: ${this.clients.get(channel)!.size}`)
  }

  /**
   * Remove client from specific channel
   */
  removeClient(channel: string, controller: SSEController) {
    const channelClients = this.clients.get(channel)
    if (channelClients) {
      channelClients.delete(controller)
      console.log(`[SSE] Client disconnected from ${channel}. Remaining: ${channelClients.size}`)
      if (channelClients.size === 0) {
        this.clients.delete(channel)
      }
    }
  }

  /**
   * Broadcast message to all clients in a channel
   */
  broadcast(channel: string, event: string, data: any) {
    const channelClients = this.clients.get(channel)
    if (!channelClients || channelClients.size === 0) {
      console.log(`[SSE] No clients connected to ${channel}`)
      return
    }

    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    const encoder = new TextEncoder()
    const encoded = encoder.encode(message)

    let disconnected = 0
    channelClients.forEach((controller) => {
      try {
        controller.enqueue(encoded)
      } catch (error) {
        // Client disconnected, remove it
        channelClients.delete(controller)
        disconnected++
      }
    })

    if (disconnected > 0) {
      console.log(`[SSE] Removed ${disconnected} dead connections from ${channel}`)
    }
    console.log(`[SSE] Broadcast to ${channel}: ${event} (${channelClients.size} clients)`)
  }

  /**
   * Send keep-alive ping to all clients
   */
  sendKeepAlive() {
    this.clients.forEach((channelClients, channel) => {
      const encoder = new TextEncoder()
      const ping = encoder.encode(': ping\n\n')
      
      channelClients.forEach((controller) => {
        try {
          controller.enqueue(ping)
        } catch (error) {
          channelClients.delete(controller)
        }
      })
    })
  }

  /**
   * Get stats about connected clients
   */
  getStats() {
    const stats: Record<string, number> = {}
    this.clients.forEach((clients, channel) => {
      stats[channel] = clients.size
    })
    return stats
  }
}

// Singleton instance
export const sseManager = new SSEManager()

// Keep-alive interval (every 30 seconds)
if (typeof window === 'undefined') {
  setInterval(() => {
    sseManager.sendKeepAlive()
  }, 30000)
}
