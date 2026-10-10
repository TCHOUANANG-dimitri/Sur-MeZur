import { photos } from "@/data/photos";
import { appPaths } from "@/data/site";
import type { Dictionary } from "@/i18n";
import { AppLink } from "@/components/ui/AppLink";
import { ArrowRight, Check } from "@/components/ui/Icons";
import { Photo } from "@/components/ui/Photo";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal } from "@/components/ui/Reveal";

/**
 * Les deux publics côte à côte, chacun avec son bouton : le visiteur se
 * reconnaît en un coup d'œil et va directement au parcours qui le concerne.
 */
export function Audiences({ dict }: { dict: Dictionary }) {
  const a = dict.audiences;
  const cards = [
    {
      id: "clients",
      label: a.clientsLabel,
      title: a.clientsTitle,
      items: [a.c1, a.c2, a.c3, a.c4],
      cta: a.clientsCta,
      path: appPaths.measure,
      photo: photos.forClients,
      alt: a.clientsAlt,
    },
    {
      id: "tailleurs",
      label: a.tailorsLabel,
      title: a.tailorsTitle,
      items: [a.t1, a.t2, a.t3, a.t4, a.t5],
      cta: a.tailorsCta,
      path: appPaths.tailorSignup,
      photo: photos.forTailors,
      alt: a.tailorsAlt,
    },
  ];

  return (
    <section className="section-y border-t border-violet-950/[0.08] bg-ink-900" aria-labelledby="audiences-title">
      <div className="container-smz">
        <SectionHeader
          align="center"
          eyebrow={a.eyebrow}
          title={<span id="audiences-title">{a.title}</span>}
        />

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          {cards.map((card, index) => (
            <Reveal key={card.id} delay={index * 120}>
              <article id={card.id} className="surface-card group flex h-full scroll-mt-28 flex-col overflow-hidden">
                <Photo src={card.photo} alt={card.alt} ratio="3/2" rounded={false} sizes="(min-width: 1024px) 45vw, 100vw" />
                <div className="flex flex-1 flex-col p-6 sm:p-8">
                  <div className="flex items-center gap-3">
                    <span className="eyebrow">{card.label}</span>
                    <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[0.6875rem] font-semibold text-violet-700">
                      {a.free}
                    </span>
                  </div>
                  <h3 className="mt-3 text-2xl leading-tight text-mist-50 sm:text-3xl">{card.title}</h3>
                  <ul className="mt-5 flex flex-1 flex-col gap-3">
                    {card.items.map((item) => (
                      <li key={item} className="flex items-start gap-3 text-[0.9375rem] text-mist-300">
                        <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-violet-100 text-violet-700">
                          <Check width={12} height={12} />
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                  <AppLink path={card.path} cta={`audience-${card.id}`} className="btn btn-primary mt-7 self-start">
                    {card.cta}
                    <ArrowRight className="btn-arrow" width={16} height={16} />
                  </AppLink>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
