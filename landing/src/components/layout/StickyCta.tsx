"use client";

import { useEffect, useState } from "react";

import { appHref, appPaths } from "@/data/site";
import { ArrowRight } from "@/components/ui/Icons";
import { cn } from "@/lib/utils";

/**
 * Bouton « Prendre mes mesures » fixé en bas de l'écran, au téléphone
 * seulement. Il apparaît une fois le bouton du haut sorti de l'écran, et
 * disparaît quand l'appel final est visible : l'action reste toujours à un
 * pouce, sans jamais doubler un bouton déjà affiché.
 */
export function StickyCta({ label }: { label: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hero = document.getElementById("hero-cta");
    const final = document.getElementById("final-cta");
    if (!hero || !("IntersectionObserver" in window)) return;

    const seen = new Map<Element, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) seen.set(entry.target, entry.isIntersecting);
        const heroVisible = seen.get(hero) ?? true;
        const finalVisible = final ? (seen.get(final) ?? false) : false;
        setVisible(!heroVisible && !finalVisible);
      },
      { threshold: 0 },
    );
    io.observe(hero);
    if (final) io.observe(final);
    return () => io.disconnect();
  }, []);

  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-violet-950/10 bg-white/90 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur-md transition-transform duration-500 ease-[var(--ease-smz)] md:hidden",
        visible ? "translate-y-0" : "translate-y-full",
      )}
    >
      <a
        href={appHref(appPaths.measure)}
        data-app-link="sticky"
        tabIndex={visible ? 0 : -1}
        className="btn btn-primary w-full"
      >
        {label}
        <ArrowRight className="btn-arrow" width={16} height={16} />
      </a>
    </div>
  );
}
