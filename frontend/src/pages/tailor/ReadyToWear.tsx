import React, { useEffect, useState } from "react";
import { CatalogApi, TailorsApi } from "../../api/endpoints";
import type { ReadyToWear as RTW, TailorProfile } from "../../api/types";
import { useI18n, formatFcfa } from "../../i18n/I18nProvider";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { BottomSheet } from "../../components/BottomSheet";
import { EmptyState, ErrorBanner, Field, Header, inputStyle, Spinner } from "../../components/Misc";
import { ApiError } from "../../api/client";

export default function ReadyToWear() {
  const { t } = useI18n();
  const [profile, setProfile] = useState<TailorProfile | null>(null);
  const [items, setItems] = useState<RTW[] | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const p = await TailorsApi.me();
    setProfile(p);
    if (p) setItems(await CatalogApi.readyToWear(p.id));
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    setError("");
    if (!name || price <= 0) {
      setError("Nom et prix requis.");
      return;
    }
    setBusy(true);
    try {
      await CatalogApi.createReadyToWear({ name, description, price, item_measurements: {}, measurement_method: "standard", in_stock: true });
      setSheetOpen(false);
      setName("");
      setDescription("");
      setPrice(0);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!items) return <Spinner />;

  return (
    <div>
      <Header
        title={t("nav.readyToWear")}
        right={
          <Button onClick={() => setSheetOpen(true)} style={{ padding: "8px 14px" }}>
            +
          </Button>
        }
      />
      <div style={{ padding: 18 }}>
        {items.length === 0 ? (
          <EmptyState text="Aucun article publié." cta={<Button onClick={() => setSheetOpen(true)}>{t("tailor.readyToWear.add")}</Button>} />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {items.map((it) => (
              <Card key={it.id}>
                <p style={{ fontSize: 12, fontWeight: 700, margin: "0 0 4px" }}>{it.name}</p>
                <p style={{ fontSize: 12, color: "#5B21B6", fontWeight: 700, margin: 0 }}>{formatFcfa(it.price)}</p>
              </Card>
            ))}
          </div>
        )}
      </div>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={t("tailor.readyToWear.add")}>
        {error && <ErrorBanner message={error} />}
        <Field label="Nom">
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Description">
          <textarea style={{ ...inputStyle, minHeight: 60 }} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Prix (FCFA)">
          <input type="number" style={inputStyle} value={price || ""} onChange={(e) => setPrice(parseFloat(e.target.value) || 0)} />
        </Field>
        <Button fullWidth disabled={busy} onClick={submit}>
          {t("common.save")}
        </Button>
      </BottomSheet>
    </div>
  );
}
