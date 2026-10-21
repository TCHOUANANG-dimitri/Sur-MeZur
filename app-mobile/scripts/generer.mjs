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
 *  - pas de raccourcis ni de notifications (le raccourci « Parametres du
 *    site » reste : la bibliotheque plante au lancement sans lui) ;
 *  - ecran de demarrage en 2 densites seulement (xhdpi, xxhdpi : Android met
 *    a l'echelle pour les autres) et toutes les images PNG en palette de 256
 *    couleurs (un logo sur fond uni : aucune difference visible).
 *
 * Icones et ecran de demarrage sont redessines sur fond blanc a partir des
 * logos de la landing (landing/public/brand) : ceux du site web, telecharges
 * par Bubblewrap, sont sur fond violet.
 *
 * La version de Gradle et du plugin Android sont alignees sur celles deja
 * presentes sur le poste (moins de telechargements).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ConsoleLog, TwaGenerator, TwaManifest } from "@bubblewrap/core";
import sharp from "sharp";

sharp.cache(false); // Windows : ne pas garder les fichiers ouverts (reecriture sur place)
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CIBLE = path.join(RACINE, "android");
const GRADLE = "8.14.3"; // distribution deja en cache (~/.gradle/wrapper/dists)
const PLUGIN_ANDROID = "8.10.1"; // compatible Gradle 8.11.1+
const MARQUE = path.resolve(RACINE, "../landing/public/brand");

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

// --- Icones et ecran de demarrage sur fond blanc ------------------------------
const RES = path.join(CIBLE, "app/src/main/res");
const BLANC = { r: 255, g: 255, b: 255, alpha: 1 };
async function carre(source, cote, fichier) {
  await sharp(source).resize(cote, cote).flatten({ background: BLANC }).png().toFile(fichier);
}
for (const dossier of fs.readdirSync(RES).filter((d) => d.startsWith("mipmap-") && !d.includes("anydpi"))) {
  for (const [nom, source] of [["ic_launcher", "icon-512.png"], ["ic_maskable", "icon-maskable.png"]]) {
    const f = path.join(RES, dossier, `${nom}.png`);
    if (!fs.existsSync(f)) continue;
    const { width } = await sharp(f).metadata();
    await carre(path.join(MARQUE, source), width, f);
  }
}
await carre(path.join(MARQUE, "icon-512.png"), 512, path.join(CIBLE, "store_icon.png"));
// Splash : le logo seul (sans cadre), centre, sur le fond blanc de l'ecran.
for (const d of ["xhdpi", "xxhdpi"]) {
  const f = path.join(RES, `drawable-${d}`, "splash.png");
  const { width } = await sharp(f).metadata();
  const logo = await sharp(path.join(MARQUE, "mark.png")).resize({ height: Math.round(width * 0.62) }).toBuffer();
  await sharp({ create: { width, height: width, channels: 4, background: BLANC } })
    .composite([{ input: logo, gravity: "center" }])
    .flatten({ background: BLANC })
    .png()
    .toFile(f + ".tmp");
  fs.renameSync(f + ".tmp", f);
}

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
