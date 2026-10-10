/**
 * Telecharger l'application Android (B5).
 *
 * L'APK (coquille TWA < 1 Mo, voir `android-twa/`) est publie en piece
 * jointe d'une release GitHub : cette page pointe vers lui via
 * `NEXT_PUBLIC_APK_URL` (plus version et taille). Sans lien configure, la
 * page propose l'installation PWA depuis Chrome et l'ajout a l'ecran
 * d'accueil sur iPhone.
 */

import Link from "next/link";

const APK_URL = process.env.NEXT_PUBLIC_APK_URL || "";
const APK_VERSION = process.env.NEXT_PUBLIC_APK_VERSION || "";
const APK_SIZE = process.env.NEXT_PUBLIC_APK_SIZE || "";

export default function Telecharger() {
  return (
    <main className="containerNarrow section">
      <h1>Télécharger l&apos;application</h1>
      <p className="muted">
        Sur-MeZur tient dans une application Android légère : le site en plein
        écran, sans barre d&apos;adresse, avec la caméra pour vos mesures.
      </p>

      {APK_URL ? (
        <section className="card" aria-label="Téléchargement direct">
          <a href={APK_URL} className="btn btnPrimary btnBlock" download>
            Télécharger l&apos;application (moins de 1 Mo)
          </a>
          <p className="muted" style={{ marginBottom: 0 }}>
            {APK_VERSION && <>Version {APK_VERSION} · </>}
            {APK_SIZE ? <>Taille {APK_SIZE}</> : <>Poids plume : moins de 1 Mo</>} · Android 5.0 et plus.
          </p>
        </section>
      ) : (
        <section className="card" aria-label="Téléchargement bientôt disponible">
          <p style={{ marginTop: 0 }}>
            <strong>Le téléchargement direct arrive.</strong> En attendant, installez le site
            depuis Chrome : c&apos;est la même application.
          </p>
        </section>
      )}

      <section aria-labelledby="android-titre">
        <h2 id="android-titre">Installer sur Android</h2>
        <ol>
          <li>
            <strong>Téléchargez le fichier</strong> avec le bouton ci-dessus (ou installez
            depuis Chrome : menu ⋮ → « Installer l&apos;application »).
          </li>
          <li>
            <strong>Ouvrez le fichier téléchargé.</strong> Android demande d&apos;autoriser
            « l&apos;installation d&apos;applications inconnues » : acceptez pour Chrome
            (ou votre navigateur).
          </li>
          <li>
            <strong>Confirmez « Installer ».</strong> L&apos;icône Sur-MeZur apparaît avec
            vos autres applications.
          </li>
        </ol>
      </section>

      <section aria-labelledby="iphone-titre">
        <h2 id="iphone-titre">Et sur iPhone ?</h2>
        <p>
          Il n&apos;y a pas de fichier à télécharger : ouvrez le site dans Safari, touchez
          le bouton de partage, puis « <strong>Sur l&apos;écran d&apos;accueil</strong> ».
        </p>
      </section>

      <p>
        <Link href="/contact" className="authLink">Un problème d&apos;installation ? Contactez-nous</Link>
      </p>
    </main>
  );
}
