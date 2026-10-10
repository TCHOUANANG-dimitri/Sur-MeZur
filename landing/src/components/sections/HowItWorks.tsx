import { photos } from "@/data/photos";
import { appPaths } from "@/data/site";
import type { Dictionary } from "@/i18n";
import { AppLink } from "@/components/ui/AppLink";
import { ArrowRight } from "@/components/ui/Icons";
import { Photo } from "@/components/ui/Photo";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal } from "@/components/ui/Reveal";

export function HowItWorks({ dict }: { dict: Dictionary }) {
  const steps = [
    { index: "1", title: dict.how.s1t, body: dict.how.s1b, photo: photos.stepFront, alt: dict.how.alt1 },
    { index: "2", title: dict.how.s2t, body: dict.how.s2b, photo: photos.stepProfile, alt: dict.how.alt2 },
    { index: "3", title: dict.how.s3t, body: dict.how.s3b, photo: photos.stepResult, alt: dict.how.alt3 },
  ];

  return (
    <section className="section-y" id="comment-ca-marche" aria-labelledby="how-title">
      <div className="container-smz">
        <SectionHeader
          align="center"
          eyebrow={dict.how.eyebrow}
          title={<span id="how-title">{dict.how.title}</span>}
        />

        {/* Au téléphone, les étapes défilent à l'horizontale : trois grandes
            photos empilées pousseraient le bouton trop loin. */}
        <ol className="-mx-6 mt-12 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:gap-5 md:overflow-visible md:px-0">
          {steps.map((step, index) => (
            <Reveal as="li" key={step.index} delay={index * 110} className="w-[78%] flex-none snap-center sm:w-[60%] md:w-auto">
              <article className="surface-card group flex h-full flex-col overflow-hidden">
                <Photo
                  src={step.photo}
                  alt={step.alt}
                  ratio="4/5"
                  rounded={false}
                  sizes="(min-width: 768px) 30vw, 78vw"
                  overlay={
                    <span
                      aria-hidden
                      className="absolute left-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/95 font-display text-lg font-semibold text-violet-700"
                    >
                      {step.index}
                    </span>
                  }
                />
                <div className="flex flex-col gap-2 p-6">
                  <h3 className="text-xl text-mist-50">{step.title}</h3>
                  <p className="text-[0.9375rem] leading-relaxed text-mist-400">{step.body}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </ol>

        <Reveal className="mt-10 flex flex-col items-center gap-3 text-center">
          <AppLink path={appPaths.measure} cta="how" className="btn btn-primary">
            {dict.how.cta}
            <ArrowRight className="btn-arrow" width={16} height={16} />
          </AppLink>
          <p className="text-sm text-mist-500">{dict.how.ctaNote}</p>
        </Reveal>
      </div>
    </section>
  );
}
