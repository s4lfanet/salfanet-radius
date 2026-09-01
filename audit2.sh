#!/bin/bash
echo "=== INVOICE ==="
mysql -u salfanet_user -p1c0921f1e4871379f29727e404a3d27b95f9081d23f0eeac salfanet_radius -e "SELECT id, invoiceNumber, status, amount, paidAt, userId FROM invoices WHERE invoiceNumber='INV-20260901-8D03F3'"

echo "=== TABLES CHECK ==="
mysql -u salfanet_user -p1c0921f1e4871379f29727e404a3d27b95f9081d23f0eeac salfanet_radius -e "SHOW TABLES LIKE 'payment%'" 2>/dev/null

echo "=== PAYMENT ATTEMPTS (all) ==="
mysql -u salfanet_user -p1c0921f1e4871379f29727e404a3d27b95f9081d23f0eeac salfanet_radius -e "SELECT id, orderId, invoiceId, status, amount FROM payment_attempts LIMIT 10" 2>/dev/null

echo "=== RECENT WEBHOOK LOGS ==="
mysql -u salfanet_user -p1c0921f1e4871379f29727e404a3d27b95f9081d23f0eeac salfanet_radius -e "SELECT id, orderId, gateway, status, success, createdAt FROM webhook_logs ORDER BY createdAt DESC LIMIT 10" 2>/dev/null
