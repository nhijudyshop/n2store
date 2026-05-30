-- Migration 071: inventory_hidden_nccs — per-(shipment, NCC) hide flag synced across users/devices
--
-- Replaces the localStorage-only `inventory_ncc_done` map. Ticking the checkbox
-- on a NCC row inserts; unticking deletes. SSE topic `inventory_hidden_nccs`
-- broadcasts every change so other tabs/machines re-render immediately.
--
-- shipment_id stays TEXT (matches inventory_shipments.id which is text).
-- No FK on purpose: rows may reference temp/legacy shipments and we want the
-- table to survive without cascading admin work.

BEGIN;

CREATE TABLE IF NOT EXISTS inventory_hidden_nccs (
    id SERIAL PRIMARY KEY,
    shipment_id TEXT NOT NULL,
    ncc_key TEXT NOT NULL,
    hidden_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (shipment_id, ncc_key)
);

CREATE INDEX IF NOT EXISTS idx_inv_hidden_shipment ON inventory_hidden_nccs(shipment_id);

COMMIT;
