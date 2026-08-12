-- Migration: Add IP pool configuration fields to vpn_servers
-- Date: 2026-04-21
-- MySQL-compatible: no ADD COLUMN IF NOT EXISTS (run with mysql --force)

-- poolStart: first assignable IP in pool (e.g. 10 → .10)
-- poolEnd:   last assignable IP in pool  (e.g. 254 → .254)
-- gateway:   VPN gateway IP override for this server (e.g. 10.20.30.1)
ALTER TABLE vpn_servers ADD COLUMN poolStart INT NOT NULL DEFAULT 10;
ALTER TABLE vpn_servers ADD COLUMN poolEnd INT NOT NULL DEFAULT 254;
ALTER TABLE vpn_servers ADD COLUMN gateway VARCHAR(45) NULL;
