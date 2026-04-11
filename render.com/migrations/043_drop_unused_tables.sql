-- Migration 043: Drop unused tables
-- Audit date: 2026-04-11
-- Reason: These tables were created but never referenced in production code.
--
-- debt_adjustment_log: Created but 0 references anywhere in codebase (orphan)
-- soquy_vouchers: Only in one-time migration scripts; soquy still uses Firestore
-- soquy_counters: Same as above
-- soquy_meta: Same as above

DROP TABLE IF EXISTS debt_adjustment_log;
DROP TABLE IF EXISTS soquy_vouchers;
DROP TABLE IF EXISTS soquy_counters;
DROP TABLE IF EXISTS soquy_meta;
