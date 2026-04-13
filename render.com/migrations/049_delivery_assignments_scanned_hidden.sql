-- Migration 049: Add scanned/hidden columns to delivery_assignments
-- Chuyển toàn bộ từ Firestore sang PostgreSQL

ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS is_scanned BOOLEAN DEFAULT FALSE;
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE;
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS scanned_at TIMESTAMPTZ;
ALTER TABLE delivery_assignments ADD COLUMN IF NOT EXISTS scanned_by VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_delivery_assignments_scanned ON delivery_assignments(assignment_date, is_scanned);
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_hidden ON delivery_assignments(assignment_date, is_hidden);
