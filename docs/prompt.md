# Plant Identifier App — Build Plan

Take-home case study, Part 1 (mobile app). 4-day deadline. One core flow, built well — not multiple screens, well written code.

## Fixed Decisions

- **Framework:** Expo (React Native + TypeScript)
- **Testing:** Physical iPhone via Expo Go — no Mac/Xcode/simulator
- **AI:** Vision-capable LLM (not a plant-classification API) — demonstrates prompt/AI engineering
- **Routing:** EachLabs unified LLM endpoint; fallback to a direct provider if it lacks vision support
- **Security:** EachLabs key stays server-side only, never in client code
- **Scope:** One screen — capture/select photo → identify → show result. No accounts, history, batches, offline mode

## Standout Features

1. **Uncertainty follow-up** — on low confidence, name the top alternative(s) and suggest what would help confirm (e.g. "photo the leaf underside")
2. **Toxicity flag** — flag if toxic to pets/children as part of the same structured response

Both are prompt/schema additions only — no new screens.

## Architecture

```
Expo app (iPhone) → Backend proxy → EachLabs LLM (vision) → Backend proxy → Expo app
```

Proxy's only job: keep the API key server-side, forward image+prompt, return JSON.

## Steps

1. Scaffold Expo app (TS template) + `expo-image-picker`
2. Confirm Expo Go live-reload works on the iPhone before building features
3. Build capture screen: photo/gallery picker, preview, "Identify" button
4. Build backend proxy: one endpoint, image in → EachLabs call → JSON out
5. Design prompt + JSON schema: name, scientific name, confidence, description, care tips, disambiguation info, toxicity flag. Model must flag low confidence / non-plant rather than guess
6. Build results screen: render all fields; toxicity as a visible warning badge; disambiguation tip near confidence
7. Handle failure modes: no network, timeout, permission denied, low-confidence/non-plant
8. Submission: GitHub repo + README (architecture + key decisions) + demo video

## Left to Implementer

- UI styling/layout/components
- Exact JSON field names/shape (must cover the fields in step 5)
- Specific vision model via EachLabs
- Error copy, loading states
- State management approach (plain state likely enough)
- Project file structure

## Checklist

- [x] App runs live on iPhone via Expo Go
- [ ] Capture → identify → structured result, incl. disambiguation + toxicity
- [ ] Key server-side only
- [ ] Core failure modes handled
- [ ] Repo + README + demo video