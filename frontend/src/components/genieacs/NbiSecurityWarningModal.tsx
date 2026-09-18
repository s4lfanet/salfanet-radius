'use client';

import { useState } from 'react';
import { ShieldAlert, AlertTriangle, Flame, Lock, X } from 'lucide-react';
import { SimpleModal, ModalHeader, ModalTitle, ModalBody, ModalFooter, ModalButton } from '@/components/cyberpunk/SimpleModal';
import { useTranslation } from '@/hooks/useTranslation';

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mt-2 mb-3 overflow-x-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100 dark:bg-gray-950">
      <code>{children}</code>
    </pre>
  );
}

type GuideId = 'firewall' | 'nginx' | null;

function FirewallGuide() {
  return (
    <div className="space-y-3 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">Skenario A — GenieACS di server yang sama dengan Salfanet Radius</p>
      <p>1. Bind NBI ke localhost saja, lalu restart service:</p>
      <CodeBlock>{`NBI_INTERFACE=127.0.0.1
NBI_PORT=7557

sudo systemctl restart genieacs-nbi`}</CodeBlock>
      <p>2. Verifikasi sudah localhost-only (harus muncul <code>127.0.0.1:7557</code>, bukan <code>0.0.0.0:7557</code>):</p>
      <CodeBlock>{`ss -tlnp | grep 7557`}</CodeBlock>
      <p>3. Isi field &quot;URL Server&quot; di form dengan:</p>
      <CodeBlock>{`http://127.0.0.1:7557`}</CodeBlock>

      <p className="font-medium text-foreground pt-2">Skenario B — GenieACS di server terpisah (remote)</p>
      <p>1. Izinkan HANYA IP server Salfanet Radius mengakses port NBI, tolak yang lain:</p>
      <CodeBlock>{`sudo ufw allow from <IP_SERVER_SALFANET> to any port 7557 proto tcp
sudo ufw deny 7557/tcp
sudo ufw reload`}</CodeBlock>
      <p>2. Verifikasi dari IP lain (harus timeout / connection refused):</p>
      <CodeBlock>{`curl -m 5 http://<IP_GENIEACS>:7557/devices`}</CodeBlock>
    </div>
  );
}

function NginxGuide() {
  return (
    <div className="space-y-3 text-xs text-muted-foreground">
      <p>NBI tidak punya auth bawaan. Cara paling praktis: bind NBI ke localhost, lalu pasang nginx reverse proxy dengan basic-auth + SSL di depannya.</p>

      <p className="font-medium text-foreground pt-1">0. Install nginx (lewati jika sudah ada)</p>
      <CodeBlock>{`sudo apt-get update
sudo apt-get install -y nginx apache2-utils certbot python3-certbot-nginx
sudo systemctl enable --now nginx`}</CodeBlock>

      <p className="font-medium text-foreground pt-1">1. Bind NBI ke localhost (defense-in-depth walau sudah di belakang nginx)</p>
      <CodeBlock>{`NBI_INTERFACE=127.0.0.1
NBI_PORT=7557
sudo systemctl restart genieacs-nbi
ss -tlnp | grep 7557   # harus 127.0.0.1:7557`}</CodeBlock>

      <p className="font-medium text-foreground pt-1">2. Buat credential basic-auth</p>
      <CodeBlock>{`sudo htpasswd -c /etc/nginx/acs.htpasswd salfanet_admin
# masukkan password KUAT — ini yang diisi ke field Username/Password di form ini`}</CodeBlock>

      <p className="font-medium text-foreground pt-1">3. Config nginx (HTTP dulu, SSL otomatis lewat certbot)</p>
      <CodeBlock>{`# /etc/nginx/sites-available/genieacs-nbi.conf
server {
  listen 80;
  server_name acs.domainanda.com;

  location / {
    auth_basic "GenieACS NBI";
    auth_basic_user_file /etc/nginx/acs.htpasswd;
    proxy_pass http://127.0.0.1:7557;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }
}

sudo ln -s /etc/nginx/sites-available/genieacs-nbi.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx`}</CodeBlock>

      <p className="font-medium text-foreground pt-1">4. Arahkan A record domain ke IP VPS ini, lalu terbitkan SSL</p>
      <CodeBlock>{`sudo certbot --nginx -d acs.domainanda.com`}</CodeBlock>

      <p className="font-medium text-foreground pt-1">5. Validasi — tanpa auth HARUS 401, dengan auth HARUS 200</p>
      <CodeBlock>{`curl -s -o /dev/null -w "%{http_code}\\n" https://acs.domainanda.com/devices

curl -s -o /dev/null -w "%{http_code}\\n" \\
  -u "salfanet_admin:PASSWORD_ANDA" https://acs.domainanda.com/devices`}</CodeBlock>

      <p className="font-medium text-foreground pt-1">6. Isi form di atas</p>
      <CodeBlock>{`URL Server : https://acs.domainanda.com   ← TANPA :7557 (nginx sudah di port 443)
Username   : salfanet_admin
Password   : password dari langkah 2`}</CodeBlock>
      <p className="text-amber-600 dark:text-amber-400">
        Penting: jangan pakai <code>:7557</code> di URL yang diisi ke app — itu port mentah tanpa proteksi.
        Nginx sudah mendengarkan di port 443 (default HTTPS, tidak perlu ditulis di URL).
      </p>
    </div>
  );
}

interface NbiSecurityWarningModalProps {
  isOpen: boolean;
  /** Dismiss for this visit only — does not persist. */
  onClose: () => void;
  /** Persist acknowledgment (backend PATCH/POST) and close. */
  onAcknowledge: () => Promise<void> | void;
}

export function NbiSecurityWarningModal({ isOpen, onClose, onAcknowledge }: NbiSecurityWarningModalProps) {
  const { t } = useTranslation();
  const [activeGuide, setActiveGuide] = useState<GuideId>(null);
  const [acked, setAcked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleContinue = async () => {
    setSubmitting(true);
    try {
      await onAcknowledge();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SimpleModal isOpen={isOpen} onClose={onClose} size="lg" showClose={false}>
      <ModalHeader>
        <ModalTitle className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-destructive" />
          {t('genieacs.securityWarningTitle')}
        </ModalTitle>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="w-5 h-5" />
        </button>
      </ModalHeader>

      <ModalBody className="space-y-4">
        <div className="flex items-start gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/10">
          <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">
            <strong>{t('genieacs.securityWarningIntro')}</strong> {t('genieacs.securityWarningBody')}
          </p>
        </div>

        <p className="text-xs text-muted-foreground">{t('genieacs.securityChooseGuide')}</p>

        <div className="flex gap-2">
          <ModalButton
            type="button"
            variant="danger"
            onClick={() => setActiveGuide((g) => (g === 'firewall' ? null : 'firewall'))}
            className="flex items-center gap-1.5 flex-1 justify-center"
          >
            <Flame className="w-3.5 h-3.5" />
            {t('genieacs.securityGuideFirewall')}
          </ModalButton>
          <ModalButton
            type="button"
            onClick={() => setActiveGuide((g) => (g === 'nginx' ? null : 'nginx'))}
            className="flex items-center gap-1.5 flex-1 justify-center bg-amber-500 hover:bg-amber-600 text-white dark:from-amber-500 dark:to-amber-600"
          >
            <Lock className="w-3.5 h-3.5" />
            {t('genieacs.securityGuideNginx')}
          </ModalButton>
        </div>

        {activeGuide && (
          <div className="max-h-80 overflow-y-auto rounded-lg border border-border p-3 bg-card">
            {activeGuide === 'firewall' ? <FirewallGuide /> : <NginxGuide />}
          </div>
        )}

        <label className="flex items-start gap-2 text-xs text-foreground pt-1 cursor-pointer">
          <input
            type="checkbox"
            checked={acked}
            onChange={(e) => setAcked(e.target.checked)}
            className="mt-0.5"
          />
          {t('genieacs.securityAckLabel')}
        </label>
      </ModalBody>

      <ModalFooter>
        <ModalButton
          type="button"
          variant="primary"
          disabled={!acked || submitting}
          onClick={handleContinue}
          className="w-full justify-center"
        >
          {t('genieacs.securityAckButton')}
        </ModalButton>
      </ModalFooter>
    </SimpleModal>
  );
}
