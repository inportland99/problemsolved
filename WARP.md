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
- `login.njk` (`/teacherportal/login/`) — email/password login form
- `lesson-index.njk` / `lesson-edit.njk` — browse, create, edit, delete math lessons (with diagram image upload)
- `observation-index.njk` / `observation-edit.njk` / `observation-show.njk` — create, edit, list, and view classroom lesson observations (scored 0–5 across Planning/Launch/Problem Solving/Closing)

### Authentication
- Backed by **Supabase Auth** (email/password), client-side only — no server/serverless functions involved. Public sign-up is disabled at the project level; teachers are provisioned manually (see Authorization Model below).
- `src/assets/js/lessons-supabase-client.js` creates the Supabase client (project URL + publishable anon key hardcoded in the file) and exposes `getCurrentUser`, `signIn`, `signOut`.
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
- `src/assets/js/lessons-db.js` — CRUD for the `math_lessons` table plus `uploadLessonImage()` to the `lesson-images` Supabase Storage bucket. `createLesson()` stamps `created_by` with the current user's id.
- `src/assets/js/observations-db.js` — CRUD for the `observations` table; `createObservation`/`updateObservation` persist both `created_by` (observer) and `observed_teacher_id` (observed teacher).
- `src/assets/js/teachers-db.js` — `getTeacherRoster()` (directory used to populate the observation form's teacher picker) and `getCurrentTeacher()` (current user's own `teachers` row).
- `src/assets/js/districts-db.js` — `getAllDistricts()`, used by the lesson form's District control.
- `src/_data/grades.json` — grade/course options (KG through Calculus) populated into the observation form's dropdown via 11ty global data.

## Development Notes

- The build process runs Tailwind CLI separately from Eleventy
- Custom CSS lives in `src/styles/input.css` and outputs to `_site/styles/output.css`
- Modal component uses `common-tags` library for template literals
- No TypeScript, linting, or formatting tools configured
- Site uses ConvertKit email capture script (conditionally loaded, excluded on feedback pages)
