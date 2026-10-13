import 'server-only'
import { prisma } from '@/server/db/client';
import { sendPaymentSuccess } from '@/server/services/notifications/whatsapp-templates.service';
import { toUTC, nowWIB, getCurrentTimezone } from '@/lib/timezone';
import { logActivity } from '@/server/services/activity-log.service';
import { disconnectPPPoEUser } from '@/server/services/radius/coa-handler.service';
import { managePppSecret, shouldManagePppSecretForSuspend, kickPppoeSession } from '@/server/services/mikrotik/ppp-secret.service';
import { settlePaymentAttempt } from '@/server/services/payment/payment-attempt.service';
import crypto from 'crypto';
import { nanoid } from 'nanoid';

/**
 * Settles a PPPoE invoice paid through any channel: marks it PAID, records
 * the payment, extends the subscription, books the income in Keuangan,
 * lifts isolation in RADIUS/MikroTik with a CoA kick, credits referral
 * bonuses and notifies admin and customer. Shared by the gateway webhook
 * and QRIS Mandiri so both settle an invoice the same way.
 */
// ============================================
// HANDLE INVOICE PAYMENT (PPPOE)
// ============================================
export async function handleInvoicePayment(
  orderId: string,
  status: string,
  gateway: string,
  paymentType: string,
  paidAt: Date | null,
  transactionId: string = '',
  webhookAmount?: number
) {
  // Order ID formats:
  // 1. From /api/payment/create:        INV-${invoiceNumber}-${timestamp}-${hex}
  // 2. From /api/.../regenerate-payment: ${invoiceNumber}-${timestamp}
  // Strategy: strip trailing timestamp and hex segments, keep the invoice number.
  let invoiceNumber = orderId;

  // Strip trailing hex segment (8-char hex from randomBytes)
  const hexMatch = orderId.match(/-([a-f0-9]{8})$/);
  if (hexMatch) {
    invoiceNumber = orderId.substring(0, orderId.length - hexMatch[0].length);
  }

  // Strip trailing timestamp (≥10 digit number)
  const lastHyphenIdx = invoiceNumber.lastIndexOf('-');
  const potentialTs = lastHyphenIdx >= 0 ? invoiceNumber.substring(lastHyphenIdx + 1) : '';
  if (potentialTs && /^\d{10,}$/.test(potentialTs)) {
    invoiceNumber = invoiceNumber.substring(0, lastHyphenIdx);
  }

  let invoice = await prisma.invoice.findFirst({
    where: { invoiceNumber },
    include: {
      user: {
        include: {
          profile: true,
          area: { select: { name: true } },
          router: { select: { id: true, authMode: true } }
        }
      }
    }
  });

  // Fallback: legacy format INV-INV-{number}-{ts} → extracted as INV-{number}, try without leading INV-
  if (!invoice && invoiceNumber.startsWith('INV-INV-')) {
    const trimmed = invoiceNumber.substring(4); // Remove leading 'INV-'
    invoice = await prisma.invoice.findFirst({
      where: { invoiceNumber: trimmed },
      include: { user: { include: { profile: true, area: { select: { name: true } }, router: { select: { id: true, authMode: true } } } } }
    });
  }

  if (!invoice) {
    console.error('Invoice not found for order:', orderId, 'invoiceNumber:', invoiceNumber);
    // Gracefully ignore unknown payments (e.g., fixed-payment-code) to avoid retries
    return;
  }

  console.log(`✅ Invoice found: ${invoice.invoiceNumber}`);

  if (status === 'settlement' || status === 'capture') {
    if (typeof webhookAmount === 'number' && Number.isFinite(webhookAmount) && webhookAmount !== invoice.amount) {
      console.error(
        `[Webhook] AMOUNT_MISMATCH for ${invoice.invoiceNumber}: expected ${invoice.amount}, got ${webhookAmount}`
      );
      // Flag mismatch in payment attempt if exists
      try {
        const attempt = await prisma.paymentAttempt.findFirst({ where: { orderId } });
        if (attempt) {
          await prisma.paymentAttempt.update({
            where: { id: attempt.id },
            data: { mismatchFlagged: true, gatewayAmount: webhookAmount, status: 'FAILED', errorMessage: `Amount mismatch: expected ${invoice.amount}, got ${webhookAmount}` },
          });
        }
      } catch { /* best-effort */ }
      throw new Error('AMOUNT_MISMATCH');
    }

    // ─── PAYMENT ATTEMPT SETTLEMENT (DB-level idempotency) ────────────────────
    // settlePaymentAttempt uses updateMany with status condition — only one
    // concurrent webhook will get settled=true and proceed to business logic.
    const attemptResult = await settlePaymentAttempt({
      orderId,
      gatewayAmount: webhookAmount,
      transactionId,
      paidAt: paidAt || undefined,
    });

    if (!attemptResult.settled) {
      if (attemptResult.reason === 'amount_mismatch') {
        throw new Error('AMOUNT_MISMATCH');
      }
      if (attemptResult.reason === 'already_paid') {
        console.log(`[Webhook] ⏭️  Payment attempt for ${orderId} already settled — skipping`);
        return; // Already processed by concurrent webhook
      }
      // If attempt not found, continue with legacy flow (backward compatibility)
      console.log(`[Webhook] No payment attempt for ${orderId} — using legacy invoice guard`);
    }

    // ─── ATOMIC TRANSACTION: invoice mark-paid + payment record + user update ─
    // All critical state transitions are wrapped in a single Prisma transaction
    // so they either all succeed or all roll back. Notifications and external
    // service calls remain outside the transaction (best-effort).
    const txResult = await prisma.$transaction(async (tx) => {
      // Idempotency guard: only one concurrent webhook will get count > 0
      const markPaid = await tx.invoice.updateMany({
        where: { id: invoice.id, status: { not: 'PAID' } },
        data: { status: 'PAID', paidAt: paidAt || new Date() },
      });

      if (markPaid.count === 0) {
        console.log(`[Webhook] ⏭️  Invoice ${invoice.invoiceNumber} already PAID — skipping duplicate notification`);
        return null;
      }

      console.log(`✅ Invoice ${invoice.invoiceNumber} marked as PAID`);

      // Check if payment already exists (idempotency)
      const existingPayment = await tx.payment.findFirst({
        where: { invoiceId: invoice.id }
      });

      // Create payment record only if not exists
      if (!existingPayment) {
        await tx.payment.create({
          data: {
            id: crypto.randomUUID(),
            invoiceId: invoice.id,
            amount: invoice.amount,
            method: `${gateway}_${paymentType}`,
            status: 'completed',
            paidAt: paidAt || new Date()
          }
        });
        console.log(`✅ Payment record created for invoice ${invoice.invoiceNumber}`);
      } else {
        console.log(`⚠️ Payment already exists for invoice ${invoice.invoiceNumber}, skipping duplicate`);
      }

      // ─── ACTIVATE USER & EXTEND EXPIRY ──────────────────────────────────────
      const user = invoice.user;
      let userUpdateData: { expiredAt: Date | null; status: string; profileId: string } | null = null;
      let isPackageChange = false;
      let wasDisabled = false;

      if (user && user.profile) {
        const profile = user.profile;
        const now = nowWIB();
        const normalizedStatus = (user.status || '').toLowerCase();

        // PREPAID vs POSTPAID logic
        let newExpiredAt: Date | null = null;

        // Both PREPAID and POSTPAID: Extend expiredAt by validity period
        {
          let baseDate = user.expiredAt ? new Date(user.expiredAt) : now;
          if (baseDate < now) {
            baseDate = now;
          }

          newExpiredAt = new Date(baseDate);

          switch (profile.validityUnit) {
            case 'DAYS':
              newExpiredAt.setDate(newExpiredAt.getDate() + profile.validityValue);
              break;
            case 'MONTHS':
              newExpiredAt.setMonth(newExpiredAt.getMonth() + profile.validityValue);
              break;
            case 'HOURS':
              newExpiredAt.setHours(newExpiredAt.getHours() + profile.validityValue);
              break;
            case 'MINUTES':
              newExpiredAt.setMinutes(newExpiredAt.getMinutes() + profile.validityValue);
              break;
          }
        }

        // Determine if user should be activated (include blocked/stop status)
        wasDisabled = ['isolated', 'suspended', 'blocked', 'stop'].includes(normalizedStatus);
        const newStatus = wasDisabled ? 'active' : normalizedStatus || 'active';

        // Check if this is a package upgrade invoice
        let newProfileId = user.profileId;
        if (invoice.additionalFees && typeof invoice.additionalFees === 'object') {
          const additionalFeesObj = invoice.additionalFees as Record<string, unknown>;
          if (additionalFeesObj.items && Array.isArray(additionalFeesObj.items)) {
            const upgradeItem = (additionalFeesObj.items as Array<Record<string, unknown>>).find((item) => {
              const metadata = item.metadata as Record<string, unknown> | undefined;
              return (metadata?.type === 'package_upgrade' || metadata?.type === 'package_change') && metadata?.newPackageId;
            });
            if (upgradeItem) {
              const metadata = upgradeItem.metadata as Record<string, unknown>;
              newProfileId = metadata.newPackageId as string;
              isPackageChange = true;
              console.log(`📦 Package change detected: ${metadata.oldPackageName} → ${metadata.newPackageName} (expiry PRESERVED)`);
            }
          }
        }

        // For package change: keep existing expiredAt, do NOT extend
        const finalExpiredAt = isPackageChange ? user.expiredAt : toUTC(newExpiredAt);

        // Update user inside the transaction
        await tx.pppoeUser.update({
          where: { id: user.id },
          data: {
            expiredAt: finalExpiredAt,
            status: newStatus,
            profileId: newProfileId
          }
        });

        console.log(`✅ User ${user.username} updated:`);
        console.log(`   - Expiry: ${user.expiredAt?.toISOString() || 'null'} → ${finalExpiredAt?.toISOString() || 'null'} ${isPackageChange ? '(package change, preserved)' : ''}`);
        console.log(`   - Status: ${user.status} → ${newStatus}`);
        if (newProfileId !== user.profileId) {
          console.log(`   - Profile: ${user.profileId} → ${newProfileId}`);
        }

        userUpdateData = { expiredAt: finalExpiredAt, status: newStatus, profileId: newProfileId ?? '' };
      }

      return { userUpdateData, isPackageChange, wasDisabled };
    });

    if (txResult === null) {
      return; // Already processed by a concurrent webhook
    }

    const { userUpdateData, isPackageChange: _isPackageChange, wasDisabled } = txResult;

    const invoiceUsername = invoice.customerUsername || invoice.user?.username;
    if (invoiceUsername) {
      const { cancelPendingOntTasksForPaidUser } = await import('@/server/services/ont-removal-task.service');
      await cancelPendingOntTasksForPaidUser(invoiceUsername).catch(() => {});
    }

    // ─── NOTIFICATIONS & SIDE EFFECTS (best-effort, outside transaction) ──────

    // Create notification using NotificationService
    try {
      const customerName = invoice.customerName || invoice.user?.name || 'Unknown';
      const { NotificationService } = await import('@/server/services/notifications/dispatcher.service');
      await NotificationService.notifyPaymentReceived({
        amount: invoice.amount,
        invoiceId: invoice.id,
        customerName: customerName,
        customerUsername: invoice.user?.username,
        gateway: gateway
      });
    } catch (notifError) {
      console.error('[Invoice Payment] Notification error:', notifError);
    }

    // Log activity
    try {
      await logActivity({
        username: invoice.user?.username || invoice.customerUsername || 'Customer',
        action: 'PAYMENT_RECEIVED',
        description: `Payment received for invoice ${invoice.invoiceNumber} - Rp ${invoice.amount.toLocaleString('id-ID')}`,
        module: 'payment',
        status: 'success',
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.amount,
          paymentGateway: gateway,
          paymentType,
          transactionId,
        },
      });
    } catch (logError) {
      console.error('Activity log error:', logError);
    }

    // ============================================
    // AUTO-SYNC TO KEUANGAN TRANSACTIONS
    // ============================================
    try {
      const pppoeCategory = await prisma.transactionCategory.findFirst({
        where: { name: 'Pembayaran PPPoE', type: 'INCOME' },
      });

      if (pppoeCategory) {
        const user = invoice.user;
        const customerName = invoice.customerName || user?.name || 'Unknown';
        const profileName = user?.profile?.name || 'Unknown';
        const reference = `INV-${invoice.invoiceNumber}`;

        // Use INSERT IGNORE for race-safe idempotency (MySQL)
        // If a concurrent webhook already inserted this reference, this is a no-op.
        await prisma.$executeRaw`
            INSERT IGNORE INTO transactions (id, categoryId, type, amount, description, date, reference, notes, createdAt, updatedAt)
            VALUES (${nanoid()}, ${pppoeCategory.id}, 'INCOME', ${invoice.amount}, 
                    ${`Pembayaran ${profileName} - ${customerName}`}, NOW(), 
                    ${reference}, 
                    ${`Payment via ${gateway} (${paymentType})`}, NOW(), NOW())
          `;
        console.log(`✅ Transaction synced to Keuangan: ${invoice.invoiceNumber} (Rp ${invoice.amount})`);
      }
    } catch (keuanganError) {
      console.error('Keuangan sync error:', keuanganError);
    }

    // ─── SEND NOTIFICATIONS TO USER ───────────────────────────────────────────
    const user = invoice.user;

    if (user && user.profile && userUpdateData) {
      const profile = user.profile;
      const finalExpiredAt = userUpdateData.expiredAt;
        try {
          await sendPaymentSuccess({
            customerName: user.name,
            customerPhone: user.phone,
            customerId: (user as any).customerId || undefined,
            username: user.username,
            password: user.password,
            profileName: profile.name,
            area: (user as any).area?.name,
            address: user.address || undefined,
            invoiceNumber: invoice.invoiceNumber,
            amount: invoice.amount,
            newExpiredAt: finalExpiredAt ?? undefined,
          });
          console.log(`✅ WhatsApp payment success notification sent`);
        } catch (waError) {
          console.error('WhatsApp notification error:', waError);
        }

        // ============================================
        // SEND WEB PUSH / FCM TO CUSTOMER
        // ============================================
        try {
          const { sendPushToUser } = await import('@/server/services/notifications/push-templates.service');
          await sendPushToUser(user.id, 'payment-success', {
            invoiceNumber: invoice.invoiceNumber,
            amount: invoice.amount,
            username: user.username,
            expiredDate: finalExpiredAt ?? undefined,
          });
          console.log(`✅ Push notification (web/FCM) sent to customer ${user.username}`);
        } catch (pushError) {
          console.error('Push notification error:', pushError);
        }

        // ============================================
        // SEND EMAIL NOTIFICATION FOR PAYMENT SUCCESS
        // ============================================
        const customerEmail = invoice.customerEmail || user.email;
        if (customerEmail) {
          try {
            const emailSettings = await prisma.emailSettings.findFirst();
            if (emailSettings?.enabled) {
              const emailTemplate = await prisma.emailTemplate.findFirst({
                where: { type: 'payment-success', isActive: true }
              });

              if (emailTemplate) {
                const company = await prisma.company.findFirst();
                const expiredDateStr = finalExpiredAt
                  ? new Date(finalExpiredAt).toLocaleDateString('id-ID', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                      timeZone: getCurrentTimezone(),
                    })
                  : '-';
                const variables: Record<string, string> = {
                  customerId: user.customerId || '-',
                  customerName: user.name || invoice.customerName || 'Pelanggan',
                  username: user.username,
                  profileName: profile.name,
                  area: (user as any).area?.name || '-',
                  address: user.address || '-',
                  invoiceNumber: invoice.invoiceNumber,
                  amount: `Rp ${invoice.amount.toLocaleString('id-ID')}`,
                  expiredDate: expiredDateStr,
                  companyName: company?.name || 'ISP',
                  companyPhone: company?.phone || '-',
                };

                let subject = emailTemplate.subject;
                let htmlBody = emailTemplate.htmlBody;
                Object.entries(variables).forEach(([key, value]) => {
                  const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
                  subject = subject.replace(regex, value);
                  htmlBody = htmlBody.replace(regex, value);
                });

                const nodemailer = require('nodemailer');
                const transporter = nodemailer.createTransport({
                  host: emailSettings.smtpHost,
                  port: emailSettings.smtpPort,
                  secure: emailSettings.smtpSecure,
                  auth: { user: emailSettings.smtpUser, pass: emailSettings.smtpPassword },
                });

                await transporter.sendMail({
                  from: `"${emailSettings.fromName}" <${emailSettings.fromEmail}>`,
                  to: customerEmail,
                  subject: subject,
                  html: htmlBody,
                });

                await prisma.emailHistory.create({
                  data: {
                    id: nanoid(),
                    toEmail: customerEmail,
                    toName: user.name || invoice.customerName,
                    subject: subject,
                    body: htmlBody,
                    status: 'sent',
                  },
                });
                console.log(`✅ Email payment success notification sent to ${customerEmail}`);
              }
            }
          } catch (emailError) {
            console.error('Email payment notification error:', emailError);
          }
        }

        // ============================================
        // PROCESS REFERRAL BONUS (FIRST PAYMENT)
        // ============================================
        try {
          // Check if user was referred
          const fullUser = await prisma.pppoeUser.findUnique({
            where: { id: user.id },
            select: { id: true, referredById: true, name: true },
          });

          if (fullUser?.referredById) {
            // Get referral config
            const companyRef = await prisma.company.findFirst({
              select: {
                referralEnabled: true,
                referralRewardAmount: true,
                referralRewardType: true,
              },
            });

            if (companyRef?.referralEnabled && companyRef.referralRewardType === 'FIRST_PAYMENT') {
              // Check if reward already exists (idempotency)
              const existingReward = await prisma.referralReward.findFirst({
                where: { referrerId: fullUser.referredById, referredId: user.id },
              });

              if (!existingReward) {
                // Check if this is the first paid invoice for this user
                const paidInvoiceCount = await prisma.invoice.count({
                  where: { userId: user.id, status: 'PAID' },
                });

                if (paidInvoiceCount <= 1) {
                  const rewardAmount = companyRef.referralRewardAmount ?? 10000;

                  // Create reward and credit referrer balance atomically
                  await prisma.referralReward.create({
                    data: {
                      referrerId: fullUser.referredById,
                      referredId: user.id,
                      amount: rewardAmount,
                      status: 'CREDITED',
                      type: 'FIRST_PAYMENT',
                      creditedAt: new Date(),
                    },
                  });
                  console.log(`✅ Referral reward ${rewardAmount} recorded for referrer ${fullUser.referredById}`);
                }
              }
            }
          }
        } catch (referralError) {
          console.error('Referral bonus error:', referralError);
        }

        if (wasDisabled) {
          console.log(`   - Status: ${user.status} → ${userUpdateData.status}`);

          // ============================================
          // RADIUS SYNC FOR REACTIVATION
          // ============================================

          const nasIdentifier = user.routerId || null;
          try {
            // Remove forced reject (if any) from previous SUSPENDED state — scoped by nas_identifier
            await prisma.radcheck.deleteMany({
              where: {
                username: user.username,
                attribute: 'Auth-Type',
                ...(nasIdentifier ? { nas_identifier: nasIdentifier } : {}),
              },
            });

            // Remove NAS-IP-Address restriction (can prevent login if NAS-IP differs) — scoped by nas_identifier
            await prisma.radcheck.deleteMany({
              where: {
                username: user.username,
                attribute: 'NAS-IP-Address',
                ...(nasIdentifier ? { nas_identifier: nasIdentifier } : {}),
              },
            });

            // 1. Restore radcheck (username + password) — with nas_identifier
            await prisma.$executeRaw`
                INSERT INTO radcheck (username, attribute, op, value, nas_identifier)
                VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password}, ${nasIdentifier})
                ON DUPLICATE KEY UPDATE value = ${user.password}
              `;

            // 2. Restore radusergroup — DELETE first to remove 'isolir' row, then insert real group — scoped by nas_identifier
            await prisma.$executeRaw`
                DELETE FROM radusergroup WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
              `;
            await prisma.$executeRaw`
                INSERT INTO radusergroup (username, groupname, priority, nas_identifier)
                VALUES (${user.username}, ${profile.groupName}, 1, ${nasIdentifier})
                ON DUPLICATE KEY UPDATE groupname = ${profile.groupName}
              `;

            // 3. Remove isolated message from radreply — scoped by nas_identifier
            await prisma.radreply.deleteMany({
              where: {
                username: user.username,
                attribute: 'Reply-Message',
                ...(nasIdentifier ? { nas_identifier: nasIdentifier } : {}),
              }
            });
            console.log(`✅ Removed isolated message from radreply for ${user.username}`);

            // 4. Restore radreply (if static IP) — with nas_identifier — scoped by nas_identifier
            await prisma.$executeRaw`
                DELETE FROM radreply WHERE username = ${user.username} AND attribute = 'Framed-IP-Address' AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
              `;
            if (user.ipAddress) {
              await prisma.$executeRaw`
                  INSERT INTO radreply (username, attribute, op, value, nas_identifier)
                  VALUES (${user.username}, 'Framed-IP-Address', ':=', ${user.ipAddress}, ${nasIdentifier})
                  ON DUPLICATE KEY UPDATE value = ${user.ipAddress}
                `;
            }

            console.log(`✅ RADIUS entries restored for ${user.username}`);

            // 4b. Restore PPP secret / hotspot user in MikroTik (critical for local mode)
            //     Based on connectionType: PPPoE → restore secret profile, Hotspot → re-enable user
            if (user.routerId && shouldManagePppSecretForSuspend((user as any).router?.authMode)) {
              const connType = (user as any).connectionType || 'PPPOE';
              if (connType === 'HOTSPOT') {
                // Hotspot: re-enable hotspot user + kick active session
                try {
                  const { manageHotspotUser, kickHotspotSession: _kickHotspotSession } = await import('@/server/services/mikrotik/arp-hotspot.service');
                  const r = await manageHotspotUser(user.routerId, 'update', {
                    username: user.username,
                    password: user.password,
                    disabled: false,
                  });
                  console.log(`✅ [Webhook] Hotspot re-enabled for ${user.username}: ${r.message}`);
                } catch (e: any) {
                  console.error(`[Webhook] Hotspot re-enable failed for ${user.username}:`, e?.message || e);
                }
                try {
                  const { kickHotspotSession } = await import('@/server/services/mikrotik/arp-hotspot.service');
                  const kicked = await kickHotspotSession(user.routerId, user.username);
                  console.log(`✅ [Webhook] Kicked ${kicked} hotspot session(s) for ${user.username}`);
                } catch (e: any) {
                  console.error(`[Webhook] Hotspot kick failed for ${user.username}:`, e?.message || e);
                }
              } else {
                // PPPoE / STATIC_IP: restore PPP secret profile + kick active session
                try {
                  const r = await managePppSecret(user.routerId, 'enable', {
                    username: user.username,
                    password: user.password,
                    profile: profile.groupName,
                  });
                  console.log(`✅ [Webhook] PPP secret restored to "${profile.groupName}" for ${user.username}: ${r.message}`);
                } catch (e: any) {
                  console.error(`[Webhook] PPP secret restore failed for ${user.username}:`, e?.message || e);
                }

                try {
                  const kicked = await kickPppoeSession(user.routerId, user.username);
                  console.log(`✅ [Webhook] Kicked ${kicked} session(s) for ${user.username}`);
                } catch (e: any) {
                  console.error(`[Webhook] Kick failed for ${user.username}:`, e?.message || e);
                }
              }
            }

            // Update registration status to ACTIVE if this is installation invoice
            const registration = await prisma.registrationRequest.findFirst({
              where: {
                pppoeUserId: user.id,
                status: 'INSTALLED'
              }
            });

            if (registration) {
              await prisma.registrationRequest.update({
                where: { id: registration.id },
                data: { status: 'ACTIVE' }
              });
              console.log(`✅ Registration ${registration.id} status updated to ACTIVE`);
            }

            // 5. Send CoA Disconnect to force re-authentication
            try {
              const coaResult = await disconnectPPPoEUser(user.username);
              if (coaResult.success) {
                console.log(`✅ CoA disconnect sent for ${user.username}`);
              } else {
                console.log(`⚠️ CoA disconnect: ${coaResult.error || 'No active session'}`);
              }
            } catch (coaError) {
              console.error('CoA disconnect failed:', coaError);
            }
          } catch (radiusError) {
            console.error('RADIUS sync error:', radiusError);
          }
        }
      }
  } else if (['expire', 'cancel', 'deny', 'failed'].includes(status)) {
    if (invoice.status !== 'PAID' && invoice.status !== 'CANCELLED') {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: 'CANCELLED' }
      });
      console.log(`❌ Invoice ${invoice.invoiceNumber} marked as CANCELLED`);
    }
  }
}
