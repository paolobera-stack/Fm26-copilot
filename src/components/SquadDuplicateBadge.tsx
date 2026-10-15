import React from 'react';
import { AlertTriangle, Copy } from 'lucide-react';

interface SquadDuplicateBadgeProps {
  otherSquadNames?: string[];
  totalCopies?: number;
  onClick?: (e: React.MouseEvent) => void;
  compact?: boolean;
}

export const SquadDuplicateBadge: React.FC<SquadDuplicateBadgeProps> = ({
  otherSquadNames,
  totalCopies,
  onClick,
  compact = false,
}) => {
  if (!otherSquadNames || otherSquadNames.length === 0) return null;

  const isMultiple = otherSquadNames.length > 1;
  const tooltipText = isMultiple
    ? `Attenzione: Giocatore presente anche in altre ${otherSquadNames.length} rose (${otherSquadNames.join(', ')}). Clicca per gestire il doppione.`
    : `Attenzione: Giocatore presente anche in ${otherSquadNames[0]}. Clicca per gestire il doppione.`;

  const displayText = isMultiple
    ? `Presente in +${otherSquadNames.length} rose`
    : `Anche in: ${otherSquadNames[0]}`;

  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltipText}
      className={`inline-flex items-center gap-1 font-semibold rounded-md border transition-all cursor-pointer shadow-sm ${
        compact
          ? 'px-1.5 py-0.5 text-[10px] bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25'
          : 'px-2 py-0.5 text-xs bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25 hover:border-amber-400'
      }`}
    >
      <AlertTriangle className={`${compact ? 'w-2.5 h-2.5' : 'w-3 h-3'} text-amber-400 shrink-0 animate-pulse`} />
      <span className="truncate max-w-[140px] sm:max-w-[200px]">{displayText}</span>
      {totalCopies && totalCopies > 2 && (
        <span className="bg-amber-500/30 text-amber-200 px-1 rounded text-[9px] font-bold shrink-0">
          x{totalCopies}
        </span>
      )}
    </button>
  );
};
