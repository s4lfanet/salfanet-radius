#!/bin/bash
set -x
# Stop all services
pm2 delete all 2>/dev/null || true
pm2 kill 2>/dev/null || true
systemctl stop nginx 2>/dev/null || true
systemctl stop freeradius 2>/dev/null || true
pkill -9 node 2>/dev/null || true

# Kill port processes
for PORT in 3000 3001 1812 1813 3799 1814; do
  lsof -ti :$PORT 2>/dev/null | xargs -r kill -9 2>/dev/null || true
done

# Remove app files
rm -rf /var/www/salfanet-radius

# Drop database and user
mysql -u root -e "DROP DATABASE IF EXISTS salfanet_radius;" 2>/dev/null || true
mysql -u root -e "DROP USER IF EXISTS 'salfanet_user'@'localhost';" 2>/dev/null || true
mysql -u root -e "FLUSH PRIVILEGES;" 2>/dev/null || true

# Remove FreeRADIUS config
systemctl stop freeradius 2>/dev/null || true
systemctl disable freeradius 2>/dev/null || true
rm -rf /etc/freeradius 2>/dev/null || true
rm -rf /var/log/freeradius 2>/dev/null || true
rm -rf /var/run/freeradius 2>/dev/null || true
rm -f /etc/sudoers.d/*-freeradius 2>/dev/null || true

# Remove Nginx config
rm -f /etc/nginx/sites-available/salfanet
rm -f /etc/nginx/sites-enabled/salfanet
rm -f /etc/ssl/certs/nginx-selfsigned.crt
rm -f /etc/ssl/private/nginx-selfsigned.key
ln -s /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default 2>/dev/null || true
systemctl reload nginx 2>/dev/null || true

# Remove PM2 startup
pm2 unstartup systemd 2>/dev/null || true
rm -f /etc/systemd/system/pm2-*.service 2>/dev/null || true
systemctl daemon-reload 2>/dev/null || true

# Clean firewall rules
ufw delete allow 1812/udp 2>/dev/null || true
ufw delete allow 1813/udp 2>/dev/null || true
ufw delete allow 3799/udp 2>/dev/null || true
ufw delete allow 500/udp 2>/dev/null || true
ufw delete allow 4500/udp 2>/dev/null || true
ufw delete allow 1701/udp 2>/dev/null || true
ufw delete allow 80/tcp 2>/dev/null || true
ufw delete allow 443/tcp 2>/dev/null || true

# Clean logs
rm -rf /var/log/salfanet-vps-install.log
rm -rf /var/log/nginx/salfanet-*
rm -rf /var/log/nginx/salfanet-radius-*

echo "=== VERIFY ==="
pm2 list 2>/dev/null || echo "PM2 EMPTY"
ls /var/www/salfanet-radius 2>/dev/null || echo "APP_DIR GONE"
mysql -u root -e 'SHOW DATABASES' 2>/dev/null | grep salfanet || echo "DB GONE"
ls /etc/nginx/sites-enabled/salfanet 2>/dev/null || echo "NGINX CONF GONE"
systemctl is-active freeradius 2>/dev/null || echo "FREERADIUS STOPPED"
