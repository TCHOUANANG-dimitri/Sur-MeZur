/**
 * Ouvrir le telephone sur un client : enregistrer le contact, ecrire sur
 * WhatsApp. Le site tourne surtout dans l'application Android (TWA, donc
 * Chrome) : on y utilise les liens `intent:` d'Android, qui ouvrent
 * directement l'application voulue. Ailleurs (iPhone, ordinateur), on se
 * rabat sur ce que le systeme sait faire : fiche contact .vcf, lien wa.me.
 */

export function isAndroid(): boolean {
  return typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
}

/** Chiffres seuls, indicatif compris (format attendu par WhatsApp). */
export function digitsOnly(phone: string): string {
  return phone.replace(/[^0-9]/g, "");
}

/** Copie dans le presse-papiers ; rend faux si le navigateur refuse. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Repli pour les WebView sans API presse-papiers.
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function vcard(name: string, phone: string): string {
  const clean = name.replace(/[\r\n;,]/g, " ").trim();
  return ["BEGIN:VCARD", "VERSION:3.0", `FN:${clean}`, `N:${clean};;;;`, `TEL;TYPE=CELL:${phone}`, "END:VCARD", ""].join("\r\n");
}

/**
 * Ouvre l'ecran « nouveau contact » du telephone, nom et numero deja remplis.
 * Android : application Contacts. Ailleurs : fiche .vcf, que l'iPhone ouvre
 * dans Contacts et qu'un ordinateur telecharge.
 */
export function openNewContact(name: string, phone: string): void {
  if (isAndroid()) {
    window.location.href =
      "intent:#Intent;action=android.intent.action.INSERT;type=vnd.android.cursor.dir/raw_contact;" +
      `S.name=${encodeURIComponent(name)};S.phone=${encodeURIComponent(phone)};end`;
    return;
  }
  const url = URL.createObjectURL(new Blob([vcard(name, phone)], { type: "text/vcard" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "contact"}.vcf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Lien qui ouvre directement la conversation WhatsApp avec ce numero. */
export function whatsappHref(phone: string, text?: string): string {
  const n = digitsOnly(phone);
  const web = `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
  if (!isAndroid()) return web;
  // Sans `package` : WhatsApp ou WhatsApp Business, celui qui est installe.
  const query = `phone=${n}${text ? `&text=${encodeURIComponent(text)}` : ""}`;
  return `intent://send?${query}#Intent;scheme=whatsapp;S.browser_fallback_url=${encodeURIComponent(web)};end`;
}
