-- Processing Tags table
-- Lưu trạng thái xử lý chốt đơn (Tag Xử Lý) cho từng đơn hàng trong campaign
-- Thay thế hệ thống tag xử lý cũ (đã xóa commit f7df8e0c)

CREATE TABLE IF NOT EXISTS processing_tags (
    id SERIAL PRIMARY KEY,
    campaign_id VARCHAR(100) NOT NULL,
    order_id VARCHAR(255) NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    updated_by VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(campaign_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_ptag_campaign ON processing_tags(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ptag_order ON processing_tags(order_id);
