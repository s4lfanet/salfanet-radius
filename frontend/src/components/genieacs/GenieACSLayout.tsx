'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Cpu,
  Settings2,
  AlertTriangle,
  FileCode2,
  Sliders,
  FileUp,
  Zap,
} from 'lucide-react';

const NAV_ITEMS = [
  { href: '/admin/genieacs/devices', label: 'Devices', icon: Cpu },
  { href: '/admin/genieacs/presets', label: 'Presets', icon: Settings2 },
  { href: '/admin/genieacs/provisions', label: 'Provisions', icon: FileCode2 },
  {
    href: '/admin/genieacs/virtual-parameters',
    label: 'Virtual Parameters',
    icon: Sliders,
  },
  { href: '/admin/genieacs/faults', label: 'Faults', icon: AlertTriangle },
  { href: '/admin/genieacs/files', label: 'Files', icon: FileUp },
  { href: '/admin/genieacs/config', label: 'Config', icon: Settings2 },
  {
    href: '/admin/genieacs/auto-provision',
    label: 'Auto-Provision',
    icon: Zap,
  },
];

interface Props {
  children: React.ReactNode;
  title?: string;
}

/**
 * Shared layout wrapper for all /admin/genieacs/* pages.
 * Renders a secondary side-nav for quick navigation between GenieACS sections.
 */
export function GenieACSLayout({ children, title }: Props) {
  const pathname = usePathname();

  return (
    <div className="flex gap-6">
      {/* Side nav */}
      <aside className="hidden lg:block w-48 flex-shrink-0">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          GenieACS
        </p>
        <nav className="space-y-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                }`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <div className="min-w-0 flex-1">
        {title && (
          <h1 className="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
            {title}
          </h1>
        )}
        {children}
      </div>
    </div>
  );
}
