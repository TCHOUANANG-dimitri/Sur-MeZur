import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../../api/client";
import { useAuth } from "../../state/AuthContext";
import { useI18n } from "../../i18n/I18nProvider";
import { Button } from "../../components/Button";
import { ErrorBanner, Field, inputStyle } from "../../components/Misc";
import { colors } from "../../theme/tokens";

export default function Login() {
  const { t } = useI18n();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState("+237600000001");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      const user = await login(phone, password);
      const dest = user.role === "client" ? "/client/home" : user.role === "tailor" ? "/tailor/dashboard" : "/admin/verifications";
      navigate(dest, { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell" style={{ padding: 24, justifyContent: "center", display: "flex", flexDirection: "column" }}>
      <h2 style={{ fontFamily: "'Playfair Display', serif", color: colors.indigoText }}>{t("auth.login")}</h2>
      {error && <ErrorBanner message={error} />}
      <Field label={t("auth.phone")}>
        <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Field label={t("auth.password")}>
        <input type="password" style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Button fullWidth disabled={busy} onClick={submit}>
        {t("auth.login")}
      </Button>
      <p style={{ textAlign: "center", fontSize: 12, color: colors.textSecondary, marginTop: 16 }}>
        Comptes de démo — client: +237600000001, tailleur: +237600000002, admin: +237600000000 (mot de passe: password123)
      </p>
      <p style={{ textAlign: "center", fontSize: 13, marginTop: 8 }}>
        <a onClick={() => navigate("/role")} style={{ cursor: "pointer" }}>
          {t("auth.register")}
        </a>
      </p>
    </div>
  );
}
