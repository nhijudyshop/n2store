-- Migration 056: Consolidate duplicate NCC rows within same (ngay_di_hang, dot_so)
-- Reason: user wants "trùng đợt, trùng ngày, trùng tên NCC thì gộp". Current DB has
-- 2 rows for 'LAY THEM' on 2026-04-10 đợt 1 (stt_ncc=1 and stt_ncc=901).
-- Strategy: keep earliest-created row; append products, sum totals, union images
-- from later rows, then delete them.
-- Only applies when ten_ncc is non-empty (empty tenNCC rows aren't semantically dupes).

BEGIN;

-- Find dup groups and the "keeper" (earliest) id per group
WITH dup_groups AS (
    SELECT
        ngay_di_hang,
        dot_so,
        LOWER(TRIM(ten_ncc)) AS ten_key,
        COUNT(*) AS cnt,
        MIN(created_at) AS keeper_created_at
    FROM inventory_shipments
    WHERE ten_ncc IS NOT NULL AND TRIM(ten_ncc) <> ''
    GROUP BY ngay_di_hang, dot_so, LOWER(TRIM(ten_ncc))
    HAVING COUNT(*) > 1
),
keepers AS (
    SELECT s.id AS keeper_id, g.ngay_di_hang, g.dot_so, g.ten_key
    FROM dup_groups g
    JOIN inventory_shipments s
      ON s.ngay_di_hang = g.ngay_di_hang
     AND s.dot_so = g.dot_so
     AND LOWER(TRIM(s.ten_ncc)) = g.ten_key
     AND s.created_at = g.keeper_created_at
),
-- All losing rows grouped per keeper
merges AS (
    SELECT
        k.keeper_id,
        COALESCE(jsonb_agg(s.san_pham) FILTER (WHERE s.id <> k.keeper_id), '[]'::jsonb) AS extra_san_pham_arrays,
        COALESCE(SUM(CASE WHEN s.id <> k.keeper_id THEN s.tong_tien_hd ELSE 0 END), 0) AS extra_tien,
        COALESCE(SUM(CASE WHEN s.id <> k.keeper_id THEN s.tong_mon ELSE 0 END), 0) AS extra_mon,
        COALESCE(SUM(CASE WHEN s.id <> k.keeper_id THEN s.so_mon_thieu ELSE 0 END), 0) AS extra_thieu,
        -- Concatenate image arrays from losers
        ARRAY(
            SELECT DISTINCT UNNEST(s2.anh_hoa_don)
            FROM inventory_shipments s2
            WHERE s2.ngay_di_hang = k.ngay_di_hang
              AND s2.dot_so = k.dot_so
              AND LOWER(TRIM(s2.ten_ncc)) = k.ten_key
              AND s2.id <> k.keeper_id
        ) AS loser_images,
        string_agg(
            CASE WHEN s.id <> k.keeper_id AND NULLIF(TRIM(s.ghi_chu), '') IS NOT NULL THEN s.ghi_chu END,
            ' | '
        ) AS loser_ghi_chu,
        string_agg(
            CASE WHEN s.id <> k.keeper_id AND NULLIF(TRIM(s.ghi_chu_thieu), '') IS NOT NULL THEN s.ghi_chu_thieu END,
            ' | '
        ) AS loser_ghi_chu_thieu
    FROM keepers k
    JOIN inventory_shipments s
      ON s.ngay_di_hang = k.ngay_di_hang
     AND s.dot_so = k.dot_so
     AND LOWER(TRIM(s.ten_ncc)) = k.ten_key
    GROUP BY k.keeper_id, k.ngay_di_hang, k.dot_so, k.ten_key
)
UPDATE inventory_shipments s
SET
    san_pham = (
        SELECT COALESCE(
            (SELECT jsonb_agg(elem) FROM (
                SELECT elem FROM jsonb_array_elements(s.san_pham) elem
                UNION ALL
                SELECT elem FROM jsonb_array_elements(m.extra_san_pham_arrays) arr, jsonb_array_elements(arr) elem
            ) t),
            s.san_pham
        )
    ),
    tong_tien_hd = s.tong_tien_hd + m.extra_tien,
    tong_mon = s.tong_mon + m.extra_mon,
    so_mon_thieu = s.so_mon_thieu + m.extra_thieu,
    anh_hoa_don = (
        SELECT ARRAY(
            SELECT DISTINCT x FROM UNNEST(s.anh_hoa_don || m.loser_images) AS x
            WHERE x IS NOT NULL
        )
    ),
    ghi_chu = CASE
        WHEN NULLIF(TRIM(COALESCE(m.loser_ghi_chu, '')), '') IS NULL THEN s.ghi_chu
        WHEN NULLIF(TRIM(COALESCE(s.ghi_chu, '')), '') IS NULL THEN m.loser_ghi_chu
        ELSE s.ghi_chu || ' | ' || m.loser_ghi_chu
    END,
    ghi_chu_thieu = CASE
        WHEN NULLIF(TRIM(COALESCE(m.loser_ghi_chu_thieu, '')), '') IS NULL THEN s.ghi_chu_thieu
        WHEN NULLIF(TRIM(COALESCE(s.ghi_chu_thieu, '')), '') IS NULL THEN m.loser_ghi_chu_thieu
        ELSE s.ghi_chu_thieu || ' | ' || m.loser_ghi_chu_thieu
    END,
    updated_at = NOW()
FROM merges m
WHERE s.id = m.keeper_id;

-- Delete the losing rows
DELETE FROM inventory_shipments s
USING (
    SELECT s2.id
    FROM inventory_shipments s2
    JOIN (
        SELECT ngay_di_hang, dot_so, LOWER(TRIM(ten_ncc)) AS ten_key, MIN(created_at) AS keeper_ts
        FROM inventory_shipments
        WHERE ten_ncc IS NOT NULL AND TRIM(ten_ncc) <> ''
        GROUP BY ngay_di_hang, dot_so, LOWER(TRIM(ten_ncc))
        HAVING COUNT(*) > 1
    ) g
      ON s2.ngay_di_hang = g.ngay_di_hang
     AND s2.dot_so = g.dot_so
     AND LOWER(TRIM(s2.ten_ncc)) = g.ten_key
     AND s2.created_at > g.keeper_ts
) losers
WHERE s.id = losers.id;

-- Report
DO $$
DECLARE
    r RECORD;
BEGIN
    RAISE NOTICE 'Post-merge state per (date, dot, ten):';
    FOR r IN
        SELECT ngay_di_hang, dot_so, LOWER(TRIM(ten_ncc)) AS ten, COUNT(*) AS n
        FROM inventory_shipments
        WHERE ten_ncc IS NOT NULL AND TRIM(ten_ncc) <> ''
        GROUP BY ngay_di_hang, dot_so, LOWER(TRIM(ten_ncc))
        HAVING COUNT(*) > 1
    LOOP
        RAISE NOTICE 'REMAINING DUP: % / đợt % / % : %', r.ngay_di_hang, r.dot_so, r.ten, r.n;
    END LOOP;
    RAISE NOTICE 'Merge complete.';
END$$;

COMMIT;
