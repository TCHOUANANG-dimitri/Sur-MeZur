import type { Dictionary } from "@/i18n";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Reveal } from "@/components/ui/Reveal";
import type { MeasureKey } from "@/components/visuals/BodyModel";
import { MeasureExplorer } from "@/components/visuals/MeasureExplorer";

/**
 * Les 12 mesures, rangées comme dans l'application, et reliées à la
 * silhouette : chaque mesure touchée s'allume sur le corps. Les lignes se
 * déroulent à l'apparition de la section.
 */
export function Measures({ dict }: { dict: Dictionary }) {
  const m = dict.measures;
  const groups: { title: string; keys: MeasureKey[] }[] = [
    { title: m.groupTop, keys: ["chest", "waist", "neck", "shoulder", "back_length"] },
    { title: m.groupArms, keys: ["biceps", "sleeve_length", "wrist"] },
    { title: m.groupLegs, keys: ["hips", "thigh", "inseam", "ankle"] },
  ];

  return (
    <section className="section-y" id="mesures" aria-labelledby="measures-title">
      <Reveal>
        <MeasureExplorer
          dict={dict}
          groups={groups}
          header={<SectionHeader eyebrow={m.eyebrow} title={<span id="measures-title">{m.title}</span>} subtitle={m.sub} />}
          footer={<p className="mt-6 max-w-xl text-sm leading-relaxed text-mist-500">{m.honest}</p>}
        />
      </Reveal>
    </section>
  );
}
