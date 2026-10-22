-- ====================================================================
-- Whoopit Inventory Platform (v4)
-- Migration: 000004_add_user_name.up.sql
-- Description: Add user display name for profile & RBAC identification
-- ====================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(128) NOT NULL DEFAULT '';
