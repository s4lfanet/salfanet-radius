import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/server/db/client';
import { requireAgentAuth } from '@/server/middleware/agent-auth';
import { renderVoucherTemplate, getPrintableHtml } from '@/lib/utils/templateRenderer';

/**
 * POST /api/agent/vouchers/print-html
 * body: { codes: string[], templateId?: string, paper?: 'a4' | '58' | '80' }
 *
 * Renders the admin's voucher template with the agent's own vouchers and returns
 * printable HTML — the same rendering the admin web uses, so the agent app prints
 * the same design. 'a4' keeps the admin page layout; '58'/'80' fit a thermal roll.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAgentAuth(request);
  if (!auth.authorized) return auth.response;
  try {
    const body = await request.json();
    const codes: string[] = Array.isArray(body.codes) ? body.codes.filter((c: unknown): c is string => typeof c === 'string').slice(0, 500) : [];
    const paper: string = ['a4', '58', '80'].includes(body.paper) ? body.paper : 'a4';
    if (codes.length === 0) {
      return NextResponse.json({ error: 'codes is required' }, { status: 400 });
    }

    const template = body.templateId
      ? await prisma.voucherTemplate.findFirst({ where: { id: String(body.templateId), isActive: true } })
      : (await prisma.voucherTemplate.findFirst({ where: { isActive: true, isDefault: true } })) ??
        (await prisma.voucherTemplate.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'desc' } }));
    if (!template) {
      return NextResponse.json({ error: 'Belum ada template voucher aktif. Hubungi admin.' }, { status: 404 });
    }

    // Only the agent's own vouchers can be printed.
    const vouchers = await prisma.hotspotVoucher.findMany({
      where: { agentId: auth.agentId, code: { in: codes } },
      include: { profile: true, router: true },
    });
    if (vouchers.length === 0) {
      return NextResponse.json({ error: 'Voucher tidak ditemukan' }, { status: 404 });
    }
    const order = new Map(codes.map((c, i) => [c, i]));
    vouchers.sort((a, b) => (order.get(a.code) ?? 0) - (order.get(b.code) ?? 0));

    const company = await prisma.company.findFirst({ select: { name: true } });
    const routerName = vouchers.find((v) => v.router)?.router?.name || company?.name || 'SALFANET';

    const rendered = renderVoucherTemplate(
      template.htmlTemplate,
      vouchers.map((v) => ({
        code: v.code,
        secret: v.password || v.code,
        total: v.profile?.sellingPrice ?? 0,
        profile: {
          name: v.profile?.name,
          validityValue: v.profile?.validityValue,
          validityUnit: v.profile?.validityUnit,
          usageQuota: v.profile?.usageQuota != null ? Number(v.profile.usageQuota) : null,
          usageDuration: v.profile?.usageDuration,
        },
        router: v.router ? { name: v.router.name, shortname: (v.router as { shortname?: string }).shortname } : undefined,
      })),
      { currencyCode: 'Rp', companyName: routerName },
    );

    let html = getPrintableHtml(rendered);
    if (paper !== 'a4') {
      const mm = paper === '58' ? 58 : 80;
      const px = Math.round((mm / 25.4) * 96);
      // Fit the template into the roll width: one voucher per page, scaled down when wider.
      html = html.replace(
        '</head>',
        `<style>
  @page { size: ${mm}mm auto; margin: 0; }
  html, body { width: ${mm}mm !important; height: auto !important; margin: 0 !important; padding: 0 !important; }
  .voucher-container { display: block !important; min-height: 0 !important; width: ${mm}mm !important; }
  .voucher-container > * { page-break-after: always; break-after: page; }
</style>
<script>
window.addEventListener('load', function () {
  var maxW = ${px};
  document.querySelectorAll('.voucher-container > *').forEach(function (el) {
    var w = el.scrollWidth || el.offsetWidth;
    if (w > maxW) { el.style.zoom = String(maxW / w); }
  });
});
</script></head>`,
      );
    }

    return NextResponse.json({ success: true, html, template: { id: template.id, name: template.name }, count: vouchers.length });
  } catch (error) {
    console.error('[Agent print-html] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
