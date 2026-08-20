import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function ExportLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.app_metadata?.is_admin !== true) {
    redirect('/board');
  }
  return <>{children}</>;
}
