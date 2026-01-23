-- =====================================================
-- Migration: 024_admin_settings_table.sql
-- Purpose: Tạo bảng admin_settings để lưu các cài đặt hệ thống
-- Created: 2026-01-23
-- =====================================================

-- Tạo bảng admin_settings để lưu các cài đặt hệ thống
CREATE TABLE IF NOT EXISTS admin_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    data_type VARCHAR(20) NOT NULL DEFAULT 'string',
    description TEXT,
    updated_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default setting: auto_approve_enabled = FALSE (tắt trong giai đoạn test)
-- Khi FALSE: Tất cả giao dịch (kể cả auto-match) cần kế toán duyệt
-- Khi TRUE: Giao dịch auto-match tự động cộng ví (behavior cũ)
INSERT INTO admin_settings (setting_key, setting_value, data_type, description)
VALUES (
    'auto_approve_enabled',
    'false',
    'boolean',
    'Khi TRUE: Giao dịch auto-match (QR, SĐT, single match) tự động cộng ví. Khi FALSE: Tất cả giao dịch cần kế toán duyệt trước khi cộng ví.'
) ON CONFLICT (setting_key) DO NOTHING;

-- Create index for fast lookup
CREATE INDEX IF NOT EXISTS idx_admin_settings_key ON admin_settings(setting_key);

-- Comment on table
COMMENT ON TABLE admin_settings IS 'Bảng lưu các cài đặt hệ thống cho admin, có thể thay đổi runtime';
COMMENT ON COLUMN admin_settings.setting_key IS 'Tên setting (unique)';
COMMENT ON COLUMN admin_settings.setting_value IS 'Giá trị dạng text, sẽ được parse theo data_type';
COMMENT ON COLUMN admin_settings.data_type IS 'Loại dữ liệu: string, boolean, number, json';
COMMENT ON COLUMN admin_settings.updated_by IS 'Email/username của người thay đổi cuối';
