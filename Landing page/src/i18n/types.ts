import type en from "./dictionaries/en";

/**
 * Widens the literal types produced by `as const` back to string / number
 * while keeping the exact key shape. Both locale dictionaries share this shape.
 */
type Loose<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends readonly (infer U)[]
        ? Loose<U>[]
        : T extends object
          ? { [K in keyof T]: Loose<T[K]> }
          : T;

export type Dictionary = Loose<typeof en>;