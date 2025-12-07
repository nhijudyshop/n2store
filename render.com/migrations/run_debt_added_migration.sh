#!/bin/bash
# =====================================================
# Migration: Add debt_added column to balance_history
# =====================================================

# Database connection
DATABASE_URL="postgresql://n2store_user:iKxWmQEh1PcUSRRJXrlMueaGci1Id6Z0@dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com/n2store_chat?sslmode=require"

echo "🚀 Running migration: Add debt_added column..."

psql "$DATABASE_URL" << 'EOF'
-- Thêm cột debt_added
ALTER TABLE balance_history ADD COLUMN IF NOT EXISTS debt_added BOOLEAN DEFAULT FALSE;

-- Tạo index cho tìm giao dịch chưa xử lý
CREATE INDEX IF NOT EXISTS idx_balance_history_debt_added
ON balance_history(debt_added)
WHERE debt_added = FALSE;

-- Tạo composite index cho tối ưu query
CREATE INDEX IF NOT EXISTS idx_balance_history_debt_processing
ON balance_history(debt_added, transfer_type, content)
WHERE debt_added = FALSE AND transfer_type = 'in';

-- Kiểm tra kết quả
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'balance_history' AND column_name = 'debt_added';
EOF

if [ $? -eq 0 ]; then
    echo "✅ Migration completed successfully!"
else
    echo "❌ Migration failed!"
    exit 1
fi
