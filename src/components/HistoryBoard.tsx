import React, { useState, useMemo, useRef } from 'react';
import { SeasonHistoryEntry, ArchivedSeasonCalendar, Fixture, Player } from '../types';
import { matchesSearch } from '../utils/textUtils';
import {
  Trophy,
  Calendar,
  Award,
  Download,
  Upload,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  FileText,
  ChevronDown,
  ChevronUp,
  Search,
  Sparkles,
  Shield,
  Star,
  CheckCircle2,
  Flame,
  Clock,
  ArrowRight,
  Info,
  Layers,
  RotateCcw,
  RefreshCw
} from 'lucide-react';
import {
  exportCalendarToFile,
  parseUploadedCalendarFile,
  inferSeasonFromFixtures,
  calculateCalendarStats,
  getFixtureResult,
  extractSeasonDataFromFixtures
} from '../utils/calendarExportUtils';
import { ConfirmDialogModal } from './ConfirmDialogModal';

interface HistoryBoardProps {
  historyAwards: SeasonHistoryEntry[];
  onUpdateHistoryAwards: (entries: SeasonHistoryEntry[]) => void;
  archivedCalendars: ArchivedSeasonCalendar[];
  onUpdateArchivedCalendars: (calendars: ArchivedSeasonCalendar[]) => void;
  currentFixtures: Fixture[];
  currentDate?: string;
  teamName?: string;
  players?: Player[];
  onRestoreCalendarToActive?: (fixtures: Fixture[]) => void;
}

const COMMON_TROPHIES = [
  'Premier League',
  'UEFA Champions League',
  'FA Cup',
  'Carabao Cup',
  'UEFA Europa League',
  'UEFA Conference League',
  'Supercoppa UEFA',
  'Community Shield',
  'FIFA Club World Cup',
  'Coppa Intercontinentale',
  'Serie A',
  'Coppa Italia',
  'Supercoppa Italiana',
  'LaLiga',
  'Copa del Rey',
  'Bundesliga',
  'DFB-Pokal',
  'Ligue 1',
  'Championship (Promozione)'
];

const COMMON_RESULTS = [
  'Vincitore 🏆 (Campione)',
  'Finalista 🥈 (2° Posto)',
  'Semifinale',
  'Quarti di Finale',
  'Ottavi di Finale',
  'Fase a Gironi / League Phase',
  'Playoff',
  'Salvezza Raggiunta'
];

export const HistoryBoard: React.FC<HistoryBoardProps> = ({
  historyAwards,
  onUpdateHistoryAwards,
  archivedCalendars,
  onUpdateArchivedCalendars,
  currentFixtures,
  currentDate = '28 Ottobre 2026',
  teamName = 'La Tua Squadra FC',
  players = [],
  onRestoreCalendarToActive
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'awards' | 'calendars'>('awards');

  // Awards state
  const [expandedSeasonId, setExpandedSeasonId] = useState<string | null>(historyAwards[0]?.id || null);
  const [editingSeason, setEditingSeason] = useState<SeasonHistoryEntry | null>(null);
  const [isCreatingSeason, setIsCreatingSeason] = useState(false);
  const [seasonToDelete, setSeasonToDelete] = useState<string | null>(null);

  // Source calendar selector for modal sync
  const [selectedSourceCalendarId, setSelectedSourceCalendarId] = useState<string>('active');
  const [calendarImportToast, setCalendarImportToast] = useState<string | null>(null);

  // New trophy input in modal
  const [customTrophyInput, setCustomTrophyInput] = useState('');
  const [customAwardInput, setCustomAwardInput] = useState('');

  // Calendar Archive state
  const [selectedArchivedCalendarId, setSelectedArchivedCalendarId] = useState<string | null>(
    archivedCalendars[0]?.id || null
  );
  const [calendarSearchTerm, setCalendarSearchTerm] = useState('');
  const [calendarCompFilter, setCalendarCompFilter] = useState('Tutte');
  const [calendarOutcomeFilter, setCalendarOutcomeFilter] = useState<'Tutte' | 'Vittorie' | 'Pareggi' | 'Sconfitte' | 'Note'>('Tutte');
  const [exportSeasonCode, setExportSeasonCode] = useState(() => {
    const inferred = inferSeasonFromFixtures(currentFixtures, currentDate);
    return inferred.seasonCode;
  });
  const [exportSuccessToast, setExportSuccessToast] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [calendarToDelete, setCalendarToDelete] = useState<string | null>(null);
  const [calendarToRestore, setCalendarToRestore] = useState<ArchivedSeasonCalendar | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Stats calculation for Awards
  const totalTrophiesCount = useMemo(() => {
    return historyAwards.reduce((sum, item) => sum + (item.trophiesWon?.length || 0), 0);
  }, [historyAwards]);

  const leagueTitlesCount = useMemo(() => {
    return historyAwards.filter(item =>
      (item.trophiesWon || []).some(t =>
        /premier|serie a|laliga|bundesliga|ligue 1|campion/i.test(t)
      )
    ).length;
  }, [historyAwards]);

  const europeanTrophiesCount = useMemo(() => {
    return historyAwards.reduce((sum, item) => {
      const count = (item.trophiesWon || []).filter(t =>
        /champions|europa league|conference|supercoppa uefa|mondiale per club|intercontinentale/i.test(t)
      ).length;
      return sum + count;
    }, 0);
  }, [historyAwards]);

  const domesticCupsCount = useMemo(() => {
    return Math.max(0, totalTrophiesCount - leagueTitlesCount - europeanTrophiesCount);
  }, [totalTrophiesCount, leagueTitlesCount, europeanTrophiesCount]);

  // Overall Club Historic Record across all registered seasons in Palmarès
  const allTimeClubRecord = useMemo(() => {
    let played = 0;
    let won = 0;
    let drawn = 0;
    let lost = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;
    let points = 0;

    historyAwards.forEach(item => {
      if (item.stats) {
        played += item.stats.played || 0;
        won += item.stats.won || 0;
        drawn += item.stats.drawn || 0;
        lost += item.stats.lost || 0;
        goalsFor += item.stats.goalsFor || 0;
        goalsAgainst += item.stats.goalsAgainst || 0;
        points += item.stats.points || (item.stats.won ? item.stats.won * 3 + (item.stats.drawn || 0) : 0);
      }
    });

    const winRate = played > 0 ? Math.round((won / played) * 100) : 0;
    return {
      played,
      won,
      drawn,
      lost,
      goalsFor,
      goalsAgainst,
      points,
      winRate
    };
  }, [historyAwards]);

  // Selected archived calendar
  const currentSelectedCalendar = useMemo(() => {
    return archivedCalendars.find(c => c.id === selectedArchivedCalendarId) || archivedCalendars[0] || null;
  }, [archivedCalendars, selectedArchivedCalendarId]);

  // Available competitions in current selected archived calendar
  const archivedCompetitions = useMemo(() => {
    if (!currentSelectedCalendar) return [];
    const comps = new Set<string>();
    currentSelectedCalendar.fixtures.forEach(f => {
      if (f.competition) comps.add(f.competition.trim());
    });
    return Array.from(comps);
  }, [currentSelectedCalendar]);

  // Filtered fixtures for the selected archived calendar
  const filteredArchivedFixtures = useMemo(() => {
    if (!currentSelectedCalendar) return [];
    return currentSelectedCalendar.fixtures.filter(f => {
      // Search term
      if (calendarSearchTerm.trim()) {
        const term = calendarSearchTerm.trim();
        const matchOpponent = matchesSearch(f.opponent, term);
        const matchComp = matchesSearch(f.competition, term);
        const matchNotes = matchesSearch(f.tacticalNotes, term);
        if (!matchOpponent && !matchComp && !matchNotes) return false;
      }

      // Competition filter
      if (calendarCompFilter !== 'Tutte' && f.competition !== calendarCompFilter) {
        return false;
      }

      // Outcome filter
      if (calendarOutcomeFilter === 'Note') {
        return Boolean(f.tacticalNotes && f.tacticalNotes.trim());
      }

      if (calendarOutcomeFilter !== 'Tutte') {
        const res = getFixtureResult(f);
        if (!res) return false;
        if (calendarOutcomeFilter === 'Vittorie' && !res.isWin) return false;
        if (calendarOutcomeFilter === 'Pareggi' && !res.isDraw) return false;
        if (calendarOutcomeFilter === 'Sconfitte' && !res.isLoss) return false;
      }

      return true;
    });
  }, [currentSelectedCalendar, calendarSearchTerm, calendarCompFilter, calendarOutcomeFilter]);

  // Handle Export of current calendar
  const handleExportCurrentCalendar = () => {
    if (currentFixtures.length === 0) {
      alert('Non ci sono partite nel calendario attuale da esportare.');
      return;
    }

    const { fileName, payload } = exportCalendarToFile(
      currentFixtures,
      exportSeasonCode,
      teamName,
      `Stagione ${exportSeasonCode}`
    );

    // Also automatically add a copy to archivedCalendars if not already present
    const exists = archivedCalendars.some(c => c.seasonCode === payload.seasonCode || c.fileName === fileName);
    if (!exists) {
      const updated = [payload, ...archivedCalendars];
      onUpdateArchivedCalendars(updated);
      setSelectedArchivedCalendarId(payload.id);
    }

    setExportSuccessToast(`File "${fileName}" esportato e scaricato con successo! Salvato anche nell'archivio storico.`);
    setTimeout(() => setExportSuccessToast(null), 5000);
  };

  // Handle File Upload of old calendar
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = parseUploadedCalendarFile(content, file.name);

        // Update list or replace existing if same ID/code
        const filtered = archivedCalendars.filter(c => c.id !== parsed.id && c.fileName !== parsed.fileName);
        const updated = [parsed, ...filtered];
        onUpdateArchivedCalendars(updated);
        setSelectedArchivedCalendarId(parsed.id);
        setActiveSubTab('calendars');

        setExportSuccessToast(`Calendario "${parsed.fileName}" (${parsed.season}, ${parsed.fixtures.length} partite) caricato correttamente nell'Archivio!`);
        setTimeout(() => setExportSuccessToast(null), 5000);
      } catch (err: any) {
        setUploadError(err.message || 'Errore durante la lettura del file. Verifica che sia un JSON valido.');
      }
    };
    reader.onerror = () => {
      setUploadError('Impossibile leggere il file selezionato.');
    };
    reader.readAsText(file);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle Save or Create Season Award
  const handleSaveSeasonAward = (season: SeasonHistoryEntry) => {
    if (!season.season.trim()) {
      alert('Inserisci il nome o l\'anno della stagione (es. 2026/2027).');
      return;
    }

    const updatedSeason: SeasonHistoryEntry = {
      ...season,
      seasonCode: season.seasonCode || season.season.replace(/[^0-9]/g, '').slice(-4) || '2627',
      updatedAt: new Date().toISOString()
    };

    if (isCreatingSeason) {
      const updated = [updatedSeason, ...historyAwards];
      onUpdateHistoryAwards(updated);
      setExpandedSeasonId(updatedSeason.id);
    } else {
      const updated = historyAwards.map(item => item.id === updatedSeason.id ? updatedSeason : item);
      onUpdateHistoryAwards(updated);
    }

    setEditingSeason(null);
    setIsCreatingSeason(false);
  };

  // Apply data from active calendar or an archived calendar
  const handleApplyDataFromCalendar = (sourceId: string, baseSeason?: SeasonHistoryEntry | null) => {
    let targetFixtures: Fixture[] = currentFixtures;
    let sourceName = 'Calendario Attivo';

    if (sourceId !== 'active') {
      const foundArch = archivedCalendars.find(c => c.id === sourceId);
      if (foundArch) {
        targetFixtures = foundArch.fixtures;
        sourceName = `Calendario ${foundArch.season} (${foundArch.teamName || 'Archivio'})`;
      }
    }

    const extracted = extractSeasonDataFromFixtures(
      targetFixtures,
      currentDate,
      historyAwards.map(h => h.season)
    );

    const target = baseSeason || editingSeason;
    if (target) {
      setEditingSeason({
        ...target,
        season: extracted.seasonLabel,
        seasonCode: extracted.seasonCode,
        stats: extracted.stats,
        competitionsSummary: extracted.competitionsSummary,
        topScorer: extracted.topScorer || target.topScorer || '',
        notes: extracted.notes || target.notes || '',
      });
      setCalendarImportToast(`Dati sincronizzati da "${sourceName}": ${extracted.stats.played} gare (${extracted.stats.won}V, ${extracted.stats.drawn}P, ${extracted.stats.lost}S) • ${extracted.stats.goalsFor}-${extracted.stats.goalsAgainst} reti!`);
      setTimeout(() => setCalendarImportToast(null), 5000);
    }
  };

  // Handle Add New Season (Pre-populates automatically from calendar performance)
  const handleStartCreateSeason = () => {
    // Automatically extract data from active calendar (Riepilogo Rendimento Calendario)
    const extracted = extractSeasonDataFromFixtures(
      currentFixtures,
      currentDate,
      historyAwards.map(h => h.season)
    );

    const newSeason: SeasonHistoryEntry = {
      id: `h_${Date.now()}`,
      season: extracted.seasonLabel,
      seasonCode: extracted.seasonCode,
      trophiesWon: [],
      competitionsSummary: extracted.competitionsSummary,
      individualAwards: [],
      topScorer: extracted.topScorer,
      bestPlayer: '',
      stats: extracted.stats,
      notes: extracted.notes
    };

    setSelectedSourceCalendarId('active');
    setEditingSeason(newSeason);
    setIsCreatingSeason(true);
    setCalendarImportToast(`Dati prelevati automaticamente dal Riepilogo Rendimento Calendario (${extracted.stats.played} partite).`);
    setTimeout(() => setCalendarImportToast(null), 4000);
  };

  // Handle Delete Season Award
  const confirmDeleteSeason = () => {
    if (!seasonToDelete) return;
    const updated = historyAwards.filter(s => s.id !== seasonToDelete);
    onUpdateHistoryAwards(updated);
    setSeasonToDelete(null);
  };

  // Handle Delete Archived Calendar
  const confirmDeleteCalendar = () => {
    if (!calendarToDelete) return;
    const updated = archivedCalendars.filter(c => c.id !== calendarToDelete);
    onUpdateArchivedCalendars(updated);
    if (selectedArchivedCalendarId === calendarToDelete) {
      setSelectedArchivedCalendarId(updated[0]?.id || null);
    }
    setCalendarToDelete(null);
  };

  // Handle Restore Archived Calendar to active squad calendar
  const confirmRestoreCalendar = () => {
    if (!calendarToRestore || !onRestoreCalendarToActive) return;
    onRestoreCalendarToActive(calendarToRestore.fixtures);
    setExportSuccessToast(`Calendario "${calendarToRestore.season}" ripristinato come calendario attivo della squadra!`);
    setTimeout(() => setExportSuccessToast(null), 5000);
    setCalendarToRestore(null);
  };

  return (
    <div className="space-y-6">
      {/* Toast notification */}
      {exportSuccessToast && (
        <div className="bg-emerald-950/90 border border-emerald-500/40 text-emerald-200 px-4 py-3 rounded-2xl shadow-2xl flex items-center justify-between text-xs animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-medium">{exportSuccessToast}</span>
          </div>
          <button
            onClick={() => setExportSuccessToast(null)}
            className="text-emerald-400 hover:text-emerald-200 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500/20 to-yellow-600/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-lg">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2.5 flex-wrap">
                <h1 className="text-xl font-black text-white tracking-tight">Storia & Palmarès del Club</h1>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2.5 py-0.5 rounded-full border border-amber-500/30 font-bold uppercase tracking-wider">
                  Archivio Ufficiale
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                Gestisci il palmarès storico di <strong className="text-slate-200">{teamName}</strong> stagione per stagione,
                registra le competizioni vinte e consulta o scarica i vecchi calendari con le note tattiche del manager.
              </p>
            </div>
          </div>

          {/* Sub-tab switcher */}
          <div className="flex items-center bg-slate-950 p-1 rounded-2xl border border-slate-800 shrink-0 self-start md:self-auto">
            <button
              onClick={() => setActiveSubTab('awards')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                activeSubTab === 'awards'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 shadow-md font-extrabold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Trophy className="w-4 h-4" />
              <span>Palmarès & Premi ({historyAwards.length})</span>
            </button>
            <button
              onClick={() => setActiveSubTab('calendars')}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer ${
                activeSubTab === 'calendars'
                  ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-slate-950 shadow-md font-extrabold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Archivio Calendari ({archivedCalendars.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SUB-TAB 1: PALMARÈS & AWARDS STAGIONALI */}
      {/* ========================================================================= */}
      {activeSubTab === 'awards' && (
        <div className="space-y-6">
          {/* Quick Summary Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center space-x-3.5 shadow-lg">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">Trofei Totali</span>
                <span className="text-xl font-black text-amber-400">{totalTrophiesCount}</span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center space-x-3.5 shadow-lg">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">Campionati Vinti</span>
                <span className="text-xl font-black text-emerald-400">{leagueTitlesCount}</span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center space-x-3.5 shadow-lg">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 shrink-0">
                <Star className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">Coppe Continentali</span>
                <span className="text-xl font-black text-sky-400">{europeanTrophiesCount}</span>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center space-x-3.5 shadow-lg">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] text-slate-400 font-medium block">Coppe Nazionali</span>
                <span className="text-xl font-black text-purple-400">{domesticCupsCount}</span>
              </div>
            </div>
          </div>

          {/* All-time Club Match Record (Vittorie, Pareggi, Sconfitte) */}
          {allTimeClubRecord.played > 0 && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-300 text-xs font-black shrink-0">
                  FM
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <span>Bilancio Storico Complessivo del Club</span>
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Totale cumulativo su {historyAwards.length} {historyAwards.length === 1 ? 'stagione registrata' : 'stagioni registrate'} nel palmarès
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 flex items-center gap-1.5 text-xs font-mono">
                  <span className="text-slate-400 text-[10px]">Partite:</span>
                  <strong className="text-white font-bold">{allTimeClubRecord.played}</strong>
                </div>
                <div className="bg-emerald-950/50 border border-emerald-500/30 px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-mono">
                  <span className="text-emerald-400 text-[10px] font-bold">Vittorie:</span>
                  <strong className="text-emerald-300 font-bold">{allTimeClubRecord.won}</strong>
                </div>
                <div className="bg-amber-950/50 border border-amber-500/30 px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-mono">
                  <span className="text-amber-400 text-[10px] font-bold">Pareggi:</span>
                  <strong className="text-amber-300 font-bold">{allTimeClubRecord.drawn}</strong>
                </div>
                <div className="bg-rose-950/50 border border-rose-500/30 px-3 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-mono">
                  <span className="text-rose-400 text-[10px] font-bold">Sconfitte:</span>
                  <strong className="text-rose-300 font-bold">{allTimeClubRecord.lost}</strong>
                </div>
                <div className="bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 flex items-center gap-1.5 text-xs font-mono">
                  <span className="text-slate-400 text-[10px]">Reti:</span>
                  <strong className="text-slate-200">{allTimeClubRecord.goalsFor}:{allTimeClubRecord.goalsAgainst}</strong>
                </div>
                <div className="bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 flex items-center gap-1.5 text-xs font-mono">
                  <span className="text-slate-400 text-[10px]">Win Rate:</span>
                  <strong className="text-emerald-400 font-bold">{allTimeClubRecord.winRate}%</strong>
                </div>
              </div>
            </div>
          )}

          {/* Action Bar */}
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-400" />
              <span>Stagioni Registrate & Risultati</span>
            </h2>

            <button
              type="button"
              onClick={handleStartCreateSeason}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow-lg shadow-amber-950/40 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Aggiungi Nuova Stagione</span>
            </button>
          </div>

          {/* Seasons List */}
          {historyAwards.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center space-y-4 max-w-lg mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mx-auto">
                <Trophy className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Nessuna Stagione Registrata</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Inizia a costruire la bacheca dei trofei e la storia del tuo club registrando la prima stagione.
                </p>
              </div>
              <button
                type="button"
                onClick={handleStartCreateSeason}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
              >
                + Aggiungi la Prima Stagione
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {historyAwards.map((entry) => {
                const isExpanded = expandedSeasonId === entry.id;
                const trophies = entry.trophiesWon || [];

                return (
                  <div
                    key={entry.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden transition-all duration-200 hover:border-slate-700"
                  >
                    {/* Season Header Banner */}
                    <div
                      onClick={() => setExpandedSeasonId(isExpanded ? null : entry.id)}
                      className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 select-none"
                    >
                      <div className="flex items-center space-x-3.5">
                        <div className="w-10 h-10 rounded-xl bg-[#721c24] border border-red-500/30 flex items-center justify-center text-white font-black text-xs shadow-md shrink-0">
                          {entry.seasonCode || entry.season.slice(-4) || 'FM'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-black text-white tracking-tight">
                              Stagione {entry.season}
                            </h3>
                            {trophies.length > 0 ? (
                              <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/30 flex items-center gap-1">
                                <Trophy className="w-3 h-3 text-amber-400" />
                                {trophies.length} {trophies.length === 1 ? 'Trofeo Vinto' : 'Trofei Vinti'}
                              </span>
                            ) : (
                              <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700">
                                Nessun trofeo vinto
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                            {entry.stats?.played ? (
                              <span className="inline-flex items-center gap-1.5 font-mono text-[11px]">
                                <strong className="text-slate-200">{entry.stats.played} Partite</strong>
                                <span className="text-slate-600">|</span>
                                <span className="text-emerald-400 font-bold">{entry.stats.won || 0}V</span>
                                <span className="text-slate-600">-</span>
                                <span className="text-amber-300 font-bold">{entry.stats.drawn || 0}P</span>
                                <span className="text-slate-600">-</span>
                                <span className="text-rose-400 font-bold">{entry.stats.lost || 0}S</span>
                                {entry.stats.points !== undefined && entry.stats.points > 0 && (
                                  <>
                                    <span className="text-slate-600">|</span>
                                    <span className="text-sky-300 font-bold">{entry.stats.points} Pts</span>
                                  </>
                                )}
                              </span>
                            ) : (
                              <span>Risultati stagionali</span>
                            )}
                            {entry.topScorer && (
                              <>
                                <span>•</span>
                                <span className="text-slate-300">⚽ {entry.topScorer}</span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Trophies Pills & Actions */}
                      <div className="flex items-center space-x-2 self-end sm:self-auto">
                        <div className="hidden md:flex items-center gap-1.5 flex-wrap">
                          {trophies.slice(0, 3).map((t, idx) => (
                            <span
                              key={idx}
                              className="text-[11px] bg-amber-500/10 text-amber-300 font-bold px-2.5 py-1 rounded-lg border border-amber-500/20 flex items-center gap-1 shrink-0"
                            >
                              🏆 {t}
                            </span>
                          ))}
                          {trophies.length > 3 && (
                            <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-1 rounded-lg border border-slate-700">
                              +{trophies.length - 3} altri
                            </span>
                          )}
                        </div>

                        <div className="flex items-center space-x-1 pl-2 border-l border-slate-800">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingSeason({ ...entry });
                              setIsCreatingSeason(false);
                            }}
                            className="p-2 text-slate-400 hover:text-amber-400 rounded-xl hover:bg-slate-800 transition-colors"
                            title="Modifica dati stagione"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSeasonToDelete(entry.id);
                            }}
                            className="p-2 text-slate-400 hover:text-rose-400 rounded-xl hover:bg-slate-800 transition-colors"
                            title="Elimina stagione"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <div className="p-1 text-slate-400">
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Season Expanded Content */}
                    {isExpanded && (
                      <div className="p-5 border-t border-slate-800 bg-slate-950/60 space-y-5 animate-in fade-in duration-200">
                        {/* Trophies Won Grid */}
                        {trophies.length > 0 && (
                          <div>
                            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                              <Trophy className="w-3.5 h-3.5" /> Bacheca Trofei di Stagione
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                              {trophies.map((trophy, tIdx) => (
                                <div
                                  key={tIdx}
                                  className="bg-gradient-to-r from-amber-500/10 to-yellow-500/5 border border-amber-500/30 rounded-xl p-3 flex items-center space-x-3 shadow-md"
                                >
                                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 text-sm shrink-0">
                                    🏆
                                  </div>
                                  <div>
                                    <h4 className="text-xs font-bold text-amber-200">{trophy}</h4>
                                    <span className="text-[10px] text-amber-400/80 font-medium">Vincitore Stagione {entry.season}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Competitions Summary Table */}
                        {entry.competitionsSummary && entry.competitionsSummary.length > 0 && (
                          <div>
                            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-2 flex items-center gap-1.5">
                              <Award className="w-3.5 h-3.5 text-slate-400" /> Piazzamenti per Competizione
                            </span>
                            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-md">
                              <div className="divide-y divide-slate-800 text-xs">
                                {entry.competitionsSummary.map((comp, cIdx) => (
                                  <div
                                    key={cIdx}
                                    className="p-3 flex items-center justify-between hover:bg-slate-800/40 transition-colors"
                                  >
                                    <div className="flex items-center space-x-2.5">
                                      <span className={`w-2 h-2 rounded-full ${comp.isWinner ? 'bg-amber-400' : 'bg-slate-500'}`} />
                                      <span className="font-semibold text-slate-200">{comp.competition}</span>
                                    </div>
                                    <span className={`font-bold px-2.5 py-0.5 rounded-lg text-xs ${
                                      comp.isWinner
                                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                        : 'text-slate-300 bg-slate-950 border border-slate-800'
                                    }`}>
                                      {comp.result}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Stats & Individual Awards Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Season Performance Stats */}
                          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2.5">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                              Statistiche Squadra
                            </span>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80">
                                <span className="text-slate-400 text-[10px] block">Partite Giocate</span>
                                <span className="text-base font-bold text-white">{entry.stats?.played || 0}</span>
                              </div>
                              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80">
                                <span className="text-slate-400 text-[10px] block">V - P - S</span>
                                <div className="flex items-center justify-center gap-1 mt-0.5 text-xs font-bold font-mono">
                                  <span className="text-emerald-400">{entry.stats?.won || 0}V</span>
                                  <span className="text-slate-600">-</span>
                                  <span className="text-amber-300">{entry.stats?.drawn || 0}P</span>
                                  <span className="text-slate-600">-</span>
                                  <span className="text-rose-400">{entry.stats?.lost || 0}S</span>
                                </div>
                              </div>
                              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80">
                                <span className="text-slate-400 text-[10px] block">Gol Fatti / Subiti</span>
                                <span className="text-xs font-bold text-slate-200 block mt-1 font-mono">
                                  {entry.stats?.goalsFor || 0} : {entry.stats?.goalsAgainst || 0}
                                </span>
                              </div>
                              <div className="bg-slate-950 p-2 rounded-lg border border-slate-800/80">
                                <span className="text-slate-400 text-[10px] block">Punti & Win %</span>
                                <span className="text-xs font-bold text-sky-300 block mt-1 font-mono">
                                  {entry.stats?.points ? `${entry.stats.points} Pts` : ''} 
                                  {entry.stats?.played ? ` (${Math.round(((entry.stats.won || 0) / entry.stats.played) * 100)}%)` : ''}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Individual Protagonists */}
                          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2.5">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                              Protagonisti Stagionali
                            </span>
                            <div className="space-y-1.5 text-xs">
                              {entry.topScorer && (
                                <div className="flex items-center justify-between bg-slate-950 p-2 rounded-lg border border-slate-800/80">
                                  <span className="text-slate-400">⚽ Capocannoniere:</span>
                                  <span className="text-slate-200 font-bold">{entry.topScorer}</span>
                                </div>
                              )}
                              {entry.bestPlayer && (
                                <div className="flex items-center justify-between bg-slate-950 p-2 rounded-lg border border-slate-800/80">
                                  <span className="text-slate-400">⭐ Miglior Giocatore:</span>
                                  <span className="text-amber-300 font-bold">{entry.bestPlayer}</span>
                                </div>
                              )}
                              {entry.individualAwards && entry.individualAwards.length > 0 && (
                                <div className="pt-1">
                                  <span className="text-[10px] text-slate-400 block mb-1">Premi Individuali:</span>
                                  <div className="flex flex-wrap gap-1">
                                    {entry.individualAwards.map((ia, iaIdx) => (
                                      <span
                                        key={iaIdx}
                                        className="text-[10px] bg-slate-950 text-slate-300 px-2 py-0.5 rounded border border-slate-800"
                                      >
                                        🎖️ {ia}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Manager Historic Notes */}
                        {entry.notes && (
                          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-1">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                              <FileText className="w-3.5 h-3.5 text-amber-400" /> Memorie & Note del Manager
                            </span>
                            <p className="text-xs text-slate-300 leading-relaxed italic whitespace-pre-wrap">
                              "{entry.notes}"
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: ARCHIVIO VECCHI CALENDARI & PARTITE */}
      {/* ========================================================================= */}
      {activeSubTab === 'calendars' && (
        <div className="space-y-6">
          {/* Top Cards: Export Current & Upload Old */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Card 1: Export Current Calendar */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                    <Download className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Esporta Calendario Attuale</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Salva e scarica il file JSON del calendario della stagione attiva.
                    </p>
                  </div>
                </div>

                <div className="mt-4 p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Partite nel Calendario:</span>
                    <strong className="text-emerald-400 font-mono">{currentFixtures.length} partite</strong>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span>Squadra:</span>
                    <strong className="text-slate-200">{teamName}</strong>
                  </div>
                  <div className="pt-2 border-t border-slate-800">
                    <label className="text-slate-400 block mb-1 text-[11px]">
                      Sigla o Codice Stagione per il File (es. <code className="text-amber-300">2930</code> per <code className="text-amber-300">calendario-2930.json</code>):
                    </label>
                    <div className="flex items-center space-x-2">
                      <span className="text-slate-500 font-mono text-xs">calendario-</span>
                      <input
                        type="text"
                        value={exportSeasonCode}
                        onChange={(e) => setExportSeasonCode(e.target.value)}
                        placeholder="2930"
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white font-mono w-24 text-center focus:border-emerald-500"
                      />
                      <span className="text-slate-500 font-mono text-xs">.json</span>
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleExportCurrentCalendar}
                disabled={currentFixtures.length === 0}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Scarica File (calendario-{exportSeasonCode || 'stagione'}.json)</span>
              </button>
            </div>

            {/* Card 2: Upload Old Calendar */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 bg-sky-500/10 border border-sky-500/20 rounded-xl text-sky-400">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Carica un Vecchio Calendario</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Importa un file scaricato in precedenza (es. <code className="text-sky-300 font-mono">calendario-2930.json</code>) per consultare partite e note.
                    </p>
                  </div>
                </div>

                <div className="mt-4 p-4 border-2 border-dashed border-slate-700 hover:border-sky-500/60 rounded-xl bg-slate-950/60 text-center transition-colors">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".json,.csv"
                    className="hidden"
                    id="calendar-file-upload"
                  />
                  <label
                    htmlFor="calendar-file-upload"
                    className="cursor-pointer flex flex-col items-center justify-center space-y-2"
                  >
                    <Upload className="w-6 h-6 text-sky-400" />
                    <span className="text-xs font-semibold text-slate-200">
                      Clicca per selezionare il file <code className="text-sky-300">calendario-*.json</code>
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Supporta file JSON esportati e liste partite
                    </span>
                  </label>
                </div>

                {uploadError && (
                  <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 p-2 rounded-lg mt-2">
                    ⚠️ {uploadError}
                  </p>
                )}
              </div>

              <div className="text-[11px] text-slate-400 bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center gap-2">
                <Info className="w-4 h-4 text-sky-400 shrink-0" />
                <span>I vecchi calendari vengono salvati nell'archivio storico locale per essere consultati in qualsiasi momento.</span>
              </div>
            </div>
          </div>

          {/* Archived Calendars Library */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <h2 className="text-base font-bold text-white">Libreria Calendari Archiviati</h2>
                <span className="text-xs font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700">
                  {archivedCalendars.length} {archivedCalendars.length === 1 ? 'Stagione' : 'Stagioni'}
                </span>
              </div>

              {/* Selector for archived season */}
              {archivedCalendars.length > 1 && (
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-slate-400">Seleziona Stagione:</span>
                  <select
                    value={selectedArchivedCalendarId || ''}
                    onChange={(e) => setSelectedArchivedCalendarId(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-white text-xs rounded-xl px-3 py-1.5 font-bold focus:border-emerald-500"
                  >
                    {archivedCalendars.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.season} ({c.fileName}) • {c.fixtures.length} partite
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {archivedCalendars.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center space-y-3 max-w-lg mx-auto">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto">
                  <Calendar className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-white">Nessun Calendario Archiviato</h3>
                <p className="text-xs text-slate-400">
                  Esporta il calendario attuale o carica un file <code className="text-emerald-300">calendario-2930.json</code> per visualizzare le vecchie partite e le note storiche.
                </p>
              </div>
            ) : currentSelectedCalendar && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden space-y-4 p-5">
                {/* Selected Calendar Banner */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-black text-xs shrink-0">
                      {currentSelectedCalendar.seasonCode || 'FM'}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2 flex-wrap">
                        <h3 className="text-base font-bold text-white">
                          Stagione {currentSelectedCalendar.season}
                        </h3>
                        <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          {currentSelectedCalendar.fileName}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {currentSelectedCalendar.teamName} • {currentSelectedCalendar.fixtures.length} partite registrate
                      </p>
                    </div>
                  </div>

                  {/* Actions for this archived calendar */}
                  <div className="flex items-center space-x-2 self-end sm:self-auto">
                    {onRestoreCalendarToActive && (
                      <button
                        type="button"
                        onClick={() => setCalendarToRestore(currentSelectedCalendar)}
                        className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-semibold rounded-xl border border-amber-500/30 flex items-center gap-1 transition-all cursor-pointer"
                        title="Carica questo vecchio calendario come calendario attivo della squadra"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Ripristina come Attivo</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        exportCalendarToFile(
                          currentSelectedCalendar.fixtures,
                          currentSelectedCalendar.seasonCode,
                          currentSelectedCalendar.teamName,
                          currentSelectedCalendar.season
                        );
                      }}
                      className="p-2 text-slate-400 hover:text-emerald-400 rounded-xl hover:bg-slate-800 transition-colors"
                      title="Scarica di nuovo il file"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCalendarToDelete(currentSelectedCalendar.id)}
                      className="p-2 text-slate-400 hover:text-rose-400 rounded-xl hover:bg-slate-800 transition-colors"
                      title="Rimuovi dall'archivio locale"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Performance Stats of this archived calendar */}
                {currentSelectedCalendar.stats && (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-center">
                      <span className="text-slate-400 text-[10px] block">Partite Totali</span>
                      <strong className="text-white text-sm">{currentSelectedCalendar.stats.totalFixtures}</strong>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-center">
                      <span className="text-slate-400 text-[10px] block">Vittorie</span>
                      <strong className="text-emerald-400 text-sm">{currentSelectedCalendar.stats.wins}</strong>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-center">
                      <span className="text-slate-400 text-[10px] block">Pareggi</span>
                      <strong className="text-amber-300 text-sm">{currentSelectedCalendar.stats.draws}</strong>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-center">
                      <span className="text-slate-400 text-[10px] block">Sconfitte</span>
                      <strong className="text-rose-400 text-sm">{currentSelectedCalendar.stats.losses}</strong>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-center col-span-2 sm:col-span-1">
                      <span className="text-slate-400 text-[10px] block">Gol Fatti / Subiti</span>
                      <strong className="text-slate-200 text-sm">
                        {currentSelectedCalendar.stats.goalsScored || 0} : {currentSelectedCalendar.stats.goalsConceded || 0}
                      </strong>
                    </div>
                  </div>
                )}

                {/* Filters & Search Toolbar */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Cerca avversario o parola chiave nelle note tattiche..."
                      value={calendarSearchTerm}
                      onChange={(e) => setCalendarSearchTerm(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 placeholder-slate-500"
                    />
                  </div>

                  <div className="flex items-center space-x-2 overflow-x-auto">
                    {/* Competition filter */}
                    <select
                      value={calendarCompFilter}
                      onChange={(e) => setCalendarCompFilter(e.target.value)}
                      className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-xl px-2.5 py-2 font-medium"
                    >
                      <option value="Tutte">Tutte le Competizioni</option>
                      {archivedCompetitions.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>

                    {/* Outcome filter */}
                    <div className="flex items-center bg-slate-950 p-0.5 rounded-xl border border-slate-800 shrink-0 text-xs">
                      {(['Tutte', 'Vittorie', 'Pareggi', 'Sconfitte', 'Note'] as const).map(f => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setCalendarOutcomeFilter(f)}
                          className={`px-2.5 py-1.5 rounded-lg font-medium transition-all ${
                            calendarOutcomeFilter === f
                              ? 'bg-emerald-600 text-white font-bold shadow'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {f === 'Note' ? '📝 Con Note' : f}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Fixtures Table with Tactical Notes Viewer */}
                <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-slate-900/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                          <th className="py-2.5 px-3">Data</th>
                          <th className="py-2.5 px-3">Competizione</th>
                          <th className="py-2.5 px-3">Avversario</th>
                          <th className="py-2.5 px-3">Sede</th>
                          <th className="py-2.5 px-3 text-center">Risultato</th>
                          <th className="py-2.5 px-4">Note Tattiche del Manager</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {filteredArchivedFixtures.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-slate-500">
                              Nessuna partita trovata con i filtri selezionati.
                            </td>
                          </tr>
                        ) : (
                          filteredArchivedFixtures.map((fixture, idx) => {
                            const scoreMatch = fixture.score?.match(/(\d+)\s*[-:]\s*(\d+)/);
                            const res = getFixtureResult(fixture);
                            let outcomeColor = 'text-slate-300 bg-slate-800 border-slate-700';
                            let outcomeBadge = null;
                            if (res) {
                              if (res.isWin) {
                                outcomeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold';
                                outcomeBadge = <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 mr-1.5">V</span>;
                              } else if (res.isDraw) {
                                outcomeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold';
                                outcomeBadge = <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 mr-1.5">P</span>;
                              } else {
                                outcomeColor = 'bg-rose-500/20 text-rose-300 border-rose-500/40 font-bold';
                                outcomeBadge = <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 mr-1.5">S</span>;
                              }
                            }

                            return (
                              <tr key={fixture.id || idx} className="hover:bg-slate-900/50 transition-colors">
                                <td className="py-2.5 px-3 font-mono text-slate-300 whitespace-nowrap">
                                  {fixture.date}
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-slate-300 font-semibold inline-block">
                                    {fixture.competition}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 font-bold text-white">
                                  {fixture.opponent}
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                    fixture.venue === 'Casa' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-400'
                                  }`}>
                                    {fixture.venue}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                  {fixture.score ? (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono text-xs border ${outcomeColor}`}>
                                      {outcomeBadge}
                                      <span>{res ? res.displayScore : fixture.score}</span>
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-500 font-mono">{fixture.status}</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-4">
                                  {fixture.tacticalNotes ? (
                                    <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2 text-[11px] text-slate-300 max-w-lg leading-snug">
                                      <span className="text-amber-400 font-semibold mr-1.5">📝</span>
                                      {fixture.tacticalNotes}
                                    </div>
                                  ) : (
                                    <span className="text-slate-600 text-[10px] italic">- Nessuna nota registrata -</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: EDIT / CREATE SEASON AWARD & PALMARÈS */}
      {/* ========================================================================= */}
      {editingSeason && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
                  <Trophy className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white">
                  {isCreatingSeason ? 'Aggiungi Nuova Stagione al Palmarès' : `Modifica Stagione ${editingSeason.season}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingSeason(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs max-h-[70vh] overflow-y-auto pr-1">
              {/* Calendar Sync & Source Header */}
              <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-950 p-3.5 rounded-xl border border-emerald-500/30 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg shrink-0">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-1.5 flex-wrap">
                        <span>Dati dal Riepilogo Rendimento Calendario</span>
                        <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-semibold px-2 py-0.5 rounded-full border border-emerald-500/30">
                          {isCreatingSeason ? 'Pre-compilato Automaticamente' : 'Sincronizzabile'}
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Statistiche, bilancio gare, competizioni e marcatori estratti dal calendario. Puoi correggere o arricchire qualsiasi dato nei campi sottostanti.
                      </p>
                    </div>
                  </div>
                </div>

                {calendarImportToast && (
                  <div className="p-2 bg-emerald-950/80 border border-emerald-500/40 rounded-lg text-[11px] text-emerald-300 flex items-center gap-2 animate-in fade-in">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                    <span>{calendarImportToast}</span>
                  </div>
                )}

                {/* Calendar Source Selector & Re-sync Button */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center space-x-2 text-xs flex-1">
                    <label className="text-slate-400 text-[11px] shrink-0 font-medium">Sorgente Calendario:</label>
                    <select
                      value={selectedSourceCalendarId}
                      onChange={(e) => {
                        const newSource = e.target.value;
                        setSelectedSourceCalendarId(newSource);
                        handleApplyDataFromCalendar(newSource);
                      }}
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white cursor-pointer"
                    >
                      <option value="active">
                        Calendario Attivo ({currentFixtures.length} gare • {calculateCalendarStats(currentFixtures).played} giocate)
                      </option>
                      {archivedCalendars.map((arch) => (
                        <option key={arch.id} value={arch.id}>
                          Archivio: {arch.season} ({arch.fixtures.length} gare • {arch.stats.played} giocate)
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleApplyDataFromCalendar(selectedSourceCalendarId)}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer shrink-0"
                    title="Ricarica statistiche e rendimento dal calendario selezionato"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Ricarica Dati</span>
                  </button>
                </div>
              </div>

              {/* Season Year & Code */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Nome / Anno Stagione (es. 2026/2027 o 28/29)</label>
                  <input
                    type="text"
                    value={editingSeason.season}
                    onChange={(e) => setEditingSeason({ ...editingSeason, season: e.target.value })}
                    placeholder="2026/2027"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Sigla Breve (es. 2627 o 2829)</label>
                  <input
                    type="text"
                    value={editingSeason.seasonCode || ''}
                    onChange={(e) => setEditingSeason({ ...editingSeason, seasonCode: e.target.value })}
                    placeholder="2627"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  />
                </div>
              </div>

              {/* Trophies Won Section */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
                <label className="text-amber-400 font-bold block flex items-center gap-1.5">
                  <Trophy className="w-4 h-4" /> Trofei Vinti in Questa Stagione (Bacheca)
                </label>

                {/* Selected trophies tags */}
                <div className="flex flex-wrap gap-1.5 min-h-[32px] p-2 bg-slate-900 rounded-lg border border-slate-800">
                  {editingSeason.trophiesWon && editingSeason.trophiesWon.length > 0 ? (
                    editingSeason.trophiesWon.map((t, idx) => (
                      <span
                        key={idx}
                        className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1"
                      >
                        🏆 {t}
                        <button
                          type="button"
                          onClick={() => {
                            const updated = editingSeason.trophiesWon.filter((_, i) => i !== idx);
                            setEditingSeason({ ...editingSeason, trophiesWon: updated });
                          }}
                          className="hover:text-rose-400 ml-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="text-slate-500 text-[11px] italic">Nessun trofeo aggiunto. Seleziona qui sotto o inserisci un trofeo custom.</span>
                  )}
                </div>

                {/* Quick select trophies pills */}
                <div>
                  <span className="text-[10px] text-slate-400 block mb-1">Aggiungi rapidamente un trofeo comune:</span>
                  <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                    {COMMON_TROPHIES.map(tName => {
                      const isSelected = editingSeason.trophiesWon?.includes(tName);
                      return (
                        <button
                          key={tName}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setEditingSeason({
                                ...editingSeason,
                                trophiesWon: editingSeason.trophiesWon.filter(t => t !== tName)
                              });
                            } else {
                              setEditingSeason({
                                ...editingSeason,
                                trophiesWon: [...(editingSeason.trophiesWon || []), tName]
                              });
                            }
                          }}
                          className={`text-[10px] px-2 py-0.5 rounded border transition-all ${
                            isSelected
                              ? 'bg-amber-500 text-slate-950 font-bold border-amber-400'
                              : 'bg-slate-900 text-slate-400 hover:text-white border-slate-800'
                          }`}
                        >
                          + {tName}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Custom Trophy Input */}
                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="text"
                    value={customTrophyInput}
                    onChange={(e) => setCustomTrophyInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customTrophyInput.trim()) {
                        e.preventDefault();
                        setEditingSeason({
                          ...editingSeason,
                          trophiesWon: [...(editingSeason.trophiesWon || []), customTrophyInput.trim()]
                        });
                        setCustomTrophyInput('');
                      }
                    }}
                    placeholder="Nome trofeo personalizzato (es. Coppa di Lega, Mondiale Club)..."
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customTrophyInput.trim()) {
                        setEditingSeason({
                          ...editingSeason,
                          trophiesWon: [...(editingSeason.trophiesWon || []), customTrophyInput.trim()]
                        });
                        setCustomTrophyInput('');
                      }
                    }}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs"
                  >
                    Aggiungi
                  </button>
                </div>
              </div>

              {/* Competitions Summary Editor */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-slate-200 font-bold block">
                    Piazzamenti & Risultati Competizioni
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSeason({
                        ...editingSeason,
                        competitionsSummary: [
                          ...(editingSeason.competitionsSummary || []),
                          { competition: 'Nuova Competizione', result: '1° Posto Campioni 🏆', isWinner: true }
                        ]
                      });
                    }}
                    className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    + Aggiungi Competizione
                  </button>
                </div>

                <div className="space-y-2">
                  {(editingSeason.competitionsSummary || []).map((comp, cIdx) => (
                    <div key={cIdx} className="flex items-center space-x-2 bg-slate-900 p-2 rounded-lg border border-slate-800">
                      <input
                        type="text"
                        value={comp.competition}
                        onChange={(e) => {
                          const updated = [...editingSeason.competitionsSummary];
                          updated[cIdx].competition = e.target.value;
                          setEditingSeason({ ...editingSeason, competitionsSummary: updated });
                        }}
                        placeholder="Nome Competizione"
                        className="w-1/3 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                      />
                      <input
                        type="text"
                        value={comp.result}
                        onChange={(e) => {
                          const updated = [...editingSeason.competitionsSummary];
                          updated[cIdx].result = e.target.value;
                          setEditingSeason({ ...editingSeason, competitionsSummary: updated });
                        }}
                        placeholder="Risultato (es. Vincitore 🏆, Semifinale)"
                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                      />
                      <label className="flex items-center space-x-1 cursor-pointer text-[10px] text-amber-300 shrink-0">
                        <input
                          type="checkbox"
                          checked={Boolean(comp.isWinner)}
                          onChange={(e) => {
                            const updated = [...editingSeason.competitionsSummary];
                            updated[cIdx].isWinner = e.target.checked;
                            setEditingSeason({ ...editingSeason, competitionsSummary: updated });
                          }}
                          className="w-3.5 h-3.5 rounded text-amber-500"
                        />
                        <span>Vinto 🏆</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = editingSeason.competitionsSummary.filter((_, i) => i !== cIdx);
                          setEditingSeason({ ...editingSeason, competitionsSummary: updated });
                        }}
                        className="text-slate-500 hover:text-rose-400 p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Season Stats & Match Balance Editor */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-slate-200 font-bold text-xs flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-amber-400" />
                    <span>Statistiche & Bilancio Risultati (Partite, V-P-S, Reti, Punti)</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        const w = editingSeason.stats?.won || 0;
                        const d = editingSeason.stats?.drawn || 0;
                        const l = editingSeason.stats?.lost || 0;
                        setEditingSeason({
                          ...editingSeason,
                          stats: {
                            ...editingSeason.stats,
                            played: w + d + l,
                          },
                        });
                      }}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
                      title="Imposta Partite Giocate = Vittorie + Pareggi + Sconfitte"
                    >
                      Somma Partite (V+P+S)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const w = editingSeason.stats?.won || 0;
                        const d = editingSeason.stats?.drawn || 0;
                        setEditingSeason({
                          ...editingSeason,
                          stats: {
                            ...editingSeason.stats,
                            points: w * 3 + d,
                          },
                        });
                      }}
                      className="text-[10px] text-sky-400 hover:text-sky-300 underline cursor-pointer"
                      title="Calcola punti con formula standard (Vittorie × 3 + Pareggi)"
                    >
                      Calcola Punti (V×3 + P)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                  <div>
                    <label className="text-slate-400 block mb-1 text-[10px]">Partite Giocate</label>
                    <input
                      type="number"
                      min={0}
                      value={editingSeason.stats?.played ?? 0}
                      onChange={(e) => setEditingSeason({
                        ...editingSeason,
                        stats: { ...editingSeason.stats, played: parseInt(e.target.value, 10) || 0 }
                      })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white font-mono text-xs text-center"
                    />
                  </div>
                  <div>
                    <label className="text-emerald-400 block mb-1 text-[10px] font-bold">Vittorie (V)</label>
                    <input
                      type="number"
                      min={0}
                      value={editingSeason.stats?.won ?? 0}
                      onChange={(e) => setEditingSeason({
                        ...editingSeason,
                        stats: { ...editingSeason.stats, won: parseInt(e.target.value, 10) || 0 }
                      })}
                      className="w-full bg-slate-900 border border-emerald-500/40 rounded-lg px-2 py-1.5 text-emerald-300 font-mono text-xs font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="text-amber-300 block mb-1 text-[10px] font-bold">Pareggi (P)</label>
                    <input
                      type="number"
                      min={0}
                      value={editingSeason.stats?.drawn ?? 0}
                      onChange={(e) => setEditingSeason({
                        ...editingSeason,
                        stats: { ...editingSeason.stats, drawn: parseInt(e.target.value, 10) || 0 }
                      })}
                      className="w-full bg-slate-900 border border-amber-500/40 rounded-lg px-2 py-1.5 text-amber-300 font-mono text-xs font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="text-rose-400 block mb-1 text-[10px] font-bold">Sconfitte (S)</label>
                    <input
                      type="number"
                      min={0}
                      value={editingSeason.stats?.lost ?? 0}
                      onChange={(e) => setEditingSeason({
                        ...editingSeason,
                        stats: { ...editingSeason.stats, lost: parseInt(e.target.value, 10) || 0 }
                      })}
                      className="w-full bg-slate-900 border border-rose-500/40 rounded-lg px-2 py-1.5 text-rose-300 font-mono text-xs font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1 text-[10px]">Gol Fatti</label>
                    <input
                      type="number"
                      min={0}
                      value={editingSeason.stats?.goalsFor ?? 0}
                      onChange={(e) => setEditingSeason({
                        ...editingSeason,
                        stats: { ...editingSeason.stats, goalsFor: parseInt(e.target.value, 10) || 0 }
                      })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white font-mono text-xs text-center"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1 text-[10px]">Gol Subiti</label>
                    <input
                      type="number"
                      min={0}
                      value={editingSeason.stats?.goalsAgainst ?? 0}
                      onChange={(e) => setEditingSeason({
                        ...editingSeason,
                        stats: { ...editingSeason.stats, goalsAgainst: parseInt(e.target.value, 10) || 0 }
                      })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-white font-mono text-xs text-center"
                    />
                  </div>
                  <div>
                    <label className="text-sky-300 block mb-1 text-[10px] font-bold">Punti Totali</label>
                    <input
                      type="number"
                      min={0}
                      value={editingSeason.stats?.points ?? 0}
                      onChange={(e) => setEditingSeason({
                        ...editingSeason,
                        stats: { ...editingSeason.stats, points: parseInt(e.target.value, 10) || 0 }
                      })}
                      className="w-full bg-slate-900 border border-sky-500/40 rounded-lg px-2 py-1.5 text-sky-300 font-mono text-xs font-bold text-center"
                    />
                  </div>
                </div>

                {/* Match Balance Summary indicator */}
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-900">
                  <span className="flex items-center gap-1.5 font-mono">
                    <span>Bilancio:</span>
                    <span className="text-emerald-400 font-bold">{editingSeason.stats?.won || 0}V</span>
                    <span>-</span>
                    <span className="text-amber-300 font-bold">{editingSeason.stats?.drawn || 0}P</span>
                    <span>-</span>
                    <span className="text-rose-400 font-bold">{editingSeason.stats?.lost || 0}S</span>
                    <span className="text-slate-600">|</span>
                    <span>Totale V+P+S = {(editingSeason.stats?.won || 0) + (editingSeason.stats?.drawn || 0) + (editingSeason.stats?.lost || 0)}</span>
                    {(editingSeason.stats?.played || 0) !== ((editingSeason.stats?.won || 0) + (editingSeason.stats?.drawn || 0) + (editingSeason.stats?.lost || 0)) && (
                      <span className="text-amber-400 font-medium ml-1">
                        (diverso da Partite: {editingSeason.stats?.played || 0})
                      </span>
                    )}
                  </span>
                  <span className="font-mono text-slate-300">
                    Diff. Reti: {(editingSeason.stats?.goalsFor || 0) - (editingSeason.stats?.goalsAgainst || 0) >= 0 ? '+' : ''}
                    {(editingSeason.stats?.goalsFor || 0) - (editingSeason.stats?.goalsAgainst || 0)}
                  </span>
                </div>
              </div>

              {/* Protagonists & Individual Awards */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1 text-[11px]">⚽ Capocannoniere di Squadra</label>
                  <input
                    type="text"
                    list="season-players-list"
                    value={editingSeason.topScorer || ''}
                    onChange={(e) => setEditingSeason({ ...editingSeason, topScorer: e.target.value })}
                    placeholder="es. Evan Ferguson (26 gol)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1 text-[11px]">⭐ Miglior Giocatore / Media Voto</label>
                  <input
                    type="text"
                    list="season-players-list"
                    value={editingSeason.bestPlayer || ''}
                    onChange={(e) => setEditingSeason({ ...editingSeason, bestPlayer: e.target.value })}
                    placeholder="es. Luka Romero (Media 7.42)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
                  />
                </div>
                {players && players.length > 0 && (
                  <datalist id="season-players-list">
                    {players.map((p) => (
                      <option key={p.id} value={p.name} />
                    ))}
                  </datalist>
                )}
              </div>

              {/* Manager Notes */}
              <div>
                <label className="text-slate-400 block mb-1 text-[11px]">📝 Memorie & Note Storiche della Stagione</label>
                <textarea
                  rows={3}
                  value={editingSeason.notes || ''}
                  onChange={(e) => setEditingSeason({ ...editingSeason, notes: e.target.value })}
                  placeholder="Annota le partite memorabili, record di punti, rimonte epiche o aneddoti di spogliatoio..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white"
                />
              </div>
            </div>

            {/* Modal Bottom Actions */}
            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingSeason(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={() => handleSaveSeasonAward(editingSeason)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold shadow-lg shadow-amber-950/40"
              >
                Salva Stagione nel Palmarès
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Deleting Season */}
      <ConfirmDialogModal
        isOpen={seasonToDelete !== null}
        title="Eliminare questa stagione dal Palmarès?"
        message="Sei sicuro di voler rimuovere questa stagione dalla storia del club? Questa operazione non può essere annullata."
        confirmLabel="Elimina Stagione"
        cancelLabel="Annulla"
        isDangerous={true}
        onConfirm={confirmDeleteSeason}
        onCancel={() => setSeasonToDelete(null)}
      />

      {/* Confirmation Dialog for Deleting Archived Calendar */}
      <ConfirmDialogModal
        isOpen={calendarToDelete !== null}
        title="Eliminare questo calendario archiviato?"
        message="Sei sicuro di voler rimuovere questo calendario dall'archivio locale? Se hai scaricato il file potrai comunque ricaricarlo in futuro."
        confirmLabel="Elimina Calendario"
        cancelLabel="Annulla"
        isDangerous={true}
        onConfirm={confirmDeleteCalendar}
        onCancel={() => setCalendarToDelete(null)}
      />

      {/* Confirmation Dialog for Restoring Calendar as active */}
      <ConfirmDialogModal
        isOpen={calendarToRestore !== null}
        title="Ripristinare come Calendario Attivo?"
        message={`Sei sicuro di voler caricare le ${calendarToRestore?.fixtures.length || 0} partite della stagione "${calendarToRestore?.season || ''}" come calendario attivo della squadra?`}
        confirmLabel="Ripristina Calendario"
        cancelLabel="Annulla"
        isDangerous={false}
        onConfirm={confirmRestoreCalendar}
        onCancel={() => setCalendarToRestore(null)}
      />
    </div>
  );
};
