import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { markUserOnline, markUserOffline } from "@/server/cache/online-users.cache";
import { redisDel, RedisKeys } from "@/server/cache/redis";

/**
 * RADIUS Accounting Hook
 * Called by FreeRADIUS REST module for every accounting packet:
 *  - Acct-Status-Type = Start   → user mulai sesi (connect)
 *  - Acct-Status-Type = Stop    → user selesai sesi (disconnect)
 *  - Acct-Status-Type = Interim-Update → update statistik sesi
 *
 * Fungsi utama:
 * 1. Update Redis online-users tracking (Start/Stop)
 * 2. Invalidate RADIUS auth cache saat user disconnect (status bisa berubah)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      username,
      statusType,   // "Start" | "Stop" | "Interim-Update"
      sessionId,
      nasIp,
      framedIp,
      callingStationId,
      sessionTime,
      inputOctets,
      outputOctets,
    } = body;

    if (!username || !statusType) {
      return NextResponse.json({ success: true, action: "ignore" });
    }

    const normalizedStatus = statusType?.toLowerCase();

    // ==================== START ====================
    if (normalizedStatus === "start") {
      // Determine user type: PPPoE or Hotspot
      let userType: "pppoe" | "hotspot" | "unknown" = "unknown";
      try {
        const isPppoe = await prisma.pppoeUser.findUnique({
          where: { username },
          select: { id: true },
        });
        userType = isPppoe ? "pppoe" : "hotspot";
      } catch {
        // non-blocking
      }

      // Mark online di Redis
      await markUserOnline({
        username,
        nasIp: nasIp ?? "",
        framedIp: framedIp ?? "",
        sessionId: sessionId ?? "",
        startTime: new Date().toISOString(),
        type: userType,
        callingStationId: callingStationId || undefined,
        inputOctets: inputOctets ? Number(inputOctets) : 0,
        outputOctets: outputOctets ? Number(outputOctets) : 0,
      });

      console.log(`[ACCOUNTING] START: ${username} (${userType}) from ${nasIp}`);
    }

    // ==================== STOP ====================
    else if (normalizedStatus === "stop") {
      // Mark offline di Redis
      await markUserOffline(username);

      // Invalidate RADIUS auth cache — agar status terbaru diambil dari DB saat reconnect
      await redisDel(RedisKeys.radiusAuth(username));

      console.log(
        `[ACCOUNTING] STOP: ${username} | session ${sessionTime}s | ` +
        `in: ${inputOctets}B out: ${outputOctets}B`
      );
    }

    // ==================== INTERIM UPDATE ====================
    else if (normalizedStatus === "interim-update" || normalizedStatus === "alive") {
      // Update framedIp, MAC, dan bytes di Redis
      // PENTING: JUGA reset TTL agar key tidak expire selama sesi masih aktif.
      // Tanpa EXPIRE, key 2-jam-TTL dari Accounting-Start akan expire meski interim terus masuk.
      const client = await import("@/server/cache/redis").then(m => m.getRedisClient());
      if (client) {
        const detailKey = RedisKeys.onlineUserDetail(username);
        const updates: Record<string, string> = { sessionId: sessionId ?? "" };
        if (framedIp) updates.framedIp = framedIp;
        if (callingStationId) updates.callingStationId = callingStationId;
        if (inputOctets != null) updates.inputOctets = String(Number(inputOctets));
        if (outputOctets != null) updates.outputOctets = String(Number(outputOctets));
        await client.hset(detailKey, updates).catch(() => {});
        // Reset TTL: sesi aktif yang terus mengirim interim tidak boleh expire
        await client.expire(detailKey, 7200).catch(() => {});
      }
    }

    return NextResponse.json({ success: true, action: normalizedStatus });
  } catch (error: any) {
    console.error("[ACCOUNTING] Error:", error);
    // Jangan return error ke FreeRADIUS (bisa menyebabkan accounting failure)
    return NextResponse.json({ success: true, action: "error_ignored" });
  }
}
