import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Reveal } from "./Reveal";

type SectionHeaderProps = {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: "left" | "center";
  width?: "narrow" | "wide";
  className?: string;
};

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = "left",
  width = "narrow",
  className,
}: SectionHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-5",
        align === "center" && "items-center text-center",
        className,
      )}
    >
      {eyebrow ? (
        <Reveal as="p" className="eyebrow">
          {eyebrow}
        </Reveal>
      ) : null}

      <Reveal delay={eyebrow ? 80 : 0}>
        <h2
          className={cn(
            "text-gradient-mist text-4xl leading-[1.06] sm:text-5xl lg:text-6xl",
            width === "narrow" ? "max-w-3xl" : "max-w-5xl",
            align === "center" && "mx-auto",
          )}
        >
          {title}
        </h2>
      </Reveal>

      {subtitle ? (
        <Reveal delay={160}>
          <p
            className={cn(
              "max-w-2xl text-base leading-relaxed text-mist-400 sm:text-lg",
              align === "center" && "mx-auto",
            )}
          >
            {subtitle}
          </p>
        </Reveal>
      ) : null}
    </header>
  );
}