# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

This is a personal website for Dr. Raj Shah, a math educator focused on making math irresistible. The site is built with **11ty (Eleventy)** static site generator and styled with **Tailwind CSS v4** and **DaisyUI** components.

## Common Commands

### Development
```bash
npm start              # Start dev server with hot reload (runs both Eleventy and Tailwind in parallel)
npm run dev            # Same as npm start
npm run dev:eleventy   # Run only Eleventy server with --serve flag
npm run dev:css        # Run only Tailwind CSS in watch mode
```

### Build
```bash
npm run build          # Build for production (runs both CSS and Eleventy builds)
npm run build:eleventy # Build only the static site
npm run build:css      # Build and minify CSS only
```

### Testing
No test suite is configured for this project.

## Architecture

### Technology Stack
- **Static Site Generator**: 11ty (Eleventy) v3.1.2
- **Templating**: Nunjucks (.njk files)
- **Styling**: Tailwind CSS v4 with DaisyUI v5.3.10
- **Build System**: npm-run-all for parallel dev tasks
- **Deployment**: GitHub Actions to GitHub Pages

### Directory Structure

```
src/
├── _data/               # JSON data files used across templates
│   ├── site.json        # Site-wide metadata (name, description, URLs)
│   ├── math_treats.json # Video library data (YouTube/Vimeo embeds)
│   ├── services.json    # Service offerings displayed on homepage
│   ├── philosophy.json  # Philosophy pillars for homepage
│   ├── testimonials.json
│   ├── talks.json
│   └── media.json
├── _includes/
│   ├── base.njk         # Main layout template with header/footer
│   └── components/
│       └── Modal.js     # Reusable modal component (uses common-tags)
├── styles/
│   └── input.css        # Tailwind entry point with custom theme
├── images/              # Static images
├── assets/
│   ├── css/             # Page-specific CSS (24game, kenken)
│   └── js/              # Interactive JavaScript (games, puzzles)
├── *.njk                # Page templates (index, about, speaking, etc.)
└── CNAME                # Custom domain configuration

_site/                   # Build output directory (git-ignored)
```

### Key Components

#### 11ty Configuration (.eleventy.js)
- **Custom Shortcodes**:
  - `{% video platform videoId title %}` - Embed YouTube/Vimeo videos
  - `{% podcast episodeUrl title %}` - Embed Apple Podcasts episodes
  - `{% Modal id title body %}` - Bootstrap-style modal dialogs
- **Passthrough Copy**: Styles, images, assets, CNAME
- **Input/Output**: `src/` → `_site/`

#### Styling System
- **Tailwind CSS v4** with `@import "tailwindcss"` syntax
- **Custom Theme**:
  - Primary color: `#5741AC` (purple)
  - Secondary color: `#00A2FF` (blue)
  - Font: Montserrat (Google Fonts)
- **DaisyUI** for component styling with custom theme
- Custom utility: `.btn` automatically gets `rounded-full`

#### Data-Driven Content
All page content uses JSON files in `src/_data/` to separate content from presentation. This allows non-developers to update content without touching templates.

#### Interactive Features
- **KenKen Puzzle Game** (`kenken.njk`, `assets/js/kenken.js`): Daily seeded 5×5 logic puzzle with timer, undo/redo, pencil mode, and local storage persistence
- **24 Game** (`assets/js/24game.js`): Math game implementation
- Custom Modal system for help dialogs and game states

### Deployment

GitHub Actions workflow (`.github/workflows/build_and_deploy.yml`) automatically:
1. Installs dependencies with `npm ci`
2. Runs `npm run build`
3. Deploys `_site/` to GitHub Pages (gh-pages branch)

Triggered on every push to `main` branch.

### Content Management

When adding new pages:
1. Create `.njk` file in `src/` with frontmatter setting `layout: base.njk`
2. Add navigation links in `src/_includes/base.njk` header
3. For data-heavy pages, create corresponding JSON file in `src/_data/`

### Custom Shortcodes Usage

**Video embed**:
```nunjucks
{% video "youtube" "VIDEO_ID" "Optional Title" %}
```

**Podcast embed**:
```nunjucks
{% podcast "https://podcasts.apple.com/us/podcast/.../id123?i=456" "Episode Title" %}
```

**Modal dialog**:
```nunjucks
{% Modal 
  id="modalId",
  title="Modal Title", 
  body="<p>HTML content</p>" 
%}
```

## Rush Hour Daily Puzzle Game

The Rush Hour game lives at `src/games/rush-hour.njk`, `src/assets/js/rush-hour.js`, and `src/assets/css/rush-hour.css`.

### Puzzle Library

Puzzles are defined in the `PUZZLES` array near the top of `rush-hour.js`. Each puzzle is an array of vehicle objects:

```javascript
[
  { id: 'T', row: 2, col: 0, length: 2, dir: 'H', isTarget: true  },
  { id: 'A', row: 1, col: 2, length: 2, dir: 'V', isTarget: false },
  // ...
]
```

### Vehicle Object Fields

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique identifier within the puzzle (e.g. `'A'`, `'B'`). Also drives color assignment. |
| `row` | int 0–5 | Top-most row the vehicle occupies (0 = top). |
| `col` | int 0–5 | Left-most column the vehicle occupies (0 = left). |
| `length` | 2 or 3 | Number of cells the vehicle spans. |
| `dir` | `'H'` or `'V'` | Horizontal (slides left/right) or Vertical (slides up/down). |
| `isTarget` | bool | `true` for exactly one vehicle per puzzle — the red car that must exit. |

### Board Conventions

- Grid is **6×6**, cells addressed `(row, col)` starting at `(0,0)` top-left.
- The **exit** is on the **right wall of row 2** (0-indexed, third row from top).
- The **target car** (`isTarget: true`) must be `dir: 'H'` and placed on row 2.
- **Win condition**: target car's right edge reaches column 5 (`col + length - 1 >= 5`).
- Horizontal vehicles occupy `(row, col)` through `(row, col + length - 1)`.
- Vertical vehicles occupy `(row, col)` through `(row + length - 1, col)`.

### Puzzle Validity Rules

1. **No overlapping cells** — every cell may be occupied by at most one vehicle.
2. **In bounds** — all vehicle cells must be within rows 0–5, cols 0–5.
3. **Exactly one target car** — `isTarget: true` on exactly one vehicle per puzzle.
4. **Target on exit row** — target car must be `row: 2, dir: 'H'`.
5. **Solvable** — there must exist a sequence of legal moves that brings the target car to `col >= 4`. The engine has no built-in solver, so puzzles must be verified externally before adding.

### Adding Puzzles

Append new puzzles to the `PUZZLES` array in `rush-hour.js`. The daily puzzle rotates via `puzzleNumber % PUZZLES.length`, so adding more puzzles automatically extends the cycle.

### Testing / Previewing Puzzles

Append `?puzzle=N` (0-indexed) to the URL to force a specific puzzle, bypassing the daily rotation and localStorage state:

- `/games/rush-hour/?puzzle=0` — first puzzle
- `/games/rush-hour/?puzzle=1` — second puzzle
- etc.

This does **not** affect the real daily saved state.

## Teacher Portal (/teacherportal)

A private, authenticated teacher portal at `/teacherportal/` for managing math lessons and classroom observations. Pages live in `src/teacherportal/` and all use the `minimal.njk` layout (bare HTML shell, no site header/footer).

### Pages
- `index.njk` (`/teacherportal/`) — dashboard with links to Lessons and Observations
- `login.njk` (`/teacherportal/login/`) — email/password login form, with a "Forgot password?" link that triggers `resetPasswordForEmail`
- `reset-password.njk` (`/teacherportal/reset-password/`) — lets a user set a password after clicking either a password-recovery link or an invite link (Supabase's invite flow signs the user in directly without asking for a password, so invites also redirect here instead of straight to `/teacherportal/`)
- `lesson-index.njk` / `lesson-edit.njk` — browse, create, edit, delete math lessons (with diagram image upload)
- `observation-index.njk` / `observation-edit.njk` / `observation-show.njk` — create, edit, list, and view classroom lesson observations (scored 0–5 across Planning/Launch/Problem Solving/Closing)

### Authentication
- Backed by **Supabase Auth** (email/password), client-side only — no server/serverless functions involved. Public sign-up is disabled at the project level; teachers are provisioned manually (see Authorization Model below).
- `src/assets/js/lessons-supabase-client.js` creates the Supabase client (project URL + publishable anon key hardcoded in the file) and exposes `getCurrentUser`, `signIn`, `signOut`, `resetPasswordForEmail`.
- `src/assets/js/teacher-portal-auth-guard.js` provides the guard used by every protected page:
  - `requireAuth()` — calls `getCurrentUser()`; if no session, redirects to `/teacherportal/login/` and throws to halt page script execution.
  - `logout()` — signs out via Supabase then redirects to `/teacherportal/login/`.
  - `isAdmin()` — **async**; calls the `is_admin()` Postgres RPC function, which checks `teachers.role = 'admin'` for the current user. This is DB-backed (not a hardcoded email), so it must be `await`-ed at every call site.
- Each protected page's `<script type="module">` block calls `await requireAuth()` (or manually checks `getCurrentUser()` on `index.njk`) before rendering content, and wires the `#logout-btn` to `logout()`.
- `login.njk` redirects already-authenticated users straight to `/teacherportal/` and calls `signIn(email, password)` on submit.
- This is **client-side route protection only** (content briefly exists in the DOM/JS bundle); real data security relies on Supabase Row Level Security policies, not on anything in this repo.

### Authorization Model (Districts, Roles, Ownership)
- `teachers.role` is one of `teacher`, `district_admin` (reserved for future use), or `admin`. `teachers.district_id` (nullable) ties a teacher to one row in the `districts` table (currently just `'Reynoldsburg'`).
- **Lessons** (`math_lessons.district_id`, nullable): `NULL` means visible to every teacher; a set value scopes visibility to that district plus admin. Teachers can only publish/edit lessons in their own district; only admin can set/move a lesson to "All Districts". `math_lessons.created_by` records the authenticated author (distinct from the free-text `author` display name) so that only the author or admin can delete a lesson.
- **Observations** (`observations.observed_teacher_id`, FK to `teachers.id`): identifies who was observed, distinct from `created_by` (who wrote it). Visibility is restricted to the observed teacher and admin only. Only admin can delete an observation.
- All of this is enforced in Postgres RLS policies using security-definer helper functions (`is_admin()`, `current_teacher_district()`, `is_district_admin()`), not just in the UI — see `supabase-teacherportal-districts-rls-upgrade.sql`.
- Onboarding a teacher is manual: invite via Supabase Dashboard → Authentication → Users → Invite user (creates the `auth.users` row + emails a set-password link), then insert/update their `teachers` row (`name`, `email`, `district_id`, `role`, `auth_id`) via the SQL/Table editor.

### Data Layer
- `src/assets/js/lessons-db.js` — CRUD for the `math_lessons` table plus `uploadLessonImage()` to the `lesson-images` Supabase Storage bucket. `createLesson()` stamps `created_by` with the current user's id. Also persists `questions` (jsonb array of `{ type, text }`, type is `extension`/`probing`/`connecting`). `getAllLessons`/`getLessonById` nested-select each lesson's `lesson_math_topics` rows and flatten them into `lesson.mathContent` (see Math Content Taxonomy below); `createLesson`/`updateLesson` accept an optional `mathContentSelection` and persist it via `setLessonMathTopics()`.
- `src/assets/js/observations-db.js` — CRUD for the `observations` table; `createObservation`/`updateObservation` persist both `created_by` (observer) and `observed_teacher_id` (observed teacher).
- `src/assets/js/teachers-db.js` — `getTeacherRoster()` (directory used to populate the observation form's teacher picker) and `getCurrentTeacher()` (current user's own `teachers` row).
- `src/assets/js/districts-db.js` — `getAllDistricts()`, used by the lesson form's District control.

### Math Content Taxonomy (Grade/Course, Domain, Math Topic)
A lesson's Math Content is a many-to-many relationship to specific, valid (Grade/Course, Domain, Math Topic) combinations — not three independent tag sets — with at most one combination per lesson marked primary.
- Tables (see `supabase-teacherportal-math-taxonomy-v2-upgrade.sql`): `grades_courses`, `domains`, and `math_topics` are reference tables; `taxonomy` holds the ~192 valid (grade_course_id, domain_id, math_topic_id) combinations (a topic name like "Volume" can appear twice under different domains, so uniqueness is per-combination, not per-topic-name); `lesson_math_topics` is the lesson↔taxonomy junction (`is_primary` boolean, with a partial unique index enforcing at most one primary row per lesson). RLS on `lesson_math_topics` mirrors `math_lessons`' district-scoped policies.
- Seed data (`supabase-teacherportal-math-taxonomy-seed.sql`) is generated by `tools/generate-math-taxonomy-seed.py` from `tools/taxonomy-sources/math_taxonomy.json` (a one-time generation input, alongside the source `.xlsx` spreadsheets — not runtime template data). Re-run the generator and the resulting SQL file if the taxonomy changes.
- `src/assets/js/taxonomy-db.js` — `getTaxonomy()` fetches all ~192 active taxonomy rows joined to their names in one query (cheap enough to fetch once per page and filter/group client-side); `flattenLessonMathTopics()` normalizes a lesson's nested `lesson_math_topics` select result; `setLessonMathTopics(lessonId, { taxonomyIds, primaryTaxonomyId })` replaces a lesson's tags via delete-then-reinsert.
- `src/assets/js/math-taxonomy-picker.js` — `renderTaxonomyPicker(container, taxonomy, initialSelection)`, used on `lesson-edit.njk`. Renders Grade/Course and Domain filter chips (filter-only, never tag anything directly), a Grade/Domain-grouped Math Topic checklist, a topic-name search box that works independently of the active filters, and a removable "Selected Topics" list with a ★/☆ toggle marking one topic as primary. `getSelection()` returns `{ taxonomyIds, primaryTaxonomyId }`. `lesson-index.njk` and `lesson-show.njk` also call `getTaxonomy()`/read `lesson.mathContent` directly for filtering and display, without using the picker UI.
- `src/_data/grades.json` — grade/course options (KG through Calculus) populated into the observation form's dropdown via 11ty global data. This is independent of the lesson taxonomy above (which uses its own Grade/Course naming, e.g. "Grade 1"/"Algebra 1").

## Vestaboard Tool (/personal/vestaboard)

A private, authenticated tool at `/personal/vestaboard/` for creating, scheduling, and sending quotes/designs to a physical Vestaboard. Uses the `minimal.njk` layout with the same Supabase auth-guard pattern as the other `/personal/` tools (see `src/personal/pizza-dashboard.njk`).

### Pages and modules
- `src/personal/vestaboard.njk` — the page itself: item card grid, a text/grid item editor modal, and a per-item schedule manager modal.
- `src/assets/js/vestaboard-db.js` — CRUD for `vestaboard_items` and `vestaboard_schedules`, plus `sendItemNow(itemId)` which invokes the `vestaboard-send` Edge Function.
- `src/assets/js/vestaboard-encode.js` — Vestaboard character-code table (letters, digits, punctuation, colors), a best-effort local preview of text centering/wrapping, and the grid-tile HTML renderer used by both the card previews and the grid editor.
- `supabase/functions/vestaboard-send/index.ts` — Edge Function that actually talks to the Vestaboard API (see Sending below).
- `supabase-vestaboard-setup.sql` — schema, RLS, and cron registration (see Deployment below).

### Data model
- `vestaboard_items`: `id`, `user_id`, `name`, `mode` (`text` or `grid`), `text_content`, `grid_content` (6x22 int array), timestamps. RLS restricts all access to `auth.uid() = user_id`.
- `vestaboard_schedules`: `id`, `user_id`, `item_id` (FK to `vestaboard_items`, cascades on delete), `days_of_week` (int array, 0=Sun..6=Sat), `time_of_day`, `timezone` (IANA name, default `America/New_York`), `enabled`, `last_sent_at` (internal guard against double-sends within the same minute — not surfaced in the UI).

### Sending
- **Manual ("Send Now")**: the browser calls `supabase.functions.invoke('vestaboard-send', { body: { action: 'send-now', itemId } })`. The function verifies the caller's Supabase JWT, loads the item, and posts it to the Vestaboard Cloud API (`https://cloud.vestaboard.com/`, `X-Vestaboard-Token` header) using the `VESTABOARD_API_KEY` secret.
- **Scheduled**: a `pg_cron` job (`vestaboard-schedule-check`, runs every minute) calls the same function with `{ action: 'run-schedule' }` via `pg_net`, authenticated with a shared `X-Cron-Secret` header (checked against the `VESTABOARD_CRON_SECRET` secret) since there is no user session in that context. The function then uses the Supabase **service role** key to find schedules matching the current day/time in their timezone and sends the associated item.

### Deployment steps
The static site build does not deploy any of this — it must be set up once (and again after any changes to the Edge Function or SQL file) directly against the Supabase project:
1. In the Supabase Dashboard, go to **Database → Extensions** and enable `pg_cron` and `pg_net`.
2. Get a Vestaboard Cloud API token from the Vestaboard web app's Developer section.
3. Generate a random string to use as the cron shared secret (e.g. `openssl rand -hex 32`).
4. Deploy the Edge Function: `supabase functions deploy vestaboard-send` (requires the Supabase CLI logged in and linked to the project).
5. Set the function's secrets: `supabase secrets set VESTABOARD_API_KEY=... VESTABOARD_CRON_SECRET=...` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically to Edge Functions).
6. Open `supabase-vestaboard-setup.sql`, replace the `YOUR_PROJECT_REF` and `YOUR_CRON_SECRET` placeholders in the `cron.schedule(...)` call near the bottom (project ref is the subdomain in your Supabase project URL; the secret must match step 5), and run the whole file in the Supabase SQL Editor. The file is safe to re-run — it uses `CREATE TABLE IF NOT EXISTS`, re-creates the trigger, and unschedules/reschedules the cron job.
7. Verify: create an item on `/personal/vestaboard/` and use "Send Now"; then set a schedule ~1-2 minutes out and confirm the board updates and the schedule's `last_sent_at` gets stamped.

Re-run step 4 (and redeploy) whenever `supabase/functions/vestaboard-send/index.ts` changes. Re-run step 6 whenever `supabase-vestaboard-setup.sql` changes (it's idempotent).

## Wavelength Party Game (/personal/wavelength)

A big-screen party game (a personal take on Wavelength) with a laptop/TV board and a phone view for the clue giver. See `WAVELENGTH.md` for the player-facing README.

### Deliberately backend-free

There is **no Supabase, no API, no persistence, and no realtime sync** in this feature, and that is intentional — do not add any. The board keeps the current round in memory; the round is handed to the phone entirely inside the QR code's URL hash:

```text
/personal/wavelength/clue/#3|Worthless|Priceless|0.4213
                           ^ round     ^ labels   ^ target (0.0-1.0)
```

The board redraws the QR on every next-round (`N`) and reroll (`R`), so re-scanning always yields the current round. The phone never updates on its own. A page refresh on the board simply starts a new game. Labels are percent-encoded in the hash so a literal `|` in a prompt cannot break parsing.

### Pages and modules

- `src/personal/wavelength.njk` → `/personal/wavelength/` — the board (laptop/TV)
- `src/personal/wavelength-clue.njk` → `permalink: /personal/wavelength/clue/index.html` — the phone view
- Both use `minimal.njk` with `pageCss: /assets/css/wavelength.css`, and contain only markup plus a small `<script type="module">` bootstrap.
- `src/assets/js/wavelength/scoring.js` — pure, DOM-free: `BANDS`, `calculateScore()`, `bandRanges()`, `randomTarget()`, `clampPosition()`
- `src/assets/js/wavelength/prompts.js` — **the only file to edit to add spectrum prompts**; `PROMPTS` array plus `pickPrompt(excludeIndex)`
- `src/assets/js/wavelength/round.js` — `newRound()`, `rerollTarget()`, `encodeRound()`, `decodeRound()`, `clueUrlForRound()`
- `src/assets/js/wavelength/gauge.js` — SVG semicircle geometry (`GAUGE` constants, `pointOnArc()`, `bandArcPath()`)
- `src/assets/js/wavelength/board.js` — board controller
- `src/assets/js/wavelength/clue.js` — phone controller
- `src/assets/js/wavelength/qr.js` — wraps `qrcode-generator` loaded from jsDelivr as ESM, with a plain-URL fallback if the CDN is unreachable

### Geometry and scoring

All positions are normalized `0.0`–`1.0` (`0.0` = far left, `1.0` = far right). Never store or score in pixels. The dial converts a position to an angle with `angle = -90 + position * 180`, drawn in a fixed `0 0 1000 660` SVG user space (pivot at `500,500`, radii 330–460; the extra height below the pivot is what keeps the big spectrum labels clear of the arc ends).

Scoring bands are half-widths measured from the target center — 4 pts ≤ 0.03, 3 pts ≤ 0.09, 2 pts ≤ 0.17, else 0 — giving the classic `2 | 3 | 4 | 3 | 2` strip 34% of the spectrum wide. `randomTarget()` is constrained to `[0.17, 0.83]` so the whole scoring area always stays on the dial. There is no running score total by design.

### Board controls

`Left`/`Right` move (0.01 per tap, continuous glide while held); `Shift+Left`/`Shift+Right` fine-move (0.002); `PageUp`/`PageDown` mirror left/right for presentation clickers; `Space`/`Enter` reveal; `N` next round; `R` reroll target (before reveal only); `F` fullscreen; `Q` enlarge the QR. The needle is locked once revealed so the displayed score cannot drift.

The needle uses a rAF loop that eases a rendered position toward the true position, so taps and holds both look smooth. Rotation is applied as a CSS `transform` on the SVG group with `transform-box: view-box; transform-origin: 500px 500px`.

## Development Notes

- The build process runs Tailwind CLI separately from Eleventy
- Custom CSS lives in `src/styles/input.css` and outputs to `_site/styles/output.css`
- Modal component uses `common-tags` library for template literals
- No TypeScript, linting, or formatting tools configured
- Site uses ConvertKit email capture script (conditionally loaded, excluded on feedback pages)
