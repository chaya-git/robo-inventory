-- E-Commerce Module migration
-- Adds a single table that records Amazon/Flipkart stock-received, sold,
-- return, and adjustment transactions. Reuses the existing products table
-- (product_id/SKU) instead of duplicating product data. Safe to re-run.
--
--   psql "$DATABASE_URL" -f backend/migrations/20260820_ecommerce_module.sql

CREATE TABLE IF NOT EXISTS ecommerce_transactions (
  transaction_id SERIAL PRIMARY KEY,
  platform VARCHAR(20) NOT NULL CHECK (platform IN ('Amazon', 'Flipkart')),
  transaction_type VARCHAR(20) NOT NULL CHECK (
    transaction_type IN ('Stock Received', 'Sold', 'Return', 'Adjustment')
  ),
  product_id INTEGER NOT NULL REFERENCES products(product_id),
  sku VARCHAR(100) NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  adjustment_direction VARCHAR(10) CHECK (adjustment_direction IN ('increase', 'decrease')),
  unit_price NUMERIC(12,2) DEFAULT 0,
  total_amount NUMERIC(14,2) DEFAULT 0,
  reference_number VARCHAR(100),
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by_email VARCHAR(255),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_ecommerce_tx_platform ON ecommerce_transactions (platform);
CREATE INDEX IF NOT EXISTS idx_ecommerce_tx_type ON ecommerce_transactions (transaction_type);
CREATE INDEX IF NOT EXISTS idx_ecommerce_tx_product ON ecommerce_transactions (product_id);
CREATE INDEX IF NOT EXISTS idx_ecommerce_tx_date ON ecommerce_transactions (transaction_date);
