import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/server/middleware/api-auth';
import { prisma } from '@/server/db/client';
import { generateInvoiceNumber, generateInvoiceId, generateTransactionId, generateCategoryId } from '@/server/services/billing/invoice.service';
import { managePppSecret, shouldManagePppSecretForSuspend, kickPppoeSession } from '@/server/services/mikrotik/ppp-secret.service';
import { toUTC, nowWIB } from '@/lib/timezone';
import crypto from 'crypto';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authCheck = await requirePermission('customers.edit');
    if (!authCheck.authorized) return authCheck.response;

    const { id } = await context.params;
    const { profileId } = await request.json();

    // Get user data
    const user = await prisma.pppoeUser.findUnique({
      where: { id },
      include: { profile: true, area: true, router: { select: { id: true, authMode: true } } },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get new profile
    const newProfile = await prisma.pppoeProfile.findUnique({
      where: { id: profileId },
    });

    if (!newProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const profileChanged = user.profileId !== profileId;
    const now = nowWIB();
    const currentExpired = user.expiredAt ? new Date(user.expiredAt) : now;
    
    // Calculate new expiry date (extend from current expiry or now, whichever is later)
    const baseDate = currentExpired > now ? currentExpired : now;
    const newExpiredAt = new Date(baseDate);
    newExpiredAt.setMonth(newExpiredAt.getMonth() + 1); // Extend by 1 month
    const finalExpiredAt = toUTC(newExpiredAt);

    // Update user
    const updatedUser = await prisma.pppoeUser.update({
      where: { id },
      data: {
        profileId,
        expiredAt: finalExpiredAt,
        status: 'active',
      },
    });

    // Restore RADIUS tables so user reconnects with the correct profile.
    // This is critical when user was previously isolated (radusergroup = 'isolir').
    // Without this, the user would get restricted isolir access even after extension.
    const nasIdentifier = user.routerId || null;
    try {
      // Remove any old rejection / suspension markers — scoped by nas_identifier
      await prisma.radcheck.deleteMany({
        where: { username: user.username, attribute: 'Auth-Type', ...(nasIdentifier ? { nas_identifier: nasIdentifier } : {}) },
      });
      await prisma.radcheck.deleteMany({
        where: { username: user.username, attribute: 'NAS-IP-Address', ...(nasIdentifier ? { nas_identifier: nasIdentifier } : {}) },
      });
      await prisma.radreply.deleteMany({
        where: { username: user.username, attribute: 'Reply-Message', ...(nasIdentifier ? { nas_identifier: nasIdentifier } : {}) },
      });

      // Ensure password exists in radcheck — with nas_identifier
      await prisma.$executeRaw`
        INSERT INTO radcheck (username, attribute, op, value, nas_identifier)
        VALUES (${user.username}, 'Cleartext-Password', ':=', ${user.password}, ${nasIdentifier})
        ON DUPLICATE KEY UPDATE value = ${user.password}
      `;

      // Restore subscription group (newProfile is the extended/changed profile) — scoped by nas_identifier
      await prisma.$executeRaw`
        DELETE FROM radusergroup WHERE username = ${user.username} AND (${nasIdentifier} IS NULL OR nas_identifier = ${nasIdentifier})
      `;
      await prisma.$executeRaw`
        INSERT INTO radusergroup (username, groupname, priority, nas_identifier)
        VALUES (${user.username}, ${newProfile.groupName}, 1, ${nasIdentifier})
      `;

      // Restore static IP (remove old, re-add if exists) — scoped by nas_identifier
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

      // Restore PPP secret profile in MikroTik (critical for local mode)
      if (user.routerId && shouldManagePppSecretForSuspend(user.router?.authMode)) {
        managePppSecret(user.routerId, 'enable', {
          username: user.username,
          password: user.password,
          profile: newProfile.groupName,
        }).then((r) => {
          console.log(`[Extend] PPP secret restored to "${newProfile.groupName}" for ${user.username}: ${r.message}`);
        }).catch((e) => {
          console.error(`[Extend] PPP secret restore failed for ${user.username}:`, e?.message || e);
        });
      }

      // Only send CoA disconnect if the user was previously isolated — they need to
      // re-authenticate to get the normal (non-isolir) profile.
      // If the user is already ACTIVE, do NOT disconnect (avoid interrupting live sessions).
      const wasIsolated = user.status === 'isolated';
      if (wasIsolated) {
        // Kick via MikroTik API (for local sessions)
        if (user.routerId && shouldManagePppSecretForSuspend(user.router?.authMode)) {
          kickPppoeSession(user.routerId, user.username).then((kicked) => {
            console.log(`[Extend] Kicked ${kicked} session(s) for ${user.username} (was isolated)`);
          }).catch((e) => {
            console.error(`[Extend] Kick failed for ${user.username}:`, e?.message || e);
          });
        }

        const { disconnectPPPoEUser } = await import('@/server/services/radius/coa-handler.service');
        const coaResult = await disconnectPPPoEUser(user.username);
        console.log(`[Extend] RADIUS restored + CoA disconnect for ${user.username} (was isolated):`, coaResult);
      } else {
        console.log(`[Extend] RADIUS group/IP updated for ${user.username} (was active — session kept, no disconnect)`);
      }
    } catch (radiusError: any) {
      console.error('[Extend] RADIUS restore error (non-fatal):', radiusError?.message);
    }

    // Create invoice record (already PAID)
    const invoiceNumber = generateInvoiceNumber();
    
    // Generate payment token and link for record keeping
    const company = await prisma.company.findFirst();
    const forwardedProto = request.headers.get('x-forwarded-proto') || 'http';
    const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
    const inferredBase = forwardedHost ? `${forwardedProto}://${forwardedHost}` : '';
    const baseUrl = (company?.baseUrl && !company.baseUrl.includes('localhost'))
      ? company.baseUrl
      : (inferredBase && !inferredBase.includes('localhost'))
        ? inferredBase
        : company?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const paymentToken = crypto.randomBytes(32).toString('hex');
    const paymentLink = `${baseUrl}/pay/${paymentToken}`;
    
    // Calculate PPN if enabled on profile (apply user discount to base price)
    const extendBaseAmount = Math.max(0, newProfile.price - (user.discount || 0));
    let extendAmount = extendBaseAmount;
    let extendTaxRate: number | null = null;
    if (newProfile.ppnActive && newProfile.ppnRate > 0) {
      extendTaxRate = newProfile.ppnRate;
      extendAmount = Math.round(extendBaseAmount + (extendBaseAmount * extendTaxRate / 100));
    }

    await prisma.invoice.create({
      data: {
        id: generateInvoiceId(),
        invoiceNumber,
        userId: id,
        amount: extendAmount,
        baseAmount: extendBaseAmount,
        ...(extendTaxRate !== null && { taxRate: extendTaxRate }),
        status: 'PAID',
        dueDate: newExpiredAt,
        paidAt: now,
        customerName: user.name,
        customerPhone: user.phone,
        customerUsername: user.username,
        paymentToken,
        paymentLink,
      },
    });

    // Find or create transaction category for subscription
    let category = await prisma.transactionCategory.findFirst({
      where: { name: 'Subscription', type: 'INCOME' },
    });
    
    if (!category) {
      category = await prisma.transactionCategory.create({
        data: {
          id: generateCategoryId(),
          name: 'Subscription',
          type: 'INCOME',
        },
      });
    }

    // Create transaction record
    await prisma.transaction.create({
      data: {
        id: await generateTransactionId(),
        categoryId: category.id,
        type: 'INCOME',
        amount: extendAmount,
        description: `Perpanjangan langganan ${user.username} - ${newProfile.name}${profileChanged ? ' (paket diubah)' : ''}`,
        reference: invoiceNumber,
        date: now,
      },
    });

    const extendedDays = Math.ceil((newExpiredAt.getTime() - currentExpired.getTime()) / (1000 * 60 * 60 * 24));
    
    // Format data for template variables
    const formattedExpiredAt = new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(newExpiredAt);
    
    const formattedAmount = new Intl.NumberFormat('id-ID').format(extendAmount);

    // Send WhatsApp notification if phone available
    if (user.phone) {
      try {
        const { WhatsAppService } = await import('@/server/services/notifications/whatsapp.service');
        
        // Get template from database (customizable via UI)
        const template = await prisma.whatsapp_templates.findFirst({
          where: { type: 'manual-extension', isActive: true },
        });
        
        if (template) {
          // Replace template variables
          let message = template.message;
          message = message.replace(/\{\{customerName\}\}/g, user.name);
          message = message.replace(/\{\{customerUsername\}\}/g, user.username);
          message = message.replace(/\{\{profileName\}\}/g, newProfile.name);
          message = message.replace(/\{\{area\}\}/g, (user as any).area?.name || '-');
          message = message.replace(/\{\{amount\}\}/g, formattedAmount);
          message = message.replace(/\{\{newExpiredAt\}\}/g, formattedExpiredAt);
          message = message.replace(/\{\{invoiceNumber\}\}/g, invoiceNumber);
          message = message.replace(/\{\{companyName\}\}/g, company?.name || 'Billing System');
          message = message.replace(/\{\{companyPhone\}\}/g, company?.phone || '');
          
          // Handle conditional profileChanged
          if (profileChanged) {
            message = message.replace(/\{\{#profileChanged\}\}([\s\S]*?)\{\{\/profileChanged\}\}/g, '$1');
          } else {
            message = message.replace(/\{\{#profileChanged\}\}[\s\S]*?\{\{\/profileChanged\}\}/g, '');
          }
          
          await WhatsAppService.sendMessage({ phone: user.phone, message });
          console.log(`[Extend] WhatsApp notification sent to ${user.phone}`);
        }
      } catch (waError) {
        console.error('[Extend] WhatsApp notification failed:', waError);
        // Don't fail the whole request if notification fails
      }
    }

    // Send Email notification if email available
    if (user.email) {
      try {
        const { EmailService } = await import('@/server/services/notifications/email.service');
        
        // Get template from database (customizable via UI)
        const template = await prisma.emailTemplate.findFirst({
          where: { type: 'manual-extension', isActive: true },
        });
        
        if (template) {
          // Replace template variables
          let htmlContent = template.htmlBody;
          htmlContent = htmlContent.replace(/\{\{customerName\}\}/g, user.name);
          htmlContent = htmlContent.replace(/\{\{customerUsername\}\}/g, user.username);
          htmlContent = htmlContent.replace(/\{\{profileName\}\}/g, newProfile.name);
          htmlContent = htmlContent.replace(/\{\{area\}\}/g, (user as any).area?.name || '-');
          htmlContent = htmlContent.replace(/\{\{amount\}\}/g, formattedAmount);
          htmlContent = htmlContent.replace(/\{\{newExpiredAt\}\}/g, formattedExpiredAt);
          htmlContent = htmlContent.replace(/\{\{invoiceNumber\}\}/g, invoiceNumber);
          htmlContent = htmlContent.replace(/\{\{companyName\}\}/g, company?.name || 'Billing System');
          htmlContent = htmlContent.replace(/\{\{companyPhone\}\}/g, company?.phone || '');
          
          // Handle conditional profileChanged
          if (profileChanged) {
            htmlContent = htmlContent.replace(/\{\{#profileChanged\}\}([\s\S]*?)\{\{\/profileChanged\}\}/g, '$1');
          } else {
            htmlContent = htmlContent.replace(/\{\{#profileChanged\}\}[\s\S]*?\{\{\/profileChanged\}\}/g, '');
          }
          
          let subject = template.subject;
          subject = subject.replace(/\{\{companyName\}\}/g, company?.name || 'Billing System');
          
          await EmailService.send({
            to: user.email,
            subject,
            html: htmlContent,
          });
          console.log(`[Extend] Email notification sent to ${user.email}`);
        }
      } catch (emailError) {
        console.error('[Extend] Email notification failed:', emailError);
        // Don't fail the whole request if notification fails
      }
    }

    return NextResponse.json({
      success: true,
      user: updatedUser,
      extended: `${extendedDays} hari`,
      amount: extendAmount,
      profileChanged,
      newExpiredAt: newExpiredAt.toISOString(),
      notificationSent: {
        whatsapp: !!user.phone,
        email: !!user.email,
      },
    });
  } catch (error) {
    console.error('Extend error:', error);
    return NextResponse.json(
      { error: 'Failed to extend subscription' },
      { status: 500 }
    );
  }
}
