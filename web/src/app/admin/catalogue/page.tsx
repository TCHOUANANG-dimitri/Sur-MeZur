"use client";

// Catalogue (M4) : modeles (filtres, statut, mise en avant, ordre),
// moderation, categories, photos par glisser-deposer avec couverture,
// apercu cote client, statistiques par modele, tissus et accessoires,
// pret-a-porter, import en masse.

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Catalog,
  type AccessoryItem,
  type CategoryItem,
  type FabricItem,
  type ModelRow,
  type RtwRow,
} from "@/lib/api/admin";
import { Button } from "@/components/ui";
import { useFeedback } from "@/components/admin/Feedback";
import {
  DataTable,
  FilterSelect,
  FilterText,
  TABLE_DEFAULTS,
  filtersOf,
  tableQuery,
  useUrlState,
  type Column,
} from "@/components/admin/DataTable";
import { AuthImage, ErrorState, Loading, PageHead, Panel, StatusBadge, useLoad } from "@/components/admin/kit";
import { MODEL_STATUS, formatDate, formatFcfa, formatNumber } from "@/components/admin/format";

const TABS = ["modeles", "moderation", "categories", "tissus", "accessoires", "pretaporter", "import"] as const;
const TAB_LABEL: Record<string, string> = {
  modeles: "Modèles",
  moderation: "Modération",
  categories: "Catégories",
  tissus: "Tissus",
  accessoires: "Accessoires",
  pretaporter: "Prêt-à-porter",
  import: "Import",
};

export default function CatalogPage() {
  const [s, set] = useUrlState({ ...TABLE_DEFAULTS, tab: "modeles", q: "", status: "", category_id: "", gender: "", highlight: "" });
  const tab = (TABS as readonly string[]).includes(s.tab) ? s.tab : "modeles";
  return (
    <div className="adPage">
      <PageHead title="Catalogue" sub="Modèles, modération, catégories, tissus, prêt-à-porter." />
      <div className="adTabs" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`adTab ${tab === t ? "adTabActive" : ""}`} onClick={() => set({ tab: t })}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>
      {tab === "modeles" && <ModelsTab s={s} set={set} pendingOnly={false} />}
      {tab === "moderation" && <ModelsTab s={s} set={set} pendingOnly />}
      {tab === "categories" && <CategoriesTab />}
      {tab === "tissus" && <FabricsTab />}
      {tab === "accessoires" && <AccessoriesTab />}
      {tab === "pretaporter" && <RtwTab />}
      {tab === "import" && <ImportTab />}
    </div>
  );
}

function ModelsTab({ s, set, pendingOnly }: { s: Record<string, string>; set: (p: Partial<Record<string, string>>) => void; pendingOnly: boolean }) {
  const { confirm, toast } = useFeedback();
  const [reload, setReload] = useState(0);
  const [statsId, setStatsId] = useState<string | null>(null);
  const [photosId, setPhotosId] = useState<string | null>(null);
  const cats = useLoad(() => Catalog.categories(), []);

  const columns: Column<ModelRow>[] = [
    { key: "name", label: "Modèle", sort: "name", render: (m) => <>{m.name} <span className="adHint">· {m.category ?? "—"}</span></> },
    { key: "author", label: "Auteur", render: (m) => (m.author === "team" ? "Équipe" : "Communauté") },
    { key: "status", label: "Statut", render: (m) => <StatusBadge map={MODEL_STATUS} value={m.status} /> },
    { key: "highlight", label: "Mise en avant", render: (m) => m.highlight ?? "—" },
    { key: "sort_order", label: "Ordre", sort: "sort_order", align: "right", render: (m) => formatNumber(m.sort_order) },
    { key: "base_price", label: "Prix de base", align: "right", optional: true, render: (m) => (m.base_price == null ? "—" : formatFcfa(m.base_price)) },
    { key: "orders", label: "Commandes", align: "right", render: (m) => formatNumber(m.orders) },
    {
      key: "actions",
      label: "Actions",
      render: (m) => (
        <span className="adRow">
          <Link className="btn btnSecondary adBtnSm" href={`/modeles/${m.id}`}>Aperçu</Link>
          <Button variant="secondary" className="adBtnSm" onClick={() => setStatsId(m.id)}>Stats</Button>
          <Button variant="secondary" className="adBtnSm" onClick={() => setPhotosId(m.id)}>Photos</Button>
        </span>
      ),
    },
  ];

  const moderate = async (ids: string[], action: "publish" | "hide" | "reject" | "delete") => {
    const labels = { publish: "Publier", hide: "Masquer", reject: "Refuser", delete: "Supprimer" };
    const reason = await confirm({
      title: `${labels[action]} ${ids.length} modèle(s) ?`,
      danger: action === "reject" || action === "delete",
      confirmLabel: labels[action],
      reason: action === "reject" ? { label: "Motif communiqué", required: true } : undefined,
    });
    if (reason === null) return;
    try {
      const r = await Catalog.bulk(ids, action, reason || undefined);
      toast(`${r.done} modèle(s) traité(s).`, action === "hide" ? { undo: async () => { await Catalog.bulk(ids, "publish"); setReload((n) => n + 1); } } : undefined);
      setReload((n) => n + 1);
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  return (
    <>
      <div className="adToolbar">
        <FilterText label="Recherche" value={s.q} onChange={(q) => set({ q })} placeholder="Nom du modèle" wide />
        <FilterSelect label="Catégorie" value={s.category_id} onChange={(category_id) => set({ category_id })} options={(cats.data ?? []).map((c) => ({ value: c.id, label: `${c.name} (${c.gender})` }))} allLabel="Toutes" />
        <FilterSelect label="Genre" value={s.gender} onChange={(gender) => set({ gender })} options={{ female: "Femme", male: "Homme", unisex: "Mixte" }} />
        {!pendingOnly && <FilterSelect label="Statut" value={s.status} onChange={(status) => set({ status })} options={{ published: "Publiés", pending: "En attente", rejected: "Refusés", hidden: "Masqués" }} />}
        <FilterText label="Mise en avant" value={s.highlight} onChange={(highlight) => set({ highlight })} placeholder="nouveaute…" />
      </div>
      <DataTable<ModelRow>
        id={pendingOnly ? "models-moderation" : "models"}
        columns={columns}
        fetcher={(p) => Catalog.models({ ...filtersOf(s, ["tab"]), ...(pendingOnly ? { status: "pending" } : {}), ...p })}
        filters={filtersOf(s, ["tab"])}
        query={tableQuery(s)}
        onQuery={set}
        rowKey={(m) => m.id}
        exportPath="/admin/tables/models"
        exportName="modeles"
        selectable
        bulk={(ids, done) => (
          <span className="adRow">
            <Button variant="secondary" className="adBtnSm" onClick={() => { void moderate(ids, "publish").then(done); }}>Publier</Button>
            <Button variant="secondary" className="adBtnSm" onClick={() => { void moderate(ids, "hide").then(done); }}>Masquer</Button>
            <Button variant="danger" className="adBtnSm" onClick={() => { void moderate(ids, "reject").then(done); }}>Refuser</Button>
          </span>
        )}
        reloadToken={reload}
      />
      {statsId && <ModelStatsModal id={statsId} onClose={() => setStatsId(null)} />}
      {photosId && <PhotosModal id={photosId} onClose={() => { setPhotosId(null); setReload((n) => n + 1); }} />}
    </>
  );
}

function ModelStatsModal({ id, onClose }: { id: string; onClose: () => void }) {
  const stats = useLoad(() => Catalog.modelStats(id), [id]);
  return (
    <div className="adModalBackdrop" role="presentation" onClick={onClose}>
      <div className="adModal" role="dialog" aria-modal="true" aria-label="Statistiques du modèle" onClick={(e) => e.stopPropagation()}>
        <h2>Statistiques</h2>
        {stats.error ? <ErrorState error={stats.error} /> : !stats.data ? <Loading /> : (
          <dl>
            <div className="adKv"><dt>Vues</dt><dd>{formatNumber(stats.data.views)}</dd></div>
            <div className="adKv"><dt>J&apos;aime</dt><dd>{formatNumber(stats.data.likes)}</dd></div>
            <div className="adKv"><dt>Sélections en fiche</dt><dd>{formatNumber(stats.data.selections)}</dd></div>
            <div className="adKv"><dt>Commandes</dt><dd>{formatNumber(stats.data.orders)}</dd></div>
          </dl>
        )}
        <div className="adModalActions"><Button variant="secondary" onClick={onClose}>Fermer</Button></div>
      </div>
    </div>
  );
}

function PhotosModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { toast } = useFeedback();
  const [photos, setPhotos] = useState<string[] | null>(null);
  const [current, setCurrent] = useState<ModelRow | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [drag, setDrag] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    Catalog.models({ page: 1, page_size: 100, q: "" })
      .then((page) => {
        if (!alive) return;
        const m = page.items.find((x) => x.id === id) ?? null;
        setCurrent(m);
        setPhotos(m?.photos ?? []);
      })
      .catch((e) => alive && setError(e));
    return () => { alive = false; };
  }, [id]);

  const save = async (next: string[]) => {
    try {
      const r = await Catalog.reorderPhotos(id, next);
      setPhotos(r.photos);
      toast("Ordre enregistré. La première photo est la couverture.");
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  const move = (from: number, to: number) => {
    if (!photos) return;
    const next = [...photos];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    setPhotos(next);
    void save(next);
  };

  return (
    <div className="adModalBackdrop" role="presentation" onClick={onClose}>
      <div className="adModal adModalWide" role="dialog" aria-modal="true" aria-label="Photos du modèle" onClick={(e) => e.stopPropagation()}>
        <h2>Photos — la première est la couverture</h2>
        {error ? <ErrorState error={error} /> : !photos ? <Loading /> : photos.length === 0 ? (
          <p className="adHint">Aucune photo. Ajoutez-en via l&apos;import en masse.</p>
        ) : (
          <div className="adPhotoGrid">
            {photos.map((url, i) => (
              <figure
                key={url}
                className={`adPhoto ${i === 0 ? "adPhotoCover" : ""} ${drag === i ? "adPhotoDrag" : ""}`}
                draggable
                onDragStart={() => setDrag(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (drag !== null && drag !== i) move(drag, i); setDrag(null); }}
              >
                <AuthImage src={url} alt={`Photo ${i + 1}`} />
                <figcaption>
                  {i === 0 ? "Couverture" : `Photo ${i + 1}`} ·{" "}
                  <button className="adLinkBtn" onClick={() => move(i, 0)}>couverture</button> ·{" "}
                  <button className="adLinkBtn" onClick={() => { const next = photos.filter((_, j) => j !== i); setPhotos(next); void save(next); }}>retirer</button>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        {current && <p className="adHint">Aperçu côté client : <Link href={`/modeles/${current.id}`}>{current.name}</Link> · mise en avant : {current.highlight ?? "—"} · ordre {current.sort_order}</p>}
        <SpotlightForm
          id={id}
          initial={{ highlight: current?.highlight ?? null, sort_order: current?.sort_order ?? 0 }}
        />
        <div className="adModalActions"><Button variant="secondary" onClick={onClose}>Fermer</Button></div>
      </div>
    </div>
  );
}

function SpotlightForm({ id, initial }: { id: string; initial: { highlight: string | null; sort_order: number } }) {
  const { toast } = useFeedback();
  const [highlight, setHighlight] = useState(initial.highlight ?? "");
  const [order, setOrder] = useState(String(initial.sort_order ?? 0));
  return (
    <form
      className="adRow"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await Catalog.spotlight(id, { highlight: highlight.trim() || null, sort_order: Number(order) || 0 });
          toast("Mise en avant enregistrée.");
        } catch (err) {
          toast((err as Error).message, { error: true });
        }
      }}
    >
      <label className="adFilter">
        <span>Mise en avant</span>
        <input className="input" value={highlight} onChange={(e) => setHighlight(e.target.value)} placeholder="nouveaute, ceremonie…" />
      </label>
      <label className="adFilter">
        <span>Ordre</span>
        <input className="input" inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value)} />
      </label>
      <Button variant="primary" className="adBtnSm" type="submit">Enregistrer</Button>
    </form>
  );
}

function CategoriesTab() {
  const { confirm, toast } = useFeedback();
  const cats = useLoad(() => Catalog.categories(), []);
  const [name, setName] = useState("");
  const [gender, setGender] = useState("female");
  const [editing, setEditing] = useState<CategoryItem | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) await Catalog.updateCategory(editing.id, { name: name.trim(), gender });
      else await Catalog.createCategory({ name: name.trim(), gender });
      toast("Catégorie enregistrée.");
      setName("");
      setEditing(null);
      cats.reload();
    } catch (err) {
      toast((err as Error).message, { error: true });
    }
  };

  return (
    <Panel title="Catégories">
      {cats.error ? <ErrorState error={cats.error} onRetry={cats.reload} /> : !cats.data ? <Loading /> : (
        <ul className="adList">
          {cats.data.map((c) => (
            <li key={c.id}>
              <strong>{c.name}</strong> <span className="adHint">({c.gender} · {c.models} modèle(s))</span>{" "}
              <button className="adLinkBtn" onClick={() => { setEditing(c); setName(c.name); setGender(c.gender); }}>renommer</button>{" "}
              <button
                className="adLinkBtn adDanger"
                onClick={async () => {
                  if ((await confirm({ title: `Supprimer « ${c.name} » ?`, danger: true, confirmLabel: "Supprimer" })) === null) return;
                  try {
                    await Catalog.deleteCategory(c.id);
                    toast("Catégorie supprimée.");
                    cats.reload();
                  } catch (err) {
                    toast((err as Error).message, { error: true });
                  }
                }}
              >
                supprimer
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="adRow" onSubmit={(e) => void save(e)}>
        <label className="adFilter">
          <span>{editing ? "Nouveau nom" : "Nouvelle catégorie"}</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
        </label>
        <label className="adFilter">
          <span>Genre</span>
          <select className="input" value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="female">Femme</option>
            <option value="male">Homme</option>
            <option value="unisex">Mixte</option>
          </select>
        </label>
        <Button variant="primary" className="adBtnSm" type="submit">{editing ? "Renommer" : "Créer"}</Button>
        {editing && <Button variant="secondary" className="adBtnSm" type="button" onClick={() => { setEditing(null); setName(""); }}>Annuler</Button>}
      </form>
    </Panel>
  );
}

function FabricsTab() {
  const { confirm, toast } = useFeedback();
  const list = useLoad(() => Catalog.fabrics(), []);
  const [name, setName] = useState("");
  const [type, setType] = useState("pagne");
  const [color, setColor] = useState("#7C3AED");
  const [editing, setEditing] = useState<FabricItem | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) await Catalog.updateFabric(editing.id, { name: name.trim(), type: type.trim(), color_hex: color, is_local: editing.is_local });
      else await Catalog.createFabric({ name: name.trim(), type: type.trim(), color_hex: color, is_local: true });
      toast("Tissu enregistré.");
      setName("");
      setEditing(null);
      list.reload();
    } catch (err) {
      toast((err as Error).message, { error: true });
    }
  };

  return (
    <Panel title="Tissus">
      {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : (
        <ul className="adList">
          {list.data.map((f) => (
            <li key={f.id}>
              <span className="adSwatch" style={{ background: f.color_hex }} /> <strong>{f.name}</strong>{" "}
              <span className="adHint">{f.type}{f.texture_url ? " · texture" : ""}</span>{" "}
              <label className="adNoPrint">texture <input type="file" accept="image/*" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  await Catalog.fabricTexture(f.id, file);
                  toast("Texture envoyée.");
                  list.reload();
                } catch (err) {
                  toast((err as Error).message, { error: true });
                }
              }} /></label>{" "}
              <button className="adLinkBtn" onClick={() => { setEditing(f); setName(f.name); setType(f.type); setColor(f.color_hex); }}>modifier</button>{" "}
              <button
                className="adLinkBtn adDanger"
                onClick={async () => {
                  if ((await confirm({ title: `Supprimer « ${f.name} » ?`, danger: true, confirmLabel: "Supprimer" })) === null) return;
                  try {
                    await Catalog.deleteFabric(f.id);
                    toast("Tissu supprimé.");
                    list.reload();
                  } catch (err) {
                    toast((err as Error).message, { error: true });
                  }
                }}
              >
                supprimer
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="adRow" onSubmit={(e) => void save(e)}>
        <label className="adFilter"><span>Nom</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label className="adFilter"><span>Type</span><input className="input" value={type} onChange={(e) => setType(e.target.value)} /></label>
        <label className="adFilter"><span>Couleur</span><input className="input" type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
        <Button variant="primary" className="adBtnSm" type="submit">{editing ? "Modifier" : "Ajouter"}</Button>
        {editing && <Button variant="secondary" className="adBtnSm" type="button" onClick={() => { setEditing(null); setName(""); }}>Annuler</Button>}
      </form>
    </Panel>
  );
}

function AccessoriesTab() {
  const { confirm, toast } = useFeedback();
  const list = useLoad(() => Catalog.accessories(), []);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [editing, setEditing] = useState<AccessoryItem | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(price);
    if (!Number.isFinite(amount) || amount < 0) {
      toast("Prix invalide.", { error: true });
      return;
    }
    try {
      if (editing) await Catalog.updateAccessory(editing.id, { name: name.trim(), price: amount, compatible_categories: editing.compatible_categories });
      else await Catalog.createAccessory({ name: name.trim(), price: amount, compatible_categories: [] });
      toast("Accessoire enregistré.");
      setName("");
      setPrice("");
      setEditing(null);
      list.reload();
    } catch (err) {
      toast((err as Error).message, { error: true });
    }
  };

  return (
    <Panel title="Accessoires">
      {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : (
        <ul className="adList">
          {list.data.map((a) => (
            <li key={a.id}>
              <strong>{a.name}</strong> <span className="adHint">{formatFcfa(a.price)}</span>{" "}
              <button className="adLinkBtn" onClick={() => { setEditing(a); setName(a.name); setPrice(String(a.price)); }}>modifier</button>{" "}
              <button
                className="adLinkBtn adDanger"
                onClick={async () => {
                  if ((await confirm({ title: `Supprimer « ${a.name} » ?`, danger: true, confirmLabel: "Supprimer" })) === null) return;
                  try {
                    await Catalog.deleteAccessory(a.id);
                    toast("Accessoire supprimé.");
                    list.reload();
                  } catch (err) {
                    toast((err as Error).message, { error: true });
                  }
                }}
              >
                supprimer
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="adRow" onSubmit={(e) => void save(e)}>
        <label className="adFilter"><span>Nom</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label className="adFilter"><span>Prix (FCFA)</span><input className="input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} required /></label>
        <Button variant="primary" className="adBtnSm" type="submit">{editing ? "Modifier" : "Ajouter"}</Button>
        {editing && <Button variant="secondary" className="adBtnSm" type="button" onClick={() => { setEditing(null); setName(""); setPrice(""); }}>Annuler</Button>}
      </form>
    </Panel>
  );
}

function RtwTab() {
  const { confirm, toast } = useFeedback();
  const [s, set] = useUrlState({ ...TABLE_DEFAULTS, q: "", status: "" });
  const [reload, setReload] = useState(0);

  const columns: Column<RtwRow>[] = [
    { key: "name", label: "Article", render: (r) => <>{r.name} <span className="adHint">· {r.tailor}</span></> },
    { key: "price", label: "Prix", align: "right", render: (r) => formatFcfa(r.price) },
    { key: "in_stock", label: "Stock", render: (r) => (r.in_stock ? "En stock" : "Épuisé") },
    { key: "moderation_status", label: "Modération", render: (r) => <StatusBadge map={MODEL_STATUS} value={r.moderation_status} /> },
    { key: "created_at", label: "Créé le", sort: "created_at", render: (r) => formatDate(r.created_at) },
  ];

  const moderate = async (ids: string[], status: string) => {
    const reason = status === "rejected"
      ? await confirm({ title: `Refuser ${ids.length} article(s) ?`, danger: true, confirmLabel: "Refuser", reason: { label: "Motif", required: true } })
      : "";
    if (reason === null) return;
    try {
      for (const id of ids) await Catalog.moderateRtw(id, status, reason || undefined);
      toast("Modération enregistrée.");
      setReload((n) => n + 1);
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  return (
    <>
      <div className="adToolbar">
        <FilterText label="Recherche" value={s.q} onChange={(q) => set({ q })} placeholder="Article, tailleur" wide />
        <FilterSelect label="Modération" value={s.status} onChange={(status) => set({ status })} options={{ visible: "Visibles", pending: "En attente", rejected: "Refusés", hidden: "Masqués" }} />
      </div>
      <DataTable<RtwRow>
        id="rtw"
        columns={columns}
        fetcher={(p) => Catalog.rtw({ ...filtersOf(s), ...p })}
        filters={filtersOf(s)}
        query={tableQuery(s)}
        onQuery={set}
        rowKey={(r) => r.id}
        exportPath="/admin/tables/ready-to-wear"
        exportName="pret-a-porter"
        selectable
        bulk={(ids, done) => (
          <span className="adRow">
            <Button variant="secondary" className="adBtnSm" onClick={() => { void moderate(ids, "visible").then(done); }}>Publier</Button>
            <Button variant="secondary" className="adBtnSm" onClick={() => { void moderate(ids, "hidden").then(done); }}>Masquer</Button>
            <Button variant="danger" className="adBtnSm" onClick={() => { void moderate(ids, "rejected").then(done); }}>Refuser</Button>
          </span>
        )}
        reloadToken={reload}
      />
    </>
  );
}

function ImportTab() {
  const { toast } = useFeedback();
  const cats = useLoad(() => Catalog.categories(), []);
  const [cat, setCat] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; errors: string[] } | null>(null);

  return (
    <Panel title="Import en masse">
      <p className="adHint">Un modèle par photo, nommé d&apos;après le fichier. Les erreurs sont listées sans rien bloquer.</p>
      <form
        className="adForm"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!cat || !files?.length) {
            toast("Choisissez une catégorie et des photos.", { error: true });
            return;
          }
          setBusy(true);
          try {
            const r = await Catalog.importModels(Array.from(files), cat, "pending");
            setResult(r);
            toast(`${r.created} modèle(s) créé(s).`);
          } catch (err) {
            toast((err as Error).message, { error: true });
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="adFilter">
          <span>Catégorie</span>
          <select className="input" value={cat} onChange={(e) => setCat(e.target.value)} required>
            <option value="">—</option>
            {(cats.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.gender})</option>)}
          </select>
        </label>
        <label className="adFilter">
          <span>Photos</span>
          <input type="file" accept="image/*" multiple onChange={(e) => setFiles(e.target.files)} />
        </label>
        <Button variant="primary" className="adBtnSm" type="submit" disabled={busy}>Importer</Button>
      </form>
      {result && (
        <div>
          <p>{result.created} modèle(s) créé(s).</p>
          {result.errors.length > 0 && (
            <ul className="adList">{result.errors.map((x, i) => <li key={i} className="adWarn">{x}</li>)}</ul>
          )}
        </div>
      )}
    </Panel>
  );
}
