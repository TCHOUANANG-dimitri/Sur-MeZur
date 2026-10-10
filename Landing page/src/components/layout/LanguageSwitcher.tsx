"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { locales, switchLocalePath, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

type Props = {
  locale: Locale;
  label: string;
  className?: string;
};

export function LanguageSwitcher({ locale, label, className }: Props) {
  const pathname = usePathname() || "/";

  return (
    <div
      className={cn("flex items-center gap-1 font-semibold", className)}
      role="group"
      aria-label={label}
    >
      {locales.map((code, index) => {
        const active = code === locale;
        return (
          <span key={code} className="flex items-center gap-1">
            {index > 0 ? (
              <span aria-hidden className="text-mist-500 opacity-70">
                |
              </span>
            ) : null}
            <Link
              href={switchLocalePath(pathname, code)}
              hrefLang={code}
              aria-current={active ? "true" : undefined}
              className={cn(
                "px-1 py-0.5 text-xs uppercase tracking-[0.06em] transition-colors duration-300",
                active ? "text-violet-500" : "text-mist-500 hover:text-mist-200",
              )}
            >
              {code}
            </Link>
          </span>
        );
      })}
    </div>
  );
}