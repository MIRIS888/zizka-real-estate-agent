import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublicPath =
    pathname.startsWith("/login") || pathname.startsWith("/auth/");

  // On Vercel, request.nextUrl contains the internal localhost URL.
  // Use NEXT_PUBLIC_SITE_URL when available so redirects go to the public domain.
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    ?? `${request.nextUrl.protocol}//${request.nextUrl.host}`;

  if (!user && !isPublicPath) {
    return NextResponse.redirect(new URL("/login", siteUrl));
  }

  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/", siteUrl));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
