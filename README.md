# Selection Board — Tech Pack

A collaborative, real-time candidate selection board built with Next.js and Supabase. Multiple users can open the app simultaneously, view candidates across role silos, drag-and-drop rank them, and track assignment progress — all synced live.

**Live site:** https://sea27.org  
**GitHub:** https://github.com/tristanschlak/selection-board  
**Local path (Windows):** `C:\dev\selection-board\`

---

## Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | 14.2.18 |
| Language | TypeScript | ^5 |
| Styling | Tailwind CSS | v4 |
| Database / Auth / Realtime | Supabase | @supabase/ssr ^0.10.2 |
| Drag & Drop | dnd-kit | core ^6.3.1, sortable ^10.0.0 |
| Icons | lucide-react | ^1.8.0 |
| Image compression | browser-image-compression | ^2.0.2 |
| Analytics | @vercel/analytics | ^2.0.1 |
| Deployment | Vercel | (auto-deploy on push to `main`) |

---

## Getting Started (Local)

### 1. Prerequisites
- Node.js 18+
- npm

### 2. Clone and install
```bash
git clone https://github.com/tristanschlak/selection-board.git
cd selection-board
npm install
```

### 3. Environment variables
Create `.env.local` in the project root:
```
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```
Get these from your Supabase project under **Settings → API**.

`SUPABASE_SERVICE_ROLE_KEY` is only required for the photo migration and cleanup scripts — not for normal development.

### 4. Run the dev server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

---

## Deployment (Vercel)

1. Push the repo to GitHub (`tristanschlak/selection-board`).
2. Import the project in [vercel.com](https://vercel.com) under the `tristanschlak` account.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` under **Settings → Environment Variables**.
4. Deploy. Vercel auto-deploys on every push to `main`.

All teammates access https://sea27.org — no local setup needed for non-developers.

---

## Database Schema

All tables live in the Supabase Postgres instance.

### `silos`
Organizational groupings for roles.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| name | text | HC1, HC2, HC3, CCC, PO, RO, CORE |
| description | text | optional |
| display_order | int | sort order in dashboard |

### `roles`
Positions to be filled, each belonging to a silo.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| silo_id | uuid | FK → silos |
| title | text | |
| description | text | optional |
| qualities | text | desired qualities, optional |
| selection_order | int | global pick order for Selection Order view |
| proximity_score | int | optional scoring field (1–10) |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `candidates`
People being considered for roles.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| full_name | text | |
| age | int | optional |
| congregation | text | optional |
| location | text | optional |
| current_responsibilities | text | optional |
| circuit_responsibilities | text | optional |
| experience | text | "Aurora Regional Experience" |
| comments | text | optional |
| co_comments | text | CO Comments — displayed in italics |
| photo_url | text | base64 data URI (e.g. `data:image/jpeg;base64,…`) — stored directly in DB, not in Storage |
| status | text | `discuss` or `pass` |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `candidate_role_matches`
Many-to-many join: which candidates are recommended for which roles.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| candidate_id | uuid | FK → candidates |
| role_id | uuid | FK → roles |
| is_primary_recommendation | bool | drives darker-blue left-edge stripe on card |
| sort_order | int | drag-and-drop order within a role view |
| created_at | timestamptz | |

### `role_decisions`
Which candidate is selected for each role and its fill status.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| role_id | uuid | FK → roles (unique constraint) |
| selected_candidate_id | uuid | FK → candidates, nullable |
| status | text | `open`, `in_progress`, or `filled` |
| created_at | timestamptz | |
| updated_at | timestamptz | |

`in_progress` = candidate selected but not yet marked filled. `filled` = confirmed.

---

## Silos and Color Coding

| Silo | Background | Border | Text |
|---|---|---|---|
| HC1 | bg-blue-50 | border-blue-200 | text-blue-700 |
| HC2 | bg-purple-50 | border-purple-200 | text-purple-700 |
| HC3 | bg-pink-50 | border-pink-200 | text-pink-700 |
| CCC | bg-emerald-50 | border-emerald-200 | text-emerald-700 |
| PO | bg-amber-50 | border-amber-200 | text-amber-700 |
| RO | bg-cyan-50 | border-cyan-200 | text-cyan-700 |
| CORE | — | — | purple-600 (header button) |

Source of truth: `src/components/board/SelectionOrderView.tsx` (`siloColors`, `siloBadgeColors`).

---

## Key Features

**Silo Dashboard** — Roles grouped by silo. Click a silo to expand its roles; click a role to load its matched candidates.

**Candidate Cards** — Photo + name/age/congregation/location, with role assignment indicators directly below the name:
- `CircleCheckBig` icon in emerald-600 = filled for that role
- `Check` icon in blue-700 = assigned (in progress) for that role
- Left-edge stripe: emerald-600 = filled somewhere, blue-500 = primary recommendation OR assigned (in-progress) somewhere, blue-200 = any other recommendation

**Drag-and-Drop Ranking** — Within a role view, candidates can be reordered by dragging. Order persists to the DB via `sort_order` on `candidate_role_matches`.

**Multi-Filter Search** — Chips-based AND filter system. Type a term, press Enter to lock it as a chip. Searches across: Name, Congregation, Current Responsibilities, Circuit Responsibilities, Aurora Experience, Comments, CO Comments. Age range and "has photo" filters also available. All filtering is client-side.

**View All with Status Tabs** — The "View All" view shows all candidates with a status tab row:
- **All** — every candidate
- **Available** — zero `candidate_role_matches` rows
- **Recommended** — has matches, not assigned, not filled
- **Assigned** — selected for a role with `status = 'in_progress'`
- **Filled** — selected for a role with `status = 'filled'`

Priority: Filled > Assigned > Recommended > Available. Chips and age filters apply within the active tab.

**Collaborative Locking** — Edit and drag locks are tracked via Supabase Realtime Presence on the `board-presence` channel. Other users see "Editing: [name]" on a card being edited; drag operations are similarly broadcast. Locks release automatically on save, cancel, page unload, or disconnect.

**Realtime Sync** — Supabase Realtime subscriptions on `role_decisions` and `candidate_role_matches` push changes to all connected sessions without a page refresh. Uses surgical payload-based state updates (INSERT/UPDATE/DELETE handled individually, no full refetch).

**Selection Order View** — Modal listing all roles in `selection_order` sequence with current assignment status. Supports Remaining / All / Filled views and Compact / Comfortable / Detailed density modes. View and density persist to `localStorage`.

**CORE Roles Dropdown** — Quick-access button in the header for roles in the CORE silo.

**Progress Bar** — Header shows `filled / total` roles as a percentage.

**Filled (N) Button** — Header button showing count of candidates who are the `selected_candidate_id` for at least one role with `status = 'filled'`.

---

## Architecture Notes

### Client-side data loading
All candidates are fetched on page load in 1,000-row pages and stored in React state (`useState<Candidate[]>`). All filtering, sorting, and tab switching is client-side. At the current scale (~300+ candidates) this is fast; if the candidate count grows to several thousand, server-side pagination would be needed.

### Supabase client stability
The browser Supabase client is created once with `useMemo(() => createClient(), [])` in `board/page.tsx` to prevent re-creation on every render, which would tear down and re-establish Realtime subscriptions.

### Realtime requirements
Two manual steps are required in the Supabase dashboard for Realtime to work:
1. **Database → Replication**: Add `role_decisions` and `candidate_role_matches` to the `supabase_realtime` publication.
2. **Authentication → Policies**: Confirm SELECT RLS policies on both tables allow all authenticated users to read all rows.

### No global state library
All state lives in `src/app/board/page.tsx` as React `useState` + `useMemo`. No Redux, Zustand, or Context (beyond the auth provider).

---

## Project Structure

```
src/
  app/
    board/page.tsx              # Main board — all state, data fetching, handlers
    login/page.tsx              # Login screen
    auth/callback/route.ts      # Supabase auth redirect handler
    layout.tsx                  # Root layout with AuthProvider + Analytics
    page.tsx                    # Root redirect (→ /board or /login)
    not-found.tsx               # 404 page
  components/
    board/
      AddCandidateModal.tsx     # Form to create a new candidate
      BoardHeader.tsx           # Top nav with user info + logout
      CandidateCard.tsx         # Candidate display card (stripe, icons, lock indicator)
      EditCandidateModal.tsx    # Form to edit/delete a candidate + photo upload
      RoleSelector.tsx          # Role picker used in modals
      SelectedRoleCard.tsx      # Role detail panel with assignment controls
      SelectionOrderView.tsx    # Selection order modal
      SiloDashboard.tsx         # Silo overview grid
      SortableCandidateCard.tsx # dnd-kit wrapper around CandidateCard
      UserIdentity.tsx          # Name-entry prompt for collaborative locking
    auth/
      AuthProvider.tsx          # Supabase session context
    ui/
      Avatar.tsx
      Badge.tsx
      Button.tsx
      ProgressBar.tsx
  lib/
    supabase/client.ts          # Browser Supabase client factory
    supabase/server.ts          # Server Supabase client factory
    uploadCandidatePhoto.ts     # Photo compression + upload helper
    utils/cn.ts                 # clsx + tailwind-merge utility
    utils/format.ts             # Formatting helpers
  middleware.ts                 # Auth redirect middleware
  types/index.ts                # All shared TypeScript interfaces
scripts/
  import-candidates.mjs        # One-time CSV candidate import
  migrate-photos-to-storage.mjs  # Migrate base64 photos → Supabase Storage
  cleanup-orphan-photos.mjs    # Find/delete orphaned Storage files
  pull-silos.mjs / pull-roles.mjs  # Data export helpers
```

---

## Candidate Photos

Photos are stored as **base64 data URIs** directly in the `candidates.photo_url` column — not in Supabase Storage. This was the original implementation.

The `EditCandidateModal` and `AddCandidateModal` both call `src/lib/uploadCandidatePhoto.ts`, which:
1. Validates file size (≤ 5 MB) and MIME type (`image/*`)
2. Compresses to max 400 px wide at JPEG 80% quality via `browser-image-compression`
3. Returns a base64 data URI that is saved to the `photo_url` column

Migration scripts exist to move photos to Supabase Storage if needed in the future:

```bash
# Preview what will be migrated (no writes)
npm run migrate:photos -- --dry-run

# Live run
npm run migrate:photos
```

Requires `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. The script is idempotent — rows that already contain a URL are skipped.

---

## Scripts

```bash
npm run dev                    # Start local dev server (localhost:3000)
npm run build                  # Production build
npm run start                  # Serve production build locally
npm run lint                   # Run ESLint
npm run migrate:photos         # Migrate base64 photos in DB to Supabase Storage
npm run cleanup:photos:dry     # Preview orphaned Storage files (no deletes)
npm run cleanup:photos:apply   # Delete orphaned Storage files
```

---

## Known Limitations

- **Base64 photo bloat** — Storing photos as base64 in Postgres is convenient but bloats the `candidates` table. Each compressed photo is ~30–80 KB; at 300+ candidates with photos the table row size grows significantly. Consider migrating to Supabase Storage for scale.
- **All candidates in memory** — ~300+ candidates are loaded into the browser on page open. Fast for the current scale; would need server-side filtering if the count grows to several thousand.
- **Realtime publication is a manual step** — `role_decisions` and `candidate_role_matches` must be added to the `supabase_realtime` publication in the Supabase dashboard for cross-session sync to work.
- **No global state** — All state is in one large component (`board/page.tsx`). Fine at current scale; would benefit from a state management solution if the component grows further.
- **`role_decisions.status` type mismatch** — The TypeScript type declares `'open' | 'filled'` but the code also writes `'in_progress'`. The DB accepts all three; the type definition is slightly stale.
- **Status tab not persisted** — The View All status tab (All/Available/Recommended/Assigned/Filled) resets to "All" on every page load by design.
