import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TailorsApi } from "../../api/endpoints";
import type { TailorProfile } from "../../api/types";
import { useI18n } from "../../i18n/I18nProvider";
import { Button } from "../../components/Button";
import { Header, Field, inputStyle, ErrorBanner, Spinner } from "../../components/Misc";
import { StatusChip } from "../../components/Chip";
import { colors } from "../../theme/tokens";
import { CITIES_DATA, CITY_NAMES } from "../../data/citiesData";

export default function Verification() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<TailorProfile | null | undefined>(undefined);
  const [shopName, setShopName] = useState("");
  const [bio, setBio] = useState("");
  const [city, setCity] = useState("");
  const [quartier, setQuartier] = useState("");
  const [tailorType, setTailorType] = useState<"individual" | "atelier">("individual");
  const [portfolio, setPortfolio] = useState<File | null>(null);
  const [idCard, setIdCard] = useState<File | null>(null);
  const [atelierPhoto, setAtelierPhoto] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    TailorsApi.me().then((p) => {
      setProfile(p);
      if (p?.city) setCity(p.city);
      if (p?.quartier) setQuartier(p.quartier);
      if (p?.shop_name) setShopName(p.shop_name);
      if (p?.bio) setBio(p.bio);
      if (p?.tailor_type) setTailorType(p.tailor_type);
    }).catch(() => setProfile(null));
  }, []);

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      const form = new FormData();
      form.append("tailor_type", tailorType);
      form.append("shop_name", shopName);
      form.append("bio", bio);
      form.append("city", city);
      form.append("quartier", quartier);
      navigator.geolocation?.getCurrentPosition(
        (pos) => {
          form.append("lat", String(pos.coords.latitude));
          form.append("lng", String(pos.coords.longitude));
        },
        () => {},
        { timeout: 500 }
      );
      if (portfolio) form.append("portfolio", portfolio);
      if (idCard) form.append("id_card", idCard);
      if (atelierPhoto) form.append("atelier_photo", atelierPhoto);
      const result = await TailorsApi.submitVerification(form);
      setProfile(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (profile === undefined) return <Spinner />;

  if (profile && profile.verification_status !== "rejected" && profile.shop_name) {
    return (
      <div>
        <Header title={t("tailor.verification.title")} />
        <div style={{ padding: 24, textAlign: "center" }}>
          <StatusChip
            status={profile.verification_status === "approved" ? "success" : "pending"}
            label={profile.verification_status === "approved" ? "Vérifié" : t("tailor.verification.pending")}
          />
          <p style={{ fontSize: 13, color: colors.textSecondary, marginTop: 14 }}>
            {profile.verification_status === "approved"
              ? "Votre profil est vérifié."
              : "Un administrateur va examiner votre dossier."}
          </p>
          {profile.verification_status === "approved" && (
            <Button onClick={() => navigate("/tailor/dashboard")}>{t("nav.dashboard")}</Button>
          )}
        </div>
      </div>
    );
  }

  const quartiers = city ? CITIES_DATA[city] || [] : [];

  return (
    <div>
      <Header title={t("tailor.verification.title")} />
      <div style={{ padding: 18 }}>
        {error && <ErrorBanner message={error} />}
        <Field label="Type">
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant={tailorType === "individual" ? "primary" : "secondary"} onClick={() => setTailorType("individual")} style={{ flex: 1 }}>
              Individu
            </Button>
            <Button variant={tailorType === "atelier" ? "primary" : "secondary"} onClick={() => setTailorType("atelier")} style={{ flex: 1 }}>
              Atelier
            </Button>
          </div>
        </Field>
        <Field label="Nom de l'atelier / boutique">
          <input style={inputStyle} value={shopName} onChange={(e) => setShopName(e.target.value)} />
        </Field>
        <Field label="Bio">
          <textarea style={{ ...inputStyle, minHeight: 70 }} value={bio} onChange={(e) => setBio(e.target.value)} />
        </Field>
        <Field label={t("tailor.verification.city")}>
          <select
            style={inputStyle}
            value={city}
            onChange={(e) => { setCity(e.target.value); setQuartier(""); }}
          >
            <option value="">-- Choisir une ville --</option>
            {CITY_NAMES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label={t("tailor.verification.quartier")}>
          <select
            style={inputStyle}
            value={quartier}
            onChange={(e) => setQuartier(e.target.value)}
            disabled={!city}
          >
            <option value="">-- Choisir un quartier --</option>
            {quartiers.map((q) => (
              <option key={q} value={q}>{q}</option>
            ))}
          </select>
        </Field>
        <FileField label="Portfolio" onPick={setPortfolio} />
        <FileField label="Pièce d'identité" onPick={setIdCard} />
        <FileField label="Photo de l'atelier" onPick={setAtelierPhoto} />
        <Button fullWidth disabled={busy || !shopName || !city} onClick={submit} style={{ marginTop: 8 }}>
          {t("common.send")}
        </Button>
      </div>
    </div>
  );
}

function FileField({ label, onPick }: { label: string; onPick: (f: File) => void }) {
  return (
    <Field label={label}>
      <input type="file" accept="image/*,application/pdf" onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])} />
    </Field>
  );
}
