"use client";

/**
 * Champs de formulaire repris de l'application mobile, a l'identique :
 * `PhoneField` (indicatif pays + numero local) et `PasswordInput` (bascule
 * afficher/masquer). Voir mobile/src/components/PhoneField.tsx et Misc.tsx.
 *
 * Une difference assumee : le mobile affiche un drapeau emoji devant
 * l'indicatif. Ici l'indicatif est precede du code pays sur deux lettres. Les
 * drapeaux emoji ne se rendent pas du tout sur Windows (ou ils apparaissent
 * en deux lettres grises), ce qui aurait casse la coherence entre appareils —
 * exactement ce qu'on cherche a eviter en remplacant les emoji par des SVG.
 */

import { useEffect, useRef, useState } from "react";
import { COUNTRIES, splitPhone, type Country } from "@/lib/countries";
import { IconChevronDown, IconEye, IconEyeOff } from "./icons";

/**
 * Ne garde que la partie locale d'un numero colle dans le champ.
 *
 * Quand la personne colle un numero complet (`+237 6 XX XX XX XX`,
 * `00237…`, `237…`) ou avec un 0 initial dans le champ local, l'indicatif
 * deja affiche devant ne doit pas etre duplique : sans cela on produisait
 * `+237237…`. On retire donc l'indicatif (avec ou sans `00`) puis les zeros
 * de tete. Le serveur normalise aussi de son cote (Agent A).
 */
export function stripToLocal(raw: string, dial: string): string {
  let digits = raw.replace(/[^0-9]/g, "");
  const dialDigits = dial.replace(/[^0-9]/g, "");
  if (dialDigits && digits.startsWith(`00${dialDigits}`)) {
    digits = digits.slice(2 + dialDigits.length);
  } else if (dialDigits && digits.startsWith(dialDigits)) {
    digits = digits.slice(dialDigits.length);
  }
  return digits.replace(/^0+/, "");
}

export function PhoneField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (phone: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { country, local } = splitPhone(value);

  // Fermeture au clic exterieur : sur mobile la liste occupe une bonne part de
  // l'ecran, la refermer d'un geste naturel evite un bouton dedie.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function pick(c: Country) {
    onChange(`${c.dial}${local}`);
    setOpen(false);
  }

  return (
    <div className="field" ref={wrapRef}>
      <span className="fieldLabel">{label}</span>
      <div className="phoneRow">
        <button
          type="button"
          className="countryButton"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`Indicatif ${country.dial}, ${country.name}`}
        >
          <span className="countryCode">{country.code}</span>
          <span className="countryDial">{country.dial}</span>
          <IconChevronDown size={16} aria-hidden />
        </button>
        <input
          className="input phoneInput"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="6 XX XX XX XX"
          maxLength={12}
          value={local}
          onChange={(e) => onChange(`${country.dial}${stripToLocal(e.target.value, country.dial)}`)}
        />
      </div>

      {open && (
        <ul className="countryList" role="listbox">
          {COUNTRIES.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                className={`countryOption ${c.code === country.code ? "countryOptionActive" : ""}`}
                onClick={() => pick(c)}
                role="option"
                aria-selected={c.code === country.code}
              >
                <span className="countryCode">{c.code}</span>
                <span className="countryName">{c.name}</span>
                <span className="countryDial">{c.dial}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PasswordInput({
  value,
  onChange,
  autoComplete = "current-password",
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  placeholder?: string;
}) {
  const [hidden, setHidden] = useState(true);
  return (
    <div className="passwordRow">
      <input
        className="input passwordInput"
        type={hidden ? "password" : "text"}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="passwordToggle"
        onClick={() => setHidden((h) => !h)}
        aria-label={hidden ? "Afficher le mot de passe" : "Masquer le mot de passe"}
      >
        {hidden ? <IconEyeOff size={20} aria-hidden /> : <IconEye size={20} aria-hidden />}
      </button>
    </div>
  );
}
