# ⚠️ PENTING: mods-enabled/sql adalah STANDALONE FILE pada VPS ini, BUKAN symlink!
#
# Pada VPS salfanet-radius, mods-enabled/sql telah dimodifikasi (DB credentials) dan
# disimpan sebagai file tersendiri. Jika dibuat sebagai symlink, edit di mods-available/sql
# akan langsung berpengaruh — tapi karena ini standalone, harus di-copy ulang jika berubah.
#
# Deploy SQL module ke VPS:
#   pscp -pw "<ROOT_PASSWORD>" freeradius-config/mods-enabled/sql root@<VPS_IP>:/etc/freeradius/3.0/mods-enabled/sql
#
# mods-enabled/rest adalah SYMLINK ke mods-available/rest (dibuat installer):
#   ln -sf /etc/freeradius/3.0/mods-available/rest /etc/freeradius/3.0/mods-enabled/rest
# File mods-enabled/rest di folder ini adalah COPY backup (konten identik dengan mods-available/rest).
#
# Jika ada perubahan di mods-available/rest, update juga mods-enabled/rest (copy konten yang sama).
#   ln -sf /etc/freeradius/3.0/mods-available/rest /etc/freeradius/3.0/mods-enabled/rest
#
# Setelah deploy, reload FreeRADIUS:
#   plink -pw "<ROOT_PASSWORD>" root@<VPS_IP> "systemctl reload freeradius"
