-- ScribeFlow private audio bucket.
-- Audio is never public. Browser uploads use short-lived signed TUS tokens.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'meeting-audio',
  'meeting-audio',
  false,
  262144000,
  array[
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/mp4',
    'audio/x-m4a',
    'audio/aac',
    'audio/ogg',
    'audio/webm',
    'video/webm',
    'video/mp4',
    'application/ogg'
  ]
)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  updated_at = now();

-- No anonymous storage policies are created. The backend secret client creates signed
-- upload/download URLs only when the application explicitly allows it.
