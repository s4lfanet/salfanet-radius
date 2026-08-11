import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';
import { prisma } from '@/server/db/client';
import { WhatsAppService } from '@/server/services/notifications/whatsapp.service';
import { EmailService } from '@/server/services/notifications/email.service';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const {
      userIds,
      notificationType,
      notificationMethod,
      // For outage notification
      issueType,
      description,
      estimatedTime,
      affectedArea,
      // For invoice/payment notification
      additionalMessage,
    } = body;
    
    // Validate
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json(
        { error: 'User IDs are required' },
        { status: 400 }
      );
    }
    
    if (!notificationType || !['outage', 'invoice', 'payment'].includes(notificationType)) {
      return NextResponse.json(
        { error: 'Invalid notification type' },
        { status: 400 }
      );
    }
    
    if (!notificationMethod || !['whatsapp', 'email', 'both'].includes(notificationMethod)) {
      return NextResponse.json(
        { error: 'Invalid notification method' },
        { status: 400 }
      );
    }
    
    // Validate fields based on notification type
    if (notificationType === 'outage') {
      if (!issueType || !description || !estimatedTime || !affectedArea) {
        return NextResponse.json(
          { error: 'All fields are required: issueType, description, estimatedTime, affectedArea' },
          { status: 400 }
        );
      }
    }
    
    // Get company info
    const company = await prisma.company.findFirst();
    
    // Get users
    const users = await prisma.pppoeUser.findMany({
      where: {
        id: { in: userIds },
      },
      include: {
        profile: true,
        area: true,
        invoices: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    
    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];
    
    // Process each user
    for (const user of users) {
      try {
        let whatsappTemplate;
        let emailTemplate;
        let variables: any = {
          customerName: user.name,
          customerId: user.customerId || user.username,
          username: user.username,
          profileName: (user as any).profile?.name || '-',
          area: (user as any).area?.name || '-',
          companyName: company?.name || '',
          companyPhone: company?.phone || '',
          companyEmail: company?.email || '',
          baseUrl: company?.baseUrl || '',
        };
        
        // Handle different notification types
        if (notificationType === 'outage') {
          // Outage notification
          whatsappTemplate = await prisma.whatsapp_templates.findFirst({
            where: { type: 'maintenance-outage' },
          });
          
          emailTemplate = await prisma.emailTemplate.findFirst({
            where: { type: 'maintenance-outage' },
          });
          
          variables = {
            ...variables,
            issueType,
            description,
            estimatedTime,
            affectedArea,
          };
        } else if (notificationType === 'invoice') {
          // Invoice reminder
          const latestInvoice = user.invoices[0];
          
          if (!latestInvoice) {
            errors.push(`User ${user.name} tidak memiliki invoice`);
            failedCount++;
            continue;
          }
          
          whatsappTemplate = await prisma.whatsapp_templates.findFirst({
            where: { type: 'invoice-reminder' },
          });
          
          emailTemplate = await prisma.emailTemplate.findFirst({
            where: { type: 'invoice-reminder' },
          });
          
          const amount = new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
          }).format(latestInvoice.amount);
          
          variables = {
            ...variables,
            invoiceNumber: latestInvoice.invoiceNumber,
            amount,
            dueDate: latestInvoice.dueDate.toLocaleDateString('id-ID'),
            customerEmail: user.email || '',
            paymentLink: `${company?.baseUrl}/pay/${latestInvoice.paymentToken}`,
            additionalMessage: additionalMessage || '',
          };
        } else if (notificationType === 'payment') {
          // Payment confirmation
          const paidInvoice = user.invoices.find(inv => inv.status === 'PAID');
          
          if (!paidInvoice) {
            errors.push(`User ${user.name} tidak memiliki invoice yang sudah dibayar`);
            failedCount++;
            continue;
          }
          
          whatsappTemplate = await prisma.whatsapp_templates.findFirst({
            where: { type: 'payment-success' },
          });
          
          emailTemplate = await prisma.emailTemplate.findFirst({
            where: { type: 'payment-success' },
          });
          
          const amount = new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
          }).format(paidInvoice.amount);
          
          variables = {
            ...variables,
            invoiceNumber: paidInvoice.invoiceNumber,
            amount,
            paidDate: paidInvoice.paidAt?.toLocaleDateString('id-ID') || '',
            customerEmail: user.email || '',
            expiredDate: user.expiredAt?.toLocaleDateString('id-ID') || '',
            additionalMessage: additionalMessage || '',
          };
        }
        
        // Send WhatsApp
        if ((notificationMethod === 'whatsapp' || notificationMethod === 'both') && whatsappTemplate && whatsappTemplate.isActive) {
          let message = whatsappTemplate.message;
          
          // Replace all variables
          Object.keys(variables).forEach(key => {
            const regex = new RegExp(`{{${key}}}`, 'g');
            message = message.replace(regex, variables[key] || '');
          });
          
          try {
            await WhatsAppService.sendMessage({ phone: user.phone, message });
          } catch (error) {
            console.error(`Failed to send WhatsApp to ${user.phone}:`, error);
          }
        }
        
        // Send Email
        if ((notificationMethod === 'email' || notificationMethod === 'both') && emailTemplate && emailTemplate.isActive && user.email) {
          try {
            let emailBody = emailTemplate.htmlBody;
            for (const [key, value] of Object.entries(variables)) {
              emailBody = emailBody.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
            }
            
            await EmailService.send({
              to: user.email,
              toName: user.name,
              subject: emailTemplate.subject,
              html: emailBody,
            });
          } catch (error) {
            console.error(`Failed to send email to ${user.email}:`, error);
          }
        }
        
        successCount++;
      } catch (error: any) {
        console.error(`Error sending to ${user.name}:`, error);
        errors.push(`Error for ${user.name}: ${error.message}`);
        failedCount++;
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `Notifikasi berhasil dikirim ke ${successCount} user, ${failedCount} gagal`,
      details: {
        total: users.length,
        success: successCount,
        failed: failedCount,
        errors,
      },
    });
  } catch (error: any) {
    console.error('Send notification error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send notifications' },
      { status: 500 }
    );
  }
}
