"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SubjectForm } from "@/components/SubjectForm";
import { ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { CollecteApi, type Subject } from "@/lib/api/collecte";
import { friendlyError, withRetry } from "@/lib/retry";

export default function Modifier() {
  const { id } = useParams<{ id: string }>();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    withRetry(() => CollecteApi.get(id), 2)
      .then(setSubject)
      .catch((e) => setError(friendlyError(e, "réessayez")));
  }, [id]);

  return (
    <>
      <PageHeader title={subject ? `Modifier ${subject.code}` : "Modifier"} back />
      {subject ? (
        <SubjectForm subject={subject} />
      ) : (
        <div className="containerNarrow section">{error ? <ErrorBanner message={error} /> : <Spinner label="Chargement…" />}</div>
      )}
    </>
  );
}
