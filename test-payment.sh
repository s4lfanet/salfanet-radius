#!/bin/bash
cat > /tmp/pay.json << 'EOF'
{"invoiceId":"vGx75hAhLN0CQ6KU7uN7R","gateway":"midtrans","paymentToken":"1184d0ca51265598bf265532dc595363f188c7ca6d4818bacdbe8b4227702b06"}
EOF
curl -s -X POST http://localhost:3001/api/payment/create -H 'Content-Type: application/json' -d @/tmp/pay.json
