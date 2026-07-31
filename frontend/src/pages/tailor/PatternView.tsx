import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { OrdersApi } from "../../api/endpoints";
import { ApiError } from "../../api/client";
import type { Pattern } from "../../api/types";
import { Header, ErrorBanner, Spinner } from "../../components/Misc";
import { colors, radii } from "../../theme/tokens";

export default function PatternView() {
  const { id = "" } = useParams();
  const [pattern, setPattern] = useState<Pattern | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    OrdersApi.pattern(id)
      .then(setPattern)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  }, [id]);

  return (
    <div>
      <Header title="Patron" onBack />
      <div style={{ padding: 18 }}>
        {error && <ErrorBanner message={error} />}
        {!pattern ? (
          !error && <Spinner />
        ) : (
          <>
            <div style={{ border: `1px solid ${colors.border}`, borderRadius: radii.card, overflow: "hidden", marginBottom: 14 }}>
              {pattern.svg_url && <img src={pattern.svg_url} alt="Patron" style={{ width: "100%", display: "block" }} />}
            </div>
            <h4>Fiche technique</h4>
            <pre style={{ fontSize: 11, background: colors.backgroundAlt, padding: 12, borderRadius: radii.button, overflowX: "auto" }}>
              {JSON.stringify(pattern.tech_sheet, null, 2)}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}
