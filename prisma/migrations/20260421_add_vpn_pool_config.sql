-- Migration: Add IP pool configuration fields to vpn_servers
-- Date: 2026-04-21

-- poolStart: first assignable IP in pool (e.g. 10.20.30.10)
-- poolEnd:   last assignable IP in pool (e.g. 10.20.30.254)
-- gateway:   VPN gateway IP for this server (e.g. 10.20.30.1)
ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS poolStart VARCHAR(45) NULL;
ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS poolEnd VARCHAR(45) NULL;
ALTER TABLE vpn_servers ADD COLUMN IF NOT EXISTS gateway VARCHAR(45) NULL;
