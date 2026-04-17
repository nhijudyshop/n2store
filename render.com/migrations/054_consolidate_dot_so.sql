-- Migration 054: Consolidate dot_so — one đợt per date
-- Reason: Migration 053 backfill was too granular (grouped by minute) — 9 NCCs created
-- across minute boundaries got 9 different dot_so values. In practice, a shipment batch
-- (đợt) typically contains multiple NCCs created in one UI session.
-- Fix: reset all existing rows to dot_so = 1 per date. Users can adjust via edit modal
-- if they need multiple đợt for one date going forward.

BEGIN;

UPDATE inventory_shipments SET dot_so = 1;

COMMIT;
