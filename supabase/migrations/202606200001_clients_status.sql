-- Add status column to clients table.
-- Was missing, causing query_client_metrics groupBy='status' to hit schemaError path.
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Backfill demo status values based on creation date
UPDATE public.clients
SET status = CASE
  WHEN created_at < '2025-10-01' THEN 'inactive'
  WHEN created_at < '2026-01-01' THEN 'active'
  WHEN created_at < '2026-02-15' THEN 'new'
  ELSE 'active'
END
WHERE status = 'active';
