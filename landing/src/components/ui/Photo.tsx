import Image, { type StaticImageData } from "next/image";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PhotoProps = {
  src: StaticImageData;
  /** Describe what is happening, not what the file is. Empty only if decorative. */
  alt: string;
  /** Locks the frame so nothing shifts while the image loads. */
  ratio?: "3/2" | "4/5" | "21/9" | "1/1";
  sizes: string;
  priority?: boolean;
  /** Blur-up is worth it on the large ones, wasted bytes on the small ones. */
  blur?: boolean;
  className?: string;
  /** Rendered above the image — a step number, a caption. */
  overlay?: ReactNode;
  rounded?: boolean;
};

const ratioClass = {
  "3/2": "aspect-[3/2]",
  "4/5": "aspect-[4/5]",
  "21/9": "aspect-[21/9]",
  "1/1": "aspect-square",
} as const;

/**
 * Every photograph on the site goes through here, so they share one frame:
 * fixed aspect ratio, a hairline in the brand indigo, and a slow scale on
 * hover when the parent is a `group`.
 */
export function Photo({
  src,
  alt,
  ratio = "4/5",
  sizes,
  priority,
  blur = false,
  className,
  overlay,
  rounded = true,
}: PhotoProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-ink-850",
        rounded && "rounded-[var(--radius-card)]",
        ratioClass[ratio],
        className,
      )}
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        placeholder={blur ? "blur" : undefined}
        className="object-cover transition-transform duration-[900ms] ease-[var(--ease-smz)] group-hover:scale-[1.03]"
      />
      {/* Keeps the white page and the photograph from meeting on a hard edge. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 ring-1 ring-inset ring-violet-950/[0.08]",
          rounded && "rounded-[var(--radius-card)]",
        )}
      />
      {overlay}
    </div>
  );
}
