"use client";

/**
 * Proposer un modele au catalogue de la communaute.
 *
 * S'appuie sur `POST /api/models`, ajoute cote backend pour ce parcours : la
 * colonne `created_by` de `garment_models` existait sans qu'aucune route ne
 * la renseigne, seul l'admin pouvant creer un modele. Les photos passent par
 * `POST /api/models/{id}/photos`, ouverte au seul auteur.
 *
 * Deux appels successifs et non un seul formulaire multipart : le modele doit
 * exister pour porter ses images, et cela permet d'enregistrer la proposition
 * meme si l'envoi des photos echoue.
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CatalogApi } from "@/lib/api/endpoints";
import type { Category } from "@/lib/api/types";
import { Button, ErrorBanner, InfoBanner, PageHeader, Select, Spinner } from "@/components/ui";
import { IconCamera } from "@/components/icons";

const MAX_PHOTOS = 4;

export default function ProposerModele() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [categories, setCategories] = useState<Category[] | null>(null);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    CatalogApi.categories()
      .then((c) => {
        setCategories(c);
        if (c.length) setCategoryId(c[0].id);
      })
      .catch(() => setCategories([]));
  }, []);

  // Les URL d'apercu sont revoquees au demontage : sans cela les images
  // restent en memoire tant que l'onglet vit.
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const canSubmit = name.trim().length >= 2 && categoryId !== "" && !busy;

  function pickFiles(list: FileList | null) {
    if (!list) return;
    const next = Array.from(list).slice(0, MAX_PHOTOS - files.length);
    setFiles((f) => [...f, ...next]);
    setPreviews((p) => [...p, ...next.map((f) => URL.createObjectURL(f))]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const model = await CatalogApi.createModel({
        name: name.trim(),
        description: description.trim() || undefined,
        category_id: categoryId,
        style_tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 8),
      });

      if (files.length) {
        try {
          await CatalogApi.uploadModelPhotos(model.id, files);
        } catch {
          // Le modele est cree : on n'annule pas tout pour un envoi d'images
          // rate, on emmene la personne sur sa fiche ou elle verra le manque.
        }
      }
      router.replace(`/modeles/${model.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publication impossible.");
      setBusy(false);
    }
  }

  if (categories === null) return <Spinner label="Chargement…" />;

  return (
    <>
      <PageHeader title="Proposer un modèle" back />
      <div className="containerNarrow section">
        <InfoBanner>
          <div>
            Votre modèle rejoindra le catalogue visible par tous. Décrivez-le simplement, et
            ajoutez une photo si vous en avez une.
          </div>
        </InfoBanner>

        <form onSubmit={submit} noValidate>
          <ErrorBanner message={error} />

          <label className="field">
            <span className="fieldLabel">Nom du modèle</span>
            <input
              className="input"
              maxLength={120}
              placeholder="Boubou brodé col rond"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <label className="field">
            <span className="fieldLabel">Catégorie</span>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </label>

          <label className="field">
            <span className="fieldLabel">Description</span>
            <textarea
              className="input"
              rows={4}
              maxLength={2000}
              placeholder="Coupe, finitions, occasion…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <label className="field">
            <span className="fieldLabel">Mots-clés</span>
            <input
              className="input"
              placeholder="cérémonie, wax, manches longues"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
            <span className="fieldHint">Séparés par des virgules, huit au maximum.</span>
          </label>

          <div className="field">
            <span className="fieldLabel">Photos</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => pickFiles(e.target.files)}
            />
            <div className="proposePhotos">
              {previews.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={src} src={src} alt={`Photo ${i + 1}`} className="proposePhoto" />
              ))}
              {files.length < MAX_PHOTOS && (
                <button
                  type="button"
                  className="proposeAdd"
                  onClick={() => fileRef.current?.click()}
                  aria-label="Ajouter une photo"
                >
                  <IconCamera size={22} strokeWidth={1.7} aria-hidden />
                </button>
              )}
            </div>
            <span className="fieldHint">Facultatif, {MAX_PHOTOS} au maximum.</span>
          </div>

          <div className="actionBar">
            <Button type="submit" block disabled={!canSubmit}>
              {busy ? "Publication…" : "Publier mon modèle"}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
