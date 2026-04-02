-- Fix reviewed_at timezone: old code used NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh'
-- which stored VN local time as if it were UTC in a timestamptz column.
-- This shifts all existing values back by 7 hours to correct UTC.
UPDATE balance_history
SET reviewed_at = reviewed_at - INTERVAL '7 hours'
WHERE reviewed_at IS NOT NULL;
