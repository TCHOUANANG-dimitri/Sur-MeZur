"use client";

/**
 * Telecharger l'application Android (B5).
 *
 * L'APK (coquille TWA < 1 Mo, voir `app-mobile/`) est publie en piece jointe
 * d'une release GitHub : cette page pointe vers lui via `NEXT_PUBLIC_APK_URL`
 * (plus version et taille). Sans lien configure, elle propose l'installation
 * depuis Chrome et l'ajout a l'ecran d'accueil sur iPhone. Texte dans la
 * langue du telephone.
 */

import Link from "next/link";
import { tr } from "@/lib/i18n";

const APK_URL = process.env.NEXT_PUBLIC_APK_URL || "";
const APK_VERSION = process.env.NEXT_PUBLIC_APK_VERSION || "";
const APK_SIZE = process.env.NEXT_PUBLIC_APK_SIZE || "";

export default function Telecharger() {
  return (
    <main className="containerNarrow section">
      <h1>{tr("Télécharger l'application", "Download the app")}</h1>
      <p className="muted">{tr("Une application Android légère : moins de 1 Mo.", "A light Android app: under 1 MB.")}</p>

      {APK_URL ? (
        <section className="card" aria-label={tr("Téléchargement", "Download")}>
          <a href={APK_URL} className="btn btnPrimary btnBlock" download>
            {tr("Télécharger l'application", "Download the app")}
          </a>
          <p className="muted" style={{ marginBottom: 0 }}>
            {APK_VERSION && <>Version {APK_VERSION} · </>}
            {APK_SIZE || tr("moins de 1 Mo", "under 1 MB")} · Android 5+
          </p>
        </section>
      ) : (
        <section className="card" aria-label={tr("Téléchargement", "Download")}>
          <p style={{ margin: 0 }}>
            {tr("Bientôt disponible. En attendant, installez le site depuis Chrome.", "Coming soon. Meanwhile, install the site from Chrome.")}
          </p>
        </section>
      )}

      <section aria-labelledby="android-titre">
        <h2 id="android-titre">{tr("Installer sur Android", "Install on Android")}</h2>
        <ol>
          <li>{tr("Téléchargez le fichier.", "Download the file.")}</li>
          <li>{tr("Ouvrez-le et autorisez l'installation.", "Open it and allow the installation.")}</li>
          <li>{tr("Touchez « Installer ».", "Tap “Install”.")}</li>
        </ol>
      </section>

      <section aria-labelledby="iphone-titre">
        <h2 id="iphone-titre">{tr("Sur iPhone", "On iPhone")}</h2>
        <p>
          {tr(
            "Dans Safari : bouton de partage, puis « Sur l'écran d'accueil ».",
            "In Safari: Share button, then “Add to Home Screen”."
          )}
        </p>
      </section>

      <p>
        <Link href="/contact" className="authLink">{tr("Un problème ? Contactez-nous", "A problem? Contact us")}</Link>
      </p>
    </main>
  );
}
