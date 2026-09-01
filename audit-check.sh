#!/bin/bash
echo "=== INVOICE ==="
mysql -u salfanet_user -p1c0921f1e4871379f29727e404a3d27b95f9081d23f0eeac salfanet_radius -e "SELECT id, invoiceNumber, status, amount, paidAt, userId FROM invoices WHERE invoiceNumber='INV-20260901-8D03F3'" 2>/dev/null

echo "=== PAYMENT ATTEMPTS ==="
mysql -u salfanet_user -p1c0921f1e4871379f29727e404a3d27b95f9081d23f0eeac salfanet_radius -e "SELECT id, orderId, invoiceId, status, amount, gatewayAmount, mismatchFlagged FROM payment_attempts WHERE orderId LIKE 'INV-20260901-8D03F3%'" 2>/dev/null

echo "=== PAYMENTS ==="
mysql -u salfanet_user -p1c0921f1e4871379f29727e404a3d27b95f9081d23f0eeac salfanet_radius -e "SELECT id, invoiceId, amount, method, status, paidAt FROM payments WHERE invoiceId=(SELECT id FROM invoices WHERE invoiceNumber='INV-20260901-8D03F3')" 2>/dev/null

echo "=== WEBHOOK LOGS ==="
mysql -u salfanet_user -p1c0921f1e4871379f29727e404a3d27b95f9081d23f0eeac salfanet_radius -e "SELECT id, orderId, gateway, status, success, createdAt FROM webhook_logs WHERE orderId LIKE 'INV-20260901-8D03F3%' ORDER BY createdAt" 2>/dev/null

echo "=== USER ==="
mysql -u salfanet_user -p1c0921f1e4871379f29727e404a3d27b95f9081d23f0eeac salfanet_radius -e "SELECT id, username, name, status, expiredAt, profileId FROM pppoe_users WHERE username='server3'" 2>/dev/null
