import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { redisGet, redisSet, redisDel, RedisKeys } from "@/server/cache/redis";

/**
 * RADIUS Authorize Hook
 * Called BEFORE authentication to check if voucher is allowed to login
 *
 * Menggunakan Redis cache (TTL 60 detik) untuk PPPoE user status.
 * Mengurangi beban MySQL saat banyak user reconnect bersamaan.
 *
 * Returns reject if:
 * 1. Voucher is expired
 * 2. Voucher status is EXPIRED
 * 3. Voucher has expiresAt in the past
 */
export async function POST(request: NextRequest) {
  let username: string | undefined;
  try {
    // Use text() + manual parse (more compatible than request.json())
    const rawBody = await request.text();
    const body = JSON.parse(rawBody);
    username = body.username;

    if (!username) {
      return NextResponse.json({});
    }

    // Check if this is a hotspot voucher
    const voucher = await prisma.hotspotVoucher.findUnique({
      where: { code: username },
      include: { profile: true },
    });

    // If not a voucher, check if it's a PPPoE user
    if (!voucher) {
      // ---- Redis cache untuk PPPoE user status ----
      const cacheKey = RedisKeys.radiusAuth(username);
      let pppoeUser: { id: string; username: string; status: string; expiredAt: Date | null; name: string | null } | null = null;
      const cached = await redisGet(cacheKey);

      if (cached !== null) {
        pppoeUser = JSON.parse(cached);
      } else {
        pppoeUser = await prisma.pppoeUser.findUnique({
          where: { username },
          select: {
            id: true,
            username: true,
            status: true,
            expiredAt: true,
            name: true,
          },
        });
        // Cache 60 detik (status tidak berubah terlalu sering)
        if (pppoeUser !== null) {
          await redisSet(cacheKey, JSON.stringify(pppoeUser), 60);
        }
      }

      // Check if PPPoE user is blocked, stopped, or expired
      // NOTE: isolated users are NOT rejected - they login with restricted access
      if (pppoeUser) {
        const now = new Date();

        if (pppoeUser.status === 'blocked') {
          const message = 'Akun Diblokir - Hubungi Admin';
          console.log(`[AUTHORIZE] REJECT: PPPoE user ${username} is blocked`);
          await logRejection(username, message);
          return NextResponse.json({
            "control:Auth-Type": "Reject",
            "reply:Reply-Message": message
          }, { status: 200 });
        }

        if (pppoeUser.status === 'stop') {
          const message = 'Langganan Dihentikan - Hubungi Admin';
          console.log(`[AUTHORIZE] REJECT: PPPoE user ${username} is stopped`);
          await logRejection(username, message);
          return NextResponse.json({
            "control:Auth-Type": "Reject",
            "reply:Reply-Message": message
          }, { status: 200 });
        }

        // Izinkan user isolated untuk login dengan profile 'isolir' (redirect ke halaman bayar)
        // radusergroup sudah di-set ke 'isolir' oleh auto-isolation job
        if (pppoeUser.status === 'isolated') {
          console.log(`[AUTHORIZE] ALLOW (isolated): PPPoE user ${username} in isolir profile`);
          return NextResponse.json({
            success: true,
            action: "allow",
            message: `PPPoE user isolated - allowing with isolir profile`
          });
        }

        // Cek apakah masa aktif sudah habis (expiredAt lewat)
        if (pppoeUser.expiredAt && now > new Date(pppoeUser.expiredAt)) {
          const message = 'Masa Aktif Habis - Segera Bayar Tagihan';
          console.log(`[AUTHORIZE] REJECT: PPPoE user ${username} expired at ${pppoeUser.expiredAt}`);
          // Invalidate cache agar status terbaru bisa diambil setelah dibayar
          await redisDel(RedisKeys.radiusAuth(username));
          await logRejection(username, message);
          return NextResponse.json({
            "control:Auth-Type": "Reject",
            "reply:Reply-Message": message
          }, { status: 200 });
        }
      }

      // PPPoE user is active or not found, allow to continue to normal auth
      // Return empty object — FreeRADIUS REST module parses JSON keys as RADIUS attributes.
      // Keys like "success", "action" are not valid RADIUS attributes and produce warnings.
      return NextResponse.json({});
    }

    const now = new Date();

    // Check 1: Voucher status is EXPIRED
    if (voucher.status === 'EXPIRED') {
      console.log(`[AUTHORIZE] REJECT: Voucher ${username} is EXPIRED (status)`);
      
      // Log rejection to radpostauth with descriptive reply
      await logRejection(username, 'Kode Voucher Kadaluarsa');
      
      // Return with control attributes for FreeRADIUS
      return NextResponse.json({
        "control:Auth-Type": "Reject",
        "reply:Reply-Message": "Kode Voucher Kadaluarsa"
      }, { status: 200 }); // Return 200 but with Reject auth type
    }

    // Check 2: Voucher has expiresAt in the past
    if (voucher.expiresAt && now > voucher.expiresAt) {
      console.log(`[AUTHORIZE] REJECT: Voucher ${username} expired at ${voucher.expiresAt.toISOString()}`);
      
      // Auto-update status to EXPIRED
      await prisma.hotspotVoucher.update({
        where: { id: voucher.id },
        data: { status: "EXPIRED" },
      });

      // Log rejection to radpostauth with time info
      await logRejection(username, 'Kode Voucher Kadaluarsa');
      
      return NextResponse.json({
        "control:Auth-Type": "Reject",
        "reply:Reply-Message": "Kode Voucher Kadaluarsa"
      }, { status: 200 });
    }

    // Check 3: If voucher has active session and it's expired
    // (Session timeout exceeded)
    if (voucher.firstLoginAt && voucher.expiresAt) {
      const activeSession = await prisma.radacct.findFirst({
        where: {
          username: voucher.code,
          acctstoptime: null, // Still active
        },
        orderBy: { acctstarttime: 'desc' }
      });

      if (activeSession && now > voucher.expiresAt) {
        console.log(`[AUTHORIZE] REJECT: Session for ${username} exceeded time limit`);
        
        // Log rejection to radpostauth
        await logRejection(username, 'Waktu Habis - Voucher Kadaluarsa');
        
        return NextResponse.json({
          "control:Auth-Type": "Reject",
          "reply:Reply-Message": "Waktu Habis - Voucher Kadaluarsa"
        }, { status: 200 });
      }
    }

    // Voucher is valid, allow authentication to proceed
    // Set Cleartext-Password = username so FreeRADIUS PAP/CHAP can verify
    // (hotspot voucher code is used as BOTH username and password)
    console.log(`[AUTHORIZE] ALLOW: Voucher ${username} is valid (status: ${voucher.status})`);
    
    return NextResponse.json({
      "control:Cleartext-Password": username,
    });

  } catch (error: any) {
    console.error("[AUTHORIZE] Error:", error);
    
    // On error, allow FreeRADIUS to proceed to SQL/radcheck lookup.
    // Do NOT set Cleartext-Password here — hotspot voucher passwords are stored
    // in radcheck (via hotspot-sync), and PPPoE user passwords are in radcheck too.
    // Setting username as Cleartext-Password would break PPPoE auth when username ≠ password.
    // Return empty object so FreeRADIUS REST doesn't fail on invalid attribute names.
    return NextResponse.json({});
  }
}

/**
 * Log authentication rejection to radpostauth table
 * This shows up in FreeRADIUS logs and can be queried
 */
async function logRejection(username: string, replyMessage: string) {
  try {
    await prisma.radpostauth.create({
      data: {
        username: username,
        pass: replyMessage, // Store rejection reason in pass field
        reply: 'Access-Reject',
        authdate: new Date(),
      },
    });
    
    console.log(`[AUTHORIZE] Logged rejection for ${username}: ${replyMessage}`);
  } catch (error) {
    console.error('[AUTHORIZE] Failed to log rejection:', error);
  }
}
