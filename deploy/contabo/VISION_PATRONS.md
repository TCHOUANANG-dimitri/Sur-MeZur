# Analyse de la photo d'un modèle (Qwen3-VL 4B)

Quand un tailleur crée un patron, l'IA peut regarder la photo du modèle et
proposer le type de vêtement, le modèle de base et ses réglages (manches,
encolure, ampleur, étages). Elle suggère aussi des détails (poches, broderie,
volants…) que le tailleur confirme ou non. Rien n'est appliqué sans lui, et
les centimètres viennent toujours des mesures du client.

C'est l'étape 1 du pipeline décrit dans
`Documentation/architecture-pipeline-patron-ia.pdf`. Le modèle, la consigne
et la liste fermée de réponses sont ceux validés lors des essais d'octobre
2026 sur le VPS (`~/modeles/schema_v2.json`, `consigne_v2.txt`) ; ils sont
recopiés dans `backend/app/services/patrons/vision.py`.

## Ce qui tourne où

```
navigateur ──► Vercel ──► API (127.0.0.1:8000) ──► llama-server (127.0.0.1:8090)
                           tâche de fond,            Qwen3-VL 4B Q4_K_M,
                           1 à 3 min par photo       chargé en permanence
```

- `llama-server` (llama.cpp) garde le modèle en mémoire et n'écoute que sur
  la boucle locale : il n'est pas joignable depuis Internet.
- L'API lui envoie la photo (réduite à 1024 px), reçoit la fiche JSON,
  la nettoie et la traduit pour le formulaire. La photo n'est jamais
  enregistrée pour l'analyse : elle n'existe qu'en mémoire.
- Sans `VL_URL` dans `/etc/surmezur/api.env`, l'analyse est désactivée et
  l'écran « Nouveau patron » fonctionne comme avant.

## Installation (une fois)

Sur le VPS, en `smzadmin`.

**1. Compiler `llama-server`** (les essais n'avaient compilé que
`llama-mtmd-cli`) :

```bash
cd ~/llama.cpp && git pull
cmake -B build -DGGML_NATIVE=ON
cmake --build build -j 3 --target llama-server
ls -lh build/bin/llama-server
```

**2. Vérifier les fichiers du modèle :**

```bash
ls -lh ~/modeles/Qwen3VL-4B-Instruct-Q4_K_M.gguf ~/modeles/mmproj-Qwen3VL-4B-Instruct-Q8_0.gguf
```

**3. Installer et démarrer le service :**

```bash
sudo cp /srv/surmezur/app/deploy/contabo/surmezur-vl.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now surmezur-vl
# Le chargement prend une à deux minutes ; puis :
curl -s http://127.0.0.1:8090/health
```

`{"status":"ok"}` : le modèle est prêt.

**4. Brancher l'API :**

```bash
echo 'VL_URL=http://127.0.0.1:8090' | sudo tee -a /etc/surmezur/api.env
sudo systemctl restart surmezur-api
```

Dans l'espace tailleur, « Nouveau patron » propose alors « Analyser la photo »
dès qu'une photo est choisie.

## Mémoire : à surveiller

Le 4B occupe 5,3 à 5,6 Go (essais), l'API 2 à 3 Go, sur 7,8 Go. C'est juste :

- le service est plafonné à 5,8 Go (`MemoryMax`) ;
- en cas de manque de mémoire, le noyau arrête **ce service en premier**
  (`OOMScoreAdjust=500`), jamais l'API ; il redémarre seul après 10 s ;
- pendant ce temps, l'analyse échoue proprement et le tailleur remplit la
  fiche lui-même.

Pour suivre : `systemctl status surmezur-vl`, `journalctl -u surmezur-vl -n 50`,
`free -h`. S'il redémarre souvent (`journalctl -k | grep -i oom`), deux
solutions : passer le VPS à 16 Go de RAM (recommandé), ou utiliser le 2B
(2,9 Go, moins juste sur les catégories) en remplaçant `4B` par `2B` dans les
deux chemins du fichier `/etc/systemd/system/surmezur-vl.service`.

## Tester à la main

```bash
cd ~/modeles
python3 - <<'EOF'
import base64, json, urllib.request
img = base64.b64encode(open("test.jpg", "rb").read()).decode()
body = {"messages": [{"role": "user", "content": [
    {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + img}},
    {"type": "text", "text": open("consigne_v2.txt").read()}]}],
    "temperature": 0.1, "max_tokens": 700,
    "response_format": {"type": "json_schema", "json_schema": {"name": "fiche", "schema": json.load(open("schema_v2.json"))}}}
req = urllib.request.Request("http://127.0.0.1:8090/v1/chat/completions", json.dumps(body).encode(), {"Content-Type": "application/json"})
print(json.load(urllib.request.urlopen(req, timeout=400))["choices"][0]["message"]["content"])
EOF
```

## Faire évoluer la consigne

`SCHEMA_V2` et `CONSIGNE_V2` (`backend/app/services/patrons/vision.py`) sont
figés sur la version testée. Toute modification se teste d'abord sur le lot de
photos des essais (`~/modeles/tester_lot.sh`), puis se reporte dans le code ;
le test `backend/tests/test_vision_patron.py` vérifie que les catégories du
schéma restent celles du catalogue.

## Noms du catalogue (nom et description FR / EN par modèle)

Le même serveur de vision propose, d'après la photo de couverture, un nom et
une description en français et en anglais pour chaque modèle du catalogue
(`backend/app/services/catalogue_nommage.py`). Le modèle remplit une fiche
fermée (la fiche de style ci-dessus + couleurs + tissu) ; les phrases sont
composées par le code, avec les accords. Rien n'est appliqué d'office : tout
se relit dans **Admin › Catalogue › Noms IA**.

Comptez 1 à 3 minutes par photo : environ une nuit pour 300 modèles. Pendant
le lot, l'analyse « Nouveau patron » des tailleurs attend son tour.

1. Mettre à jour le VPS (`mettre_a_jour.sh` : ajoute les colonnes `name_en`,
   `description_en`, `ai_suggestion`, `ai_status`).
2. Essai sur 5 modèles, sans rien enregistrer :

   ```bash
   sudo -u surmezur -H bash -c 'set -a; . /etc/surmezur/api.env; set +a; cd /srv/surmezur/app/backend; /srv/surmezur/venv/bin/python scripts/nommer_catalogue.py --essai --limite 5'
   ```

3. Si les propositions sont bonnes, le lot complet, en tâche de fond (il
   continue si la session SSH se ferme) :

   ```bash
   sudo -u surmezur -H bash -c 'set -a; . /etc/surmezur/api.env; set +a; cd /srv/surmezur/app/backend; nohup /srv/surmezur/venv/bin/python scripts/nommer_catalogue.py > /tmp/nommage.log 2>&1 &'
   tail -f /tmp/nommage.log      # suivre (Ctrl+C n'arrête que l'affichage)
   ```

   Interrompu, il reprend là où il s'était arrêté si on le relance. Options :
   `--categorie Kaba`, `--limite 20`, `--echecs` (ne reprend que les échecs),
   `--refaire` (réanalyse aussi les modèles déjà faits). Si le service de
   vision tombe pendant le lot, le script attend qu'il revienne puis s'arrête
   sans marquer les modèles restants en échec : vérifier
   `systemctl status surmezur-vl` et `free -h`, puis relancer.
4. Relire dans l'admin : corriger si besoin, « Appliquer », « Ignorer », ou
   « Tout appliquer ».
