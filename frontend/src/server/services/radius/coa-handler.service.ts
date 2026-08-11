import 'server-only'
import { exec } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink } from 'fs/promises'
import { prisma } from '@/server/db/client'
import { nowWIB } from '@/lib/timezone'
import { RouterOSAPI } from 'node-routeros'

const execAsync = promisify(exec)

/**
 * Mark session as stopped in radacct database
 * This is the primary disconnect method - ensures UI reflects session end
 */
async function markSessionStopped(sessionId: string, username: string, terminateCause: string = 'Admin-Reset'): Promise<boolean> {
  try {
    const session = await prisma.radacct.findFirst({
      where: { acctsessionid: sessionId, acctstoptime: null }
    })
    
    if (!session || !session.acctstarttime) {
      console.log(`[CoA] No active session found for ${username} (${sessionId})`)
      return false
    }
    
    const startTime = session.acctstarttime instanceof Date ? session.acctstarttime : new Date(session.acctstarttime)
    const stopTime = nowWIB() // Use WIB timezone matching DB timestamps
    const sessionDuration = Math.floor((stopTime.getTime() - startTime.getTime()) / 1000)
    
    await prisma.radacct.update({
      where: { radacctid: session.radacctid },
      data: {
        acctstoptime: stopTime,
        acctterminatecause: terminateCause,
        acctsessiontime: sessionDuration > 0 ? sessionDuration : 0
      }
    })
    
    console.log(`[CoA] ✓ Session ${username} marked as stopped in database (${sessionDuration}s)`)
    return true
  } catch (dbError: any) {
    console.error(`[CoA] Database update error for ${username}:`, dbError.message)
    return false
  }
}

/**
 * Send CoA Disconnect to NAS to force logout a user
 * Requires radclient to be installed: apt-get install freeradius-utils
 * 
 * Priority approach:
 * 1. ALWAYS mark session in database FIRST (guaranteed to work)
 * 2. Try CoA Disconnect (bonus if Mikrotik responds)
 * 3. Session Timeout in radgroupreply (backup protection)
 */
export async function sendCoADisconnect(
  username: string, 
  nasIpAddress: string, 
  nasSecret: string,
  sessionId?: string,
  framedIp?: string
) {
  let dbSuccess = false
  let coaSuccess = false
  
  // STEP 1: ALWAYS mark session in database FIRST
  // This ensures UI shows session as terminated regardless of CoA result
  if (sessionId) {
    dbSuccess = await markSessionStopped(sessionId, username, 'Admin-Reset')
  }
  
  // STEP 2: Try CoA Disconnect (optional - if Mikrotik is configured correctly)
  try {
    // Create CoA disconnect packet attributes for MikroTik
    // MikroTik requires specific attributes to match the session
    let coaAttributes = []
    
    // REQUIRED: NAS-IP-Address - identifies which NAS to disconnect from
    coaAttributes.push(`NAS-IP-Address=${nasIpAddress}`)
    
    // PRIMARY identifier: Framed-IP-Address (most reliable for MikroTik)
    if (framedIp) {
      coaAttributes.push(`Framed-IP-Address=${framedIp}`)
    }
    
    // SECONDARY identifier: User-Name
    coaAttributes.push(`User-Name=${username}`)
    
    // TERTIARY identifier: Acct-Session-Id
    if (sessionId) {
      coaAttributes.push(`Acct-Session-Id=${sessionId}`)
    }
    
    // OPTIONAL: Calling-Station-Id (MAC address) - helps some Mikrotik versions
    // Try to get MAC address from active session
    if (sessionId) {
      try {
        const session = await prisma.radacct.findFirst({
          where: { acctsessionid: sessionId },
          select: { callingstationid: true }
        })
        
        if (session?.callingstationid) {
          coaAttributes.push(`Calling-Station-Id=${session.callingstationid}`)
        }
      } catch (e) {
        // MAC not critical, continue without it
      }
    }
    
    // Create temp file with attributes (avoids shell quoting issues)
    const tmpFile = `/tmp/coa-${Date.now()}.txt`
    const coaPacket = coaAttributes.join('\n') + '\n'
    
    try {
      await writeFile(tmpFile, coaPacket)
    } catch (fsError: any) {
      console.error(`[CoA] Failed to write temp file:`, fsError.message)
      // Return success if DB update worked
      return { 
        success: dbSuccess, 
        message: dbSuccess ? 'Session marked in database' : 'Failed',
        error: `Filesystem error: ${fsError.message}` 
      }
    }
    
    // Send CoA Disconnect-Request using radclient
    // Port 3799 is CoA/DM port (RFC 5176)
    // -t 2 = timeout 2 seconds, -r 1 = retry 1 time (faster, we have DB fallback)
    const command = `radclient -d /usr/share/freeradius -t 2 -r 1 -x ${nasIpAddress}:3799 disconnect ${nasSecret} < ${tmpFile} 2>&1`
    
    console.log(`[CoA] Sending to ${nasIpAddress}:3799...`)
    
    const { stdout, stderr } = await execAsync(command, { timeout: 8000 })
    
    // Cleanup temp file
    try { 
      await unlink(tmpFile) 
    } catch (e) {
      // Ignore cleanup errors
    }
    
    // Check if response indicates success
    // radclient outputs "Received Disconnect-ACK" on success
    // code 44 = Disconnect-ACK (RFC 5176)
    coaSuccess = stdout.includes('Disconnect-ACK') ||
                 stdout.includes('code 44')    // Disconnect-ACK numeric code
    
    if (coaSuccess) {
      console.log(`[CoA] ✓ Mikrotik ACK received for ${username}`)
    } else {
      console.log(`[CoA] ⚠ No ACK from Mikrotik (session already marked in DB)`)
    }
    
    // Return success if EITHER DB or CoA worked
    return { 
      success: dbSuccess || coaSuccess, 
      message: coaSuccess 
        ? `Mikrotik disconnected ${username}` 
        : dbSuccess 
          ? `Session marked in database (Mikrotik will timeout)` 
          : 'Failed',
      coaSuccess,
      dbSuccess
    }
  } catch (error: any) {
    console.error(`[CoA] Error sending CoA for ${username}:`, error.message)
    
    // Return success if DB update worked (which we did first)
    return { 
      success: dbSuccess, 
      message: dbSuccess ? 'Session marked in database (CoA failed)' : 'Failed',
      error: error.message,
      dbSuccess
    }
  }
}

/**
 * Disconnect all expired sessions
 * This should run periodically (every minute via cron)
 */
export async function disconnectExpiredSessions() {
  try {
    console.log('[CoA] Checking for expired active sessions...')
    
    // Get all active sessions from radacct where user has no stop time
    const activeSessions = await prisma.radacct.findMany({
      where: {
        acctstoptime: null,
      },
      select: {
        username: true,
        nasipaddress: true,
        acctsessionid: true,
        framedipaddress: true,
      },
    })
    
    if (activeSessions.length === 0) {
      return { disconnected: 0 }
    }
    
    let disconnectedCount = 0
    const now = nowWIB() // Use WIB to match DB timestamps
    
    for (const session of activeSessions) {
      try {
        // Check if voucher exists and is expired (by status OR by expiresAt)
        const voucher = await prisma.hotspotVoucher.findUnique({
          where: { code: session.username },
        })
        
        // Skip if not a voucher user (might be PPPoE)
        if (!voucher) {
          continue
        }
        
        // Check if voucher is expired: either status is EXPIRED or expiresAt has passed
        const isExpired = voucher.status === 'EXPIRED' || 
          (voucher.expiresAt && new Date(voucher.expiresAt) < now)
        
        if (!isExpired) {
          continue // Not expired, skip
        }
        
        console.log(`[CoA] Voucher ${session.username} is expired (status: ${voucher.status}, expiresAt: ${voucher.expiresAt})`)
        
        // Get NAS - try exact match first, then any NAS with matching secret
        let nas = await prisma.router.findFirst({
          where: { nasname: session.nasipaddress },
        })
        
        // If not found by nasipaddress, try to find by looking up radacct's calledstationid
        // or use the first available NAS (for cases where MikroTik sends local IP)
        if (!nas) {
          // Try to find any active NAS router
          nas = await prisma.router.findFirst({
            where: { isActive: true },
            orderBy: { createdAt: 'desc' },
          })
          
          if (!nas) {
            console.log(`[CoA] No NAS found for ${session.nasipaddress}`)
            continue
          }
          console.log(`[CoA] Using NAS ${nas.nasname} for session from ${session.nasipaddress}`)
        }
        
        // Determine target IP for CoA - use ipAddress (public IP) if different from nasname
        // This handles cases where radacct has local IP but we need to send CoA to public IP
        const coaTargetIp = nas.ipAddress && nas.ipAddress !== nas.nasname 
          ? nas.ipAddress 
          : nas.nasname
        
        // Send CoA Disconnect with session ID and IP
        const result = await sendCoADisconnect(
          session.username, 
          coaTargetIp, 
          nas.secret,
          session.acctsessionid,
          session.framedipaddress
        )
        
        if (result.success) {
          disconnectedCount++
          console.log(`[CoA] Disconnected expired session: ${session.username}`)
          
          // Also update voucher status to EXPIRED if not already
          if (voucher.status !== 'EXPIRED') {
            await prisma.hotspotVoucher.update({
              where: { id: voucher.id },
              data: { status: 'EXPIRED' },
            })
            console.log(`[CoA] Updated voucher ${session.username} status to EXPIRED`)
          }
        }
      } catch (err: any) {
        console.error(`[CoA] Error processing session ${session.username}:`, err.message)
      }
    }
    
    console.log(`[CoA] Disconnected ${disconnectedCount} expired sessions`)
    
    return { disconnected: disconnectedCount }
  } catch (err) {
    console.error('[CoA] Disconnect error:', err)
    throw err
  }
}

/**
 * Helper: wrap a promise with a hard timeout (kills hanging TCP connections).
 * node-routeros `timeout` only applies after TCP connect, NOT during SYN phase.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    promise.then(
      v => { clearTimeout(timer); resolve(v) },
      e => { clearTimeout(timer); reject(e) },
    )
  })
}

/**
 * Disconnect PPPoE user session by username.
 *
 * Strategy (in order):
 * 1. Mark session stopped in database (instant, always works)
 * 2. RADIUS CoA Disconnect-Request via radclient (fast UDP)
 * 3. MikroTik RouterOS API /ppp/active/remove (with TLS + hard timeout)
 *
 * DB is marked FIRST so the UI reflects the disconnect immediately.
 * CoA + API are best-effort to actually drop the PPPoE tunnel on MikroTik.
 */
export async function disconnectPPPoEUser(username: string) {
  try {
    console.log(`[CoA] Disconnecting PPPoE user: ${username}`)

    // Find active session for this user
    const activeSession = await prisma.radacct.findFirst({
      where: { username, acctstoptime: null },
      orderBy: { acctstarttime: 'desc' },
    })

    if (!activeSession) {
      console.log(`[CoA] No active session found for ${username}`)
      return { success: true, message: 'No active session' }
    }

    // Get NAS configuration — exact match first, then any active NAS
    let nas = await prisma.router.findFirst({
      where: { nasname: activeSession.nasipaddress },
    })
    if (!nas) {
      nas = await prisma.router.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
      })
    }
    if (!nas) {
      console.log(`[CoA] NAS not found for ${activeSession.nasipaddress}`)
      return { success: false, error: 'NAS not configured' }
    }

    // Determine target IP (VPN-reachable management IP if available)
    const coaTargetIp = nas.ipAddress && nas.ipAddress !== nas.nasname
      ? nas.ipAddress
      : nas.nasname

    // ── STEP 1: Mark DB stopped FIRST (instant, guaranteed) ──────────────
    let dbSuccess = false
    if (activeSession.acctsessionid) {
      dbSuccess = await markSessionStopped(activeSession.acctsessionid, username, 'Admin-Reset')
    }

    // ── STEP 2: CoA Disconnect-Request (fast UDP, 2s timeout) ────────────
    let coaSuccess = false
    try {
      const coaResult = await sendCoADisconnect(
        activeSession.username,
        coaTargetIp,
        nas.secret,
        activeSession.acctsessionid,
        activeSession.framedipaddress
      )
      coaSuccess = coaResult.coaSuccess || false
    } catch (coaErr: any) {
      console.log(`[CoA] CoA failed for ${username}: ${coaErr?.message}`)
    }

    // ── STEP 3: MikroTik API disconnect (with TLS + hard 5s timeout) ─────
    let apiSuccess = false
    if (nas.username && nas.password) {
      const primaryPort = (nas as any).apiPort || 8729
      const fallbackPort = (nas as any).port || 8728
      const portsToTry = [primaryPort, ...(fallbackPort !== primaryPort ? [fallbackPort] : [])]

      for (const tryPort of portsToTry) {
        if (apiSuccess) break
        try {
          const apiResult = await withTimeout(
            (async () => {
              const apiOpts: any = {
                host: coaTargetIp,
                port: tryPort,
                user: nas!.username,
                password: nas!.password,
                timeout: 3,
              }
              // Enable TLS for API-SSL port (8729)
              if (tryPort === 8729 || tryPort === (nas as any).apiPort) {
                apiOpts.tls = { rejectUnauthorized: false }
              }
              const api = new RouterOSAPI(apiOpts)
              await api.connect()
              const activePPP = await api.write('/ppp/active/print')
              const pppSession = activePPP.find(
                (p: any) => p.name === username || p.username === username
              )
              if (pppSession) {
                await api.write('/ppp/active/remove', [`=.id=${pppSession['.id']}`])
                try { await api.close() } catch {}
                return true
              }
              try { await api.close() } catch {}
              return false
            })(),
            5000,
            `MikroTik API ${coaTargetIp}:${tryPort}`
          )
          if (apiResult) {
            apiSuccess = true
            console.log(`[CoA] ✓ MikroTik API disconnect OK for ${username} (${coaTargetIp}:${tryPort})`)
          } else {
            console.log(`[CoA] No active PPP found via API for ${username} (port ${tryPort})`)
          }
        } catch (apiErr: any) {
          console.log(`[CoA] MikroTik API failed on port ${tryPort}: ${apiErr?.message}`)
        }
      }
    }

    const success = dbSuccess || coaSuccess || apiSuccess
    console.log(`[CoA] ${username} disconnect result: db=${dbSuccess}, coa=${coaSuccess}, api=${apiSuccess}`)

    return {
      success,
      message: apiSuccess
        ? `MikroTik API disconnected ${username}`
        : coaSuccess
          ? `CoA disconnected ${username}`
          : dbSuccess
            ? `Session marked stopped in DB`
            : 'All disconnect methods failed',
      apiSuccess,
      coaSuccess,
      dbSuccess,
    }
  } catch (error: any) {
    console.error(`[CoA] Error disconnecting PPPoE user ${username}:`, error.message)
    return { success: false, error: error.message }
  }
}

/**
 * Disconnect multiple PPPoE users
 */
export async function disconnectMultiplePPPoEUsers(usernames: string[]) {
  const results = await Promise.allSettled(
    usernames.map(username => disconnectPPPoEUser(username))
  )
  
  const disconnected = results.filter(r => r.status === 'fulfilled').length
  
  return {
    total: usernames.length,
    disconnected,
    failed: usernames.length - disconnected,
  }
}

/**
 * Add a framed IP address to a MikroTik firewall address-list immediately.
 * This blocks internet access for the session even before the user disconnects
 * and reconnects (which is when RADIUS would normally apply the isolir group).
 *
 * Requires:
 *   - MikroTik API credentials on the router record
 *   - A firewall filter rule on MikroTik: chain=forward src-address-list=isolir action=drop
 */
export async function addToMikrotikAddressList(
  nasIpAddress: string,
  framedIp: string,
  listName: string = 'isolir'
): Promise<boolean> {
  if (!framedIp || framedIp === '0.0.0.0') return false

  // Find router with API credentials
  let nas = await prisma.router.findFirst({ where: { nasname: nasIpAddress } })
  if (!nas) {
    nas = await prisma.router.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    })
  }
  if (!nas || !nas.username || !nas.password) {
    console.log(`[CoA] addToMikrotikAddressList: no NAS with API credentials for ${nasIpAddress}`)
    return false
  }

  const targetIp = nas.ipAddress && nas.ipAddress !== nas.nasname ? nas.ipAddress : nas.nasname
  const portsToTry = [nas.apiPort, nas.port].filter((p, i, arr) => p && arr.indexOf(p) === i) as number[]

  for (const port of portsToTry) {
    try {
      const result = await withTimeout(
        (async () => {
          const apiOpts: any = {
            host: targetIp,
            port,
            user: nas!.username,
            password: nas!.password,
            timeout: 3,
          }
          if (port === 8729 || port === nas!.apiPort) {
            apiOpts.tls = { rejectUnauthorized: false }
          }
          const api = new RouterOSAPI(apiOpts)
          await api.connect()

          // Check if already in list
          const existing = await api.write('/ip/firewall/address-list/print', [
            `?list=${listName}`,
            `?address=${framedIp}`,
          ])

          if (!existing || existing.length === 0) {
            await api.write('/ip/firewall/address-list/add', [
              `=list=${listName}`,
              `=address=${framedIp}`,
              `=comment=auto-isolated`,
            ])
          }

          try { await api.close() } catch {}
          return true
        })(),
        5000,
        `MikroTik API AddressList ${targetIp}:${port}`
      )

      if (result) {
        console.log(`[CoA] ✓ Added ${framedIp} to address-list '${listName}' on ${targetIp}:${port}`)
        return true
      }
    } catch (err: any) {
      console.log(`[CoA] addToMikrotikAddressList port ${port}: ${err?.message}`)
    }
  }

  return false
}

export default {
  sendCoADisconnect,
  disconnectExpiredSessions,
  disconnectPPPoEUser,
  disconnectMultiplePPPoEUsers,
  addToMikrotikAddressList,
}
