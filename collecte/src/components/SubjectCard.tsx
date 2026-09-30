"use client";

import Link from "next/link";
import { Badge } from "./ui";
import { IconCamera, IconChevronRight, IconRuler } from "./icons";
import type { ReviewStatus, Subject } from "@/lib/api/collecte";
import { GENDER_LABELS, MEASURE_KEYS, REQUIRED_VIEWS, fmtNum } from "@/lib/protocol";

export const REVIEW_LABELS: Record<ReviewStatus, string> = {
  pending: "À relire",
  validated: "Validée",
  rejected: "Rejetée",
};

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  const tone = status === "validated" ? "success" : status === "rejected" ? "error" : "neutral";
  return <Badge tone={tone}>{REVIEW_LABELS[status]}</Badge>;
}

export function SubjectCard({ subject, showCollector }: { subject: Subject; showCollector?: boolean }) {
  const measured = MEASURE_KEYS.filter((k) => subject.measurements[k] !== undefined).length;
  const views = new Set(subject.photos.map((p) => p.view));
  const requiredOk = REQUIRED_VIEWS.filter((v) => views.has(v)).length;
  const date = new Date(subject.measured_at ?? subject.created_at).toLocaleDateString("fr-FR");

  return (
    <Link href={`/sujets/${subject.id}`} className="subjectCard">
      <div className="subjectMain">
        <div className="subjectTop">
          <strong className="subjectCode">{subject.code}</strong>
          <ReviewBadge status={subject.review_status} />
          {!subject.complete && <Badge tone="pending">Incomplète</Badge>}
        </div>
        <span className="muted small">
          {GENDER_LABELS[subject.gender]} · {fmtNum(subject.height_cm)} cm · {fmtNum(subject.weight_kg)} kg · {date}
          {subject.city ? ` · ${subject.city}` : ""}
          {showCollector && subject.collector_name ? ` · ${subject.collector_name}` : ""}
        </span>
        <span className="subjectMeta">
          <span className={measured === 12 ? "okText" : "warnText"}>
            <IconRuler size={14} aria-hidden /> {measured}/12
          </span>
          <span className={requiredOk === REQUIRED_VIEWS.length ? "okText" : "warnText"}>
            <IconCamera size={14} aria-hidden /> {subject.photos.length} photo(s)
          </span>
        </span>
      </div>
      <IconChevronRight size={20} aria-hidden className="subjectChevron" />
    </Link>
  );
}
