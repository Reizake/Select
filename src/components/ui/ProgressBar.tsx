// src/components/ui/ProgressBar.tsx
'use client';

import { cn } from '@/lib/utils/cn';

interface ProgressBarProps {
  value: number;
  max?: number;
  className?: string;
  barClassName?: string;
}

export function ProgressBar({ value, max = 100, className, barClassName }: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={cn('h-2 w-full bg-slate-200 rounded-full overflow-hidden', className)}>
      <div
        className={cn('h-full bg-sound-500 rounded-full transition-all duration-500', barClassName)}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}
