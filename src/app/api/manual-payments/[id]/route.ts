import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { WhatsAppService } from '@/server/services/notifications/whatsapp.service';
import { EmailService } from '@/server/services/notifications/email.service';
import { addMonths } from 'date-fns';
import { generateTransactionId } from '@/server/services/billing/invoice.service';
import { disconnectPPPoEUser } from '@/server/services/radius/coa-handler.service';
import { sendPushToUser } from '@/server/services/notifications/push-templates.service';
import { nowWIB } from '@/lib/timezone';

// GET - Get single manual payment
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const manualPayment = await prisma.manualPayment.findUnique({
      where: { id },
      include: {
        invoice: true,
        user: {
          include: {
            profile: true,
            area: true,
          },
        },
      },
    });
    
    if (!manualPayment) {
      return NextResponse.json(
        { success: false, error: 'Manual payment not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data: manualPayment,
    });
  } catch (error) {
    console.error('Get manual payment error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch manual payment' },
      { status: 500 }
    );
  }
}

// PATCH - Approve or reject manual payment
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { action, rejectionReason, approvedBy } = body;
    
    if (!action || (action !== 'APPROVE' && action !== 'REJECT')) {
      return NextResponse.json(
        { success: false, error: 'Invalid action' },
        { status: 400 }
      );
    }
    
    if (action === 'REJECT' && !rejectionReason) {
      return NextResponse.json(
        { success: false, error: 'Rejection reason is required' },
        { status: 400 }
      );
    }
    
    const manualPayment = await prisma.manualPayment.findUnique({
      where: { id: params.id },
      include: {
        invoice: true,
        user: {
          include: {
            profile: true,
            area: true,
          },
        },
      },
    });
    
    if (!manualPayment) {
      return NextResponse.json(
        { success: false, error: 'Manual payment not found' },
        { status: 404 }
      );
    }
    
    if (manualPayment.status !== 'PENDING') {
      return NextResponse.json(
        { success: false, error: 'Manual payment already processed' },
        { status: 400 }
      );
    }
    
    if (action === 'APPROVE') {
      // Approve payment
      const company = await prisma.company.findFirst();
      
      // Update manual payment status
      await prisma.manualPayment.update({
        where: { id: params.id },
        data: {
          status: 'APPROVED',
          approvedBy,
          approvedAt: new Date(),
        },
      });
      
      // Update invoice status
      await prisma.invoice.update({
        where: { id: manualPayment.invoiceId },
        data: {
          status: 'PAID',
          paidAt: new Date(),
        },
      });
      
      // Extend user expiry
      const currentExpiry = manualPayment.user.expiredAt || new Date();
      const validityValue = manualPayment.user.profile.validityValue;
      const validityUnit = manualPayment.user.profile.validityUnit;
      
      let newExpiry = new Date(currentExpiry);
      
      switch (validityUnit) {
        case 'MONTHS':
          newExpiry = addMonths(newExpiry, validityValue);
          break;
        case 'DAYS':
          newExpiry.setDate(newExpiry.getDate() + validityValue);
          break;
        case 'HOURS':
          newExpiry.setHours(newExpiry.getHours() + validityValue);
          break;
        case 'MINUTES':
          newExpiry.setMinutes(newExpiry.getMinutes() + validityValue);
          break;
      }
      
      // ============================================
      // CHECK FOR PACKAGE CHANGE IN INVOICE METADATA
      // ============================================
      let newProfileId = manualPayment.user.profileId;
      let newProfileData = manualPayment.user.profile;
      let isPackageChange = false;
      if (manualPayment.invoice && manualPayment.invoice.additionalFees) {
        try {
          const fees = manualPayment.invoice.additionalFees as any;
          if (fees.items && Array.isArray(fees.items)) {
            const pkgItem = fees.items.find((item: any) =>
              (item.metadata?.type === 'package_change' || item.metadata?.type === 'package_upgrade') &&
              item.metadata?.newPackageId
            );
            if (pkgItem) {
              isPackageChange = true;
              newProfileId = pkgItem.metadata.newPackageId;
              const foundProfile = await prisma.pppoeProfile.findUnique({ where: { id: newProfileId } });
              if (foundProfile) {
                newProfileData = foundProfile as any;
                console.log(`[Manual Payment APPROVE] Package change: ${pkgItem.metadata.oldPackageName} → ${pkgItem.metadata.newPackageName} (expiry PRESERVED)`);
              }
            }
          }
        } catch (e) {
          console.error('[Manual Payment APPROVE] Failed to parse additionalFees:', e);
        }
      }

      // For package change: preserve existing expiredAt, do NOT extend
      const finalExpiry = isPackageChange ? currentExpiry : newExpiry;

      // Update user expiry, status, and profile (if package change)
      await prisma.pppoeUser.update({
        where: { id: manualPayment.userId },
        data: {
          expiredAt: finalExpiry,
          status: 'active',
          lastPaymentDate: new Date(),
          ...(newProfileId !== manualPayment.user.profileId && { profileId: newProfileId }),
        },
      });
      
      // Create payment record
      await prisma.payment.create({
        data: {
          id: await generateTransactionId(),
          invoiceId: manualPayment.invoiceId,
          amount: manualPayment.invoice.amount,
          method: 'manual_transfer',
          status: 'success',
          paidAt: new Date(),
        },
      });

      // ============================================
      // SYNC RADIUS - Update group + CoA disconnect
      // ============================================
      try {
        const activeProfile = newProfileData;
        if (activeProfile && 'groupName' in activeProfile) {
          // Update password in radcheck
          await prisma.$executeRaw`
            INSERT INTO radcheck (username, attribute, op, value)
            VALUES (${manualPayment.user.username}, 'Cleartext-Password', ':=', ${manualPayment.user.password})
            ON DUPLICATE KEY UPDATE value = ${manualPayment.user.password}
          `;
          // Update radusergroup to new profile
          await prisma.$executeRaw`
            DELETE FROM radusergroup WHERE username = ${manualPayment.user.username}
          `;
          await prisma.$executeRaw`
            INSERT INTO radusergroup (username, groupname, priority)
            VALUES (${manualPayment.user.username}, ${(activeProfile as any).groupName}, 1)
          `;
          // Remove isolation entries
          await prisma.radcheck.deleteMany({
            where: { username: manualPayment.user.username, attribute: 'Auth-Type' }
          });
          await prisma.radreply.deleteMany({
            where: { username: manualPayment.user.username, attribute: 'Reply-Message' }
          });
          // Restore static IP if user has one (was stripped during isolation)
          await prisma.radreply.deleteMany({
            where: { username: manualPayment.user.username, attribute: 'Framed-IP-Address' }
          });
          if (manualPayment.user.ipAddress) {
            await prisma.$executeRaw`
              INSERT INTO radreply (username, attribute, op, value)
              VALUES (${manualPayment.user.username}, 'Framed-IP-Address', ':=', ${manualPayment.user.ipAddress})
              ON DUPLICATE KEY UPDATE value = ${manualPayment.user.ipAddress}
            `;
          }
          // CoA disconnect to force re-auth
          const coaResult = await disconnectPPPoEUser(manualPayment.user.username);
          console.log(`[Manual Payment APPROVE] CoA: ${coaResult.success ? 'disconnected for re-auth' : coaResult.error}`);
        }
      } catch (radiusErr) {
        console.error('[Manual Payment APPROVE] RADIUS sync error:', radiusErr);
      }

      // ============================================
      // FCM PUSH NOTIFICATION TO CUSTOMER
      // ============================================
      try {
        await sendPushToUser(manualPayment.userId, 'payment-success', {
          customerName: manualPayment.user.name,
          username: manualPayment.user.username,
          invoiceNumber: manualPayment.invoice.invoiceNumber,
          amount: manualPayment.invoice.amount,
          profileName: (newProfileData as any)?.name || '',
          expiredDate: finalExpiry,
          companyName: company?.name || '',
          companyPhone: company?.phone || '',
        });
      } catch (pushErr) {
        console.error('[Manual Payment APPROVE] FCM push error:', pushErr);
      }
      
      // Send notifications
      const customerName = manualPayment.user.name;
      const invoiceNumber = manualPayment.invoice.invoiceNumber;
      const amount = new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
      }).format(manualPayment.invoice.amount);
      
      // WhatsApp notification
      const whatsappTemplate = await prisma.whatsapp_templates.findFirst({
        where: { type: 'manual-payment-approval' },
      });
      
      if (whatsappTemplate && whatsappTemplate.isActive) {
        let message = whatsappTemplate.message
          .replace(/{{customerName}}/g, customerName)
          .replace(/{{customerUsername}}/g, manualPayment.user.username)
          .replace(/{{invoiceNumber}}/g, invoiceNumber)
          .replace(/{{amount}}/g, amount)
          .replace(/{{expiredDate}}/g, newExpiry.toLocaleDateString('id-ID'))
          .replace(/{{profileName}}/g, (manualPayment.user as any)?.profile?.name || '-')
          .replace(/{{area}}/g, (manualPayment.user as any)?.area?.name || '-')
          .replace(/{{companyName}}/g, company?.name || '')
          .replace(/{{companyPhone}}/g, company?.phone || '');
        
        try {
          await WhatsAppService.sendMessage({ phone: manualPayment.user.phone, message });
        } catch (error) {
          console.error('Failed to send WhatsApp notification:', error);
        }
      }
      
      // Email notification
      if (manualPayment.user.email) {
        const emailTemplate = await prisma.emailTemplate.findFirst({
          where: { type: 'manual-payment-approval' },
        });
        
        if (emailTemplate && emailTemplate.isActive) {
          const variables = {
            customerName,
            customerUsername: manualPayment.user.username,
            invoiceNumber,
            amount,
            expiredDate: newExpiry.toISOString(),
            profileName: (manualPayment.user as any)?.profile?.name || '-',
            area: (manualPayment.user as any)?.area?.name || '-',
            companyName: company?.name || '',
            companyPhone: company?.phone || '',
            baseUrl: company?.baseUrl || '',
          };
          
          try {
            let emailBody = emailTemplate.htmlBody;
            for (const [key, value] of Object.entries(variables)) {
              emailBody = emailBody.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
            }
            
            await EmailService.send({
              to: manualPayment.user.email,
              toName: customerName,
              subject: emailTemplate.subject,
              html: emailBody,
            });
          } catch (error) {
            console.error('Failed to send email notification:', error);
          }
        }
      }
      
      // Create notification
      const pkgChangeMsg = newProfileId !== manualPayment.user.profileId
        ? ` | Paket diubah ke ${(newProfileData as any)?.name || newProfileId}`
        : '';
      await prisma.notification.create({
        data: {
          type: 'manual_payment_approved',
          title: 'Pembayaran Disetujui',
          message: `Pembayaran manual untuk ${customerName} (${invoiceNumber}) telah disetujui${pkgChangeMsg}`,
          link: `/admin/manual-payments`,
          createdAt: nowWIB(),
        },
      });
      
      return NextResponse.json({
        success: true,
        message: 'Manual payment approved successfully',
        packageChanged: newProfileId !== manualPayment.user.profileId,
        newProfileId: newProfileId !== manualPayment.user.profileId ? newProfileId : undefined,
      });
    } else {
      // Reject payment
      const company = await prisma.company.findFirst();
      
      await prisma.manualPayment.update({
        where: { id: params.id },
        data: {
          status: 'REJECTED',
          rejectionReason,
          approvedBy,
          approvedAt: new Date(),
        },
      });
      
      // Send rejection notifications
      const customerName = manualPayment.user.name;
      const invoiceNumber = manualPayment.invoice.invoiceNumber;
      
      // WhatsApp notification
      const whatsappTemplate = await prisma.whatsapp_templates.findFirst({
        where: { type: 'manual-payment-rejection' },
      });
      
      if (whatsappTemplate && whatsappTemplate.isActive) {
        let message = whatsappTemplate.message
          .replace(/{{customerName}}/g, customerName)
          .replace(/{{customerUsername}}/g, manualPayment.user.username)
          .replace(/{{invoiceNumber}}/g, invoiceNumber)
          .replace(/{{rejectionReason}}/g, rejectionReason)
          .replace(/{{paymentLink}}/g, `${company?.baseUrl}/pay-manual?token=${manualPayment.invoice.paymentToken}`)
          .replace(/{{profileName}}/g, (manualPayment.user as any)?.profile?.name || '-')
          .replace(/{{area}}/g, (manualPayment.user as any)?.area?.name || '-')
          .replace(/{{companyName}}/g, company?.name || '')
          .replace(/{{companyPhone}}/g, company?.phone || '');
        
        try {
          await WhatsAppService.sendMessage({ phone: manualPayment.user.phone, message });
        } catch (error) {
          console.error('Failed to send WhatsApp notification:', error);
        }
      }
      
      // Email notification
      if (manualPayment.user.email) {
        const emailTemplate = await prisma.emailTemplate.findFirst({
          where: { type: 'manual-payment-rejection' },
        });
        
        if (emailTemplate && emailTemplate.isActive) {
          const variables = {
            customerName,
            customerUsername: manualPayment.user.username,
            invoiceNumber,
            rejectionReason,
            paymentLink: `${company?.baseUrl}/pay-manual?token=${manualPayment.invoice.paymentToken}`,
            profileName: (manualPayment.user as any)?.profile?.name || '-',
            area: (manualPayment.user as any)?.area?.name || '-',
            companyName: company?.name || '',
            companyPhone: company?.phone || '',
            baseUrl: company?.baseUrl || '',
          };
          
          try {
            let emailBody = emailTemplate.htmlBody;
            for (const [key, value] of Object.entries(variables)) {
              emailBody = emailBody.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
            }
            
            await EmailService.send({
              to: manualPayment.user.email,
              toName: customerName,
              subject: emailTemplate.subject,
              html: emailBody,
            });
          } catch (error) {
            console.error('Failed to send email notification:', error);
          }
        }
      }
      
      // Create notification
      await prisma.notification.create({
        data: {
          type: 'manual_payment_rejected',
          title: 'Pembayaran Ditolak',
          message: `Pembayaran manual untuk ${customerName} (${invoiceNumber}) ditolak: ${rejectionReason}`,
          link: `/admin/manual-payments`,
          createdAt: nowWIB(),
        },
      });

      // ============================================
      // FCM PUSH NOTIFICATION TO CUSTOMER (REJECT)
      // ============================================
      try {
        await sendPushToUser(manualPayment.userId, 'payment-rejected', {
          customerName: manualPayment.user.name,
          invoiceNumber: manualPayment.invoice.invoiceNumber,
          amount: manualPayment.invoice.amount,
          customBody: rejectionReason,
          companyName: company?.name || '',
          companyPhone: company?.phone || '',
        });
      } catch (pushErr) {
        console.error('[Manual Payment REJECT] FCM push error:', pushErr);
      }

      return NextResponse.json({
        success: true,
        message: 'Manual payment rejected',
      });
    }
  } catch (error) {
    console.error('Process manual payment error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process manual payment' },
      { status: 500 }
    );
  }
}

// DELETE - Delete manual payment (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.manualPayment.delete({
      where: { id: params.id },
    });
    
    return NextResponse.json({
      success: true,
      message: 'Manual payment deleted successfully',
    });
  } catch (error) {
    console.error('Delete manual payment error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete manual payment' },
      { status: 500 }
    );
  }
}
