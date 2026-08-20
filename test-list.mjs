// test-list.mjs (put in project root, delete after)
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY  // ANON key, not service role
)

const { data, error } = await supabase.storage
  .from('candidate-photos')
  .list()

console.log('Error:', error)
console.log('File count:', data?.length ?? 0)
console.log('First few:', data?.slice(0, 3))