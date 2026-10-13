import 'server-only'
import { prisma } from '@/server/db/client';
import { syncVoucherToRadius } from '@/server/services/radius/hotspot-sync.service';
import { sendPaymentSuccess, sendVoucherPurchaseSuccess } from '@/server/services/notifications/whatsapp-templates.service';
import { WhatsAppService } from '@/server/services/notifications/whatsapp.service';
import { getCurrentTimezone, nowWIB } from '@/lib/timezone';
import { createAgentNotificationAndPush } from '@/server/services/agent-notification.service';
import { createAdminNotification } from '@/server/services/notifications/admin-notification.service';
import { formatInTimeZone } from 'date-fns-tz';
import { logActivity } from '@/server/services/activity-log.service';
import { syncVoucherToAssignedRouter } from '@/server/services/mikrotik/hotspot-voucher.service';
import { handleInvoicePayment } from '@/server/services/payment/invoice-payment.service';
import crypto from 'crypto';
import { nanoid } from 'nanoid';

/**
 * Settles any paid order by its orderId: EVC- voucher orders, TOPUP-
 * balance top-ups, INV- invoices, agent deposits (UUID), and legacy
 * invoice numbers. Shared by the gateway webhook and QRIS Mandiri so a
 * payment does the same thing whichever way it arrived.
 */
export async function settleOrder(
  orderId: string,
  status: string,
  gateway: string,
  paymentType: string,
  paidAt: Date | null,
  transactionId: string = '',
  amount?: number,
) {
  // Check order type by prefix or UUID format
  if (orderId.startsWith('EVC-')) {
    // Handle E-Voucher Order
    console.log(`[Webhook] Order type: E-Voucher`);
    await handleVoucherOrder(orderId, status, gateway, paymentType, paidAt, amount);
  } else if (orderId.startsWith('TOPUP-')) {
    // Handle Customer Top-Up (Balance)
    console.log(`[Webhook] Order type: Customer Top-Up`);
    await handleCustomerTopUp(orderId, status, gateway, transactionId, paidAt, amount);
  } else if (orderId.startsWith('INV-')) {
    // Handle PPPoE Invoice
    console.log(`[Webhook] Order type: Invoice`);
    await handleInvoicePayment(orderId, status, gateway, paymentType, paidAt, transactionId, amount);
  } else {
    // Check if it's an agent deposit (UUID format)
    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    console.log(`[Webhook] Checking if order is Agent Deposit...`);

    const agentDeposit = await prisma.agentDeposit.findUnique({
      where: { id: orderId }
    });

    console.log(`[Webhook] Agent Deposit lookup result:`, agentDeposit ? `Found (Agent: ${agentDeposit.agentId})` : 'Not found');

    if (agentDeposit) {
      // Handle Agent Deposit
      console.log(`[Webhook] Order type: Agent Deposit`);
      await handleAgentDeposit(orderId, status, gateway, transactionId, paidAt, amount);
    } else {
      // Fallback to invoice payment (for legacy orders without INV- prefix)
      console.log(`[Webhook] Order type: Legacy Invoice (fallback)`);
      await handleInvoicePayment(orderId, status, gateway, paymentType, paidAt, transactionId, amount);
    }
  }
}

// ============================================
// HANDLE VOUCHER ORDER PAYMENT
// ============================================
async function handleVoucherOrder(
  orderId: string,
  status: string,
  gateway: string,
  paymentType: string,
  paidAt: Date | null,
  webhookAmount?: number
) {
  // Extract order number from orderId
  // Format bisa: EVC-20251028-0001 atau EVC-20251028-0001-timestamp
  let orderNumber = orderId;

  // Jika ada timestamp, ambil 3 bagian pertama
  const parts = orderId.split('-');
  if (parts.length > 3) {
    orderNumber = parts.slice(0, 3).join('-'); // EVC-20251028-0001
  }

  console.log(`Looking for voucher order: ${orderNumber} (from orderId: ${orderId})`);

  const order = await prisma.voucherOrder.findFirst({
    where: { orderNumber },
    include: {
      profile: true
    }
  });

  if (!order) {
    console.error(`❌ Voucher order not found: ${orderNumber}`);
    console.error(`Original orderId: ${orderId}`);

    // Try to find by partial match as fallback
    const allOrders = await prisma.voucherOrder.findMany({
      where: {
        orderNumber: {
          contains: parts[0] + '-' + parts[1] // EVC-20251028
        }
      },
      select: { orderNumber: true, status: true }
    });

    console.log(`Found similar orders:`, allOrders);
    throw new Error(`Voucher order not found: ${orderNumber}`);
  }

  console.log(`✅ Voucher order found: ${order.orderNumber}`);

  if (status === 'settlement' || status === 'capture') {
    // ─── AMOUNT VALIDATION ────────────────────────────────────────────────────
    if (typeof webhookAmount === 'number' && Number.isFinite(webhookAmount) && webhookAmount !== order.totalAmount) {
      console.error(
        `[Voucher Order] AMOUNT_MISMATCH for ${order.orderNumber}: expected ${order.totalAmount}, got ${webhookAmount}`
      );
      throw new Error('AMOUNT_MISMATCH');
    }

    // ─── ATOMIC IDEMPOTENCY GUARD ────────────────────────────────────────────
    // Use updateMany with status condition — only one concurrent webhook
    // will get count > 0 and proceed to settlement + voucher generation.
    const markPaid = await prisma.voucherOrder.updateMany({
      where: { id: order.id, status: { not: 'PAID' } },
      data: {
        status: 'PAID',
        paidAt: paidAt || new Date(),
      },
    });

    if (markPaid.count === 0) {
      console.log(`[Voucher Order] ⏭️  Order ${order.orderNumber} already PAID — skipping duplicate settlement`);
      try {
        const { logPaymentIdempotencyHit } = await import('@/server/services/monitoring.service');
        logPaymentIdempotencyHit(gateway, order.orderNumber);
      } catch { /* monitoring is best-effort */ }
      return;
    }

    console.log(`✅ Order ${order.orderNumber} marked as PAID`);
    try {
      const { logPaymentSettlementSuccess } = await import('@/server/services/monitoring.service');
      logPaymentSettlementSuccess(order.orderNumber, order.totalAmount);
    } catch { /* monitoring is best-effort */ }

    // Create notification using NotificationService
    try {
      const { NotificationService } = await import('@/server/services/notifications/dispatcher.service');
      await NotificationService.notifyPaymentReceived({
        amount: order.totalAmount,
        customerName: order.customerName,
        gateway: gateway
      });
    } catch (notifError) {
      console.error('[Voucher Order] Notification error:', notifError);
    }

    // ============================================
    // AUTO-GENERATE VOUCHERS
    // ============================================
    // Secondary idempotency check: if vouchers already exist for this order
    // (e.g., from a race that somehow passed the guard), skip generation.
    const existingVouchers = await prisma.hotspotVoucher.findMany({
      where: { orderId: order.id },
      select: { id: true, code: true },
    });

    const vouchers: { id: string; code: string }[] = [];

    if (existingVouchers.length > 0) {
      console.log(`[Voucher Order] ⏭️  ${existingVouchers.length} vouchers already exist for ${order.orderNumber} — skipping generation`);
      vouchers.push(...existingVouchers);
    } else {
      for (let i = 0; i < order.quantity; i++) {
        // Generate unique voucher code
        let voucherCode = '';
        let isUnique = false;

        while (!isUnique) {
          voucherCode = generateVoucherCode(8);
          const existing = await prisma.hotspotVoucher.findUnique({
            where: { code: voucherCode }
          });
          if (!existing) {
            isUnique = true;
          }
        }

        // Create voucher
        const voucher = await prisma.hotspotVoucher.create({
          data: {
            id: crypto.randomUUID(),
            code: voucherCode,
            batchCode: order.orderNumber,
            profileId: order.profileId,
            orderId: order.id,
            status: 'WAITING'
          }
        });

        vouchers.push(voucher);

        // Sync to RADIUS using proper sync function
        try {
          await syncVoucherToRadius(voucher.id);
          console.log(`✅ Voucher ${voucherCode} synced to RADIUS`);
        } catch (radiusError) {
          console.error(`RADIUS sync error for ${voucherCode}:`, radiusError);
        }

        // Sync to MikroTik local NAS (creates /ip/hotspot/user via API)
        // If voucher has no routerId, syncs to ALL active local-mode routers (multi-NAS support)
        try {
          const mtResult = await syncVoucherToAssignedRouter(voucher.id);
          if (mtResult.success > 0) {
            console.log(`✅ Voucher ${voucherCode} synced to MikroTik (${mtResult.success}/${mtResult.total} routers)`);
          } else if (mtResult.total > 0) {
            console.error(`❌ Voucher ${voucherCode} failed to sync to MikroTik (${mtResult.failed}/${mtResult.total} failed)`);
          }
        } catch (mtError) {
          console.error(`MikroTik sync error for ${voucherCode}:`, mtError);
        }
      }

      console.log(`✅ Generated ${vouchers.length} vouchers for order ${order.orderNumber}`);
    }

      // ============================================
      // AUTO-SYNC TO KEUANGAN TRANSACTIONS
      // ============================================
      try {
        const hotspotCategory = await prisma.transactionCategory.findFirst({
          where: { name: 'Pembayaran Hotspot', type: 'INCOME' },
        });

        if (hotspotCategory) {
          // Use INSERT IGNORE for race-safe idempotency (MySQL)
          await prisma.$executeRaw`
            INSERT IGNORE INTO transactions (id, categoryId, type, amount, description, date, reference, notes, createdAt, updatedAt)
            VALUES (${nanoid()}, ${hotspotCategory.id}, 'INCOME', ${order.totalAmount},
                    ${`Voucher ${order.profile.name} (${order.quantity}x) - ${order.customerName}`}, NOW(),
                    ${order.orderNumber},
                    ${`Auto-synced from voucher order payment`}, NOW(), NOW())
          `;
          console.log(`✅ Transaction synced to Keuangan: ${order.orderNumber}`);
        }
      } catch (keuanganError) {
        console.error('Keuangan sync error:', keuanganError);
      }

      // Send WhatsApp notification with voucher codes
      try {
        await sendVoucherPurchaseSuccess({
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          orderNumber: order.orderNumber,
          profileName: order.profile.name,
          quantity: order.quantity,
          voucherCodes: vouchers.map(v => v.code),
          validityValue: order.profile.validityValue,
          validityUnit: order.profile.validityUnit,
        });
        console.log(`✅ WhatsApp voucher notification sent to ${order.customerPhone}`);
      } catch (waError) {
        console.error('WhatsApp voucher notification error:', waError);
      }

      // Send Email notification for voucher purchase
      if (order.customerEmail) {
        try {
          const emailSettings = await prisma.emailSettings.findFirst();
          if (emailSettings?.enabled) {
            const emailTemplate = await prisma.emailTemplate.findFirst({
              where: { type: 'voucher-purchase', isActive: true }
            });

            if (emailTemplate) {
              const company = await prisma.company.findFirst();
              const validityUnit: { [key: string]: string } = {
                MINUTES: 'Menit', HOURS: 'Jam', DAYS: 'Hari', MONTHS: 'Bulan'
              };
              const duration = `${order.profile.validityValue} ${validityUnit[order.profile.validityUnit] || order.profile.validityUnit}`;

              const variables: Record<string, string> = {
                customerId: '',
                customerName: order.customerName,
                phone: order.customerPhone,
                profileName: order.profile.name,
                duration: duration,
                price: `Rp ${(order.totalAmount / order.quantity).toLocaleString('id-ID')}`,
                quantity: order.quantity.toString(),
                totalAmount: `Rp ${order.totalAmount.toLocaleString('id-ID')}`,
                voucherCodes: vouchers.map(v => v.code).join(', '),
                purchaseDate: formatInTimeZone(new Date(), getCurrentTimezone(), 'dd MMMM yyyy'),
                expiryDate: '-',
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
                to: order.customerEmail,
                subject: subject,
                html: htmlBody,
              });

              // Log to email history
              await prisma.emailHistory.create({
                data: {
                  id: nanoid(),
                  toEmail: order.customerEmail,
                  toName: order.customerName,
                  subject: subject,
                  body: htmlBody,
                  status: 'sent',
                },
              });
              console.log(`✅ Email voucher notification sent to ${order.customerEmail}`);
            }
          }
        } catch (emailError) {
          console.error('Email voucher notification error:', emailError);
        }
      }
    }
  }

// Generate random voucher code
function generateVoucherCode(length: number = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ============================================
// HANDLE AGENT DEPOSIT PAYMENT
// ============================================
async function handleAgentDeposit(
  depositId: string,
  status: string,
  gateway: string,
  transactionId: string,
  paidAt: Date | null,
  webhookAmount?: number
) {
  console.log(`[Agent Deposit] Processing deposit: ${depositId}, Status: ${status}`);

  const deposit = await prisma.agentDeposit.findUnique({
    where: { id: depositId },
    include: { agent: true }
  });

  if (!deposit) {
    console.error(`[Agent Deposit] Deposit not found: ${depositId}`);
    throw new Error(`Agent deposit not found: ${depositId}`);
  }

  console.log(`[Agent Deposit] Found deposit for agent: ${deposit.agent.name}, Amount: ${deposit.amount}`);

  // Only process if current status is PENDING
  if (deposit.status !== 'PENDING') {
    console.log(`[Agent Deposit] Deposit ${depositId} already processed (status: ${deposit.status})`);
    return;
  }

  // Map webhook status to deposit status
  let depositStatus: 'PENDING' | 'PAID' | 'FAILED' = 'PENDING';

  if (status === 'settlement' || status === 'capture') {
    depositStatus = 'PAID';
  } else if (['expire', 'cancel', 'deny', 'failed'].includes(status)) {
    depositStatus = 'FAILED';
  }

  // ─── ATOMIC: deposit status + balance increment in one transaction ─────────
  // Use updateMany with status condition for idempotency — only one concurrent
  // webhook will get count > 0 and proceed to increment the balance.
  let updatedBalance: number | null = null;
  if (depositStatus === 'PAID') {
    // ─── AMOUNT VALIDATION ────────────────────────────────────────────────────
    if (typeof webhookAmount === 'number' && Number.isFinite(webhookAmount) && webhookAmount !== deposit.amount) {
      console.error(
        `[Agent Deposit] AMOUNT_MISMATCH for ${depositId}: expected ${deposit.amount}, got ${webhookAmount}`
      );
      throw new Error('AMOUNT_MISMATCH');
    }

    const result = await prisma.$transaction(async (tx) => {
      const markPaid = await tx.agentDeposit.updateMany({
        where: { id: deposit.id, status: 'PENDING' },
        data: {
          status: 'PAID',
          transactionId: transactionId || deposit.transactionId,
          paidAt: paidAt || new Date(),
        },
      });

      if (markPaid.count === 0) {
        console.log(`[Agent Deposit] ⏭️  Deposit ${depositId} already processed — skipping`);
        return null;
      }

      const updatedAgent = await tx.agent.update({
        where: { id: deposit.agentId },
        data: {
          balance: {
            increment: deposit.amount,
          },
        },
      });

      // Book the deposit in Keuangan, atomic with the balance.
      let depositCategory = await tx.transactionCategory.findFirst({ where: { name: 'Deposit Agent' } });
      if (!depositCategory) {
        depositCategory = await tx.transactionCategory.create({
          data: { id: nanoid(), name: 'Deposit Agent', type: 'INCOME', description: 'Deposit saldo agent' },
        });
      }
      await tx.transaction.create({
        data: {
          id: nanoid(),
          categoryId: depositCategory.id,
          amount: deposit.amount,
          type: 'INCOME',
          description: `Deposit agent ${deposit.agent.name}`,
          reference: `AGENT-DEPOSIT-${deposit.id}`,
          notes: `Agent: ${deposit.agent.name}, Method: ${gateway}`,
          createdAt: new Date(),
          createdBy: 'system',
        },
      });

      return updatedAgent.balance;
    });

    if (result === null) {
      return; // Already processed by a concurrent webhook
    }
    updatedBalance = result;
    console.log(`[Agent Deposit] ✅ Agent ${deposit.agent.name} balance increased by Rp ${deposit.amount.toLocaleString('id-ID')}`);
    console.log(`[Agent Deposit] New balance: Rp ${updatedBalance.toLocaleString('id-ID')}`);
  } else {
    // Non-PAID status: just update deposit status
    await prisma.agentDeposit.updateMany({
      where: { id: deposit.id, status: 'PENDING' },
      data: {
        status: depositStatus,
        transactionId: transactionId || deposit.transactionId,
        paidAt: null,
      },
    });
    console.log(`[Agent Deposit] Updated deposit status to: ${depositStatus}`);
  }

  // If payment successful, send notifications
  if (depositStatus === 'PAID' && updatedBalance !== null) {
    await createAgentNotificationAndPush(deposit.agentId, {
      type: 'deposit_success',
      title: 'Deposit Berhasil',
      message: `Deposit sebesar Rp ${deposit.amount.toLocaleString('id-ID')} berhasil. Saldo baru: Rp ${updatedBalance.toLocaleString('id-ID')}`,
    }).catch((e) => console.error('[Agent Deposit] Agent push error:', e));

    await createAdminNotification({
      data: {
        id: nanoid(),
        type: 'agent_deposit',
        title: 'Agent Deposit',
        message: `${deposit.agent.name} deposit Rp ${deposit.amount.toLocaleString('id-ID')} via ${gateway}`,
        link: '/admin/hotspot/agent',
        createdAt: nowWIB(),
      },
    }).catch((e) => console.error('[Agent Deposit] Admin notification error:', e));

    // Log activity
    try {
      await logActivity({
        username: deposit.agent.name,
        userRole: 'AGENT',
        action: 'AGENT_DEPOSIT',
        description: `Agent ${deposit.agent.name} deposited Rp ${deposit.amount.toLocaleString('id-ID')} via ${gateway}`,
        module: 'agent',
        status: 'success',
        metadata: {
          agentId: deposit.agentId,
          depositId: deposit.id,
          amount: deposit.amount,
          paymentGateway: gateway,
          transactionId,
          newBalance: updatedBalance,
        },
      });
    } catch (logError) {
      console.error('[Agent Deposit] Activity log error:', logError);
    }

    // ============================================
    // SEND WHATSAPP NOTIFICATION TO AGENT
    // ============================================
    if (deposit.agent.phone) {
      try {
        const company = await prisma.company.findFirst();
        const message = `Halo ${deposit.agent.name},\n\nTop-up saldo agent Anda berhasil!\n\nJumlah: Rp ${deposit.amount.toLocaleString('id-ID')}\nSaldo baru: Rp ${updatedBalance.toLocaleString('id-ID')}\nGateway: ${gateway}\n\nTerima kasih!\n${company?.name || 'ISP'}`;

        await WhatsAppService.sendMessage({
          phone: deposit.agent.phone,
          message: message
        });
        console.log(`[Agent Deposit] ✅ WhatsApp notification sent to ${deposit.agent.phone}`);
      } catch (waError) {
        console.error('[Agent Deposit] WhatsApp error:', waError);
      }
    }

    // ============================================
    // SEND EMAIL NOTIFICATION TO AGENT
    // ============================================
    if (deposit.agent.email) {
      try {
        const emailSettings = await prisma.emailSettings.findFirst();
        if (emailSettings?.enabled) {
          const company = await prisma.company.findFirst();

          const nodemailer = require('nodemailer');
          const transporter = nodemailer.createTransport({
            host: emailSettings.smtpHost,
            port: emailSettings.smtpPort,
            secure: emailSettings.smtpSecure,
            auth: { user: emailSettings.smtpUser, pass: emailSettings.smtpPassword },
          });

          const htmlBody = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #16a34a;">Top-Up Saldo Berhasil!</h2>
              <p>Halo <strong>${deposit.agent.name}</strong>,</p>
              <p>Top-up saldo agent Anda telah berhasil diproses.</p>
              <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <tr>
                  <td style="padding: 10px; border: 1px solid #ddd;"><strong>Jumlah Top-Up</strong></td>
                  <td style="padding: 10px; border: 1px solid #ddd;">Rp ${deposit.amount.toLocaleString('id-ID')}</td>
                </tr>
                <tr>
                  <td style="padding: 10px; border: 1px solid #ddd;"><strong>Saldo Baru</strong></td>
                  <td style="padding: 10px; border: 1px solid #ddd;">Rp ${updatedBalance.toLocaleString('id-ID')}</td>
                </tr>
                <tr>
                  <td style="padding: 10px; border: 1px solid #ddd;"><strong>Metode Pembayaran</strong></td>
                  <td style="padding: 10px; border: 1px solid #ddd;">${gateway.toUpperCase()}</td>
                </tr>
              </table>
              <p>Terima kasih telah menggunakan layanan kami.</p>
              <p style="color: #666; font-size: 12px;">Salam,<br/>${company?.name || 'ISP'}</p>
            </div>
          `;

          await transporter.sendMail({
            from: `"${emailSettings.fromName}" <${emailSettings.fromEmail}>`,
            to: deposit.agent.email,
            subject: `Top-Up Saldo Agent Berhasil - Rp ${deposit.amount.toLocaleString('id-ID')}`,
            html: htmlBody,
          });

          await prisma.emailHistory.create({
            data: {
              id: nanoid(),
              toEmail: deposit.agent.email,
              toName: deposit.agent.name,
              subject: `Top-Up Saldo Agent Berhasil - Rp ${deposit.amount.toLocaleString('id-ID')}`,
              body: htmlBody,
              status: 'sent',
            },
          });
          console.log(`[Agent Deposit] ✅ Email notification sent to ${deposit.agent.email}`);
        }
      } catch (emailError) {
        console.error('[Agent Deposit] Email error:', emailError);
      }
    }
  } else if (depositStatus === 'FAILED') {
    console.log(`[Agent Deposit] ❌ Deposit ${depositId} marked as FAILED`);
  }
}

// ============================================
// HANDLE CUSTOMER TOP-UP (BALANCE)
// ============================================
async function handleCustomerTopUp(
  orderId: string,
  status: string,
  gateway: string,
  transactionId: string,
  paidAt: Date | null,
  amount?: number
) {
  console.log(`[Customer Top-Up] Processing: ${orderId}, Status: ${status}`);

  // Try multiple strategies to find the invoice
  let invoice = null;

  // Strategy 1: Try exact invoice number match
  // Format: TOPUP-{timestamp}-{sequence}
  const invoiceNumber = orderId.split('-').slice(0, 3).join('-');
  invoice = await prisma.invoice.findFirst({
    where: { invoiceNumber },
    include: { user: { include: { area: { select: { name: true } } } } }
  });

  // Strategy 2: If orderId is TOPUP-TEMP-xxx, find the most recent PENDING TOPUP invoice
  // This handles the case where payment is created before invoice (topup-direct flow)
  if (!invoice && orderId.startsWith('TOPUP-TEMP-')) {
    console.log(`[Customer Top-Up] Trying fallback: finding recent PENDING TOPUP invoice`);

    // Extract timestamp from TOPUP-TEMP-{timestamp}
    const timestamp = parseInt(orderId.replace('TOPUP-TEMP-', ''));
    const searchWindow = new Date(timestamp);
    searchWindow.setMinutes(searchWindow.getMinutes() - 5); // 5 minute window

    invoice = await prisma.invoice.findFirst({
      where: {
        invoiceType: 'TOPUP',
        status: 'PENDING',
        amount: amount, // Match by amount if available
        createdAt: { gte: searchWindow }
      },
      orderBy: { createdAt: 'desc' },
      include: { user: { include: { area: { select: { name: true } } } } }
    });

    if (invoice) {
      console.log(`[Customer Top-Up] Found matching invoice by timestamp: ${invoice.invoiceNumber}`);
    }
  }

  if (!invoice) {
    console.error(`[Customer Top-Up] Invoice not found for orderId: ${orderId}`);
    // Don't throw error - just log and return gracefully
    console.log(`[Customer Top-Up] Skipping - will retry on next webhook`);
    return;
  }

  console.log(`[Customer Top-Up] Found invoice: ${invoice.invoiceNumber}, User: ${invoice.user?.username}`);

  if (status === 'settlement' || status === 'capture') {
    // ─── AMOUNT VALIDATION ────────────────────────────────────────────────────
    if (typeof amount === 'number' && Number.isFinite(amount) && amount !== invoice.amount) {
      console.error(
        `[Customer Top-Up] AMOUNT_MISMATCH for ${invoice.invoiceNumber}: expected ${invoice.amount}, got ${amount}`
      );
      // Flag mismatch in payment attempt if exists
      try {
        const attempt = await prisma.paymentAttempt.findFirst({ where: { orderId } });
        if (attempt) {
          await prisma.paymentAttempt.update({
            where: { id: attempt.id },
            data: { mismatchFlagged: true, gatewayAmount: amount, status: 'FAILED', errorMessage: `Amount mismatch: expected ${invoice.amount}, got ${amount}` },
          });
        }
      } catch { /* best-effort */ }
      throw new Error('AMOUNT_MISMATCH');
    }

    // ─── ATOMIC IDEMPOTENCY GUARD + BALANCE INCREMENT ────────────────────────
    // Invoice mark-paid and user balance increment are wrapped in a single
    // transaction so they either both succeed or both roll back.
    let topupAmount = 0;
    let updatedUserBalance = 0;

    const txResult = await prisma.$transaction(async (tx) => {
      const markPaid = await tx.invoice.updateMany({
        where: { id: invoice.id, status: { not: 'PAID' } },
        data: { status: 'PAID', paidAt: paidAt || new Date() },
      });

      if (markPaid.count === 0) {
        console.log(`[Customer Top-Up] ⏭️  Invoice ${invoice.invoiceNumber} already PAID — skipping duplicate notification`);
        return null;
      }

      console.log(`[Customer Top-Up] ✅ Invoice ${invoice.invoiceNumber} marked as PAID`);

      if (invoice.user) {
        topupAmount = amount || invoice.amount;
        const updatedUser = await tx.pppoeUser.update({
          where: { id: invoice.user.id },
          data: {
            balance: {
              increment: topupAmount
            }
          }
        });
        updatedUserBalance = updatedUser.balance;
        console.log(`[Customer Top-Up] ✅ User ${invoice.user.username} balance increased by Rp ${topupAmount.toLocaleString('id-ID')}`);
        console.log(`[Customer Top-Up] New balance: Rp ${updatedUserBalance.toLocaleString('id-ID')}`);
      }

      return { topupAmount, updatedUserBalance };
    });

    if (txResult === null) {
      return; // Already processed by a concurrent webhook
    }

    // Send notifications outside the transaction (best-effort)
    if (invoice.user) {

      // Create notification using NotificationService
      try {
        const { NotificationService } = await import('@/server/services/notifications/dispatcher.service');
        await NotificationService.notifyPaymentReceived({
          amount: topupAmount,
          invoiceId: invoice.id,
          customerName: invoice.user.name,
          customerUsername: invoice.user.username,
          gateway: gateway
        });
      } catch (notifError) {
        console.error('[Customer Top-Up] Notification error:', notifError);
      }

      // Log activity
      try {
        await logActivity({
          username: invoice.user.username,
          userRole: 'CUSTOMER',
          action: 'CUSTOMER_TOPUP',
          description: `Customer ${invoice.user.name} topped up Rp ${topupAmount.toLocaleString('id-ID')} via ${gateway}`,
          module: 'payment',
          status: 'success',
          metadata: {
            userId: invoice.userId,
            invoiceNumber: invoice.invoiceNumber,
            amount: topupAmount,
            paymentGateway: gateway,
            transactionId,
            newBalance: updatedUserBalance,
          },
        });
      } catch (logError) {
        console.error('[Customer Top-Up] Activity log error:', logError);
      }

      // Sync to Keuangan
      try {
        const topupCategory = await prisma.transactionCategory.findFirst({
          where: { name: 'Top-Up Saldo', type: 'INCOME' },
        });

        // If category doesn't exist, try to find a general income category
        const category = topupCategory || await prisma.transactionCategory.findFirst({
          where: { type: 'INCOME' },
        });

        if (category) {
          // Use INSERT IGNORE for race-safe idempotency (MySQL)
          await prisma.$executeRaw`
            INSERT IGNORE INTO transactions (id, categoryId, type, amount, description, date, reference, notes, createdAt, updatedAt)
            VALUES (${nanoid()}, ${category.id}, 'INCOME', ${topupAmount}, 
                    ${`Top-Up Saldo - ${invoice.user.name}`}, NOW(), 
                    ${`TOPUP-${invoice.invoiceNumber}`}, 
                    ${`Payment via ${gateway}`}, NOW(), NOW())
          `;
          console.log(`[Customer Top-Up] ✅ Transaction synced to Keuangan`);
        }
      } catch (keuanganError) {
        console.error('[Customer Top-Up] Keuangan sync error:', keuanganError);
      }

      // Send WhatsApp notification for top-up success
      try {
        await sendPaymentSuccess({
          customerName: invoice.user.name,
          customerPhone: invoice.user.phone,
          customerId: (invoice.user as any).customerId || undefined,
          username: invoice.user.username,
          password: invoice.user.password,
          profileName: 'Top-Up Saldo',
          area: (invoice.user as any).area?.name,
          address: invoice.user.address || undefined,
          invoiceNumber: invoice.invoiceNumber,
          amount: topupAmount,
        });
        console.log(`[Customer Top-Up] ✅ WhatsApp notification sent`);
      } catch (waError) {
        console.error('[Customer Top-Up] WhatsApp error:', waError);
      }

      // ============================================
      // SEND EMAIL NOTIFICATION FOR TOP-UP SUCCESS
      // ============================================
      const customerEmail = invoice.customerEmail || invoice.user.email;
      if (customerEmail) {
        try {
          const emailSettings = await prisma.emailSettings.findFirst();
          if (emailSettings?.enabled) {
            const company = await prisma.company.findFirst();

            const nodemailer = require('nodemailer');
            const transporter = nodemailer.createTransport({
              host: emailSettings.smtpHost,
              port: emailSettings.smtpPort,
              secure: emailSettings.smtpSecure,
              auth: { user: emailSettings.smtpUser, pass: emailSettings.smtpPassword },
            });

            const htmlBody = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #16a34a;">Top-Up Saldo Berhasil!</h2>
                <p>Halo <strong>${invoice.user.name}</strong>,</p>
                <p>Top-up saldo Anda telah berhasil diproses.</p>
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                  <tr>
                    <td style="padding: 10px; border: 1px solid #ddd;"><strong>No. Invoice</strong></td>
                    <td style="padding: 10px; border: 1px solid #ddd;">${invoice.invoiceNumber}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border: 1px solid #ddd;"><strong>Jumlah Top-Up</strong></td>
                    <td style="padding: 10px; border: 1px solid #ddd;">Rp ${topupAmount.toLocaleString('id-ID')}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border: 1px solid #ddd;"><strong>Saldo Baru</strong></td>
                    <td style="padding: 10px; border: 1px solid #ddd;">Rp ${updatedUserBalance.toLocaleString('id-ID')}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border: 1px solid #ddd;"><strong>Metode Pembayaran</strong></td>
                    <td style="padding: 10px; border: 1px solid #ddd;">${gateway.toUpperCase()}</td>
                  </tr>
                </table>
                <p>Saldo dapat digunakan untuk perpanjangan langganan otomatis.</p>
                <p>Terima kasih telah menggunakan layanan kami.</p>
                <p style="color: #666; font-size: 12px;">Salam,<br/>${company?.name || 'ISP'}</p>
              </div>
            `;

            await transporter.sendMail({
              from: `"${emailSettings.fromName}" <${emailSettings.fromEmail}>`,
              to: customerEmail,
              subject: `Top-Up Saldo Berhasil - Rp ${topupAmount.toLocaleString('id-ID')}`,
              html: htmlBody,
            });

            await prisma.emailHistory.create({
              data: {
                id: nanoid(),
                toEmail: customerEmail,
                toName: invoice.user.name,
                subject: `Top-Up Saldo Berhasil - Rp ${topupAmount.toLocaleString('id-ID')}`,
                body: htmlBody,
                status: 'sent',
              },
            });
            console.log(`[Customer Top-Up] ✅ Email notification sent to ${customerEmail}`);
          }
        } catch (emailError) {
          console.error('[Customer Top-Up] Email error:', emailError);
        }
      }
    }
  } else if (['expire', 'cancel', 'deny', 'failed'].includes(status)) {
    // Update invoice status to match payment status
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'CANCELLED' }
    });
    console.log(`[Customer Top-Up] ❌ Invoice ${invoice.invoiceNumber} marked as CANCELLED`);
  }
}
