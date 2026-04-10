-- =====================================================
-- Migration 027: Add fb_id to customers table
-- Date: 2026-04-10
-- Purpose: Link customers with Pancake/Facebook conversations via fb_id
-- fb_id = Facebook User ID from Pancake API (e.g. 24948162744877764)
-- =====================================================

ALTER TABLE customers ADD COLUMN IF NOT EXISTS fb_id VARCHAR(50);

-- Partial unique index: 1 fb_id = 1 customer, NULL allowed (chưa link)
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_fb_id ON customers(fb_id)
    WHERE fb_id IS NOT NULL;

COMMENT ON COLUMN customers.fb_id IS
    'Pancake/Facebook User ID (e.g. 24948162744877764). From conversations.customers[].fb_id. Used to link customer 360 data with Pancake conversations.';
