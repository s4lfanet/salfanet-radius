-- Migration: Add ppnRate field to pppoe_profiles table
ALTER TABLE pppoe_profiles ADD COLUMN ppnRate INT NOT NULL DEFAULT 11;
