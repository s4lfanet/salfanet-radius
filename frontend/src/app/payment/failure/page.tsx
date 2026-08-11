import { redirect } from 'next/navigation';

type SearchParams = Record<string, string | string[] | undefined>;

function asString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] || '';
  return value || '';
}

export default async function PaymentFailureAliasPage(props: { searchParams: Promise<SearchParams> }) {
  const searchParams = await props.searchParams;
  const token = asString(searchParams.token);
  const orderId = asString(searchParams.order_id);
  const reason = asString(searchParams.reason) || 'payment_failed';

  const qp = new URLSearchParams();
  if (token) qp.set('token', token);
  if (orderId) qp.set('order_id', orderId);
  if (reason) qp.set('reason', reason);

  redirect(`/payment/failed?${qp.toString()}`);
}
