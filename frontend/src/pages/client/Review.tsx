import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { OrdersApi } from "../../api/endpoints";
import { ApiError } from "../../api/client";
import { useI18n } from "../../i18n/I18nProvider";
import { Button } from "../../components/Button";
import { Header, ErrorBanner, Field, inputStyle } from "../../components/Misc";
import { Stars } from "../../components/Stars";

export default function Review() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await OrdersApi.review(id, { stars, comment });
      navigate(`/client/orders/${id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Header title={t("review.title")} onBack />
      <div style={{ padding: 24, textAlign: "center" }}>
        {error && <ErrorBanner message={error} />}
        <Stars value={stars} size={32} interactive onChange={setStars} />
        <div style={{ marginTop: 20, textAlign: "left" }}>
          <Field label={t("review.comment")}>
            <textarea style={{ ...inputStyle, minHeight: 90 }} value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
        </div>
        <Button fullWidth disabled={busy} onClick={submit}>
          {t("common.confirm")}
        </Button>
      </div>
    </div>
  );
}
