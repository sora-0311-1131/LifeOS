import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * API routes that support Bearer token authentication (NFC / iOS Shortcuts) in addition to cookies.
 */
function isBearerCapableApiPath(pathname: string): boolean {
  return pathname === '/api/study' || pathname.startsWith('/api/study/');
}

/**
 * API routes that handle their own authentication and must return JSON 401/403
 * instead of being redirected to /login by the proxy.
 */
function isSelfAuthenticatedApiPath(pathname: string): boolean {
  return (
    isBearerCapableApiPath(pathname) ||
    pathname === '/api/settings/tokens' ||
    pathname.startsWith('/api/settings/tokens/')
  );
}

export const updateSession = async (request: NextRequest) => {
  const pathname = request.nextUrl.pathname;

  // Skip cookie session refresh for Bearer-authenticated Study API requests (e.g., NFC / iOS Shortcuts)
  if (isBearerCapableApiPath(pathname) && request.headers.has('authorization')) {
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    });
  }

  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    supabaseUrl!,
    supabaseKey!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    },
  );

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protect the dashboard and any other sensitive routes
  if (
    !user &&
    !pathname.startsWith('/login') &&
    !pathname.startsWith('/auth') &&
    !isSelfAuthenticatedApiPath(pathname)
  ) {
    // no user, potentially respond by redirecting the user to the login page
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Redirect users away from login page if they are already logged in
  if (user && request.method === 'GET' && request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
};
