import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session on every request and guards the merchant
 * area. Customers are anonymous and never hit the guard.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  const isMerchantArea = path.startsWith("/merchant") && !path.startsWith("/merchant/login");
  // An anonymous customer is signed in but is not shop staff.
  const isRealUser = user && !user.is_anonymous;

  if (isMerchantArea && !isRealUser) {
    const url = request.nextUrl.clone();
    url.pathname = "/merchant/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (path === "/merchant/login" && isRealUser) {
    const url = request.nextUrl.clone();
    url.pathname = "/merchant";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
