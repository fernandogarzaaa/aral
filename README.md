# Aral

Aral is an offline-first study companion. Paste lecture notes and get a
summary, flashcards, and a quiz. Short notes run on-device with Gemini
Nano. Long notes fall back to the cloud with Gemini. The routing decision
is shown in the UI every time, with the latency and the reason.

Aral means study or lesson in Tagalog. It is built for students with
intermittent connectivity. On-device study is free, private, and works
offline. The cloud handles long material.

Built for #BuildHybridAI 2026 on Devpost.

## How hybrid inference works

Aral uses Firebase AI Logic with `InferenceMode.PREFER_ON_DEVICE`.

1. The app reads your notes and decides a route. Short notes go
   on-device. Long notes go to the cloud. Offline notes go on-device.
2. The on-device model is prepared on a button click, as the SDK
   requires. The first use downloads the Gemini Nano model in Chrome.
3. Each call reports where it actually ran through
   `response.inferenceSource`. The UI shows On-device, Cloud, or Demo.
4. The cloud model is `gemini-3.5-flash-lite`.

Thresholds come from Firebase Remote Config with local defaults:
`max_on_device_chars` 8000 and `cloud_threshold_chars` 6000. The
routing logic lives in `src/lib/router.ts` and is fully unit tested.

## Demo mode

Without your own Firebase config, Aral runs on a built-in demo provider
that builds deterministic study material from your notes. The UI says
Demo mode clearly. The full study loop works: summary, flashcards,
quiz, and the saved library.

The shipped deployment is wired to a real Firebase project
(`aral-hybrid-ai`, free Spark plan) with Firebase AI Logic, App Check,
Anonymous Auth, Firestore, and Remote Config. That path is verified
end to end: a real Gemini summary renders through the cloud fallback,
and the UI reports the honest source for every run.

## Setup

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env` and fill in your Firebase project values
to use real hybrid inference:

```bash
cp .env.example .env
```

Firebase setup, in the console:

1. Create a project on the free Spark plan. No payment details.
2. Add a web app and copy the config values into `.env`.
3. Open AI Services, then AI Logic, then Get started. Follow the guided
   setup to enable the Gemini Developer API backend.
4. Enable App Check and register the app. For local dev, set the debug
   token flag before App Check init. The app does this automatically
   when a reCAPTCHA Enterprise site key is present in `.env`.

On-device inference needs Chrome Desktop 139 or newer with the Prompt
API flag on: `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`.

## Run

```bash
npm run dev      # start the dev server
npm run build    # typecheck and build for production
npm test         # run unit tests with Vitest
npm run preview  # serve the production build
```

## Features

- Summary, flashcards, and quiz from pasted notes.
- Visible routing badge with latency and reason for every run.
- On-device model preparation with download progress.
- Flashcard flip UI and scored quiz UI.
- Library of saved study sets in localStorage.
- Firestore sync when Firebase is configured and signed in. Anonymous
  sign-in runs at startup. Without Firebase, sets stay on the device
  and the app says so plainly.

## License

Apache-2.0. See LICENSE.
