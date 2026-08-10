# LearnPath AI — Personal AI Study Agent

> Turn any learning goal into a structured, AI-powered curriculum. Generate roadmaps, consume AI-written lessons, get quiz-tested, and chat with your personal AI Mentor — all in one place.

---

## Problem

Generic AI tools (ChatGPT, Gemini) give generic answers. They don't know your skill level, your university syllabus, or what you've already studied. The result is a stream of advice that never becomes a plan.

Learners — especially Indian engineering students preparing for placements — need:

1. A **structured, personalized curriculum** that advances logically from foundations to expert topics.
2. **On-demand content generation** so they never hit a wall waiting for material.
3. An **AI Mentor** that can answer questions _in context of what they're learning_.
4. **Progress tracking** that turns abstract effort into measurable momentum.

---

## Solution

LearnPath AI is a full-stack AI application that:

- Generates a **multi-phase learning roadmap** (phases → modules → lessons) from a single goal prompt using Groq + Llama 3.3 70B.
- **Lazily generates lesson content** (markdown, worked examples, exercises) on first access and caches it in PostgreSQL — no upfront generation cost.
- Runs a **context-aware AI Mentor** chat backed by conversation history.
- Tracks XP, streaks, quiz scores, and study time per user with full data isolation.
- Deploys as a single Node.js service (Express + Vite development middleware and production static serving) with Supabase Auth, Drizzle ORM, and Render.

Source: [github.com/rohanxlabs/LearnPath-AI-v3](https://github.com/rohanxlabs/LearnPath-AI-v3)

---

## Core Features

| Feature | Status |
|---|---|
| AI roadmap generation (SSE streaming) | ✅ Live |
| Phases → Modules → Lessons curriculum structure | ✅ Live |
| Lazy AI lesson content generation + caching | ✅ Live |
| AI quiz generation per lesson | ✅ Live |
| AI Mentor chat with conversation history | ✅ Live |
| Progress tracking (XP, streaks, study minutes) | ✅ Live |
| Resource recommendations per module | ✅ Live |
| Phase projects with difficulty ladder | ✅ Live |
| PWA (installable, offline shell) | ✅ Live |
| Supabase Auth (email/password + magic link) | ✅ Live |
| Sentry error tracking (frontend + backend) | ✅ Live |
| Redis-backed shared rate limiting (Upstash) | ✅ Live |

---

## AI Architecture

### Roadmap Generation Pipeline

```
User submits goal + preferences
        │
        ▼
POST /api/generate-roadmap-stream   (SSE)
        │
        ▼
callGroqChatCompletion()            (llama-3.3-70b-versatile primary,
        │                            llama-3.1-8b-instant fallback,
        │                            20s timeout + AbortController)
        ▼
cleanAndParseJSON()                 (jsonrepair handles truncated/malformed output)
        │
        ▼
validateCurriculumQuality()         (quality score 0-100, structured issue list)
        │
  score ≥ 60? ──No──► retry with corrective prompt (max 2 retries)
        │
       Yes
        ▼
validateAndNormalizeCurriculum()    (ID scoping, dedup, prerequisite DAG validation,
        │                            hallucinated URL detection + removal)
        ▼
POST /api/roadmaps                  (client persists to DB via createRoadmapFromJson)
        │
        ▼
Drizzle ORM → PostgreSQL            (roadmaps + phases + modules + lessons + resources
                                     + phase_projects written atomically)
```

**Key engineering decisions:**

- **SSE streaming** so the UI shows phase names as they arrive instead of a blank spinner for 30s.
- **Quality gate + corrective retry**: a score below 60/100 triggers a second Groq call with the exact list of issues. This catches generic titles, missing prerequisites, and duplicate names before they hit the DB.
- **Fallback curriculum**: if all AI attempts fail (provider outage, quota exhausted), a domain-detected local curriculum is returned instantly — the user never sees a broken screen.
- **`jsonrepair`** handles the most common LLM failure mode: trailing commas, truncated arrays, and misquoted strings.

### Lesson Generation Pipeline

```
GET /api/topics/:lessonId
        │
        ├─ content exists in DB? ──Yes──► serve immediately
        │
        └─No──► fire-and-forget getOrGenerateLessonContent()
                        │
                        ├─ in-flight Map (prevents duplicate Groq calls)
                        ├─ buildLessonPrompt() (subject-aware: programming/math/theory)
                        ├─ scoreLessonMarkdown() (validates sections present)
                        ├─ fallback markdown if score < threshold
                        └─ upsertLessonContent() → PostgreSQL
```

Content is cached in-process (LRU, 100 entries, 30 min TTL) and in PostgreSQL permanently. A lesson is only ever generated once.

### AI Mentor

- History bounded to last 20 turns, each turn truncated to 500 chars — prevents context abuse.
- Prompt injection neutralisation in `sanitizeForPrompt()`: NFKC normalisation, zero-width char stripping, role-marker replacement.
- Graceful fallback response on provider failure — never returns a 500 to the user.

---

## System Architecture

```
Browser (React 19 + Vite PWA)
        │  JWT Bearer token (Supabase Auth)
        ▼
Express 4 server  ──── Helmet, CORS, Pino HTTP logger
        │               Rate limiting (express-rate-limit + Upstash Redis)
        ├── /api/auth       Supabase JWKS verification (ES256 / HS256)
        ├── /api/roadmaps   Roadmap CRUD + SSE generation
        ├── /api/lessons    Lazy lesson content + quiz generation
        ├── /api/ai         Mentor chat, recommendations, hints
        └── /api/user       Stats, progress, profile, analytics
        │
        ▼
Drizzle ORM (pg pool)
        │
        ▼
PostgreSQL (Supabase / Neon)
  users · roadmaps · phases · modules · lessons
  lesson_content · quizzes · resources · phase_projects
  user_lesson_progress · user_roadmap_state
        │
        ▼
Groq API  (llama-3.3-70b-versatile → llama-3.1-8b-instant fallback)
```

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React 19 + TypeScript | Concurrent rendering, stable ecosystem |
| Styling | Tailwind CSS v4 | Utility-first, zero runtime |
| Animation | Framer Motion + anime.js | Declarative + imperative animation where each fits |
| Backend | Express 4 + Node.js 22 | Familiar, minimal, works well with Vite middleware |
| ORM | Drizzle ORM | Type-safe, lightweight, no magic |
| Database | PostgreSQL (Supabase) | ACID, jsonb for flexible content, free hosting |
| Auth | Supabase Auth | JWT + PKCE, handles email/magic link/OAuth |
| AI | Groq (Llama 3.3 70B) | Fastest inference available, generous free tier |
| Error tracking | Sentry (frontend + backend) | Real production error attribution |
| Rate limiting | express-rate-limit + Upstash Redis | Shared counters across instances |
| Deployment | Render + render.yaml | IaC config, health checks, auto-deploy on push |
| CI/CD | GitHub Actions | Type-check → test → build → deploy pipeline |

---

## Run Locally

**Prerequisites:** Node.js 22+, pnpm 9+, a PostgreSQL database, a Supabase project, and a Groq API key.

```bash
# 1. Install dependencies
pnpm install

# 2. Configure environment
cp .env.example .env
# Fill in DATABASE_URL, GROQ_API_KEY, SUPABASE_URL,
# SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
# VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY

# 3. Apply DB migrations
pnpm run db:migrate

# 4. Start dev server (Express + Vite on one port)
pnpm run dev

# Open http://localhost:3000
```

| Command | Purpose |
|---|---|
| `pnpm run lint` | TypeScript type check |
| `pnpm run test:ci` | Vitest unit + integration tests |
| `pnpm run build` | Production build (Vite + esbuild) |
| `pnpm run db:studio` | Drizzle Studio (DB browser) |

---

## Environment Variables

See [`.env.example`](.env.example) for the full reference. Required variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `GROQ_API_KEY` | Groq AI API key |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server only) |
| `VITE_SUPABASE_URL` | Same as SUPABASE_URL (exposed to browser) |
| `VITE_SUPABASE_ANON_KEY` | Same as SUPABASE_ANON_KEY (exposed to browser) |

---

## Key Engineering Decisions

**Chosen: Groq over OpenAI**
Groq's inference speed (200–300 tok/s vs ~40 tok/s) makes roadmap generation feel instant. The free tier is sufficient for a portfolio-scale deployment. The fallback cascade (`llama-3.3-70b → llama-3.1-8b`) ensures availability during quota bursts.

**Chosen: SSE streaming for roadmap generation over polling**
A roadmap generation takes 10–25s. SSE lets the UI animate phase names as they arrive rather than showing a spinner. This is meaningfully better UX with minimal backend complexity.

**Chosen: Lazy lesson generation over upfront generation**
A 5-phase roadmap contains ~100 lessons. Generating all content at creation time would take several minutes and cost ~100 AI calls. Lazy generation on first open means zero upfront cost and content is cached permanently after first access.

**Chosen: Normalized relational schema over JSONB blob**
Earlier versions stored the entire roadmap as a JSONB column. This made querying progress across users impossible. The normalized schema (roadmaps → phases → modules → lessons → user_lesson_progress) enables per-user progress isolation, efficient progress queries, and clean cascade deletes.

**Chosen: Per-user mutex (`withUserLock`) for lesson completion**
Without a lock, two concurrent lesson completions for the same user (browser tab + mobile) would both read the same XP value and one award would be silently lost. The in-process AsyncLocalStorage lock prevents this race condition at the Express layer; the DB XP increment is atomic (`UPDATE ... SET xp = xp + $1`).
