import Image from "next/image";

import { cn } from "@/lib/utils";

const MARK = { src: "/brand/mark.png", w: 720, h: 917 };
const WORDMARK = { src: "/brand/wordmark.png", w: 940, h: 176 };
const LOCKUP = { src: "/brand/lockup.png", w: 940, h: 1191 };

type LogoProps = {
  /**
   * `horizontal` — mark beside the wordmark (navbar).
   * `lockup`     — the full stacked logo, exactly as drawn (footer, hero).
   * `mark`       — the mannequin and ribbon alone.
   * `wordmark`   — the typeset name alone.
   */
  variant?: "horizontal" | "lockup" | "mark" | "wordmark";
  /** Rendered height in pixels of the leading element; the rest scales from it. */
  size?: number;
  className?: string;
  priority?: boolean;
};

/**
 * The source logo already ships on a transparent ground and is drawn for a
 * light page, so it is placed directly — no recolouring, no container. These
 * files are alpha-trimmed crops of that single artwork, nothing more.
 */
export function Logo({ variant = "horizontal", size = 40, className, priority }: LogoProps) {
  if (variant === "lockup") {
    const width = Math.round((size * LOCKUP.w) / LOCKUP.h);
    return (
      <Image
        src={LOCKUP.src}
        alt="Sur-MeZur"
        width={width}
        height={size}
        priority={priority}
        className={cn("select-none", className)}
        style={{ height: size, width }}
      />
    );
  }

  if (variant === "mark") {
    const width = Math.round((size * MARK.w) / MARK.h);
    return (
      <Image
        src={MARK.src}
        alt="Sur-MeZur"
        width={width}
        height={size}
        priority={priority}
        className={cn("select-none", className)}
        style={{ height: size, width }}
      />
    );
  }

  if (variant === "wordmark") {
    const width = Math.round((size * WORDMARK.w) / WORDMARK.h);
    return (
      <Image
        src={WORDMARK.src}
        alt="Sur-MeZur"
        width={width}
        height={size}
        priority={priority}
        className={cn("select-none", className)}
        style={{ height: size, width }}
      />
    );
  }

  const markWidth = Math.round((size * MARK.w) / MARK.h);
  const wordHeight = Math.round(size * 0.46);
  const wordWidth = Math.round((wordHeight * WORDMARK.w) / WORDMARK.h);

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Image
        src={MARK.src}
        alt=""
        aria-hidden
        width={markWidth}
        height={size}
        priority={priority}
        className="select-none"
        style={{ height: size, width: markWidth }}
      />
      <Image
        src={WORDMARK.src}
        alt="Sur-MeZur"
        width={wordWidth}
        height={wordHeight}
        priority={priority}
        className="select-none"
        style={{ height: wordHeight, width: wordWidth }}
      />
    </span>
  );
}
