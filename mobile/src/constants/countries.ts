export interface Country {
  code: string;
  dial: string;
  flag: string;
  name: string;
}

export const COUNTRIES: Country[] = [
  { code: "CM", dial: "+237", flag: "\u{1F1E8}\u{1F1F2}", name: "Cameroun" },
  { code: "CI", dial: "+225", flag: "\u{1F1E8}\u{1F1EE}", name: "Côte d'Ivoire" },
  { code: "SN", dial: "+221", flag: "\u{1F1F8}\u{1F1F3}", name: "Sénégal" },
  { code: "BJ", dial: "+229", flag: "\u{1F1E7}\u{1F1EF}", name: "Bénin" },
  { code: "TG", dial: "+228", flag: "\u{1F1F9}\u{1F1EC}", name: "Togo" },
  { code: "BF", dial: "+226", flag: "\u{1F1E7}\u{1F1EB}", name: "Burkina Faso" },
  { code: "ML", dial: "+223", flag: "\u{1F1F2}\u{1F1F1}", name: "Mali" },
  { code: "GA", dial: "+241", flag: "\u{1F1EC}\u{1F1E6}", name: "Gabon" },
  { code: "CG", dial: "+242", flag: "\u{1F1E8}\u{1F1EC}", name: "Congo" },
  { code: "CD", dial: "+243", flag: "\u{1F1E8}\u{1F1E9}", name: "RD Congo" },
  { code: "GH", dial: "+233", flag: "\u{1F1EC}\u{1F1ED}", name: "Ghana" },
  { code: "NG", dial: "+234", flag: "\u{1F1F3}\u{1F1EC}", name: "Nigeria" },
];