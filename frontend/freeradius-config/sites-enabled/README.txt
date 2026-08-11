# ⚠️ PENTING: Pada VPS salfanet-radius, sites-enabled/default adalah STANDALONE FILE,
# BUKAN symlink ke sites-available/default!
#
# Untuk deploy ke VPS, upload file ini langsung ke:
#   /etc/freeradius/3.0/sites-enabled/default
#
# sites-enabled/coa adalah SYMLINK ke sites-available/coa (dibuat oleh installer).
# File coa tidak disimpan di folder ini — installer membuat symlink secara otomatis:
#   ln -sf /etc/freeradius/3.0/sites-available/coa /etc/freeradius/3.0/sites-enabled/coa
#
# sites-enabled pada VPS:
#   coa      -> ../sites-available/coa     (symlink, dibuat installer)
#   default  -> standalone file (di-deploy dari freeradius-config/sites-enabled/default)
#   inner-tunnel -> default FreeRADIUS (tidak dikustomisasi)
#
# JANGAN hanya upload ke sites-available/ karena tidak akan berpengaruh.
#
# Deploy command:
#   pscp -pw "<ROOT_PASSWORD>" freeradius-config/sites-enabled/default root@<VPS_IP>:/etc/freeradius/3.0/sites-enabled/default
#
# Setelah upload, restart FreeRADIUS:
#   plink -pw "<ROOT_PASSWORD>" root@<VPS_IP> "bash -c 'systemctl restart freeradius'"
