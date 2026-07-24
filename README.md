# LearnPath AI — Your Personal AI Study Agent

## Problem
Generic AI tools don't know your university syllabus. They give generic advice that doesn't align with what you actually need to study for your exams.

## Solution
An AI agent that builds custom learning roadmaps and quizzes based on your exact curriculum. Tailored specifically for Indian university students following AKTU and other syllabi.

### Features
- 🎯 AI-generated personalized learning roadmaps powered by Groq (Llama 4 Scout)
- 📝 Automatic quiz generation to test your knowledge
- 🏛️ University-specific content tailored to your college
- 📊 Track your progress with XP and completion metrics
- 💬 AI tutor available 24/7 to answer your questions

## Screenshots

> Demo screenshots coming soon — run the app locally to explore the features.

## Run Locally

**Prerequisites:** Node.js 22+, pnpm 9+, a PostgreSQL database, a Supabase project, and a Groq API key.

1. Install dependencies:
   ```
   pnpm install
   ```

2. Copy the environment template and fill it in:
   ```
   cp .env.example .env
   ```

   Required variables (the server refuses to start without all five):

   | Variable | Where to get it |
   |---|---|
   | `DATABASE_URL` | Supabase → Settings → Database → Connection string (URI) |
   | `GROQ_API_KEY` | https://console.groq.com/keys |
   | `SUPABASE_URL` | Supabase → Settings → API |
   | `SUPABASE_ANON_KEY` | Supabase → Settings → API |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API (server only — never expose to the browser) |

   Also set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the same values so the frontend can reach Supabase directly.

3. Apply database migrations:
   ```
   pnpm run db:migrate
   ```

4. Start the dev server (Express + Vite middleware in one process):
   ```
   pnpm run dev
   ```

5. Open **http://localhost:3000** — not 5173. Vite runs in middleware mode behind Express, so there is no separate Vite port.

### Other commands

| Command | Purpose |
|---|---|
| `pnpm run lint` | TypeScript type check (`tsc --noEmit`) |
| `pnpm run test` | Vitest in watch mode |
| `pnpm run build` | Production build (Vite + esbuild server bundle) |
| `pnpm run db:studio` | Drizzle Studio |
