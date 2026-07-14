CREATE TABLE IF NOT EXISTS catalog_products (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  item_group_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  brand TEXT,
  category TEXT,
  color TEXT,
  gtin TEXT,
  mpn TEXT,
  product_url TEXT,
  image_url TEXT,
  search_document TEXT NOT NULL,
  search_vector TSVECTOR NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS catalog_products_active_idx ON catalog_products (active);
CREATE INDEX IF NOT EXISTS catalog_products_source_sku_idx ON catalog_products (source, sku_id);
CREATE INDEX IF NOT EXISTS catalog_products_gtin_idx ON catalog_products (gtin) WHERE gtin IS NOT NULL;
CREATE INDEX IF NOT EXISTS catalog_products_filters_idx ON catalog_products (category, brand, color) WHERE active;
CREATE INDEX IF NOT EXISTS catalog_products_search_idx ON catalog_products USING GIN (search_vector);

CREATE TABLE IF NOT EXISTS sync_runs (
  id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL,
  records_imported INTEGER NOT NULL DEFAULT 0,
  detail TEXT
);
