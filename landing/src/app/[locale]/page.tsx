import type { Metadata } from "next";

import { Audiences } from "@/components/sections/Audiences";
import { Faq } from "@/components/sections/Faq";
import { FinalCta } from "@/components/sections/FinalCta";
import { Hero } from "@/components/sections/Hero";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Measures } from "@/components/sections/Measures";
import { PatternTeaser } from "@/components/sections/PatternTeaser";
import { ProofBar } from "@/components/sections/ProofBar";
import { Testimonials } from "@/components/sections/Testimonials";
import { StickyCta } from "@/components/layout/StickyCta";
import { getDictionary } from "@/i18n";
import { defaultLocale, isLocale, type Locale } from "@/i18n/config";

type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  const dict = getDictionary(locale);
  return {
    title: { absolute: dict.meta.title },
    description: dict.meta.description,
  };
}

/**
 * Structure de conversion (8 blocs, sans prix) :
 *   promesse + action → faits vérifiables → comment ça marche → pour qui
 *   → les 12 mesures → patron (bientôt) → [avis réels] → questions → action.
 * Une seule action principale, « Prendre mes mesures », répétée à chaque
 * étape ; l'action tailleur est la seconde.
 */
export default async function Home({ params }: Params) {
  const { locale } = await params;
  const active: Locale = isLocale(locale) ? locale : defaultLocale;
  const dict = getDictionary(active);

  return (
    <>
      <Hero locale={active} dict={dict} />
      <ProofBar dict={dict} />
      <HowItWorks dict={dict} />
      <Audiences dict={dict} />
      <Measures dict={dict} />
      <PatternTeaser dict={dict} />
      <Testimonials locale={active} dict={dict} />
      <Faq dict={dict} />
      <FinalCta locale={active} dict={dict} />
      <StickyCta label={dict.sticky.cta} />
    </>
  );
}
