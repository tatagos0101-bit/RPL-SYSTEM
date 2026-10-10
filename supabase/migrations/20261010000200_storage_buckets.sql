-- Covers are public catalogue artwork; member avatars and government IDs are private.
-- Only FastAPI's server-side secret/service_role key may upload or sign private files.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('rpl-covers', 'rpl-covers', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('rpl-avatars', 'rpl-avatars', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('rpl-ids', 'rpl-ids', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('rpl-imports', 'rpl-imports', false, 10485760, ARRAY['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'application/octet-stream'])
ON CONFLICT (id) DO NOTHING;

-- No browser write/read policies for these buckets are created intentionally.
