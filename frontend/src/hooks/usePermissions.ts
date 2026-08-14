'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { apiAdmin } from '@/lib/api';

/**
 * Hook to check user permissions on client side
 * Usage:
 *
 * const { hasPermission, permissions, loading } = usePermissions();
 *
 * if (hasPermission('users.delete')) {
 *   return <button>Delete</button>
 * }
 */
export function usePermissions() {
  const { data: session } = useSession();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session?.user) {
      const userId = session.user.id;
      if (userId) {
        setLoading(true);
        apiAdmin<{ success?: boolean; permissions?: string[] }>(`/api/admin/users/${userId}/permissions`)
          .then((data) => {
            if (data.success) {
              setPermissions(data.permissions || []);
            }
          })
          .catch((error) => console.error('Error loading permissions:', error))
          .finally(() => setLoading(false));
      }
    } else {
      setLoading(false);
    }
  }, [session]);

  const hasPermission = (permissionKey: string): boolean => {
    return permissions.includes(permissionKey);
  };

  const hasAnyPermission = (permissionKeys: string[]): boolean => {
    return permissionKeys.some((key) => permissions.includes(key));
  };

  const hasAllPermissions = (permissionKeys: string[]): boolean => {
    return permissionKeys.every((key) => permissions.includes(key));
  };

  return {
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    loading,
  };
}
