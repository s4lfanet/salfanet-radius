import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/server/auth/config'
import { sseManager } from '@/server/services/sse-manager.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * SSE Endpoint for Voucher Updates
 * Streams real-time voucher status changes, stats updates, etc.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
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
