#!/bin/bash
curl -s --max-time 10 'https://radius.salfa.my.id/' \
  -H 'Accept: text/html' \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' \
  | grep -oE 'cf-[a-z]+' | sort -u | head -20
echo "---"
curl -s --max-time 10 'https://radius.salfa.my.id/' \
  -H 'Accept: text/html' \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' \
  | grep -c 'cloudflareinsights\|cf-beacon\|rocket-loader'
