// src/types/index.ts
// COMPLETE FILE - Replace entire file with this

export interface Silo {
  id: string;
  name: string;
  description?: string;
  display_order?: number;
}

export interface Role {
  id: string;
  silo_id: string;
  title: string;
  description?: string;
  qualities?: string;
  selection_order?: number;
  proximity_score?: number;
  silo?: Silo;
  created_at?: string;
  updated_at?: string;
}

export interface CandidateRoleMatch {
  id: string;
  candidate_id: string;
  role_id: string;
  is_primary_recommendation?: boolean;
  sort_order?: number;
  sort_key?: string | null;
  created_at?: string;
}

export interface RoleDecision {
  id: string;
  role_id: string;
  selected_candidate_id?: string;
  status: 'open' | 'in_progress' | 'filled';
  created_at?: string;
  updated_at?: string;
}

export interface Candidate {
  id: string;
  full_name: string;
  age?: number;
  congregation?: string;
  location?: string;
  current_responsibilities?: string;
  circuit_responsibilities?: string;
  experience?: string;
  comments?: string;
  co_comments?: string;
  personal_email?: string | null;
  jwpub_email?: string | null;
  bethel_email?: string | null;
  cell_phone?: string | null;
  is_bookmarked: boolean;
  photo_url?: string;
  roles?: CandidateRoleMatch[];
  created_at?: string;
  updated_at?: string;
}
