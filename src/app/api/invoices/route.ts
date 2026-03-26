import { NextRequest } from 'next/server';
import { prisma } from '@/server/db/client';
import { disconnectPPPoEUser } from '@/server/services/radius/coa-handler.service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { sendPaymentSuccess } from '@/server/services/notifications/whatsapp-templates.service';
import { sendPushToUser } from '@/server/services/notifications/push-templates.service';
import { randomBytes } from 'crypto';
import { nanoid } from 'nanoid';
import { startOfDayWIBtoUTC, endOfDayWIBtoUTC } from '@/lib/timezone';
import { ok, created, badRequest, unauthorized, notFound, serverError } from '@/lib/api-response';
// Generate secure random token for payment link
function generatePaymentToken(): string {
  return randomBytes(32).toString('hex');
}

// DELETE - Delete invoice(s)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const ids = searchParams.get('ids'); // comma-separated IDs for bulk delete

    if (!id && !ids) return badRequest('Invoice ID or IDs are required');

    // Bulk delete
    if (ids) {
      const idList = ids.split(',').map(i => i.trim()).filter(Boolean);

      if (idList.length === 0) return badRequest('No valid IDs provided');

      // Delete related payments first
      await prisma.payment.deleteMany({ where: { invoiceId: { in: idList } } });

      const result = await prisma.invoice.deleteMany({ where: { id: { in: idList } } });

      return ok({ success: true, message: `${result.count} invoice(s) deleted`, deletedCount: result.count });
    }

    if (!id) return badRequest('Invoice ID is required');

    const existingInvoice = await prisma.invoice.findUnique({ where: { id } });
    if (!existingInvoice) return notFound('Invoice');

    await prisma.payment.deleteMany({ where: { invoiceId: id } });
    await prisma.invoice.delete({ where: { id } });

    return ok({ success: true, message: 'Invoice deleted successfully' });
  } catch (error) {
    console.error('Delete invoice error:', error);
    return serverError('Failed to delete invoice');
  }
}

// GET - List invoices with filters
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return unauthorized();
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
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
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

    // Update invoice
    const invoice = await prisma.invoice.update({
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

    // If marking as PAID, extend user's expiredAt based on profile validity
    if (status === 'PAID' && existingInvoice.status !== 'PAID') {
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
        const now = new Date();
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
        const finalExpiry = isPackageChange ? (user.expiredAt || new Date()) : newExpiry;

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
              username: user.username,
              password: user.password,
              profileName: targetProfile ? targetProfile.name : profile.name,
              invoiceNumber: existingInvoice.invoiceNumber,
              amount: existingInvoice.amount,
            });
            console.log(`  - WhatsApp: Payment success notification sent`);
          } catch (waError) {
            console.error(`  - WhatsApp: Failed to send notification:`, waError);
            // Don't fail the payment if WhatsApp fails
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

          // Restore RADIUS to active profile
          try {
            if (shouldActivate) {
              // Remove forced reject (if any) from previous SUSPENDED state
              await prisma.radcheck.deleteMany({
                where: { username: user.username, attribute: 'Auth-Type' }
              });
              // Remove NAS-IP-Address restriction
              await prisma.radcheck.deleteMany({
                where: { username: user.username, attribute: 'NAS-IP-Address' }
              });
            }

            // 1. Ensure password in radcheck
            await prisma.$executeRaw`
              INSERT INTO radcheck (username, attribute, op, value)
              VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password})
              ON DUPLICATE KEY UPDATE value = ${user.password}
            `;

            // 2. Set group to target profile (new or existing)
            const groupName = targetProfile?.groupName || profile.groupName;
            await prisma.$executeRaw`
              DELETE FROM radusergroup WHERE username = ${user.username}
            `;
            await prisma.$executeRaw`
              INSERT INTO radusergroup (username, groupname, priority)
              VALUES (${user.username}, ${groupName}, 1)
            `;

            if (shouldActivate) {
              // 3. Remove isolated message from radreply
              await prisma.radreply.deleteMany({
                where: { username: user.username, attribute: 'Reply-Message' }
              });
              console.log(`  - Removed isolated message from radreply`);
            }

            // 4. Restore / update static IP if exists
            if (user.ipAddress) {
              await prisma.$executeRaw`
                INSERT INTO radreply (username, attribute, op, value)
                VALUES (${user.username}, 'Framed-IP-Address', ':=', ${user.ipAddress})
                ON DUPLICATE KEY UPDATE value = ${user.ipAddress}
              `;
            } else {
              await prisma.$executeRaw`
                DELETE FROM radreply WHERE username = ${user.username} AND attribute = 'Framed-IP-Address'
              `;
            }

            console.log(`  - RADIUS: Profile set to ${groupName}`);

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
