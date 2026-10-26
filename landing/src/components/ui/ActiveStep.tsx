"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Récit au défilement : marque comme active (`data-active` sur ce bloc)
 * l'étape `[data-step]` qui passe au milieu de l'écran. Le CSS fait le reste
 * (écran du téléphone, étape en surbrillance). Sans script, la première
 * étape reste affichée.
 */
export function ActiveStep({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || !("IntersectionObserver" in window)) return;
    const steps = root.querySelectorAll<HTMLElement>("[data-step]");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) root.dataset.active = (entry.target as HTMLElement).dataset.step;
        }
      },
      // Une bande fine au milieu de l'écran : une seule étape à la fois.
      { rootMargin: "-45% 0px -45% 0px" },
    );
    steps.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} data-active="1" className={className}>
      {children}
    </div>
  );
}
