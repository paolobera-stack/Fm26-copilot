import React, { useState, useMemo } from 'react';
import { Player, YouthSquad } from '../types';
import {
  RoleComparisonDefinition,
  FM_ROLE_COMPARISON_PRESETS,
  getDefaultRoleForPlayers,
  calculateRoleSuitability,
  getPlayerAttribute
} from '../utils/playerRoleComparisonUtils';
import { PlayerSpiderRadarChart } from './PlayerSpiderRadarChart';
import { getEffectiveAge } from '../utils/csvParser';
import {
  X,
  ArrowLeftRight,
  Sparkles,
  Bot,
  Award,
  CheckCircle2,
  TrendingUp,
  Sliders,
  Shield,
  Layers,
  Info,
  Eye,
  Copy,
  Check
} from 'lucide-react';

interface PlayerComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  players: Player[];
  youthSquads?: YouthSquad[];
  initialPlayerAId?: string;
  initialPlayerBId?: string;
  currentDate?: string;
  onAskCopilot?: (prompt: string) => void;
  onSelectPlayerForDetails?: (player: Player) => void;
}

export const PlayerComparisonModal: React.FC<PlayerComparisonModalProps> = ({
  isOpen,
  onClose,
  players,
  youthSquads = [],
  initialPlayerAId,
  initialPlayerBId,
  currentDate,
  onAskCopilot,
  onSelectPlayerForDetails
}) => {
  // Combine first team and youth squads for selection
  const allAvailablePlayers = useMemo(() => {
    const list: { player: Player; squadName: string }[] = [];
    players.forEach(p => list.push({ player: p, squadName: 'Prima Squadra' }));
    youthSquads.forEach(ys => {
      (ys.players || []).forEach(p => list.push({ player: p, squadName: ys.name }));
    });
    return list;
  }, [players, youthSquads]);

  // Selected player IDs
  const [playerAId, setPlayerAId] = useState<string>(() => {
    if (initialPlayerAId) return initialPlayerAId;
    return players[0]?.id || '';
  });

  const [playerBId, setPlayerBId] = useState<string>(() => {
    if (initialPlayerBId && initialPlayerBId !== initialPlayerAId) return initialPlayerBId;
    // Default to second player or another player
    const second = players.find(p => p.id !== (initialPlayerAId || players[0]?.id));
    return second?.id || players[1]?.id || '';
  });

  const playerA = useMemo(() => {
    return allAvailablePlayers.find(item => item.player.id === playerAId)?.player || players[0] || null;
  }, [allAvailablePlayers, playerAId, players]);

  const playerB = useMemo(() => {
    return allAvailablePlayers.find(item => item.player.id === playerBId)?.player || players[1] || players[0] || null;
  }, [allAvailablePlayers, playerBId, players]);

  // Selected Role Preset for comparison
  const [selectedRoleId, setSelectedRoleId] = useState<string>(() => {
    if (playerA && playerB) {
      return getDefaultRoleForPlayers(playerA, playerB).id;
    }
    return FM_ROLE_COMPARISON_PRESETS[0].id;
  });

  const activeRole: RoleComparisonDefinition = useMemo(() => {
    return (
      FM_ROLE_COMPARISON_PRESETS.find(r => r.id === selectedRoleId) ||
      FM_ROLE_COMPARISON_PRESETS[0]
    );
  }, [selectedRoleId]);

  const [hoveredAttrKey, setHoveredAttrKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'role' | 'technical' | 'mental' | 'physical'>('role');
  const [copied, setCopied] = useState(false);
  const [isSubmittingToCopilot, setIsSubmittingToCopilot] = useState(false);

  // Swap Player A and Player B
  const handleSwapPlayers = () => {
    const temp = playerAId;
    setPlayerAId(playerBId);
    setPlayerBId(temp);
  };

  if (!isOpen || !playerA || !playerB) return null;

  // Role suitability scores (0-100%)
  const fitScoreA = calculateRoleSuitability(playerA, activeRole);
  const fitScoreB = calculateRoleSuitability(playerB, activeRole);

  // Tally wins for active role attributes
  const roleAttrComparison = activeRole.attributes.map(attr => {
    const valA = getPlayerAttribute(playerA, attr.key);
    const valB = getPlayerAttribute(playerB, attr.key);
    const diff = valA - valB;
    return {
      attr,
      valA,
      valB,
      diff,
      winner: diff > 0 ? 'A' : diff < 0 ? 'B' : 'TIE'
    };
  });

  const winsA = roleAttrComparison.filter(c => c.winner === 'A').length;
  const winsB = roleAttrComparison.filter(c => c.winner === 'B').length;
  const ties = roleAttrComparison.filter(c => c.winner === 'TIE').length;

  // Ask Copilot prompt generator
  const handleTriggerCopilotAnalysis = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!onAskCopilot || isSubmittingToCopilot) return;
    setIsSubmittingToCopilot(true);
    const prompt = `Effettua un'analisi comparativa approfondita da Match Analyst tra ${playerA.name} (#${playerA.number}, ${playerA.position}, CA ${playerA.ca || 'N/D'}) e ${playerB.name} (#${playerB.number}, ${playerB.position}, CA ${playerB.ca || 'N/D'}) per il ruolo tattico di "${activeRole.name}". Chi è il titolare ideale per la nostra squadra e in quali contesti di gara è preferibile schierare l'uno o l'altro?`;
    onAskCopilot(prompt);
    onClose();
  };

  // Helper to color 1-20 FM attribute badge
  const getFmColorBadge = (val: number) => {
    if (val >= 16) return 'bg-amber-400 text-slate-950 font-black'; // Elite / World Class
    if (val >= 14) return 'bg-emerald-500 text-slate-950 font-bold'; // Great
    if (val >= 11) return 'bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30'; // Good
    if (val >= 8) return 'bg-slate-800 text-slate-300 font-medium'; // Average
    return 'bg-slate-900 text-slate-500 font-normal'; // Poor
  };

  // Copy brief comparison text
  const handleCopyComparisonText = () => {
    const text = `CONFRONTO TATTICO FM26: ${playerA.name} vs ${playerB.name}
Ruolo: ${activeRole.name}
Idoneità Ruolo: ${playerA.name} (${fitScoreA}%) vs ${playerB.name} (${fitScoreB}%)
Attributi Chiave Favorevoli: ${playerA.name} (${winsA}) | ${playerB.name} (${winsB}) | Parità (${ties})
${roleAttrComparison.map(c => `• ${c.attr.label}: ${c.valA} vs ${c.valB} (${c.diff > 0 ? `+${c.diff} ${playerA.name}` : c.diff < 0 ? `+${Math.abs(c.diff)} ${playerB.name}` : 'Parità'})`).join('\n')}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-fadeIn overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden my-auto">
        {/* MODAL HEADER */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 bg-slate-950 border-b border-slate-800 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-inner">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-white tracking-tight">
                  Confronto Giocatori & Analisi Ruolo
                </h3>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                  Spider Radar FM26
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Sovrapposizione attributi 1-20 ed idoneità ruolo per risolvere i ballottaggi di formazione.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              type="button"
              onClick={handleSwapPlayers}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Inverti Giocatore A e Giocatore B"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden sm:inline">Inverti</span>
            </button>
            <button
              type="button"
              onClick={handleCopyComparisonText}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Copia riepilogo testuale confronto"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copied ? 'Copiato' : 'Copia'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Chiudi"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ROLE SELECTION BAR */}
        <div className="px-5 py-3 bg-slate-950/60 border-b border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider shrink-0 flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>Ruolo Tattico Analizzato:</span>
            </label>
            <select
              value={selectedRoleId}
              onChange={(e) => setSelectedRoleId(e.target.value)}
              className="bg-slate-900 border border-slate-700 hover:border-slate-600 focus:border-emerald-500 text-white font-extrabold text-xs rounded-xl px-3 py-1.5 focus:outline-none cursor-pointer flex-1 max-w-md truncate shadow-inner"
            >
              {['Difensori', 'Centrocampisti', 'Ali ed Esterni', 'Attaccanti', 'Portieri', 'Generali'].map(category => (
                <optgroup key={category} label={category} className="bg-slate-950 text-emerald-400 font-bold">
                  {FM_ROLE_COMPARISON_PRESETS.filter(r => r.category === category).map(r => (
                    <option key={r.id} value={r.id} className="bg-slate-900 text-slate-100 font-medium py-1">
                      {r.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="text-xs text-slate-400 italic truncate max-w-md hidden lg:block">
            {activeRole.description}
          </div>
        </div>

        {/* SCROLLABLE BODY */}
        <div className="overflow-y-auto p-4 sm:p-6 space-y-6 custom-scrollbar">
          {/* SIDE-BY-SIDE HEAD-TO-HEAD SUMMARY CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* PLAYER A CARD (Emerald Theme) */}
            <div className="bg-slate-950/80 border-2 border-emerald-500/40 rounded-2xl p-4 shadow-xl space-y-3 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none"></div>

              {/* Player Selector Dropdown */}
              <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                  Giocatore A (Verde)
                </span>
                <select
                  value={playerAId}
                  onChange={(e) => setPlayerAId(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-white text-xs font-bold rounded-lg px-2.5 py-1 focus:outline-none focus:border-emerald-500 max-w-[200px] truncate cursor-pointer"
                >
                  {allAvailablePlayers.map(({ player: p, squadName }) => (
                    <option key={p.id} value={p.id} disabled={p.id === playerBId}>
                      {p.name} ({p.position}) {p.ca ? `• CA ${p.ca}` : ''} [{squadName}]
                    </option>
                  ))}
                </select>
              </div>

              {/* Info Row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <div className="w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300 font-mono font-bold text-base shadow-inner">
                    #{playerA.number}
                  </div>
                  <div>
                    <h4 className="text-base font-extrabold text-white flex items-center gap-1.5">
                      <span>{playerA.name}</span>
                      {onSelectPlayerForDetails && (
                        <button
                          type="button"
                          onClick={() => onSelectPlayerForDetails(playerA)}
                          className="text-slate-400 hover:text-emerald-400 p-0.5 rounded cursor-pointer"
                          title="Apri scheda dettagliata"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </h4>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                      <span className="bg-emerald-500/10 text-emerald-300 font-bold px-1.5 rounded border border-emerald-500/20">
                        {playerA.position}
                      </span>
                      <span>{getEffectiveAge(playerA, currentDate)} anni</span>
                      <span>• {playerA.nationality}</span>
                      {playerA.value && <span>• {playerA.value}</span>}
                    </div>
                  </div>
                </div>

                {/* Fit Score Badge */}
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Idoneità Ruolo</div>
                  <div className="text-lg font-black text-emerald-400 font-mono">
                    {fitScoreA}%
                  </div>
                </div>
              </div>

              {/* Stats Bar */}
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800/60 text-center text-xs">
                <div className="bg-slate-900/60 p-1.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">Abilità CA</span>
                  <span className="font-mono font-bold text-white">{playerA.ca || 'N/D'}</span>
                  {playerA.pa && <span className="text-[10px] text-slate-500 ml-1">/ {playerA.pa}</span>}
                </div>
                <div className="bg-slate-900/60 p-1.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">Morale</span>
                  <span className="font-bold text-slate-200">{playerA.morale}</span>
                </div>
                <div className="bg-slate-900/60 p-1.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">Condizione</span>
                  <span className="font-bold text-slate-200">{playerA.matchLoad}</span>
                </div>
              </div>
            </div>

            {/* PLAYER B CARD (Amber Theme) */}
            <div className="bg-slate-950/80 border-2 border-amber-500/40 rounded-2xl p-4 shadow-xl space-y-3 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl pointer-events-none"></div>

              {/* Player Selector Dropdown */}
              <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                  Giocatore B (Arancione)
                </span>
                <select
                  value={playerBId}
                  onChange={(e) => setPlayerBId(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-white text-xs font-bold rounded-lg px-2.5 py-1 focus:outline-none focus:border-amber-500 max-w-[200px] truncate cursor-pointer"
                >
                  {allAvailablePlayers.map(({ player: p, squadName }) => (
                    <option key={p.id} value={p.id} disabled={p.id === playerAId}>
                      {p.name} ({p.position}) {p.ca ? `• CA ${p.ca}` : ''} [{squadName}]
                    </option>
                  ))}
                </select>
              </div>

              {/* Info Row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <div className="w-11 h-11 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 font-mono font-bold text-base shadow-inner">
                    #{playerB.number}
                  </div>
                  <div>
                    <h4 className="text-base font-extrabold text-white flex items-center gap-1.5">
                      <span>{playerB.name}</span>
                      {onSelectPlayerForDetails && (
                        <button
                          type="button"
                          onClick={() => onSelectPlayerForDetails(playerB)}
                          className="text-slate-400 hover:text-amber-400 p-0.5 rounded cursor-pointer"
                          title="Apri scheda dettagliata"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </h4>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                      <span className="bg-amber-500/10 text-amber-300 font-bold px-1.5 rounded border border-amber-500/20">
                        {playerB.position}
                      </span>
                      <span>{getEffectiveAge(playerB, currentDate)} anni</span>
                      <span>• {playerB.nationality}</span>
                      {playerB.value && <span>• {playerB.value}</span>}
                    </div>
                  </div>
                </div>

                {/* Fit Score Badge */}
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Idoneità Ruolo</div>
                  <div className="text-lg font-black text-amber-400 font-mono">
                    {fitScoreB}%
                  </div>
                </div>
              </div>

              {/* Stats Bar */}
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800/60 text-center text-xs">
                <div className="bg-slate-900/60 p-1.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">Abilità CA</span>
                  <span className="font-mono font-bold text-white">{playerB.ca || 'N/D'}</span>
                  {playerB.pa && <span className="text-[10px] text-slate-500 ml-1">/ {playerB.pa}</span>}
                </div>
                <div className="bg-slate-900/60 p-1.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">Morale</span>
                  <span className="font-bold text-slate-200">{playerB.morale}</span>
                </div>
                <div className="bg-slate-900/60 p-1.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">Condizione</span>
                  <span className="font-bold text-slate-200">{playerB.matchLoad}</span>
                </div>
              </div>
            </div>
          </div>

          {/* SPIDER RADAR CHART & VERDICT GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* SPIDER RADAR CHART (7 cols) */}
            <div className="lg:col-span-7 bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl flex flex-col items-center">
              <div className="flex items-center justify-between w-full mb-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-emerald-400" /> Grafico Radar Sovrapposto (Scala 1 - 20)
                </span>
                <span className="text-[10px] bg-slate-900 text-sky-400 font-mono font-bold px-2 py-0.5 rounded border border-slate-800">
                  {activeRole.shortCode} • {activeRole.attributes.length} Attributi Chiave
                </span>
              </div>

              <PlayerSpiderRadarChart
                playerA={playerA}
                playerB={playerB}
                role={activeRole}
                hoveredAttrKey={hoveredAttrKey}
                onHoverAttr={setHoveredAttrKey}
              />
            </div>

            {/* TACTICAL VERDICT & COPILOT CALLOUT (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              {/* Verdict Summary Box */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-amber-400" /> Esito Ballottaggio Ruolo
                  </h4>
                  <span className="text-[11px] font-mono font-bold text-slate-400">
                    {winsA > winsB ? (
                      <span className="text-emerald-400">Vantaggio {playerA.name.split(' ')[0]}</span>
                    ) : winsB > winsA ? (
                      <span className="text-amber-400">Vantaggio {playerB.name.split(' ')[0]}</span>
                    ) : (
                      <span className="text-slate-300">Equilibrio Perfetto</span>
                    )}
                  </span>
                </div>

                {/* Score comparison pill */}
                <div className="flex items-center justify-between bg-slate-900 p-3 rounded-xl border border-slate-800 text-xs">
                  <div className="text-center flex-1">
                    <span className="text-emerald-400 font-black text-xl block font-mono">{winsA}</span>
                    <span className="text-[10px] text-slate-400">Attributi Top A</span>
                  </div>
                  <div className="text-center px-3 border-x border-slate-800 text-slate-500 font-bold text-xs">
                    {ties} {ties === 1 ? 'parità' : 'parità'}
                  </div>
                  <div className="text-center flex-1">
                    <span className="text-amber-400 font-black text-xl block font-mono">{winsB}</span>
                    <span className="text-[10px] text-slate-400">Attributi Top B</span>
                  </div>
                </div>

                {/* Tactical Recommendation Text */}
                <div className="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80 space-y-1.5">
                  <span className="font-bold text-white block text-[11px] uppercase tracking-wider text-sky-400">
                    💡 Suggerimento Tattico per {activeRole.name}:
                  </span>
                  <p className="text-[11px] text-slate-300">
                    {fitScoreA > fitScoreB + 4 ? (
                      <>
                        <strong className="text-emerald-300">{playerA.name}</strong> possiede un indice di idoneità superiore (+{fitScoreA - fitScoreB}%) ed è la prima scelta tecnica per interpretare il ruolo di <em>{activeRole.name}</em>.
                      </>
                    ) : fitScoreB > fitScoreA + 4 ? (
                      <>
                        <strong className="text-amber-300">{playerB.name}</strong> garantisce una resa più solida (+{fitScoreB - fitScoreA}%) ed è preferibile nel ruolo di <em>{activeRole.name}</em>.
                      </>
                    ) : (
                      <>
                        I due profili sono molto equilibrati (differenza di soli {Math.abs(fitScoreA - fitScoreB)}%). Schiera chi ha il morale e la freschezza fisica migliore o valuta in base al piano gara.
                      </>
                    )}
                  </p>
                </div>

                {/* Trigger Copilot Assistant Button */}
                {onAskCopilot && (
                  <button
                    type="button"
                    onClick={handleTriggerCopilotAnalysis}
                    disabled={isSubmittingToCopilot}
                    className="w-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-emerald-600 hover:opacity-95 disabled:opacity-50 text-white font-bold text-xs py-3 px-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Bot className="w-4 h-4 text-emerald-200" />
                    <span>{isSubmittingToCopilot ? 'Apertura Copilot in corso...' : 'Chiedi al Copilot di analizzare questo ballottaggio'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* DETAILED ATTRIBUTE COMPARISON TABLE */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Tabella Differenziale Attributi ({playerA.name} vs {playerB.name})
                </h4>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setActiveTab('role')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    activeTab === 'role' ? 'bg-emerald-600 text-white font-bold shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Ruolo ({activeRole.attributes.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('technical')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    activeTab === 'technical' ? 'bg-indigo-600 text-white font-bold shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Tecnici
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('mental')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    activeTab === 'mental' ? 'bg-indigo-600 text-white font-bold shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Mentali
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('physical')}
                  className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                    activeTab === 'physical' ? 'bg-indigo-600 text-white font-bold shadow' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Fisici
                </button>
              </div>
            </div>

            {/* Attribute Rows */}
            <div className="divide-y divide-slate-800/60">
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-2 pb-2 text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                <div className="col-span-3 text-left font-mono truncate">{playerA.name}</div>
                <div className="col-span-6 text-center">Attributo & Differenziale</div>
                <div className="col-span-3 text-right font-mono truncate">{playerB.name}</div>
              </div>

              {/* Filter attributes based on tab */}
              {(() => {
                let displayAttrs: { key: string; label: string; isPrimary?: boolean; category?: string }[] = [];

                if (activeTab === 'role') {
                  displayAttrs = activeRole.attributes.map(a => ({
                    key: a.key,
                    label: a.label,
                    isPrimary: a.weight > 1.2,
                    category: a.category
                  }));
                } else if (activeTab === 'technical') {
                  displayAttrs = [
                    { key: 'contrasti', label: 'Contrasti' },
                    { key: 'marcatura', label: 'Marcatura' },
                    { key: 'passaggi', label: 'Passaggi' },
                    { key: 'tecnica', label: 'Tecnica' },
                    { key: 'controllopalla', label: 'Controllo Palla' },
                    { key: 'dribbling', label: 'Dribbling' },
                    { key: 'cross', label: 'Cross' },
                    { key: 'colpoditesta', label: 'Colpo di Testa' },
                    { key: 'finalizzazione', label: 'Finalizzazione' },
                    { key: 'tiridafuori', label: 'Tiri da Fuori' },
                    { key: 'calcipiazzati', label: 'Calci Piazzati' },
                  ];
                } else if (activeTab === 'mental') {
                  displayAttrs = [
                    { key: 'decisioni', label: 'Decisioni' },
                    { key: 'visionedigioco', label: 'Visione di Gioco' },
                    { key: 'posizionamento', label: 'Posizionamento' },
                    { key: 'compostezza', label: 'Freddezza / Compostezza' },
                    { key: 'senzapalla', label: 'Senza Palla' },
                    { key: 'anticipazione', label: 'Anticipazione' },
                    { key: 'concentrazione', label: 'Concentrazione' },
                    { key: 'coraggio', label: 'Coraggio' },
                    { key: 'determinazione', label: 'Determinazione' },
                    { key: 'impegno', label: 'Impegno' },
                    { key: 'fantasia', label: 'Fantasia' },
                  ];
                } else {
                  displayAttrs = [
                    { key: 'velocita', label: 'Velocità' },
                    { key: 'accelerazione', label: 'Accelerazione' },
                    { key: 'resistenza', label: 'Resistenza' },
                    { key: 'forza', label: 'Forza' },
                    { key: 'elevazione', label: 'Elevazione' },
                    { key: 'agilita', label: 'Agilità' },
                    { key: 'equilibrio', label: 'Equilibrio' },
                    { key: 'integritafisica', label: 'Integrità Fisica' },
                  ];
                }

                return displayAttrs.map(item => {
                  const valA = getPlayerAttribute(playerA, item.key);
                  const valB = getPlayerAttribute(playerB, item.key);
                  const diff = valA - valB;
                  const isHovered = hoveredAttrKey === item.key;

                  return (
                    <div
                      key={item.key}
                      onMouseEnter={() => setHoveredAttrKey(item.key)}
                      onMouseLeave={() => setHoveredAttrKey(null)}
                      className={`grid grid-cols-12 gap-2 py-2.5 items-center transition-colors text-xs ${
                        isHovered ? 'bg-slate-900/80 rounded-xl px-2' : 'hover:bg-slate-900/40'
                      }`}
                    >
                      {/* PLAYER A VALUE */}
                      <div className="col-span-3 flex items-center justify-start gap-2">
                        <span className={`w-6 h-6 rounded flex items-center justify-center font-mono text-xs ${getFmColorBadge(valA)}`}>
                          {valA}
                        </span>
                        <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden hidden sm:block">
                          <div
                            className="bg-emerald-500 h-full rounded-full transition-all"
                            style={{ width: `${(valA / 20) * 100}%` }}
                          />
                        </div>
                      </div>

                      {/* ATTRIBUTE NAME & DIFFERENTIAL DELTA */}
                      <div className="col-span-6 flex flex-col items-center justify-center text-center">
                        <div className="flex items-center gap-1.5 font-bold text-slate-200">
                          {item.isPrimary && <span className="text-amber-400 text-xs" title="Attributo Primario del Ruolo">⭐</span>}
                          <span className={isHovered ? 'text-sky-300' : ''}>{item.label}</span>
                        </div>
                        <div className="text-[10px] font-mono mt-0.5">
                          {diff > 0 ? (
                            <span className="text-emerald-400 font-extrabold">
                              ▲ +{diff} {playerA.name.split(' ')[0]}
                            </span>
                          ) : diff < 0 ? (
                            <span className="text-amber-400 font-extrabold">
                              ▲ +{Math.abs(diff)} {playerB.name.split(' ')[0]}
                            </span>
                          ) : (
                            <span className="text-slate-500 font-semibold">= Parità</span>
                          )}
                        </div>
                      </div>

                      {/* PLAYER B VALUE */}
                      <div className="col-span-3 flex items-center justify-end gap-2">
                        <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden hidden sm:block">
                          <div
                            className="bg-amber-500 h-full rounded-full transition-all ml-auto"
                            style={{ width: `${(valB / 20) * 100}%` }}
                          />
                        </div>
                        <span className={`w-6 h-6 rounded flex items-center justify-center font-mono text-xs ${getFmColorBadge(valB)}`}>
                          {valB}
                        </span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950 border-t border-slate-800 shrink-0 text-xs">
          <div className="text-slate-400 text-[11px] hidden sm:block">
            I valori 1-20 corrispondono agli attributi ufficiali di Football Manager (16+ Fuoriclasse • 14+ Ottimo).
          </div>
          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-4 py-2 rounded-xl transition-colors cursor-pointer"
            >
              Chiudi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
