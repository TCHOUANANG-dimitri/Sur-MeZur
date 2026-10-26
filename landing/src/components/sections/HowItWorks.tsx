import { appPaths } from "@/data/site";
import type { Dictionary } from "@/i18n";
import { ActiveStep } from "@/components/ui/ActiveStep";
import { AppLink } from "@/components/ui/AppLink";
import { ArrowRight } from "@/components/ui/Icons";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal } from "@/components/ui/Reveal";
import { StepScreen } from "@/components/visuals/StepScreen";

/**
 * Trois étapes, racontées avec l'écran de l'application.
 *
 * Écran large : le téléphone reste fixe pendant que les étapes défilent à
 * côté, et son écran suit l'étape au milieu de la page (ActiveStep + CSS
 * « STEP STORY » de globals.css). Téléphone : les étapes défilent à
 * l'horizontale, chacune avec son écran, pour ne pas allonger la page.
 */
export function HowItWorks({ dict }: { dict: Dictionary }) {
  const steps = [
    { n: 1, title: dict.how.s1t, body: dict.how.s1b },
    { n: 2, title: dict.how.s2t, body: dict.how.s2b },
    { n: 3, title: dict.how.s3t, body: dict.how.s3b },
  ] as const;

  return (
    <section className="section-y" id="comment-ca-marche" aria-labelledby="how-title">
      <div className="container-smz">
        <SectionHeader
          align="center"
          eyebrow={dict.how.eyebrow}
          title={<span id="how-title">{dict.how.title}</span>}
        />

        <ActiveStep className="step-story mt-12 md:mt-6 md:grid md:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] md:gap-12 lg:gap-20">
          {/* Téléphone fixe (écran large seulement) */}
          <div aria-hidden className="hidden md:block">
            <div className="sticky top-[max(calc(var(--nav-h)+1.5rem),calc(50vh-19rem))] mx-auto w-[17rem] lg:w-[18.5rem]">
              <div className="relative aspect-[9/18.5] overflow-hidden rounded-[2.4rem] border-[9px] border-mist-50 bg-[#F6F2FC] shadow-[var(--shadow-lift)] ring-1 ring-violet-950/10">
                <span className="absolute left-1/2 top-2 z-20 h-4 w-20 -translate-x-1/2 rounded-full bg-mist-50" />
                {steps.map((step) => (
                  <div key={step.n} className="ss-screen absolute inset-0" data-screen={step.n}>
                    <StepScreen step={step.n} dict={dict} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <ol className="-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-2 [scrollbar-width:none] md:mx-0 md:flex-col md:gap-0 md:overflow-visible md:px-0">
            {steps.map((step, index) => (
              <Reveal
                as="li"
                key={step.n}
                delay={index * 110}
                className="w-[78%] flex-none snap-center sm:w-[60%] md:flex md:min-h-[70vh] md:w-auto md:items-center"
              >
                <article data-step={step.n} className="ss-step flex h-full flex-col overflow-hidden max-md:surface-card">
                  {/* Écran de l'étape, dans la carte (téléphone seulement) */}
                  <div className="relative aspect-[3/4] md:hidden">
                    <StepScreen step={step.n} dict={dict} compact />
                  </div>
                  <div className="flex flex-col gap-2 p-6 md:p-0">
                    <span className="ss-num font-display text-lg font-semibold text-violet-700 md:text-[4.5rem] md:leading-none">
                      {step.n}
                    </span>
                    <h3 className="text-xl text-mist-50 md:mt-3 md:text-4xl">{step.title}</h3>
                    <p className="text-[0.9375rem] leading-relaxed text-mist-400 md:mt-2 md:max-w-md md:text-lg">{step.body}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </ol>
        </ActiveStep>

        <Reveal className="mt-10 flex flex-col items-center gap-3 text-center md:mt-4">
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
