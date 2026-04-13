-- Migration 050: Create inventory_notes table (replaces inventory_inline_notes)
-- Multi-user notes per invoice with image attachments

BEGIN;

DROP TABLE IF EXISTS inventory_inline_notes;

CREATE TABLE IF NOT EXISTS inventory_notes (
    id SERIAL PRIMARY KEY,
    invoice_id TEXT NOT NULL,
    username TEXT NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    note_text TEXT DEFAULT '',
    note_images TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_notes_invoice ON inventory_notes(invoice_id);

COMMIT;
