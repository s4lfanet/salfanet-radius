import { NextRequest } from 'next/server';
import { prisma } from '@/server/db/client';
import { disconnectPPPoEUser } from '@/server/services/radius/coa-handler.service';
import { managePppSecret, kickPppoeSession, shouldManagePppSecretForSuspend } from '@/server/services/mikrotik/ppp-secret.service';
import { requirePermission } from '@/server/middleware/api-auth';
import { sendPaymentSuccess } from '@/server/services/notifications/whatsapp-templates.service';
import { sendPushToUser } from '@/server/services/notifications/push-templates.service';
import { EmailService } from '@/server/services/notifications/email.service';
import { randomBytes } from 'crypto';
import { nanoid } from 'nanoid';
import { startOfDayWIBtoUTC, endOfDayWIBtoUTC, toUTC, nowWIB, WIB_TIMEZONE } from '@/lib/timezone';
import { formatInTimeZone } from 'date-fns-tz';
import { ok, created, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response';
// Generate secure random token for payment link
function generatePaymentToken(): string {
  return randomBytes(32).toString('hex');
}

// DELETE - Delete invoice(s)
export async function DELETE(request: NextRequest) {
  const authCheck = await requirePermission('invoices.delete');
  if (!authCheck.authorized) return authCheck.response;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const ids = searchParams.get('ids'); // comma-separated IDs for bulk delete

    if (!id && !ids) return badRequest('Invoice ID or IDs are required');

    // Bulk delete
    if (ids) {
      const idList = ids.split(',').map(i => i.trim()).filter(Boolean);

      if (idList.length === 0) return badRequest('No valid IDs provided');

      // Delete related records first
      await prisma.payment.deleteMany({ where: { invoiceId: { in: idList } } });
      await prisma.manualPayment.deleteMany({ where: { invoiceId: { in: idList } } });
      await prisma.paymentProof.deleteMany({ where: { invoiceId: { in: idList } } });
      await prisma.invoiceAddon.deleteMany({ where: { invoiceId: { in: idList } } });
      await prisma.paymentAttempt.deleteMany({ where: { invoiceId: { in: idList } } });
      await prisma.registrationRequest.updateMany({ where: { invoiceId: { in: idList } }, data: { invoiceId: null } });
      await prisma.qrisPending.updateMany({ where: { invoiceId: { in: idList } }, data: { invoiceId: null } });

      const result = await prisma.invoice.deleteMany({ where: { id: { in: idList } } });

      return ok({ success: true, message: `${result.count} invoice(s) deleted`, deletedCount: result.count });
    }

    if (!id) return badRequest('Invoice ID is required');

    const existingInvoice = await prisma.invoice.findUnique({ where: { id } });
    if (!existingInvoice) return notFound('Invoice');

    // Delete related records first
    await prisma.payment.deleteMany({ where: { invoiceId: id } });
    await prisma.manualPayment.deleteMany({ where: { invoiceId: id } });
    await prisma.paymentProof.deleteMany({ where: { invoiceId: id } });
    await prisma.invoiceAddon.deleteMany({ where: { invoiceId: id } });
    await prisma.paymentAttempt.deleteMany({ where: { invoiceId: id } });
    await prisma.registrationRequest.updateMany({ where: { invoiceId: id }, data: { invoiceId: null } });
    await prisma.qrisPending.updateMany({ where: { invoiceId: id }, data: { invoiceId: null } });
    await prisma.invoice.delete({ where: { id } });

    return ok({ success: true, message: 'Invoice deleted successfully' });
  } catch (error) {
    console.error('Delete invoice error:', error);
    return serverError('Failed to delete invoice');
  }
}

// GET - List invoices with filters
export async function GET(request: NextRequest) {
  const authCheck = await requirePermission('invoices.view');
  if (!authCheck.authorized) return authCheck.response;
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // UNPAID, PAID, PENDING, OVERDUE
    const userId = searchParams.get('userId');
    const limit = parseInt(searchParams.get('limit') || '100');
    const monthParam = searchParams.get('month'); // YYYY-MM

    const where: any = {};

    // Month filter — applies to paidAt for PAID invoices, createdAt for others
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split('-').map(Number);
      const start = startOfDayWIBtoUTC(new Date(Date.UTC(y, m - 1, 1)));
      const end = endOfDayWIBtoUTC(new Date(Date.UTC(y, m, 0))); // last day of month
      const isPaidTab = status === 'PAID';
      where[isPaidTab ? 'paidAt' : 'createdAt'] = { gte: start, lte: end };
    }

    if (status && status !== 'all') {
      // UNPAID atau PENDING mencakup PENDING dan OVERDUE
      if (status === 'UNPAID' || status === 'PENDING') {
        where.status = { in: ['PENDING', 'OVERDUE'] };
      } else {
        where.status = status;
      }
    }

    if (userId) {
      where.userId = userId;
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include: {
        user: {
          select: {
            customerId: true,  // ID Pelanggan
            name: true,
            phone: true,
            email: true,
            username: true,
            profile: {
              select: {
                name: true,
              },
            },
            area: {  // Area pelanggan
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
    });

    // Calculate stats — run all 7 queries in parallel
    const [total, unpaid, paid, pending, overdue, totalUnpaidAgg, totalPaidAgg] = await Promise.all([
      prisma.invoice.count(),
      prisma.invoice.count({ where: { status: { in: ['PENDING', 'OVERDUE'] } } }),
      prisma.invoice.count({ where: { status: 'PAID' } }),
      prisma.invoice.count({ where: { status: 'PENDING' } }),
      prisma.invoice.count({ where: { status: 'OVERDUE' } }),
      prisma.invoice.aggregate({ where: { status: { in: ['PENDING', 'OVERDUE'] } }, _sum: { amount: true } }),
      prisma.invoice.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
    ]);
    const stats = { total, unpaid, paid, pending, overdue, totalUnpaidAmount: totalUnpaidAgg, totalPaidAmount: totalPaidAgg };

    return ok({
      invoices,
      stats: {
        ...stats,
        totalUnpaidAmount: stats.totalUnpaidAmount._sum.amount || 0,
        totalPaidAmount: stats.totalPaidAmount._sum.amount || 0,
      },
    });
  } catch (error) {
    console.error('Get invoices error:', error);
    return serverError('Failed to fetch invoices');
  }
}

// POST - Create invoice manually
export async function POST(request: NextRequest) {
  const authCheck = await requirePermission('invoices.create');
  if (!authCheck.authorized) return authCheck.response;
  try {
    const body = await request.json();
    const { userId, amount, dueDate, notes } = body;

    if (!userId || !amount) return badRequest('User ID and amount are required');

    // Verify user exists
    const user = await prisma.pppoeUser.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user) return notFound('User');

    // Generate invoice number: INV-YYYYMM-0001
    const now = nowWIB();
    const wibDateStr = formatInTimeZone(now, WIB_TIMEZONE, 'yyyy-MM');
    const year = parseInt(wibDateStr.substring(0, 4));
    const month = wibDateStr.substring(5, 7);
    const count = await prisma.invoice.count({
      where: {
        invoiceNumber: {
          startsWith: `INV-${year}${month}-`,
        },
      },
    });
    const invoiceNumber = `INV-${year}${month}-${String(count + 1).padStart(4, '0')}`;

    // Calculate due date (default 7 days from now)
    const calculatedDueDate = dueDate
      ? new Date(dueDate)
      : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Get company base URL for payment link
    // Priority: company.baseUrl → request Host header → env → localhost
    const company = await prisma.company.findFirst();
    const forwardedProto = request.headers.get('x-forwarded-proto') || 'http';
    const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
    const inferredBase = forwardedHost ? `${forwardedProto}://${forwardedHost}` : '';
    const baseUrl = (company?.baseUrl && !company.baseUrl.includes('localhost'))
      ? company.baseUrl
      : (inferredBase && !inferredBase.includes('localhost'))
        ? inferredBase
        : company?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Generate payment token and link
    const paymentToken = generatePaymentToken();
    const paymentLink = `${baseUrl}/pay/${paymentToken}`;

    const invoice = await prisma.invoice.create({
      data: {
        id: crypto.randomUUID(),
        invoiceNumber,
        userId,
        customerName: user.name,
        customerPhone: user.phone,
        customerUsername: user.username,
        amount,
        baseAmount: amount,
        dueDate: calculatedDueDate,
        status: 'PENDING',
        paymentToken,
        paymentLink,
      },
      include: {
        user: {
          select: {
            name: true,
            phone: true,
            email: true,
          },
        },
      },
    });

    return created({ invoice });
  } catch (error) {
    console.error('Create invoice error:', error);
    return serverError('Failed to create invoice');
  }
}

// PUT - Update invoice (mark as paid, etc)
export async function PUT(request: NextRequest) {
  const authCheck = await requirePermission('invoices.edit');
  if (!authCheck.authorized) return authCheck.response;
  try {
    const body = await request.json();
    const { id, status, paidAt } = body;

    if (!id) return badRequest('Invoice ID is required');

    // Get existing invoice with user and profile
    const existingInvoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        user: {
          include: {
            profile: true,
            router: { select: { id: true, authMode: true } },
          },
        },
      },
    });

    if (!existingInvoice) return notFound('Invoice');

    const updateData: any = {};

    if (status) updateData.status = status;

    // If marking as paid, set paidAt timestamp
    if (status === 'PAID' && !paidAt) {
      updateData.paidAt = new Date();
    } else if (paidAt) {
      updateData.paidAt = new Date(paidAt);
    }

    // Update invoice — for PAID use atomic updateMany so only ONE concurrent request
    // proceeds with side-effects (WA, RADIUS, Keuangan sync).
    let invoice;
    let paidUpdateCount = 0;

    if (status === 'PAID') {
      paidUpdateCount = (
        await prisma.invoice.updateMany({
          where: { id, status: { not: 'PAID' } },
          data: updateData,
        })
      ).count;
      // Re-fetch so the response contains the current state
      invoice = await prisma.invoice.findUnique({
        where: { id },
        include: { user: { select: { name: true, phone: true, email: true } } },
      });
      if (!invoice) return notFound('Invoice');
    } else {
      invoice = await prisma.invoice.update({
        where: { id },
        data: updateData,
        include: {
          user: {
            select: {
              name: true,
              phone: true,
              email: true,
            },
          },
        },
      });
    }

    // If marking as PAID and this request was the one that actually changed the status
    if (status === 'PAID' && paidUpdateCount > 0) {
      const user = existingInvoice.user;

      if (!user) {
        console.log('[Invoice Payment] User not found, skipping activation');
        return ok({ invoice });
      }

      const profile = user.profile;

      if (profile) {
        // Calculate new expiredAt
        // Base: use current expiredAt if still in the future, otherwise use now (payment date)
        // Both PREPAID and POSTPAID get a full validity period after each payment
        const now = nowWIB();
        let baseDate = user.expiredAt ? new Date(user.expiredAt) : now;
        if (baseDate < now) {
          baseDate = now; // Expired already → start fresh from payment date
        }
        let newExpiry = new Date(baseDate);

        switch (profile.validityUnit) {
          case 'DAYS':
            newExpiry.setDate(newExpiry.getDate() + profile.validityValue);
            break;
          case 'MONTHS':
            newExpiry.setMonth(newExpiry.getMonth() + profile.validityValue);
            break;
          case 'HOURS':
            newExpiry.setHours(newExpiry.getHours() + profile.validityValue);
            break;
          case 'MINUTES':
            newExpiry.setMinutes(newExpiry.getMinutes() + profile.validityValue);
            break;
        }

        // Check if this is a package change invoice, update profileId accordingly
        let targetProfileId = user.profileId;
        let targetProfile = profile;
        let isPackageChange = false;
        if (existingInvoice.additionalFees && typeof existingInvoice.additionalFees === 'object') {
          const feesObj = existingInvoice.additionalFees as any;
          if (feesObj.items && Array.isArray(feesObj.items)) {
            const pkgItem = feesObj.items.find((item: any) =>
              (item.metadata?.type === 'package_change' || item.metadata?.type === 'package_upgrade') &&
              item.metadata?.newPackageId
            );
            if (pkgItem) {
              isPackageChange = true;
              targetProfileId = pkgItem.metadata.newPackageId;
              const foundProfile = await prisma.pppoeProfile.findUnique({ where: { id: targetProfileId } });
              if (foundProfile) {
                targetProfile = foundProfile as any;
                console.log(`  - Package change: ${pkgItem.metadata.oldPackageName} → ${pkgItem.metadata.newPackageName} (expiry PRESERVED)`);
              }
            }
          }
        }

        // For package change: preserve existing expiredAt, do NOT extend
        const finalExpiry = isPackageChange ? (user.expiredAt || now) : toUTC(newExpiry);

        // Update user expiredAt, activate if isolated/suspended/expired, and update profileId if package changed
        const shouldActivate = ['isolated', 'suspended', 'expired'].includes(user.status);

        await prisma.pppoeUser.update({
          where: { id: user.id },
          data: {
            expiredAt: finalExpiry,
            status: shouldActivate ? 'active' : user.status,
            ...(targetProfileId !== user.profileId && { profileId: targetProfileId }),
          },
        });

        console.log(`[Invoice Payment] User ${user.name}:`);
        console.log(`  - ExpiredAt: ${user.expiredAt?.toISOString() || 'null'} → ${finalExpiry.toISOString()} ${isPackageChange ? '(package change, preserved)' : '(extended)'}`);

        // ============================================
        // UPDATE MANUAL PAYMENTS TO APPROVED
        // ============================================
        try {
          const updatedManualPayments = await prisma.manualPayment.updateMany({
            where: {
              invoiceId: id,
              status: 'PENDING',
            },
            data: {
              status: 'APPROVED',
              approvedAt: new Date(),
            },
          });
          if (updatedManualPayments.count > 0) {
            console.log(`  - Manual Payments: ${updatedManualPayments.count} payment(s) marked as APPROVED`);
          }
        } catch (mpError) {
          console.error('  - Manual Payment update error:', mpError);
        }

        // ============================================
        // AUTO-SYNC TO KEUANGAN TRANSACTIONS
        // ============================================
        try {
          const pppoeCategory = await prisma.transactionCategory.findFirst({
            where: { name: 'Pembayaran PPPoE', type: 'INCOME' },
          });

          if (pppoeCategory) {
            // Check if transaction already exists
            const existingTransaction = await prisma.transaction.findFirst({
              where: { reference: `INV-${existingInvoice.invoiceNumber}` },
            });

            if (!existingTransaction) {
              // Use raw SQL with NOW() to avoid timezone conversion
              const paidDate = updateData.paidAt || new Date();
              await prisma.$executeRaw`
                INSERT INTO transactions (id, categoryId, type, amount, description, date, reference, notes, createdAt, updatedAt)
                VALUES (${nanoid()}, ${pppoeCategory.id}, 'INCOME', ${existingInvoice.amount}, 
                        ${`Pembayaran ${profile.name} - ${user.name}`}, NOW(), 
                        ${`INV-${existingInvoice.invoiceNumber}`}, 'Manual mark as paid by admin', NOW(), NOW())
              `;
              console.log(`  - Keuangan: Transaction synced (${existingInvoice.amount})`);
            }
          }
        } catch (keuanganError) {
          console.error('  - Keuangan sync error:', keuanganError);
        }

        // ============================================
        // SEND WHATSAPP NOTIFICATION (ALWAYS)
        // ============================================
        if (user.phone && profile) {
          try {
            await sendPaymentSuccess({
              customerName: user.name,
              customerPhone: user.phone,
              customerId: (user as any).customerId || undefined,
              username: user.username,
              password: user.password,
              profileName: targetProfile ? targetProfile.name : profile.name,
              invoiceNumber: existingInvoice.invoiceNumber,
              amount: existingInvoice.amount,
              newExpiredAt: finalExpiry,
            });
            console.log(`  - WhatsApp: Payment success notification sent`);
          } catch (waError) {
            console.error(`  - WhatsApp: Failed to send notification:`, waError);
            // Don't fail the payment if WhatsApp fails
          }
        }

        // ============================================
        // SEND EMAIL NOTIFICATION (PAYMENT CONFIRMATION)
        // ============================================
        const customerEmail = existingInvoice.customerEmail || user.email;
        if (customerEmail) {
          try {
            const emailCompany = await prisma.company.findFirst();
            await EmailService.sendPaymentConfirmation({
              email: customerEmail,
              customerName: user.name,
              customerUsername: user.username,
              invoiceNumber: existingInvoice.invoiceNumber,
              amount: existingInvoice.amount,
              paymentMethod: 'Manual',
              companyName: emailCompany?.name || '',
              companyPhone: emailCompany?.phone || '',
              newExpiredAt: finalExpiry.toISOString(),
            });
            console.log(`  - Email: Payment confirmation sent to ${customerEmail}`);
          } catch (emailErr) {
            console.error(`  - Email: Failed to send payment confirmation:`, emailErr);
          }
        }

        // ============================================
        // SEND FCM PUSH NOTIFICATION TO CUSTOMER APP
        // ============================================
        try {
          const pushCompany = await prisma.company.findFirst();
          await sendPushToUser(user.id, 'payment-success', {
            customerName: user.name,
            username: user.username,
            invoiceNumber: existingInvoice.invoiceNumber,
            amount: existingInvoice.amount,
            profileName: targetProfile ? targetProfile.name : profile.name,
            expiredDate: finalExpiry,
            companyName: pushCompany?.name || '',
            companyPhone: pushCompany?.phone || '',
          });
          console.log(`  - FCM Push: Payment success notification sent`);
        } catch (pushError) {
          console.error(`  - FCM Push: Failed to send notification:`, pushError);
          // Don't fail the payment if push notification fails
        }

        // Run RADIUS sync if user was isolated/suspended OR if package changed
        const packageChanged = targetProfileId !== user.profileId;
        if (shouldActivate || packageChanged) {
          console.log(`  - Status: ${user.status} → ${shouldActivate ? 'active' : user.status}`);
          if (packageChanged) console.log(`  - RADIUS: Updating group to ${targetProfile?.groupName || targetProfileId}`);

          const nasIdentifier = user.router?.id || null;
          const authMode = user.router?.authMode || 'local';
          const groupName = targetProfile?.groupName || profile.groupName;

          // Restore RADIUS to active profile
          try {
            if (shouldActivate) {
              // Remove forced reject (if any) from previous SUSPENDED state
              await prisma.radcheck.deleteMany({
                where: {
                  username: user.username,
                  attribute: 'Auth-Type',
                  ...(nasIdentifier ? { nas_identifier: nasIdentifier } : {}),
                }
              });
              // Remove NAS-IP-Address restriction
              await prisma.radcheck.deleteMany({
                where: {
                  username: user.username,
                  attribute: 'NAS-IP-Address',
                  ...(nasIdentifier ? { nas_identifier: nasIdentifier } : {}),
                }
              });
            }

            // 1. Ensure password in radcheck (with nas_identifier)
            await prisma.$executeRaw`
              INSERT INTO radcheck (username, attribute, op, value, nas_identifier)
              VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password}, ${nasIdentifier})
              ON DUPLICATE KEY UPDATE value = ${user.password}
            `;

            // 2. Set group to target profile (with nas_identifier)
            await prisma.$executeRaw`
              DELETE FROM radusergroup WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
            `;
            await prisma.$executeRaw`
              INSERT INTO radusergroup (username, groupname, priority, nas_identifier)
              VALUES (${user.username}, ${groupName}, 1, ${nasIdentifier})
            `;

            if (shouldActivate) {
              // 3. Remove isolated message from radreply
              await prisma.radreply.deleteMany({
                where: {
                  username: user.username,
                  attribute: 'Reply-Message',
                  ...(nasIdentifier ? { nas_identifier: nasIdentifier } : {}),
                }
              });
              console.log(`  - Removed isolated message from radreply`);
            }

            // 4. Restore / update static IP if exists (with nas_identifier)
            if (user.ipAddress) {
              await prisma.$executeRaw`
                INSERT INTO radreply (username, attribute, op, value, nas_identifier)
                VALUES (${user.username}, 'Framed-IP-Address', ':=', ${user.ipAddress}, ${nasIdentifier})
                ON DUPLICATE KEY UPDATE value = ${user.ipAddress}
              `;
            } else {
              await prisma.$executeRaw`
                DELETE FROM radreply WHERE username = ${user.username} AND attribute = 'Framed-IP-Address' AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
              `;
            }

            console.log(`  - RADIUS: Profile set to ${groupName}`);

            // 4.5. Restore MikroTik PPP secret / hotspot user from 'isolir' → user's profile
            // Critical: during isolation, PPP secret profile was changed to 'isolir'
            // or hotspot user was disabled. Must restore based on connectionType.
            if (user.router?.id && shouldManagePppSecretForSuspend(authMode)) {
              const connType = (user as any).connectionType || 'PPPOE';
              if (connType === 'HOTSPOT') {
                const { manageHotspotUser, kickHotspotSession } = await import('@/server/services/mikrotik/arp-hotspot.service');
                manageHotspotUser(user.router.id, 'update', {
                  username: user.username,
                  password: user.password,
                  disabled: false,
                })
                  .then(r => console.log(`  - Hotspot: Re-enabled for ${user.username}: ${r.message}`))
                  .catch(e => console.error(`  - Hotspot: Failed to re-enable for ${user.username}:`, e?.message || e));

                kickHotspotSession(user.router.id, user.username)
                  .then(k => console.log(`  - Hotspot: Kicked ${k} session(s) for ${user.username}`))
                  .catch(e => console.error(`  - Hotspot: Kick failed for ${user.username}:`, e?.message || e));
              } else {
                managePppSecret(user.router.id, 'enable', {
                  username: user.username,
                  password: user.password,
                  profile: groupName,
                })
                  .then(r => console.log(`  - PPP secret: Restored to ${groupName} for ${user.username}: ${r.message}`))
                  .catch(e => console.error(`  - PPP secret: Failed to restore for ${user.username}:`, e?.message || e));

                // Kick active session via MikroTik API (critical for local auth)
                kickPppoeSession(user.router.id, user.username)
                .then(kicked => console.log(`  - MikroTik: Kicked ${kicked} session(s) for ${user.username}`))
                .catch(e => console.error(`  - MikroTik: Kick failed for ${user.username}:`, e?.message || e));
              }
            }

            if (shouldActivate) {
              // Update registration status to ACTIVE if this is installation invoice
              const registration = await prisma.registrationRequest.findFirst({
                where: { pppoeUserId: user.id, status: 'INSTALLED' }
              });
              if (registration) {
                await prisma.registrationRequest.update({
                  where: { id: registration.id },
                  data: { status: 'ACTIVE' }
                });
                console.log(`  - Registration status updated to ACTIVE`);
              }
            }

            // 5. Send CoA disconnect to force re-auth with new profile
            const coaResult = await disconnectPPPoEUser(user.username);
            if (coaResult.success) {
              console.log(`  - CoA: User disconnected, will reconnect with ${groupName}`);
            } else {
              console.log(`  - CoA: ${coaResult.error || 'No active session'}`);
            }
          } catch (radiusError) {
            console.error(`  - RADIUS sync error:`, radiusError);
          }
        }
      }
    }

    return ok({ invoice });
  } catch (error) {
    console.error('Update invoice error:', error);
    return serverError('Failed to update invoice');
  }
}
