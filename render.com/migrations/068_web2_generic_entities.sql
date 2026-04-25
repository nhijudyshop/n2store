-- =====================================================
-- 068 — Web 2.0 generic entity table (universal CRUD)
-- =====================================================
-- For each TPOS page being cloned (productcategory, productuom, partner-customer,
-- accountjournal, etc.), we create a row in `web2_entities` registering the
-- entity, then store records in `web2_records` keyed by (entity_slug, id).
--
-- This avoids creating 87 separate tables. Schema-driven CRUD via JSONB `data`.
--
-- Auto-applied by routes/web2-generic.js on first request.

CREATE TABLE IF NOT EXISTS web2_entities (
    slug        VARCHAR(60)  PRIMARY KEY,
    label       VARCHAR(100) NOT NULL,
    schema      JSONB NOT NULL DEFAULT '{}'::jsonb,   -- { fields: [{key,label,type,required}], display: [...] }
    created_at  BIGINT NOT NULL,
    updated_at  BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS web2_records (
    id            BIGSERIAL PRIMARY KEY,
    entity_slug   VARCHAR(60) NOT NULL REFERENCES web2_entities(slug) ON DELETE CASCADE,
    code          VARCHAR(100),                         -- user-facing code (optional; unique per entity)
    name          VARCHAR(255),                         -- display name (denormalized for search/sort)
    data          JSONB NOT NULL DEFAULT '{}'::jsonb,   -- all other fields
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_by    VARCHAR(100),
    created_at    BIGINT NOT NULL,
    updated_at    BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_web2_records_entity   ON web2_records(entity_slug);
CREATE INDEX IF NOT EXISTS idx_web2_records_name     ON web2_records(name);
CREATE INDEX IF NOT EXISTS idx_web2_records_code     ON web2_records(code);
CREATE INDEX IF NOT EXISTS idx_web2_records_active   ON web2_records(is_active);
CREATE INDEX IF NOT EXISTS idx_web2_records_created  ON web2_records(created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_web2_records_entity_code
    ON web2_records(entity_slug, code) WHERE code IS NOT NULL;
