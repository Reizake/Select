// src/components/board/FormattedRoleTitle.tsx

interface FormattedRoleTitleProps {
  title: string;
}

export function FormattedRoleTitle({ title }: FormattedRoleTitleProps) {
  const dashIdx  = title.indexOf(' - ');
  const parenIdx = title.indexOf('(');

  let splitIdx = -1;
  if (dashIdx !== -1 && parenIdx !== -1) splitIdx = Math.min(dashIdx, parenIdx);
  else if (dashIdx  !== -1) splitIdx = dashIdx;
  else if (parenIdx !== -1) splitIdx = parenIdx;

  if (splitIdx === -1) return <>{title}</>;

  return (
    <>
      {title.slice(0, splitIdx)}
      <span className="text-slate-500 font-normal text-[0.85em]">{title.slice(splitIdx)}</span>
    </>
  );
}
