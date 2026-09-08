# Déploiement Vercel de l'application web

L'application web vit dans le sous-dossier `web/` d'un monodépôt qui contient
aussi le backend FastAPI, l'application mobile et les travaux de recherche ML.
Vercel sait gérer ce cas, mais **trois réglages ne peuvent pas être mis dans
un fichier** : ils se font dans le tableau de bord du projet.

---

## 1. Les réglages du tableau de bord

**Settings → General → Root Directory : `web`**

C'est le réglage indispensable. Sans lui, Vercel cherche un `package.json` à
la racine du monodépôt, n'en trouve pas, et le build échoue immédiatement.
Une fois `web` défini, toutes les commandes (`install`, `build`) s'exécutent
depuis ce dossier, et `vercel.json` y est lu.

Laisse **décochée** l'option « Include files outside the Root Directory » :
l'application web n'a besoin d'aucun fichier du backend ou du mobile, et la
décocher évite d'embarquer les maillages 3D et les photos de test, qui pèsent
plusieurs centaines de mégaoctets.

**Settings → Git → Repository : `korah-agency/Sur-MeZur`**

Après la consolidation des dépôts, le projet doit suivre le monodépôt et non
plus `Sur-MeZur-web-App`.

**Settings → Environment Variables**

| Nom | Valeur | Portée |
|---|---|---|
| `API_ORIGIN` | `http://api.gitingeniering.com` | Production |

Cette variable est aujourd'hui aussi présente dans `web/.env.production`, qui
est versionné — le déploiement fonctionne donc même sans la définir ici. La
déclarer dans le tableau de bord reste préférable : le jour où l'API change
d'adresse, ou passe en HTTPS, cela se règle sans commit ni redéploiement du
code.

**Ne mets jamais de secret dans `.env.production`** : ce fichier est dans le
dépôt. Il ne contient aujourd'hui qu'une URL publique.

---

## 2. Ce que fait `vercel.json`

```json
{
  "framework": "nextjs",
  "ignoreCommand": "git diff --quiet HEAD^ HEAD -- ."
}
```

`ignoreCommand` est le réglage qui compte dans un monodépôt. Sans lui, **tout**
commit déclenche un build de l'application web : une correction du pipeline de
vision, un script de recherche ML, une modification du rapport. Cette commande
compare le dernier commit au précédent en ne regardant que le répertoire
racine du projet — donc `web/` — et annule le build si rien n'y a changé.

Conséquence attendue et normale : dans l'historique des déploiements, les
commits qui ne touchent pas `web/` apparaissent en **« Canceled »**. Ce n'est
pas une erreur.

`framework` est explicite plutôt que déduit, pour que la détection ne dépende
pas du contenu du dossier.

---

## 3. Pourquoi l'API en HTTP ne pose pas de problème

Le site est servi en HTTPS par Vercel, l'API en HTTP. Normalement le
navigateur bloquerait ces appels pour contenu mixte.

Ce n'est pas le cas ici parce que le client n'appelle **jamais** l'API
directement : `next.config.ts` réécrit `/api/*` et `/uploads/*` vers
`API_ORIGIN`, et **cette réécriture s'exécute sur le serveur Vercel**, pas
dans le navigateur. Le navigateur ne voit que des chemins relatifs sur le
domaine HTTPS.

C'est ce qui rend le déploiement possible alors qu'AutoSSL n'a jamais émis de
certificat pour le domaine de l'API. Ne remplace pas ce proxy par des appels
directs tant que l'API n'est pas en HTTPS.

---

## 4. Ordre des opérations pour la bascule

1. Vérifier que le monodépôt est bien poussé sur `korah-agency/Sur-MeZur` et
   qu'il contient `web/`.
2. Dans le projet Vercel : changer le dépôt Git, puis définir
   `Root Directory` à `web`.
3. Déclencher un déploiement manuel (**Deployments → Redeploy**) plutôt que
   d'attendre un commit : cela valide la configuration tout de suite.
4. Vérifier le site en ligne — au minimum la connexion et le catalogue, qui
   nécessitent tous deux que le proxy vers l'API fonctionne.
5. **Seulement ensuite**, archiver `korah-agency/Sur-MeZur-web-App`.

Tant que l'étape 4 n'est pas concluante, l'ancien dépôt reste la source du
déploiement en ligne : ne le supprime pas.

---

## 5. Si le build échoue

| Symptôme | Cause probable |
|---|---|
| `No package.json found` | `Root Directory` n'est pas réglé sur `web` |
| Build lancé à chaque commit du backend | `vercel.json` absent, ou `Root Directory` mal réglé |
| Site en ligne mais toutes les requêtes échouent | `API_ORIGIN` absent ou faux ; vérifier que le backend répond sur `http://api.gitingeniering.com/api/categories` |
| `Vulnerable version of Next.js` | dépendance à mettre à jour ; voir §11 du rapport de projet |
