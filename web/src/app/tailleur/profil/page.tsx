"use client";

/**
 * Profil tailleur (B3.8) : nom de l'atelier, ville et quartier, telephone,
 * presentation, photo de l'atelier (a venir avec l'Agent A), langue,
 * deconnexion. AUCUN ecran de verification : elle est desactivee.
 */

import { useEffect, useState } from "react";
import { TailorApi } from "@/lib/api/tailor";
import { UsersApi } from "@/lib/api/endpoints";
import { useAuth } from "@/components/AuthProvider";
import { Button, Card, ErrorBanner, Input, PageHeader, Spinner, Textarea } from "@/components/ui";

export default function ProfilTailleur() {
  const { user, refresh, logout } = useAuth();
  const [shopName, setShopName] = useState("");
  const [city, setCity] = useState("");
  const [quartier, setQuartier] = useState("");
  const [bio, setBio] = useState("");
  const [language, setLanguage] = useState("fr");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    TailorApi.profile()
      .then((p) => {
        if (p) {
          setShopName(p.shop_name ?? "");
          setCity(p.city ?? "");
          setQuartier(p.quartier ?? "");
          setBio(p.bio ?? "");
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
    if (user?.language) setLanguage(user.language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    setBusy(true);
    try {
      await TailorApi.updateProfile({
        ...(shopName.trim() ? { shop_name: shopName.trim() } : {}),
        ...(city.trim() ? { city: city.trim() } : {}),
        ...(quartier.trim() ? { quartier: quartier.trim() } : {}),
        ...(bio.trim() ? { bio: bio.trim() } : {}),
      });
      if (language !== user?.language) {
        await UsersApi.patchMe({ language: language as "fr" | "en" });
        await refresh();
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <Spinner label="Chargement…" />;

  return (
    <div className="tPage">
      <PageHeader title="Profil" />
      <ErrorBanner message={error} />
      {saved && <p className="muted" role="status">Profil enregistré.</p>}

      <Card>
        <p className="tRowSub" style={{ marginTop: 0 }}>
          Connecté en tant que <strong>{user?.full_name}</strong> · {user?.phone}
        </p>
        <p className="tRowSub">Aucune vérification n&apos;est demandée pour l&apos;instant.</p>
      </Card>

      <form onSubmit={save} className="card" noValidate>
        <label className="field">
          <span className="fieldLabel">Nom de l&apos;atelier</span>
          <Input value={shopName} onChange={(e) => setShopName(e.target.value)} autoComplete="organization" />
        </label>
        <div className="fieldRow">
          <label className="field">
            <span className="fieldLabel">Ville</span>
            <Input value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
          </label>
          <label className="field">
            <span className="fieldLabel">Quartier</span>
            <Input value={quartier} onChange={(e) => setQuartier(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span className="fieldLabel">Présentation</span>
          <Textarea
            rows={3}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Ex. Atelier de couture homme et femme à Douala, spécialités : boubous, robes de soirée."
            maxLength={500}
          />
        </label>
        <label className="field">
          <span className="fieldLabel">Langue</span>
          <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="fr">Français</option>
            <option value="en">English</option>
          </select>
        </label>
        <Button type="submit" block disabled={busy}>
          {busy ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </form>

      <Button variant="secondary" block onClick={logout}>
        Déconnexion
      </Button>
    </div>
  );
}
