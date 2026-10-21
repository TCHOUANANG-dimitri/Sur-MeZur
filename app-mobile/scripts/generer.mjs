/**
 * Genere (ou regenere) le projet Android de l'application Sur-MeZur.
 *
 *   npm run generer
 *
 * L'application est une Trusted Web Activity : une coquille qui ouvre le site
 * (sur-me-zur.vercel.app) dans Chrome, plein ecran, sans barre d'adresse.
 * Le projet est produit par la bibliotheque officielle de Google
 * (@bubblewrap/core, modele « template_project »), a partir de
 * twa-manifest.json, puis allege :
 *
 *  - R8 : code reduit et optimise (proguard-android-optimize) ;
 *  - ressources inutilisees retirees (shrinkResources) ;
 *  - traductions des bibliotheques limitees au francais et a l'anglais ;
 *  - pas de raccourcis, pas de notifications, pas de raccourci « Parametres
 *    du site » ;
 *  - ecran de demarrage en 2 densites seulement (xhdpi, xxhdpi : Android met
 *    a l'echelle pour les autres) et toutes les images PNG en palette de 256
 *    couleurs (un logo sur fond uni : aucune difference visible).
 *
 * La version de Gradle et du plugin Android sont alignees sur celles deja
 * presentes sur le poste (moins de telechargements).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConsoleLog, TwaGenerator, TwaManifest } from "@bubblewrap/core";
import sharp from "sharp";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CIBLE = path.join(RACINE, "android");
const GRADLE = "8.14.3"; // distribution deja en cache (~/.gradle/wrapper/dists)
const PLUGIN_ANDROID = "8.10.1"; // compatible Gradle 8.11.1+

function remplacer(fichier, avant, apres) {
  const p = path.join(CIBLE, fichier);
  const texte = fs.readFileSync(p, "utf8");
  if (!avant.test(texte)) throw new Error(`${fichier} : motif introuvable ${avant}`);
  fs.writeFileSync(p, texte.replace(avant, apres));
}

const donnees = JSON.parse(fs.readFileSync(path.join(RACINE, "twa-manifest.json"), "utf8"));
const manifeste = new TwaManifest(donnees);
const verif = manifeste.validate?.();
if (verif) throw new Error(`twa-manifest.json invalide : ${verif}`);

fs.rmSync(CIBLE, { recursive: true, force: true });
fs.mkdirSync(CIBLE, { recursive: true });
await new TwaGenerator().createTwaProject(CIBLE, manifeste, new ConsoleLog("generer"));

// --- Allegements -------------------------------------------------------------
remplacer(
  "gradle/wrapper/gradle-wrapper.properties",
  /gradle-[\d.]+-bin\.zip/,
  `gradle-${GRADLE}-bin.zip`,
);
remplacer("build.gradle", /com\.android\.tools\.build:gradle:[\d.]+/, `com.android.tools.build:gradle:${PLUGIN_ANDROID}`);
// jcenter() est ferme : Maven Central le remplace.
remplacer("build.gradle", /jcenter\(\)/g, "mavenCentral()");
remplacer(
  "app/build.gradle",
  /release \{\s*minifyEnabled true\s*\}/,
  `release {
            // Le plus leger possible : code reduit et optimise par R8,
            // ressources inutilisees retirees.
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt')
        }`,
);
remplacer(
  "app/build.gradle",
  /(versionCode [^\n]+\n)/,
  `$1        // Seulement les langues du site : les bibliotheques AndroidX embarquent
        // sinon leurs textes dans plus de 80 langues.
        resourceConfigurations += ["fr", "en"]
`,
);

// Ecran de demarrage : 5 densites generees (830 Ko) ; deux suffisent.
for (const d of ["mdpi", "hdpi", "xxxhdpi"]) {
  fs.rmSync(path.join(CIBLE, "app/src/main/res", `drawable-${d}`, "splash.png"), { force: true });
  fs.rmSync(path.join(CIBLE, "app/src/main/res", `drawable-${d}`), { recursive: true, force: true });
}
// Toutes les PNG en palette : 3 a 5 fois plus legeres pour un logo.
let avant = 0;
let apres = 0;
for (const dossier of fs.readdirSync(path.join(CIBLE, "app/src/main/res"))) {
  const rep = path.join(CIBLE, "app/src/main/res", dossier);
  for (const nom of fs.readdirSync(rep).filter((n) => n.endsWith(".png"))) {
    const f = path.join(rep, nom);
    const source = fs.readFileSync(f);
    const reduit = await sharp(source).png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 }).toBuffer();
    avant += source.length;
    if (reduit.length < source.length) fs.writeFileSync(f, reduit);
    apres += Math.min(reduit.length, source.length);
  }
}
console.log(`Images : ${Math.round(avant / 1024)} Ko -> ${Math.round(apres / 1024)} Ko`);

fs.writeFileSync(path.join(CIBLE, "local.properties"), `sdk.dir=${(process.env.ANDROID_HOME || path.join(process.env.LOCALAPPDATA ?? "", "Android", "Sdk")).replace(/\\/g, "\\\\")}\n`);
console.log(`\nProjet Android genere dans ${CIBLE}`);
