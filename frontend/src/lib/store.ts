import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { setCurrentTimezone } from './timezone';

interface CompanySettings {
  name: string;
  email: string;
  phone: string;
  address: string;
  baseUrl: string;
  adminPhone: string;
  logo?: string;
  timezone: string;
  poweredBy?: string;
}

interface AppState {
  locale: 'id';
  company: CompanySettings;
  setLocale: (locale: string) => void;
  setCompany: (company: Partial<CompanySettings>) => void;
  initializeTimezone: () => Promise<void>;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      locale: 'id',
      company: {
        name: '',
        email: '',
        phone: '',
        address: '',
        baseUrl: '',
        adminPhone: '',
        timezone: 'Asia/Jakarta',
      },
      setLocale: () => {},
      setCompany: (company) => {
        // Update timezone lib when company timezone changes
        if (company.timezone) {
          setCurrentTimezone(company.timezone);
        }
        set((state) => ({
          company: { ...state.company, ...company },
        }));
      },
      initializeTimezone: async () => {
        // Initialize company info (including timezone) from server on app load.
        // Use /api/company/info (public) — fetches name, logo, timezone, etc.
        // Throttle: only fetch once per 5 minutes (matches server Cache-Control)
        const lastFetch = (typeof window !== 'undefined' && (window as any).__companyInfoLastFetch) || 0;
        const now = Date.now();
        if (now - lastFetch < 5 * 60 * 1000) {
          // Use stored data from persist
          const currentTz = get().company.timezone;
          setCurrentTimezone(currentTz);
          return;
        }
        if (typeof window !== 'undefined') {
          (window as any).__companyInfoLastFetch = now;
        }
        try {
          const response = await fetch('/api/company/info');
          if (response.ok) {
            const data = await response.json();
            const c = data?.data || data;
            if (c) {
              const tz = c.timezone || 'Asia/Jakarta';
              setCurrentTimezone(tz);
              set((state) => ({
                company: {
                  ...state.company,
                  name: c.name || state.company.name,
                  email: c.email || state.company.email,
                  phone: c.phone || state.company.phone,
                  address: c.address || state.company.address,
                  baseUrl: c.baseUrl || state.company.baseUrl,
                  adminPhone: c.adminPhone || c.phone || state.company.adminPhone,
                  logo: c.logo || state.company.logo,
                  timezone: tz,
                  poweredBy: c.poweredBy || state.company.poweredBy,
                },
              }));
            }
          }
        } catch (error) {
          console.error('Error initializing company info:', error);
          // Use stored data from persist
          const currentTz = get().company.timezone;
          setCurrentTimezone(currentTz);
        }
      },
    }),
    {
      name: 'salfanet-settings',
      onRehydrateStorage: () => (state) => {
        // Sync timezone lib after rehydration
        if (state?.company.timezone) {
          setCurrentTimezone(state.company.timezone);
        }
      },
    }
  )
);
