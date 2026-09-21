/**
 * Decorative background glow + grid overlay shared by admin pages that want
 * the same ambient look as the main dashboard. Previously copy-pasted
 * verbatim into admin/page.tsx and admin/settings/company/page.tsx.
 */
export function AdminBackgroundGlow() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute top-0 left-1/4 w-48 h-48 sm:w-96 sm:h-96 bg-primary/10 rounded-full blur-3xl"></div>
      <div className="absolute top-1/3 right-1/4 w-48 h-48 sm:w-96 sm:h-96 bg-brand-500/20 rounded-full blur-3xl"></div>
      <div className="absolute bottom-0 left-1/2 w-48 h-48 sm:w-96 sm:h-96 bg-pink-500/20 rounded-full blur-3xl"></div>
      <div className="hidden dark:block absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.03)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
    </div>
  );
}

/**
 * The two-orb pulsing glow used behind full-screen loading/auth states in
 * AdminClientLayout — was copy-pasted identically into the loading screen,
 * the unauthenticated screen, and the Suspense fallback.
 */
export function AdminLoadingGlow() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <div className="absolute top-1/4 left-1/4 w-48 h-48 sm:w-96 sm:h-96 bg-brand-500/10 rounded-full blur-[70px] animate-pulse" style={{ willChange: 'opacity', transform: 'translateZ(0)' }} />
      <div className="absolute bottom-1/4 right-1/4 w-48 h-48 sm:w-96 sm:h-96 bg-blue-500/10 rounded-full blur-[70px] animate-pulse delay-1000" style={{ willChange: 'opacity', transform: 'translateZ(0)' }} />
    </div>
  );
}
