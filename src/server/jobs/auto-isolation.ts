import { prisma } from '@/server/db/client';
import { disconnectPPPoEUser } from '@/server/services/radius/coa-handler.service';

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

    // Find users that should be isolated
    const expiredUsers = await prisma.pppoeUser.findMany({
      where: {
        expiredAt: {
          lt: new Date(), // expired
        },
        status: {
          notIn: ['isolated', 'suspended', 'blocked', 'stop'], // not already isolated
        },
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
          // Try MikroTik API first
          const { disconnectViaMikrotikAPI } = await import('./pppoe-sync');
          await disconnectViaMikrotikAPI(user.username);
          console.log(`[AUTO-ISOLATE] ✅ Disconnected ${user.username} via MikroTik API`);
        } catch (apiError) {
          console.log(`[AUTO-ISOLATE] ⚠️ MikroTik API failed, trying CoA...`);
          
          // Fallback to CoA
          try {
            await disconnectPPPoEUser(user.username);
            console.log(`[AUTO-ISOLATE] ✅ Disconnected ${user.username} via CoA`);
          } catch (coaError: any) {
            console.log(`[AUTO-ISOLATE] ❌ CoA failed: ${coaError.message}`);
          }
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
 * Send isolation notification via WhatsApp/Email
 */
async function sendIsolationNotification(user: any) {
  try {
    // Get company settings
    const company = await prisma.company.findFirst();
    if (!company) return;

    // Prepare notification data
    const notificationData = {
      username: user.username,
      name: user.name,
      phone: user.phone,
      email: user.email,
      expiredAt: user.expiredAt,
      isolationPageUrl: `${company.baseUrl}/isolated?username=${user.username}`,
      companyName: company.name,
      companyPhone: company.phone,
    };

    // Send WhatsApp notification (TODO: implement WhatsApp service)
    if (company.isolationNotifyWhatsapp && user.phone) {
      try {
        // const { sendWhatsAppMessage } = await import('../whatsapp');
        const message = `
🚫 *Layanan Internet Diisolir*

Halo ${user.name},

Akun internet Anda (${user.username}) telah diisolir karena masa berlangganan habis.

📅 Expired: ${user.expiredAt?.toLocaleDateString('id-ID') || 'tidak diketahui'}

Untuk mengaktifkan kembali layanan, silakan lakukan pembayaran melalui:
🔗 ${notificationData.isolationPageUrl}

Atau hubungi kami:
📞 ${company.phone}
📧 ${company.email}

Terima kasih,
${company.name}
        `.trim();

        // await sendWhatsAppMessage(user.phone, message);
        console.log(`[AUTO-ISOLATE] 📱 WhatsApp would be sent to ${user.username}: ${message.substring(0, 50)}...`);
      } catch (err) {
        console.log(`[AUTO-ISOLATE] ⚠️ WhatsApp failed for ${user.username}`);
      }
    }

    // Send Email notification (TODO: implement Email service)
    if (company.isolationNotifyEmail && user.email) {
      try {
        // const { sendEmail } = await import('../email');
        const emailHtml = `
            <h2>Layanan Internet Diisolir</h2>
            <p>Halo ${user.name},</p>
            <p>Akun internet Anda (<strong>${user.username}</strong>) telah diisolir karena masa berlangganan habis.</p>
            <p><strong>Tanggal Expired:</strong> ${user.expiredAt?.toLocaleDateString('id-ID') || 'tidak diketahui'}</p>
            <p>Untuk mengaktifkan kembali layanan, silakan lakukan pembayaran:</p>
            <p><a href="${notificationData.isolationPageUrl}" style="background: #00f7ff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Bayar Sekarang</a></p>
            <p>Atau hubungi kami di ${company.phone}</p>
            <p>Terima kasih,<br>${company.name}</p>
          `;
        // await sendEmail({
        //   to: user.email,
        //   subject: `Layanan Internet Diisolir - ${user.username}`,
        //   html: emailHtml,
        // });
        console.log(`[AUTO-ISOLATE] 📧 Email would be sent to ${user.username}`);
      } catch (err) {
        console.log(`[AUTO-ISOLATE] ⚠️ Email failed for ${user.username}`);
      }
    }

  } catch (error) {
    console.log(`[AUTO-ISOLATE] ⚠️ Notification error:`, error);
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
