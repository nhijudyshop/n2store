-- Migration: Drop old UNIQUE(campaign_id, order_id) constraint from processing_tags
-- order_code is now THE unique key for all records (via idx_ptag_order_code_unique)
-- The old composite constraint conflicts with the new ON CONFLICT (order_code) logic

-- Drop the old unique constraint
ALTER TABLE processing_tags DROP CONSTRAINT IF EXISTS processing_tags_campaign_id_order_id_key;
