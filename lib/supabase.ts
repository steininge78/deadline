import { createBrowserClient } from '@supabase/ssr';
let client: ReturnType<typeof createBrowserClient> | null = null;
export function sb() {
  if (!client) client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  return client;
}
export const photoUrl = (path: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/photos/${path}`;
