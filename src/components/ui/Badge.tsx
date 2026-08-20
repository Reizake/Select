// src/components/ui/Badge.tsx
'use client';

interface StatusBadgeProps {
  status: 'discuss' | 'shortlist' | 'hold' | 'pass';
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const styles = {
    discuss: 'bg-blue-100 text-blue-700',
    shortlist: 'bg-green-100 text-green-700',
    hold: 'bg-yellow-100 text-yellow-700',
    pass: 'bg-slate-100 text-slate-700',
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${styles[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

interface TagBadgeProps {
  children: React.ReactNode;
}

export function TagBadge({ children }: TagBadgeProps) {
  return (
    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-xs font-medium rounded">
      {children}
    </span>
  );
}

interface RecommendationBadgeProps {
  isPrimary?: boolean;
}

export function RecommendationBadge({ isPrimary }: RecommendationBadgeProps) {
  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded ${
      isPrimary ? 'bg-sound-100 text-sound-600' : 'bg-slate-100 text-slate-600'
    }`}>
      {isPrimary ? 'Primary' : 'Secondary'}
    </span>
  );
}
