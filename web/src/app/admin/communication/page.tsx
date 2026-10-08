"use client";

// Communication (M11) : annonces avec apercu de l'audience, bandeau du site,
// modeles de messages, pages d'information.

import { useState } from "react";
import { Comms, Security, type Audience, type InfoPage, type Template } from "@/lib/api/admin";
import { Button } from "@/components/ui";
import { useFeedback } from "@/components/admin/Feedback";
import { ErrorState, Loading, PageHead, Panel, renderMarkdown, useLoad } from "@/components/admin/kit";
import { formatDateTime, formatNumber } from "@/components/admin/format";

const TABS = ["annonces", "bandeau", "modeles", "pages"] as const;

export default function CommsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("annonces");
  return (
    <div className="adPage">
      <PageHead title="Communication" sub="Annonces, bandeau, modèles de messages, pages d'information." />
      <div className="adTabs" role="tablist">
        {[{ key: "annonces", label: "Annonces" }, { key: "bandeau", label: "Bandeau du site" }, { key: "modeles", label: "Modèles de messages" }, { key: "pages", label: "Pages d'information" }].map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`adTab ${tab === t.key ? "adTabActive" : ""}`} onClick={() => setTab(t.key as (typeof TABS)[number])}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "annonces" && <AnnouncementsTab />}
      {tab === "bandeau" && <BannerTab />}
      {tab === "modeles" && <TemplatesTab />}
      {tab === "pages" && <PagesTab />}
    </div>
  );
}

function AudienceForm({ value, onChange }: { value: Audience; onChange: (a: Audience) => void }) {
  return (
    <div className="adRow">
      <label className="adFilter">
        <span>Rôle</span>
        <select className="input" value={value.role} onChange={(e) => onChange({ ...value, role: e.target.value as Audience["role"] })}>
          <option value="all">Tous</option>
          <option value="client">Clients</option>
          <option value="tailor">Tailleurs</option>
        </select>
      </label>
      <label className="adFilter">
        <span>Ville (vide = toutes)</span>
        <input className="input" value={value.city ?? ""} onChange={(e) => onChange({ ...value, city: e.target.value || null })} placeholder="Douala" />
      </label>
      <label className="adFilter">
        <span>Actifs depuis N jours (vide = tous)</span>
        <input className="input" inputMode="numeric" value={value.active_days ?? ""} onChange={(e) => onChange({ ...value, active_days: e.target.value === "" ? null : Number(e.target.value) })} />
      </label>
    </div>
  );
}

function AnnouncementsTab() {
  const { confirm, toast } = useFeedback();
  const list = useLoad(() => Comms.announcements(), []);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Audience>({ role: "all" });
  const [count, setCount] = useState<number | null>(null);

  const preview = async () => {
    try {
      const r = await Comms.preview(audience);
      setCount(r.recipients);
    } catch (e) {
      toast((e as Error).message, { error: true });
    }
  };

  return (
    <>
      <Panel title="Nouvelle annonce">
        <label className="adFilter"><span>Titre</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="adFilter"><span>Message</span><textarea className="input adTextarea" value={body} onChange={(e) => setBody(e.target.value)} /></label>
        <AudienceForm value={audience} onChange={(a) => { setAudience(a); setCount(null); }} />
        <div className="adRow">
          <Button variant="secondary" className="adBtnSm" onClick={() => void preview()}>Aperçu de l&apos;audience</Button>
          {count !== null && <span className="adHint">{formatNumber(count)} destinataire(s).</span>}
          <Button
            variant="primary"
            className="adBtnSm"
            disabled={!title.trim() || !body.trim()}
            onClick={async () => {
              if ((await confirm({ title: `Envoyer à ${count ?? "?"} destinataire(s) ?`, confirmLabel: "Envoyer" })) === null) return;
              try {
                const r = await Comms.send(title.trim(), body.trim(), audience);
                toast(`Annonce envoyée à ${r.recipients} destinataire(s).`);
                setTitle("");
                setBody("");
                setCount(null);
                list.reload();
              } catch (e) {
                toast((e as Error).message, { error: true });
              }
            }}
          >
            Envoyer
          </Button>
        </div>
      </Panel>
      <Panel title="Annonces envoyées">
        {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : list.data.length === 0 ? (
          <p className="adHint">Aucune annonce.</p>
        ) : (
          <ul className="adList">
            {list.data.map((a) => (
              <li key={a.id}>
                <strong>{a.title}</strong> <span className="adHint">· {a.audience.role} · {formatNumber(a.recipients_count)} destinataire(s) · {a.author_name} · {formatDateTime(a.created_at)}</span>
                <div>{a.body}</div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

function BannerTab() {
  const { toast } = useFeedback();
  const settings = useLoad(() => Security.settings(), []);
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [loaded, setLoaded] = useState(false);

  const banner = settings.data?.values.banner as { enabled: boolean; message: string; tone: string; link_url: string; link_label: string } | undefined;
  if (banner && !loaded) {
    setMessage(banner.message ?? "");
    setLink(banner.link_url ?? "");
    setLoaded(true);
  }

  return (
    <Panel title="Bandeau du site">
      {settings.error ? <ErrorState error={settings.error} onRetry={settings.reload} /> : !settings.data || !banner ? <Loading /> : (
        <form
          className="adForm"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await Security.saveSetting("banner", { ...banner, enabled: message.trim().length > 0, message: message.trim(), link_url: link.trim() });
              toast("Bandeau enregistré.");
              settings.reload();
              setLoaded(false);
            } catch (err) {
              toast((err as Error).message, { error: true });
            }
          }}
        >
          <p className="adHint">Vide = bandeau masqué. Visible en haut du site après enregistrement.</p>
          <label className="adFilter"><span>Message</span><input className="input" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Nouveau : …" /></label>
          <label className="adFilter"><span>Lien (facultatif)</span><input className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="/infos/…" /></label>
          <Button variant="primary" className="adBtnSm" type="submit">Enregistrer</Button>
        </form>
      )}
    </Panel>
  );
}

function TemplatesTab() {
  const { confirm, toast } = useFeedback();
  const list = useLoad(() => Comms.templates(), []);
  const [cat, setCat] = useState("verification");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState<Template | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) await Comms.updateTemplate(editing.id, { category: cat, title: title.trim(), body: body.trim() });
      else await Comms.createTemplate({ category: cat, title: title.trim(), body: body.trim() });
      toast("Modèle enregistré.");
      setTitle("");
      setBody("");
      setEditing(null);
      list.reload();
    } catch (err) {
      toast((err as Error).message, { error: true });
    }
  };

  const categories = list.data?.categories ?? {};
  const items = list.data?.items ?? [];
  return (
    <>
      <Panel title="Modèles de messages">
        {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : (
          Object.entries(categories).map(([key, label]) => (
            <div key={key}>
              <h4>{label}</h4>
              <ul className="adList">
                {items.filter((t) => t.category === key).map((t) => (
                  <li key={t.id}>
                    <strong>{t.title}</strong>
                    <div className="adHint">{t.body}</div>{" "}
                    <button className="adLinkBtn" onClick={() => { setEditing(t); setCat(t.category); setTitle(t.title); setBody(t.body); }}>modifier</button>{" "}
                    <button
                      className="adLinkBtn adDanger"
                      onClick={async () => {
                        if ((await confirm({ title: `Supprimer « ${t.title} » ?`, danger: true, confirmLabel: "Supprimer" })) === null) return;
                        try {
                          await Comms.deleteTemplate(t.id);
                          toast("Modèle supprimé.");
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
            </div>
          ))
        )}
      </Panel>
      <Panel title={editing ? "Modifier le modèle" : "Nouveau modèle"}>
        <form className="adForm" onSubmit={(e) => void save(e)}>
          <label className="adFilter">
            <span>Catégorie</span>
            <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
              {Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="adFilter"><span>Titre</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
          <label className="adFilter"><span>Message</span><textarea className="input adTextarea" value={body} onChange={(e) => setBody(e.target.value)} required /></label>
          <span className="adRow">
            <Button variant="primary" className="adBtnSm" type="submit">{editing ? "Modifier" : "Créer"}</Button>
            {editing && <Button variant="secondary" className="adBtnSm" type="button" onClick={() => { setEditing(null); setTitle(""); setBody(""); }}>Annuler</Button>}
          </span>
        </form>
      </Panel>
    </>
  );
}

function PagesTab() {
  const { toast } = useFeedback();
  const list = useLoad(() => Comms.pages(), []);
  const [slug, setSlug] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [published, setPublished] = useState(true);

  const open = (p: InfoPage) => {
    setSlug(p.slug);
    setTitle(p.title);
    setBody(p.body);
    setPublished(p.published);
  };

  return (
    <>
      <Panel title="Pages d'information">
        {list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : !list.data ? <Loading /> : (
          <ul className="adList">
            {list.data.map((p) => (
              <li key={p.slug}>
                <button className="adLinkBtn" onClick={() => open(p)}><strong>{p.title}</strong></button>{" "}
                <span className="adHint">/{p.slug} · {p.published ? "publiée" : "brouillon"} · {formatDateTime(p.updated_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {slug && (
        <Panel title={`Modifier — ${slug}`}>
          <form
            className="adForm"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await Comms.savePage(slug, { title: title.trim(), body, published });
                toast("Page enregistrée.");
                list.reload();
              } catch (err) {
                toast((err as Error).message, { error: true });
              }
            }}
          >
            <label className="adFilter"><span>Titre</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
            <label className="adFilter"><span><input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> Publiée</span></label>
            <div className="adGrid2">
              <label className="adFilter"><span>Contenu (titres ##, listes -, **gras**, liens)</span><textarea className="input adTextarea" rows={12} value={body} onChange={(e) => setBody(e.target.value)} /></label>
              <div><h4>Aperçu</h4><div className="adProse" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} /></div>
            </div>
            <span className="adRow">
              <Button variant="primary" className="adBtnSm" type="submit">Enregistrer</Button>
              <Button variant="secondary" className="adBtnSm" type="button" onClick={() => setSlug(null)}>Fermer</Button>
            </span>
          </form>
        </Panel>
      )}
    </>
  );
}
