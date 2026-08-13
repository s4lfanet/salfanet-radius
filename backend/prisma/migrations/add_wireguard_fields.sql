-- Migration: Add WireGuard fields to vpn_servers and vpn_clients
-- Date: 2026
-- MySQL-compatible: no ADD COLUMN IF NOT EXISTS (run with mysql --force)

-- Add WireGuard fields to vpn_servers
ALTER TABLE vpn_servers ADD COLUMN wgEnabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE vpn_servers ADD COLUMN wgPublicKey TEXT;
ALTER TABLE vpn_servers ADD COLUMN wgPort INTEGER DEFAULT 51820;

-- Add WireGuard peer key fields to vpn_clients
ALTER TABLE vpn_clients ADD COLUMN clientPublicKey TEXT;
ALTER TABLE vpn_clients ADD COLUMN clientPrivateKey TEXT;
