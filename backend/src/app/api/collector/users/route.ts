import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { verifyCollector } from '@/server/auth/collector-auth';
import { getCollectorScope, scopeWhere } from '@/server/auth/collector-scope';
import { loadInvoiceReminderContext, renderInvoiceReminderMessage } from '@/server/services/notifications/whatsapp-templates.service';

export async function GET(req: NextRequest) {
  const collector = await verifyCollector(req);
  if (!collector) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const rawFilter = searchParams.get('filter') || 'unpaid';
  const filter = ['unpaid', 'all', 'paid'].includes(rawFilter) ? rawFilter : 'unpaid';

  try {
    const scope = await getCollectorScope(collector.id);
    if (!scope) {
      return NextResponse.json({ users: [] });
    }

    // The portal's Area / Router filter narrows within the collector's scope.
    const users = await prisma.pppoeUser.findMany({
      where: scopeWhere(scope, { areaId: searchParams.get('areaId'), routerId: searchParams.get('routerId') }),
      select: {
        id: true,
        username: true,
        name: true,
        customerId: true,
        phone: true,
        address: true,
        status: true,
        expiredAt: true,
        subscriptionType: true,
        connectionType: true,
        latitude: true,
        longitude: true,
        email: true,
        installDate: true,
        profile: { select: { id: true, name: true, price: true } },
        area: { select: { id: true, name: true } },
        router: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Get ALL invoices for these users (not just filtered) so is_paid is accurate
    const userIds = users.map(u => u.id);
    const allInvoices = await prisma.invoice.findMany({
      where: {
        userId: { in: userIds },
        status: { not: 'CANCELLED' },
      },
      select: {
        id: true,
        userId: true,
        invoiceNumber: true,
        amount: true,
        status: true,
        dueDate: true,
        paidAt: true,
        paidById: true,
        paymentMethod: true,
        paymentToken: true,
      },
      orderBy: { dueDate: 'desc' },
    });

    // For display: filter by the requested filter
    const displayInvoices = allInvoices.filter(inv =>
      filter === 'unpaid'
        ? (inv.status === 'PENDING' || inv.status === 'OVERDUE')
        : true
    );

    // userId is non-null here — every row came from `where: { userId: { in: userIds } }`
    // above; the `if (!inv.userId) continue` is just to satisfy the nullable column type
    const invoiceMap = new Map<string, typeof allInvoices>();
    for (const inv of displayInvoices) {
      if (!inv.userId) continue;
      const arr = invoiceMap.get(inv.userId) || [];
      arr.push(inv);
      invoiceMap.set(inv.userId, arr);
    }

    // Build is_paid map from ALL invoices (not just filtered)
    const allInvoiceMap = new Map<string, typeof allInvoices>();
    for (const inv of allInvoices) {
      if (!inv.userId) continue;
      const arr = allInvoiceMap.get(inv.userId) || [];
      arr.push(inv);
      allInvoiceMap.set(inv.userId, arr);
    }

    // Same wording the admin sends for a bill (invoice-reminder / invoice-overdue template),
    // so the collector's WhatsApp opens with the invoice already written.
    const [reminderCtx, company] = await Promise.all([
      loadInvoiceReminderContext().catch(() => null),
      prisma.company.findFirst({ select: { name: true, phone: true, baseUrl: true } }),
    ]);

    let enriched = users.map(u => {
      const userAllInvoices = allInvoiceMap.get(u.id) || [];
      const userDisplayInvoices = invoiceMap.get(u.id) || [];
      const unpaid = userAllInvoices.filter(i => i.status === 'PENDING' || i.status === 'OVERDUE');
      const paid = userAllInvoices.filter(i => i.status === 'PAID');
      // Oldest open invoice first — that's the one the customer owes soonest.
      const oldest = [...unpaid].sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate))[0];
      let waMessage: string | null = null;
      if (oldest && reminderCtx) {
        try {
          waMessage = renderInvoiceReminderMessage(reminderCtx, {
            customerName: u.name || u.username,
            customerId: u.customerId || undefined,
            customerUsername: u.username,
            profileName: u.profile?.name,
            area: u.area?.name,
            address: u.address || undefined,
            invoiceNumber: oldest.invoiceNumber,
            amount: oldest.amount,
            dueDate: oldest.dueDate,
            paymentLink: company?.baseUrl && oldest.paymentToken ? `${company.baseUrl}/pay/${oldest.paymentToken}` : '-',
            companyName: company?.name || '',
            companyPhone: company?.phone || '',
            isOverdue: oldest.status === 'OVERDUE' || new Date(oldest.dueDate).getTime() < Date.now(),
          });
        } catch {
          waMessage = null;
        }
      }
      return {
        ...u,
        wa_message: waMessage,
        invoices: userDisplayInvoices,
        unpaid_count: unpaid.length,
        unpaid_amount: unpaid.reduce((s, i) => s + i.amount, 0),
        is_paid: userAllInvoices.length > 0 && unpaid.length === 0,
        // Payment status for the customer list: open invoices, all settled, or none issued yet.
        pay_status: unpaid.length > 0 ? 'unpaid' : paid.length > 0 ? 'paid' : 'none',
        has_overdue: unpaid.some(i => i.status === 'OVERDUE'),
        last_paid_at: paid.reduce<Date | null>((d, i) => (i.paidAt && (!d || i.paidAt > d) ? i.paidAt : d), null),
        has_paid_by_collector: paid.some(i => i.paidById === collector.id),
      };
    });

    if (filter === 'unpaid') {
      enriched = enriched.filter(u => u.unpaid_count > 0);
    } else if (filter === 'paid') {
      enriched = enriched.filter(u => u.is_paid);
    }

    return NextResponse.json({ users: enriched });
  } catch (error) {
    console.error('Billable users error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
