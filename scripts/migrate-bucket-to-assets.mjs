import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const OLD_BUCKET = 'candidate-photos'
const NEW_BUCKET = 'assets'
const NEW_PREFIX = 'photos/'
const DRY_RUN = process.argv.includes('--dry-run')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

console.log(`Migrating: ${OLD_BUCKET}/ → ${NEW_BUCKET}/${NEW_PREFIX}`)
console.log(`Dry run: ${DRY_RUN}\n`)

// List all files in old bucket (paginated)
let allFiles = []
let offset = 0
const pageSize = 100
while (true) {
  const { data, error } = await supabase.storage
    .from(OLD_BUCKET)
    .list('', { limit: pageSize, offset })
  if (error) { console.error('List error:', error); process.exit(1) }
  if (!data || data.length === 0) break
  allFiles.push(...data)
  if (data.length < pageSize) break
  offset += pageSize
}

console.log(`Found ${allFiles.length} files\n`)

let copied = 0, failed = 0, skipped = 0

for (const file of allFiles) {
  if (file.name === '.emptyFolderPlaceholder') { skipped++; continue }

  const newPath = `${NEW_PREFIX}${file.name}`

  if (DRY_RUN) {
    console.log(`  [dry-run] ${file.name}  →  ${newPath}`)
    copied++
    continue
  }

  const { data: blob, error: dlErr } = await supabase.storage
    .from(OLD_BUCKET)
    .download(file.name)
  if (dlErr) {
    console.error(`  ✗ ${file.name} — download failed: ${dlErr.message}`)
    failed++
    continue
  }

  const { error: upErr } = await supabase.storage
    .from(NEW_BUCKET)
    .upload(newPath, blob, {
      contentType: file.metadata?.mimetype || 'image/jpeg',
      upsert: true,
    })
  if (upErr) {
    console.error(`  ✗ ${file.name} — upload failed: ${upErr.message}`)
    failed++
    continue
  }

  console.log(`  ✓ ${file.name}  →  ${newPath}`)
  copied++
}

console.log(`\nDone. Copied: ${copied}, Failed: ${failed}, Skipped: ${skipped}`)