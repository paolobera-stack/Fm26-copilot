import React, { useState, useMemo } from 'react';
import { Player, MoraleLevel, MatchLoadLevel, HomegrownStatus, YouthSquad } from '../types';
import { ConfirmDialogModal } from './ConfirmDialogModal';
import { PlayerAttributesModal } from './PlayerAttributesModal';
import { ProspectBadge } from './ProspectBadge';
import { PlayerVariationBadge } from './PlayerVariationBadge';
import { getEffectiveAge, extractCurrentYear } from '../utils/csvParser';
import { getPlayerLastVariation } from '../utils/attributeDiffUtils';
import { matchesSearch } from '../utils/textUtils';
import { isCopilotNote } from '../utils/copilotNoteProposals';
import { findSquadDuplicates } from '../utils/squadDuplicateUtils';
import { SquadDuplicateBadge } from './SquadDuplicateBadge';
import { PlayerComparisonModal } from './PlayerComparisonModal';
import { useLanguage } from '../i18n/LanguageContext';
import { Search, Filter, Shield, AlertCircle, AlertTriangle, Plus, Edit2, Trash2, HeartPulse, CheckCircle2, UserCheck, Sparkles, Award, FileSpreadsheet, Upload, Eye, ArrowUpDown, ArrowUp, ArrowDown, ArrowDownAZ, ArrowUpAZ, Plane, Briefcase, X, Check, Clock, HelpCircle, BookOpen, ChevronDown, ChevronUp, History, TrendingUp, TrendingDown, MoveRight, Info, GraduationCap, Bot, Zap, Sliders } from 'lucide-react';

export type SquadSortField = 'index' | 'name' | 'position' | 'ca' | 'number' | 'variation';
export type SortDirection = 'asc' | 'desc';

const POSITION_PRIORITY: Record<string, number> = {
  POR: 1, GK: 1,
  DC: 2, CB: 2,
  DD: 3, TD: 3, RB: 3,
  DS: 4, TS: 4, LB: 4,
  M: 5, MED: 5, DM: 5,
  CC: 6, MC: 6, CM: 6,
  TRQ: 7, COA: 7, AM: 7, CAM: 7,
  AD: 8, ED: 8, AMR: 8, RW: 8,
  AS: 9, ES: 9, AML: 9, LW: 9,
  PC: 10, ATT: 10, P: 10, ST: 10, CF: 10
};

const getPositionPriority = (posString: string): number => {
  const posUpper = posString.toUpperCase();
  for (const [key, val] of Object.entries(POSITION_PRIORITY)) {
    if (posUpper.includes(key)) return val;
  }
  return 99;
};

interface SquadManagerProps {
  players: Player[];
  onUpdatePlayers: (players: Player[]) => void;
  onOpenCsvModal?: (type: 'squad' | 'scouting') => void;
  currentDate?: string;
  teamName?: string;
  youthSquads?: YouthSquad[];
  onDemoteToYouthSquad?: (player: Player, targetSquadId: string) => void;
  onAskCopilot?: (prompt: string) => void;
  onOpenDuplicatesModal?: (playerName?: string) => void;
}

export const SquadManager: React.FC<SquadManagerProps> = ({
  players,
  onUpdatePlayers,
  onOpenCsvModal,
  currentDate,
  teamName = 'Squadra',
  youthSquads,
  onDemoteToYouthSquad,
  onAskCopilot,
  onOpenDuplicatesModal,
}) => {
  const { language, t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [posFilter, setPosFilter] = useState<string>('Tutti');
  const [injuredOnly, setInjuredOnly] = useState(false);
  const [loanedOnly, setLoanedOnly] = useState(false);
  const [playerStaffOnly, setPlayerStaffOnly] = useState(false);
  const [availableForYouthOnly, setAvailableForYouthOnly] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [playerToDelete, setPlayerToDelete] = useState<{ id: string; name: string } | null>(null);
  const [playerToDemote, setPlayerToDemote] = useState<Player | null>(null);
  const [selectedYouthSquadId, setSelectedYouthSquadId] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isClearSquadConfirmOpen, setIsClearSquadConfirmOpen] = useState(false);
  const [selectedPlayerForDetails, setSelectedPlayerForDetails] = useState<Player | null>(null);
  const [injuryModalPlayer, setInjuryModalPlayer] = useState<{ id: string; name: string; isInjured: boolean; injuryNote: string } | null>(null);
  const [sortField, setSortField] = useState<SquadSortField>('position');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [variationFilter, setVariationFilter] = useState<'all' | 'improved' | 'declined' | 'stable'>('all');
  const [showCsvGuide, setShowCsvGuide] = useState(false);
  const [isComparisonModalOpen, setIsComparisonModalOpen] = useState(false);
  const [comparisonPlayerAId, setComparisonPlayerAId] = useState<string | undefined>(undefined);
  const [comparisonPlayerBId, setComparisonPlayerBId] = useState<string | undefined>(undefined);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 4500);
  };

  // Calculate positive, negative, and stable variation counts from CSV
  const { squadImprovedCount, squadDeclinedCount, squadStableCount } = useMemo(() => {
    let imp = 0;
    let dec = 0;
    let stb = 0;
    players.forEach((p) => {
      const v = getPlayerLastVariation(p);
      if (v) {
        if (v.status === 'improved' || v.caDiff > 0 || v.improvedCount > v.declinedCount) imp++;
        else if (v.status === 'declined' || v.caDiff < 0 || v.declinedCount > v.improvedCount) dec++;
        else stb++;
      }
    });
    return { squadImprovedCount: imp, squadDeclinedCount: dec, squadStableCount: stb };
  }, [players]);

  // Calcolo doppioni tra la Prima Squadra e le Squadre Giovanili
  const duplicatesReport = useMemo(() => {
    return findSquadDuplicates(players, youthSquads || []);
  }, [players, youthSquads]);

  const handleOpenDemoteModal = (player: Player) => {
    setPlayerToDemote(player);
    if (youthSquads && youthSquads.length > 0) {
      const playerAge = getEffectiveAge(player, currentDate);
      let bestSquad = youthSquads[0];
      if (playerAge <= 18) {
        const u18 = youthSquads.find((s) => s.category === 'U18' || s.name.includes('18'));
        if (u18) bestSquad = u18;
      } else if (playerAge <= 21) {
        const u21 = youthSquads.find((s) => s.category === 'U21' || s.category === 'U20' || s.name.includes('21') || s.name.includes('20') || s.category === 'B');
        if (u21) bestSquad = u21;
      }
      setSelectedYouthSquadId(bestSquad.id);
    } else {
      setSelectedYouthSquadId('');
    }
  };

  const handleConfirmDemote = () => {
    if (!playerToDemote) return;
    if (onDemoteToYouthSquad) {
      const targetSquad = youthSquads?.find((s) => s.id === selectedYouthSquadId) || youthSquads?.[0];
      const targetSquadName = targetSquad?.name || 'Rose Giovanili';
      onDemoteToYouthSquad(playerToDemote, selectedYouthSquadId);
      showToast(`🔄 ${playerToDemote.name} è stato trasferito nella rosa giovanile "${targetSquadName}".`);
    }
    if (editingPlayer?.id === playerToDemote.id) {
      setEditingPlayer(null);
    }
    if (selectedPlayerForDetails?.id === playerToDemote.id) {
      setSelectedPlayerForDetails(null);
    }
    setPlayerToDemote(null);
  };

  const handleSort = (field: SquadSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'variation' || field === 'ca' ? 'desc' : 'asc');
    }
  };

  // Filter logic
  const filteredPlayers = players.filter((p) => {
    const term = searchTerm.trim();
    const matchesSearchFilter = !term ||
      matchesSearch(p.name, term) ||
      matchesSearch(p.position, term) ||
      (p.nationality ? matchesSearch(p.nationality, term) : false) ||
      (p.bestRoles ? p.bestRoles.some((r) => matchesSearch(r, term)) : false) ||
      (p.number !== undefined && p.number !== null && p.number.toString() === term);
    
    let matchesPos = true;
    if (posFilter === 'POR') matchesPos = p.position.includes('POR');
    else if (posFilter === 'DEF') matchesPos = p.position.includes('DC') || p.position.includes('TS') || p.position.includes('TD');
    else if (posFilter === 'CEN') matchesPos = p.position.includes('CC') || p.position.includes('Med') || p.position.includes('TRQ');
    else if (posFilter === 'ATT') matchesPos = p.position.includes('PC') || p.position.includes('AS') || p.position.includes('AD') || p.position.includes('P');

    const matchesInjured = injuredOnly ? Boolean(p.isInjured) : true;
    const matchesLoaned = loanedOnly ? Boolean(p.isOnLoan) : true;
    const matchesPlayerStaff = playerStaffOnly ? Boolean(p.isPlayerStaff) : true;
    const matchesAvailableForYouth = availableForYouthOnly ? Boolean(p.availableForYouth) : true;

    let matchesVariation = true;
    if (variationFilter === 'improved') {
      const v = getPlayerLastVariation(p);
      matchesVariation = Boolean(v && (v.status === 'improved' || v.caDiff > 0 || v.improvedCount > v.declinedCount));
    } else if (variationFilter === 'declined') {
      const v = getPlayerLastVariation(p);
      matchesVariation = Boolean(v && (v.status === 'declined' || v.caDiff < 0 || v.declinedCount > v.improvedCount));
    } else if (variationFilter === 'stable') {
      const v = getPlayerLastVariation(p);
      matchesVariation = Boolean(v && (v.status === 'stable' || (v.caDiff === 0 && v.improvedCount === 0 && v.declinedCount === 0)));
    }

    return matchesSearchFilter && matchesPos && matchesInjured && matchesLoaned && matchesPlayerStaff && matchesAvailableForYouth && matchesVariation;
  });

  // Sort logic
  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'name') {
      cmp = a.name.localeCompare(b.name, 'it', { sensitivity: 'base' });
    } else if (sortField === 'position') {
      const prioA = getPositionPriority(a.position);
      const prioB = getPositionPriority(b.position);
      if (prioA !== prioB) {
        cmp = prioA - prioB;
      } else {
        cmp = a.position.localeCompare(b.position);
      }
    } else if (sortField === 'ca') {
      cmp = (b.ca || 0) - (a.ca || 0);
    } else if (sortField === 'number') {
      cmp = a.number - b.number;
    } else if (sortField === 'variation') {
      const vA = getPlayerLastVariation(a);
      const vB = getPlayerLastVariation(b);
      const getVariationScore = (v: typeof vA) => {
        if (!v) return -999;
        if (v.status === 'improved' || v.caDiff > 0 || v.improvedCount > v.declinedCount) {
          return 100 + (v.caDiff * 10) + (v.improvedCount - v.declinedCount);
        }
        if (v.status === 'declined' || v.caDiff < 0 || v.declinedCount > v.improvedCount) {
          return -100 + (v.caDiff * 10) - (v.declinedCount - v.improvedCount);
        }
        // Livello stabile (0)
        return 0;
      };
      cmp = getVariationScore(b) - getVariationScore(a);
    } else if (sortField === 'index') {
      cmp = 0;
    }

    return sortDirection === 'asc' ? cmp : -cmp;
  });

  // Calculate HG stats
  const hgClubCount = players.filter(p => p.homegrown.includes('HG Club') && p.championsLeagueRegistered).length;
  const hgNationCount = players.filter(p => p.homegrown.includes('HG Nazione') && p.championsLeagueRegistered).length;
  const totalClRegistered = players.filter(p => p.championsLeagueRegistered).length;
  const injuredCount = players.filter(p => p.isInjured).length;
  const loanedCount = players.filter(p => p.isOnLoan).length;
  const playerStaffCount = players.filter(p => p.isPlayerStaff).length;
  const availableForYouthCount = players.filter(p => p.availableForYouth).length;

  const handleToggleAvailableForYouth = (id: string) => {
    let newStatus = false;
    let playerName = '';
    const updated = players.map(p => {
      if (p.id === id) {
        newStatus = !p.availableForYouth;
        playerName = p.name;
        const playerAge = getEffectiveAge(p, currentDate);
        const defaultSquad = playerAge <= 18 ? 'Under 18' : 'Under 21';
        return {
          ...p,
          availableForYouth: newStatus,
          youthSquadDesignation: newStatus ? (p.youthSquadDesignation || defaultSquad) : undefined,
          youthMatchMinutes: newStatus ? (p.youthMatchMinutes || 'Fino a 90 min') : undefined
        };
      }
      return p;
    });
    onUpdatePlayers(updated);
    showToast(
      newStatus
        ? `🎓 ${playerName} è ora disponibile per le partite delle giovanili (si allena in 1ª squadra).`
        : `ℹ️ ${playerName} non è più disponibile per le giovanili (solo 1ª squadra).`
    );
  };

  const handleToggleInjured = (id: string) => {
    const updated = players.map(p => {
      if (p.id === id) {
        const nextIsInjured = !p.isInjured;
        return {
          ...p,
          isInjured: nextIsInjured,
          isOnLoan: nextIsInjured ? false : p.isOnLoan
        };
      }
      return p;
    });
    onUpdatePlayers(updated);
  };

  const handleToggleLoaned = (id: string) => {
    const updated = players.map(p => {
      if (p.id === id) {
        const nextIsOnLoan = !p.isOnLoan;
        return {
          ...p,
          isOnLoan: nextIsOnLoan,
          isInjured: nextIsOnLoan ? false : p.isInjured,
          loanClub: nextIsOnLoan ? (p.loanClub || '') : undefined
        };
      }
      return p;
    });
    onUpdatePlayers(updated);
  };

  const handleTogglePlayerStaff = (id: string) => {
    const updated = players.map(p => {
      if (p.id === id) {
        const nextStaff = !p.isPlayerStaff;
        return {
          ...p,
          isPlayerStaff: nextStaff,
          staffRole: nextStaff ? (p.staffRole || 'Collaboratore Tecnico') : undefined
        };
      }
      return p;
    });
    onUpdatePlayers(updated);
  };

  const handleSetAvailable = (id: string) => {
    const updated = players.map(p => {
      if (p.id === id) {
        return {
          ...p,
          isInjured: false,
          injuryNote: undefined,
          isOnLoan: false,
          loanClub: undefined
        };
      }
      return p;
    });
    onUpdatePlayers(updated);
  };

  const handleOpenInjuryModal = (p: Player) => {
    setInjuryModalPlayer({
      id: p.id,
      name: p.name,
      isInjured: true,
      injuryNote: p.injuryNote || ''
    });
  };

  const handleSaveQuickInjury = () => {
    if (!injuryModalPlayer) return;
    const { id, isInjured, injuryNote } = injuryModalPlayer;
    const updated = players.map(p => {
      if (p.id === id) {
        return {
          ...p,
          isInjured,
          injuryNote: isInjured ? (injuryNote.trim() || undefined) : undefined,
          isOnLoan: isInjured ? false : p.isOnLoan
        };
      }
      return p;
    });
    onUpdatePlayers(updated);
    if (isInjured) {
      showToast(`🚑 Infortunio aggiornato per ${injuryModalPlayer.name}${injuryNote ? ` (${injuryNote})` : ''}`);
    } else {
      showToast(`✅ ${injuryModalPlayer.name} è tornato Arruolabile e Disponibile.`);
    }
    setInjuryModalPlayer(null);
  };

  const handleSavePlayer = (player: Player) => {
    const currentYear = extractCurrentYear(currentDate);
    const updatedPlayer: Player = {
      ...player,
      age: Math.max(14, player.age || 22),
      birthYear: player.birthYear || (currentYear - (player.age || 22))
    };
    if (players.some(p => p.id === player.id)) {
      onUpdatePlayers(players.map(p => p.id === player.id ? updatedPlayer : p));
    } else {
      onUpdatePlayers([...players, updatedPlayer]);
    }
    setEditingPlayer(null);
    setIsCreating(false);
  };

  const handleDeletePlayer = (id: string) => {
    const targetPlayer = players.find((p) => p.id === id);
    if (targetPlayer) {
      setPlayerToDelete({ id: targetPlayer.id, name: targetPlayer.name });
    }
  };

  const confirmDeleteSinglePlayer = () => {
    if (playerToDelete) {
      onUpdatePlayers(players.filter((p) => p.id !== playerToDelete.id));
      if (editingPlayer && editingPlayer.id === playerToDelete.id) {
        setEditingPlayer(null);
        setIsCreating(false);
      }
      if (selectedPlayerForDetails && selectedPlayerForDetails.id === playerToDelete.id) {
        setSelectedPlayerForDetails(null);
      }
      setPlayerToDelete(null);
    }
  };

  const confirmClearSquad = () => {
    onUpdatePlayers([]);
    setIsClearSquadConfirmOpen(false);
    if (onOpenCsvModal) {
      onOpenCsvModal('squad');
    }
  };

  const getMoraleColor = (m: MoraleLevel) => {
    switch (m) {
      case 'Superbo': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
      case 'Eccellente': return 'text-teal-400 bg-teal-500/10 border-teal-500/30';
      case 'Buono': return 'text-sky-400 bg-sky-500/10 border-sky-500/30';
      case 'Neutro': return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      case 'Inquieto': case 'Scarsa': return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
    }
  };

  const getLoadBadge = (load: MatchLoadLevel) => {
    switch (load) {
      case 'Extremamente Elevato': return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'Elevato': return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'Medio': return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
      default: return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Champions League Registration Status Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Award className="w-5 h-5 text-indigo-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Lista Champions League</h3>
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              {totalClRegistered}/25 Giocatori
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[10px]">HG Club (Min. 4):</span>
              <span className={`font-bold text-sm ${hgClubCount >= 4 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {hgClubCount} / 4 {hgClubCount < 4 && '⚠️ Incompleto'}
              </span>
            </div>
            <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[10px]">HG Nazione (Min. 8):</span>
              <span className={`font-bold text-sm ${hgNationCount + hgClubCount >= 8 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {hgNationCount + hgClubCount} / 8
              </span>
            </div>
          </div>
        </div>

        {/* Disponibilità, Infermeria & Prestiti Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <HeartPulse className="w-5 h-5 text-rose-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Stato Disponibilità Rosa</h3>
              </div>
              <div className="flex items-center gap-1.5">
                {injuredCount > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded border text-rose-300 bg-rose-500/20 border-rose-500/40">
                    {injuredCount} Inf.
                  </span>
                )}
                {loanedCount > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded border text-sky-300 bg-sky-500/20 border-sky-500/40 flex items-center gap-1">
                    <Plane className="w-2.5 h-2.5" /> {loanedCount} Prestito
                  </span>
                )}
                {availableForYouthCount > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded border text-teal-300 bg-teal-500/20 border-teal-500/40 flex items-center gap-1" title="Giocatori che si allenano con la prima squadra ma sono disponibili per le partite delle giovanili">
                    <GraduationCap className="w-2.5 h-2.5 text-teal-400" /> {availableForYouthCount} Disp. Giovanili
                  </span>
                )}
                {injuredCount === 0 && loanedCount === 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded border text-emerald-400 bg-emerald-500/10 border-emerald-500/30">
                    Tutti Arruolabili
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              I giocatori contrassegnati come <strong>Infortunati</strong> o <strong>In Prestito</strong> vengono categoricamente esclusi da rotazioni, valutazioni e formazioni titolari.
            </p>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setInjuredOnly(!injuredOnly);
                if (!injuredOnly) setLoanedOnly(false);
              }}
              className={`flex-1 border text-xs font-medium py-1.5 px-2 rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer ${
                injuredOnly
                  ? 'bg-rose-600 text-white border-rose-500'
                  : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30'
              }`}
            >
              <HeartPulse className="w-3.5 h-3.5" /> {injuredOnly ? 'Tutti' : `Infortuni (${injuredCount})`}
            </button>

            <button
              type="button"
              onClick={() => {
                setLoanedOnly(!loanedOnly);
                if (!loanedOnly) setInjuredOnly(false);
              }}
              className={`flex-1 border text-xs font-medium py-1.5 px-2 rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer ${
                loanedOnly
                  ? 'bg-sky-600 text-white border-sky-500'
                  : 'bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border-sky-500/30'
              }`}
            >
              <Plane className="w-3.5 h-3.5" /> {loanedOnly ? 'Tutti' : `In Prestito (${loanedCount})`}
            </button>
          </div>
        </div>

        {/* Quick Add Player & Clear Squad */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">Gestione Rosa {teamName}</h3>
              <div className="flex items-center gap-1.5">
                {currentDate && (
                  <span className="text-[10px] bg-slate-950 text-slate-400 font-semibold px-2 py-0.5 rounded-full border border-slate-800 flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5 text-emerald-400" />
                    <span>{currentDate}</span>
                  </span>
                )}
                <span className="text-[10px] bg-slate-800 text-slate-300 font-bold px-2 py-0.5 rounded-full border border-slate-700">
                  {players.length} Giocatori
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              Età, scadenze e status HG sincronizzati al giorno di gioco. Svuota la rosa per inserire i tuoi dati da CSV, o aggiungi singoli profili.
            </p>
          </div>
          <div className="mt-3 flex flex-wrap sm:flex-nowrap gap-2">
            <button
              onClick={() => onOpenCsvModal && onOpenCsvModal('squad')}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-1.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950/40"
            >
              <FileSpreadsheet className="w-4 h-4 text-white" /> {t('squad.importCsv')}
            </button>

            <button
              onClick={() => setIsClearSquadConfirmOpen(true)}
              className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold py-1.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5"
              title={language === 'it' ? "Rimuovi tutti i giocatori per importare da zero il tuo file CSV" : "Remove all players to import a fresh squad CSV"}
            >
              <Trash2 className="w-3.5 h-3.5" /> {t('squad.clearSquad')}
            </button>

            <button
              type="button"
              onClick={() => {
                setComparisonPlayerAId(undefined);
                setComparisonPlayerBId(undefined);
                setIsComparisonModalOpen(true);
              }}
              className="bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 text-xs font-semibold py-1.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
              title="Confronta due giocatori fianco a fianco con Spider Radar Chart e idoneità ruolo"
            >
              <Sliders className="w-3.5 h-3.5 text-indigo-400" />
              <span>Confronta Giocatori</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenDuplicatesModal?.()}
              className={`text-xs font-semibold py-1.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer border ${
                duplicatesReport.hasDuplicates
                  ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/40 shadow-sm animate-pulse'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title={language === 'it' ? "Controllo incrociato tra Prima Squadra e Giovanili per rilevare doppioni" : "Cross-check between First Team and Youth Squads for duplicates"}
            >
              <AlertTriangle className={`w-3.5 h-3.5 ${duplicatesReport.hasDuplicates ? 'text-amber-400' : 'text-slate-400'}`} />
              <span>{t('squad.manageDuplicates')}</span>
              {duplicatesReport.totalDuplicatePlayers > 0 && (
                <span className="bg-amber-500/30 text-amber-200 px-1.5 py-0.2 rounded-full text-[10px] font-bold">
                  {duplicatesReport.totalDuplicatePlayers}
                </span>
              )}
            </button>

            <button
              onClick={() => {
                const cYear = extractCurrentYear(currentDate);
                setEditingPlayer({
                  id: `p_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                  name: '',
                  number: 99,
                  position: 'CC',
                  bestRoles: ['Centrocampista di Quantità'],
                  age: 22,
                  birthYear: cYear - 22,
                  nationality: 'Inghilterra',
                  morale: 'Buono',
                  matchLoad: 'Medio',
                  homegrown: 'HG Nazione (3 anni in UK)',
                  championsLeagueRegistered: true,
                  isKeyPlayer: false,
                  isInjured: false,
                  isOnLoan: false
                });
                setIsCreating(true);
              }}
              className="bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-semibold py-1.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> {t('squad.addPlayer')}
            </button>
          </div>

          <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowCsvGuide(!showCsvGuide)}
              className="text-xs text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>{showCsvGuide ? (language === 'it' ? 'Nascondi Guida Sostituzione CSV' : 'Hide CSV Guide') : (language === 'it' ? 'Come sostituire i CSV & Storico?' : 'How to replace CSV & History?')}</span>
              {showCsvGuide ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
              {language === 'it' ? 'Storico valori preservato' : 'Attribute history preserved'}
            </span>
          </div>
        </div>
      </div>

      {/* Banner di Avviso Doppioni tra le Rose */}
      {duplicatesReport.hasDuplicates && (
        <div className="bg-amber-500/10 border border-amber-500/35 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg shadow-amber-950/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
              <AlertTriangle className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-white tracking-wide">
                  {language === 'it'
                    ? `Attenzione: Rilevati ${duplicatesReport.totalDuplicatePlayers} giocatori duplicati tra Prima Squadra e Giovanili`
                    : `Warning: Detected ${duplicatesReport.totalDuplicatePlayers} duplicate players across First Team and Youth Squads`}
                </h4>
                <span className="text-[10px] bg-amber-500/25 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full font-bold">
                  {duplicatesReport.totalExcessCopies} {language === 'it' ? 'copie ridondanti' : 'redundant copies'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {language === 'it'
                  ? 'Alcuni atleti di questa rosa risultano censiti contemporaneamente anche nelle squadre giovanili. Apri il controllo per visualizzarli ed eliminare i doppioni in 1 click unendo note e statistiche.'
                  : 'Some players in this squad are currently registered in both first team and youth squads. Open the tool to review and clean up duplicates in 1 click while merging notes and stats.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenDuplicatesModal?.()}
            className="px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-amber-950/40 transition-all cursor-pointer shrink-0"
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>{t('squad.manageDuplicates')}</span>
          </button>
        </div>
      )}

      {/* Guida Istruzioni CSV & Monitoraggio Storico */}
      {showCsvGuide && (
        <div className="bg-slate-900 border border-sky-500/40 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-sky-500/20 text-sky-300 rounded-xl border border-sky-500/30">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  Guida: Come Sostituire o Aggiornare i CSV della Rosa & Monitorare la Crescita
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Segui questi passaggi per esportare da Football Manager e sincronizzare la rosa ciclicamente senza perdere lo storico dei valori.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowCsvGuide(false)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="Chiudi guida"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {/* Step 1 */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/30 inline-block">
                  Passo 1: Esporta da FM
                </span>
                <h4 className="font-bold text-slate-200 text-xs">Esporta la schermata Rosa</h4>
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  In <strong>Football Manager</strong>, apri la schermata <strong>Rosa</strong>, premi <kbd className="bg-slate-800 px-1 rounded border border-slate-700 font-mono text-[10px]">Ctrl + A</kbd> (o Cmd + A) per selezionare tutti i giocatori, poi <kbd className="bg-slate-800 px-1 rounded border border-slate-700 font-mono text-[10px]">Ctrl + P</kbd> e scegli <strong>"Pagina Web (.html)"</strong> o "File di Testo". Salvalo come file <code>.csv</code> o <code>.txt</code>.
                </p>
              </div>
              <div className="text-[10px] text-slate-500 italic bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                💡 Assicurati che siano visibili le colonne Nome, Età, Posizione, CA, PA e gli attributi desiderati.
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30 inline-block">
                  Passo 2: Carica il File
                </span>
                <h4 className="font-bold text-slate-200 text-xs">Apri il Modal d'Importazione</h4>
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  Fai clic sul pulsante verde <strong>"Carica CSV Rosa"</strong> qui in alto a destra. Trascina il nuovo file esportato o clicca per selezionarlo dal tuo computer. Puoi caricare anche più file contemporaneamente se hai viste separate.
                </p>
              </div>
              <div className="text-[10px] text-emerald-400/90 font-medium bg-emerald-950/30 p-2 rounded-lg border border-emerald-900/40 flex items-center gap-1.5">
                <History className="w-3.5 h-3.5 shrink-0" />
                <span>Rilevamento automatico di separatori (virgole o punti e virgola).</span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30 inline-block">
                  Passo 3: Scegli la Modalità
                </span>
                <h4 className="font-bold text-slate-200 text-xs">Merge o Sostituisci Rosa</h4>
                <div className="space-y-1 text-slate-400 text-[11px] leading-relaxed">
                  <p>
                    • <strong>Aggiorna (Merge)</strong>: aggiorna i giocatori presenti nel CSV e mantiene quelli non presenti.
                  </p>
                  <p>
                    • <strong>Sostituisci Interamente</strong>: allinea la squadra ai soli giocatori del nuovo CSV, <em>preservando l'intero storico</em> di chi era già presente!
                  </p>
                </div>
              </div>
              <div className="text-[10px] text-amber-300/90 bg-amber-950/30 p-2 rounded-lg border border-amber-900/40">
                🔒 In entrambe le modalità, i valori precedenti vengono salvati nello storico snapshot senza perdite.
              </div>
            </div>

            {/* Step 4 */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wider bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/30 inline-block">
                  Passo 4: Controlla e Monitora
                </span>
                <h4 className="font-bold text-slate-200 text-xs">Diff Report & AI Copilot</h4>
                <p className="text-slate-400 leading-relaxed text-[11px]">
                  Prima di applicare, consulta il tab <strong>"Report Variazioni (Diff)"</strong> per vedere chi è cresciuto. Una volta importato, clicca su un giocatore per visualizzare i badge di crescita (es. <span className="text-emerald-400 font-bold">▲+1</span>) o chiedi al Copilot di analizzare l'evoluzione nel tempo.
                </p>
              </div>
              <div className="text-[10px] text-purple-300/90 bg-purple-950/30 p-2 rounded-lg border border-purple-900/40 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 shrink-0 text-purple-400" />
                <span>Il Copilot legge i dati storici e le note per darti consigli tattici.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters & Search & Sort */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-3.5">
        {/* ROW 1: Dedicated, Spacious & Highly Legible Search Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Cerca giocatore per nome, ruolo, nazionalità o maglia (es. Gnonto, DC, Kerkez, Italia, 10)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700/80 hover:border-slate-600 focus:border-emerald-500 rounded-xl pl-11 pr-24 py-2.5 sm:py-3 text-sm sm:text-base text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all shadow-inner"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                  title="Cancella ricerca"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <span className="text-xs font-mono font-bold px-2 py-1 rounded-lg bg-slate-800/90 text-slate-300 border border-slate-700 select-none">
                {filteredPlayers.length}/{players.length}
              </span>
            </div>
          </div>

          {/* Reset Filters & Search Button (visible if any filter or search active) */}
          {(searchTerm || posFilter !== 'Tutti' || injuredOnly || loanedOnly || playerStaffOnly || availableForYouthOnly || variationFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setPosFilter('Tutti');
                setInjuredOnly(false);
                setLoanedOnly(false);
                setPlayerStaffOnly(false);
                setAvailableForYouthOnly(false);
                setVariationFilter('all');
              }}
              className="px-3.5 py-2.5 sm:py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0 shadow-sm"
              title="Azzera tutti i filtri e il testo di ricerca"
            >
              <X className="w-3.5 h-3.5 text-rose-400" />
              <span>Azzera Filtri</span>
            </button>
          )}
        </div>

        {/* ROW 2: Filters Grouped by Category */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/70">
          {/* Posizioni (Segmented Group) */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            {['Tutti', 'POR', 'DEF', 'CEN', 'ATT'].map((pos) => (
              <button
                key={pos}
                onClick={() => setPosFilter(pos)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  posFilter === pos
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                {pos === 'Tutti' ? 'Tutti i Ruoli' : pos}
              </button>
            ))}
          </div>

          <div className="h-5 w-px bg-slate-800 hidden sm:block" />

          {/* Status Filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => {
                setInjuredOnly(!injuredOnly);
                if (!injuredOnly) setLoanedOnly(false);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors flex items-center space-x-1 whitespace-nowrap border cursor-pointer ${
                injuredOnly
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 font-bold shadow-sm'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              <HeartPulse className="w-3.5 h-3.5 text-rose-400" />
              <span>Infortunati {injuredCount > 0 && `(${injuredCount})`}</span>
            </button>

            <button
              onClick={() => {
                setLoanedOnly(!loanedOnly);
                if (!loanedOnly) {
                  setInjuredOnly(false);
                  setPlayerStaffOnly(false);
                }
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors flex items-center space-x-1 whitespace-nowrap border cursor-pointer ${
                loanedOnly
                  ? 'bg-blue-500/20 text-blue-300 border-blue-500/50 font-bold shadow-sm'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              <Plane className="w-3.5 h-3.5 text-blue-400" />
              <span>In Prestito {loanedCount > 0 && `(${loanedCount})`}</span>
            </button>

            <button
              onClick={() => {
                setPlayerStaffOnly(!playerStaffOnly);
                if (!playerStaffOnly) {
                  setInjuredOnly(false);
                  setLoanedOnly(false);
                  setAvailableForYouthOnly(false);
                }
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors flex items-center space-x-1 whitespace-nowrap border cursor-pointer ${
                playerStaffOnly
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 font-bold shadow-sm'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
              title="Filtra i giocatori contrassegnati come Giocatore/Staff (Investimento quadri tecnici società)"
            >
              <Briefcase className="w-3.5 h-3.5 text-purple-400" />
              <span>Giocatore/Staff {playerStaffCount > 0 && `(${playerStaffCount})`}</span>
            </button>

            <button
              onClick={() => {
                setAvailableForYouthOnly(!availableForYouthOnly);
                if (!availableForYouthOnly) {
                  setInjuredOnly(false);
                  setLoanedOnly(false);
                  setPlayerStaffOnly(false);
                }
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors flex items-center space-x-1.5 whitespace-nowrap border cursor-pointer ${
                availableForYouthOnly
                  ? 'bg-teal-500/20 text-teal-300 border-teal-500/50 font-bold shadow-sm'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
              title="Filtra i giocatori che si allenano con la prima squadra ma sono disponibili per le partite delle squadre giovanili"
            >
              <GraduationCap className="w-3.5 h-3.5 text-teal-400" />
              <span>Disp. Giovanili {availableForYouthCount > 0 && `(${availableForYouthCount})`}</span>
            </button>

            {/* Filtri Variazione CSV (Crescita / Stabili 0 / Calo) */}
            <button
              onClick={() => {
                setVariationFilter((prev) => (prev === 'improved' ? 'all' : 'improved'));
                if (variationFilter !== 'improved') {
                  setInjuredOnly(false);
                  setLoanedOnly(false);
                  setPlayerStaffOnly(false);
                }
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors flex items-center space-x-1 whitespace-nowrap border cursor-pointer ${
                variationFilter === 'improved'
                  ? 'bg-emerald-500/25 text-emerald-300 border-emerald-500/60 font-bold shadow-sm'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-emerald-300'
              }`}
              title="Filtra i giocatori con incrementi di CA o attributi dall'ultima importazione CSV"
            >
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span>In Crescita {squadImprovedCount > 0 && `(${squadImprovedCount})`}</span>
            </button>

            <button
              onClick={() => {
                setVariationFilter((prev) => (prev === 'stable' ? 'all' : 'stable'));
                if (variationFilter !== 'stable') {
                  setInjuredOnly(false);
                  setLoanedOnly(false);
                  setPlayerStaffOnly(false);
                }
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors flex items-center space-x-1 whitespace-nowrap border cursor-pointer ${
                variationFilter === 'stable'
                  ? 'bg-slate-800 text-white border-slate-600 font-bold shadow-sm'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
              }`}
              title="Filtra i giocatori con livello stabile (variazione 0) dall'ultima importazione CSV"
            >
              <MoveRight className="w-3.5 h-3.5 text-slate-200" />
              <span>Stabili {squadStableCount > 0 && `(${squadStableCount})`}</span>
            </button>

            <button
              onClick={() => {
                setVariationFilter((prev) => (prev === 'declined' ? 'all' : 'declined'));
                if (variationFilter !== 'declined') {
                  setInjuredOnly(false);
                  setLoanedOnly(false);
                  setPlayerStaffOnly(false);
                }
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors flex items-center space-x-1 whitespace-nowrap border cursor-pointer ${
                variationFilter === 'declined'
                  ? 'bg-rose-500/25 text-rose-300 border-rose-500/60 font-bold shadow-sm'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-rose-300'
              }`}
              title="Filtra i giocatori con cali di CA o attributi dall'ultima importazione CSV"
            >
              <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
              <span>In Calo {squadDeclinedCount > 0 && `(${squadDeclinedCount})`}</span>
            </button>
          </div>
        </div>

        {/* Quick Sorting Toolbar */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
          <div className="flex items-center space-x-2 overflow-x-auto">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 shrink-0">
              <Filter className="w-3 h-3 text-emerald-400" /> Ordina Per:
            </span>
            <button
              onClick={() => handleSort('position')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1 border ${
                sortField === 'position'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              Ruolo Tactical (POR → PC)
            </button>
            <button
              onClick={() => handleSort('name')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1 border ${
                sortField === 'name'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              Alfabetico (A-Z)
            </button>
            <button
              onClick={() => handleSort('number')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1 border ${
                sortField === 'number'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              N° Maglia
            </button>
            <button
              onClick={() => handleSort('ca')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1 border ${
                sortField === 'ca'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
            >
              Abilità (CA)
            </button>
            <button
              onClick={() => handleSort('variation')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1 border ${
                sortField === 'variation'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold'
                  : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
              title="Ordina per maggiore crescita/variazione attributi dall'ultima importazione CSV"
            >
              <TrendingUp className="w-3 h-3 text-emerald-400" /> Variazione CSV
            </button>
          </div>

          <button
            onClick={() => setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
            className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-950 text-slate-300 border border-slate-800 hover:bg-slate-800 flex items-center gap-1 transition-all shrink-0"
            title="Inverti direzione ordinamento"
          >
            {sortDirection === 'asc' ? (
              <>
                <ArrowUpAZ className="w-3.5 h-3.5 text-emerald-400" /> Crescente
              </>
            ) : (
              <>
                <ArrowDownAZ className="w-3.5 h-3.5 text-amber-400" /> Decrescente
              </>
            )}
          </button>
        </div>
      </div>

      {/* Players Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-xs text-slate-300 min-w-[960px]">
            <thead className="bg-slate-950/90 text-slate-400 font-semibold border-b border-slate-800 uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4 w-[240px] sm:w-[280px] md:w-[320px] max-w-[320px]">
                  <button
                    onClick={() => handleSort('name')}
                    className="flex items-center gap-1.5 hover:text-emerald-400 transition-colors uppercase"
                  >
                    <span># / Giocatore</span>
                    {sortField === 'name' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-400" /> : <ArrowDown className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-40" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-4 whitespace-nowrap">
                  <button
                    onClick={() => handleSort('position')}
                    className="flex items-center gap-1.5 hover:text-emerald-400 transition-colors uppercase"
                  >
                    <span>Ruolo / Posizione</span>
                    {sortField === 'position' ? (
                      sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-400" /> : <ArrowDown className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-40" />
                    )}
                  </button>
                </th>
                <th className="py-3 px-4 whitespace-nowrap">Stato Disponibilità</th>
                <th className="py-3 px-4 whitespace-nowrap">Morale</th>
                <th className="py-3 px-4 whitespace-nowrap">Carico Partite</th>
                <th className="py-3 px-4 whitespace-nowrap">Status Homegrown</th>
                <th className="py-3 px-4 text-center whitespace-nowrap">Champions</th>
                <th className="py-3 px-4 text-right sticky right-0 bg-slate-950 z-20 w-[195px] min-w-[195px] shadow-[-12px_0_15px_-3px_rgba(0,0,0,0.7)]">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {sortedPlayers.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 px-4 text-center">
                    <div className="flex flex-col items-center justify-center space-y-3 max-w-md mx-auto">
                      <div className="w-12 h-12 rounded-2xl bg-[#721c24]/20 border border-red-500/30 flex items-center justify-center text-rose-400">
                        <FileSpreadsheet className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-200">
                          {players.length === 0 ? 'Rosa Attualmente Vuota' : 'Nessun Giocatore Trovato per i Filtri'}
                        </h4>
                        <p className="text-xs text-slate-400 mt-1">
                          {players.length === 0
                            ? 'La rosa è stata svuotata. Carica il tuo file CSV per importare la tua rosa personalizzata.'
                            : 'Nessun giocatore corrisponde ai criteri di ricerca o filtro selezionati.'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 pt-2">
                        <button
                          onClick={() => onOpenCsvModal && onOpenCsvModal('squad')}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-emerald-950/40 flex items-center gap-1.5 transition-all"
                        >
                          <FileSpreadsheet className="w-4 h-4" /> Carica CSV dei tuoi Giocatori
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              {sortedPlayers.map((p, index) => {
                const isInjured = Boolean(p.isInjured);
                const isOnLoan = Boolean(p.isOnLoan);

                return (
                  <tr
                    key={`${p.id}_${index}`}
                    className={`transition-colors group ${
                      isInjured
                        ? 'bg-rose-950/25 border-l-4 border-l-rose-500 hover:bg-rose-950/40'
                        : isOnLoan
                        ? 'bg-blue-950/25 border-l-4 border-l-blue-500 hover:bg-blue-950/40'
                        : 'hover:bg-slate-800/40'
                    }`}
                  >
                    {/* Player Info with Progressive Number index + 1 */}
                    <td className="py-3 px-4 w-[240px] sm:w-[280px] md:w-[320px] max-w-[320px]">
                      <div className="flex items-center space-x-2.5">
                        <span className="text-[11px] font-mono font-bold text-slate-500 w-5 text-right shrink-0" title={`Record N° ${index + 1}`}>
                          {index + 1}.
                        </span>
                        <span
                          className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 border ${
                            isInjured
                              ? 'bg-rose-950 border-rose-600/80 text-rose-300 font-extrabold shadow-sm'
                              : isOnLoan
                              ? 'bg-blue-950 border-blue-600/80 text-blue-300 font-extrabold shadow-sm'
                              : 'bg-slate-800 border-slate-700 text-emerald-400'
                          }`}
                          title={`Maglia #${p.number}`}
                        >
                          {p.number}
                        </span>
                        <div className="min-w-0 flex-1">
                          {/* Barra di scorrimento orizzontale in caso di nomi lunghi o badge estesi per non tagliare le opzioni */}
                          <div 
                            className="w-full max-w-[160px] sm:max-w-[200px] md:max-w-[240px] overflow-x-auto overflow-y-hidden pb-1.5 name-scrollbar"
                            title={`${p.name} (scorri con la barra in caso di nome lungo)`}
                          >
                            <div className="font-bold flex items-center gap-1.5 text-sm whitespace-nowrap">
                              <button
                                onClick={() => setSelectedPlayerForDetails(p)}
                                className={`transition-colors text-left flex items-center gap-1.5 cursor-pointer font-bold shrink-0 ${
                                  isInjured
                                    ? 'text-rose-400 hover:text-rose-300'
                                    : isOnLoan
                                    ? 'text-blue-400 hover:text-blue-300'
                                    : 'text-slate-100 hover:text-emerald-400'
                                }`}
                              >
                                {p.name}
                              </button>
                              <PlayerVariationBadge player={p} size="xs" />
                              <ProspectBadge pa={p.pa} age={getEffectiveAge(p, currentDate)} />
                              {duplicatesReport.playerToOtherSquadsMap.has(p.id) && (
                                <SquadDuplicateBadge
                                  compact
                                  otherSquadNames={duplicatesReport.playerToOtherSquadsMap.get(p.id)}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenDuplicatesModal?.(p.name);
                                  }}
                                />
                              )}
                              {p.isPlayerStaff && (
                                <span className="text-[9px] bg-purple-500/20 text-purple-300 font-bold px-2 py-0.5 rounded border border-purple-500/40 flex items-center gap-1 shrink-0 shadow-sm" title={p.staffRole ? `Ruolo: ${p.staffRole}` : 'Investimento quadri tecnici e collaboratori societari'}>
                                  <Briefcase className="w-3 h-3 text-purple-400" /> GIOCATORE/STAFF {p.staffRole ? `(${p.staffRole})` : ''}
                                </span>
                              )}
                              {p.availableForYouth && !isOnLoan && (
                                <span
                                  className="text-[9px] bg-teal-500/20 text-teal-300 font-bold px-2 py-0.5 rounded border border-teal-500/40 flex items-center gap-1 shrink-0 shadow-sm"
                                  title={`Si allena con la rosa titolare • Disponibile per ${p.youthSquadDesignation || 'Giovanili'} (${p.youthMatchMinutes || 'Fino a 90 min'})`}
                                >
                                  <GraduationCap className="w-3 h-3 text-teal-400" /> DISP. GIOVANILI {p.youthSquadDesignation ? `(${p.youthSquadDesignation})` : ''}
                                </span>
                              )}
                              {isInjured && (
                                <span className="text-[9px] bg-rose-500/20 text-rose-300 font-bold px-1.5 py-0.5 rounded border border-rose-500/40 flex items-center gap-1 shrink-0">
                                  🚑 INFORTUNATO
                                </span>
                              )}
                              {isOnLoan && (
                                <span className="text-[9px] bg-blue-500/20 text-blue-300 font-bold px-1.5 py-0.5 rounded border border-blue-500/40 flex items-center gap-1 shrink-0">
                                  ✈️ PRESTITO {p.loanClub ? `(${p.loanClub})` : ''}
                                </span>
                              )}
                              {p.isKeyPlayer && !isInjured && !isOnLoan && (
                                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded border border-amber-500/30 shrink-0 font-bold">
                                  Titolare
                                </span>
                              )}
                              {p.notes && isCopilotNote(p.notes) && (
                                <span
                                  title={`Nota Copilot: ${p.notes}`}
                                  className="text-[9px] bg-cyan-500/20 text-cyan-300 font-bold px-1.5 py-0.5 rounded border border-cyan-500/40 flex items-center gap-1 shrink-0 cursor-help"
                                >
                                  <Bot className="w-2.5 h-2.5 text-cyan-400" />
                                  COPILOT
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5 whitespace-nowrap overflow-x-auto name-scrollbar">
                            <span>{getEffectiveAge(p, currentDate)} anni • {p.nationality}</span>
                            {p.ca && (
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-emerald-400 font-mono bg-emerald-500/10 px-1 rounded border border-emerald-500/20">
                                  CA: {p.ca} / PA: {p.pa}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Position & Best Roles */}
                    <td className="py-3 px-4">
                      <div>
                        <span
                          className={`font-semibold px-2 py-0.5 rounded border inline-block mb-1 ${
                            isInjured
                              ? 'text-rose-300 bg-rose-950/60 border-rose-800/80'
                              : isOnLoan
                              ? 'text-blue-300 bg-blue-950/60 border-blue-800/80'
                              : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                          }`}
                        >
                          {p.position}
                        </span>
                        <div className="text-[10px] text-slate-400 truncate max-w-[160px]">
                          {p.bestRoles.join(', ')}
                        </div>
                      </div>
                    </td>

                    {/* Availability / Status (Available / Injured / On Loan) */}
                    <td className="py-3 px-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          {isInjured ? (
                            <button
                              type="button"
                              onClick={() => handleSetAvailable(p.id)}
                              className="px-2 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border cursor-pointer bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30"
                              title="Infortunato. Clicca per renderlo Disponibile"
                            >
                              <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                              <span>Infortunato</span>
                            </button>
                          ) : isOnLoan ? (
                            <button
                              type="button"
                              onClick={() => handleSetAvailable(p.id)}
                              className="px-2 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border cursor-pointer bg-blue-500/20 text-blue-300 border-blue-500/40 hover:bg-blue-500/30"
                              title={`In prestito ${p.loanClub ? `al ${p.loanClub}` : ''}. Clicca per farlo rientrare come Disponibile`}
                            >
                              <Plane className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              <span>In Prestito</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleOpenInjuryModal(p)}
                              className="px-2 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border cursor-pointer bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                              title="Arruolabile. Clicca per attivare il flag infortunato e inserire la durata"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span>Disponibile</span>
                            </button>
                          )}

                          {/* Quick action popup or switch to loan */}
                          {!isOnLoan && !isInjured && (
                            <button
                              type="button"
                              onClick={() => handleToggleLoaned(p.id)}
                              className="p-1 rounded-lg text-slate-500 hover:text-blue-300 hover:bg-slate-800 transition-colors"
                              title="Segna giocatore come ceduto in prestito"
                            >
                              <Plane className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {isInjured && (
                          <div
                            onClick={() => handleOpenInjuryModal(p)}
                            className="text-[10px] text-rose-300 bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800/50 px-2 py-0.5 rounded-lg flex items-center gap-1 cursor-pointer transition-colors max-w-[170px]"
                            title="Clicca per modificare l'entità temporale o le note dell'infortunio"
                          >
                            <Clock className="w-3 h-3 text-rose-400 shrink-0" />
                            <span className="truncate italic">{p.injuryNote || 'Inserisci durata...'}</span>
                            <Edit2 className="w-2.5 h-2.5 text-rose-400/80 shrink-0 ml-auto" />
                          </div>
                        )}
                        {isOnLoan && p.loanClub && (
                          <div className="text-[10px] text-blue-400/90 truncate max-w-[150px]" title={`In prestito al ${p.loanClub}`}>
                            Presso: {p.loanClub}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Morale */}
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border ${getMoraleColor(p.morale)}`}>
                        {p.morale}
                      </span>
                    </td>

                    {/* Match Load */}
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${getLoadBadge(p.matchLoad)}`}>
                        {p.matchLoad}
                      </span>
                    </td>

                    {/* Homegrown */}
                    <td className="py-3 px-4 text-slate-400 text-[11px]">
                      <span className={p.homegrown.includes('HG Club') ? 'text-emerald-400 font-medium' : p.homegrown.includes('HG Nazione') ? 'text-indigo-300' : 'text-slate-400'}>
                        {p.homegrown}
                      </span>
                    </td>

                    {/* Champions League Registered */}
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => {
                          const updated = players.map(pl => pl.id === p.id ? { ...pl, championsLeagueRegistered: !pl.championsLeagueRegistered } : pl);
                          onUpdatePlayers(updated);
                        }}
                        className={`p-1 rounded-lg transition-colors ${
                          p.championsLeagueRegistered
                            ? 'text-emerald-400 hover:text-emerald-300'
                            : 'text-slate-600 hover:text-slate-400'
                        }`}
                        title="Attiva/Disattiva Registrazione Champions League"
                      >
                        <CheckCircle2 className="w-5 h-5 mx-auto" />
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right sticky right-0 z-10 w-[195px] min-w-[195px] transition-colors bg-slate-900 group-hover:bg-slate-800 shadow-[-12px_0_15px_-3px_rgba(0,0,0,0.7)]">
                      <div className="flex items-center justify-end space-x-1.5 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleAvailableForYouth(p.id)}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer border ${
                            p.availableForYouth
                              ? 'bg-teal-950/80 text-teal-300 border-teal-500/60 hover:bg-teal-900/80 shadow-sm'
                              : 'text-slate-500 border-transparent hover:text-teal-300 hover:bg-slate-800'
                          }`}
                          title={
                            p.availableForYouth
                              ? `Disponibile per ${p.youthSquadDesignation || 'Giovanili'} (${p.youthMatchMinutes || 'Fino a 90 min'}). Si allena con la rosa titolare. Clicca per disattivare flag.`
                              : "Contrassegna come Disponibile per le Giovanili (Si allena con la 1ª squadra ma gioca nelle giovanili)"
                          }
                        >
                          <GraduationCap className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTogglePlayerStaff(p.id)}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer border ${
                            p.isPlayerStaff
                              ? 'bg-purple-950/80 text-purple-300 border-purple-500/60 hover:bg-purple-900/80 shadow-sm'
                              : 'text-slate-500 border-transparent hover:text-purple-300 hover:bg-slate-800'
                          }`}
                          title={p.isPlayerStaff ? `Giocatore/Staff attivo (${p.staffRole || 'Collaboratore Tecnico'}). Clicca per rimuovere` : "Contrassegna come Giocatore/Staff (Investimento quadri tecnici società)"}
                        >
                          <Briefcase className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setComparisonPlayerAId(p.id);
                            const competitor = players.find(other => other.id !== p.id && other.position === p.position) || players.find(other => other.id !== p.id);
                            setComparisonPlayerBId(competitor?.id);
                            setIsComparisonModalOpen(true);
                          }}
                          className="p-1.5 text-sky-400 hover:text-sky-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title={`Confronta ${p.name} con un altro giocatore (Spider Radar Chart)`}
                        >
                          <Sliders className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedPlayerForDetails(p)}
                          className="p-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="Vedi Scheda Attributi FM Completa"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingPlayer(p)}
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="Modifica Dati Giocatore"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenDemoteModal(p)}
                          className="p-1.5 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg transition-colors cursor-pointer"
                          title="Rimanda / Sposta questo giocatore nelle rose giovanili"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePlayer(p.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                          title="Elimina / Cedi Giocatore dalla Rosa"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit / Create Player Modal */}
      {editingPlayer && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-hidden animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            {/* Header fisso in alto */}
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-950/60">
              <div className="min-w-0 pr-2">
                <h3 className="text-base font-bold text-white truncate">
                  {isCreating ? `Aggiungi Nuovo Giocatore a ${teamName}` : `Modifica: ${editingPlayer.name}`}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {isCreating
                    ? "Inserisci i dati anagrafici, atletici e contrattuali per aggiungere il calciatore alla rosa"
                    : "Aggiorna dati, ruoli, disponibilità giovanili, infortuni/prestiti e note del manager"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingPlayer(null);
                  setIsCreating(false);
                }}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                title="Chiudi finestra"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Corpo scorrevole con tutti i campi e note */}
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Nome e Cognome</label>
                <input
                  type="text"
                  value={editingPlayer.name}
                  onChange={(e) => setEditingPlayer({ ...editingPlayer, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Numero Maglia</label>
                <input
                  type="number"
                  value={editingPlayer.number}
                  onChange={(e) => setEditingPlayer({ ...editingPlayer, number: parseInt(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Età (Anni)</label>
                <input
                  type="number"
                  min={14}
                  max={45}
                  value={editingPlayer.age || 22}
                  onChange={(e) => {
                    const newAge = parseInt(e.target.value, 10) || 22;
                    const cYear = extractCurrentYear(currentDate);
                    setEditingPlayer({
                      ...editingPlayer,
                      age: newAge,
                      birthYear: cYear - newAge
                    });
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Ruolo Principale (es. DC, TS, CC, PC)</label>
                <input
                  type="text"
                  value={editingPlayer.position}
                  onChange={(e) => setEditingPlayer({ ...editingPlayer, position: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Nazionalità</label>
                <input
                  type="text"
                  value={editingPlayer.nationality}
                  onChange={(e) => setEditingPlayer({ ...editingPlayer, nationality: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Morale Spogliatoio</label>
                <select
                  value={editingPlayer.morale}
                  onChange={(e) => setEditingPlayer({ ...editingPlayer, morale: e.target.value as MoraleLevel })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                >
                  <option value="Superbo">Superbo</option>
                  <option value="Eccellente">Eccellente</option>
                  <option value="Buono">Buono</option>
                  <option value="Neutro">Neutro</option>
                  <option value="Inquieto">Inquieto</option>
                </select>
              </div>

              <div className="col-span-2">
                <label className="text-slate-400 block mb-1">Status Homegrown (HG)</label>
                <select
                  value={editingPlayer.homegrown}
                  onChange={(e) => setEditingPlayer({ ...editingPlayer, homegrown: e.target.value as HomegrownStatus })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                >
                  <option value="HG Club (3 anni in club)">HG Club (3 anni in club)</option>
                  <option value="HG Nazione (3 anni in UK)">HG Nazione (3 anni in UK)</option>
                  <option value="Straniero / Non-HG">Straniero / Non-HG</option>
                </select>
              </div>

              {/* Infortunio / Indisponibilità */}
              <div className="col-span-2 bg-slate-950 p-3.5 rounded-xl border border-rose-900/40 space-y-2.5">
                <label className="flex items-center space-x-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={Boolean(editingPlayer.isInjured)}
                    onChange={(e) => {
                      const isInjured = e.target.checked;
                      setEditingPlayer({
                        ...editingPlayer,
                        isInjured,
                        isOnLoan: isInjured ? false : editingPlayer.isOnLoan,
                        injuryNote: isInjured ? (editingPlayer.injuryNote || '') : undefined
                      });
                    }}
                    className="w-4 h-4 rounded text-rose-600 bg-slate-900 border-slate-700 focus:ring-rose-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-400" /> Flag Infortunato / Indisponibile (Escluso da formazioni e Copilot AI)
                  </span>
                </label>

                {/* Casella note che si apre sotto quando il flag è attivato */}
                {editingPlayer.isInjured && (
                  <div className="pt-2 border-t border-rose-900/40 space-y-2 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <label className="text-rose-300 font-semibold block text-xs flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-rose-400" />
                        <span>Entità temporale dell'infortunio / Tempi di recupero:</span>
                      </label>
                      <span className="text-[10px] text-slate-400 italic">Es. 2 settimane, 1 mese</span>
                    </div>

                    <input
                      type="text"
                      value={editingPlayer.injuryNote || ''}
                      onChange={(e) => setEditingPlayer({ ...editingPlayer, injuryNote: e.target.value })}
                      placeholder="Scrivi l'entità temporale (es. 2-3 settimane, 1 mese, fino a fine mese...)"
                      className="w-full bg-slate-900 border border-rose-500/40 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400/30"
                      autoFocus
                    />

                    {/* Scelta rapida durata */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      <span className="text-[10px] text-slate-400">Scelta rapida:</span>
                      {[
                        'Pochi giorni (1-3 gg)',
                        '1-2 settimane',
                        '3-4 settimane',
                        '1-2 mesi',
                        '3+ mesi',
                        'Fine stagione'
                      ].map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => setEditingPlayer({ ...editingPlayer, injuryNote: chip })}
                          className={`text-[10px] px-2 py-0.5 rounded-lg border transition-colors cursor-pointer ${
                            editingPlayer.injuryNote === chip
                              ? 'bg-rose-500/30 text-rose-200 border-rose-400 font-semibold'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                          }`}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Prestito / In Prestito */}
              <div className="col-span-2 bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2">
                <label className="flex items-center space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editingPlayer.isOnLoan)}
                    onChange={(e) => {
                      const isOnLoan = e.target.checked;
                      setEditingPlayer({
                        ...editingPlayer,
                        isOnLoan,
                        isInjured: isOnLoan ? false : editingPlayer.isInjured
                      });
                    }}
                    className="w-4 h-4 rounded text-sky-600 bg-slate-900 border-slate-700 focus:ring-sky-500"
                  />
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Plane className="w-4 h-4 text-sky-400" /> Giocatore in Prestito ad altro club (Escluso da rotazioni e formazioni)
                  </span>
                </label>
                <p className="text-[11px] text-slate-400 pl-6.5">
                  Flag ufficiale per l'AI Copilot: identifica inequivocabilmente i calciatori attualmente ceduti in prestito, prevenendo errori da vecchie note non aggiornate.
                </p>
                {!editingPlayer.isOnLoan && editingPlayer.notes && /\b(prestit|ceduto in prestito|loan)\b/i.test(editingPlayer.notes) && (
                  <div className="ml-6.5 bg-amber-950/30 border border-amber-500/30 rounded-lg p-2 text-[11px] text-amber-200 flex items-center justify-between gap-2">
                    <span>💡 Nota testuale cita un prestito: se il calciatore è ancora in prestito, spunta la casella. Se è rientrato, lasciala disattivata e il Copilot lo considererà in rosa.</span>
                    <button
                      type="button"
                      onClick={() => setEditingPlayer({ ...editingPlayer, isOnLoan: true, isInjured: false })}
                      className="underline text-amber-300 hover:text-white font-semibold cursor-pointer shrink-0"
                    >
                      Attiva Flag
                    </button>
                  </div>
                )}
                {editingPlayer.isOnLoan && (
                  <div className="pt-1 pl-6.5">
                    <label className="text-slate-400 block mb-1 text-[11px]">Club di Destinazione / Prestito (Opzionale, es. Girona, Parma, Leeds)</label>
                    <input
                      type="text"
                      value={editingPlayer.loanClub || ''}
                      onChange={(e) => setEditingPlayer({ ...editingPlayer, loanClub: e.target.value })}
                      placeholder="Es. Girona, Betis Siviglia, Reggiana..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>
                )}
              </div>

              {/* Giocatore / Staff (Quadri Tecnici Societari) */}
              <div className="col-span-2 bg-purple-950/20 p-3.5 rounded-xl border border-purple-900/50 space-y-2">
                <label className="flex items-center space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editingPlayer.isPlayerStaff)}
                    onChange={(e) => {
                      const isPlayerStaff = e.target.checked;
                      setEditingPlayer({
                        ...editingPlayer,
                        isPlayerStaff,
                        staffRole: isPlayerStaff ? (editingPlayer.staffRole || 'Collaboratore Tecnico') : undefined
                      });
                    }}
                    className="w-4 h-4 rounded text-purple-600 bg-slate-900 border-slate-700 focus:ring-purple-500"
                  />
                  <span className="text-xs font-bold text-purple-200 flex items-center gap-1.5">
                    <Briefcase className="w-4 h-4 text-purple-400" /> Contrassegna come Giocatore / Staff (Investimento Quadri Tecnici)
                  </span>
                </label>
                <p className="text-[11px] text-slate-400 leading-relaxed pl-6.5">
                  Protegge il giocatore (es. veterano, capitano storico o figura di riferimento) nelle analisi della rosa: l'AI Copilot riconoscerà che fa parte dei piani della società come collaboratore tecnico e <strong>non lo considererà un esubero</strong> né proporrà la sua cessione per motivi di età.
                </p>
                {editingPlayer.isPlayerStaff && (
                  <div className="pt-1 pl-6.5">
                    <label className="text-purple-300 block mb-1 text-[11px] font-semibold">Mansione / Ruolo previsto nello Staff</label>
                    <input
                      type="text"
                      value={editingPlayer.staffRole || ''}
                      onChange={(e) => setEditingPlayer({ ...editingPlayer, staffRole: e.target.value })}
                      placeholder="Es. Collaboratore Tecnico, Mentore Giovanili, Preparatore Portieri..."
                      className="w-full bg-slate-900 border border-purple-800/60 rounded-lg px-2.5 py-1.5 text-xs text-purple-100 placeholder-purple-400/40 focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Disponibilità per Squadre Giovanili (Allenamento Prima Squadra + Partite Giovanili) */}
              <div className="col-span-2 bg-teal-950/20 p-3.5 rounded-xl border border-teal-900/50 space-y-2.5">
                <label className="flex items-center space-x-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(editingPlayer.availableForYouth)}
                    onChange={(e) => {
                      const availableForYouth = e.target.checked;
                      const playerAge = getEffectiveAge(editingPlayer, currentDate);
                      const defaultSquad = playerAge <= 18 ? 'Under 18' : 'Under 21';
                      setEditingPlayer({
                        ...editingPlayer,
                        availableForYouth,
                        youthSquadDesignation: availableForYouth
                          ? (editingPlayer.youthSquadDesignation || defaultSquad)
                          : undefined,
                        youthMatchMinutes: availableForYouth
                          ? (editingPlayer.youthMatchMinutes || 'Fino a 90 min')
                          : undefined
                      });
                    }}
                    className="w-4 h-4 rounded text-teal-600 bg-slate-900 border-slate-700 focus:ring-teal-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-teal-200 flex items-center gap-1.5">
                    <GraduationCap className="w-4 h-4 text-teal-400" /> Disponibile per le Squadre Giovanili (Si allena con la Prima Squadra)
                  </span>
                </label>
                <p className="text-[11px] text-slate-400 leading-relaxed pl-6.5">
                  Il giocatore fa parte stabilmente della rosa titolare e <strong>si allena a tempo pieno con la prima squadra</strong>, ma è autorizzato e disponibile a disputare le partite con le formazioni giovanili (es. Under 21 o Under 18) per accumulare minutaggio ed esperienza gara.
                </p>
                {editingPlayer.availableForYouth && (
                  <div className="pt-1.5 pl-6.5 grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in fade-in duration-150">
                    <div>
                      <label className="text-teal-300 block mb-1 text-[11px] font-semibold">Squadra Giovanile / Categoria Designata</label>
                      <select
                        value={editingPlayer.youthSquadDesignation || (getEffectiveAge(editingPlayer, currentDate) <= 18 ? 'Under 18' : 'Under 21')}
                        onChange={(e) => setEditingPlayer({ ...editingPlayer, youthSquadDesignation: e.target.value })}
                        className="w-full bg-slate-900 border border-teal-800/60 rounded-lg px-2.5 py-1.5 text-xs text-teal-100 focus:border-teal-500 focus:outline-none"
                      >
                        <option value="Under 21">Under 21 (U21)</option>
                        <option value="Under 18">Under 18 (U18)</option>
                        <option value="Squadra Riserve / B">Squadra Riserve / B</option>
                        {youthSquads?.map(sq => (
                          <option key={sq.id} value={sq.name}>{sq.name} ({sq.category || 'Giovanile'})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-teal-300 block mb-1 text-[11px] font-semibold">Minutaggio Massimo Partita</label>
                      <select
                        value={editingPlayer.youthMatchMinutes || 'Fino a 90 min'}
                        onChange={(e) => setEditingPlayer({ ...editingPlayer, youthMatchMinutes: e.target.value })}
                        className="w-full bg-slate-900 border border-teal-800/60 rounded-lg px-2.5 py-1.5 text-xs text-teal-100 focus:border-teal-500 focus:outline-none"
                      >
                        <option value="Fino a 90 min">Fino a 90 min (Partita intera)</option>
                        <option value="Fino a 60 min">Fino a 60 min (Un'ora di gioco)</option>
                        <option value="Fino a 45 min">Fino a 45 min (Un tempo)</option>
                        <option value="Fino a 30 min">Fino a 30 min (Spezzone finale)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-slate-400 block text-xs">Note & Appunti del Manager</label>
                <div className="flex items-center gap-2">
                  {editingPlayer.notes && isCopilotNote(editingPlayer.notes) && (
                    <span className="text-[10px] text-cyan-400 bg-cyan-950/60 border border-cyan-500/40 px-1.5 py-0.5 rounded flex items-center gap-1 font-semibold">
                      <Bot className="w-2.5 h-2.5" />
                      Nota con Copilot
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const tag = `[Copilot AI${currentDate ? ` • ${currentDate}` : ''}]: `;
                      const current = editingPlayer.notes || '';
                      setEditingPlayer({
                        ...editingPlayer,
                        notes: current ? `${current.trim()}\n\n${tag}` : tag
                      });
                    }}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-500/30 px-2 py-0.5 rounded flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    + Tag [Copilot AI]
                  </button>
                </div>
              </div>
              <textarea
                value={editingPlayer.notes || ''}
                onChange={(e) => setEditingPlayer({ ...editingPlayer, notes: e.target.value })}
                rows={3}
                placeholder="es. [Copilot AI • 28 Ottobre 2026]: Strategia concordata... oppure note su prestiti, rendimento o contratto"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white leading-relaxed"
              />
            </div>

            </div>

            {/* Footer fisso in basso con pulsanti sempre visibili */}
            <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/80 shrink-0 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5">
              {!isCreating ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const p = editingPlayer;
                      setEditingPlayer(null);
                      handleOpenDemoteModal(p);
                    }}
                    className="px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                    title="Rimanda questo giocatore in una rosa giovanile"
                  >
                    <ArrowDown className="w-3.5 h-3.5" /> Rimanda alle Giovanili
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleDeletePlayer(editingPlayer.id);
                    }}
                    className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                    title="Elimina o cedi questo giocatore dalla rosa"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Elimina Giocatore
                  </button>
                </div>
              ) : (
                <div />
              )}
              <div className="flex items-center space-x-2 shrink-0 ml-auto">
                <button
                  type="button"
                  onClick={() => {
                    setEditingPlayer(null);
                    setIsCreating(false);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer transition-colors"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={() => handleSavePlayer(editingPlayer)}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-950/50 cursor-pointer transition-colors"
                >
                  Salva Giocatore
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Clearing Entire Squad */}
      <ConfirmDialogModal
        isOpen={isClearSquadConfirmOpen}
        title="Svuotare completamente la rosa?"
        message="Sei sicuro di voler svuotare la rosa attuale? Tutti i giocatori verranno rimossi e potrai caricare immediatamente la tua rosa personalizzata da file CSV."
        confirmLabel="Svuota Rosa Ora"
        cancelLabel="Annulla"
        isDangerous={true}
        onConfirm={confirmClearSquad}
        onCancel={() => setIsClearSquadConfirmOpen(false)}
      />

      {/* Confirmation Modal for Deleting Single Player */}
      <ConfirmDialogModal
        isOpen={playerToDelete !== null}
        title="Eliminare Giocatore dalla Rosa?"
        message={
          playerToDelete
            ? `Sei sicuro di voler rimuovere definitivamente "${playerToDelete.name}" dalla rosa di ${teamName}? Questa operazione è utile in caso di cessione, rescissione, fine prestito o ritiro.`
            : ''
        }
        confirmLabel="Elimina dalla Rosa"
        cancelLabel="Annulla"
        isDangerous={true}
        onConfirm={confirmDeleteSinglePlayer}
        onCancel={() => setPlayerToDelete(null)}
      />

      {/* FM Detailed Attributes Modal */}
      <PlayerAttributesModal
        player={selectedPlayerForDetails}
        onClose={() => setSelectedPlayerForDetails(null)}
        currentDate={currentDate}
        onDeletePlayer={(pl) => handleDeletePlayer(pl.id)}
        onDemoteToYouth={(pl) => handleOpenDemoteModal(pl)}
        onAskCopilot={onAskCopilot}
        onUpdatePlayer={(updated) => {
          onUpdatePlayers(players.map(p => p.id === updated.id ? updated : p));
          setSelectedPlayerForDetails(updated);
        }}
      />

      {/* Demote Player to Youth Squad Modal */}
      {playerToDemote && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <ArrowDown className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Rimanda nelle Rose Giovanili</h3>
                  <p className="text-xs text-slate-400">
                    Sposta il giocatore dalla prima squadra al vivaio giovanile
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPlayerToDemote(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 overflow-y-auto">
              {/* Player Card Summary */}
              <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-emerald-400 text-sm">
                    {playerToDemote.number ? `#${playerToDemote.number}` : 'N/D'}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      {playerToDemote.name}
                      <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                        {playerToDemote.position}
                      </span>
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Età: <strong className="text-slate-200">{getEffectiveAge(playerToDemote, currentDate)} anni</strong>
                      {playerToDemote.ca && <> • CA: <strong className="text-amber-300">{playerToDemote.ca}</strong></>}
                      {playerToDemote.pa && <> • PA: <strong className="text-emerald-400">{playerToDemote.pa}</strong></>}
                    </p>
                  </div>
                </div>
              </div>

              {/* Destination Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Seleziona Rosa Giovanile di Destinazione:
                </label>
                {youthSquads && youthSquads.length > 0 ? (
                  <div className="space-y-2">
                    {youthSquads.map((sq) => {
                      const isSelected = sq.id === selectedYouthSquadId;
                      const age = getEffectiveAge(playerToDemote, currentDate);
                      const isOverAge = (sq.category === 'U18' && age > 18) || ((sq.category === 'U20' || sq.category === 'U21') && age > 21);

                      return (
                        <div
                          key={sq.id}
                          onClick={() => setSelectedYouthSquadId(sq.id)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? 'bg-amber-500/10 border-amber-500/40 shadow-sm'
                              : 'bg-slate-950 border-slate-800/80 hover:border-slate-700 hover:bg-slate-800/40'
                          }`}
                        >
                          <div className="flex items-center space-x-3">
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                isSelected ? 'border-amber-400 bg-amber-400' : 'border-slate-600'
                              }`}
                            >
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
                            </div>
                            <div>
                              <div className="text-xs font-bold text-white flex items-center gap-2">
                                <span>{sq.name}</span>
                                {sq.category && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">
                                    {sq.category}
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-400">
                                {sq.players.length} giocatori attualmente in rosa
                              </span>
                            </div>
                          </div>

                          {isOverAge && (
                            <span className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg">
                              Fuori quota ({age} anni)
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-400 space-y-1">
                    <p className="text-slate-200 font-medium">Nessuna rosa giovanile presente</p>
                    <p>Confermando, verrà creata automaticamente la squadra giovanile Under 21.</p>
                  </div>
                )}
              </div>

              <div className="bg-slate-950/70 border border-slate-800/60 rounded-xl p-3 text-xs text-slate-400 leading-relaxed">
                ℹ️ Il giocatore verrà tolto dall'elenco della prima squadra e aggiunto alla rosa giovanile scelta. Potrai sempre promuoverlo di nuovo in prima squadra in qualsiasi momento dalla scheda <strong>Giovanili</strong>.
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-end space-x-3">
              <button
                type="button"
                onClick={() => setPlayerToDemote(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition-colors cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleConfirmDemote}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow-lg transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowDown className="w-4 h-4" />
                <span>Conferma Trasferimento</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Injury Modal */}
      {injuryModalPlayer && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-900/50 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-500/10 rounded-xl border border-rose-500/30">
                  <AlertCircle className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Gestione Infortunio</h3>
                  <p className="text-xs text-slate-400">{injuryModalPlayer.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInjuryModalPlayer(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {/* Flag Infortunato */}
              <div className="p-3.5 bg-slate-950 rounded-xl border border-rose-900/40 space-y-3">
                <label className="flex items-center space-x-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={injuryModalPlayer.isInjured}
                    onChange={(e) => setInjuryModalPlayer({ ...injuryModalPlayer, isInjured: e.target.checked })}
                    className="w-4 h-4 rounded text-rose-600 bg-slate-900 border-slate-700 focus:ring-rose-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-400" /> Flag Infortunato / Indisponibile
                  </span>
                </label>

                {/* Casella note sotto il flag */}
                {injuryModalPlayer.isInjured ? (
                  <div className="pt-2.5 border-t border-rose-900/40 space-y-2 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <label className="text-rose-300 font-semibold block text-xs flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-rose-400" />
                        <span>Entità temporale dell'infortunio / Tempi di recupero:</span>
                      </label>
                      <span className="text-[10px] text-slate-400 italic">Es. 2 settimane, 1 mese</span>
                    </div>

                    <input
                      type="text"
                      value={injuryModalPlayer.injuryNote}
                      onChange={(e) => setInjuryModalPlayer({ ...injuryModalPlayer, injuryNote: e.target.value })}
                      placeholder="Scrivi l'entità temporale (es. 2-3 settimane, 1 mese, fino a fine mese...)"
                      className="w-full bg-slate-900 border border-rose-500/40 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400/30"
                      autoFocus
                    />

                    {/* Scelta rapida durata */}
                    <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                      <span className="text-[10px] text-slate-400">Scelta rapida:</span>
                      {[
                        'Pochi giorni (1-3 gg)',
                        '1-2 settimane',
                        '3-4 settimane',
                        '1-2 mesi',
                        '3+ mesi',
                        'Fine stagione'
                      ].map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={() => setInjuryModalPlayer({ ...injuryModalPlayer, injuryNote: chip })}
                          className={`text-[10px] px-2 py-0.5 rounded-lg border transition-colors cursor-pointer ${
                            injuryModalPlayer.injuryNote === chip
                              ? 'bg-rose-500/30 text-rose-200 border-rose-400 font-semibold'
                              : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                          }`}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic pt-1">
                    Deselezionando il flag, il giocatore tornerà subito Disponibile e Arruolabile.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setInjuryModalPlayer(null)}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleSaveQuickInjury}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-rose-950/50 flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Salva Infortunio</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Player Side-by-Side Spider Radar Comparison Modal */}
      {isComparisonModalOpen && (
        <PlayerComparisonModal
          isOpen={isComparisonModalOpen}
          onClose={() => setIsComparisonModalOpen(false)}
          players={players}
          youthSquads={youthSquads}
          initialPlayerAId={comparisonPlayerAId}
          initialPlayerBId={comparisonPlayerBId}
          currentDate={currentDate}
          onAskCopilot={onAskCopilot}
          onSelectPlayerForDetails={(p) => {
            setIsComparisonModalOpen(false);
            setSelectedPlayerForDetails(p);
          }}
        />
      )}

      {/* Success Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md bg-emerald-950/95 border border-emerald-500/50 rounded-2xl p-4 shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 text-emerald-200 animate-in fade-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="text-xs font-semibold text-white">{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-emerald-400 hover:text-white p-1 rounded-lg hover:bg-emerald-900/50 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};
