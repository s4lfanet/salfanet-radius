import { prisma } from '@/server/db/client';
import { WhatsAppService } from '@/server/services/notifications/whatsapp.service';
import { EmailService } from '@/server/services/notifications/email.service';
import { sendPushToUser } from '@/server/services/notifications/push-templates.service';

/**
 * Enhanced Auto-Isolation for expired PPPoE users
 * 
 * IMPORTANT: This uses TRUE ISOLATION (allow login, restrict via firewall)
 * NOT suspension (block login completely)
 * 
 * Workflow:
 * 1. Find expired users (expiredAt < NOW and status != isolated)
 * 2. Update status to 'isolated'
 * 3. KEEP password in radcheck (allow authentication)
 * 4. Set radusergroup to 'isolir' (RADIUS assigns isolated profile)
 * 5. Remove static IP (user gets IP from pool-isolir: 192.168.200.x)
 * 6. Disconnect user session (force re-auth with new group)
 * 7. On re-login: RADIUS assigns:
 *    - IP from pool-isolir (192.168.200.x)
 *    - Rate limit (e.g., 64k/64k)
 *    - MikroTik firewall restricts access (only DNS + billing + payment)
 */
export async function autoIsolateExpiredUsers() {
  try {
    console.log('[AUTO-ISOLATE] Starting auto-isolation check...');

    // Find users that should be isolated (respect per-user autoIsolationEnabled setting)
    const expiredUsers = await prisma.pppoeUser.findMany({
      where: {
        expiredAt: {
          lt: new Date(), // expired
        },
        status: {
          notIn: ['isolated', 'suspended', 'blocked', 'stop'], // not already isolated
        },
        autoIsolationEnabled: true, // skip users who opted out of auto-isolation
      },
      select: {
        id: true,
        username: true,
        name: true,
        password: true,
        phone: true,
        email: true,
        expiredAt: true,
      },
    });

    if (expiredUsers.length === 0) {
      console.log('[AUTO-ISOLATE] ✅ No users to isolate');
      return {
        success: true,
        isolatedCount: 0,
        message: 'No users need isolation',
      };
    }

    console.log(`[AUTO-ISOLATE] Found ${expiredUsers.length} expired users to isolate`);

    let isolatedCount = 0;
    const errors: string[] = [];

    for (const user of expiredUsers) {
      try {
        console.log(`[AUTO-ISOLATE] Processing: ${user.username}`);

        // 1. Update user status to isolated
        await prisma.pppoeUser.update({
          where: { id: user.id },
          data: { status: 'isolated' },
        });

        // 2. KEEP password in radcheck (ALLOW authentication!)
        // This is critical - user MUST be able to login
        await prisma.$executeRaw`
          INSERT INTO radcheck (username, attribute, op, value)
          VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password})
          ON DUPLICATE KEY UPDATE value = ${user.password}
        `;

        // 2b. REMOVE Auth-Type Reject if exists (allow login!)
        await prisma.$executeRaw`
          DELETE FROM radcheck 
          WHERE username = ${user.username} 
            AND attribute = 'Auth-Type'
        `;

        // 2c. REMOVE reject message if exists
        await prisma.$executeRaw`
          DELETE FROM radreply 
          WHERE username = ${user.username} 
            AND attribute = 'Reply-Message'
        `;

        // 4. Set radusergroup to 'isolir'
        // This tells RADIUS to assign isolated profile
        await prisma.$executeRaw`
          DELETE FROM radusergroup WHERE username = ${user.username}
        `;
        await prisma.$executeRaw`
          INSERT INTO radusergroup (username, groupname, priority)
          VALUES (${user.username}, 'isolir', 1)
        `;

        // 5. Remove static IP assignment
        // User will get IP from pool-isolir (192.168.200.x)
        await prisma.$executeRaw`
          DELETE FROM radreply 
          WHERE username = ${user.username} 
            AND attribute = 'Framed-IP-Address'
        `;

        // 5. Disconnect user session (force re-authentication)  
        try {
          // Use CoA disconnect (handles DB + CoA + API fallback internally)
          const { disconnectPPPoEUser } = await import('@/server/services/radius/coa-handler.service');
          await disconnectPPPoEUser(user.username);
          console.log(`[AUTO-ISOLATE] ✅ Disconnected ${user.username} via CoA`);
        } catch (coaError: any) {
          console.log(`[AUTO-ISOLATE] ❌ Disconnect failed: ${coaError.message}`);
        }

        // 6. Close session in radacct
        await prisma.$executeRaw`
          UPDATE radacct 
          SET acctstoptime = NOW(), 
              acctterminatecause = 'User-Isolated'
          WHERE username = ${user.username} 
            AND acctstoptime IS NULL
        `;

        // 7. Create activity log
        await prisma.activityLog.create({
          data: {
            userId: user.id,
            username: user.username,
            userRole: 'user',
            action: 'ISOLATED',
            description: `User ${user.username} auto-isolated due to expiration (${user.expiredAt?.toISOString() || 'unknown'})`,
            module: 'isolation',
            status: 'success',
            ipAddress: 'system',
          },
        }).catch(() => {}); // Ignore if activityLog doesn't exist

        isolatedCount++;
        console.log(`[AUTO-ISOLATE] ✅ Successfully isolated ${user.username}`);

        // 8. Send notification (optional)
        try {
          await sendIsolationNotification(user);
        } catch (notifError) {
          console.log(`[AUTO-ISOLATE] ⚠️ Notification failed for ${user.username}`);
        }

      } catch (userError: any) {
        const errorMsg = `Failed to isolate ${user.username}: ${userError.message}`;
        console.error(`[AUTO-ISOLATE] ❌ ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    const result = {
      success: true,
      isolatedCount,
      totalProcessed: expiredUsers.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully isolated ${isolatedCount} out of ${expiredUsers.length} users`,
    };

    console.log(`[AUTO-ISOLATE] ✅ Complete: ${JSON.stringify(result)}`);
    return result;

  } catch (error: any) {
    console.error('[AUTO-ISOLATE] ❌ Fatal error:', error);
    return {
      success: false,
      error: error.message,
      message: 'Auto-isolation failed',
    };
  }
}

/**
 * Send isolation notification to customer via WhatsApp, Email, and Web/FCM Push.
 * Respects company settings: isolationNotifyWhatsapp / isolationNotifyEmail.
 * Push is always attempted if the user has registered push subscriptions/FCM tokens.
 */
export async function sendIsolationNotification(user: {
  id: string;
  username: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  expiredAt?: Date | null;
}) {
  try {
    const company = await prisma.company.findFirst();
    if (!company) return;

    const baseUrl = company.baseUrl || 'http://localhost:3000';
    const isolatedUrl = `${baseUrl}/isolated?username=${encodeURIComponent(user.username)}`;
    const expiredDate = user.expiredAt
      ? new Date(user.expiredAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
      : '-';
    const rateLimit = (company as any).isolationRateLimit || '64k/64k';

    const templateVars: Record<string, string> = {
      customerName: user.name || user.username,
      username: user.username,
      expiredDate,
      rateLimit,
      paymentLink: isolatedUrl,
      isolatedUrl,
      qrCode: isolatedUrl,
      companyName: company.name || '',
      companyPhone: company.phone || '',
      companyEmail: company.email || '',
    };

    // ── WhatsApp ────────────────────────────────────────────────────────────
    if (company.isolationNotifyWhatsapp && user.phone) {
      try {
        // Prefer DB isolation template; fall back to plain message
        const waTemplate = await prisma.isolationTemplate.findFirst({
          where: { type: 'whatsapp', isActive: true },
        });

        let message: string;
        if (waTemplate?.message) {
          message = waTemplate.message;
          for (const [key, val] of Object.entries(templateVars)) {
            message = message.replace(new RegExp(`{{${key}}}`, 'g'), val);
          }
        } else {
          message =
            `🚫 *Layanan Internet Diisolir*\n\n` +
            `Halo ${templateVars.customerName},\n\n` +
            `Akun internet Anda (*${user.username}*) telah diisolir karena masa berlangganan habis.\n\n` +
            `📅 Expired: ${expiredDate}\n\n` +
            `Untuk mengaktifkan kembali, buka halaman berikut dan lakukan pembayaran:\n🔗 ${isolatedUrl}\n\n` +
            `Butuh bantuan?\n📞 ${company.phone || '-'}\n\n` +
            `Terima kasih,\n*${company.name}*`;
        }

        await WhatsAppService.sendMessage({ phone: user.phone, message });
        console.log(`[Isolation] ✅ WhatsApp sent to ${user.username} (${user.phone})`);
      } catch (err: any) {
        console.error(`[Isolation] ⚠️ WhatsApp failed for ${user.username}:`, err.message);
      }
    }

    // ── Email ───────────────────────────────────────────────────────────────
    if (company.isolationNotifyEmail && user.email) {
      try {
        const emailTemplate = await prisma.isolationTemplate.findFirst({
          where: { type: 'email', isActive: true },
        });

        let htmlBody: string;
        let subject: string;
        if (emailTemplate?.message) {
          htmlBody = emailTemplate.message;
          subject = emailTemplate.subject || `⚠️ Akun Anda Telah Diisolir - ${user.username}`;
          for (const [key, val] of Object.entries(templateVars)) {
            htmlBody = htmlBody.replace(new RegExp(`{{${key}}}`, 'g'), val);
            subject = subject.replace(new RegExp(`{{${key}}}`, 'g'), val);
          }
        } else {
          subject = `⚠️ Layanan Internet Diisolir - ${user.username}`;
          htmlBody = `
            <h2>Layanan Internet Diisolir</h2>
            <p>Halo <strong>${templateVars.customerName}</strong>,</p>
            <p>Akun internet Anda (<strong>${user.username}</strong>) telah diisolir karena masa berlangganan habis.</p>
            <p><strong>Tanggal Expired:</strong> ${expiredDate}</p>
            <p>Untuk mengaktifkan kembali layanan, silakan lakukan pembayaran:</p>
            <p><a href="${isolatedUrl}" style="background:#e11d48;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Buka Halaman Isolir & Bayar</a></p>
            <p>Atau hubungi kami di ${company.phone || '-'}</p>
            <p>Terima kasih,<br>${company.name}</p>
          `;
        }

        await EmailService.send({
          to: user.email,
          toName: user.name,
          subject,
          html: htmlBody,
        });
        console.log(`[Isolation] ✅ Email sent to ${user.username} (${user.email})`);
      } catch (err: any) {
        console.error(`[Isolation] ⚠️ Email failed for ${user.username}:`, err.message);
      }
    }

    // ── Web/FCM Push ────────────────────────────────────────────────────────
    try {
      // Find the first overdue invoice for this user (for amount/dueDate in push body)
      const overdueInvoice = await prisma.invoice.findFirst({
        where: { userId: user.id, status: { in: ['PENDING', 'OVERDUE'] } },
        orderBy: { dueDate: 'asc' },
        select: { amount: true, dueDate: true, invoiceNumber: true },
      });

      await sendPushToUser(user.id, 'isolation-notice', {
        customerName: user.name || user.username,
        username: user.username,
        amount: overdueInvoice?.amount,
        dueDate: overdueInvoice?.dueDate || undefined,
        invoiceNumber: overdueInvoice?.invoiceNumber,
        companyName: company.name || '',
        companyPhone: company.phone || '',
      });
      console.log(`[Isolation] ✅ Push sent to ${user.username}`);
    } catch (err: any) {
      console.error(`[Isolation] ⚠️ Push failed for ${user.username}:`, err.message);
    }
  } catch (error: any) {
    console.error(`[Isolation] ⚠️ Notification error for ${user.username}:`, error.message);
  }
}

/**
 * Manual isolation trigger (for admin)
 */
export async function isolateUser(username: string, reason?: string) {
  try {
    const user = await prisma.pppoeUser.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        name: true,
        password: true,
        status: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    if (user.status === 'isolated') {
      return {
        success: true,
        message: 'User already isolated',
      };
    }

    // Same isolation logic as auto-isolate
    await prisma.pppoeUser.update({
      where: { id: user.id },
      data: { status: 'isolated' },
    });

    // Keep password, remove Auth-Type Reject
    await prisma.$executeRaw`
      INSERT INTO radcheck (username, attribute, op, value)
      VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password})
      ON DUPLICATE KEY UPDATE value = ${user.password}
    `;

    await prisma.$executeRaw`
      DELETE FROM radcheck 
      WHERE username = ${user.username} 
        AND attribute = 'Auth-Type'
    `;

    // Set isolir group
    await prisma.$executeRaw`
      DELETE FROM radusergroup WHERE username = ${user.username}
    `;
    await prisma.$executeRaw`
      INSERT INTO radusergroup (username, groupname, priority)
      VALUES (${user.username}, 'isolir', 1)
    `;

    // Remove static IP
    await prisma.$executeRaw`
      DELETE FROM radreply 
      WHERE username = ${user.username} 
        AND attribute = 'Framed-IP-Address'
    `;

    // Disconnect
    try {
      const { disconnectPPPoEUser } = await import('@/server/services/radius/coa-handler.service');
      await disconnectPPPoEUser(user.username);
    } catch (err) {
      console.log('Disconnect failed, but isolation applied');
    }

    // Close session
    await prisma.$executeRaw`
      UPDATE radacct 
      SET acctstoptime = NOW(), 
          acctterminatecause = 'Admin-Isolate'
      WHERE username = ${user.username} 
        AND acctstoptime IS NULL
    `;

    return {
      success: true,
      message: `User ${username} isolated successfully`,
    };

  } catch (error: any) {
    console.error('[ISOLATE-USER] Error:', error);
    throw error;
  }
}
