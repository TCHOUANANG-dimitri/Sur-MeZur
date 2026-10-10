import type { Dictionary } from "@/i18n";
import { Reveal } from "@/components/ui/Reveal";

/**
 * Quatre faits vérifiables, juste sous le premier écran. Aucun chiffre
 * d'utilisateurs ni témoignage tant qu'ils ne sont pas réels : la preuve
 * sociale viendra de `Testimonials` quand des avis authentiques existeront.
 */
export function ProofBar({ dict }: { dict: Dictionary }) {
  const items = [
    { t: dict.proof.p1t, b: dict.proof.p1b },
    { t: dict.proof.p2t, b: dict.proof.p2b },
    { t: dict.proof.p3t, b: dict.proof.p3b },
    { t: dict.proof.p4t, b: dict.proof.p4b },
  ];

  return (
    <section aria-label="Sur-MeZur" className="border-y border-violet-950/[0.08] bg-ink-900 pt-14 pb-8 sm:pt-16">
      <ul className="container-smz grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4">
        {items.map((item, index) => (
          <Reveal as="li" key={item.t} delay={index * 70} className="flex flex-col gap-1">
            <span className="font-display text-2xl text-mist-50 sm:text-3xl">{item.t}</span>
            <span className="text-sm leading-snug text-mist-400">{item.b}</span>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
