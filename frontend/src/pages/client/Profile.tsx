import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MeasurementsApi } from "../../api/endpoints";
import type { Measurement } from "../../api/types";
import { useAuth } from "../../state/AuthContext";
import { useI18n } from "../../i18n/I18nProvider";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { colors, gradient } from "../../theme/tokens";

export default function Profile() {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const [measurements, setMeasurements] = useState<Measurement[]>([]);

  useEffect(() => {
    MeasurementsApi.list().then(setMeasurements).catch(() => {});
  }, []);

  return (
    <div style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: gradient }} />
        <div>
          <strong>{user?.full_name}</strong>
          <p style={{ margin: 0, fontSize: 12, color: colors.textSecondary }}>{user?.phone}</p>
        </div>
      </div>

      <Card style={{ marginBottom: 12 }} onClick={() => navigate("/client/measurements")}>
        <strong style={{ fontSize: 13 }}>{t("profile.myMeasurements")}</strong>
        <p style={{ fontSize: 12, color: colors.textSecondary, margin: "4px 0 0" }}>
          {measurements.length > 0 ? `Dernière prise: v${measurements[0].version}` : "Aucune mesure enregistrée"}
        </p>
      </Card>

      <Card style={{ marginBottom: 12 }} onClick={() => navigate("/client/orders")}>
        <strong style={{ fontSize: 13 }}>{t("profile.history")}</strong>
      </Card>

      <Card style={{ marginBottom: 12 }}>
        <strong style={{ fontSize: 13, display: "block", marginBottom: 8 }}>{t("profile.language")}</strong>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant={lang === "fr" ? "primary" : "secondary"} onClick={() => setLang("fr")}>
            Français
          </Button>
          <Button variant={lang === "en" ? "primary" : "secondary"} onClick={() => setLang("en")}>
            English
          </Button>
        </div>
      </Card>

      <Button variant="danger" fullWidth onClick={() => { logout(); navigate("/language"); }}>
        {t("profile.logout")}
      </Button>
    </div>
  );
}
