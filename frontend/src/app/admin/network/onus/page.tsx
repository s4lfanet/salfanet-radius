import { redirect } from 'next/navigation';

export default async function NetworkOnusRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const oltId = Array.isArray(params.olt_id) ? params.olt_id[0] : params.olt_id;
  const filter = Array.isArray(params.filter) ? params.filter[0] : params.filter;
  const mappedFilter = filter === 'unconfig' ? 'auth_failed' : filter;

  if (oltId) {
    redirect(`/admin/olt/${oltId}${mappedFilter ? `?filter=${encodeURIComponent(mappedFilter)}` : ''}`);
  }

  redirect('/admin/olt/monitoring');
}