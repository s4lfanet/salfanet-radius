'use client';

import { differenceInMinutes } from 'date-fns';

interface Props {
  lastInform?: string;
  /** Minutes threshold for "online". Default: 15 */
  thresholdMinutes?: number;
}

/**
 * Shows a colored badge based on how recently the device last contacted GenieACS.
 * - Green (Online): lastInform within thresholdMinutes
 * - Red (Offline): older or missing
 */
export function DeviceStatusBadge({ lastInform, thresholdMinutes = 15 }: Props) {
  if (!lastInform) {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
        Unknown
      </span>
    );
  }

  const minutesAgo = differenceInMinutes(new Date(), new Date(lastInform));
  const isOnline = minutesAgo <= thresholdMinutes;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        isOnline
          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      }`}
    >
      <span
        className={`mr-1.5 h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}
      />
      {isOnline ? 'Online' : 'Offline'}
    </span>
  );
}
