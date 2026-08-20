---
name: Selection Board — Project Overview
description: Full-stack candidate/role assignment app for a large convention. Tech stack, schema, silos, current state, known issues.
metadata:
  type: project
---
## What It Is
Selection Board is a Next.js 14 + Supabase web app for assigning volunteer candidates to convention roles. Multiple users work concurrently; candidates are matched to roles, then selected and marked filled.

**Live URL:** https://sea27.org
**GitHub:** https://github.com/tristanschlak/selection-board
**Vercel Dashboard:** https://vercel.com/tristanschlak/selection-board
**Local path:** `C:\dev\selection-board\` (Windows)

## Current State (as of May 2026)
- ~300+ candidates
- 331 roles across 7 silos
- Scale is growing; all candidates loaded into memory on page load

## Tech Stack
- **Frontend:** Next.js 14.2.18 (App Router), TypeScript, Tailwind CSS v4, Lucide React
- **Backend:** Supabase (PostgreSQL, PostgREST, Row Level Security, Realtime)
- **Drag-and-drop:** dnd-kit (@dnd-kit/core, @dnd-kit/sortable)
- **Deployment:** Vercel auto-deploy from `main` branch

## Key File Paths
| File | Purpose |
|------|---------|
| `src/app/board/page.tsx` | Main board page (all state + handlers) |
| `src/components/board/CandidateCard.tsx` | Candidate card with stripe + role indicators |
| `src/components/board/EditCandidateModal.tsx` | Edit modal with photo upload |
| `src/components/board/AddCandidateModal.tsx` | Add new candidate |
| `src/components/board/SelectedRoleCard.tsx` | Role detail + assignment UI |
| `src/components/board/SiloDashboard.tsx` | Silo overview grid |
| `src/components/board/SelectionOrderView.tsx` | Priority order modal |
| `src/components/board/BoardHeader.tsx` | Header with logout |
| `src/components/board/RoleSelector.tsx` | Role picker UI |
| `src/types/index.ts` | TypeScript interfaces |
| `src/lib/supabase/client.ts` | Supabase browser client (stabilized with useMemo) |

## Database Schema

**`silos`** — id, name, description, display_order
Names: HC1, HC2, HC3, CCC, PO, RO, CORE

**`roles`** — id, silo_id, title, description, qualities, selection_order, proximity_score (1-10), created_at, updated_at

**`candidates`** — id, full_name, age, congregation, location, current_responsibilities, circuit_responsibilities, experience (= "Aurora Regional Experience"), comments, co_comments, status ('discuss'|'pass'), photo_url (base64 data URI), created_at, updated_at

**`candidate_role_matches`** — id, candidate_id, role_id, is_primary_recommendation, sort_order (drag order per role), created_at

**`role_decisions`** — id, role_id, selected_candidate_id, status ('open'|'in_progress'|'filled'), created_at, updated_at

**`candidate_locks`** — candidate_id, locked_by, created_at — concurrent-edit locking; cleanup via `supabase.rpc('cleanup_old_locks')`

## Silo Color Coding (from SelectionOrderView.tsx — source of truth)
- HC1 → bg-blue-50 / border-blue-200 / text-blue-700
- HC2 → bg-purple-50 / border-purple-200 / text-purple-700
- HC3 → bg-pink-50 / border-pink-200 / text-pink-700
- CCC → bg-emerald-50 / border-emerald-200 / text-emerald-700
- PO  → bg-amber-50 / border-amber-200 / text-amber-700
- RO  → bg-cyan-50 / border-cyan-200 / text-cyan-700
- CORE → purple-600 (header button color)

## Important Technical Notes
- **Photos stored as base64** in `photo_url` column — not in Supabase Storage. Will bloat DB at scale.
- **Search is fully client-side** — all candidates loaded into memory on page load in 1,000-row pages.
- **Concurrent locking** uses `candidate_locks` table with Supabase Realtime subscriptions.
- **Realtime sync** on `role_decisions` and `candidate_role_matches` via surgical payload-based state updates (no refetch). Requires both tables in the `supabase_realtime` Replication publication (manual dashboard step).
- **Edit modal cannot remove a match for an assigned/filled role**: In EditCandidateModal, role checkboxes are disabled for any role where this candidate is the `selected_candidate_id` on the corresponding role_decisions row (status `in_progress` or `filled`). Removing the match would orphan the assignment. Assignment removal is intentionally restricted to `SelectedRoleCard.tsx`'s "Clear Assignment" / "Reopen Role" flow. New recommendations can still be added freely; only removal of an active assignment's match is blocked.
- **Realtime channels are gated on authenticated session**: The board's Realtime subscriptions (`role-decisions-sync`, `candidate-role-matches-sync`, `candidate-locks`) do not join until `supabase.realtime.setAuth(access_token)` has been called with a valid session. Both client instances (AuthProvider and board/page.tsx) push the token to Realtime on `SIGNED_IN`, `TOKEN_REFRESHED`, and `INITIAL_SESSION`. Channels re-subscribe on session changes so the server re-registers the subscriber's role with the current token. Without this gate, channels joined under the anon role and silently received no INSERT events, even though SELECT RLS was `using (true)` for authenticated.
- **No global state library** — pure React hooks (useState, useEffect, useMemo). All state in board/page.tsx.
- **Supabase client** stabilized with `useMemo(() => createClient(), [])` to prevent re-creation on renders.
- **bfcache reload handler** in board/page.tsx: a `pageshow` listener detects when the page is restored from the browser's back-forward cache (`event.persisted === true`) and forces `window.location.reload()`. Without this, Realtime subscriptions silently die on browser back-navigation because React effects don't re-run on bfcache restore.
- **candidate_role_matches.sort_order is now always set**: Previously, only drag-reordered matches had a sort_order; matches created via the modal were null (300 of 339 rows as of May 2026). Backfill ran on 2026-05-22 via `scripts/backfill-sort-order.sql` (preserved in the repo). The create-match handlers in board/page.tsx (`handleAddCandidate`, `handleEditCandidate`) now assign `(max sort_order for that role across all candidates) + 1` on insert, computed from in-memory `candidates` state without an extra query. Script is idempotent and can be re-run safely.
- **Candidate card recommendation list**: CandidateCard.tsx renders a list below the existing assigned/filled role rows showing recommendations only. Filters out matches where this candidate is the `selected_candidate_id` on a `role_decisions` row (those are already shown above). Sorted by `roles.selection_order` ASC. Capped at 3 visible if the candidate has no assignments, 2 visible if they have any. Excess shows as `+N` in muted right-aligned text. Format: `Role name … rank / total` right-aligned with tabular-nums, slash separator with single spaces. Denominator is total `candidate_role_matches` count for that role across all candidates (including assigned). Total-per-role map computed in board/page.tsx as a `useMemo` over `candidates` state, passed as `roleMatchTotals` prop through `SortableCandidateCard`.

## Env Vars Required
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=... (scripts only)
```

## Candidate Status Classification (for View All tabs)
Priority: Filled > Assigned > Recommended > Available
- **Filled**: selected_candidate_id in any role_decision with status='filled'
- **Assigned**: selected_candidate_id in any role_decision with status!='filled', and not filled
- **Recommended**: has ≥1 candidate_role_matches row, not assigned/filled
- **Available**: zero candidate_role_matches rows, not assigned/filled

## Standing Instructions
- No "Co-Authored-By: Claude" in commit messages
- Commit messages: subject line is imperative and terse, separate body with blank line, wrap body text at 72 char per line, body explains high level motivation, rationale.
