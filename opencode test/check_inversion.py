import json
from pathlib import Path
RACINE = Path(__file__).resolve().parents[1]
inv = json.load(open(str(RACINE / "opencode test" / "inversion.json"), encoding="utf-8"))
tags = {}
for uid, d in inv.items():
    for tag, r in d.items():
        if r.get("ok"):
            a = [abs(v) for v in r["residus"].values()]
            tags.setdefault(tag, []).append(sum(a) / len(a))
for tag, v in sorted(tags.items()):
    print(f"{tag:10} n={len(v):3} residu moyen={sum(v)/len(v):.2f} cm")
