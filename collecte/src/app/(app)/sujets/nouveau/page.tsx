"use client";

import { PageHeader } from "@/components/ui";
import { SubjectForm } from "@/components/SubjectForm";

export default function NouvelleFiche() {
  return (
    <>
      <PageHeader title="Nouvelle fiche" />
      <SubjectForm />
    </>
  );
}
