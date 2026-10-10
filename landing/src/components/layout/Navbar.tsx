"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { appPaths } from "@/data/site";
import type { Dictionary } from "@/i18n";
import { localizePath, localizedPath, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { AppLink } from "@/components/ui/AppLink";
import { Logo } from "@/components/ui/Logo";
import { ArrowRight } from "@/components/ui/Icons";
import { LanguageSwitcher } from "./LanguageSwitcher";

const LINKS = [
  { key: "how" as const, hash: "#comment-ca-marche" },
  { key: "clients" as const, hash: "#clients" },
  { key: "tailors" as const, hash: "#tailleurs" },
  { key: "pattern" as const, hash: "#patron" },
  { key: "faq" as const, hash: "#questions" },
];

type NavbarProps = { locale: Locale; dict: Dictionary };

export function Navbar({ locale, dict }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const homeHref = localizedPath(locale, "/");

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-violet-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        {dict.nav.skip}
      </a>

      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-500",
          scrolled || open
            ? "border-b border-violet-950/[0.09] bg-ink-950/70 backdrop-blur-xl"
            : "border-b border-transparent bg-transparent",
        )}
        style={{ height: "var(--nav-h)" }}
      >
        <nav
          className="container-smz flex h-full items-center justify-between gap-6"
          aria-label="Sur-MeZur"
        >
          <Link
            href={homeHref}
            aria-label="Sur-MeZur — Home"
            className="shrink-0 transition-opacity duration-300 hover:opacity-85"
          >
            <Logo size={42} priority />
          </Link>

          <ul className="hidden items-center gap-1 lg:flex">
            {LINKS.map((item) => (
              <li key={item.key}>
                <a
                  href={localizePath(locale, item.hash)}
                  className="relative rounded-full px-4 py-2 text-sm font-medium text-mist-300 transition-colors duration-300 hover:text-mist-50 after:absolute after:inset-x-4 after:-bottom-0.5 after:h-px after:origin-left after:scale-x-0 after:bg-gradient-to-r after:from-violet-800 after:to-violet-500 after:transition-transform after:duration-500 after:content-[''] hover:after:scale-x-100"
                >
                  {dict.nav[item.key]}
                </a>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-3">
            <LanguageSwitcher
              locale={locale}
              label={dict.nav.lang}
              className="hidden sm:flex"
            />

            <AppLink
              path={appPaths.login}
              cta="nav-login"
              className="hidden text-sm font-medium text-mist-300 transition-colors hover:text-violet-700 xl:inline"
            >
              {dict.nav.login}
            </AppLink>

            <AppLink path={appPaths.measure} cta="nav" className="btn btn-primary btn-sm hidden md:inline-flex">
              {dict.nav.cta}
              <ArrowRight className="btn-arrow" width={14} height={14} />
            </AppLink>

            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              aria-controls="smz-mobile-menu"
              aria-label={open ? dict.nav.closeMenu : dict.nav.openMenu}
              className="relative grid h-10 w-10 place-items-center rounded-full border border-violet-950/14 text-mist-50 transition-colors duration-300 hover:border-violet-500/60 lg:hidden"
            >
              <span className="sr-only">{open ? dict.nav.closeMenu : dict.nav.openMenu}</span>
              <span aria-hidden className="relative block h-3 w-4">
                <span
                  className={cn(
                    "absolute left-0 h-px w-full bg-current transition-all duration-400",
                    open ? "top-1.5 rotate-45" : "top-0",
                  )}
                />
                <span
                  className={cn(
                    "absolute left-0 top-1.5 h-px w-full bg-current transition-opacity duration-300",
                    open && "opacity-0",
                  )}
                />
                <span
                  className={cn(
                    "absolute left-0 h-px w-full bg-current transition-all duration-400",
                    open ? "top-1.5 -rotate-45" : "top-3",
                  )}
                />
              </span>
            </button>
          </div>
        </nav>
      </header>

      <div
        id="smz-mobile-menu"
        hidden={!open}
        className="fixed inset-0 z-40 lg:hidden"
        aria-hidden={!open}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={() => setOpen(false)}
          className="absolute inset-0 h-full w-full cursor-default bg-ink-950/80 backdrop-blur-md"
        />
        <div className="container-smz relative flex h-full flex-col justify-between pb-10 pt-[calc(var(--nav-h)+2rem)]">
          <ul className="flex flex-col gap-1">
            {LINKS.map((item) => (
              <li key={item.key}>
                <a
                  href={localizePath(locale, item.hash)}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between border-b border-violet-950/[0.08] py-5 font-display text-3xl text-mist-50 transition-colors duration-300 hover:text-violet-600"
                >
                  {dict.nav[item.key]}
                  <ArrowRight className="text-mist-500" width={20} height={20} />
                </a>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-4">
            <AppLink path={appPaths.measure} cta="menu" className="btn btn-primary w-full">
              {dict.nav.cta}
              <ArrowRight className="btn-arrow" />
            </AppLink>
            <div className="grid grid-cols-2 gap-3">
              <AppLink path={appPaths.login} cta="menu-login" className="btn btn-ghost btn-sm">
                {dict.nav.login}
              </AppLink>
              <Link href={localizedPath(locale, "/telecharger")} onClick={() => setOpen(false)} className="btn btn-ghost btn-sm">
                {dict.nav.download}
              </Link>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-[0.18em] text-mist-500">
                {dict.nav.lang}
              </span>
              <LanguageSwitcher locale={locale} label={dict.nav.lang} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}