#!/bin/bash
curl -s --max-time 10 'https://radius.salfa.my.id/' \
  -H 'Accept: text/html' \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' \
  | grep -oE '<script[^>]*cf-beacon[^>]*>' | head -5
echo "---"
curl -s --max-time 10 'https://radius.salfa.my.id/' \
  -H 'Accept: text/html' \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' \
  | grep -oE 'data-cf-beacon[^"]*"[^"]*"' | head -5
echo "---"
curl -s --max-time 10 'https://radius.salfa.my.id/' \
  -H 'Accept: text/html' \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' \
  | grep -oE 'static\.cloudflareinsights\.com[^"]*' | head -5
