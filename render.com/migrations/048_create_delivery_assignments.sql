-- Migration 048: Create delivery_assignments table
-- Khóa cứng phân chia đơn giao hàng theo ngày, đồng bộ giữa các máy
-- Đơn đã chia sẽ KHÔNG bị chia lại khi F5/refresh

CREATE TABLE IF NOT EXISTS delivery_assignments (
    id SERIAL PRIMARY KEY,
    assignment_date DATE NOT NULL,
    order_number VARCHAR(50) NOT NULL,
    group_name VARCHAR(20) NOT NULL CHECK (group_name IN ('tomato', 'nap', 'city', 'shop', 'return')),
    amount_total NUMERIC(15,2) DEFAULT 0,
    cash_on_delivery NUMERIC(15,2) DEFAULT 0,
    carrier_name VARCHAR(100),
    assigned_by VARCHAR(100) DEFAULT 'system',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(assignment_date, order_number)
);

CREATE INDEX IF NOT EXISTS idx_delivery_assignments_date ON delivery_assignments(assignment_date);
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_order ON delivery_assignments(order_number);
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_group ON delivery_assignments(assignment_date, group_name);
