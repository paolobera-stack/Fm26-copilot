import React, { useState, useMemo } from 'react';
import { Player, YouthSquad, MoraleLevel, MatchLoadLevel, HomegrownStatus } from '../types';
import { ConfirmDialogModal } from './ConfirmDialogModal';
import { PlayerAttributesModal } from './PlayerAttributesModal';
import { ProspectBadge, getProspectTag } from './ProspectBadge';
import { PlayerVariationBadge } from './PlayerVariationBadge';
import { getEffectiveAge, extractCurrentYear } from '../utils/csvParser';
import { matchesSearch } from '../utils/textUtils';
import { isCopilotNote } from '../utils/copilotNoteProposals';
import { findSquadDuplicates } from '../utils/squadDuplicateUtils';
import { SquadDuplicateBadge } from './SquadDuplicateBadge';
import { useLanguage } from '../i18n/LanguageContext';
import {
  GraduationCap,
  Users,
  Plus,
  Edit2,
  Trash2,
  Sparkles,
  Award,
  FileSpreadsheet,
  Eye,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Trophy,
  Shield,
  Star,
  Search,
  CheckCircle2,
  RefreshCw,
  FolderPlus,
  HelpCircle,
  Plane,
  AlertCircle,
  AlertTriangle,
  HeartPulse,
  Filter,
  ArrowUpAZ,
  ArrowDownAZ,
  Clock,
  Check,
  X,
  Bot,
  Zap
} from 'lucide-react';

export type YouthSortField = 'index' | 'name' | 'position' | 'ca' | 'pa' | 'age' | 'number';
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

interface YouthSquadManagerProps {
  youthSquads: YouthSquad[];
  firstTeamPlayers?: Player[];
  onUpdateYouthSquads: (squads: YouthSquad[]) => void;
  onPromoteToFirstTeam: (player: Player, fromSquadId: string) => void;
  onOpenCsvModal?: (type: 'squad' | 'scouting' | string) => void;
  currentDate?: string;
  teamName?: string;
  onAskCopilot?: (prompt: string) => void;
  onOpenDuplicatesModal?: (playerName?: string) => void;
}

export const YouthSquadManager: React.FC<YouthSquadManagerProps> = ({
  youthSquads,
  firstTeamPlayers = [],
  onUpdateYouthSquads,
  onPromoteToFirstTeam,
  onOpenCsvModal,
  currentDate = '28 Ottobre 2026',
  teamName = 'La Tua Squadra FC',
  onAskCopilot,
  onOpenDuplicatesModal,
}) => {
  const { language, t } = useLanguage();
  const [selectedSquadId, setSelectedSquadId] = useState<string>(() => {
    return youthSquads.length > 0 ? youthSquads[0].id : '';
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [posFilter, setPosFilter] = useState<string>('Tutti');
  const [tagFilter, setTagFilter] = useState<'all' | 'wonderkid' | 'top_prospect' | 'top_talent'>('all');
  const [injuredOnly, setInjuredOnly] = useState(false);
  const [loanedOnly, setLoanedOnly] = useState(false);
  const [sortField, setSortField] = useState<YouthSortField>('pa');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Modals state
  const [inspectingPlayer, setInspectingPlayer] = useState<Player | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [isCreatingPlayer, setIsCreatingPlayer] = useState(false);
  const [playerToDelete, setPlayerToDelete] = useState<{ id: string; name: string } | null>(null);
  const [injuryModalPlayer, setInjuryModalPlayer] = useState<{ id: string; name: string; isInjured: boolean; injuryNote: string } | null>(null);

  // Squad management modals
  const [isCreatingSquadOpen, setIsCreatingSquadOpen] = useState(false);
  const [newSquadName, setNewSquadName] = useState('');
  const [newSquadCategory, setNewSquadCategory] = useState('U20');

  const [isRenamingSquadOpen, setIsRenamingSquadOpen] = useState(false);
  const [renameSquadName, setRenameSquadName] = useState('');

  const [squadToDelete, setSquadToDelete] = useState<YouthSquad | null>(null);
  const [isClearSquadConfirmOpen, setIsClearSquadConfirmOpen] = useState(false);

  // Move player modal
  const [movingPlayer, setMovingPlayer] = useState<{ player: Player; targetSquadId: string } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Active squad fallback
  const activeSquad = youthSquads.find((s) => s.id === selectedSquadId) || youthSquads[0] || null;
  const activeSquadId = activeSquad?.id || '';

  // Calcolo doppioni tra rose giovanili e prima squadra
  const duplicatesReport = useMemo(() => {
    return findSquadDuplicates(firstTeamPlayers, youthSquads);
  }, [firstTeamPlayers, youthSquads]);

  // Check if active squad is U18 (or Allievi / U17)
  const isU18Squad = useMemo(() => {
    if (!activeSquad) return false;
    const cat = (activeSquad.category || '').toUpperCase();
    const nm = (activeSquad.name || '').toLowerCase();
    return (
      cat === 'U18' ||
      cat === 'U17' ||
      cat === 'U19' ||
      /u18|under\s*18|allievi|u17|under\s*17/i.test(nm)
    );
  }, [activeSquad]);

  const handleSort = (field: YouthSortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'name' || field === 'position' ? 'asc' : 'desc');
    }
  };

  const activePlayers = activeSquad ? activeSquad.players : [];

  // Filtered & Sorted players
  const filteredPlayers = activePlayers
    .filter((player) => {
      const term = searchTerm.trim();
      const matchesSearchFilter = !term ||
        matchesSearch(player.name, term) ||
        matchesSearch(player.position, term) ||
        (player.nationality ? matchesSearch(player.nationality, term) : false) ||
        (player.bestRoles ? player.bestRoles.some((r) => matchesSearch(r, term)) : false);

      let matchesPos = true;
      if (posFilter === 'POR') matchesPos = player.position.toUpperCase().includes('POR') || player.position.toUpperCase().includes('GK');
      else if (posFilter === 'DIF') matchesPos = /DC|TD|TS|DD|DS|CB|RB|LB/i.test(player.position);
      else if (posFilter === 'CEN') matchesPos = /CC|MED|M|MC|CM|DM|TRQ|AM/i.test(player.position);
      else if (posFilter === 'ATT') matchesPos = /PC|P|ATT|AD|AS|ST|CF|RW|LW|AMR|AML/i.test(player.position);

      const matchesInjured = injuredOnly ? Boolean(player.isInjured) : true;
      const matchesLoaned = loanedOnly ? Boolean(player.isOnLoan) : true;

      const effAge = getEffectiveAge(player, currentDate);
      let matchesTag = true;
      if (tagFilter === 'wonderkid') {
        matchesTag = effAge < 22 && (player.pa || 0) >= 170;
      } else if (tagFilter === 'top_prospect') {
        matchesTag = effAge < 22 && (player.pa || 0) >= 150 && (player.pa || 0) < 170;
      } else if (tagFilter === 'top_talent') {
        matchesTag = effAge < 22 && (player.pa || 0) >= 130 && (player.pa || 0) < 150;
      }

      return matchesSearchFilter && matchesPos && matchesInjured && matchesLoaned && matchesTag;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else if (sortField === 'position') {
        const prioA = getPositionPriority(a.position);
        const prioB = getPositionPriority(b.position);
        if (prioA !== prioB) cmp = prioA - prioB;
        else cmp = a.position.localeCompare(b.position);
      } else if (sortField === 'ca') {
        cmp = (b.ca || 0) - (a.ca || 0);
      } else if (sortField === 'pa') {
        cmp = (b.pa || 0) - (a.pa || 0);
      } else if (sortField === 'age') {
        cmp = getEffectiveAge(a, currentDate) - getEffectiveAge(b, currentDate);
      } else if (sortField === 'number') {
        cmp = a.number - b.number;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });

  // Squad updates
  const updateCurrentSquadPlayers = (newPlayers: Player[]) => {
    if (!activeSquad) return;
    const updatedSquads = youthSquads.map((s) =>
      s.id === activeSquad.id ? { ...s, players: newPlayers } : s
    );
    onUpdateYouthSquads(updatedSquads);
  };

  // Player status handlers
  const handleToggleInjured = (id: string) => {
    if (!activeSquad) return;
    const updated = activeSquad.players.map((p) => {
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
    updateCurrentSquadPlayers(updated);
  };

  const handleToggleLoaned = (id: string) => {
    if (!activeSquad) return;
    const updated = activeSquad.players.map((p) => {
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
    updateCurrentSquadPlayers(updated);
  };

  const handleSetAvailable = (id: string) => {
    if (!activeSquad) return;
    const updated = activeSquad.players.map((p) => {
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
    updateCurrentSquadPlayers(updated);
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
    if (!injuryModalPlayer || !activeSquad) return;
    const { id, isInjured, injuryNote } = injuryModalPlayer;
    const updated = activeSquad.players.map((p) => {
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
    updateCurrentSquadPlayers(updated);
    if (isInjured) {
      showToast(`🚑 Infortunio registrato per ${injuryModalPlayer.name}${injuryNote ? ` (${injuryNote})` : ''}`);
    } else {
      showToast(`✅ ${injuryModalPlayer.name} è tornato Arruolabile e Disponibile.`);
    }
    setInjuryModalPlayer(null);
  };

  // Player handlers
  const handleSavePlayer = (player: Player) => {
    if (!activeSquad) return;
    const currentYear = extractCurrentYear(currentDate);
    const updatedPlayer: Player = {
      ...player,
      age: Math.max(14, player.age || 18),
      birthYear: player.birthYear || currentYear - (player.age || 18)
    };

    let updatedList: Player[];
    if (activeSquad.players.some((p) => p.id === updatedPlayer.id)) {
      updatedList = activeSquad.players.map((p) => (p.id === updatedPlayer.id ? updatedPlayer : p));
    } else {
      updatedList = [...activeSquad.players, updatedPlayer];
    }
    updateCurrentSquadPlayers(updatedList);
    setEditingPlayer(null);
    setIsCreatingPlayer(false);
    showToast(`Giocatore ${updatedPlayer.name} salvato con successo nella rosa ${activeSquad.name}!`);
  };

  const handleDeletePlayer = (playerId: string) => {
    if (!activeSquad) return;
    const updatedList = activeSquad.players.filter((p) => p.id !== playerId);
    updateCurrentSquadPlayers(updatedList);
    setPlayerToDelete(null);
    if (editingPlayer?.id === playerId) setEditingPlayer(null);
    if (inspectingPlayer?.id === playerId) setInspectingPlayer(null);
    showToast('Giocatore rimosso dalla rosa giovanile.');
  };

  const handlePromotePlayer = (player: Player) => {
    if (!activeSquad) return;
    onPromoteToFirstTeam(player, activeSquad.id);
    // Remove from this youth squad
    const updatedList = activeSquad.players.filter((p) => p.id !== player.id);
    updateCurrentSquadPlayers(updatedList);
    showToast(`🌟 ${player.name} è stato promosso nella Prima Squadra!`);
  };

  const handlePromoteToU20 = (player: Player) => {
    if (!activeSquad) return;

    // Find target U20 squad or Primavera
    let targetU20 = youthSquads.find(
      (s) => s.id !== activeSquad.id && (s.category === 'U20' || /u20|under\s*20|primavera/i.test(s.name) || s.category === 'U21' || /u21|under\s*21/i.test(s.name))
    );

    let updatedSquads: YouthSquad[];

    if (targetU20) {
      updatedSquads = youthSquads.map((s) => {
        if (s.id === activeSquad.id) {
          return { ...s, players: s.players.filter((p) => p.id !== player.id) };
        }
        if (s.id === targetU20!.id) {
          const remaining = s.players.filter((p) => p.id !== player.id && p.name.toLowerCase() !== player.name.toLowerCase());
          return { ...s, players: [player, ...remaining] };
        }
        return s;
      });
    } else {
      // Create U20 squad automatically if not present
      targetU20 = {
        id: `ys_u20_${Date.now()}`,
        name: `${teamName} U20`,
        category: 'U20',
        notes: 'Squadra Under 20 / Primavera per la maturazione dei talenti promossi dall\'Under 18.',
        players: [player]
      };
      updatedSquads = [
        ...youthSquads.map((s) => (s.id === activeSquad.id ? { ...s, players: s.players.filter((p) => p.id !== player.id) } : s)),
        targetU20
      ];
    }

    onUpdateYouthSquads(updatedSquads);
    showToast(`🚀 ${player.name} è stato promosso nella rosa ${targetU20.name}!`);
  };

  const handleMovePlayerToSquad = () => {
    if (!movingPlayer || !activeSquad) return;
    const { player, targetSquadId } = movingPlayer;
    if (targetSquadId === activeSquad.id) {
      setMovingPlayer(null);
      return;
    }

    // Direct promotion to First Team
    if (targetSquadId === 'FIRST_TEAM') {
      handlePromotePlayer(player);
      setMovingPlayer(null);
      return;
    }

    const targetSquad = youthSquads.find((s) => s.id === targetSquadId);
    if (!targetSquad) return;

    const isU20Dest = targetSquad.category === 'U20' || /u20|under\s*20|primavera/i.test(targetSquad.name);
    const isPromotion = isU18Squad && isU20Dest;

    const updatedSquads = youthSquads.map((s) => {
      if (s.id === activeSquad.id) {
        return { ...s, players: s.players.filter((p) => p.id !== player.id) };
      }
      if (s.id === targetSquadId) {
        const remaining = s.players.filter((p) => p.id !== player.id && p.name.toLowerCase() !== player.name.toLowerCase());
        return { ...s, players: [player, ...remaining] };
      }
      return s;
    });

    onUpdateYouthSquads(updatedSquads);
    setMovingPlayer(null);
    if (isPromotion) {
      showToast(`🚀 ${player.name} è stato promosso nella rosa ${targetSquad.name}!`);
    } else {
      showToast(`Spostato ${player.name} in ${targetSquad.name}!`);
    }
  };

  // Squad management handlers
  const handleCreateSquad = () => {
    if (!newSquadName.trim()) return;
    const newSquad: YouthSquad = {
      id: `ys_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: newSquadName.trim(),
      category: newSquadCategory,
      notes: `Squadra ${newSquadCategory} per la crescita dei giovani talenti.`,
      players: []
    };
    const updated = [...youthSquads, newSquad];
    onUpdateYouthSquads(updated);
    setSelectedSquadId(newSquad.id);
    setIsCreatingSquadOpen(false);
    setNewSquadName('');
    showToast(`Creata nuova rosa giovanile: "${newSquad.name}"!`);
  };

  const handleRenameSquad = () => {
    if (!renameSquadName.trim() || !activeSquad) return;
    const updated = youthSquads.map((s) =>
      s.id === activeSquad.id ? { ...s, name: renameSquadName.trim() } : s
    );
    onUpdateYouthSquads(updated);
    setIsRenamingSquadOpen(false);
    showToast(`Rosa rinominata in "${renameSquadName.trim()}"!`);
  };

  const handleDeleteSquad = () => {
    if (!squadToDelete) return;
    if (youthSquads.length <= 1) {
      alert('Non puoi eliminare l\'unica rosa giovanile rimasta.');
      setSquadToDelete(null);
      return;
    }
    const updated = youthSquads.filter((s) => s.id !== squadToDelete.id);
    onUpdateYouthSquads(updated);
    setSelectedSquadId(updated[0].id);
    setSquadToDelete(null);
    showToast(`Rosa "${squadToDelete.name}" eliminata con successo.`);
  };

  const handleClearCurrentSquad = () => {
    if (!activeSquad) return;
    updateCurrentSquadPlayers([]);
    setIsClearSquadConfirmOpen(false);
    showToast(`Tutti i giocatori sono stati rimossi da ${activeSquad.name}.`);
  };

  // Quick stats for active youth squad
  const totalCount = activePlayers.length;
  const injuredCount = activePlayers.filter((p) => Boolean(p.isInjured)).length;
  const loanedCount = activePlayers.filter((p) => Boolean(p.isOnLoan)).length;
  const wonderkidCount = activePlayers.filter((p) => getEffectiveAge(p, currentDate) < 22 && (p.pa || 0) >= 170).length;
  const topProspectCount = activePlayers.filter((p) => getEffectiveAge(p, currentDate) < 22 && (p.pa || 0) >= 150 && (p.pa || 0) < 170).length;
  const topTalentCount = activePlayers.filter((p) => getEffectiveAge(p, currentDate) < 22 && (p.pa || 0) >= 130 && (p.pa || 0) < 150).length;
  const avgAge =
    totalCount > 0
      ? (
          activePlayers.reduce((acc, p) => acc + getEffectiveAge(p, currentDate), 0) /
          totalCount
        ).toFixed(1)
      : '0';
  const topTalent = [...activePlayers].sort((a, b) => (b.pa || 0) - (a.pa || 0))[0];
  const readyCount = activePlayers.filter((p) => (p.ca || 0) >= 130).length;

  const availableFirstTeamPlayers = (firstTeamPlayers || []).filter(
    (p) => Boolean(p.availableForYouth) && !p.isInjured && !p.isOnLoan
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 border border-emerald-400 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-2xl flex items-center gap-2 animate-bounce">
          <Sparkles className="w-4 h-4 text-emerald-200" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-blue-600/20 border border-blue-500/30 rounded-2xl flex items-center justify-center text-blue-400 shadow-inner">
                <GraduationCap className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                    Squadre Giovanili & Vivaio
                  </h2>
                  <span className="text-[11px] bg-blue-500/20 text-blue-300 px-2.5 py-0.5 rounded-full border border-blue-500/30 font-semibold font-mono">
                    {youthSquads.length} {youthSquads.length === 1 ? 'Rosa' : 'Rose Attive'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Gestione completa di Squadra B, Under 20, Under 18 e rose personalizzate (U23, U19, ecc.). Promuovi talenti in Prima Squadra o importa file CSV dedicati.
                </p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                setNewSquadName(`${teamName} U23`);
                setNewSquadCategory('U23');
                setIsCreatingSquadOpen(true);
              }}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-2 px-3.5 rounded-xl transition-all flex items-center gap-1.5 shadow-lg shadow-blue-950/40 cursor-pointer"
            >
              <FolderPlus className="w-4 h-4" /> Aggiungi Nuova Rosa
            </button>

            {activeSquad && (
              <button
                onClick={() => onOpenCsvModal && onOpenCsvModal(`youth_${activeSquad.id}`)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-2 px-3.5 rounded-xl transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-950/40 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4" /> Carica CSV in {activeSquad.category || 'Giovanile'}
              </button>
            )}
          </div>
        </div>

        {/* Youth Squad Navigation Tabs (Pills) */}
        <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {youthSquads.map((squad) => {
            const isSelected = squad.id === activeSquadId;
            return (
              <button
                key={squad.id}
                onClick={() => setSelectedSquadId(squad.id)}
                className={`group flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer border ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-950/50'
                    : 'bg-slate-950/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border-slate-800'
                }`}
              >
                <Users className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
                <span>{squad.name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                    isSelected ? 'bg-blue-800 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {squad.players.length}
                </span>
              </button>
            );
          })}

          <button
            onClick={() => {
              setNewSquadName(`${teamName} U21`);
              setNewSquadCategory('U21');
              setIsCreatingSquadOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-950/40 hover:bg-slate-800/60 border border-dashed border-slate-700 transition-colors whitespace-nowrap cursor-pointer"
            title="Aggiungi una nuova rosa giovanile"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nuova Squadra</span>
          </button>
        </div>
      </div>

      {/* Duplicate Warning Banner */}
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
                    ? `Rilevati ${duplicatesReport.totalDuplicatePlayers} giocatori duplicati tra le rose del club`
                    : `Detected ${duplicatesReport.totalDuplicatePlayers} duplicate players across club squads`}
                </h4>
                <span className="text-[10px] bg-amber-500/25 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full font-bold">
                  {duplicatesReport.totalExcessCopies} {language === 'it' ? 'copie ridondanti' : 'redundant copies'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {language === 'it'
                  ? "Alcuni giovani risultano registrati sia qui che in Prima Squadra o in un'altra categoria giovanile. Usa il controllo per visualizzarli e unificarli in 1 click."
                  : "Some youth players are registered both here and in the First Team or another youth squad. Use the tool to view and unify them in 1 click."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenDuplicatesModal?.()}
            className="px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-amber-950/40 transition-all cursor-pointer shrink-0"
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>{t('youth.checkDuplicates')}</span>
          </button>
        </div>
      )}

      {activeSquad && (
        <>
          {/* Active Squad Overview Header & Control Card */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Squad Info & Actions */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white">{activeSquad.name}</h3>
                    <span className="text-[10px] bg-slate-800 text-blue-400 px-2 py-0.5 rounded-md border border-slate-700 font-mono font-bold">
                      {activeSquad.category || 'Giovanile'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setRenameSquadName(activeSquad.name);
                        setIsRenamingSquadOpen(true);
                      }}
                      className="p-1.5 text-slate-400 hover:text-white bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs transition-colors cursor-pointer flex items-center gap-1"
                      title="Rinomina questa rosa"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline text-[11px]">Rinomina</span>
                    </button>

                    <button
                      onClick={() => setSquadToDelete(activeSquad)}
                      className="p-1.5 text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg text-xs transition-colors cursor-pointer flex items-center gap-1"
                      title="Elimina questa rosa giovanile"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline text-[11px]">Elimina Rosa</span>
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-400 mt-2">
                  {activeSquad.notes || 'Settore per lo sviluppo tecnico, tattico e fisico dei giovani.'}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const cYear = extractCurrentYear(currentDate);
                      setEditingPlayer({
                        id: `yp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                        name: '',
                        number: 50 + activePlayers.length,
                        position: 'CC',
                        bestRoles: ['Regista Avanzato'],
                        age: 18,
                        birthYear: cYear - 18,
                        nationality: 'Inghilterra',
                        morale: 'Superbo',
                        matchLoad: 'Medio',
                        homegrown: 'HG Club (3 anni in club)',
                        championsLeagueRegistered: false,
                        ca: 120,
                        pa: 160
                      });
                      setIsCreatingPlayer(true);
                    }}
                    className="bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-semibold py-1.5 px-3 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-blue-400" /> {t('squad.addPlayer')}
                  </button>

                  <button
                    onClick={() => setIsClearSquadConfirmOpen(true)}
                    className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold py-1.5 px-3 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                    title={language === 'it' ? "Rimuovi tutti i giocatori da questa rosa" : "Remove all players from this squad"}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> {t('squad.clearSquad')}
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenDuplicatesModal?.()}
                    className={`text-xs font-semibold py-1.5 px-3 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border ${
                      duplicatesReport.hasDuplicates
                        ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/40 shadow-sm animate-pulse'
                        : 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-300'
                    }`}
                    title={language === 'it' ? "Controllo doppioni tra tutte le rose del club" : "Inspect duplicates across all club squads"}
                  >
                    <AlertTriangle className={`w-3.5 h-3.5 ${duplicatesReport.hasDuplicates ? 'text-amber-400' : 'text-slate-400'}`} />
                    <span>{t('youth.checkDuplicates')}</span>
                    {duplicatesReport.totalDuplicatePlayers > 0 && (
                      <span className="bg-amber-500/30 text-amber-200 px-1.5 py-0.2 rounded-full text-[10px] font-bold">
                        {duplicatesReport.totalDuplicatePlayers}
                      </span>
                    )}
                  </button>
                </div>

                <span className="text-[11px] text-slate-500">
                  {totalCount} {language === 'it' ? (totalCount === 1 ? 'giovane in organico' : 'giovani in organico') : (totalCount === 1 ? 'player registered' : 'players registered')}
                </span>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Età Media Organico</span>
                <div className="text-2xl font-black text-white font-mono mt-1 flex items-baseline gap-1">
                  {avgAge} <span className="text-xs font-normal text-slate-400">anni</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap mt-2">
                  <span className="text-[10px] bg-gradient-to-r from-amber-500/20 to-purple-500/20 text-amber-200 border border-amber-500/40 px-2 py-0.5 rounded-md font-bold font-mono">
                    {wonderkidCount} Wonderkid
                  </span>
                  <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-2 py-0.5 rounded-md font-bold font-mono">
                    {topProspectCount} Top Prospect
                  </span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-md font-bold font-mono">
                    {topTalentCount} Top Talent
                  </span>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <span className="text-slate-400">Pronti 1ª Squadra (CA 130+):</span>
                <span className="font-bold text-emerald-400 font-mono">{readyCount}</span>
              </div>
            </div>

            {/* Top Prospect Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" /> Top Talento Vivaio
                  </span>
                  {topTalent && (
                    <div className="flex items-center gap-1">
                      <ProspectBadge pa={topTalent.pa} age={getEffectiveAge(topTalent, currentDate)} size="sm" />
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 font-mono font-bold px-1.5 py-0.2 rounded border border-amber-500/30">
                        PA {topTalent.pa || 170}
                      </span>
                    </div>
                  )}
                </div>

                {topTalent ? (
                  <div className="mt-2">
                    <div className="text-base font-bold text-white flex items-center gap-1.5 flex-wrap">
                      <span>{topTalent.name}</span>
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                      <span className="font-mono text-blue-400">{topTalent.position}</span>
                      <span>•</span>
                      <span>{getEffectiveAge(topTalent, currentDate)} anni</span>
                      <span>•</span>
                      <span className="text-emerald-400 font-mono">CA {topTalent.ca || 120}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 mt-2">Nessun giocatore inserito.</p>
                )}
              </div>

              {topTalent && (
                <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
                  <button
                    onClick={() => setInspectingPlayer(topTalent)}
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium cursor-pointer"
                  >
                    <Eye className="w-3 h-3" /> Scheda Talento
                  </button>
                  <div className="flex items-center gap-1.5">
                    {isU18Squad && (
                      <button
                        onClick={() => handlePromoteToU20(topTalent)}
                        className="text-xs bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-sm"
                        title="Promuovi questo top talent nell'Under 20"
                      >
                        <ArrowUpRight className="w-3 h-3" /> Promuovi in U20
                      </button>
                    )}
                    <button
                      onClick={() => handlePromotePlayer(topTalent)}
                      className="text-xs bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-md font-semibold flex items-center gap-1 transition-colors cursor-pointer shadow-sm"
                      title="Promuovi questo top talent in Prima Squadra"
                    >
                      <ArrowUp className="w-3 h-3" /> Promuovi in 1ª
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Rinforzi da Prima Squadra disponibili per le partite delle giovanili */}
          {availableFirstTeamPlayers.length > 0 && (
            <div className="bg-gradient-to-r from-teal-950/40 via-slate-900 to-slate-900 border border-teal-500/30 rounded-2xl p-4 shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-300 shrink-0">
                    <GraduationCap className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-teal-200">
                        Rinforzi da Prima Squadra disponibili per le Giovanili
                      </h4>
                      <span className="text-[10px] bg-teal-500/20 text-teal-300 px-2 py-0.5 rounded-full border border-teal-500/40 font-bold font-mono">
                        {availableFirstTeamPlayers.length} {availableFirstTeamPlayers.length === 1 ? 'Giocatore' : 'Giocatori'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Questi calciatori si allenano stabilmente con la prima squadra, ma sono disponibili e autorizzati a disputare le partite con il settore giovanile.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-3 pt-3 border-t border-teal-900/40">
                {availableFirstTeamPlayers.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => setInspectingPlayer(p)}
                    className="bg-slate-950/80 border border-teal-900/40 hover:border-teal-500/50 rounded-xl p-3 flex items-center justify-between gap-2 cursor-pointer transition-all hover:bg-slate-900"
                    title="Clicca per aprire la scheda dettagliata del giocatore"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-7 h-7 rounded-lg bg-teal-950/80 border border-teal-700/60 text-teal-300 text-xs font-mono font-bold flex items-center justify-center shrink-0">
                        {p.number}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                          <span>{p.name}</span>
                          <span className="text-[9px] bg-slate-800 text-teal-300 px-1.5 py-0.2 rounded font-mono font-semibold">
                            {p.position}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span>{getEffectiveAge(p, currentDate)} anni</span>
                          <span>•</span>
                          <span className="text-teal-400 font-medium">{p.youthSquadDesignation || 'Giovanili'}</span>
                          <span>•</span>
                          <span className="text-slate-300">{p.youthMatchMinutes || 'Fino a 90 min'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 text-[10px] font-mono">
                      {p.ca && <span className="text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded">CA {p.ca}</span>}
                      {p.pa && <span className="text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/30">PA {p.pa}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search, Filters, and Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              {/* Search */}
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cerca per nome, ruolo, nazione..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Position & Status Filter Pills */}
              <div className="flex items-center space-x-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
                {['Tutti', 'POR', 'DIF', 'CEN', 'ATT'].map((pos) => (
                  <button
                    key={pos}
                    onClick={() => setPosFilter(pos)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                      posFilter === pos
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    {pos === 'Tutti' ? 'Tutti i Ruoli' : pos}
                  </button>
                ))}

                {/* Prospect Tag Filter Pills */}
                <button
                  onClick={() => setTagFilter(tagFilter === 'wonderkid' ? 'all' : 'wonderkid')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center space-x-1 whitespace-nowrap border cursor-pointer ${
                    tagFilter === 'wonderkid'
                      ? 'bg-gradient-to-r from-amber-500/25 to-purple-500/25 text-amber-200 border-amber-500/60 font-black shadow-sm'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                  title="Mostra solo i giovani con PA 170+"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Wonderkid {wonderkidCount > 0 && `(${wonderkidCount})`}</span>
                </button>

                <button
                  onClick={() => setTagFilter(tagFilter === 'top_prospect' ? 'all' : 'top_prospect')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center space-x-1 whitespace-nowrap border cursor-pointer ${
                    tagFilter === 'top_prospect'
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/60 font-bold shadow-sm'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                  title="Mostra solo i giovani con PA 150-169"
                >
                  <Star className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Top Prospect {topProspectCount > 0 && `(${topProspectCount})`}</span>
                </button>

                <button
                  onClick={() => setTagFilter(tagFilter === 'top_talent' ? 'all' : 'top_talent')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center space-x-1 whitespace-nowrap border cursor-pointer ${
                    tagFilter === 'top_talent'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/60 font-bold shadow-sm'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                  title="Mostra solo i giovani con PA 130-149"
                >
                  <Award className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Top Talent {topTalentCount > 0 && `(${topTalentCount})`}</span>
                </button>

                <button
                  onClick={() => {
                    setInjuredOnly(!injuredOnly);
                    if (!injuredOnly) setLoanedOnly(false);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center space-x-1 whitespace-nowrap border cursor-pointer ${
                    injuredOnly
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 font-bold'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  <HeartPulse className="w-3.5 h-3.5 text-rose-400" />
                  <span>Infortunati {injuredCount > 0 && `(${injuredCount})`}</span>
                </button>

                <button
                  onClick={() => {
                    setLoanedOnly(!loanedOnly);
                    if (!loanedOnly) setInjuredOnly(false);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center space-x-1 whitespace-nowrap border cursor-pointer ${
                    loanedOnly
                      ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 font-bold'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  <Plane className="w-3.5 h-3.5 text-sky-400" />
                  <span>In Prestito {loanedCount > 0 && `(${loanedCount})`}</span>
                </button>
              </div>
            </div>

            {/* Quick Sorting Toolbar */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
              <div className="flex items-center space-x-2 overflow-x-auto">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 shrink-0">
                  <Filter className="w-3 h-3 text-blue-400" /> Ordina Per:
                </span>
                <button
                  onClick={() => handleSort('position')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1 border cursor-pointer ${
                    sortField === 'position'
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 font-bold'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  Ruolo Tactical (POR → PC)
                </button>
                <button
                  onClick={() => handleSort('name')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1 border cursor-pointer ${
                    sortField === 'name'
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 font-bold'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  Alfabetico (A-Z)
                </button>
                <button
                  onClick={() => handleSort('number')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1 border cursor-pointer ${
                    sortField === 'number'
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 font-bold'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  N° Maglia
                </button>
                <button
                  onClick={() => handleSort('ca')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1 border cursor-pointer ${
                    sortField === 'ca'
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 font-bold'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  Abilità (CA)
                </button>
                <button
                  onClick={() => handleSort('pa')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1 border cursor-pointer ${
                    sortField === 'pa'
                      ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 font-bold'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  Potenziale (PA)
                </button>
              </div>

              <button
                onClick={() => setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-950 text-slate-300 border border-slate-800 hover:bg-slate-800 flex items-center gap-1 transition-all shrink-0 cursor-pointer"
                title="Inverti direzione ordinamento"
              >
                {sortDirection === 'asc' ? (
                  <>
                    <ArrowUpAZ className="w-3.5 h-3.5 text-blue-400" /> Crescente
                  </>
                ) : (
                  <>
                    <ArrowDownAZ className="w-3.5 h-3.5 text-amber-400" /> Decrescente
                  </>
                )}
              </button>
            </div>

            {/* Players Table */}
            {filteredPlayers.length === 0 ? (
              <div className="text-center py-12 bg-slate-950/60 rounded-xl border border-dashed border-slate-800 p-6">
                <GraduationCap className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h4 className="text-sm font-bold text-slate-300">Nessun giovane trovato in questa rosa</h4>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Puoi caricare un file CSV esportato da Football Manager oppure aggiungere manualmente i giovani talenti.
                </p>
                <div className="mt-4 flex items-center justify-center gap-2">
                  <button
                    onClick={() => onOpenCsvModal && onOpenCsvModal(`youth_${activeSquad.id}`)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-1.5 px-3.5 rounded-xl transition-all flex items-center gap-1.5"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" /> Carica CSV
                  </button>
                  <button
                    onClick={() => {
                      const cYear = extractCurrentYear(currentDate);
                      setEditingPlayer({
                        id: `yp_${Date.now()}`,
                        name: '',
                        number: 50,
                        position: 'CC',
                        bestRoles: ['Regista'],
                        age: 18,
                        birthYear: cYear - 18,
                        nationality: 'Inghilterra',
                        morale: 'Buono',
                        matchLoad: 'Medio',
                        homegrown: 'HG Club (3 anni in club)',
                        championsLeagueRegistered: false,
                        ca: 120,
                        pa: 155,
                        isInjured: false,
                        isOnLoan: false
                      });
                      setIsCreatingPlayer(true);
                    }}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-1.5 px-3.5 rounded-xl transition-all"
                  >
                    + Aggiungi Giocatore
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider bg-slate-950/80">
                      <th className="py-3 px-3 cursor-pointer" onClick={() => handleSort('number')}>
                        <div className="flex items-center gap-1">
                          <span>N°</span>
                          {sortField === 'number' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-400" />)}
                        </div>
                      </th>
                      <th className="py-3 px-3 cursor-pointer" onClick={() => handleSort('name')}>
                        <div className="flex items-center gap-1">
                          <span>Giocatore & Ruolo</span>
                          {sortField === 'name' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-400" />)}
                        </div>
                      </th>
                      <th className="py-3 px-3 cursor-pointer" onClick={() => handleSort('age')}>
                        <div className="flex items-center gap-1">
                          <span>Età</span>
                          {sortField === 'age' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-400" />)}
                        </div>
                      </th>
                      <th className="py-3 px-3 cursor-pointer" onClick={() => handleSort('ca')}>
                        <div className="flex items-center gap-1">
                          <span>Abilità (CA)</span>
                          {sortField === 'ca' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-400" />)}
                        </div>
                      </th>
                      <th className="py-3 px-3 cursor-pointer" onClick={() => handleSort('pa')}>
                        <div className="flex items-center gap-1">
                          <span>Potenziale (PA)</span>
                          {sortField === 'pa' && (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-400" /> : <ArrowDown className="w-3 h-3 text-blue-400" />)}
                        </div>
                      </th>
                      <th className="py-3 px-3">Status HG</th>
                      <th className="py-3 px-3">Disponibilità</th>
                      <th className="py-3 px-3 text-right sticky right-0 bg-slate-950 z-20 shadow-[-10px_0_15px_-3px_rgba(0,0,0,0.6)]">Azioni & Promozione</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-xs">
                    {filteredPlayers.map((player) => {
                      const effAge = getEffectiveAge(player, currentDate);
                      const ca = player.ca || 120;
                      const pa = player.pa || 155;
                      const growth = Math.max(0, pa - ca);
                      const isInjured = Boolean(player.isInjured);
                      const isOnLoan = Boolean(player.isOnLoan);

                      return (
                        <tr
                          key={player.id}
                          className={`transition-colors group cursor-pointer ${
                            isInjured
                              ? 'bg-rose-950/25 border-l-4 border-l-rose-500 hover:bg-rose-950/40'
                              : isOnLoan
                              ? 'bg-blue-950/25 border-l-4 border-l-blue-500 hover:bg-blue-950/40'
                              : 'hover:bg-slate-800/40'
                          }`}
                          onClick={() => setInspectingPlayer(player)}
                        >
                          {/* Number */}
                          <td className={`py-3 px-3 font-mono font-bold ${
                            isInjured ? 'text-rose-400' : isOnLoan ? 'text-blue-400' : 'text-slate-400'
                          }`}>
                            #{player.number}
                          </td>

                          {/* Name & Position */}
                          <td className="py-3 px-3 max-w-[260px] sm:max-w-[320px] md:max-w-[380px]">
                            <div className="flex items-center space-x-2.5">
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 border ${
                                isInjured
                                  ? 'bg-rose-950 border-rose-700 text-rose-300'
                                  : isOnLoan
                                  ? 'bg-blue-950 border-blue-700 text-blue-300'
                                  : 'bg-slate-800 border-slate-700 text-white group-hover:border-blue-500'
                              } transition-colors`}>
                                {player.position.split(/[\s/]+/)[0]}
                              </div>
                              <div className="min-w-0 flex-1">
                                {/* Barra di scorrimento orizzontale per nomi lunghi */}
                                <div 
                                  className="max-w-[170px] xs:max-w-[220px] sm:max-w-[270px] md:max-w-[330px] overflow-x-auto overflow-y-hidden pb-1 name-scrollbar"
                                  title={player.name}
                                >
                                  <div className={`font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                                    isInjured
                                      ? 'text-rose-400 group-hover:text-rose-300'
                                      : isOnLoan
                                      ? 'text-blue-400 group-hover:text-blue-300'
                                      : 'text-white group-hover:text-blue-300'
                                  }`}>
                                    <span className="shrink-0">{player.name}</span>
                                    <PlayerVariationBadge player={player} size="xs" />
                                    <ProspectBadge pa={player.pa} age={effAge} />
                                    {duplicatesReport.playerToOtherSquadsMap.has(player.id) && (
                                      <SquadDuplicateBadge
                                        compact
                                        otherSquadNames={duplicatesReport.playerToOtherSquadsMap.get(player.id)}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onOpenDuplicatesModal?.(player.name);
                                        }}
                                      />
                                    )}
                                    {isInjured && (
                                      <span className="text-[9px] bg-rose-500/20 text-rose-300 font-bold px-1.5 py-0.5 rounded border border-rose-500/40 flex items-center gap-1 shrink-0">
                                        🚑 INFORTUNATO
                                      </span>
                                    )}
                                    {isOnLoan && (
                                      <span className="text-[9px] bg-blue-500/20 text-blue-300 font-bold px-1.5 py-0.5 rounded border border-blue-500/40 flex items-center gap-1 shrink-0">
                                        ✈️ PRESTITO {player.loanClub ? `(${player.loanClub})` : ''}
                                      </span>
                                    )}
                                    {player.isKeyPlayer && !isInjured && !isOnLoan && !getProspectTag(player.pa, effAge) && (
                                      <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.2 rounded border border-amber-500/30 shrink-0">
                                        ⭐ Top Talent
                                      </span>
                                    )}
                                    {player.notes && isCopilotNote(player.notes) && (
                                      <span
                                        title={`Nota Copilot: ${player.notes}`}
                                        className="text-[9px] bg-cyan-500/20 text-cyan-300 font-bold px-1.5 py-0.5 rounded border border-cyan-500/40 flex items-center gap-1 shrink-0 cursor-help"
                                      >
                                        <Bot className="w-2.5 h-2.5 text-cyan-400" />
                                        COPILOT
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="text-[11px] text-slate-400 flex items-center gap-1.5 whitespace-nowrap overflow-x-auto name-scrollbar">
                                  <span className={`font-mono font-medium ${
                                    isInjured ? 'text-rose-400' : isOnLoan ? 'text-blue-400' : 'text-blue-400'
                                  }`}>{player.position}</span>
                                  <span>•</span>
                                  <span>{player.nationality}</span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Age */}
                          <td className="py-3 px-3 font-mono font-medium text-slate-300">
                            {effAge} anni
                          </td>

                          {/* CA */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                                {ca}
                              </span>
                              <PlayerVariationBadge player={player} size="xs" />
                            </div>
                          </td>

                          {/* PA */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                                {pa}
                              </span>
                              {growth > 0 && (
                                <span className="text-[10px] text-purple-400 font-mono font-semibold">
                                  +{growth}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Homegrown */}
                          <td className="py-3 px-3">
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
                                player.homegrown.includes('HG Club')
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                  : player.homegrown.includes('HG Nazione')
                                  ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                                  : 'bg-slate-800 text-slate-400 border-slate-700'
                              }`}
                            >
                              {player.homegrown.includes('HG Club')
                                ? 'HG Club'
                                : player.homegrown.includes('HG Nazione')
                                ? 'HG Nazione'
                                : 'Non-HG'}
                            </span>
                          </td>

                          {/* Availability Status */}
                          <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                            <div className="space-y-1">
                              <div className="flex items-center gap-1">
                                {isInjured ? (
                                  <button
                                    type="button"
                                    onClick={() => handleSetAvailable(player.id)}
                                    className="px-2 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border cursor-pointer bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30"
                                    title="Infortunato. Clicca per renderlo Disponibile"
                                  >
                                    <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                                    <span>Infortunato</span>
                                  </button>
                                ) : isOnLoan ? (
                                  <button
                                    type="button"
                                    onClick={() => handleSetAvailable(player.id)}
                                    className="px-2 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border cursor-pointer bg-blue-500/20 text-blue-300 border-blue-500/40 hover:bg-blue-500/30"
                                    title={`In prestito ${player.loanClub ? `al ${player.loanClub}` : ''}. Clicca per farlo rientrare come Disponibile`}
                                  >
                                    <Plane className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                    <span>In Prestito</span>
                                  </button>
                                 ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenInjuryModal(player)}
                                    className="px-2 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border cursor-pointer bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                                    title="Arruolabile. Clicca per attivare il flag infortunato e inserire la durata"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                    <span>Disponibile</span>
                                  </button>
                                )}

                                {!isOnLoan && !isInjured && (
                                  <button
                                    type="button"
                                    onClick={() => handleToggleLoaned(player.id)}
                                    className="p-1 rounded-lg text-slate-500 hover:text-blue-300 hover:bg-slate-800 transition-colors"
                                    title="Segna giovane come ceduto in prestito"
                                  >
                                    <Plane className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>

                              {player.isInjured && (
                                <div
                                  onClick={() => handleOpenInjuryModal(player)}
                                  className="text-[10px] text-rose-300 bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800/50 px-2 py-0.5 rounded-lg flex items-center gap-1 cursor-pointer transition-colors max-w-[160px]"
                                  title="Clicca per modificare l'entità temporale o le note dell'infortunio"
                                >
                                  <Clock className="w-3 h-3 text-rose-400 shrink-0" />
                                  <span className="truncate italic">{player.injuryNote || 'Inserisci durata...'}</span>
                                  <Edit2 className="w-2.5 h-2.5 text-rose-400/80 shrink-0 ml-auto" />
                                </div>
                              )}
                              {player.isOnLoan && player.loanClub && (
                                <div className="text-[10px] text-sky-400/90 truncate max-w-[140px]" title={`In prestito al ${player.loanClub}`}>
                                  Presso: {player.loanClub}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-3 text-right sticky right-0 z-10 transition-colors bg-slate-900 group-hover:bg-slate-800 shadow-[-10px_0_15px_-3px_rgba(0,0,0,0.6)]" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end space-x-1.5 whitespace-nowrap">
                              {/* For U18 players: Promote to U20 */}
                              {isU18Squad && (
                                <button
                                  onClick={() => handlePromoteToU20(player)}
                                  className="bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                                  title="Promuovi nella formazione Under 20 / Primavera"
                                >
                                  <ArrowUpRight className="w-3 h-3 text-indigo-400 group-hover:text-white" />
                                  <span className="hidden md:inline">Promuovi in </span>
                                  <span>U20</span>
                                </button>
                              )}

                              {/* Promote to First Team */}
                              <button
                                onClick={() => handlePromotePlayer(player)}
                                className="bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                                title="Promuovi in Prima Squadra"
                              >
                                <ArrowUp className="w-3 h-3 text-emerald-400 group-hover:text-white" />
                                <span className="hidden md:inline">Promuovi in </span>
                                <span>1ª</span>
                              </button>

                              {/* Move to another youth squad */}
                              {youthSquads.length > 1 && (
                                <button
                                  onClick={() => {
                                    const otherSquad = youthSquads.find((s) => s.id !== activeSquad.id);
                                    setMovingPlayer({
                                      player,
                                      targetSquadId: otherSquad?.id || ''
                                    });
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-blue-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer border border-slate-800"
                                  title="Sposta in un'altra rosa giovanile"
                                >
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Edit */}
                              <button
                                onClick={() => {
                                  setEditingPlayer({ ...player });
                                  setIsCreatingPlayer(false);
                                }}
                                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer border border-slate-800"
                                title="Modifica dati giocatore"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete */}
                              <button
                                onClick={() => setPlayerToDelete({ id: player.id, name: player.name })}
                                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer border border-slate-800"
                                title="Rimuovi dalla rosa giovanile"
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
            )}
          </div>
        </>
      )}

      {/* CREATE NEW YOUTH SQUAD MODAL */}
      {isCreatingSquadOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-600/20 border border-blue-500/30 rounded-xl flex items-center justify-center text-blue-400">
                <FolderPlus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Aggiungi Nuova Rosa Giovanile</h3>
                <p className="text-xs text-slate-400">Crea una nuova squadra per il vivaio o le riserve</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Nome Rosa</label>
                <input
                  type="text"
                  value={newSquadName}
                  onChange={(e) => setNewSquadName(e.target.value)}
                  placeholder="es. Northampton Town FC U23"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-medium focus:border-blue-500 focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Categoria / Tag Preset</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {['B', 'U23', 'U21', 'U20', 'U19', 'U18', 'U17', 'Primavera'].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setNewSquadCategory(cat);
                        setNewSquadName(`${teamName} ${cat}`);
                      }}
                      className={`py-1.5 px-2 rounded-lg text-center font-semibold border transition-all ${
                        newSquadCategory === cat
                          ? 'bg-blue-600 text-white border-blue-400'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsCreatingSquadOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleCreateSquad}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium cursor-pointer shadow-lg shadow-blue-950/40"
              >
                Crea Rosa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RENAME SQUAD MODAL */}
      {isRenamingSquadOpen && activeSquad && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-600/20 border border-blue-500/30 rounded-xl flex items-center justify-center text-blue-400">
                <Edit2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Rinomina Rosa Giovanile</h3>
                <p className="text-xs text-slate-400">Modifica il nome visibile di questa squadra</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Nome Rosa</label>
                <input
                  type="text"
                  value={renameSquadName}
                  onChange={(e) => setRenameSquadName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-medium focus:border-blue-500 focus:outline-none"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsRenamingSquadOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleRenameSquad}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium cursor-pointer"
              >
                Salva Nuovo Nome
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MOVE / PROMOTE PLAYER MODAL */}
      {movingPlayer && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-purple-600/20 border border-purple-500/30 rounded-xl flex items-center justify-center text-purple-400">
                <ArrowRight className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Sposta / Promuovi Giocatore</h3>
                <p className="text-xs text-slate-400">
                  Trasferisci o promuovi <strong className="text-white">{movingPlayer.player.name}</strong>
                </p>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <label className="text-slate-400 block mb-1">Seleziona Destinazione:</label>
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1 name-scrollbar">
                {/* Option 1: Prima Squadra (Promozione diretta) */}
                <button
                  type="button"
                  onClick={() => setMovingPlayer({ ...movingPlayer, targetSquadId: 'FIRST_TEAM' })}
                  className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                    movingPlayer.targetSquadId === 'FIRST_TEAM'
                      ? 'bg-emerald-600/25 border-emerald-500 text-white font-bold shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                      <Trophy className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-white">Prima Squadra</span>
                        <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.2 rounded font-bold uppercase">
                          Promozione Top
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400">Promozione nel gruppo senior della squadra</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono bg-slate-800 px-2 py-0.5 rounded text-slate-400">
                    {firstTeamPlayers.length} giocatori
                  </span>
                </button>

                {/* Youth Squads */}
                {youthSquads
                  .filter((s) => s.id !== activeSquad?.id)
                  .map((squad) => {
                    const isU20Dest = squad.category === 'U20' || /u20|under\s*20|primavera/i.test(squad.name);
                    const isPromotionToU20 = isU18Squad && isU20Dest;

                    return (
                      <button
                        key={squad.id}
                        type="button"
                        onClick={() => setMovingPlayer({ ...movingPlayer, targetSquadId: squad.id })}
                        className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                          movingPlayer.targetSquadId === squad.id
                            ? isPromotionToU20
                              ? 'bg-indigo-600/25 border-indigo-500 text-white font-bold shadow-sm'
                              : 'bg-purple-600/20 border-purple-500 text-white font-bold'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            isPromotionToU20
                              ? 'bg-indigo-500/20 border border-indigo-500/40 text-indigo-400'
                              : 'bg-purple-500/10 border border-purple-500/30 text-purple-400'
                          }`}>
                            {isPromotionToU20 ? (
                              <ArrowUpRight className="w-4 h-4 text-indigo-400" />
                            ) : (
                              <Users className="w-4 h-4 text-purple-400" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-white">{squad.name}</span>
                              {isPromotionToU20 && (
                                <span className="text-[9px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-1.5 py-0.2 rounded font-bold uppercase">
                                  Promozione U20
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400">
                              {squad.category ? `Categoria: ${squad.category}` : 'Rosa Giovanile'}
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono bg-slate-800 px-2 py-0.5 rounded text-slate-400">
                          {squad.players.length} giocatori
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setMovingPlayer(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleMovePlayerToSquad}
                className={`px-4 py-2 text-white rounded-xl text-xs font-medium cursor-pointer shadow-lg ${
                  movingPlayer.targetSquadId === 'FIRST_TEAM'
                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/40'
                    : isU18Squad && youthSquads.find((s) => s.id === movingPlayer.targetSquadId && (s.category === 'U20' || /u20|under\s*20|primavera/i.test(s.name)))
                    ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-950/40'
                    : 'bg-purple-600 hover:bg-purple-500 shadow-purple-950/40'
                }`}
              >
                {movingPlayer.targetSquadId === 'FIRST_TEAM'
                  ? 'Conferma Promozione in 1ª'
                  : isU18Squad && youthSquads.find((s) => s.id === movingPlayer.targetSquadId && (s.category === 'U20' || /u20|under\s*20|primavera/i.test(s.name)))
                  ? 'Conferma Promozione in U20'
                  : 'Conferma Spostamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT / CREATE PLAYER MODAL */}
      {editingPlayer && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 overflow-hidden animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            {/* Header fisso */}
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-950/60">
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-white truncate">
                    {isCreatingPlayer ? 'Aggiungi Giovane al Vivaio' : `Modifica: ${editingPlayer.name}`}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {isCreatingPlayer ? "Inserisci i dati del talento per aggregarlo alle giovanili" : "Aggiorna dati, ruoli, potenziale e note del manager"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingPlayer(null);
                  setIsCreatingPlayer(false);
                }}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                title="Chiudi finestra"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Corpo scorrevole */}
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
                  max={40}
                  value={editingPlayer.age || 18}
                  onChange={(e) => {
                    const newAge = parseInt(e.target.value, 10) || 18;
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
                <label className="text-slate-400 block mb-1">Abilità Attuale (CA 1-200)</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={editingPlayer.ca || 120}
                  onChange={(e) => setEditingPlayer({ ...editingPlayer, ca: parseInt(e.target.value) || 120 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-400">Potenziale (PA 1-200)</label>
                  <ProspectBadge pa={editingPlayer.pa} age={editingPlayer.age || (editingPlayer.birthYear ? extractCurrentYear(currentDate) - editingPlayer.birthYear : 18)} size="sm" />
                </div>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={editingPlayer.pa || 160}
                  onChange={(e) => setEditingPlayer({ ...editingPlayer, pa: parseInt(e.target.value) || 160 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
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

              <div className="col-span-2">
                <label className="text-slate-400 block mb-1">Status Homegrown</label>
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

              {/* Status Infortunio */}
              <div className="col-span-2 p-3.5 bg-slate-950/80 rounded-xl border border-rose-900/40 space-y-2.5">
                <div className="flex items-center space-x-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    id="youthIsInjured"
                    checked={editingPlayer.isInjured || false}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setEditingPlayer({
                        ...editingPlayer,
                        isInjured: checked,
                        isOnLoan: checked ? false : editingPlayer.isOnLoan,
                        injuryNote: checked ? (editingPlayer.injuryNote || '') : undefined
                      });
                    }}
                    className="rounded border-slate-700 text-rose-600 focus:ring-rose-500 bg-slate-900 w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="youthIsInjured" className="text-rose-400 text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Flag Infortunato / Indisponibile (escludi da rotazioni e valutazioni rosa)</span>
                  </label>
                </div>

                {/* Casella note che si apre sotto quando il flag è attivato */}
                {editingPlayer.isInjured && (
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
                      placeholder="Scrivi l'entità temporale (es. 2-3 settimane, 1 mese, fino a fine mese...)"
                      value={editingPlayer.injuryNote || ''}
                      onChange={(e) => setEditingPlayer({ ...editingPlayer, injuryNote: e.target.value })}
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

              {/* Status In Prestito */}
              <div className="col-span-2 p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="youthIsOnLoan"
                    checked={editingPlayer.isOnLoan || false}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setEditingPlayer({
                        ...editingPlayer,
                        isOnLoan: checked,
                        isInjured: checked ? false : editingPlayer.isInjured
                      });
                    }}
                    className="rounded border-slate-800 text-sky-600 focus:ring-sky-500 bg-slate-900 w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="youthIsOnLoan" className="text-sky-400 text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
                    <Plane className="w-3.5 h-3.5" />
                    <span>In Prestito (escludi da rotazioni e valutazioni rosa)</span>
                  </label>
                </div>
                <p className="text-[11px] text-slate-400 pl-6">
                  Flag ufficiale per l'AI Copilot: informa l'assistente che il giovane è attualmente in prestito esterno ed evita confusioni da vecchie note.
                </p>
                {!editingPlayer.isOnLoan && editingPlayer.notes && /\b(prestit|ceduto in prestito|loan)\b/i.test(editingPlayer.notes) && (
                  <div className="ml-6 bg-amber-950/30 border border-amber-500/30 rounded-lg p-2 text-[11px] text-amber-200 flex items-center justify-between gap-2">
                    <span>💡 Nota testuale cita un prestito: se il calciatore è ancora in prestito, spunta la casella.</span>
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
                  <input
                    type="text"
                    placeholder="Squadra di destinazione del prestito (es. Monza, Sassuolo)..."
                    value={editingPlayer.loanClub || ''}
                    onChange={(e) => setEditingPlayer({ ...editingPlayer, loanClub: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500"
                  />
                )}
              </div>

              <div className="col-span-2 flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="youthIsKeyPlayer"
                  checked={editingPlayer.isKeyPlayer || false}
                  onChange={(e) => setEditingPlayer({ ...editingPlayer, isKeyPlayer: e.target.checked })}
                  className="rounded border-slate-800 text-blue-600 focus:ring-blue-500 bg-slate-950 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="youthIsKeyPlayer" className="text-slate-300 text-xs font-semibold cursor-pointer">
                  Contrassegna come Top Talent / Prospetto Chiave ⭐
                </label>
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
                placeholder="es. [Copilot AI • 28 Ottobre 2026]: Strategia concordata... oppure note di crescita e prestito"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white leading-relaxed"
              />
            </div>

            </div>

            {/* Footer fisso in basso */}
            <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/80 shrink-0 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => {
                  setEditingPlayer(null);
                  setIsCreatingPlayer(false);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer transition-colors"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={() => handleSavePlayer(editingPlayer)}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-blue-950/50 cursor-pointer transition-colors"
              >
                Salva Giocatore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE SQUAD MODAL */}
      <ConfirmDialogModal
        isOpen={!!squadToDelete}
        title="Elimina Rosa Giovanile"
        message={`Sei sicuro di voler eliminare la rosa "${squadToDelete?.name}"? I suoi ${squadToDelete?.players.length || 0} giocatori verranno rimossi.`}
        confirmText="Elimina Definitivamente"
        cancelText="Annulla"
        confirmVariant="danger"
        onConfirm={handleDeleteSquad}
        onCancel={() => setSquadToDelete(null)}
      />

      {/* QUICK INJURY MODAL */}
      {injuryModalPlayer && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-900/50 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-500/10 rounded-xl border border-rose-500/30">
                  <AlertCircle className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Infortunio Giovane Vivaio</h3>
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
                    Deselezionando il flag, il giovane tornerà subito Disponibile e Arruolabile.
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

      {/* CONFIRM CLEAR SQUAD MODAL */}
      <ConfirmDialogModal
        isOpen={isClearSquadConfirmOpen}
        title="Svuota Rosa Giovanile"
        message={`Sei sicuro di voler rimuovere tutti i ${activePlayers.length} giocatori dalla rosa "${activeSquad?.name}"? Questa operazione è utile prima di importare un file CSV personalizzato.`}
        confirmText="Svuota Rosa"
        cancelText="Annulla"
        confirmVariant="danger"
        onConfirm={handleClearCurrentSquad}
        onCancel={() => setIsClearSquadConfirmOpen(false)}
      />

      {/* CONFIRM DELETE SINGLE PLAYER MODAL */}
      <ConfirmDialogModal
        isOpen={!!playerToDelete}
        title="Rimuovi Giovane dal Vivaio"
        message={`Sei sicuro di voler rimuovere ${playerToDelete?.name} dalla rosa giovanile?`}
        confirmText="Rimuovi Giocatore"
        cancelText="Annulla"
        confirmVariant="danger"
        onConfirm={() => playerToDelete && handleDeletePlayer(playerToDelete.id)}
        onCancel={() => setPlayerToDelete(null)}
      />

      {/* PLAYER ATTRIBUTES MODAL */}
      <PlayerAttributesModal
        player={inspectingPlayer}
        onClose={() => setInspectingPlayer(null)}
        currentDate={currentDate}
        onAskCopilot={onAskCopilot}
        onUpdatePlayer={(updatedPlayer) => {
          const updatedSquads = youthSquads.map(sq => {
            if (sq.id === activeSquad.id) {
              return {
                ...sq,
                players: sq.players.map(p => p.id === updatedPlayer.id ? updatedPlayer : p)
              };
            }
            return sq;
          });
          onUpdateYouthSquads(updatedSquads);
          setInspectingPlayer(updatedPlayer);
        }}
        onPromoteToFirstTeam={(p) => {
          handlePromotePlayer(p);
          setInspectingPlayer(null);
        }}
        onPromoteToU20={
          isU18Squad
            ? (p) => {
                handlePromoteToU20(p);
                setInspectingPlayer(null);
              }
            : undefined
        }
        onDeletePlayer={(p) => {
          setInspectingPlayer(null);
          setPlayerToDelete({ id: p.id, name: p.name });
        }}
      />
    </div>
  );
};
