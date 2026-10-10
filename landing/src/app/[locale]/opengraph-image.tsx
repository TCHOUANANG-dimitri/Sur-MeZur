import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";

import { getDictionary } from "@/i18n";
import { locales } from "@/i18n/config";

/*
 * Image d'aperçu partagée sur WhatsApp, Facebook, LinkedIn : générée à la
 * construction du site, dans la langue de la page, avec la promesse et le
 * logo. Aucune image à fournir.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Sur-MeZur";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function OpengraphImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const dict = getDictionary(locale);
  const mark = fs.readFileSync(path.join(process.cwd(), "public/brand/mark.png")).toString("base64");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "70px 80px",
          background: "linear-gradient(135deg, #FFFFFF 0%, #F3ECFF 55%, #E4D4FF 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 760 }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: "#5D06CC", letterSpacing: 2 }}>SUR-MEZUR</div>
          <div style={{ marginTop: 26, fontSize: 68, fontWeight: 800, lineHeight: 1.05, color: "#08044D" }}>
            {dict.meta.ogTitle}
          </div>
          <div style={{ marginTop: 28, fontSize: 30, color: "#4E4780" }}>{dict.meta.ogSub}</div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`data:image/png;base64,${mark}`} width={300} height={382} alt="" />
      </div>
    ),
    size,
  );
}
