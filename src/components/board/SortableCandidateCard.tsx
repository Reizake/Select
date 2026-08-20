'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CandidateCard } from './CandidateCard';
import type { Candidate, Role, RoleDecision } from '@/types';

interface SortableCandidateCardProps {
  candidate: Candidate;
  isSelected: boolean;
  onClick: () => void;
  onEdit: () => void;
  onExpand: () => void;
  isAssigned?: boolean;
  assignedRoleTitle?: string;
  lockedBy?: string;
  dragLockedBy?: string;
  onToggleBookmark?: (candidateId: string, next: boolean) => void;
  onRemoveFromRole?: () => void;
  isAssignedToFilledRole?: boolean;
  roleDecisions?: RoleDecision[];
  roles?: Role[];
  roleMatchTotals?: Record<string, number>;
  roleRankMap?: Map<string, Map<string, { rank: number; total: number }>>;
  onAssign?: () => void;
  onMoveToTop?: () => void;
}

export function SortableCandidateCard(props: SortableCandidateCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.candidate.id, disabled: !!props.dragLockedBy });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
    zIndex: isDragging ? 999 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="h-full">
      <CandidateCard {...props} />
    </div>
  );
}
