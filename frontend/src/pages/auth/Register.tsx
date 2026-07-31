import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AuthApi } from "../../api/endpoints";
import { ApiError } from "../../api/client";
import { useAuth } from "../../state/AuthContext";
import { useI18n } from "../../i18n/I18nProvider";
import { Button } from "../../components/Button";
import { ErrorBanner, Field, inputStyle } from "../../components/Misc";
import { colors } from "../../theme/tokens";

export default function Register() {
  const [params] = useSearchParams();
  const role = (params.get("role") as "client" | "tailor") || "client";
  const { t, lang } = useI18n();
  const { register } = useAuth();
  const navigate = useNavigate();

  const [phone, setPhone] = useState("+237");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(true);
  const [step, setStep] = useState<"form" | "otp">("form");
  const [devCode, setDevCode] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const requestOtp = async () => {
    setError("");
    if (!phone || !fullName || password.length < 4) {
      setError("Complétez tous les champs (mot de passe ≥ 4 caractères).");
      return;
    }
    setBusy(true);
    try {
      const res = await AuthApi.otpRequest(phone);
      setDevCode(res.dev_code);
      setStep("otp");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setError("");
    setBusy(true);
    try {
      await AuthApi.otpVerify(phone, code);
      const user = await register({ role, phone, full_name: fullName, password, language: lang, photo_consent: consent });
      navigate(role === "tailor" ? "/tailor/verification" : "/client/home", { replace: true });
      void user;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-shell" style={{ padding: 24 }}>
      <h2 style={{ fontFamily: "'Playfair Display', serif", color: colors.indigoText }}>
        {t("auth.register")} — {t(`role.${role}`)}
      </h2>
      {error && <ErrorBanner message={error} />}

      {step === "form" ? (
        <>
          <Field label={t("auth.fullName")}>
            <input style={inputStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label={t("auth.phone")}>
            <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          <Field label={t("auth.password")}>
            <input type="password" style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: colors.textSecondary, marginBottom: 18 }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            Je consens au traitement de mes photos corporelles pour la prise de mesures.
          </label>
          <Button fullWidth disabled={busy} onClick={requestOtp}>
            {t("common.next")}
          </Button>
        </>
      ) : (
        <>
          <p style={{ fontSize: 13, color: colors.textSecondary }}>{t("auth.otp.subtitle")}</p>
          <div
            style={{
              background: colors.backgroundAlt,
              borderRadius: 10,
              padding: "10px 14px",
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: 4,
              textAlign: "center",
              marginBottom: 16,
              color: colors.violetPrimary,
            }}
          >
            {devCode}
          </div>
          <Field label="Code OTP">
            <input style={inputStyle} value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} />
          </Field>
          <Button fullWidth disabled={busy} onClick={finish}>
            {t("common.confirm")}
          </Button>
        </>
      )}
    </div>
  );
}
