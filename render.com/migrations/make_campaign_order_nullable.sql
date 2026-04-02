-- Migration: Make campaign_id and order_id nullable in processing_tags
-- orderCode is now the ONLY required key. campaign_id and order_id are legacy fields.
-- Existing rows keep their values, new rows will have NULL for these columns.

ALTER TABLE processing_tags ALTER COLUMN campaign_id DROP NOT NULL;
ALTER TABLE processing_tags ALTER COLUMN order_id DROP NOT NULL;
