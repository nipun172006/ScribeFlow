-- Align ScribeFlow's private audio bucket with the conservative application
-- upload limit used after cloud storage rejected larger recordings.
--
-- This remains a private, backend-signed upload bucket. No anonymous storage
-- policies are created here.

update storage.buckets
set
  file_size_limit = 52428800,
  updated_at = now()
where id = 'meeting-audio';
