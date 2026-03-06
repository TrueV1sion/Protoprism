# PRISM Onboarding Design

**Goal:** Add a polished onboarding experience for non-technical stakeholders — product intro, environment readiness check, pipeline config presets, and a guided coach-marks tour through the first analysis.

**Audience:** Non-technical stakeholders seeing demos. No CLI setup instructions.

**Persistence:** Onboarding wizard shows every cold load until user checks "Don't show again." Coach marks show during first analysis until completed or skipped.

---

## 1. Welcome Wizard

A full-screen overlay (viewport-filling, matching the app's existing phase aesthetic) with 4 steps and a progress indicator.

### Step 1: Welcome

- Animated PRISM logo with gradient glow treatment
- Headline: "PRISM | Strategic Intelligence"
- 2-3 sentence plain-language value prop
- "Next" button

### Step 2: System Readiness

- Calls `GET /api/onboarding/status` to check:
  - `ANTHROPIC_API_KEY` present (env or DB)
  - Database initialized (Settings record exists)
- Each check shown as a card with green checkmark or amber warning
- Missing keys: inline text input + "Save" button, stored encrypted in `ApiKey` table
- Note: "Demo Mode available without API keys"
- "Next" enabled regardless (missing keys = no live mode, demo still works)

### Step 3: Configure Defaults

- Three selectable preset cards:
  - **Quick Scan** — 3 agents, Sonnet-only, ~2 min
  - **Standard Analysis** — 5-8 agents, Opus think + Sonnet deploy, ~5 min (pre-selected)
  - **Deep Investigation** — 10-15 agents, full Opus, ~10 min
- Expandable "Advanced Settings" section: autonomy mode, memory bus, critic pass toggles
- Saves to existing `Settings` table

### Step 4: Ready

- "You're all set" confirmation with config summary
- "Don't show this again" checkbox (persisted to Settings)
- "Begin Analysis" button transitions to InputPhase

---

## 2. Coach Marks System

Lightweight overlay tooltips activated during the user's first analysis run.

### Marks

| Trigger | Target (`data-tour-id`) | Message |
|---------|------------------------|---------|
| Blueprint phase loads | "Deploy Agents" button | "Review the AI team assembled for your query. When ready, deploy them." |
| Executing phase loads | Agent card grid | "Each agent independently researches its assigned dimension in parallel." |
| Triage phase loads | First FindingCard | "Review each finding. Keep, boost, flag, or dismiss before synthesis." |
| Synthesis phase loads | Synthesis layers | "PRISM weaves agent findings into layered strategic insights." |
| Complete phase loads | "View Brief" button | "Your executive brief is ready. Open it to see the final output." |

### Behavior

- Each mark appears once, advances on "Got it" click
- "Skip tour" dismisses all remaining and sets `hasCompletedTour = true`
- Non-blocking: user can interact with UI behind the mark
- Rendered via React portal, positioned relative to `data-tour-id` target elements

---

## 3. Data Model & API

### Prisma Schema Changes

Add to `Settings` model:
- `onboardingDismissed Boolean @default(false)`
- `hasCompletedTour Boolean @default(false)`

New `ApiKey` model:
- `id String @id @default(uuid())`
- `provider String` ("anthropic", "openai", etc.)
- `encryptedKey String`
- `createdAt DateTime @default(now())`
- `updatedAt DateTime @updatedAt`

### New API Routes

- `GET /api/onboarding/status` — Returns `{ onboardingDismissed, hasCompletedTour, keys: { anthropic: boolean, openai: boolean } }`
- `POST /api/onboarding/keys` — Accepts `{ provider, key }`, encrypts and stores
- `POST /api/onboarding/dismiss` — Sets `onboardingDismissed = true`
- `POST /api/onboarding/tour-complete` — Sets `hasCompletedTour = true`

### Key Resolution Order (pipeline executor)

1. `process.env.ANTHROPIC_API_KEY`
2. Decrypt from `ApiKey` table
3. Both missing = live mode unavailable

### Encryption

`src/lib/crypto.ts` using Node `crypto.createCipheriv` with AES-256-GCM. Key derived from `ENCRYPTION_SECRET` env var (auto-generated on first run if absent).

---

## 4. Component Architecture

### New Components

- `src/components/onboarding/OnboardingWizard.tsx` — Full-screen overlay, step state management
- `src/components/onboarding/WelcomeStep.tsx` — Brand intro
- `src/components/onboarding/ReadinessStep.tsx` — API key check + inline input
- `src/components/onboarding/ConfigStep.tsx` — Preset selector + advanced expandable
- `src/components/onboarding/ReadyStep.tsx` — Summary + dismiss checkbox
- `src/components/onboarding/CoachMark.tsx` — Floating tooltip with highlight ring
- `src/components/onboarding/CoachMarkProvider.tsx` — Context provider, tracks shown marks, renders active mark

### Integration Points

- `page.tsx` — Fetch `/api/onboarding/status` on mount. If `!onboardingDismissed`, render wizard overlay. Wrap phase router in `CoachMarkProvider`.
- Phase components — Add `data-tour-id` attributes to key elements. No other changes.
- Pipeline executor — Add `resolveApiKey(provider)` helper (env then DB lookup).

### No Changes To

Existing phase component logic, styling, or layout. Coach marks float via portal. Wizard is a separate gating layer.
