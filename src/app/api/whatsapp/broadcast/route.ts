import { NextRequest, NextResponse } from 'next/server';
import { WhatsAppService } from '@/server/services/notifications/whatsapp.service';
import { EmailService } from '@/server/services/notifications/email.service';
import { prisma } from '@/server/db/client';
import { logActivity } from '@/server/services/activity-log.service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

interface BroadcastRequest {
  userIds: string[];
  message: string;
  subject?: string; // For email
  channel?: 'whatsapp' | 'email' | 'both'; // Optional, defaults to 'whatsapp'
  delay?: number; // Delay in ms between each message (default 2000ms)
}

export async function POST(request: NextRequest) {
  try {
    const body: BroadcastRequest = await request.json();
    const { userIds, message, subject, channel = 'whatsapp', delay = 2000 } = body;

    if (!userIds || userIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No users selected' },
        { status: 400 }
      );
    }

    if (!message) {
      return NextResponse.json(
        { success: false, error: 'Message is required' },
        { status: 400 }
      );
    }

    // Fetch users
    const users = await prisma.pppoeUser.findMany({
      where: {
        id: { in: userIds },
      },
      select: {
        id: true,
        name: true,
        username: true,
        phone: true,
        email: true,
        address: true,
        profile: {
          select: {
            name: true,
            price: true,
          },
        },
      },
    });

    if (users.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid users found' },
        { status: 400 }
      );
    }

    // Get company info for variables
    const company = await prisma.company.findFirst();

    // Helper function to replace variables in message template
    const replaceVariables = (template: string, user: any, company: any) => {
      return template
        .replace(/\{\{customerName\}\}/gi, user.name || '')
        .replace(/\{\{name\}\}/gi, user.name || '')
        .replace(/\{\{username\}\}/gi, user.username || '')
        .replace(/\{\{profileName\}\}/gi, user.profile?.name || '-')
        .replace(/\{\{paket\}\}/gi, user.profile?.name || '-')
        .replace(/\{\{price\}\}/gi, user.profile?.price ? `Rp ${user.profile.price.toLocaleString('id-ID')}` : '-')
        .replace(/\{\{harga\}\}/gi, user.profile?.price ? `Rp ${user.profile.price.toLocaleString('id-ID')}` : '-')
        .replace(/\{\{phone\}\}/gi, user.phone || '')
        .replace(/\{\{email\}\}/gi, user.email || '')
        .replace(/\{\{address\}\}/gi, user.address || '')
        .replace(/\{\{alamat\}\}/gi, user.address || '')
        .replace(/\{\{companyName\}\}/gi, company?.name || '')
        .replace(/\{\{namaPerusahaan\}\}/gi, company?.name || '')
        .replace(/\{\{companyPhone\}\}/gi, company?.phone || '')
        .replace(/\{\{teleponPerusahaan\}\}/gi, company?.phone || '')
        .replace(/\{\{companyAddress\}\}/gi, company?.address || '')
        .replace(/\{\{alamatPerusahaan\}\}/gi, company?.address || '');
    };

    // Results tracking
    const results = {
      whatsapp: { sent: 0, failed: 0, skipped: 0, details: [] as any[] },
      email: { sent: 0, failed: 0, skipped: 0, details: [] as any[] },
    };

    // ========================
    // WHATSAPP BROADCAST
    // ========================
    if (channel === 'whatsapp' || channel === 'both') {
      const messagesToSend = users
        .filter(user => user.phone)
        .map(user => ({
          phone: user.phone!,
          message: replaceVariables(message, user, company),
          data: {
            userId: user.id,
            name: user.name,
            username: user.username,
          }
        }));

      const usersWithoutPhone = users.filter(user => !user.phone);
      results.whatsapp.skipped = usersWithoutPhone.length;

      if (messagesToSend.length > 0) {
        console.log(`[Broadcast] Sending WhatsApp to ${messagesToSend.length} users`);

        const waResult = await WhatsAppService.sendBroadcast(messagesToSend);

        results.whatsapp.sent = waResult.sent;
        results.whatsapp.failed = waResult.failed;
        results.whatsapp.details = [
          ...waResult.results.filter(r => r.success).map(r => {
            const userData = messagesToSend.find(m => m.phone === r.phone)?.data;
            return {
              userId: userData?.userId,
              name: userData?.name,
              username: userData?.username,
              phone: r.phone,
              success: true,
            };
          }),
          ...waResult.results.filter(r => !r.success).map(r => {
            const userData = messagesToSend.find(m => m.phone === r.phone)?.data;
            return {
              userId: userData?.userId,
              name: userData?.name,
              username: userData?.username,
              phone: r.phone,
              success: false,
              error: r.error,
            };
          }),
          ...usersWithoutPhone.map(user => ({
            userId: user.id,
            name: user.name,
            username: user.username,
            phone: null,
            success: false,
            error: 'No phone number',
          })),
        ];
      }
    }

    // ========================
    // EMAIL BROADCAST
    // ========================
    if (channel === 'email' || channel === 'both') {
      const emailsToSend = users
        .filter(user => user.email)
        .map(user => ({
          email: user.email!,
          userId: user.id,
          name: user.name,
          username: user.username,
          message: replaceVariables(message, user, company),
        }));

      const usersWithoutEmail = users.filter(user => !user.email);
      results.email.skipped = usersWithoutEmail.length;

      if (emailsToSend.length > 0) {
        console.log(`[Broadcast] Sending Email to ${emailsToSend.length} users`);

        // Convert plain text message to HTML
        const convertToHtml = (text: string) => {
          return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px;">${company?.name || 'Notification'}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <div style="color: #333333; font-size: 16px; line-height: 1.8; white-space: pre-wrap;">${text}</div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
              <p style="color: #999999; font-size: 12px; margin: 0;">
                Email ini dikirim oleh ${company?.name || 'RADIUS System'}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
        };

        for (const emailData of emailsToSend) {
          try {
            const emailResult = await EmailService.send({
              to: emailData.email,
              toName: emailData.name || undefined,
              subject: subject || `Pemberitahuan dari ${company?.name || 'RADIUS'}`,
              html: convertToHtml(emailData.message),
              text: emailData.message,
            });

            if (emailResult.success) {
              results.email.sent++;
              results.email.details.push({
                userId: emailData.userId,
                name: emailData.name,
                username: emailData.username,
                email: emailData.email,
                success: true,
              });
            } else {
              results.email.failed++;
              results.email.details.push({
                userId: emailData.userId,
                name: emailData.name,
                username: emailData.username,
                email: emailData.email,
                success: false,
                error: emailResult.error,
              });
            }

            // Small delay between emails
            await new Promise(resolve => setTimeout(resolve, 500));
          } catch (error: any) {
            results.email.failed++;
            results.email.details.push({
              userId: emailData.userId,
              name: emailData.name,
              username: emailData.username,
              email: emailData.email,
              success: false,
              error: error.message,
            });
          }
        }
      }
    }

    // Log activity
    try {
      const session = await getServerSession(authOptions);
      const totalSent = results.whatsapp.sent + results.email.sent;
      const totalFailed = results.whatsapp.failed + results.email.failed;

      await logActivity({
        userId: (session?.user as any)?.id,
        username: (session?.user as any)?.username || 'Admin',
        userRole: (session?.user as any)?.role,
        action: 'BROADCAST',
        description: `Sent broadcast via ${channel}: WA ${results.whatsapp.sent}, Email ${results.email.sent}`,
        module: 'whatsapp',
        status: totalFailed > 0 ? 'warning' : 'success',
        request,
        metadata: {
          channel,
          total: users.length,
          whatsapp: results.whatsapp,
          email: results.email,
          messageLength: message.length,
        },
      });
    } catch (logError) {
      console.error('Activity log error:', logError);
    }

    // Build response message
    const messages: string[] = [];
    if (channel === 'whatsapp' || channel === 'both') {
      messages.push(`WhatsApp: ${results.whatsapp.sent} sent, ${results.whatsapp.failed} failed, ${results.whatsapp.skipped} skipped`);
    }
    if (channel === 'email' || channel === 'both') {
      messages.push(`Email: ${results.email.sent} sent, ${results.email.failed} failed, ${results.email.skipped} skipped`);
    }

    return NextResponse.json({
      success: true,
      message: messages.join(' | '),
      total: users.length,
      results: {
        whatsapp: channel === 'email' ? undefined : results.whatsapp,
        email: channel === 'whatsapp' ? undefined : results.email,
      },
    });
  } catch (error: any) {
    console.error('Broadcast error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
