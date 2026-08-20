// src/lib/uploadCandidatePhoto.ts
import imageCompression from 'browser-image-compression';
import { createClient } from '@/lib/supabase/client';

const BUCKET = 'assets';
const PHOTO_PREFIX = 'photos/';
const MAX_FILE_SIZE_MB = 5;

export async function uploadCandidatePhoto(
  file: File,
  candidateId: string | undefined
): Promise<string> {
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    throw new Error(`Photo must be under ${MAX_FILE_SIZE_MB} MB`);
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('File must be an image');
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Must be signed in to upload photos');

  const compressed = await imageCompression(file, {
    maxWidthOrHeight: 400,
    initialQuality: 0.8,
    fileType: 'image/jpeg',
    useWebWorker: true,
  });

  const fileName = candidateId
    ? `${PHOTO_PREFIX}${candidateId}-${Date.now()}.jpg`
    : `${PHOTO_PREFIX}${crypto.randomUUID()}.jpg`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, compressed, { contentType: 'image/jpeg' });

  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(fileName);

  if (candidateId) {
    try {
      const { data: existing } = await supabase.storage
        .from(BUCKET)
        .list(PHOTO_PREFIX.replace(/\/$/, ''), { search: candidateId });
      const stalePaths = (existing ?? [])
        .map(f => `${PHOTO_PREFIX}${f.name}`)
        .filter(p => p !== fileName);
      if (stalePaths.length > 0) {
        await supabase.storage.from(BUCKET).remove(stalePaths);
      }
    } catch (cleanupErr) {
      console.warn('[uploadCandidatePhoto] cleanup of old files failed:', cleanupErr);
    }
  }

  return publicUrl;
}
