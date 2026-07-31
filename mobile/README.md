# Sur-MeZur — mobile (Expo SDK 54 / React Native)

Native rewrite of the Sur-MeZur client/tailor/admin apps, built with Expo SDK
54 (React Native 0.81, React 19, New Architecture enabled — required for
current Expo Go) and Expo Router (file-based navigation, matching the `app/`
tree below).
Talks to the same FastAPI backend as `../frontend/` — no backend changes were
needed; only the client changed.

## Design fidelity

- Colors, gradient, radii, fonts (Playfair Display for headings, Inter for
  body) all come from `src/theme/tokens.ts`, ported 1:1 from doc 1's brand
  section.
- **No emoji anywhere in the UI** — every icon is a [Lucide](https://lucide.dev)
  icon via `lucide-react-native`, matching doc 1 §1's "icônes linéaires
  (Lucide)" spec exactly (the web build used a few emoji as tab icons; this
  native build replaces all of them: `Home`, `Search`, `Shirt`, `Package`,
  `User`, `LayoutDashboard`, `Scissors`, `Wallet`, `BadgeCheck`, `Scale`,
  `Star`, `Percent`, `Bell`, `Camera`, `CheckCircle2`, `Pencil`, `ChevronLeft`,
  `Inbox`).
- The 3D avatar/try-on viewer (`src/components/Viewer3D.tsx`) is real,
  interactive 3D — `expo-gl` + `three` directly (a `GLView` context handed to
  `THREE.WebGLRenderer`), with drag-to-orbit via `PanResponder`. Same
  procedural-mannequin approach as the web build (sized from the client's
  actual measurement numbers, tinted by skin tone / fabric color) — this is
  the "placeholder Viewer 3D" the spec explicitly allows, just rendered
  through native GL instead of a DOM canvas.

## What's real vs. mocked

Same as the backend (see the root `README.md`'s table) — this app is a pure
client, so it inherits whichever mocks the backend has: AI measurement/
avatar/try-on/pattern generation are deterministic mocks behind real
contracts, Mobile Money is a sandbox provider, OTP is returned directly
instead of sent by SMS.

## Running it

```bash
cd mobile
npm install
```

The backend must be reachable at an absolute URL (unlike the web build,
which could proxy `/api` through Vite). By default `src/config.ts` targets:
- `http://10.0.2.2:8000` on Android (emulator's alias for the host machine)
- `http://localhost:8000` on iOS simulator / web

For a **physical device running Expo Go**, both the phone and the dev
machine must be on the same network, and you must point the app at the dev
machine's LAN IP:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.42:8000 npx expo start
```

(swap `192.168.1.42` for your machine's actual LAN IP; `ipconfig` on Windows).

Then, with the backend running (see root README):

```bash
npx expo start          # scan the QR code in Expo Go, or press a/i for an emulator/simulator
npm run typecheck       # tsc --noEmit
```

### Demo accounts

Same as the backend seed data — see the root `README.md`. Quickest path:
language screen → onboarding → "Connexion" → phone `+237600000001` /
password `password123` (pre-filled as the login screen's default) for the
client account.

## Verification performed

- `npx tsc --noEmit` passes clean (strict mode).
- `npx expo export --platform android` — a full production Metro bundle —
  completes successfully, which validates that every screen's imports
  resolve and the JS bundle actually builds (not just type-checks).
- **Not verified**: on-device/emulator rendering. This session had no
  Android/iOS emulator, no physical device, and no working network path to
  install a headless-browser/Expo-Go automation tool, so nothing here has
  been visually confirmed to render or been clicked through. Please run
  `npx expo start` and open it in Expo Go or a simulator yourself before
  trusting the UI beyond "it compiles and bundles."

## Project structure

```
app/                       expo-router routes (file-based)
  _layout.tsx               root: fonts, providers, top-level Stack
  index.tsx                 splash
  language.tsx / onboarding.tsx / role.tsx / register.tsx / login.tsx
  client/
    _layout.tsx              role guard (redirects if not logged in as client)
    (tabs)/                  home, search, tryon, orders, profile — bottom tabs
    tailors/[id].tsx, models/, ready-to-wear/[id].tsx
    measurements.tsx, avatar.tsx
    orders/new.tsx, orders/[id]/(index|negotiation|payment|chat|review).tsx
  tailor/                    mirrors client/, plus verification.tsx, orders/[id]/quote.tsx & pattern.tsx
  admin/                     (tabs)/ verifications, disputes, reviews, commission
src/
  theme/tokens.ts            design tokens
  i18n/                      fr.json/en.json + AsyncStorage-backed provider
  api/                       client.ts (fetch+AsyncStorage), types.ts, endpoints.ts
  state/AuthContext.tsx
  components/                Button, Card, Chip, BottomSheet (RN Modal), Badges,
                              Stars, Misc (Header/Field/Spinner/...), DomainCards
                              (PriceSummary/MeasurementRow/QuoteCard/ChatBubble),
                              Viewer3D, Screen (SafeAreaView+ScrollView wrapper)
  screens/shared/             OrderDetail/Negotiation/ChatScreen — one implementation,
                              reused by both client/ and tailor/ routes (thin
                              app/**/[id]/*.tsx files just wire in the orderId)
```
