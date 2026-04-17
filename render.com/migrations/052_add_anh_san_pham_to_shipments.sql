-- Migration 052: Add missing columns to inventory_shipments
-- anh_san_pham: product images per shipment (JSONB), referenced by backend but missing from 047
-- ghi_chu_admin: admin-only note per shipment, collected in modal but had no DB column

ALTER TABLE inventory_shipments
ADD COLUMN IF NOT EXISTS anh_san_pham JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE inventory_shipments
ADD COLUMN IF NOT EXISTS ghi_chu_admin TEXT DEFAULT '';
