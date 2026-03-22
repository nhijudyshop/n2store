-- Migration 034: Create users and permission management tables
-- Replaces Firebase Firestore: users, permission_templates, settings
-- Date: 2026-03-21

-- =====================================================
-- Table 1: app_users
-- =====================================================
CREATE TABLE IF NOT EXISTS app_users (
    username VARCHAR(100) PRIMARY KEY,
    display_name VARCHAR(255) NOT NULL,
    identifier VARCHAR(255),
    password_hash TEXT NOT NULL,
    salt VARCHAR(255),
    hash_algorithm VARCHAR(20) DEFAULT 'pbkdf2',
    role_template VARCHAR(100) DEFAULT 'custom',
    is_admin BOOLEAN DEFAULT FALSE,
    detailed_permissions JSONB DEFAULT '{}',
    user_id VARCHAR(255),
    user_id_created_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role_template);
CREATE INDEX IF NOT EXISTS idx_app_users_admin ON app_users(is_admin);

-- =====================================================
-- Table 2: permission_templates
-- =====================================================
CREATE TABLE IF NOT EXISTS permission_templates (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    icon VARCHAR(50) DEFAULT 'sliders',
    color VARCHAR(20) DEFAULT '#6366f1',
    description TEXT,
    detailed_permissions JSONB DEFAULT '{}',
    is_system_default BOOLEAN DEFAULT FALSE,
    permissions_version INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(100)
);

-- =====================================================
-- Table 3: app_settings (generic key-value)
-- =====================================================
CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(100)
);
