# Claw Bot Command Center

> **Experimental Vite/React control interface with voice and synthesis components**

Claw Bot Command Center is a small TypeScript browser application. The tracked
source provides the application shell, an `AssistantVoice` component, a
`ClawSynthesizer` component and audio utility functions. No backend service or
credential configuration is included.

## Structure

```text
App.tsx                    application entry component
components/AssistantVoice  voice-oriented UI component
components/ClawSynthesizer synthesis-oriented UI component
services/audioUtils.ts     client-side audio helpers
metadata.json              application metadata
```

## Requirements and local run

Use current Node.js and npm:

```bash
npm install
npm run dev
```

The project also declares `npm run build` and `npm run preview`.

## Status and limitations

This is an AI Studio/Vite prototype. The component names describe interface
intent, not a hosted assistant, speech service or completed voice pipeline.
Browser access to microphones and audio devices is subject to browser
permissions and must be used with user consent.

## Licence

No licence file is present in the repository.
