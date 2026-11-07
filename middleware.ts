import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;
  // Offentlige sider: ikke rør innloggings-cookies her (ellers slettes PKCE-nøkkelen midt i Google-innloggingen)
  const open = p.startsWith('/login') || p.startsWith('/auth') || p.startsWith('/leie') || p.startsWith('/api/public') || p.startsWith('/personvern');
  if (open) return NextResponse.next({ request: req });
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: list => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      }
    }
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const url = req.nextUrl.clone(); url.pathname = '/login'; url.search = p === '/' ? '' : `?next=${encodeURIComponent(p)}`;
    return NextResponse.redirect(url);
  }
  return res;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)'] };
