import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TailorsApi } from "../../api/endpoints";
import type { TailorProfile } from "../../api/types";
import { useAuth } from "../../state/AuthContext";
import { useI18n } from "../../i18n/I18nProvider";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Stars } from "../../components/Stars";
import { VerifiedBadge } from "../../components/Badges";
import { Spinner } from "../../components/Misc";
import { colors, gradient } from "../../theme/tokens";

export default function TailorProfilePage() {
  const { user, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<TailorProfile | null>(null);

  useEffect(() => {
    TailorsApi.me().then(setProfile);
  }, []);

  if (!profile) return <Spinner />;

  return (
    <div style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: gradient }} />
        <div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <strong>{profile.shop_name}</strong>
            {profile.verification_status === "approved" && <VerifiedBadge />}
          </div>
          <Stars value={profile.rating_avg} />
        </div>
      </div>

      <Card style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 12, margin: "0 0 4px" }}>{profile.bio}</p>
        <p style={{ fontSize: 12, color: colors.textSecondary, margin: 0 }}>{profile.city}</p>
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

      <p style={{ fontSize: 12, color: colors.textSecondary }}>{user?.phone}</p>

      <Button variant="danger" fullWidth onClick={() => { logout(); navigate("/language"); }}>
        {t("profile.logout")}
      </Button>
    </div>
  );
}
