import { NextResponse, type NextRequest } from "next/server";

import { siteConfig } from "@/data/site";
import { defaultLocale, isLocale, locales } from "@/i18n/config";

const LOCALE_COOKIE = "smz_locale";

/** Picks the best locale from Accept-Language, falling back to French. */
function negotiate(header: string | null): string {
  if (!header) return defaultLocale;

  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return { tag: tag!.trim().toLowerCase(), q: q ? Number(q.split("=")[1]) || 0 : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    const base = tag.split("-")[0]!;
    if ((locales as readonly string[]).includes(base)) return base;
  }
  return defaultLocale;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Une seule adresse pour le site : www.sur-mezur.com renvoie définitivement
  // vers sur-mezur.com (sinon Google voit deux sites en double).
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").toLowerCase();
  if (host.startsWith("www.")) {
    return NextResponse.redirect(`${siteConfig.url}${pathname}${search}`, 308);
  }

  const first = pathname.split("/")[1];
  if (isLocale(first)) {
    // Remember the visitor's choice so the next bare-root visit lands right.
    const response = NextResponse.next();
    if (request.cookies.get(LOCALE_COOKIE)?.value !== first) {
      response.cookies.set(LOCALE_COOKIE, first, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
    }
    return response;
  }

  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale)
    ? cookieLocale
    : negotiate(request.headers.get("accept-language"));

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  url.search = search;

  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *  - /_next  (build output)
     *  - any path with a file extension (static assets like /brand/*.png)
     */
    "/((?!_next|.*\\..*).*)",
  ],
};