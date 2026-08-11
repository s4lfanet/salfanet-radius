import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';

function parseInvoiceNumberFromOrder(orderId: string): string {
  // Strip trailing timestamp (≥10 digit number after last hyphen)
  const lastHyphenIdx = orderId.lastIndexOf('-');
  const potentialTs = lastHyphenIdx >= 0 ? orderId.substring(lastHyphenIdx + 1) : '';
  if (potentialTs && /^\d{10,}$/.test(potentialTs)) {
    return orderId.substring(0, lastHyphenIdx);
  }

  if (orderId.startsWith('TOPUP-')) {
    const parts = orderId.split('-');
    return parts.slice(0, 3).join('-');
  }

  return orderId;
}

function mapInvoiceStatus(status: string): 'settlement' | 'pending' | 'cancel' {
  if (status === 'PAID') return 'settlement';
  if (status === 'CANCELLED' || status === 'OVERDUE') return 'cancel';
  return 'pending';
}

export async function GET(request: NextRequest) {
  try {
    const orderId = request.nextUrl.searchParams.get('orderId');

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    // Agent deposit (UUID based order id)
    const deposit = await prisma.agentDeposit.findUnique({
      where: { id: orderId },
      include: { agent: true },
    });

    if (deposit) {
      return NextResponse.json({
        success: true,
        type: 'agent_deposit',
        status: deposit.status === 'PAID' ? 'settlement' : deposit.status === 'FAILED' ? 'cancel' : 'pending',
        deposit: {
          id: deposit.id,
          amount: deposit.amount,
          status: deposit.status,
          paidAt: deposit.paidAt,
          agentName: deposit.agent.name,
          newBalance: deposit.agent.balance,
        },
      });
    }

    let invoiceNumber = parseInvoiceNumberFromOrder(orderId);
    let invoice = await prisma.invoice.findFirst({
      where: { invoiceNumber },
      include: { user: true },
    });

    // Backward compatibility: old TOPUP-TEMP-{timestamp} order ids
    if (!invoice && orderId.startsWith('TOPUP-TEMP-')) {
      const ts = parseInt(orderId.replace('TOPUP-TEMP-', ''), 10);
      if (!Number.isNaN(ts)) {
        const searchWindow = new Date(ts);
        searchWindow.setMinutes(searchWindow.getMinutes() - 5);

        invoice = await prisma.invoice.findFirst({
          where: {
            invoiceType: 'TOPUP',
            createdAt: { gte: searchWindow },
          },
          orderBy: { createdAt: 'desc' },
          include: { user: true },
        });
      }
    }

    if (invoice) {
      return NextResponse.json({
        success: true,
        type: invoice.invoiceType === 'TOPUP' ? 'topup' : 'invoice',
        status: mapInvoiceStatus(invoice.status),
        invoice: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amount: invoice.amount,
          status: invoice.status,
          paidAt: invoice.paidAt,
          dueDate: invoice.dueDate,
          paymentToken: invoice.paymentToken,
          paymentLink: invoice.paymentLink,
          customerName: invoice.user?.name || invoice.customerName,
          customerPhone: invoice.user?.phone || invoice.customerPhone,
          customerUsername: invoice.user?.username || invoice.customerUsername,
        },
      });
    }

    // Last fallback: inspect webhook logs for raw status only
    const webhook = await prisma.webhookLog.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });

    if (webhook) {
      return NextResponse.json({
        success: true,
        type: 'unknown',
        status: webhook.status,
        orderId,
      });
    }

    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  } catch (error) {
    console.error('Check order status error:', error);
    return NextResponse.json({ error: 'Failed to check order status' }, { status: 500 });
  }
}
