import React, { useState } from 'react';
import { TrendingUp, TrendingDown, MoveRight, Clock, X, Calendar, Zap, Gauge } from 'lucide-react';
import { Player } from '../types';
import { getPlayerLastVariation, formatVariationDate, formatVariationTooltip } from '../utils/attributeDiffUtils';

interface PlayerVariationBadgeProps {
  player: Player;
  size?: 'xs' | 'sm' | 'md';
  showText?: boolean;
  showTimestamp?: boolean;
  showStable?: boolean;
  interactive?: boolean;
  className?: string;
}

export const PlayerVariationBadge: React.FC<PlayerVariationBadgeProps> = ({
  player,
  size = 'xs',
  showText = true,
  showTimestamp = false,
  showStable = true,
  interactive = true,
  className = '',
}) => {
  const [showPopover, setShowPopover] = useState(false);
  const variation = getPlayerLastVariation(player);

  if (!variation) {
    return null;
  }

  const isUp = variation.status === 'improved' || variation.caDiff > 0 || variation.improvedCount > variation.declinedCount;
  const isDown = !isUp && (variation.status === 'declined' || variation.caDiff < 0 || variation.declinedCount > variation.improvedCount);
  const isStable = !isUp && !isDown;

  // Se è stabile ma è stato richiesto di non mostrarlo, esci
  if (isStable && !showStable) {
    return null;
  }

  const formattedDate = formatVariationDate(variation.timestamp, variation.date);
  const tooltipText = formatVariationTooltip(variation, player.name);

  // Label sintetica del delta (priorità a CA diff, poi a numero attributi, oppure 0 per livello stabile)
  let deltaLabel = '0';
  if (isUp) {
    if (variation.caDiff > 0) deltaLabel = `+${variation.caDiff}`;
    else if (variation.improvedCount > 0) deltaLabel = `+${variation.improvedCount}`;
    else deltaLabel = '+0';
  } else if (isDown) {
    if (variation.caDiff < 0) deltaLabel = `${variation.caDiff}`;
    else if (variation.declinedCount > 0) deltaLabel = `-${variation.declinedCount}`;
    else deltaLabel = '-0';
  } else {
    deltaLabel = '0';
  }

  // Dimensioni e stili
  const sizeClasses = {
    xs: 'text-[9.5px] px-1.5 py-0.5 gap-1',
    sm: 'text-[11px] px-2 py-0.5 gap-1.5',
    md: 'text-xs px-2.5 py-1 gap-1.5',
  }[size];

  const iconSizes = {
    xs: 'w-2.5 h-2.5',
    sm: 'w-3 h-3',
    md: 'w-3.5 h-3.5',
  }[size];

  // Tema cromatico: Verde per crescita, Rosa/Rosso per calo, Bianco standard su sfondo neutro per livello stabile (0)
  const themeClasses = isUp
    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
    : isDown
    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
    : 'bg-slate-800 text-white border-slate-700 hover:bg-slate-700/90 shadow-sm';

  const badgeElement = (
    <div
      className={`inline-flex items-center rounded border font-mono font-bold transition-all shadow-sm select-none cursor-pointer group/var relative ${themeClasses} ${sizeClasses} ${className}`}
      title={tooltipText}
      onClick={(e) => {
        if (interactive) {
          e.stopPropagation();
          setShowPopover((prev) => !prev);
        }
      }}
    >
      {isUp ? (
        <TrendingUp className={`${iconSizes} shrink-0 text-emerald-400`} />
      ) : isDown ? (
        <TrendingDown className={`${iconSizes} shrink-0 text-rose-400`} />
      ) : (
        <MoveRight className={`${iconSizes} shrink-0 text-slate-200`} />
      )}

      {showText && (
        <span className="shrink-0 tracking-tight">
          {deltaLabel}
        </span>
      )}

      {/* Se presente tasso di crescita e taglia 'md', mostra anche il ritmo */}
      {size === 'md' && variation.caPacePerMonth !== undefined && variation.caPacePerMonth !== 0 && (
        <span className="text-[10px] font-sans font-normal opacity-85 ml-0.5">
          ({variation.caPacePerMonth > 0 ? `+${variation.caPacePerMonth}` : variation.caPacePerMonth}/m)
        </span>
      )}

      {showTimestamp && (
        <span className="text-[10px] font-normal text-slate-400 font-sans border-l border-slate-700/60 pl-1.5 ml-0.5 hidden sm:inline">
          {formattedDate}
        </span>
      )}
    </div>
  );

  return (
    <div className="relative inline-flex items-center">
      {badgeElement}

      {/* Popover Dettagliato Interattivo con Timestamp, Finestra Temporale e Attributi Modificati */}
      {showPopover && (
        <>
          {/* Backdrop trasparente per chiudere al click fuori */}
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => {
              e.stopPropagation();
              setShowPopover(false);
            }}
          />

          <div
            className="absolute left-0 bottom-full mb-2 z-50 w-72 sm:w-84 bg-slate-900/98 backdrop-blur-md border border-slate-700/80 rounded-xl p-3.5 shadow-2xl text-left font-sans text-xs text-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2 mb-2">
              <div className="flex items-center gap-2">
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center border shrink-0 ${
                    isUp
                      ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
                      : isDown
                      ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                      : 'bg-slate-800 border-slate-700 text-white'
                  }`}
                >
                  {isUp ? (
                    <TrendingUp className="w-3.5 h-3.5" />
                  ) : isDown ? (
                    <TrendingDown className="w-3.5 h-3.5" />
                  ) : (
                    <MoveRight className="w-3.5 h-3.5 text-slate-200" />
                  )}
                </div>
                <div>
                  <h5 className="font-bold text-white text-xs leading-snug">
                    {isUp
                      ? 'Crescita da Confronto CSV'
                      : isDown
                      ? 'Calo da Confronto CSV'
                      : 'Livello Stabile (0) da Confronto CSV'}
                  </h5>
                  <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                    <Clock className="w-2.5 h-2.5 text-slate-500" />
                    <span>{formattedDate}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPopover(false);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* SEZIONE TEMPORALITÀ: Date fissate e Ritmo di sviluppo */}
            {(variation.previousDate || variation.timeSpanLabel || variation.paceLabel) && (
              <div className="bg-slate-950/80 border border-slate-800/90 rounded-lg p-2.5 mb-2.5 space-y-1.5">
                <div className="flex items-center justify-between text-[10.5px]">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-cyan-400" />
                    <span>Periodo di confronto:</span>
                  </span>
                  <span className="font-semibold text-slate-200">
                    {variation.previousDate ? `${variation.previousDate} → ${variation.date}` : variation.date}
                  </span>
                </div>

                {variation.timeSpanLabel && (
                  <div className="flex items-center justify-between text-[10.5px]">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-400" />
                      <span>Durata intervallo:</span>
                    </span>
                    <span className="text-amber-300 font-mono font-medium">
                      {variation.timeSpanLabel}
                    </span>
                  </div>
                )}

                {variation.paceLabel && (
                  <div className="flex items-center justify-between text-[10.5px] pt-1 border-t border-slate-800/80">
                    <span className="text-slate-400 flex items-center gap-1">
                      <Gauge className="w-3 h-3 text-indigo-400" />
                      <span>Velocità sviluppo:</span>
                    </span>
                    <span
                      className={`font-semibold font-mono ${
                        isUp
                          ? 'text-emerald-400'
                          : isDown
                          ? 'text-rose-400'
                          : 'text-slate-300'
                      }`}
                    >
                      {variation.paceLabel}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Riassunto CA e PA */}
            <div className="grid grid-cols-2 gap-2 mb-2.5">
              <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2 text-center">
                <div className="text-[10px] text-slate-400 font-medium">Abilità (CA)</div>
                <div className="flex items-center justify-center gap-1.5 mt-0.5">
                  <span className="font-mono font-bold text-white text-xs">{player.ca ?? 'N/D'}</span>
                  {variation.caDiff !== 0 ? (
                    <span
                      className={`text-[10px] font-mono font-bold px-1 rounded ${
                        variation.caDiff > 0
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-rose-500/20 text-rose-400'
                      }`}
                    >
                      {variation.caDiff > 0 ? `+${variation.caDiff}` : variation.caDiff}
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono font-bold px-1 rounded bg-slate-800 text-slate-200 border border-slate-700 flex items-center gap-0.5">
                      <MoveRight className="w-2 h-2 text-slate-300" /> 0
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2 text-center">
                <div className="text-[10px] text-slate-400 font-medium">Potenziale (PA)</div>
                <div className="flex items-center justify-center gap-1.5 mt-0.5">
                  <span className="font-mono font-bold text-amber-300 text-xs">{player.pa ?? 'N/D'}</span>
                  {variation.paDiff !== 0 ? (
                    <span
                      className={`text-[10px] font-mono font-bold px-1 rounded ${
                        variation.paDiff > 0
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-rose-500/20 text-rose-400'
                      }`}
                    >
                      {variation.paDiff > 0 ? `+${variation.paDiff}` : variation.paDiff}
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono font-bold px-1 rounded bg-slate-800 text-slate-200 border border-slate-700 flex items-center gap-0.5">
                      <MoveRight className="w-2 h-2 text-slate-300" /> 0
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Avviso Livello Stabile */}
            {isStable && (
              <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-2.5 text-center text-xs text-slate-300 mb-2">
                <div className="flex items-center justify-center gap-1.5 text-white font-semibold mb-1">
                  <MoveRight className="w-3.5 h-3.5 text-slate-300" />
                  <span>Rendimento & Valori Stabili (0)</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Nessuna variazione riscontrata nell'intervallo temporale considerato. Tutti i parametri e la CA sono rimasti costanti.
                </p>
              </div>
            )}

            {/* Attributi Cresciuti */}
            {variation.improvedAttrs.length > 0 && (
              <div className="mb-2">
                <div className="text-[10px] font-bold text-emerald-400 flex items-center gap-1 mb-1">
                  <span>▲ Attributi in Crescita ({variation.improvedAttrs.length})</span>
                </div>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto custom-scrollbar pr-1">
                  {variation.improvedAttrs.map((attr, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 px-1.5 py-0.5 rounded flex items-center gap-1 font-mono"
                      title={`${attr.oldVal} ➔ ${attr.newVal} (+${attr.diff})`}
                    >
                      <span>{attr.name}</span>
                      <strong className="text-emerald-400 font-bold">+{attr.diff}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Attributi Calati */}
            {variation.declinedAttrs.length > 0 && (
              <div className="mb-2">
                <div className="text-[10px] font-bold text-rose-400 flex items-center gap-1 mb-1">
                  <span>▼ Attributi in Calo ({variation.declinedAttrs.length})</span>
                </div>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto custom-scrollbar pr-1">
                  {variation.declinedAttrs.map((attr, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] bg-rose-500/10 border border-rose-500/30 text-rose-200 px-1.5 py-0.5 rounded flex items-center gap-1 font-mono"
                      title={`${attr.oldVal} ➔ ${attr.newVal} (${attr.diff})`}
                    >
                      <span>{attr.name}</span>
                      <strong className="text-rose-400 font-bold">{attr.diff}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-2 pt-2 border-t border-slate-800 text-[9.5px] text-slate-500 text-center">
              Apri la scheda giocatore per confrontare date e fissare l'analisi per il Copilot
            </div>
          </div>
        </>
      )}
    </div>
  );
};
