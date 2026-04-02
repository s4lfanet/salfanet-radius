import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { genCustomerId } from '@/lib/utils';
import { sendRegistrationApproval } from '@/server/services/notifications/whatsapp-templates.service';
import crypto from 'crypto';
import { generateUniqueReferralCode } from '@/server/services/referral.service';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/server/auth/config';

// Helper to generate username from name and phone
function generateUsername(name: string, phone: string): string {
  const namePart = name
    .split(' ')[0]
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  return `${namePart}-${phone}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const body = await request.json();
    const { installationFee = 0, subscriptionType = 'POSTPAID', billingDay = 1, areaId, routerId } = body;

    // Installation fee is optional, default to 0
    const fee = installationFee || 0;
    
    // Validate subscriptionType
    if (!['POSTPAID', 'PREPAID'].includes(subscriptionType)) {
      return NextResponse.json(
        { error: 'Invalid subscription type' },
        { status: 400 }
      );
    }
    
    // Validate billingDay (1-31)
    const validBillingDay = Math.min(Math.max(parseInt(billingDay) || 1, 1), 31);

    // Get registration
    const registration = await prisma.registrationRequest.findUnique({
      where: { id },
      include: { profile: true, area: true },
    });

    if (!registration) {
      return NextResponse.json(
        { error: 'Registration not found' },
        { status: 404 }
      );
    }

    if (registration.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'Registration is not pending' },
        { status: 400 }
      );
    }

    // Generate username and password
    const username = generateUsername(registration.name, registration.phone);
    const password = username;

    // Check if username already exists
    const existingUser = await prisma.pppoeUser.findUnique({
      where: { username },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Username already exists. Please contact admin.' },
        { status: 400 }
      );
    }

    // Generate unique customerId
    async function generateUniqueCustomerId() {
      for (let i = 0; i < 10; i++) {
        const candidate = genCustomerId();
        const exists = await prisma.pppoeUser.findFirst({ where: { customerId: candidate } as any });
        if (!exists) return candidate;
      }
      while (true) {
        const candidate = genCustomerId();
        const exists = await prisma.pppoeUser.findFirst({ where: { customerId: candidate } as any });
        if (!exists) return candidate;
      }
    }

    const customerId = await generateUniqueCustomerId();

    // Calculate expiredAt based on subscription type
    let expiredAt: Date;
    const now = new Date();
    
    if (subscriptionType === 'POSTPAID') {
      // POSTPAID: expiredAt = billingDay bulan berikutnya
      expiredAt = new Date(now);
      expiredAt.setMonth(expiredAt.getMonth() + 1); // Next month
      expiredAt.setDate(validBillingDay); // Set to billing day
      expiredAt.setHours(23, 59, 59, 999);
    } else {
      // PREPAID: expiredAt = now + validity dari profile
      expiredAt = new Date(now);
      if (registration.profile.validityUnit === 'MONTHS') {
        expiredAt.setMonth(expiredAt.getMonth() + registration.profile.validityValue);
      } else {
        expiredAt.setDate(expiredAt.getDate() + registration.profile.validityValue);
      }
      expiredAt.setHours(23, 59, 59, 999);
    }

    // Resolve referral code to referrer ID
    let referredById: string | null = null;
    if (registration.referralCode) {
      const referrer = await prisma.pppoeUser.findUnique({
        where: { referralCode: registration.referralCode },
        select: { id: true },
      });
      if (referrer) {
        referredById = referrer.id;
      }
    }

    // Create PPPoE user
    const pppoeUser = await prisma.pppoeUser.create({
      data: {
        id: crypto.randomUUID(),
        username,
        customerId,
        password,
        name: registration.name,
        phone: registration.phone,
        email: registration.email,
        address: registration.address,
        profileId: registration.profileId,
        areaId: areaId || (registration as any).areaId || null,
        routerId: routerId || null,
        status: 'active', // Create as active first
        syncedToRadius: false,
        subscriptionType: subscriptionType as 'POSTPAID' | 'PREPAID',
        billingDay: validBillingDay,
        expiredAt: expiredAt,
        referredById: referredById,
        referralCode: await generateUniqueReferralCode(),
      } as any,
    });

    // Process referral bonus (REGISTRATION type)
    if (referredById) {
      try {
        const companyRef = await prisma.company.findFirst({
          select: {
            referralEnabled: true,
            referralRewardAmount: true,
            referralRewardType: true,
          },
        });

        if (companyRef?.referralEnabled && companyRef.referralRewardType === 'REGISTRATION') {
          const rewardAmount = companyRef.referralRewardAmount ?? 10000;

          await prisma.$transaction([
            prisma.referralReward.create({
              data: {
                referrerId: referredById,
                referredId: pppoeUser.id,
                amount: rewardAmount,
                status: 'CREDITED',
                type: 'REGISTRATION',
                creditedAt: new Date(),
              },
            }),
            prisma.pppoeUser.update({
              where: { id: referredById },
              data: { balance: { increment: rewardAmount } },
            }),
          ]);
          console.log(`✅ Referral registration reward ${rewardAmount} credited to ${referredById}`);
        } else if (companyRef?.referralEnabled && companyRef.referralRewardType === 'FIRST_PAYMENT') {
          // Create PENDING reward to be credited on first payment
          await prisma.referralReward.create({
            data: {
              referrerId: referredById,
              referredId: pppoeUser.id,
              amount: companyRef.referralRewardAmount ?? 10000,
              status: 'PENDING',
              type: 'FIRST_PAYMENT',
            },
          });
          console.log(`✅ Referral PENDING reward created for ${referredById}`);
        }
      } catch (referralError) {
        console.error('Referral bonus error:', referralError);
      }
    }

    // Sync to RADIUS (radcheck + radusergroup)
    // Password
    await prisma.radcheck.upsert({
      where: {
        username_attribute: {
          username,
          attribute: 'Cleartext-Password',
        },
      },
      create: {
        username,
        attribute: 'Cleartext-Password',
        op: ':=',
        value: password,
      },
      update: {
        value: password,
      },
    });

    // Add to group
    await prisma.radusergroup.upsert({
      where: {
        username_groupname: {
          username,
          groupname: registration.profile.groupName,
        },
      },
      create: {
        username,
        groupname: registration.profile.groupName,
        priority: 1,
      },
      update: {
        groupname: registration.profile.groupName,
      },
    });

    // Mark as synced
    await prisma.pppoeUser.update({
      where: { id: pppoeUser.id },
      data: { syncedToRadius: true },
    });

    // Now set to isolated
    await prisma.pppoeUser.update({
      where: { id: pppoeUser.id },
      data: { status: 'isolated' },
    });

    // Add isolated attribute to RADIUS (limit speed or access)
    // This can be customized based on your RADIUS setup
    await prisma.radreply.create({
      data: {
        username,
        attribute: 'Reply-Message',
        op: ':=',
        value: 'Account pending payment. Please pay installation invoice.',
      },
    });

    // Generate invoice number: INV-YYYYMM-XXXX
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `INV-${year}${month}-`;
    
    const count = await prisma.invoice.count({
      where: {
        invoiceNumber: {
          startsWith: prefix,
        },
      },
    });
    
    const invoiceNumber = `${prefix}${String(count + 1).padStart(4, '0')}`;

    // Calculate invoice amounts based on subscription type
    let baseAmount: number;
    let invoiceType: string;
    
    if (subscriptionType === 'PREPAID') {
      // PREPAID: installation + first month subscription
      baseAmount = Math.round(Number(fee)) + registration.profile.price;
      invoiceType = 'INSTALLATION';
    } else {
      // POSTPAID: installation only
      baseAmount = Math.round(Number(fee));
      invoiceType = 'INSTALLATION';
    }

    // Calculate PPN if enabled on profile
    let invoiceAmount = baseAmount;
    let taxRate: number | null = null;
    if (registration.profile.ppnActive && registration.profile.ppnRate > 0) {
      taxRate = registration.profile.ppnRate;
      invoiceAmount = Math.round(baseAmount + (baseAmount * taxRate / 100));
    }

    // Get company baseUrl from database
    const company = await prisma.company.findFirst();
    const baseUrl = company?.baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Generate payment token and link
    const paymentToken = crypto.randomBytes(32).toString('hex');
    const paymentLink = `${baseUrl}/pay/${paymentToken}`;

    // Create invoice
    const invoice = await prisma.invoice.create({
      data: {
        id: crypto.randomUUID(),
        invoiceNumber,
        userId: pppoeUser.id,
        amount: invoiceAmount,
        baseAmount: baseAmount,
        ...(taxRate !== null && { taxRate }),
        status: 'PENDING',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        customerName: registration.name,
        customerPhone: registration.phone,
        customerUsername: pppoeUser.username,
        paymentToken,
        paymentLink,
        invoiceType: invoiceType as any,
      },
    });

    // Update registration
    await prisma.registrationRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        installationFee: fee,
        pppoeUserId: pppoeUser.id,
        invoiceId: invoice.id,
      },
    });

    // Send WhatsApp notification
    await sendRegistrationApproval({
      customerName: registration.name,
      customerPhone: registration.phone,
      username: pppoeUser.username,
      password: pppoeUser.password,
      profileName: registration.profile.name,
      installationFee: Math.round(Number(fee)),
    });

    // Send Email notification
    if (registration.email) {
      try {
        const { EmailService } = await import('@/server/services/notifications/email.service');
        await EmailService.sendRegistrationApprovalEmail({
          toEmail: registration.email,
          toName: registration.name,
          username: pppoeUser.username,
          password: pppoeUser.password,
          profile: registration.profile.name,
          installationFee: Math.round(Number(fee)),
          invoiceNumber: invoice.invoiceNumber,
          totalAmount: invoiceAmount,
          dueDate: invoice.dueDate,
          paymentLink: paymentLink,
          paymentToken: paymentToken,
          subscriptionType: subscriptionType as 'POSTPAID' | 'PREPAID',
        });
        console.log('[Email] Registration approval sent to:', registration.email);
      } catch (emailError) {
        console.error('[Email] Failed to send registration approval:', emailError);
        // Don't fail the whole approval if email fails
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Registration approved and PPPoE user created',
      pppoeUser: {
        id: pppoeUser.id,
        username: pppoeUser.username,
        password: pppoeUser.password,
        status: pppoeUser.status,
        subscriptionType: subscriptionType,
      },
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoiceAmount,
        paymentLink,
      },
    });
  } catch (error: any) {
    console.error('Approve registration error:', error);
    return NextResponse.json(
      { error: 'Failed to approve registration' },
      { status: 500 }
    );
  }
}
