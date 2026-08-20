// src/app/board/page.tsx
'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Bookmark, BookmarkCheck, Users, UserPlus, UserSearch, UserPen, UserCheck, UserLock, Cylinder, Edit2, Search, X, Check, ChevronDown, ChevronUp, ChevronsUp, CircleCheckBig, CircleUser, ListOrdered, LayoutPanelTop, LayoutPanelLeft, PanelLeftClose, Columns2, PanelLeftOpen, Network, Info, MoreHorizontal, Sheet, Contact } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragStartEvent, DragCancelEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { SiloDashboard } from '@/components/board/SiloDashboard';
import { SelectedRoleCard } from '@/components/board/SelectedRoleCard';
import { CandidateCard } from '@/components/board/CandidateCard';
import { SortableCandidateCard } from '@/components/board/SortableCandidateCard';
import { AddCandidateModal } from '@/components/board/AddCandidateModal';
import { EditCandidateModal } from '@/components/board/EditCandidateModal';
import { SelectionOrderView } from '@/components/board/SelectionOrderView';
import { siloIcons, siloColors, siloBadgeColors, siloActivePillColors } from '@/lib/siloMeta';
import { FormattedRoleTitle } from '@/components/board/FormattedRoleTitle';
import { UserIdentity } from '@/components/board/UserIdentity';
import { UserProfilePopover } from '@/components/board/UserProfilePopover';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { Candidate, CandidateRoleMatch, Role, RoleDecision, Silo } from '@/types';
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';

type SearchFields = {
  name: boolean;
  congregation: boolean;
  currentResponsibilities: boolean;
  circuitResponsibilities: boolean;
  regionalExperience: boolean;
  comments: boolean;
  coComments: boolean;
};

interface FilterChip {
  id: string;
  term: string;
  fields: SearchFields;
}

type StatusTab = 'all' | 'available' | 'recommended' | 'assigned' | 'filled';

type RoleNavTab     = 'all' | 'HC1' | 'HC2' | 'HC3' | 'CCC' | 'PO' | 'RO';
type RoleViewLayout = 'stacked' | 'split';
type SplitRatio     = 'narrow' | 'balanced' | 'wide';

// Wraps generateKeyBetween with a position-aware fallback for malformed/inverted bounds.
// fractional-indexing rejects keys whose fractional part ends in "0" (e.g. "a000010").
function safeKeyBetween(lower: string | null, upper: string | null): string {
  try {
    return generateKeyBetween(lower, upper);
  } catch {
    console.warn('[safeKeyBetween] invalid bounds, falling back:', { lower, upper });
    // Try each bound alone to stay as close to the intended position as possible.
    if (lower !== null) { try { return generateKeyBetween(lower, null); } catch {} }
    if (upper !== null) { try { return generateKeyBetween(null, upper); } catch {} }
    return generateNKeysBetween(null, null, 1)[0];
  }
}

function readStoredRoleViewLayout(): RoleViewLayout {
  if (typeof window === 'undefined') return 'stacked';
  const v = localStorage.getItem('roleViewLayout');
  if (v === 'stacked' || v === 'split') return v;
  return 'stacked';
}
function readStoredRoleNavTab(): RoleNavTab {
  if (typeof window === 'undefined') return 'all';
  const v = localStorage.getItem('roleNavTab');
  if (v === 'all' || v === 'HC1' || v === 'HC2' || v === 'HC3' || v === 'CCC' || v === 'PO' || v === 'RO') return v;
  return 'all';
}
function readStoredSplitRatio(): SplitRatio {
  if (typeof window === 'undefined') return 'balanced';
  const v = localStorage.getItem('roleSplitRatio');
  if (v === 'narrow' || v === 'balanced' || v === 'wide') return v;
  return 'balanced';
}


type LockEntry = { name: string; userId: string; tabId: string };

type LockBroadcast = {
  kind: 'drag' | 'edit';
  candidateId: string;
  userId: string;
  name: string;
  tabId: string;
  action: 'acquire' | 'release';
};

type PresencePayload = {
  userId: string;
  name: string;
  tabId: string;
};

async function generateVCard(candidate: Candidate, primaryRoleTitle?: string): Promise<string> {
  const escField = (v: string) =>
    v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/\n/g, '\\n');
  const escFN = (v: string) =>
    v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');

  const commaSplit = candidate.full_name.split(',');
  const familyName = commaSplit[0].trim();
  const givenName  = commaSplit.length > 1 ? commaSplit[1].trim() : '';

  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${escField(familyName)};${escField(givenName)};;;`,
    `FN:${[escFN(givenName), escFN(familyName)].filter(Boolean).join(' ')}`,
  ];

  if (candidate.congregation) {
    lines.push(`ORG:;${escField(candidate.congregation)}`);
  }

  if (primaryRoleTitle) lines.push(`TITLE:${escField(primaryRoleTitle)}`);

  if (candidate.cell_phone) lines.push(`TEL;TYPE=CELL:${escField(candidate.cell_phone)}`);

  if (candidate.personal_email) {
    lines.push(`item1.EMAIL;TYPE=INTERNET,PREF:${escField(candidate.personal_email)}`);
    lines.push(`item1.X-ABLABEL:home`);
  }
  if (candidate.jwpub_email) {
    lines.push(`item2.EMAIL;TYPE=INTERNET,WORK:${escField(candidate.jwpub_email)}`);
    lines.push(`item2.X-ABLABEL:JW`);
  }
  if (candidate.bethel_email) {
    lines.push(`item3.EMAIL;TYPE=INTERNET,WORK:${escField(candidate.bethel_email)}`);
    lines.push(`item3.X-ABLABEL:Bethel`);
  }

  if (candidate.location) lines.push(`ADR;TYPE=HOME:;;;${escField(candidate.location)};;;`);

  if (candidate.photo_url) {
    if (candidate.photo_url.startsWith('data:image/jpeg;base64,')) {
      const b64 = candidate.photo_url.slice('data:image/jpeg;base64,'.length);
      lines.push(`PHOTO;ENCODING=b;TYPE=JPEG:${b64}`);
    } else if (candidate.photo_url.startsWith('http')) {
      try {
        const resp = await fetch(candidate.photo_url);
        if (resp.ok) {
          const buffer = await resp.arrayBuffer();
          const uint8 = new Uint8Array(buffer);
          let binary = '';
          uint8.forEach(b => { binary += String.fromCharCode(b); });
          const b64 = btoa(binary);
          lines.push(`PHOTO;ENCODING=b;TYPE=JPEG:${b64}`);
        }
      } catch {
        // Skip photo on network error
      }
    }
  }

  lines.push('END:VCARD');
  return lines.join('\r\n') + '\r\n';
}

export default function BoardPage() {
  const [silos, setSilos] = useState<Silo[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [roleDecisions, setRoleDecisions] = useState<RoleDecision[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [rolesFilter, setRolesFilter] = useState<'all' | 'open'>('all');
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSelectionOrder, setShowSelectionOrder] = useState(false);
  const [roleViewLayout, setRoleViewLayout]     = useState<RoleViewLayout>(readStoredRoleViewLayout);
  const [roleNavTab,     setRoleNavTab]         = useState<RoleNavTab>(readStoredRoleNavTab);
  const [splitRatio,     setSplitRatio]         = useState<SplitRatio>(readStoredSplitRatio);
  const [roleAdminModalOpen, setRoleAdminModalOpen] = useState(false);
  const [fallThroughScope, setFallThroughScope] = useState<'all' | 'silo'>('all');
  const [windowIsLg,     setWindowIsLg]         = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= 1024;
  });
  const [loading, setLoading] = useState(true);
  
  // Unified search with field filters
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFields, setSearchFields] = useState<SearchFields>({
    name: true,
    congregation: true,
    currentResponsibilities: true,
    circuitResponsibilities: true,
    regionalExperience: true,
    comments: true,
    coComments: true
  });
  const [filterChips, setFilterChips] = useState<FilterChip[]>([]);
  const [ageRange, setAgeRange] = useState({ min: '', max: '' });
  const [filterCongregation, setFilterCongregation] = useState<string>('all');
  const [filterHasPhoto, setFilterHasPhoto] = useState(false);
  const [filterBookmarked, setFilterBookmarked] = useState(false);
  const [filterSilos, setFilterSilos] = useState<Set<string>>(new Set());
  const [photoTooltipVisible, setPhotoTooltipVisible] = useState(false);
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [roleViewFilter, setRoleViewFilter] = useState<'all' | 'open'>('open');
  
  // CORE dropdown state
  const [showCoreDropdown, setShowCoreDropdown] = useState(false);
  const coreDropdownRef = useRef<HTMLDivElement>(null);

  // More overflow menu state
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Stats info popover state
  const [showStatsPopover, setShowStatsPopover] = useState(false);

  // Progress metric toggle: 'assigned' (default) or 'filled'
  const [progressMetric, setProgressMetric] = useState<'assigned' | 'filled'>('assigned');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('progressMetric');
    if (stored === 'filled' || stored === 'assigned') setProgressMetric(stored);
  }, []);

  const toggleProgressMetric = () => {
    setProgressMetric(prev => {
      const next = prev === 'assigned' ? 'filled' : 'assigned';
      try { localStorage.setItem('progressMetric', next); } catch {}
      return next;
    });
  };

  // Drag-and-drop order: maps roleId -> ordered array of candidateIds
  const [candidateOrder, setCandidateOrder] = useState<Record<string, string[]>>({});

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Identity & presence-derived lock state
  const [userId, setUserId] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [editLocks, setEditLocks] = useState<Map<string, LockEntry>>(new Map());
  const [dragLocks, setDragLocks] = useState<Map<string, LockEntry>>(new Map());

  const [isAdmin, setIsAdmin] = useState(false);

  // True once an authenticated session has been hydrated and pushed to Realtime
  const [sessionReady, setSessionReady] = useState(false);
  // Increments on every genuine new token (SIGNED_IN, TOKEN_REFRESHED). Adding this to the
  // presence effect deps means each token refresh triggers a clean channel rebuild — the
  // deterministic fix for the "recovery cap exhausted before new JWT arrives" failure mode.
  const [authEpoch, setAuthEpoch] = useState(0);

  // Stable refs for Realtime callbacks — avoid stale closures
  const candidatesRef = useRef<Candidate[]>([]);
  const candidateOrderRef = useRef<Record<string, string[]>>({});
  const activeDragRoleRef = useRef<string | null>(null);

  // Presence: one stable tab id per mount; channel ref + current tracked payload
  const tabIdRef = useRef<string>(
    typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).slice(2)
  );
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);
  const currentPresenceRef = useRef<PresencePayload>({
    userId: '', name: '', tabId: tabIdRef.current,
  });
  // This client's currently held locks — read on recovery to re-assert, and as double-open guard.
  const currentLocksRef = useRef<{ dragging: string | null; editing: string | null }>({
    dragging: null, editing: null,
  });

  const supabase = useMemo(() => createClient(), []);

  // Called by UserIdentity once auth resolves.
  // Seeding currentPresenceRef here (synchronously, before React flushes the state updates)
  // means the presence effect never needs userName in its closure or dep array.
  const handleIdentitySet = useCallback(({ userId: uid, name }: { userId: string; name: string }) => {
    currentPresenceRef.current = { ...currentPresenceRef.current, userId: uid, name };
    setUserId(uid);
    setUserName(name);
  }, []);

  // Optimistically acquires a lock locally and broadcasts 'acquire' to peers.
  // At most one lock per kind per tab — any prior entry for this tab is cleared first.
  const acquireLock = useCallback((kind: 'drag' | 'edit', candidateId: string) => {
    const { userId: uid, name } = currentPresenceRef.current;
    const tabId = tabIdRef.current;
    const setMap = kind === 'drag' ? setDragLocks : setEditLocks;
    setMap(prev => {
      const next = new Map(prev);
      for (const [k, v] of next) { if (v.userId === uid && v.tabId === tabId) next.delete(k); }
      next.set(candidateId, { name, userId: uid, tabId });
      return next;
    });
    if (kind === 'drag') currentLocksRef.current = { ...currentLocksRef.current, dragging: candidateId };
    else                  currentLocksRef.current = { ...currentLocksRef.current, editing:  candidateId };
    const ch = presenceChannelRef.current;
    if (ch) ch.send({ type: 'broadcast', event: 'lock', payload: { kind, candidateId, userId: uid, name, tabId, action: 'acquire' } as LockBroadcast });
  }, []);

  // Releases whichever lock of the given kind this tab currently holds.
  const releaseLock = useCallback((kind: 'drag' | 'edit') => {
    const candidateId = kind === 'drag' ? currentLocksRef.current.dragging : currentLocksRef.current.editing;
    if (!candidateId) return;
    const { userId: uid, name } = currentPresenceRef.current;
    const tabId = tabIdRef.current;
    const setMap = kind === 'drag' ? setDragLocks : setEditLocks;
    setMap(prev => {
      const next = new Map(prev);
      const entry = next.get(candidateId);
      if (entry?.userId === uid && entry?.tabId === tabId) next.delete(candidateId);
      return next;
    });
    if (kind === 'drag') currentLocksRef.current = { ...currentLocksRef.current, dragging: null };
    else                  currentLocksRef.current = { ...currentLocksRef.current, editing:  null };
    const ch = presenceChannelRef.current;
    if (ch) ch.send({ type: 'broadcast', event: 'lock', payload: { kind, candidateId, userId: uid, name, tabId, action: 'release' } as LockBroadcast });
  }, []);

  // Hydrate the Realtime auth token before any channel joins. Without this,
  // channels subscribe under the anon role and receive no INSERT events even
  // when SELECT RLS is open for authenticated users.
  // lastTokenRef dedupes setAuth: onAuthStateChange can fire SIGNED_IN and
  // INITIAL_SESSION for the same token, and getSession() may overlap with
  // onAuthStateChange on initial load. Skipping duplicate tokens prevents
  // unnecessary sessionReady state flips that would re-run channel effects.
  const lastTokenRef = useRef<string | null>(null);
  // Mirrors lastTokenRef but read inside createChannel to stamp the freshest JWT before each
  // subscribe — so recovery retries never re-subscribe with the expired token.
  const currentAccessTokenRef = useRef<string | null>(null);

  useEffect(() => { candidatesRef.current = candidates; }, [candidates]);
  useEffect(() => { candidateOrderRef.current = candidateOrder; }, [candidateOrder]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token && session.access_token !== lastTokenRef.current) {
        lastTokenRef.current = session.access_token;
        currentAccessTokenRef.current = session.access_token;
        supabase.realtime.setAuth(session.access_token);
        console.log('[realtime:board] setAuth called on initial getSession');
        setIsAdmin(session.user?.app_metadata?.is_admin === true);
        setSessionReady(true);
      } else if (!session?.access_token) {
        setIsAdmin(false);
        setSessionReady(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.access_token && (
        event === 'SIGNED_IN' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'INITIAL_SESSION'
      ) && session.access_token !== lastTokenRef.current) {
        lastTokenRef.current = session.access_token;
        currentAccessTokenRef.current = session.access_token;
        supabase.realtime.setAuth(session.access_token);
        console.log('[realtime:board] setAuth called for', event);
        setIsAdmin(session.user?.app_metadata?.is_admin === true);
        setSessionReady(true);
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          setAuthEpoch(e => e + 1);
        }
      } else if (event === 'SIGNED_OUT') {
        setIsAdmin(false);
        setSessionReady(false);
      } else if (event === 'USER_UPDATED') {
        console.log('[realtime:board] USER_UPDATED — metadata change, no channel action needed');
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  // Click outside to close CORE dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (coreDropdownRef.current && !coreDropdownRef.current.contains(event.target as Node)) {
        setShowCoreDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Click outside to close More menu
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setShowMoreMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Click outside to close stats popover — uses data attribute to work across duplicate renders
  useEffect(() => {
    if (!showStatsPopover) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-stats-popover]')) {
        setShowStatsPopover(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showStatsPopover]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    setWindowIsLg(mq.matches);
    const handler = (e: MediaQueryListEvent) => setWindowIsLg(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // When the browser restores this page from the back-forward cache (bfcache),
  // React effects don't re-run and the closed WebSocket is never re-established,
  // leaving Realtime subscriptions silently dead. A full reload is the simplest
  // correct recovery — re-subscribing channels manually is error-prone and the
  // page data would be stale anyway.
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        window.location.reload();
      }
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  // Shared function to reload ALL candidates with pagination
  const reloadAllCandidates = async () => {
    let allCandidates: any[] = [];
    let from = 0;
    const pageSize = 1000;
    let hasMore = true;
    
    while (hasMore) {
      const { data, error } = await supabase
        .from('candidates')
        .select(`*, roles:candidate_role_matches(*, role:roles(*, silo:silos(*)))`)
        .order('full_name')
        .range(from, from + pageSize - 1);
      
      if (error) {
        console.error('Error loading candidates:', error);
        break;
      }
      
      if (data && data.length > 0) {
        allCandidates = [...allCandidates, ...data];
        from += pageSize;
        hasMore = data.length === pageSize;
      } else {
        hasMore = false;
      }
    }

    setCandidates(allCandidates);
    console.log(`Reloaded ${allCandidates.length} candidates`);
  };

  useEffect(() => {
    async function loadData() {
      const { data: silosData } = await supabase.from('silos').select('*').order('name');
      const { data: rolesData } = await supabase.from('roles').select('*, silo:silos(*)').order('selection_order');
      const { data: decisionsData } = await supabase.from('role_decisions').select('*');

      setSilos(silosData || []);
      setRoles(rolesData || []);
      setRoleDecisions(decisionsData || []);
      
      await reloadAllCandidates();
      setLoading(false);
    }
    loadData();
  }, []);

  const presenceSubscribedRef = useRef(false);
  // Set true at the start of intentional component cleanup so the CLOSED callback that
  // removeChannel triggers doesn't misfire the recovery path.
  const tearingDownRef = useRef(false);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref so all createChannel() invocations in one effect run share a single counter, and so
  // an effect re-run (dep change) resets it cleanly without a stale-closure risk.
  const recoveryAttemptsRef = useRef(0);

  useEffect(() => {
    // userName is intentionally absent from deps: identity is seeded into currentPresenceRef
    // synchronously by handleIdentitySet, so this effect never needs to close over it.
    // userId and sessionReady each transition false→truthy exactly once, giving a single run.
    if (!userId || !sessionReady || !currentPresenceRef.current.name || presenceSubscribedRef.current) return;
    presenceSubscribedRef.current = true;
    tearingDownRef.current = false;
    recoveryAttemptsRef.current = 0;
    console.log('[presence:effect] creating channel', tabIdRef.current, Date.now());

    let stableTimer: ReturnType<typeof setTimeout> | null = null;
    let syncReplyTimer: ReturnType<typeof setTimeout> | null = null;

    const sendLock = (ch: RealtimeChannel, payload: LockBroadcast) => {
      ch.send({ type: 'broadcast', event: 'lock', payload });
    };

    // Applies a received lock broadcast to the local lock maps.
    // acquire: clears any prior entry for sender's tab first (self-heals a missed release),
    //          then sets the new candidateId.
    // release: deletes only if the current entry belongs to the same userId+tabId.
    const applyLockEvent = (payload: LockBroadcast) => {
      const { kind, candidateId, userId: fromId, name: fromName, tabId: fromTab, action } = payload;
      const setMap = kind === 'drag' ? setDragLocks : setEditLocks;
      if (action === 'acquire') {
        setMap(prev => {
          const next = new Map(prev);
          for (const [k, v] of next) { if (v.userId === fromId && v.tabId === fromTab) next.delete(k); }
          next.set(candidateId, { name: fromName, userId: fromId, tabId: fromTab });
          return next;
        });
      } else {
        setMap(prev => {
          const next = new Map(prev);
          const entry = next.get(candidateId);
          if (entry?.userId === fromId && entry?.tabId === fromTab) next.delete(candidateId);
          return next;
        });
      }
    };

    const createChannel = () => {
      // Re-stamp the freshest token before every subscribe so recovery retries never use a
      // stale JWT. currentAccessTokenRef is updated on every auth event before setAuthEpoch.
      if (currentAccessTokenRef.current) supabase.realtime.setAuth(currentAccessTokenRef.current);
      const ch = supabase.channel('board-presence', {
        config: {
          presence:  { key: `${userId}:${tabIdRef.current}` },
          broadcast: { self: false, ack: false },
        },
      });
      // Assign ref BEFORE .on()/.subscribe() so acquireLock/releaseLock always target the live instance.
      presenceChannelRef.current = ch;

      // Presence = liveness only. Clear lock-map entries when a tab disconnects (crash/close).
      ch.on('presence', { event: 'leave' }, ({ leftPresences }: { leftPresences: any[] }) => {
        for (const meta of leftPresences) {
          const { userId: leftId, tabId: leftTab } = meta as { userId: string; tabId: string };
          console.log('[presence:leave]', leftId, leftTab);
          const clearLeaver = (prev: Map<string, LockEntry>) => {
            const next = new Map(prev);
            for (const [k, v] of next) { if (v.userId === leftId && v.tabId === leftTab) next.delete(k); }
            return next;
          };
          setDragLocks(clearLeaver);
          setEditLocks(clearLeaver);
        }
      });

      // Lock events: acquire/release from other tabs (self:false means we never receive our own).
      ch.on('broadcast', { event: 'lock' }, ({ payload }: { payload: LockBroadcast }) => {
        applyLockEvent(payload);
      });

      // State-on-join: a newly joined client broadcasts sync_request; we reply with our current
      // locks so they learn existing state without a DB round-trip.
      // Debounce 300ms to collapse simultaneous joins into one reply per holder.
      ch.on('broadcast', { event: 'sync_request' }, () => {
        const { dragging, editing } = currentLocksRef.current;
        if (!dragging && !editing) return; // nothing to share, stay silent
        if (syncReplyTimer) clearTimeout(syncReplyTimer);
        syncReplyTimer = setTimeout(() => {
          syncReplyTimer = null;
          const lch = presenceChannelRef.current;
          if (!lch) return;
          const { userId: uid, name } = currentPresenceRef.current;
          const tabId = tabIdRef.current;
          if (dragging) sendLock(lch, { kind: 'drag', candidateId: dragging, userId: uid, name, tabId, action: 'acquire' });
          if (editing)  sendLock(lch, { kind: 'edit', candidateId: editing,  userId: uid, name, tabId, action: 'acquire' });
        }, 300);
      });

      ch.subscribe(async (status, err) => {
        console.log('[realtime:board-presence] status:', status, Date.now(), err ?? '');
        if (status === 'SUBSCRIBED') {
          // Reset the backoff counter only after the connection has been stable for 3 s.
          if (stableTimer) clearTimeout(stableTimer);
          stableTimer = setTimeout(() => {
            recoveryAttemptsRef.current = 0;
            stableTimer = null;
            console.log('[realtime:board-presence] connection stable — attempt counter reset');
          }, 3000);
          // Track ONCE for liveness — payload carries no lock state, so meta count never grows.
          await ch.track({ userId, name: currentPresenceRef.current.name, tabId: tabIdRef.current });
          // Re-assert our current locks (handles recovery: mid-drag reconnect re-announces to peers).
          const { dragging, editing } = currentLocksRef.current;
          const { name } = currentPresenceRef.current;
          const tabId = tabIdRef.current;
          if (dragging) sendLock(ch, { kind: 'drag', candidateId: dragging, userId, name, tabId, action: 'acquire' });
          if (editing)  sendLock(ch, { kind: 'edit', candidateId: editing,  userId, name, tabId, action: 'acquire' });
          // Ask peers to re-send their current locks so we learn existing state on join.
          ch.send({ type: 'broadcast', event: 'sync_request', payload: { fromUserId: userId } });
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          // PRIMARY GUARD: removeChannel(old) fires old's CLOSED callback asynchronously (via
          // Phoenix leave → onClose). If the ref has already moved off this channel instance,
          // this is a stale close from an intentionally removed channel — ignore it entirely.
          if (presenceChannelRef.current !== ch) return;
          // Belt-and-suspenders for the component-unmount path.
          if (tearingDownRef.current) return;
          if (stableTimer) { clearTimeout(stableTimer); stableTimer = null; }
          if (recoveryAttemptsRef.current >= 5) {
            // Fast-backoff exhausted. Don't die permanently — switch to a 30s slow retry so a
            // long network outage recovers on its own. The authEpoch dep is the deterministic
            // fix for JWT expiry; this covers outages longer than the fast-backoff window.
            console.log('[realtime:board-presence] fast-backoff exhausted — slow retry in 30s');
            if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
            recoveryTimerRef.current = setTimeout(() => {
              if (tearingDownRef.current) return;
              const old = presenceChannelRef.current;
              presenceChannelRef.current = null;
              if (old) supabase.removeChannel(old);
              createChannel();
            }, 30000);
            return;
          }
          recoveryAttemptsRef.current++;
          const delay = 1000 * recoveryAttemptsRef.current;
          console.log(`[realtime:board-presence] unexpected ${status} — recovering in ${delay}ms (attempt ${recoveryAttemptsRef.current})`);
          if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
          recoveryTimerRef.current = setTimeout(() => {
            if (tearingDownRef.current) return;
            const old = presenceChannelRef.current;
            presenceChannelRef.current = null;
            if (old) supabase.removeChannel(old);
            createChannel();
          }, delay);
        }
      });
    };

    createChannel();

    return () => {
      tearingDownRef.current = true;
      presenceSubscribedRef.current = false;
      if (stableTimer) { clearTimeout(stableTimer); stableTimer = null; }
      if (syncReplyTimer) { clearTimeout(syncReplyTimer); syncReplyTimer = null; }
      if (recoveryTimerRef.current) { clearTimeout(recoveryTimerRef.current); recoveryTimerRef.current = null; }
      console.log('[presence:effect] removing channel', tabIdRef.current, Date.now());
      const ch = presenceChannelRef.current;
      presenceChannelRef.current = null;
      if (ch) supabase.removeChannel(ch);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, sessionReady, authEpoch]);

  const roleDecisionsSubscribedRef = useRef(false);

  // Sync role_decisions changes from other sessions
  useEffect(() => {
    if (!sessionReady || roleDecisionsSubscribedRef.current) return;
    roleDecisionsSubscribedRef.current = true;

    const channel = supabase
      .channel('role-decisions-sync')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'role_decisions' }, (payload) => {
        const row = payload.new as RoleDecision;
        setRoleDecisions(prev => prev.some(d => d.id === row.id) ? prev : [...prev, row]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'role_decisions' }, (payload) => {
        const row = payload.new as RoleDecision;
        setRoleDecisions(prev => prev.map(d => d.id === row.id ? row : d));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'role_decisions' }, (payload) => {
        const old = payload.old as Pick<RoleDecision, 'id'>;
        setRoleDecisions(prev => prev.filter(d => d.id !== old.id));
      })
      .subscribe((status, err) => {
        console.log('[realtime:role-decisions-sync] status:', status, err ?? '');
        if (status === 'CHANNEL_ERROR') {
          console.warn('[realtime:role-decisions-sync] channel error', err);
        }
      });

    return () => {
      roleDecisionsSubscribedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, sessionReady]);

  const matchesSubscribedRef = useRef(false);

  // Sync candidate_role_matches changes from other sessions
  useEffect(() => {
    if (!sessionReady || matchesSubscribedRef.current) return;
    matchesSubscribedRef.current = true;

    const channel = supabase
      .channel('candidate-role-matches-sync')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'candidate_role_matches' }, (payload) => {
        const match = payload.new as CandidateRoleMatch;
        setCandidates(prev => prev.map(c => {
          if (c.id !== match.candidate_id) return c;
          if (c.roles?.some(r => r.id === match.id)) return c;
          return { ...c, roles: [...(c.roles || []), match] };
        }));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'candidate_role_matches' }, (payload) => {
        const match = payload.new as CandidateRoleMatch;
        const withoutOld = candidatesRef.current.map(c => ({ ...c, roles: c.roles?.filter(r => r.id !== match.id) }));
        const nextCandidates = withoutOld.map(c => {
          if (c.id !== match.candidate_id) return c;
          return { ...c, roles: [...(c.roles || []), match] };
        });
        setCandidates(nextCandidates);
        // Rebuild sort order for this role from updated state, skip if local user is dragging here
        const roleId = match.role_id;
        if (roleId in candidateOrderRef.current && activeDragRoleRef.current !== roleId) {
          const forRole = nextCandidates.flatMap(c =>
            (c.roles ?? [])
              .filter(rm => rm.role_id === roleId && rm.sort_key != null)
              .map(rm => ({ cId: c.id, key: rm.sort_key! }))
          );
          forRole.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
          setCandidateOrder(prev => ({ ...prev, [roleId]: forRole.map(x => x.cId) }));
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'candidate_role_matches' }, (payload) => {
        // payload.old only contains the PK with default replica identity, so filter by id only
        const old = payload.old as Pick<CandidateRoleMatch, 'id'>;
        setCandidates(prev => prev.map(c => ({ ...c, roles: c.roles?.filter(r => r.id !== old.id) })));
      })
      .subscribe((status, err) => {
        console.log('[realtime:candidate-role-matches-sync] status:', status, err ?? '');
        if (status === 'CHANNEL_ERROR') {
          console.warn('[realtime:candidate-role-matches-sync] channel error', err);
        }
      });

    return () => {
      matchesSubscribedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, sessionReady]);

  const candidatesSyncSubscribedRef = useRef(false);

  // Sync candidates table changes from other sessions (edits, bookmark toggles, deletions)
  useEffect(() => {
    if (!sessionReady || candidatesSyncSubscribedRef.current) return;
    candidatesSyncSubscribedRef.current = true;

    const channel = supabase
      .channel('candidates-sync')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'candidates' }, (payload) => {
        const candidate = payload.new as Candidate;
        setCandidates(prev => prev.some(c => c.id === candidate.id) ? prev : [...prev, { ...candidate, roles: [] }]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'candidates' }, (payload) => {
        const updated = payload.new as Candidate;
        setCandidates(prev => prev.map(c => c.id === updated.id ? { ...updated, roles: c.roles } : c));
        setSelectedCandidate(prev => prev?.id === updated.id ? { ...updated, roles: prev.roles } : prev);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'candidates' }, (payload) => {
        const old = payload.old as Pick<Candidate, 'id'>;
        setCandidates(prev => prev.filter(c => c.id !== old.id));
        setSelectedCandidate(prev => prev?.id === old.id ? null : prev);
      })
      .subscribe((status, err) => {
        if (err) console.warn('[realtime:candidates-sync]', status, err);
      });

    return () => {
      candidatesSyncSubscribedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, sessionReady]);

  // Load saved sort order when a role is selected
  useEffect(() => {
    if (!selectedRoleId) return;
    if (candidateOrder[selectedRoleId]) return; // already loaded

    const loadOrder = async () => {
      const { data } = await supabase
        .from('candidate_role_matches')
        .select('candidate_id, sort_order, sort_key')
        .eq('role_id', selectedRoleId)
        .order('sort_key', { ascending: true, nullsFirst: false });

      if (!data) return;

      const withKey = data.filter(r => r.sort_key != null);
      const withoutKey = data.filter(r => r.sort_key == null);

      if (withKey.length === 0 && withoutKey.length === 0) return;

      // If no saved order exists, we'll use alphabetical (handled by sortedCandidates default)
      // Only set candidateOrder if there's actual saved sort data
      if (withKey.length > 0) {
        const ordered = [
          ...withKey.map(r => r.candidate_id),
          ...withoutKey.map(r => r.candidate_id),
        ];
        setCandidateOrder(prev => ({ ...prev, [selectedRoleId]: ordered }));
      }
    };

    loadOrder();
  }, [selectedRoleId, candidateOrder]);

  const selectedRole = selectedRoleId ? roles.find(r => r.id === selectedRoleId) : null;
  const selectedRoleDecision = selectedRoleId ? roleDecisions.find(d => d.role_id === selectedRoleId) : undefined;

  const assignedCandidates = useMemo(() => {
    const assignedIds = new Set(roleDecisions.filter(d => d.selected_candidate_id).map(d => d.selected_candidate_id));
    return candidates.filter(c => assignedIds.has(c.id));
  }, [candidates, roleDecisions]);

  // Total candidate_role_matches count per role, across all candidates.
  // Used by CandidateCard to display rank / total (e.g. "3 / 19").
  const roleMatchTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const c of candidates) {
      for (const rm of c.roles ?? []) {
        totals[rm.role_id] = (totals[rm.role_id] ?? 0) + 1;
      }
    }
    return totals;
  }, [candidates]);

  const roleRankMap = useMemo(() => {
    const result = new Map<string, Map<string, { rank: number; total: number }>>();
    const roleToCandidates = new Map<string, { candidateId: string; sortKey: string }[]>();
    for (const c of candidates) {
      for (const rm of c.roles ?? []) {
        if (rm.sort_key == null) continue;
        if (!roleToCandidates.has(rm.role_id)) roleToCandidates.set(rm.role_id, []);
        roleToCandidates.get(rm.role_id)!.push({ candidateId: c.id, sortKey: rm.sort_key });
      }
    }
    for (const [roleId, entries] of roleToCandidates) {
      entries.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
      const innerMap = new Map<string, { rank: number; total: number }>();
      const total = entries.length;
      entries.forEach((entry, index) => {
        innerMap.set(entry.candidateId, { rank: index + 1, total });
      });
      result.set(roleId, innerMap);
    }
    return result;
  }, [candidates]);

  const { fallThroughCandidates, fallThroughAllCount } = useMemo(() => {
    const empty = { fallThroughCandidates: [] as Candidate[], fallThroughAllCount: 0 };
    if (!selectedRoleId) return empty;
    const selRole = roles.find(r => r.id === selectedRoleId);
    if (!selRole || selRole.selection_order == null) return empty;
    const N = selRole.selection_order;
    const S = selRole.silo_id;

    const assignedIds = new Set(
      roleDecisions
        .filter(d => (d.status === 'in_progress' || d.status === 'filled') && d.selected_candidate_id)
        .map(d => d.selected_candidate_id!)
    );
    const matchedToSelected = new Set(
      candidates.filter(c => c.roles?.some(rm => rm.role_id === selectedRoleId)).map(c => c.id)
    );
    const allPriorIds = new Set(
      roles.filter(r => r.selection_order != null && r.selection_order < N).map(r => r.id)
    );
    const scopedPriorIds = fallThroughScope === 'silo'
      ? new Set(roles.filter(r => r.selection_order != null && r.selection_order < N && r.silo_id === S).map(r => r.id))
      : allPriorIds;

    const score = (c: Candidate, priorIds: Set<string>) => {
      let bestRank = Number.MAX_SAFE_INTEGER, anchorOrder = Number.MAX_SAFE_INTEGER;
      for (const rm of c.roles ?? []) {
        if (!priorIds.has(rm.role_id)) continue;
        const rank = roleRankMap.get(rm.role_id)?.get(c.id)?.rank ?? Number.MAX_SAFE_INTEGER;
        const roleOrder = roles.find(r => r.id === rm.role_id)?.selection_order ?? Number.MAX_SAFE_INTEGER;
        if (rank < bestRank || (rank === bestRank && roleOrder < anchorOrder)) { bestRank = rank; anchorOrder = roleOrder; }
      }
      return bestRank < Number.MAX_SAFE_INTEGER ? { bestRank, anchorOrder } : null;
    };

    let allCount = 0;
    const scopedScored: { candidate: Candidate; bestRank: number; anchorOrder: number }[] = [];
    for (const c of candidates) {
      if (assignedIds.has(c.id) || matchedToSelected.has(c.id)) continue;
      const allScore = score(c, allPriorIds);
      if (!allScore) continue;
      allCount++;
      const scopedScore = fallThroughScope === 'all' ? allScore : score(c, scopedPriorIds);
      if (scopedScore) scopedScored.push({ candidate: c, ...scopedScore });
    }

    const sorted = scopedScored
      .sort((a, b) =>
        a.bestRank !== b.bestRank ? a.bestRank - b.bestRank :
        a.anchorOrder !== b.anchorOrder ? a.anchorOrder - b.anchorOrder :
        a.candidate.full_name.localeCompare(b.candidate.full_name)
      )
      .map(x => x.candidate);

    return { fallThroughCandidates: sorted, fallThroughAllCount: allCount };
  }, [candidates, roleDecisions, roles, selectedRoleId, fallThroughScope, roleRankMap]);

  const matchedRolesData = useMemo(() => {
    if (!selectedCandidate) return [];
    return (selectedCandidate.roles ?? [])
      .map(rm => {
        const role = roles.find(r => r.id === rm.role_id);
        if (!role) return null;
        const decision = roleDecisions.find(d => d.role_id === role.id);
        const isFilled = decision?.status === 'filled';
        const isCandidateAssigned = decision?.selected_candidate_id === selectedCandidate.id;
        const isRoleOpen = !decision?.selected_candidate_id || decision?.status === 'open';
        const rankData = roleRankMap.get(role.id)?.get(selectedCandidate.id);
        const rank = rankData?.rank ?? 0;
        const total = rankData?.total ?? (roleMatchTotals?.[role.id] ?? 0);
        return { role, siloName: role.silo?.name ?? 'Other', isFilled, isCandidateAssigned, isRoleOpen, rank, total };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => {
        const aOrder = a.role.selection_order ?? Number.MAX_SAFE_INTEGER;
        const bOrder = b.role.selection_order ?? Number.MAX_SAFE_INTEGER;
        return aOrder - bOrder;
      });
  }, [selectedCandidate, roles, roleDecisions, roleRankMap, roleMatchTotals]);

  useEffect(() => { setRolesFilter('all'); }, [selectedCandidate?.id]);
  useEffect(() => { setRoleViewFilter('open'); }, [selectedRoleId]);

  const orderedRoleIds = useMemo(() => {
    const source = roleNavTab === 'all' ? roles : roles.filter(r => r.silo?.name === roleNavTab);
    return [...source].sort((a, b) => {
      if (a.selection_order != null && b.selection_order != null) return a.selection_order - b.selection_order;
      if (a.selection_order != null) return -1;
      if (b.selection_order != null) return 1;
      return a.title.localeCompare(b.title);
    }).map(r => r.id);
  }, [roles, roleNavTab]);

  const currentNavIndex = selectedRoleId ? orderedRoleIds.indexOf(selectedRoleId) : -1;
  const prevRoleId  = currentNavIndex > 0 ? orderedRoleIds[currentNavIndex - 1] : null;
  const nextRoleId  = currentNavIndex >= 0 && currentNavIndex < orderedRoleIds.length - 1
    ? orderedRoleIds[currentNavIndex + 1] : null;
  const prevRole = prevRoleId ? roles.find(r => r.id === prevRoleId) : null;
  const nextRole = nextRoleId ? roles.find(r => r.id === nextRoleId) : null;

  useEffect(() => {
    if (!selectedRoleId || showAllCandidates) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (showAddModal || showEditModal || showSelectionOrder || roleAdminModalOpen) return;
      if (e.target instanceof HTMLElement && (
        e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' ||
        e.target.tagName === 'SELECT' || e.target.isContentEditable
      )) return;
      if (e.key === 'ArrowLeft' && prevRoleId)       setSelectedRoleId(prevRoleId);
      else if (e.key === 'ArrowRight' && nextRoleId) setSelectedRoleId(nextRoleId);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedRoleId, showAllCandidates, prevRoleId, nextRoleId, showAddModal, showEditModal, showSelectionOrder, roleAdminModalOpen]);

  const statusTabCounts = useMemo(() => {
    const filledIds = new Set(roleDecisions.filter(d => d.status === 'filled' && d.selected_candidate_id).map(d => d.selected_candidate_id!));
    const openIds = new Set(roleDecisions.filter(d => d.status !== 'filled' && d.selected_candidate_id).map(d => d.selected_candidate_id!));
    let filled = 0, assigned = 0, recommended = 0, available = 0;
    for (const c of candidates) {
      if (filledIds.has(c.id)) filled++;
      else if (openIds.has(c.id)) assigned++;
      else if ((c.roles?.length ?? 0) > 0) recommended++;
      else available++;
    }
    return { all: candidates.length, filled, assigned, recommended, available };
  }, [candidates, roleDecisions]);

  // Progress calculations
  const totalRoles = roles.length;
  const totalFilled = roleDecisions.filter(d => d.status === 'filled').length;
  const totalInProgress = roleDecisions.filter(d => d.selected_candidate_id && d.status !== 'filled').length;
  const progressPercentage = totalRoles > 0 ? Math.round((totalFilled / totalRoles) * 100) : 0;
  const assignedRolesCount = roleDecisions.filter(d => d.status === 'filled' || d.status === 'in_progress').length;
  const filledPercentage = progressPercentage;
  const assignedPercentage = totalRoles > 0 ? Math.round((assignedRolesCount / totalRoles) * 100) : 0;
  const activeCount = progressMetric === 'filled' ? totalFilled : assignedRolesCount;
  const activePercentage = progressMetric === 'filled' ? filledPercentage : assignedPercentage;
  const activeColorClass = progressMetric === 'filled' ? 'text-forest-500' : 'text-steel-500';

  const uniqueCongregations = useMemo(() => {
    const congregations = new Set(
      candidates
        .map(c => c.congregation)
        .filter(Boolean)
        .sort()
    );
    return Array.from(congregations);
  }, [candidates]);

  const filteredCandidates = useMemo(() => {
    let result: Candidate[];
    if (showAllCandidates) {
      if (statusTab === 'all') {
        result = candidates;
      } else {
        const filledIds = new Set(roleDecisions.filter(d => d.status === 'filled' && d.selected_candidate_id).map(d => d.selected_candidate_id!));
        const openIds = new Set(roleDecisions.filter(d => d.status !== 'filled' && d.selected_candidate_id).map(d => d.selected_candidate_id!));
        if (statusTab === 'filled') result = candidates.filter(c => filledIds.has(c.id));
        else if (statusTab === 'assigned') result = candidates.filter(c => !filledIds.has(c.id) && openIds.has(c.id));
        else if (statusTab === 'recommended') result = candidates.filter(c => !filledIds.has(c.id) && !openIds.has(c.id) && (c.roles?.length ?? 0) > 0);
        else result = candidates.filter(c => !filledIds.has(c.id) && !openIds.has(c.id) && (c.roles?.length ?? 0) === 0);
      }
    } else if (selectedRoleId) {
      result = candidates.filter(c => c.roles?.some(rm => rm.role_id === selectedRoleId));
    } else {
      result = [];
    }

    // Apply each locked chip as an AND filter
    for (const chip of filterChips) {
      const query = chip.term.toLowerCase();
      result = result.filter(c => {
        const matches: boolean[] = [];
        if (chip.fields.name) matches.push(!!c.full_name?.toLowerCase().includes(query));
        if (chip.fields.congregation) matches.push(!!c.congregation?.toLowerCase().includes(query));
        if (chip.fields.currentResponsibilities) matches.push(!!c.current_responsibilities?.toLowerCase().includes(query));
        if (chip.fields.circuitResponsibilities) matches.push(!!c.circuit_responsibilities?.toLowerCase().includes(query));
        if (chip.fields.regionalExperience) matches.push(!!c.experience?.toLowerCase().includes(query));
        if (chip.fields.comments) matches.push(!!c.comments?.toLowerCase().includes(query));
        if (chip.fields.coComments) matches.push(!!c.co_comments?.toLowerCase().includes(query));
        return matches.some(m => m);
      });
    }

    // Apply live search query (while typing, before adding as a chip)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(c => {
        const matches: boolean[] = [];
        if (searchFields.name) matches.push(!!c.full_name?.toLowerCase().includes(query));
        if (searchFields.congregation) matches.push(!!c.congregation?.toLowerCase().includes(query));
        if (searchFields.currentResponsibilities) matches.push(!!c.current_responsibilities?.toLowerCase().includes(query));
        if (searchFields.circuitResponsibilities) matches.push(!!c.circuit_responsibilities?.toLowerCase().includes(query));
        if (searchFields.regionalExperience) matches.push(!!c.experience?.toLowerCase().includes(query));
        if (searchFields.comments) matches.push(!!c.comments?.toLowerCase().includes(query));
        if (searchFields.coComments) matches.push(!!c.co_comments?.toLowerCase().includes(query));
        return matches.some(m => m);
      });
    }

    // Filter by age range
    if (ageRange.min || ageRange.max) {
      const minAge = ageRange.min ? parseInt(ageRange.min) : 0;
      const maxAge = ageRange.max ? parseInt(ageRange.max) : 999;
      result = result.filter(c => {
        if (!c.age) return false;
        return c.age >= minAge && c.age <= maxAge;
      });
    }

    if (filterCongregation !== 'all') {
      result = result.filter(c => c.congregation === filterCongregation);
    }

    if (filterHasPhoto) {
      result = result.filter(c => !!c.photo_url);
    }

    if (filterBookmarked) {
      result = result.filter(c => c.is_bookmarked);
    }

    if (filterSilos.size > 0) {
      const roleToSilo = new Map(roles.map(r => [r.id, r.silo?.name]));
      result = result.filter(c =>
        (c.roles ?? []).some(rm => {
          const silo = roleToSilo.get(rm.role_id);
          return silo != null && filterSilos.has(silo);
        })
      );
    }

    return result;
  }, [candidates, roleDecisions, statusTab, showAllCandidates, selectedRoleId, searchQuery, searchFields, filterChips, ageRange, filterCongregation, filterHasPhoto, filterBookmarked, filterSilos, roles]);

  const sortedCandidates = useMemo(() => {
    // In role view, use custom drag order if set; otherwise sort by DB sort_key, then alphabetical
    if (selectedRoleId && !showAllCandidates) {
      const order = candidateOrder[selectedRoleId];
      if (order && order.length > 0) {
        const idToCandidate = new Map(filteredCandidates.map(c => [c.id, c]));
        const ordered = order.flatMap(id => {
          const c = idToCandidate.get(id);
          return c ? [c] : [];
        });
        // Append any filtered candidates not yet in order (e.g. newly added)
        const orderedIds = new Set(order);
        const extras = filteredCandidates.filter(c => !orderedIds.has(c.id));
        return [...ordered, ...extras];
      }
    }

    return [...filteredCandidates].sort((a, b) => {
      return a.full_name.localeCompare(b.full_name);
    });
  }, [filteredCandidates, selectedRoleId, showAllCandidates, candidateOrder]);

  // Get CORE silo and roles
  const coreSilo = silos.find(s => s.name === 'CORE');
  const coreRoles = coreSilo
    ? roles.filter(r => r.silo_id === coreSilo.id).sort((a, b) => (a.selection_order || 999) - (b.selection_order || 999))
    : [];

  const coreFilledCount = useMemo(() => {
    if (!coreSilo) return 0;
    const coreRoleIds = new Set(roles.filter(r => r.silo_id === coreSilo.id).map(r => r.id));
    return roleDecisions.filter(d => coreRoleIds.has(d.role_id) && d.status === 'filled').length;
  }, [coreSilo, roles, roleDecisions]);

  const getRoleDecision = (roleId: string) => {
    return roleDecisions.find(d => d.role_id === roleId);
  };

  const handleDragStart = useCallback((event: DragStartEvent) => {
    if (!selectedRoleId) return;
    activeDragRoleRef.current = selectedRoleId;
    acquireLock('drag', event.active.id as string);
  }, [selectedRoleId, acquireLock]);

  const handleDragCancel = useCallback((_event: DragCancelEvent) => {
    activeDragRoleRef.current = null;
    releaseLock('drag');
  }, [releaseLock]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    activeDragRoleRef.current = null;
    releaseLock('drag');

    const { active, over } = event;
    if (!over || active.id === over.id || !selectedRoleId) return;

    const currentOrder = candidateOrder[selectedRoleId] ?? sortedCandidates.map(c => c.id);
    const oldIndex = currentOrder.indexOf(active.id as string);
    const newIndex = currentOrder.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(currentOrder, oldIndex, newIndex);
    setCandidateOrder(prev => ({ ...prev, [selectedRoleId]: newOrder }));

    // Derive prevKey/nextKey from the LIVE key-sorted list, not the stale candidateOrder.
    // During a drag, remote sort_key patches update candidates state but skip the
    // candidateOrder rebuild (drag guard, line 649), so candidateOrder positions can diverge
    // from sort_key order. Reading keys by array position would produce inverted bounds if a
    // concurrent move landed a neighbor's key on the wrong side of the gap. Instead: build
    // the sorted-by-key list right now (excluding the dragged card), find where the visual
    // lower neighbor sits in that ground-truth order, and read bounding keys from adjacent
    // slots — guaranteeing prevKey < nextKey regardless of concurrent edits.
    const keySorted = candidates
      .filter(c => c.id !== (active.id as string))
      .flatMap(c =>
        (c.roles ?? [])
          .filter(rm => rm.role_id === selectedRoleId && rm.sort_key != null)
          .map(rm => ({ cId: c.id, key: rm.sort_key! }))
      )
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

    const visualPrevId = newIndex > 0 ? newOrder[newIndex - 1] : null;
    const insertAfterIdx = visualPrevId ? keySorted.findIndex(x => x.cId === visualPrevId) : -1;

    const prevKey = insertAfterIdx >= 0 ? keySorted[insertAfterIdx].key : null;
    const nextKey = insertAfterIdx < keySorted.length - 1 ? keySorted[insertAfterIdx + 1].key : null;
    const newKey = safeKeyBetween(prevKey, nextKey);

    // Single-row update — only the moved card changes in DB
    await supabase
      .from('candidate_role_matches')
      .update({ sort_key: newKey, sort_order: newIndex + 1 })
      .eq('candidate_id', active.id as string)
      .eq('role_id', selectedRoleId);
  }, [selectedRoleId, candidateOrder, sortedCandidates, candidates, releaseLock]);

  // Returns the editor's name only for OTHER users — own badge is suppressed (userId filter).
  const getEditLockDisplay = (candidateId: string): string | undefined => {
    const lock = editLocks.get(candidateId);
    return lock && lock.userId !== userId ? lock.name : undefined;
  };

  const maxSortKeyForRole = (roleId: string, excludeCandidateId?: string): string | null => {
    let max: string | null = null;
    for (const c of candidates) {
      if (excludeCandidateId && c.id === excludeCandidateId) continue;
      for (const rm of c.roles ?? []) {
        if (rm.role_id === roleId && rm.sort_key != null) {
          try { generateKeyBetween(rm.sort_key, null); } catch { continue; }
          if (max == null || rm.sort_key > max) max = rm.sort_key;
        }
      }
    }
    return max;
  };

  const maxSortOrderForRole = (roleId: string, excludeCandidateId?: string): number => {
    let max = 0;
    for (const c of candidates) {
      if (excludeCandidateId && c.id === excludeCandidateId) continue;
      for (const rm of c.roles ?? []) {
        if (rm.role_id === roleId && (rm.sort_order ?? 0) > max) {
          max = rm.sort_order ?? 0;
        }
      }
    }
    return max;
  };

  const handleAddCandidate = async (candidateData: any, roleIds: string[]) => {
    const { data: newCandidate, error } = await supabase.from('candidates').insert(candidateData).select().single();
    if (error) throw error;
    if (newCandidate && roleIds.length > 0) {
      await supabase.from('candidate_role_matches').insert(roleIds.map(roleId => {
        const lastKey = maxSortKeyForRole(roleId);
        return {
          candidate_id: newCandidate.id,
          role_id: roleId,
          is_primary_recommendation: false,
          sort_order: maxSortOrderForRole(roleId) + 1,
          sort_key: safeKeyBetween(lastKey, null),
        };
      }));
    }
    await reloadAllCandidates();
  };

  const handleEditCandidate = async (candidateData: any, roleIds: string[]) => {
    if (!selectedCandidate) return;

    // Diff old vs new role sets — only touch what changed.
    // Kept roles preserve their existing sort_order and is_primary_recommendation.
    const oldRoleMatches = selectedCandidate.roles ?? [];
    const oldRoleIdSet = new Set(oldRoleMatches.map(rm => rm.role_id));
    const newRoleIdSet = new Set(roleIds);
    const removedMatches = oldRoleMatches.filter(rm => !newRoleIdSet.has(rm.role_id));
    const addedRoleIds = roleIds.filter(rid => !oldRoleIdSet.has(rid));

    await supabase.from('candidates').update(candidateData).eq('id', selectedCandidate.id);

    // Delete removed matches one at a time so each row's sort_order is known
    // for the sibling-renumber call.
    for (const rm of removedMatches) {
      const { error: delErr } = await supabase
        .from('candidate_role_matches')
        .delete()
        .eq('id', rm.id);
      if (delErr) {
        console.error('[handleEditCandidate] delete failed for match', rm.id, ':', delErr);
        continue;
      }
      if (rm.sort_order != null) {
        const { error: rpcErr } = await supabase.rpc('decrement_sort_orders_above', {
          p_role_id: rm.role_id,
          p_threshold: rm.sort_order,
        });
        if (rpcErr) {
          console.error('[handleEditCandidate] decrement RPC failed for role', rm.role_id, ':', rpcErr);
        }
      }
    }

    // Insert newly added matches at the end of each role's list
    if (addedRoleIds.length > 0) {
      const { error: insErr } = await supabase
        .from('candidate_role_matches')
        .insert(addedRoleIds.map(roleId => {
          const lastKey = maxSortKeyForRole(roleId, selectedCandidate.id);
          return {
            candidate_id: selectedCandidate.id,
            role_id: roleId,
            is_primary_recommendation: false,
            sort_order: maxSortOrderForRole(roleId, selectedCandidate.id) + 1,
            sort_key: safeKeyBetween(lastKey, null),
          };
        }));
      if (insErr) {
        console.error('[handleEditCandidate] insert failed for added roles:', insErr);
      }
    }

    await reloadAllCandidates();
    releaseLock('edit');
    setSelectedCandidate(null);
  };

  const handleCloseEditModal = () => {
    releaseLock('edit');
    setShowEditModal(false);
    setSelectedCandidate(null);
  };

  const handleDeleteCandidate = async () => {
    if (!selectedCandidate) return;
    const candidateId = selectedCandidate.id;

    // Capture matches before deletion to renumber siblings in each affected role
    const matchesToRemove = (selectedCandidate.roles ?? [])
      .filter(rm => rm.sort_order != null);

    releaseLock('edit');
    await supabase.from('candidate_role_matches').delete().eq('candidate_id', candidateId);

    if (matchesToRemove.length > 0) {
      await Promise.all(matchesToRemove.map(rm =>
        supabase.rpc('decrement_sort_orders_above', {
          p_role_id: rm.role_id,
          p_threshold: rm.sort_order,
        })
      ));
    }
    const { data: affectedDecisions } = await supabase
      .from('role_decisions')
      .select('role_id')
      .eq('selected_candidate_id', candidateId);
    if (affectedDecisions && affectedDecisions.length > 0) {
      await supabase
        .from('role_decisions')
        .update({ selected_candidate_id: null, status: 'open' })
        .eq('selected_candidate_id', candidateId);
      setRoleDecisions(prev =>
        prev.map(d =>
          d.selected_candidate_id === candidateId
            ? { ...d, selected_candidate_id: undefined, status: 'open' as const }
            : d
        )
      );
      if (affectedDecisions.some(d => d.role_id === selectedRoleId)) {
        setSelectedRoleId(null);
      }
    }
    await supabase.from('candidates').delete().eq('id', candidateId);
    setCandidates(prev => prev.filter(c => c.id !== candidateId));
    setSelectedCandidate(null);
    setShowEditModal(false);
  };

  const handleEditClick = (candidate: Candidate) => {
    // Guard same-tab double-open via currentLocksRef (no round-trip needed).
    if (currentLocksRef.current.editing === candidate.id) return;
    const lock = editLocks.get(candidate.id);
    if (lock && lock.userId !== userId) {
      alert(`This candidate is being edited by ${lock.name}`);
      return;
    }
    acquireLock('edit', candidate.id);
    setSelectedCandidate(candidate);
    setShowEditModal(true);
  };

  const handleAssignCandidate = async (candidateId: string | null) => {
    if (!selectedRoleId) return;
    const { data, error } = await supabase.from('role_decisions').upsert({ role_id: selectedRoleId, selected_candidate_id: candidateId, status: candidateId ? 'in_progress' : 'open' }, { onConflict: 'role_id' }).select().single();
    if (error) { alert('Error: ' + error.message); return; }
    if (data) setRoleDecisions(prev => [...prev.filter(d => d.role_id !== selectedRoleId), data]);
  };

  // Rewrite a card's sort_key so it sorts before every other candidate in the
  // sortable pool (the assignee is pinned/excluded, so we target the pool min).
  const handleMoveToTop = async (candidateId: string) => {
    if (!selectedRoleId) return;

    const assigneeId = roleDecisions.find(d => d.role_id === selectedRoleId)?.selected_candidate_id ?? null;
    const keyFor = (id: string) =>
      candidates.find(c => c.id === id)?.roles?.find(r => r.role_id === selectedRoleId)?.sort_key ?? null;

    // Lexicographic min sort_key across the pool (everyone except this card and the assignee).
    let firstPoolKey: string | null = null;
    for (const c of candidates) {
      if (c.id === candidateId || c.id === assigneeId) continue;
      const k = c.roles?.find(r => r.role_id === selectedRoleId)?.sort_key;
      if (k == null) continue;
      if (firstPoolKey == null || k < firstPoolKey) firstPoolKey = k;
    }

    // No-op only when the candidate has a KNOWN key that is already strictly the
    // pool minimum. A null/undefined key (freshly-added, stale state) must proceed.
    const myKey = keyFor(candidateId);
    if (firstPoolKey == null) {
      // Pool is empty — nothing to move ahead of. Still write if we have no key yet.
      if (myKey != null) return;
    } else {
      if (myKey != null && myKey < firstPoolKey) return;
    }

    const newKey = safeKeyBetween(null, firstPoolKey);

    // Optimistic: move to the front of the canonical order. Skip if the candidate
    // is not yet in the order (freshly added, not yet in state) — the DB write still
    // goes through; the next render/realtime event reconciles.
    const currentOrder = candidateOrder[selectedRoleId] ?? sortedCandidates.map(c => c.id);
    const oldIndex = currentOrder.indexOf(candidateId);
    if (oldIndex !== -1) {
      setCandidateOrder(prev => ({ ...prev, [selectedRoleId]: arrayMove(currentOrder, oldIndex, 0) }));
    }

    await supabase
      .from('candidate_role_matches')
      .update({ sort_key: newKey, sort_order: 1 })
      .eq('candidate_id', candidateId)
      .eq('role_id', selectedRoleId);
  };

  // Unified assign: ensure recommended → move to top → assign (status 'in_progress').
  const handleAssignToRole = async (candidateId: string) => {
    if (!selectedRoleId) return;
    const hasMatch = candidates.find(c => c.id === candidateId)
      ?.roles?.some(r => r.role_id === selectedRoleId) ?? false;
    if (!hasMatch) await handleAddCandidateToRole(candidateId);
    await handleMoveToTop(candidateId);
    await handleAssignCandidate(candidateId);
  };

  const handleMarkFilled = async () => {
    if (!selectedRoleId) return;
    const decision = roleDecisions.find(d => d.role_id === selectedRoleId);
    if (!decision?.selected_candidate_id) return;
    const { data } = await supabase.from('role_decisions').update({ status: 'filled' }).eq('role_id', selectedRoleId).select().single();
    if (data) setRoleDecisions(prev => prev.map(d => d.role_id === selectedRoleId ? data : d));
  };

  const handleUnfill = async () => {
    if (!selectedRoleId) return;
    const { data } = await supabase
      .from('role_decisions')
      .update({ status: 'in_progress' })
      .eq('role_id', selectedRoleId)
      .select()
      .single();
    if (data) setRoleDecisions(prev => prev.map(d => d.role_id === selectedRoleId ? data : d));
  };

  const handleAddCandidateToRole = async (candidateId: string) => {
    if (!selectedRoleId) return;

    const lastKey = maxSortKeyForRole(selectedRoleId);
    const { error } = await supabase
      .from('candidate_role_matches')
      .insert({
        candidate_id: candidateId,
        role_id: selectedRoleId,
        is_primary_recommendation: false,
        sort_order: maxSortOrderForRole(selectedRoleId) + 1,
        sort_key: safeKeyBetween(lastKey, null),
      });

    if (error) {
      alert('Error adding candidate to role: ' + error.message);
      return;
    }

    await reloadAllCandidates();
    setCandidateOrder(prev => {
      const next = { ...prev };
      delete next[selectedRoleId];
      return next;
    });
  };

  const handleRemoveCandidateFromRole = async (candidateId: string) => {
    if (!selectedRoleId) return;

    // Capture sort_order from in-memory data before deleting so we can
    // decrement siblings without an extra DB round-trip.
    const candidate = candidates.find(c => c.id === candidateId);
    const match = candidate?.roles?.find(rm => rm.role_id === selectedRoleId);
    const sortOrder = match?.sort_order ?? null;

    const { error } = await supabase
      .from('candidate_role_matches')
      .delete()
      .eq('candidate_id', candidateId)
      .eq('role_id', selectedRoleId);

    if (error) {
      alert('Error removing candidate from role: ' + error.message);
      return;
    }

    if (sortOrder != null) {
      await supabase.rpc('decrement_sort_orders_above', {
        p_role_id: selectedRoleId,
        p_threshold: sortOrder,
      });
    }

    // If this candidate was also the assignee for this role, clear the decision
    // so the pin doesn't dangle after the match row is gone.
    const danglingDecision = roleDecisions.find(
      d => d.role_id === selectedRoleId && d.selected_candidate_id === candidateId
    );
    if (danglingDecision) {
      const { data: clearedDecision } = await supabase
        .from('role_decisions')
        .update({ selected_candidate_id: null, status: 'open' })
        .eq('role_id', selectedRoleId)
        .select()
        .single();
      if (clearedDecision) {
        setRoleDecisions(prev => prev.map(d => d.role_id === selectedRoleId ? clearedDecision : d));
      }
    }

    await reloadAllCandidates();
    setCandidateOrder(prev => {
      const next = { ...prev };
      delete next[selectedRoleId];
      return next;
    });
  };

  const handleUpdateRole = async (roleId: string, title: string, description: string, qualities: string, proximityScore: number | null, selectionOrder: number | null, siloId: string) => {
    const { error } = await supabase
      .from('roles')
      .update({ 
        title, 
        description,
        qualities,
        proximity_score: proximityScore,
        selection_order: selectionOrder,
        silo_id: siloId
      })
      .eq('id', roleId);
    
    if (error) {
      alert('Error updating role: ' + error.message);
      return;
    }
    
    // Reload roles to reflect changes
    const { data } = await supabase
      .from('roles')
      .select('*, silo:silos(*)')
      .order('selection_order');
    
    if (data) {
      setRoles(data);
      // Force refresh of selected role by clearing and resetting
      const currentSelectedId = selectedRoleId;
      setSelectedRoleId(null);
      setTimeout(() => {
        setSelectedRoleId(currentSelectedId);
      }, 0);
    }
  };

  const handleAddRole = async (siloId: string, title: string, description: string, qualities: string, selectionOrder: number | null) => {
    const { error } = await supabase
      .from('roles')
      .insert({
        silo_id: siloId,
        title,
        description,
        qualities,
        selection_order: selectionOrder
      });
    
    if (error) {
      alert('Error creating role: ' + error.message);
      return;
    }
    
    // Reload roles to include the new one
    const { data } = await supabase
      .from('roles')
      .select('*, silo:silos(*)')
      .order('selection_order');
    
    if (data) {
      setRoles(data);
    }
  };

  const handleExport = () => {
    if (!isAdmin) return;
    window.location.href = '/export';
  };

  const handleLayoutChange     = (l: RoleViewLayout) => { setRoleViewLayout(l); localStorage.setItem('roleViewLayout',  l); };
  const handleSplitRatioChange = (r: SplitRatio)     => { setSplitRatio(r);     localStorage.setItem('roleSplitRatio',  r); };

  const handleNavTabChange = (tab: RoleNavTab) => {
    if (tab !== 'all') {
      const siloRoles = roles
        .filter(r => r.silo?.name === tab)
        .sort((a, b) => {
          if (a.selection_order != null && b.selection_order != null) return a.selection_order - b.selection_order;
          if (a.selection_order != null) return -1;
          if (b.selection_order != null) return 1;
          return a.title.localeCompare(b.title);
        });
      const currentInSilo = selectedRoleId && roles.find(r => r.id === selectedRoleId)?.silo?.name === tab;
      if (!currentInSilo && siloRoles.length > 0) setSelectedRoleId(siloRoles[0].id);
    }
    setRoleNavTab(tab);
    localStorage.setItem('roleNavTab', tab);
  };

  const handleSelectionOrderRoleSelect = (roleId: string) => {
    const clickedRole = roles.find(r => r.id === roleId);
    const clickedSilo = clickedRole?.silo?.name;
    if (roleNavTab !== 'all' && clickedSilo && clickedSilo !== roleNavTab) {
      const newTab = clickedSilo as RoleNavTab;
      setRoleNavTab(newTab);
      localStorage.setItem('roleNavTab', newTab);
    }
    clearFilters();
    setStatusTab('all');
    setSelectedRoleId(roleId);
    setShowAllCandidates(false);
    setShowSelectionOrder(false);
  };

  const effectiveLayout: RoleViewLayout = roleViewLayout === 'split' && windowIsLg ? 'split' : 'stacked';
  const filtersActive = !!(searchQuery || filterChips.length > 0 || ageRange.min || ageRange.max || filterCongregation !== 'all' || filterHasPhoto || filterBookmarked || filterSilos.size > 0);

  const splitGridCols: Record<SplitRatio, string> = {
    narrow:   'grid-cols-[minmax(290px,_2fr)_minmax(0,_10fr)]',
    balanced: 'grid-cols-[minmax(290px,_3fr)_minmax(0,_9fr)]',
    wide:     'grid-cols-[minmax(290px,_4fr)_minmax(0,_8fr)]',
  };


  const clearFilters = () => {
    setSearchQuery('');
    setFilterChips([]);
    setAgeRange({ min: '', max: '' });
    setFilterCongregation('all');
    setFilterHasPhoto(false);
    setFilterBookmarked(false);
    setFilterSilos(new Set());
  };

  const handleToggleBookmark = useCallback(async (candidateId: string, next: boolean) => {
    setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, is_bookmarked: next } : c));
    setSelectedCandidate(prev => prev?.id === candidateId ? { ...prev, is_bookmarked: next } : prev);
    const { error } = await supabase
      .from('candidates')
      .update({ is_bookmarked: next })
      .eq('id', candidateId);
    if (error) {
      setCandidates(prev => prev.map(c => c.id === candidateId ? { ...c, is_bookmarked: !next } : c));
      setSelectedCandidate(prev => prev?.id === candidateId ? { ...prev, is_bookmarked: !next } : prev);
      console.error('[handleToggleBookmark]', error);
      alert('Failed to update bookmark');
    }
  }, []);

  const addFilterChip = () => {
    if (!searchQuery.trim()) return;
    setFilterChips(prev => [...prev, {
      id: `${Date.now()}-${Math.random()}`,
      term: searchQuery.trim(),
      fields: { ...searchFields }
    }]);
    setSearchQuery('');
  };

  const removeFilterChip = (id: string) => {
    setFilterChips(prev => prev.filter(c => c.id !== id));
  };

  const isCandidateAssigned = (candidateId: string) => {
    return roleDecisions.some(d => d.selected_candidate_id === candidateId);
  };

  const getAssignedRoleTitle = (candidateId: string) => {
    const decision = roleDecisions.find(d => d.selected_candidate_id === candidateId);
    if (!decision) return undefined;
    const role = roles.find(r => r.id === decision.role_id);
    return role?.title;
  };

  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><p className="text-slate-600">Loading...</p></div>;

  const roleAssigneeId = selectedRoleDecision?.selected_candidate_id ?? null;
  const pinnedAssignee = roleAssigneeId
    ? (sortedCandidates.find(c => c.id === roleAssigneeId) ?? candidates.find(c => c.id === roleAssigneeId))
    : undefined;
  const sortablePool = sortedCandidates
    .filter(c => c.id !== roleAssigneeId)
    .filter(c => roleViewFilter === 'open' ? !isCandidateAssigned(c.id) : true);

  const roleViewToggle = (selectedRoleId && !showAllCandidates) ? (
    <div className="inline-flex items-center bg-slate-100 rounded-lg p-1 gap-0.5 shrink-0">
      {(['all', 'open'] as const).map(v => (
        <button
          key={v}
          onClick={() => setRoleViewFilter(v)}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${roleViewFilter === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          {v === 'all' ? 'All' : 'Open'}
        </button>
      ))}
    </div>
  ) : null;

  const renderFallThroughSection = (gridCls: string) => {
    if (!selectedRole || fallThroughAllCount === 0) return null;
    const siloLabel = selectedRole.silo?.name ? `${selectedRole.silo.name} only` : 'This Silo';
    return (
      <div className="mt-6">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="inline-flex items-center gap-1.5 bg-sound-500 text-white rounded-full px-3 py-1 shadow-sm flex-shrink-0">
              <Users className="h-4 w-4" />
              <span className="text-base font-semibold">{fallThroughCandidates.length}</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900">Unselected in Previous Roles</h2>
          </div>
          <div className="inline-flex items-center bg-slate-100 rounded-lg p-1 gap-0.5 shrink-0">
            <button
              onClick={() => setFallThroughScope('all')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${fallThroughScope === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              All
            </button>
            <button
              onClick={() => setFallThroughScope('silo')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${fallThroughScope === 'silo' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {siloLabel}
            </button>
          </div>
        </div>
        {fallThroughCandidates.length === 0 ? (
          <p className="text-sm text-slate-500">
            No unselected candidates from previous {selectedRole.silo?.name ?? 'silo'} roles.{' '}
            <button onClick={() => setFallThroughScope('all')} className="underline hover:text-slate-700 transition-colors">Show all</button>
          </p>
        ) : (
          <div className={gridCls}>
            {fallThroughCandidates.map(candidate => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                isSelected={selectedCandidate?.id === candidate.id}
                onClick={() => setSelectedCandidate(selectedCandidate?.id === candidate.id ? null : candidate)}
                onEdit={() => handleEditClick(candidate)}
                onExpand={() => setSelectedCandidate(candidate)}
                lockedBy={getEditLockDisplay(candidate.id)}
                roleDecisions={roleDecisions}
                roles={roles}
                roleMatchTotals={roleMatchTotals}
                roleRankMap={roleRankMap}
                onToggleBookmark={handleToggleBookmark}
                onPromoteToRole={() => handleAddCandidateToRole(candidate.id)}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <UserIdentity onIdentitySet={handleIdentitySet} />
      
      <div className="max-w-[1800px] mx-auto px-6 py-6">
        {(() => {
          const utilityCluster = (
            <>
              {/* Desktop progress: fraction (toggleable) + two-segment bar + % */}
              <div className="hidden sm:flex items-center gap-2 text-sm">
                <button
                  onClick={toggleProgressMetric}
                  className={`tabular-nums font-medium ${activeColorClass} cursor-pointer hover:bg-slate-100 rounded px-1.5 py-0.5 -mx-1.5 -my-0.5 transition-colors`}
                  title={`Showing ${progressMetric}. Click to switch.`}
                  aria-label={`Toggle between assigned and filled counts. Currently showing ${progressMetric}.`}
                >
                  {activeCount} / {roles.length}
                </button>
                <div className="w-24 bg-slate-200 rounded-full h-1.5 overflow-hidden flex">
                  <div
                    className="bg-forest-500 h-1.5 transition-all"
                    style={{ width: `${filledPercentage}%` }}
                  />
                  <div
                    className="bg-steel-500 h-1.5 transition-all"
                    style={{ width: `${assignedPercentage - filledPercentage}%` }}
                  />
                </div>
                <span className={`tabular-nums font-medium ${activeColorClass}`}>
                  {activePercentage}%
                </span>
              </div>
              {/* Mobile progress: just % (toggleable) */}
              <button
                onClick={toggleProgressMetric}
                className={`sm:hidden text-sm font-bold tabular-nums ${activeColorClass} cursor-pointer hover:bg-slate-100 rounded px-2 py-0.5 -mx-2 -my-0.5 transition-colors`}
                title={`Showing ${progressMetric}. Tap to switch.`}
                aria-label={`Toggle between assigned and filled counts. Currently showing ${progressMetric}.`}
              >
                {activePercentage}%
              </button>
              {/* Stats info popover */}
              <div className="relative" data-stats-popover>
                <button
                  data-stats-popover
                  onClick={() => setShowStatsPopover(o => !o)}
                  onMouseEnter={() => setShowStatsPopover(true)}
                  className="text-slate-400 hover:text-slate-600 transition-colors p-1"
                  title="Board stats"
                  aria-label="Board stats"
                >
                  <Info className="h-4 w-4" />
                </button>
                {showStatsPopover && (
                  <div
                    data-stats-popover
                    onMouseLeave={() => setShowStatsPopover(false)}
                    className="absolute right-0 mt-2 bg-white border border-slate-200 rounded-lg shadow-xl z-50 px-4 py-3 whitespace-nowrap"
                  >
                    <p className="text-sm text-slate-700">
                      <span className="font-medium">{roles.length}</span> roles · <span className="font-medium">{candidates.length}</span> candidates · <span className="font-medium text-steel-500">{assignedRolesCount}</span> assigned · <span className="font-medium text-forest-500">{totalFilled}</span> filled
                    </p>
                  </div>
                )}
              </div>
              <UserProfilePopover />
            </>
          );

          return (
        <div className="mb-6 flex flex-col gap-3 min-[768px]:flex-row min-[768px]:items-center min-[768px]:flex-wrap min-[768px]:gap-x-4 min-[768px]:gap-y-3">
          {/* TITLE — with mobile utility cluster (hidden at 768px+) */}
          <div className="flex items-center justify-between gap-3 min-[768px]:justify-start min-[768px]:shrink-0">
            <h1 className="text-2xl font-bold text-slate-900">Selection Board</h1>
            <div className="flex items-center gap-2 shrink-0 min-[768px]:hidden">
              {utilityCluster}
            </div>
          </div>

          {/* ACTION BUTTONS — grows to push utility right at 768px+; nowrap at 768px+ */}
          <div className="flex flex-wrap min-[768px]:flex-nowrap items-center gap-2 min-[768px]:flex-1">
            {/* SELECTION ORDER */}
            <button
              onClick={() => setShowSelectionOrder(true)}
              title="Roles"
              aria-label="Roles"
              className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
            >
              <ListOrdered className="h-4 w-4" /><span className="hidden min-[960px]:inline">Roles</span>
            </button>

            {/* CORE dropdown panel — trigger lives inside More menu */}
            {coreSilo && (
              <div className="relative w-0 overflow-visible -ml-2" ref={coreDropdownRef}>
                {showCoreDropdown && (
                  <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-slate-200 z-60">
                    <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between">
                      <h3 className="font-bold text-slate-900">CORE</h3>
                      <span className="inline-flex items-center gap-1 bg-white border border-slate-300 text-slate-600 rounded-full px-2 py-0.5 text-xs">
                        <Users className="h-3 w-3" />{coreFilledCount}
                      </span>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto p-2">
                      {coreRoles.map(role => {
                        const decision   = roleDecisions.find(d => d.role_id === role.id);
                        const isFilled   = decision?.status === 'filled';
                        const isAssigned = !isFilled && !!decision?.selected_candidate_id;
                        const candidate  = decision?.selected_candidate_id
                          ? candidates.find(c => c.id === decision.selected_candidate_id)
                          : undefined;
                        const isSelected = selectedRoleId === role.id;

                        return (
                          <button
                            key={role.id}
                            onClick={() => {
                              setSelectedRoleId(role.id);
                              setShowAllCandidates(false);
                              setShowCoreDropdown(false);
                            }}
                            className={`w-full text-left p-3 rounded-lg transition-all mb-2 ${
                              isSelected
                                ? 'bg-sound-100 border-2 border-sound-500'
                                : 'bg-slate-50 border border-slate-200 hover:border-slate-300 hover:shadow-sm'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-slate-900 text-sm"><FormattedRoleTitle title={role.title} /></p>
                                {(isFilled || isAssigned) && candidate && (
                                  <div className="flex items-center gap-1.5 text-sm text-slate-600 mt-1">
                                    {isFilled
                                      ? <CircleCheckBig className="h-3.5 w-3.5 text-forest-500 shrink-0" />
                                      : <Check className="h-3.5 w-3.5 text-steel-500 shrink-0" />
                                    }
                                    <span>{candidate.full_name}</span>
                                  </div>
                                )}
                              </div>
                              <div className="flex-shrink-0 self-center">
                                {isFilled ? (
                                  <span className="px-2 py-0.5 bg-forest-100 text-forest-700 text-xs font-medium rounded whitespace-nowrap">Filled</span>
                                ) : isAssigned ? (
                                  <span className="px-2 py-0.5 bg-steel-100 text-steel-700 text-xs font-medium rounded whitespace-nowrap">Assigned</span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-medium rounded whitespace-nowrap">Open</span>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button onClick={() => { setShowAllCandidates(false); setSelectedRoleId(null); clearFilters(); setStatusTab('all'); }} title="Silos" aria-label="Silos" className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${!showAllCandidates && !selectedRoleId ? 'bg-sound-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              <Cylinder className="h-4 w-4" /><span className="hidden min-[960px]:inline">Silos</span>
            </button>
            <button onClick={() => { setShowAllCandidates(true); setSelectedRoleId(null); clearFilters(); setStatusTab('all'); }} title="Cards" aria-label="Cards" className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${showAllCandidates ? 'bg-sound-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
              <Users className="h-4 w-4" /><span className="hidden min-[960px]:inline">Cards</span>
            </button>
            {/* MORE MENU */}
            <div className="relative" ref={moreMenuRef}>
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                aria-label="More actions"
                className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
              >
                <MoreHorizontal className="h-4 w-4" />
                <span className="hidden min-[960px]:inline">More</span>
              </button>

              {showMoreMenu && (
                <div className="absolute left-0 top-full mt-1 w-52 bg-white rounded-xl border border-slate-200 shadow-lg z-50 py-1">

                  {/* Core */}
                  {coreSilo && (
                    <button
                      onClick={() => { setShowMoreMenu(false); setShowCoreDropdown(true); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Network className="h-4 w-4 text-teal-500" />
                      Core
                      <ChevronDown className="h-3 w-3 ml-auto text-slate-400" />
                    </button>
                  )}

                  {/* Add Candidate */}
                  <button
                    onClick={() => { setShowMoreMenu(false); setShowAddModal(true); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <UserPlus className="h-4 w-4 text-forest-500" />
                    Add Candidate
                  </button>

                  {/* Export — admin only */}
                  {isAdmin && (
                    <button
                      onClick={() => { setShowMoreMenu(false); handleExport(); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Sheet className="h-4 w-4 text-slate-500" />
                      Export
                    </button>
                  )}

                </div>
              )}
            </div>
          </div>

          {/* UTILITY CLUSTER — visible only at 832px+; mobile version is inside the title block */}
          <div className="hidden min-[768px]:flex items-center gap-2 shrink-0">
            {utilityCluster}
          </div>
        </div>
          );
        })()}

{!selectedRoleId && !showAllCandidates && <div className="mb-6"><SiloDashboard silos={silos} roles={roles} roleDecisions={roleDecisions} candidates={candidates} roleMatchTotals={roleMatchTotals} selectedRoleId={selectedRoleId} onRoleSelect={handleSelectionOrderRoleSelect} onAddRole={handleAddRole} /></div>}
        {selectedRole && !showAllCandidates && (() => {
          const controlsStrip = (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {/* Layout toggle — anchored at strip start, icon-only */}
              <div className="inline-flex items-center bg-slate-100 rounded-lg p-1 gap-0.5">
                {(([
                  { value: 'stacked', label: 'Stacked layout', Icon: LayoutPanelTop  },
                  { value: 'split',   label: 'Split layout',   Icon: LayoutPanelLeft },
                ]) as { value: RoleViewLayout; label: string; Icon: React.ComponentType<{ className?: string }> }[]).map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    title={label}
                    aria-label={label}
                    onClick={() => handleLayoutChange(value)}
                    className={`flex items-center px-2.5 py-1.5 rounded-md transition-all ${roleViewLayout === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>

              {/* Silo tabs — bare flex items so they wrap naturally */}
              {(([
                { value: 'all', label: 'All', Icon: ListOrdered        },
                { value: 'HC1', label: 'HC1', Icon: siloIcons['HC1'] },
                { value: 'HC2', label: 'HC2', Icon: siloIcons['HC2'] },
                { value: 'HC3', label: 'HC3', Icon: siloIcons['HC3'] },
                { value: 'CCC', label: 'CCC', Icon: siloIcons['CCC'] },
                { value: 'PO',  label: 'PO',  Icon: siloIcons['PO']  },
                { value: 'RO',  label: 'RO',  Icon: siloIcons['RO']  },
              ]) as { value: RoleNavTab; label: string; Icon: React.ComponentType<{ className?: string }> }[]).map(({ value, label, Icon }) => {
                const count    = value === 'all' ? roles.length : roles.filter(r => r.silo?.name === value).length;
                const isActive = roleNavTab === value;
                return (
                  <button
                    key={value}
                    title={label}
                    aria-label={label}
                    onClick={() => handleNavTabChange(value)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    <Icon className="h-4 w-4" />
                    {effectiveLayout === 'stacked' && <span className="hidden lg:inline">{label}</span>}
                    <span className={`text-xs tabular-nums ${isActive ? 'text-slate-400' : 'text-slate-400/70'}`}>{count}</span>
                  </button>
                );
              })}

              {/* Position indicator */}
              <span className="text-sm text-slate-500 tabular-nums px-2">
                {currentNavIndex >= 0 ? `${currentNavIndex + 1} / ${orderedRoleIds.length}` : ''}
              </span>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Split-ratio toggle — split mode only, right edge */}
              {effectiveLayout === 'split' && (
                <div className="inline-flex items-center bg-slate-100 rounded-lg p-1 gap-0.5">
                  {(([
                    { value: 'narrow',   label: 'Narrow',   Icon: PanelLeftClose },
                    { value: 'balanced', label: 'Balanced', Icon: Columns2       },
                    { value: 'wide',     label: 'Wide',     Icon: PanelLeftOpen  },
                  ]) as { value: SplitRatio; label: string; Icon: React.ComponentType<{ className?: string }> }[]).map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      title={label}
                      aria-label={label}
                      onClick={() => handleSplitRatioChange(value)}
                      className={`flex items-center px-2.5 py-1.5 rounded-md transition-all ${splitRatio === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );

          const roleCard = (
            <SelectedRoleCard
              role={selectedRole}
              decision={selectedRoleDecision}
              candidates={candidates}
              silos={silos}
              onClose={() => setSelectedRoleId(null)}
              onAssignCandidate={(id) => id ? handleAssignToRole(id) : handleAssignCandidate(null)}
              onMarkFilled={handleMarkFilled}
              onUnfill={handleUnfill}
              onAddCandidateToRole={handleAddCandidateToRole}
              onUpdateRole={handleUpdateRole}
              onPrev={() => { if (prevRoleId) setSelectedRoleId(prevRoleId); }}
              onNext={() => { if (nextRoleId) setSelectedRoleId(nextRoleId); }}
              hasPrev={!!prevRoleId}
              hasNext={!!nextRoleId}
              prevRoleTitle={prevRole?.title}
              nextRoleTitle={nextRole?.title}
              onAdminModalOpenChange={setRoleAdminModalOpen}
            />
          );

          if (effectiveLayout === 'split') {
            return (
              <div className={`grid gap-4 mb-6 ${splitGridCols[splitRatio]}`}>
                <div className="self-start sticky top-4">
                  {controlsStrip}
                  {roleCard}
                </div>
                <div>
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="inline-flex items-center gap-1.5 bg-sound-500 text-white rounded-full px-3 py-1 shadow-sm flex-shrink-0">
                        <Users className="h-4 w-4" />
                        <span className="text-base font-semibold">{(pinnedAssignee ? 1 : 0) + sortablePool.length}</span>
                      </div>
                      <h2 className="text-lg font-bold text-slate-900"><FormattedRoleTitle title={selectedRole.title} /></h2>
                    </div>
                    {roleViewToggle}
                  </div>
                  {sortedCandidates.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
                      {filtersActive ? (
                        <>
                          <p className="text-slate-700 font-medium">No candidates match the current filters</p>
                          <p className="text-slate-500 text-sm mt-1">There may be more candidates available — try clearing filters.</p>
                          <button onClick={clearFilters} className="mt-4 px-4 py-2 bg-sound-500 text-white rounded-lg font-medium text-sm hover:bg-sound-600 transition-colors">Clear all filters</button>
                        </>
                      ) : (
                        <p className="text-slate-600">No candidates matched to this role yet</p>
                      )}
                    </div>
                  ) : !pinnedAssignee && sortablePool.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
                      <p className="text-slate-600">All recommended candidates are assigned.</p>
                    </div>
                  ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} onDragStart={handleDragStart} onDragCancel={handleDragCancel}>
                      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                        {pinnedAssignee && (
                          <div className="h-full">
                            <CandidateCard
                              candidate={pinnedAssignee}
                              isSelected={selectedCandidate?.id === pinnedAssignee.id}
                              onClick={() => setSelectedCandidate(selectedCandidate?.id === pinnedAssignee.id ? null : pinnedAssignee)}
                              onEdit={() => handleEditClick(pinnedAssignee)}
                              onExpand={() => setSelectedCandidate(pinnedAssignee)}
                              isAssigned={isCandidateAssigned(pinnedAssignee.id)}
                              assignedRoleTitle={getAssignedRoleTitle(pinnedAssignee.id)}
                              lockedBy={getEditLockDisplay(pinnedAssignee.id)}
                              onRemoveFromRole={() => handleRemoveCandidateFromRole(pinnedAssignee.id)}
                              isCurrentRoleAssignee={true}
                              isAssignedToFilledRole={selectedRoleDecision?.status === 'filled' && pinnedAssignee.id === selectedRoleDecision?.selected_candidate_id}
                              roleDecisions={roleDecisions}
                              roles={roles}
                              roleMatchTotals={roleMatchTotals}
                              roleRankMap={roleRankMap}
                              onToggleBookmark={handleToggleBookmark}
                            />
                          </div>
                        )}
                        <SortableContext items={sortablePool.map(c => c.id)} strategy={rectSortingStrategy}>
                          {sortablePool.map(candidate => (
                            <SortableCandidateCard
                              key={candidate.id}
                              candidate={candidate}
                              isSelected={selectedCandidate?.id === candidate.id}
                              onClick={() => setSelectedCandidate(selectedCandidate?.id === candidate.id ? null : candidate)}
                              onEdit={() => handleEditClick(candidate)}
                              onExpand={() => setSelectedCandidate(candidate)}
                              isAssigned={isCandidateAssigned(candidate.id)}
                              assignedRoleTitle={getAssignedRoleTitle(candidate.id)}
                              lockedBy={getEditLockDisplay(candidate.id)}
                              dragLockedBy={(() => { const l = dragLocks.get(candidate.id); return l && l.userId !== userId ? l.name : undefined; })()}
                              onRemoveFromRole={() => handleRemoveCandidateFromRole(candidate.id)}
                              onMoveToTop={() => handleMoveToTop(candidate.id)}
                              onAssign={selectedRoleDecision?.status !== 'filled' ? () => handleAssignToRole(candidate.id) : undefined}
                              isAssignedToFilledRole={
                                selectedRoleDecision?.status === 'filled' &&
                                candidate.id === selectedRoleDecision?.selected_candidate_id
                              }
                              roleDecisions={roleDecisions}
                              roles={roles}
                              roleMatchTotals={roleMatchTotals}
                              roleRankMap={roleRankMap}
                              onToggleBookmark={handleToggleBookmark}
                            />
                          ))}
                        </SortableContext>
                      </div>
                    </DndContext>
                  )}
                  {renderFallThroughSection('grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4')}
                </div>
              </div>
            );
          }

          return (
            <>
              {controlsStrip}
              <div className="mb-6">{roleCard}</div>
            </>
          );
        })()}

        {showAllCandidates && (
          <div className="mb-6 bg-white rounded-xl border border-slate-200 p-4">
            {/* Status filter tabs — View All only */}
            {showAllCandidates && (
              <div className="overflow-x-auto mb-4">
                <div className="inline-flex items-center bg-slate-100 rounded-lg p-1 gap-0.5">
                  {(([
                    { key: 'all',         label: 'All',           count: statusTabCounts.all,         Icon: Users,          fixedIconClass: '' },
                    { key: 'available',   label: 'Available',     count: statusTabCounts.available,   Icon: UserSearch,     fixedIconClass: '' },
                    { key: 'recommended', label: 'Recommended',   count: statusTabCounts.recommended, Icon: UserPen,        fixedIconClass: '' },
                    { key: 'assigned',    label: 'Assigned',      count: statusTabCounts.assigned,    Icon: Check,          fixedIconClass: 'text-steel-500' },
                    { key: 'filled',      label: 'Filled',        count: statusTabCounts.filled,      Icon: CircleCheckBig, fixedIconClass: 'text-forest-500' },
                  ]) as { key: StatusTab; label: string; count: number; Icon: React.ComponentType<{ className?: string }>; fixedIconClass: string }[]).map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setStatusTab(tab.key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                        statusTab === tab.key
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      <tab.Icon className={`h-4 w-4 ${tab.fixedIconClass || (statusTab === tab.key ? 'text-slate-900' : 'text-slate-500')}`} />
                      <span className="hidden sm:inline">{tab.label}</span>
                      <span className={`text-xs tabular-nums ${statusTab === tab.key ? 'text-slate-400' : 'text-slate-400/70'}`}>
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Unified Search Bar */}
            <div className="mb-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Type a search term and press Enter to add a filter..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addFilterChip(); }}
                    className="w-full pl-10 pr-10 py-3 border border-slate-300 rounded-lg text-base sm:text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sound-500"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <button
                  onClick={addFilterChip}
                  disabled={!searchQuery.trim()}
                  className="px-4 py-2 bg-sound-500 text-white rounded-lg text-sm font-medium hover:bg-sound-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Add Filter
                </button>
              </div>

              {/* Active filter chips */}
              {filterChips.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {filterChips.map(chip => {
                    const allFields = Object.values(chip.fields).every(Boolean);
                    const fieldLabels: Record<keyof SearchFields, string> = {
                      name: 'Name', congregation: 'Congregation',
                      currentResponsibilities: 'Current Resp.', circuitResponsibilities: 'Circuit Resp.',
                      regionalExperience: 'Regional Exp.', comments: 'Comments', coComments: 'CO Comments'
                    };
                    const activeFieldNames = (Object.keys(chip.fields) as (keyof SearchFields)[])
                      .filter(k => chip.fields[k])
                      .map(k => fieldLabels[k]);
                    return (
                      <span key={chip.id} className="inline-flex items-center gap-1.5 px-3 py-1 bg-sound-100 text-sound-800 rounded-full text-sm font-medium">
                        <span>&quot;{chip.term}&quot;</span>
                        {!allFields && (
                          <span className="text-sound-400 text-xs">in {activeFieldNames.join(', ')}</span>
                        )}
                        <button onClick={() => removeFilterChip(chip.id)} className="ml-0.5 text-sound-400 hover:text-sound-600">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Field Toggles */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-700 mb-2">Search in fields:</label>
              <div className="flex flex-wrap gap-3">
                <label className="inline-flex items-center">
                  <input
                    type="checkbox"
                    checked={searchFields.name}
                    onChange={(e) => setSearchFields({ ...searchFields, name: e.target.checked })}
                    className="w-4 h-4 text-sound-500 border-slate-300 rounded focus:ring-sound-500"
                  />
                  <span className="ml-2 text-sm text-slate-700">Name</span>
                </label>
                <label className="inline-flex items-center">
                  <input
                    type="checkbox"
                    checked={searchFields.congregation}
                    onChange={(e) => setSearchFields({ ...searchFields, congregation: e.target.checked })}
                    className="w-4 h-4 text-sound-500 border-slate-300 rounded focus:ring-sound-500"
                  />
                  <span className="ml-2 text-sm text-slate-700">Congregation</span>
                </label>
                <label className="inline-flex items-center">
                  <input
                    type="checkbox"
                    checked={searchFields.currentResponsibilities}
                    onChange={(e) => setSearchFields({ ...searchFields, currentResponsibilities: e.target.checked })}
                    className="w-4 h-4 text-sound-500 border-slate-300 rounded focus:ring-sound-500"
                  />
                  <span className="ml-2 text-sm text-slate-700">Current Responsibilities</span>
                </label>
                <label className="inline-flex items-center">
                  <input
                    type="checkbox"
                    checked={searchFields.circuitResponsibilities}
                    onChange={(e) => setSearchFields({ ...searchFields, circuitResponsibilities: e.target.checked })}
                    className="w-4 h-4 text-sound-500 border-slate-300 rounded focus:ring-sound-500"
                  />
                  <span className="ml-2 text-sm text-slate-700">Circuit Responsibilities</span>
                </label>
                <label className="inline-flex items-center">
                  <input
                    type="checkbox"
                    checked={searchFields.regionalExperience}
                    onChange={(e) => setSearchFields({ ...searchFields, regionalExperience: e.target.checked })}
                    className="w-4 h-4 text-sound-500 border-slate-300 rounded focus:ring-sound-500"
                  />
                  <span className="ml-2 text-sm text-slate-700">Regional Experience</span>
                </label>
                <label className="inline-flex items-center">
                  <input
                    type="checkbox"
                    checked={searchFields.comments}
                    onChange={(e) => setSearchFields({ ...searchFields, comments: e.target.checked })}
                    className="w-4 h-4 text-sound-500 border-slate-300 rounded focus:ring-sound-500"
                  />
                  <span className="ml-2 text-sm text-slate-700">Comments</span>
                </label>
                <label className="inline-flex items-center">
                  <input
                    type="checkbox"
                    checked={searchFields.coComments}
                    onChange={(e) => setSearchFields({ ...searchFields, coComments: e.target.checked })}
                    className="w-4 h-4 text-sound-500 border-slate-300 rounded focus:ring-sound-500"
                  />
                  <span className="ml-2 text-sm text-slate-700">CO Comments</span>
                </label>
              </div>
            </div>

            {/* Age Range Filter + Has Photo toggle */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-700 mb-2">Age range:</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  placeholder="Min"
                  value={ageRange.min}
                  onChange={(e) => setAgeRange({ ...ageRange, min: e.target.value })}
                  className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sound-500"
                />
                <span className="text-slate-500">to</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={ageRange.max}
                  onChange={(e) => setAgeRange({ ...ageRange, max: e.target.value })}
                  className="w-24 px-3 py-2 border border-slate-300 rounded-lg text-base sm:text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sound-500"
                />
                {(ageRange.min || ageRange.max) && (
                  <button
                    onClick={() => setAgeRange({ min: '', max: '' })}
                    className="text-xs text-slate-500 hover:text-slate-700 underline"
                  >
                    Clear
                  </button>
                )}
                <div className="relative ml-1">
                  <button
                    onClick={() => setFilterHasPhoto(v => !v)}
                    onMouseEnter={() => setPhotoTooltipVisible(true)}
                    onMouseLeave={() => setPhotoTooltipVisible(false)}
                    className={`px-3 py-2 rounded-lg border transition-colors ${
                      filterHasPhoto
                        ? 'bg-sound-500 border-sound-500 text-white'
                        : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'
                    }`}
                  >
                    <CircleUser className="h-4 w-4" />
                  </button>
                  {photoTooltipVisible && (
                    <div className="absolute left-1/2 -translate-x-1/2 top-10 z-50 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-xs text-white shadow-lg">
                      Has photo
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setFilterBookmarked(v => !v)}
                  title="Bookmarked"
                  className={`px-3 py-2 rounded-lg border transition-colors ${
                    filterBookmarked
                      ? 'bg-salmon-500 border-salmon-500 text-white'
                      : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'
                  }`}
                >
                  {filterBookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Silo filter */}
            {(() => {
              const FILTER_SILO_ORDER = ['CORE', 'HC1', 'HC2', 'HC3', 'CCC', 'PO', 'RO'];
              const siloMap = new Map(silos.map(s => [s.name, s]));
              const filterSiloList = FILTER_SILO_ORDER.map(name => siloMap.get(name)).filter((s): s is NonNullable<typeof s> => s != null && siloColors[s.name] != null);
              if (filterSiloList.length === 0) return null;
              return (
                <div className="mb-4">
                  <label className="block text-xs font-medium text-slate-700 mb-2">Silos:</label>
                  <div className="flex flex-wrap gap-2">
                    {filterSiloList.map(silo => {
                      const active = filterSilos.has(silo.name);
                      const bgBorder = siloColors[silo.name];
                      const textCls = (siloBadgeColors[silo.name] ?? '').split(' ').find(c => c.startsWith('text-')) ?? 'text-slate-600';
                      const activeCls = siloActivePillColors[silo.name] ?? `${bgBorder} ${textCls}`;
                      const SiloIcon = siloIcons[silo.name];
                      return (
                        <button
                          key={silo.id}
                          onClick={() => setFilterSilos(prev => {
                            const next = new Set(prev);
                            next.has(silo.name) ? next.delete(silo.name) : next.add(silo.name);
                            return next;
                          })}
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium transition-colors ${active ? activeCls : `bg-white border-slate-200 text-slate-500 hover:border-slate-400`}`}
                        >
                          {SiloIcon && <SiloIcon className="h-3 w-3" />}
                          {silo.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {(searchQuery || filterChips.length > 0 || ageRange.min || ageRange.max || filterCongregation !== 'all' || filterHasPhoto || filterBookmarked || filterSilos.size > 0) && (
              <div className="mt-3 flex items-center justify-between">
                <p className="text-sm text-slate-600">Showing {sortedCandidates.length} of {candidates.length} candidates</p>
                <button onClick={clearFilters} className="text-sm text-sound-500 hover:text-sound-600 font-medium">Clear all filters</button>
              </div>
            )}
          </div>
        )}

        {(showAllCandidates || (selectedRoleId && !showAllCandidates && effectiveLayout === 'stacked')) && (
          <div>
            {showAllCandidates ? (() => {
              const vtc = ({
                all:         { Icon: Users,       title: 'All Candidates' },
                available:   { Icon: UserSearch,  title: 'Available Candidates' },
                recommended: { Icon: UserPen,     title: 'Recommended Candidates' },
                assigned:    { Icon: UserCheck,   title: 'Assigned Candidates' },
                filled:      { Icon: UserLock,    title: 'Filled Candidates (Confirmed)' },
              } as Record<StatusTab, { Icon: React.ComponentType<{ className?: string }>; title: string }>)[statusTab];
              return (
                <div className="flex items-start gap-3 mb-4">
                  <div className="inline-flex items-center gap-1.5 bg-sound-500 text-white rounded-full px-3 py-1 shadow-sm flex-shrink-0">
                    <vtc.Icon className="h-4 w-4" />
                    <span className="text-base font-semibold">{sortedCandidates.length}</span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900"><FormattedRoleTitle title={vtc.title} /></h2>
                </div>
              );
            })() : (
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="inline-flex items-center gap-1.5 bg-sound-500 text-white rounded-full px-3 py-1 shadow-sm flex-shrink-0">
                    <Users className="h-4 w-4" />
                    <span className="text-base font-bold">{(pinnedAssignee ? 1 : 0) + sortablePool.length}</span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900"><FormattedRoleTitle title={selectedRole!.title} /></h2>
                </div>
                {roleViewToggle}
              </div>
            )}
            {sortedCandidates.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
                {filtersActive ? (
                  <>
                    <p className="text-slate-700 font-medium">No candidates match the current filters</p>
                    <p className="text-slate-500 text-sm mt-1">There may be more candidates available — try clearing filters.</p>
                    <button onClick={clearFilters} className="mt-4 px-4 py-2 bg-sound-500 text-white rounded-lg font-medium text-sm hover:bg-sound-600 transition-colors">Clear all filters</button>
                  </>
                ) : (
                  <p className="text-slate-600">{showAllCandidates ? 'No candidates.' : 'No candidates matched to this role yet'}</p>
                )}
              </div>
            ) : selectedRoleId && !showAllCandidates ? (
              <>
              {!pinnedAssignee && sortablePool.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
                  <p className="text-slate-600">All recommended candidates are assigned.</p>
                </div>
              ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} onDragStart={handleDragStart} onDragCancel={handleDragCancel}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {pinnedAssignee && (
                    <div className="h-full">
                      <CandidateCard
                        candidate={pinnedAssignee}
                        isSelected={selectedCandidate?.id === pinnedAssignee.id}
                        onClick={() => setSelectedCandidate(selectedCandidate?.id === pinnedAssignee.id ? null : pinnedAssignee)}
                        onEdit={() => handleEditClick(pinnedAssignee)}
                        onExpand={() => setSelectedCandidate(pinnedAssignee)}
                        isAssigned={isCandidateAssigned(pinnedAssignee.id)}
                        assignedRoleTitle={getAssignedRoleTitle(pinnedAssignee.id)}
                        lockedBy={getEditLockDisplay(pinnedAssignee.id)}
                        onRemoveFromRole={() => handleRemoveCandidateFromRole(pinnedAssignee.id)}
                        isAssignedToFilledRole={selectedRoleDecision?.status === 'filled' && pinnedAssignee.id === selectedRoleDecision?.selected_candidate_id}
                        roleDecisions={roleDecisions}
                        roles={roles}
                        roleMatchTotals={roleMatchTotals}
                        roleRankMap={roleRankMap}
                        onToggleBookmark={handleToggleBookmark}
                      />
                    </div>
                  )}
                  <SortableContext items={sortablePool.map(c => c.id)} strategy={rectSortingStrategy}>
                    {sortablePool.map(candidate => (
                      <SortableCandidateCard
                        key={candidate.id}
                        candidate={candidate}
                        isSelected={selectedCandidate?.id === candidate.id}
                        onClick={() => setSelectedCandidate(selectedCandidate?.id === candidate.id ? null : candidate)}
                        onEdit={() => handleEditClick(candidate)}
                        onExpand={() => setSelectedCandidate(candidate)}
                        isAssigned={isCandidateAssigned(candidate.id)}
                        assignedRoleTitle={getAssignedRoleTitle(candidate.id)}
                        lockedBy={getEditLockDisplay(candidate.id)}
                        dragLockedBy={(() => { const l = dragLocks.get(candidate.id); return l && l.userId !== userId ? l.name : undefined; })()}
                        onRemoveFromRole={() => handleRemoveCandidateFromRole(candidate.id)}
                        onMoveToTop={() => handleMoveToTop(candidate.id)}
                        onAssign={selectedRoleDecision?.status !== 'filled' ? () => handleAssignToRole(candidate.id) : undefined}
                        isAssignedToFilledRole={
                          selectedRoleDecision?.status === 'filled' &&
                          candidate.id === selectedRoleDecision?.selected_candidate_id
                        }
                        roleDecisions={roleDecisions}
                        roles={roles}
                        roleMatchTotals={roleMatchTotals}
                        roleRankMap={roleRankMap}
                        onToggleBookmark={handleToggleBookmark}
                      />
                    ))}
                  </SortableContext>
                </div>
              </DndContext>
              )}
              </>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {sortedCandidates.map(candidate => (
                  <CandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    isSelected={selectedCandidate?.id === candidate.id}
                    onClick={() => setSelectedCandidate(selectedCandidate?.id === candidate.id ? null : candidate)}
                    onEdit={() => handleEditClick(candidate)}
                    onExpand={() => setSelectedCandidate(candidate)}
                    isAssigned={isCandidateAssigned(candidate.id)}
                    assignedRoleTitle={getAssignedRoleTitle(candidate.id)}
                    lockedBy={getEditLockDisplay(candidate.id)}
                    roleDecisions={roleDecisions}
                    roles={roles}
                    roleMatchTotals={roleMatchTotals}
                    roleRankMap={roleRankMap}
                    onToggleBookmark={handleToggleBookmark}
                  />
                ))}
              </div>
            )}
            {selectedRoleId && !showAllCandidates && renderFallThroughSection('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4')}
          </div>
        )}

        {!selectedRoleId && !showAllCandidates && <div className="text-center py-12 bg-white rounded-xl border border-slate-200"><p className="text-slate-600 text-lg mb-2">Select a role from a silo above</p><p className="text-slate-400 text-sm">Click on any silo to see its roles</p></div>}

        {selectedCandidate && (() => {
          const matchedFiltered = rolesFilter === 'open'
            ? matchedRolesData.filter(m => m.isRoleOpen)
            : matchedRolesData;
          const rowsPerCol = Math.ceil(matchedFiltered.length / 2);
          return (
            <div
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-0 sm:p-4"
              style={{ paddingTop: 'env(safe-area-inset-top)' }}
              onClick={(e) => { if (e.target === e.currentTarget) setSelectedCandidate(null); }}
            >
              <div className="bg-white shadow-2xl max-w-4xl w-full max-h-[100vh] sm:max-h-[90vh] overflow-hidden flex flex-col rounded-none sm:rounded-xl">

                {/* Header */}
                <div className="p-3 sm:p-6 border-b border-slate-200 flex-shrink-0">
                  <div className="flex gap-4">
                    {selectedCandidate.photo_url && (
                      <img
                        src={selectedCandidate.photo_url}
                        alt={selectedCandidate.full_name}
                        className="w-24 h-[116px] rounded-lg object-cover shrink-0 border border-slate-200"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-slate-900 text-xl">{selectedCandidate.full_name}</h3>
                        <div className="flex items-center gap-2 shrink-0">
                          {(() => {
                            const candidateDecisions = roleDecisions.filter(d => d.selected_candidate_id === selectedCandidate.id);
                            const filledDecision     = candidateDecisions.find(d => d.status === 'filled');
                            const inProgressDecision = candidateDecisions.find(d => d.status === 'in_progress');
                            const bestDecision = filledDecision ?? inProgressDecision ?? null;
                            const bestRole = bestDecision
                              ? roles.find(r => r.id === bestDecision.role_id)
                              : null;
                            const primaryRoleTitle = bestRole?.title;
                            return (
                              <button
                                onClick={async () => {
                                  const vcf = await generateVCard(selectedCandidate, primaryRoleTitle);
                                  const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8' });
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = `${selectedCandidate.full_name.replace(/\s+/g, '_')}.vcf`;
                                  a.click();
                                  URL.revokeObjectURL(url);
                                }}
                                className="text-slate-400 hover:text-sound-500 p-1 transition-colors"
                                title="Export vCard"
                              >
                                <Contact className="h-4 w-4" />
                              </button>
                            );
                          })()}
                          <button onClick={() => handleEditClick(selectedCandidate)} className="text-sound-500 hover:text-sound-600 p-1" title="Edit candidate">
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleToggleBookmark(selectedCandidate.id, !selectedCandidate.is_bookmarked)}
                            className={`p-1 transition-colors ${selectedCandidate.is_bookmarked ? 'text-salmon-500' : 'text-slate-400 hover:text-salmon-500'}`}
                            title={selectedCandidate.is_bookmarked ? 'Remove bookmark' : 'Bookmark'}
                          >
                            {selectedCandidate.is_bookmarked
                              ? <BookmarkCheck className="h-4 w-4 fill-current" />
                              : <Bookmark className="h-4 w-4" />
                            }
                          </button>
                          <button onClick={() => setSelectedCandidate(null)} className="text-slate-400 hover:text-slate-600 p-1">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      {selectedCandidate.congregation && <p className="text-sm text-slate-600 mt-1">{selectedCandidate.congregation}</p>}
                      {selectedCandidate.age && <p className="text-sm text-slate-600"><span className="font-medium">Age:</span> {selectedCandidate.age}</p>}
                      {selectedCandidate.location && <p className="text-sm text-slate-600"><span className="font-medium">Location:</span> {selectedCandidate.location}</p>}
                      {(selectedCandidate.cell_phone || selectedCandidate.personal_email || selectedCandidate.jwpub_email || selectedCandidate.bethel_email) && (
                        <>
                          {selectedCandidate.cell_phone     && <p className="text-sm text-slate-600"><span className="font-medium">Cell:</span> {selectedCandidate.cell_phone}</p>}
                          {selectedCandidate.personal_email && <p className="text-sm text-slate-600"><span className="font-medium">Personal:</span> {selectedCandidate.personal_email}</p>}
                          {selectedCandidate.jwpub_email    && <p className="text-sm text-slate-600"><span className="font-medium">JWPUB:</span> {selectedCandidate.jwpub_email}</p>}
                          {selectedCandidate.bethel_email   && <p className="text-sm text-slate-600"><span className="font-medium">Bethel:</span> {selectedCandidate.bethel_email}</p>}
                        </>
                      )}
                    </div>
                  </div>
                  {selectedRoleId && !showAllCandidates && selectedCandidate.id !== selectedRoleDecision?.selected_candidate_id && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedRoleDecision?.status !== 'filled' && (
                        <button
                          onClick={() => handleAssignToRole(selectedCandidate.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sound-500 text-white text-sm font-medium hover:bg-sound-600 transition-colors"
                        >
                          <UserCheck className="h-4 w-4" />
                          Assign to role
                        </button>
                      )}
                      <button
                        onClick={() => handleMoveToTop(selectedCandidate.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
                      >
                        <ChevronsUp className="h-4 w-4" />
                        Move to top
                      </button>
                    </div>
                  )}
                  {roleDecisions.filter(d => d.selected_candidate_id === selectedCandidate.id).length > 0 && (
                    <div className="mt-3 space-y-0.5">
                      {roleDecisions
                        .filter(d => d.selected_candidate_id === selectedCandidate.id)
                        .map(decision => {
                          const role = roles.find(r => r.id === decision.role_id);
                          if (!role) return null;
                          const Icon = decision.status === 'filled' ? CircleCheckBig : Check;
                          const iconColor = decision.status === 'filled' ? 'text-forest-500' : 'text-steel-500';
                          return (
                            <div key={decision.id} className={`flex items-center gap-1 text-sm ${iconColor}`}>
                              <Icon className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{role.title}</span>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto p-3 sm:p-6">
                  {selectedCandidate.current_responsibilities && <p className="text-sm text-slate-600 mb-2"><span className="font-medium">Current:</span> {selectedCandidate.current_responsibilities}</p>}
                  {selectedCandidate.circuit_responsibilities && <p className="text-sm text-slate-600 mb-2"><span className="font-medium">Circuit:</span> {selectedCandidate.circuit_responsibilities}</p>}
                  {selectedCandidate.experience && <p className="text-sm text-slate-600 mb-2"><span className="font-medium">Regional Experience:</span> {selectedCandidate.experience}</p>}
                  {selectedCandidate.comments && <p className="text-sm text-slate-600 mb-2"><span className="font-medium">Comments:</span> {selectedCandidate.comments}</p>}
                  {selectedCandidate.co_comments && <p className="text-sm text-slate-600 mb-4 pb-4 border-b border-slate-200"><span className="font-medium">CO Comments:</span> <span className="italic">&ldquo;{selectedCandidate.co_comments}&rdquo;</span></p>}

                  {matchedRolesData.length > 0 && (
                    <>
                      <div className="flex items-center justify-between mb-3 pt-4 border-t border-slate-200">
                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          Matched Roles ({matchedFiltered.length})
                        </h4>
                        <div className="inline-flex items-center bg-slate-100 rounded-md p-0.5 gap-0.5 text-xs">
                          <button
                            onClick={() => setRolesFilter('all')}
                            className={`px-2 py-0.5 rounded ${rolesFilter === 'all' ? 'bg-white text-slate-900 shadow-sm font-medium' : 'text-slate-500 hover:text-slate-700'}`}
                          >
                            All
                          </button>
                          <button
                            onClick={() => setRolesFilter('open')}
                            className={`px-2 py-0.5 rounded ${rolesFilter === 'open' ? 'bg-white text-slate-900 shadow-sm font-medium' : 'text-slate-500 hover:text-slate-700'}`}
                          >
                            Open
                          </button>
                        </div>
                      </div>
                      <div
                        className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:grid-flow-col gap-x-4 gap-y-0.5"
                        style={{ gridTemplateRows: `repeat(${rowsPerCol}, auto)` }}
                      >
                        {matchedFiltered.map(m => {
                          const SiloIcon = siloIcons[m.siloName];
                          const siloIconColor = siloBadgeColors[m.siloName] ?? 'text-slate-500';
                          return (
                            <button
                              key={m.role.id}
                              onClick={() => {
                                clearFilters();
                                setSelectedRoleId(m.role.id);
                                setShowAllCandidates(false);
                                setSelectedCandidate(null);
                              }}
                              className="flex items-start gap-1.5 px-2 py-1 rounded hover:bg-slate-50 text-left w-full"
                            >
                              <div className="flex-shrink-0 w-5 h-5 mt-0.5 bg-white rounded border border-slate-300 flex items-center justify-center">
                                <span className="text-[9px] font-bold text-slate-700 tabular-nums">
                                  {m.role.selection_order ?? '—'}
                                </span>
                              </div>
                              {SiloIcon && (
                                <span title={m.siloName} className="contents">
                                  <SiloIcon
                                    className={`h-4 w-4 mt-0.5 shrink-0 ${siloIconColor}`}
                                    aria-label={m.siloName}
                                  />
                                </span>
                              )}
                              {m.isCandidateAssigned && (
                                <div className="mt-0.5 shrink-0">
                                  {m.isFilled
                                    ? <CircleCheckBig className="h-3.5 w-3.5 text-forest-500" />
                                    : <Check className="h-3.5 w-3.5 text-steel-500" />
                                  }
                                </div>
                              )}
                              <span className="text-sm text-slate-900 font-medium flex-1 min-w-0 line-clamp-2 leading-tight">
                                <FormattedRoleTitle title={m.role.title} />
                              </span>
                              <span className="text-xs text-slate-400 tabular-nums shrink-0 mt-0.5">
                                {m.rank} / {m.total}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

              </div>
            </div>
          );
        })()}

        {showAddModal && <AddCandidateModal roles={roles} onClose={() => setShowAddModal(false)} onSave={handleAddCandidate} />}
        {showEditModal && selectedCandidate && <EditCandidateModal candidate={selectedCandidate} roles={roles} silos={silos} roleDecisions={roleDecisions} onClose={handleCloseEditModal} onSave={handleEditCandidate} onDelete={handleDeleteCandidate} />}
        {showSelectionOrder && (
          <SelectionOrderView
            roles={roles}
            roleDecisions={roleDecisions}
            candidates={candidates}
            roleMatchTotals={roleMatchTotals}
            onClose={() => setShowSelectionOrder(false)}
            onSelectRole={handleSelectionOrderRoleSelect}
          />
        )}
      </div>
    </div>
  );
}
