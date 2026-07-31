import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MeasurementsApi } from "../../api/endpoints";
import { useI18n } from "../../i18n/I18nProvider";
import { Button } from "../../components/Button";
import { Header, Field, inputStyle, Spinner, ErrorBanner } from "../../components/Misc";
import { MeasurementRow } from "../../components/DomainCards";
import { colors, radii } from "../../theme/tokens";

type Step = "intro" | "form" | "capture" | "processing" | "review" | "done";

export default function MeasurementFlow() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("intro");
  const [height, setHeight] = useState(170);
  const [weight, setWeight] = useState<number | "">("");
  const [gender, setGender] = useState("female");
  const [front, setFront] = useState<File | null>(null);
  const [side, setSide] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [data, setData] = useState<Record<string, number>>({});
  const [measurementId, setMeasurementId] = useState<string | null>(null);
  const frontRef = useRef<HTMLInputElement>(null);
  const sideRef = useRef<HTMLInputElement>(null);

  const startCapture = async () => {
    setStep("capture");
  };

  const submitPhotos = async () => {
    if (!front || !side) {
      setError("Ajoutez les deux photos (face et profil).");
      return;
    }
    setError("");
    setStep("processing");
    try {
      const session = await MeasurementsApi.createSession({
        height_cm: height,
        weight_kg: weight === "" ? undefined : weight,
        gender,
      });
      const updated = await MeasurementsApi.uploadPhotos(session.id, front, side);
      let current = updated;
      for (let i = 0; i < 12 && current.status === "processing"; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        current = await MeasurementsApi.getSession(session.id);
      }
      if (current.status !== "ready" || !current.measurement_id) {
        throw new Error(current.error_message || "Échec de l'analyse");
      }
      const list = await MeasurementsApi.list();
      const measurement = list.find((m) => m.id === current.measurement_id) || list[0];
      setData(measurement.data);
      setMeasurementId(measurement.id);
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep("capture");
    }
  };

  const confirm = async () => {
    if (!measurementId) return;
    try {
      await MeasurementsApi.patch(measurementId, { data });
    } catch {
      /* corrections best-effort */
    }
    navigate(`/client/avatar?measurementId=${measurementId}`);
  };

  return (
    <div>
      <Header title={t("measurement.intro.title")} onBack />
      <div style={{ padding: 20 }}>
        {step === "intro" && (
          <>
            <p style={{ fontSize: 13, color: colors.textSecondary }}>{t("measurement.intro.body")}</p>
            <ul style={{ fontSize: 13, color: colors.indigoText, paddingLeft: 18 }}>
              <li>Tenue ajustée</li>
              <li>Fond dégagé</li>
              <li>Bras écartés à ~45°</li>
            </ul>
            <Button fullWidth onClick={() => setStep("form")}>
              {t("common.next")}
            </Button>
          </>
        )}

        {step === "form" && (
          <>
            <Field label={t("measurement.height")}>
              <input type="number" style={inputStyle} value={height} onChange={(e) => setHeight(parseFloat(e.target.value) || 0)} />
            </Field>
            <Field label={t("measurement.gender")}>
              <select style={inputStyle} value={gender} onChange={(e) => setGender(e.target.value)}>
                <option value="female">Femme</option>
                <option value="male">Homme</option>
              </select>
            </Field>
            <Field label={t("measurement.weight")}>
              <input
                type="number"
                style={inputStyle}
                value={weight}
                onChange={(e) => setWeight(e.target.value === "" ? "" : parseFloat(e.target.value))}
              />
            </Field>
            <Button fullWidth onClick={startCapture}>
              {t("common.next")}
            </Button>
          </>
        )}

        {step === "capture" && (
          <>
            {error && <ErrorBanner message={error} />}
            <CapturePicker
              label={t("measurement.capture.front")}
              file={front}
              onPick={setFront}
              inputRef={frontRef}
            />
            <CapturePicker
              label={t("measurement.capture.side")}
              file={side}
              onPick={setSide}
              inputRef={sideRef}
            />
            <Button fullWidth onClick={submitPhotos} disabled={!front || !side}>
              {t("common.confirm")}
            </Button>
          </>
        )}

        {step === "processing" && <Spinner label={t("measurement.processing")} />}

        {step === "review" && (
          <>
            <h4 style={{ margin: "0 0 4px", color: colors.indigoText }}>{t("measurement.review.title")}</h4>
            <p style={{ fontSize: 11, color: colors.textSecondary, marginTop: 0 }}>{t("measurement.review.note")}</p>
            {Object.entries(data)
              .filter(([k]) => k !== "height_total")
              .map(([key, value]) => (
                <MeasurementRow
                  key={key}
                  measureKey={key}
                  value={value}
                  editable
                  onChange={(v) => setData((d) => ({ ...d, [key]: v }))}
                />
              ))}
            <div style={{ height: 16 }} />
            <Button fullWidth onClick={confirm}>
              {t("common.confirm")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function CapturePicker({
  label,
  file,
  onPick,
  inputRef,
}: {
  label: string;
  file: File | null;
  onPick: (f: File) => void;
  inputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div
      onClick={() => inputRef.current?.click()}
      style={{
        border: `1.5px dashed ${colors.border}`,
        borderRadius: radii.card,
        padding: 18,
        textAlign: "center",
        marginBottom: 12,
        cursor: "pointer",
        background: file ? colors.backgroundAlt : colors.white,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="user"
        style={{ display: "none" }}
        onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
      />
      <div style={{ fontSize: 24 }}>{file ? "✅" : "📷"}</div>
      <p style={{ fontSize: 12, margin: "6px 0 0" }}>{file ? file.name : label}</p>
    </div>
  );
}
