import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/server/middleware/api-auth'
import { sseManager } from '@/server/services/sse-manager.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * SSE Endpoint for Voucher Updates
 * Streams real-time voucher status changes, stats updates, etc.
 */
export async function GET(req: NextRequest) {
  const authCheck = await requirePermission('vouchers.view')
  if (!authCheck.authorized) return authCheck.response
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // Add client to SSE manager
      sseManager.addClient('voucher-updates', controller)

      // Send initial connection event
      const connectMessage = encoder.encode(
        `event: connected\ndata: ${JSON.stringify({ 
          timestamp: new Date().toISOString(),
          message: 'Connected to voucher updates stream' 
        })}\n\n`
      )
      controller.enqueue(connectMessage)

      // Handle client disconnect
      req.signal.addEventListener('abort', () => {
        sseManager.removeClient('voucher-updates', controller)
        try {
          controller.close()
        } catch (e) {
          // Already closed
        }
      })
    },
    cancel() {
      // Cleanup on stream cancel
      console.log('[SSE] Stream cancelled')
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}
