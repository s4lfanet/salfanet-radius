import { readFileSync, writeFileSync } from 'fs';

let c = readFileSync('src/app/technician/TechnicianPortalLayout.tsx', 'utf8');
const lines = c.split('\n');

// Find start (line 95, 0-indexed: 94) and end (line 250, 0-indexed: 249)
const start = lines.findIndex(l => l.includes('--- Sidebar Push Notification Toggle ---'));
const end = lines.findIndex((l, i) => i > start + 5 && /^function \w+/.test(l));

console.log('Replacing lines', start + 1, 'to', end - 1);

const newComponent = `/* --- Sidebar Push Notification Toggle --- */
function SidebarPushToggle({ techId }: { techId: string }) {
  const [isSupported, setIsSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [loading, setLoading] = useState(false);

  const checkSupport = () =>
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window;

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
  };

  const refresh = async () => {
    const supported = checkSupport();
    setIsSupported(supported);
    if (!supported) return;
    setPermission(Notification.permission);
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(!!sub);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!techId) return;
    void refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [techId]);

  const handleToggle = async () => {
    if (!isSupported || !techId) return;
    setLoading(true);
    try {
      if (subscribed) {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        const endpoint = sub?.endpoint;
        if (sub) await sub.unsubscribe();
        await fetch('/api/push/technician-unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ technicianId: techId, endpoint }),
        });
        setSubscribed(false);
        setPermission(Notification.permission);
      } else {
        let perm = Notification.permission;
        if (perm === 'default') {
          perm = await Notification.requestPermission();
          setPermission(perm);
        }
        if (perm !== 'granted') return;
        const vapidRes = await fetch('/api/push/vapid-public-key');
        const { publicKey } = await vapidRes.json();
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
        }
        await fetch('/api/push/technician-subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ technicianId: techId, subscription: sub.toJSON() }),
        });
        setSubscribed(true);
        setPermission('granted');
      }
    } catch (e) {
      console.error('[SidebarPush]', e);
    } finally {
      setLoading(false);
    }
  };

  const isOn = subscribed && permission === 'granted';
  const isDenied = permission === 'denied';

  return (
    <button
      onClick={handleToggle}
      disabled={loading || isDenied || !isSupported}
      title={
        !isSupported ? 'Browser tidak mendukung push notification'
        : isDenied ? 'Notifikasi diblokir — ubah di pengaturan browser'
        : isOn ? 'Klik untuk nonaktifkan notifikasi push'
        : 'Klik untuk aktifkan notifikasi push'
      }
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 text-xs font-bold rounded-xl transition-all duration-300 border',
        isOn
          ? 'text-cyan-500 bg-cyan-50 dark:bg-cyan-500/10 border-cyan-300 dark:border-cyan-500/30 shadow-sm dark:shadow-[0_0_15px_rgba(6,182,212,0.15)]'
          : isDenied || !isSupported
          ? 'text-slate-400 dark:text-slate-500 border-transparent opacity-60 cursor-not-allowed'
          : 'text-slate-600 dark:text-slate-300 border-transparent hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-cyan-500/10 hover:border-slate-200 dark:hover:border-cyan-500/20',
      )}
    >
      <span
        className={cn(
          'p-1.5 rounded-lg flex-shrink-0 flex items-center justify-center transition-all duration-300',
          isOn ? 'text-cyan-500 bg-cyan-50 dark:bg-cyan-500/10' : 'text-slate-400 dark:text-slate-400',
        )}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isOn ? (
          <Bell className="w-4 h-4" />
        ) : (
          <BellOff className="w-4 h-4" />
        )}
      </span>
      <span className="flex-1 text-left tracking-wide">
        {isOn ? 'Notif Push: ON' : isDenied ? 'Notif Push: Diblokir' : !isSupported ? 'Notif Push: OFF' : 'Notif Push: OFF'}
      </span>
      {isSupported && (
        <span
          className={cn(
            'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 transition-all duration-300',
            isOn
              ? 'border-cyan-500 bg-cyan-500'
              : isDenied
              ? 'border-slate-400 dark:border-slate-600 bg-slate-300 dark:bg-slate-700'
              : 'border-slate-400 dark:border-slate-500 bg-slate-200 dark:bg-slate-600',
          )}
        >
          <span
            className={cn(
              'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-md transform transition-transform duration-300',
              isOn ? 'translate-x-4' : 'translate-x-0',
            )}
          />
        </span>
      )}
    </button>
  );
}

`;

const before = lines.slice(0, start).join('\n');
const after = lines.slice(end).join('\n');
const result = before + '\n' + newComponent + after;

writeFileSync('src/app/technician/TechnicianPortalLayout.tsx', result, 'utf8');
console.log('Done. New length:', result.length, 'lines:', result.split('\n').length);
