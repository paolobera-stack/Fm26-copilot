import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Fixture, SeasonPhaseInfo, ArchivedSeasonCalendar, Player, YouthSquad } from '../types';
import { Calendar, AlertTriangle, Edit3, Plus, Camera, Sparkles, Trash2, FileText, CheckCircle2, Clock, Trophy, MapPin, ArrowDown, ArrowUp, Download, X, Check, Settings2, Copy, Upload, Archive, FolderOpen, FileCheck2, FastForward, Bell, Filter, ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { CalendarScreenshotUploaderModal } from './CalendarScreenshotUploaderModal';
import { ConfirmDialogModal } from './ConfirmDialogModal';
import { FixtureResultModal, PlayerOption } from './FixtureResultModal';
import { useBackgroundOcr } from '../context/BackgroundOcrContext';
import {
  sortFixturesByDate,
  getContextualFixtures,
  findCalendarMarkerIndex,
  parseDateComponents,
  formatItalianDateWithWeekday,
  getDaysDifference,
  formatRelativeDays,
  getTransferMarketStatus,
  formatItalianDate,
  parseFixtureDate,
  ITALIAN_MONTHS,
} from '../utils/dateUtils';
import { exportCalendarToFile, inferSeasonFromFixtures, parseUploadedCalendarFile, calculateCalendarStats, getFixtureResult } from '../utils/calendarExportUtils';

interface SeasonPhaseCalendarProps {
  phaseInfo?: SeasonPhaseInfo;
  fixtures: Fixture[];
  currentDate?: string;
  teamName?: string;
  players?: Player[];
  youthSquads?: YouthSquad[];
  onOpenEditDateModal?: () => void;
  onUpdateCurrentDate?: (newDate: string) => void;
  onUpdateFixtures: (fixtures: Fixture[]) => void;
  archivedCalendars?: ArchivedSeasonCalendar[];
  onUpdateArchivedCalendars?: (calendars: ArchivedSeasonCalendar[]) => void;
  onOpenRemindersModal?: () => void;
  activeRemindersCount?: number;
}

const DEFAULT_COMPETITIONS = [
  'Premier League',
  'Champions League',
  'Carabao Cup',
  'FA Cup',
  'Amichevole'
];

const SUGGESTED_NEW_COMPETITIONS = [
  'Coppa Intercontinentale',
  'FIFA Club World Cup',
  'Supercoppa UEFA',
  'Community Shield',
  'Europa League',
  'Conference League'
];

export const SeasonPhaseCalendar: React.FC<SeasonPhaseCalendarProps> = ({
  phaseInfo,
  fixtures,
  currentDate,
  teamName = 'La Tua Squadra FC',
  players,
  youthSquads,
  onOpenEditDateModal,
  onUpdateCurrentDate,
  onUpdateFixtures,
  archivedCalendars = [],
  onUpdateArchivedCalendars,
  onOpenRemindersModal,
  activeRemindersCount = 0,
}) => {
  const [editingFixture, setEditingFixture] = useState<Fixture | null>(null);
  const [fixtureToDelete, setFixtureToDelete] = useState<Fixture | null>(null);
  const [isScreenshotModalOpen, setIsScreenshotModalOpen] = useState(false);
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [showClearModal, setShowClearModal] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportSeasonCode, setExportSeasonCode] = useState('2627');
  const [exportSeasonLabel, setExportSeasonLabel] = useState('2026/2027');
  const [exportTeamName, setExportTeamName] = useState(teamName);
  const [exportSuccessToast, setExportSuccessToast] = useState<string | null>(null);
  const [exportedJsonData, setExportedJsonData] = useState<string | null>(null);
  const [copiedNotice, setCopiedNotice] = useState(false);

  // States for JSON Calendar Upload
  const jsonFileInputRef = useRef<HTMLInputElement>(null);
  const [pendingCalendarImport, setPendingCalendarImport] = useState<ArchivedSeasonCalendar | null>(null);
  const [archiveCopyOnImport, setArchiveCopyOnImport] = useState(true);
  const [importErrorToast, setImportErrorToast] = useState<string | null>(null);
  const [isArchivePickerModalOpen, setIsArchivePickerModalOpen] = useState(false);

  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);

  const displayDate = currentDate || phaseInfo?.currentDate || phaseInfo?.currentMonth || '28 Ottobre 2026';

  // Temporal Filtering States (Tutte, Mese Corrente, Intervallo Personalizzato da Data X a Data Y, Mesi specifici)
  const [temporalFilterMode, setTemporalFilterMode] = useState<'all' | 'current_month' | 'custom_range' | string>('all');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [filterCompetition, setFilterCompetition] = useState<string>('ALL');
  const [filterOutcome, setFilterOutcome] = useState<'ALL' | 'Giocata' | 'In Arrivo' | 'Vittoria' | 'Pareggio' | 'Sconfitta'>('ALL');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [copiedCopilotFilter, setCopiedCopilotFilter] = useState(false);

  // Chronologically sorted fixtures
  const sortedFixtures = useMemo(() => {
    return sortFixturesByDate(fixtures);
  }, [fixtures]);

  // Available months present in calendar fixtures
  const availableMonthsInCalendar = useMemo(() => {
    const map = new Map<number, { index: number; name: string; count: number }>();
    fixtures.forEach(f => {
      const comp = parseDateComponents(f.date);
      if (comp) {
        const existing = map.get(comp.month);
        if (existing) {
          existing.count += 1;
        } else {
          map.set(comp.month, {
            index: comp.month,
            name: ITALIAN_MONTHS[comp.month],
            count: 1,
          });
        }
      }
    });
    return Array.from(map.values()).sort((a, b) => {
      const orderA = a.index >= 6 ? a.index - 6 : a.index + 6;
      const orderB = b.index >= 6 ? b.index - 6 : b.index + 6;
      return orderA - orderB;
    });
  }, [fixtures]);

  // Displayed / filtered fixtures according to user criteria
  const displayedFixtures = useMemo(() => {
    let list = [...sortedFixtures];

    // 1. Filtro Temporale (Mese corrente, Intervallo 'Da Data X a Data Y', o mese specifico)
    if (temporalFilterMode === 'current_month') {
      const currentComp = parseDateComponents(displayDate);
      if (currentComp) {
        list = list.filter(f => {
          const fc = parseDateComponents(f.date);
          return fc && fc.month === currentComp.month && fc.year === currentComp.year;
        });
      }
    } else if (temporalFilterMode === 'custom_range') {
      const d1 = parseDateComponents(customStartDate);
      const d2 = parseDateComponents(customEndDate);
      if (d1 && d2) {
        const ts1 = new Date(d1.year, d1.month, d1.day, 0, 0, 0).getTime();
        const ts2 = new Date(d2.year, d2.month, d2.day, 23, 59, 59).getTime();
        const minTs = Math.min(ts1, ts2);
        const maxTs = Math.max(ts1, ts2);
        list = list.filter(f => {
          const ts = parseFixtureDate(f.date);
          return ts >= minTs && ts <= maxTs;
        });
      }
    } else if (typeof temporalFilterMode === 'string' && temporalFilterMode.startsWith('month_')) {
      const mIdx = parseInt(temporalFilterMode.replace('month_', ''), 10);
      list = list.filter(f => {
        const fc = parseDateComponents(f.date);
        return fc && fc.month === mIdx;
      });
    }

    // 2. Filtro Competizione
    if (filterCompetition !== 'ALL') {
      list = list.filter(f => f.competition === filterCompetition);
    }

    // 3. Filtro Esito / Stato
    if (filterOutcome !== 'ALL') {
      if (filterOutcome === 'Giocata') {
        list = list.filter(f => f.status === 'Giocata');
      } else if (filterOutcome === 'In Arrivo') {
        list = list.filter(f => f.status === 'In Arrivo');
      } else {
        list = list.filter(f => f.outcome === filterOutcome);
      }
    }

    return list;
  }, [sortedFixtures, temporalFilterMode, customStartDate, customEndDate, filterCompetition, filterOutcome, displayDate]);

  // Exact chronological index where the current in-game date sits in the calendar
  const markerInsertIndex = useMemo(() => {
    return findCalendarMarkerIndex(displayedFixtures, displayDate);
  }, [displayedFixtures, displayDate]);

  // Stats calculation over displayed fixtures
  const playedCount = displayedFixtures.filter(f => f.status === 'Giocata').length;
  const upcomingCount = displayedFixtures.length - playedCount;

  // Calendar Overall Stats (across all competitions or filtered range)
  const calendarOverallStats = useMemo(() => {
    const s = calculateCalendarStats(displayedFixtures);
    const goalDiff = s.goalsScored - s.goalsConceded;
    const avgGoalsScored = s.played > 0 ? (s.goalsScored / s.played).toFixed(2) : '0.00';
    const avgGoalsConceded = s.played > 0 ? (s.goalsConceded / s.played).toFixed(2) : '0.00';
    const points = s.wins * 3 + s.draws;

    return {
      played: s.played,
      wins: s.wins,
      draws: s.draws,
      losses: s.losses,
      goalsScored: s.goalsScored,
      goalsConceded: s.goalsConceded,
      goalDiff,
      winRate: s.winRate,
      avgGoalsScored,
      avgGoalsConceded,
      points,
    };
  }, [displayedFixtures]);

  const activeFilterDescription = useMemo(() => {
    const parts: string[] = [];
    if (temporalFilterMode === 'current_month') {
      const c = parseDateComponents(displayDate);
      parts.push(`Mese Corrente (${c ? ITALIAN_MONTHS[c.month] : ''})`);
    } else if (temporalFilterMode === 'custom_range') {
      parts.push(`Intervallo: da ${customStartDate || '...'} a ${customEndDate || '...'}`);
    } else if (typeof temporalFilterMode === 'string' && temporalFilterMode.startsWith('month_')) {
      const idx = parseInt(temporalFilterMode.replace('month_', ''), 10);
      parts.push(`Mese di ${ITALIAN_MONTHS[idx]}`);
    }
    if (filterCompetition !== 'ALL') {
      parts.push(filterCompetition);
    }
    if (filterOutcome !== 'ALL') {
      parts.push(`Esito: ${filterOutcome}`);
    }
    return parts.length > 0 ? parts.join(' • ') : null;
  }, [temporalFilterMode, customStartDate, customEndDate, filterCompetition, filterOutcome, displayDate]);

  // Contextual date insights (next match, last played, countdown, transfer market)
  const { nextFixture, lastPlayedFixture, daysToNext, daysSinceLast, isMatchDayToday } = useMemo(() => {
    return getContextualFixtures(fixtures, displayDate);
  }, [fixtures, displayDate]);

  // Next upcoming fixture strictly in the future (after current in-game date)
  const subsequentFixture = useMemo(() => {
    const currentTs = parseFixtureDate(displayDate);
    const future = sortedFixtures.filter((f) => parseFixtureDate(f.date) > currentTs);
    return future.find((f) => f.status === 'In Arrivo') || future[0] || null;
  }, [sortedFixtures, displayDate]);

  const marketStatus = useMemo(() => {
    return getTransferMarketStatus(displayDate);
  }, [displayDate]);

  const fullCurrentDateWithWeekday = useMemo(() => {
    const comp = parseDateComponents(displayDate);
    if (!comp) return displayDate;
    return formatItalianDateWithWeekday(comp.year, comp.month, comp.day);
  }, [displayDate]);

  // Quick swap score handler (e.g. invert 1-2 to 2-1 with one click)
  const handleQuickSwapScore = (fixtureId: string) => {
    const updated = fixtures.map((item) => {
      if (item.id !== fixtureId || !item.score) return item;
      const match = item.score.match(/(\d+)\s*[-:]\s*(\d+)/);
      if (!match) return item;
      const g1 = parseInt(match[1], 10);
      const g2 = parseInt(match[2], 10);
      const swappedScore = `${g2}-${g1}`;
      const newOutcome: 'Vittoria' | 'Pareggio' | 'Sconfitta' = g2 > g1 ? 'Vittoria' : g2 === g1 ? 'Pareggio' : 'Sconfitta';
      return {
        ...item,
        score: swappedScore,
        outcome: newOutcome,
      };
    });
    onUpdateFixtures(updated);
  };

  // Aggregate players from all squads (First Team + Youth Squads) with local storage fallback
  const allPlayers = useMemo<PlayerOption[]>(() => {
    let firstTeam = players || [];
    if (firstTeam.length === 0) {
      try {
        const saved = localStorage.getItem('fm26_players');
        if (saved) firstTeam = JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }

    let squads = youthSquads || [];
    if (squads.length === 0) {
      try {
        const savedYouth = localStorage.getItem('fm26_youth_squads');
        if (savedYouth) squads = JSON.parse(savedYouth);
      } catch (e) {
        // ignore
      }
    }

    const list: PlayerOption[] = [];
    firstTeam.forEach(p => {
      list.push({
        id: p.id,
        name: p.name,
        position: p.position || '',
        squadName: 'Prima Squadra',
        number: p.number,
      });
    });

    squads.forEach(sq => {
      (sq.players || []).forEach(p => {
        list.push({
          id: p.id,
          name: p.name,
          position: p.position || '',
          squadName: sq.name || 'Vivaio',
          number: p.number,
        });
      });
    });

    return list;
  }, [players, youthSquads]);

  // Active competitions extracted from existing fixtures
  const activeCompetitions = useMemo(() => {
    const compSet = new Set<string>();
    fixtures.forEach(f => {
      if (f.competition && f.competition.trim()) {
        compSet.add(f.competition.trim());
      }
    });
    return Array.from(compSet);
  }, [fixtures]);

  // Combined list of all available competitions for selection
  const allAvailableCompetitions = useMemo(() => {
    const set = new Set<string>();
    activeCompetitions.forEach(c => set.add(c));
    DEFAULT_COMPETITIONS.forEach(c => set.add(c));
    return Array.from(set);
  }, [activeCompetitions]);

  // Background OCR hook for screenshots processed in background
  const { completedTasks, applyCalendarFixtures, openReviewModal } = useBackgroundOcr();
  const latestCompletedCalendarTask = completedTasks.find(
    t => t.type === 'calendar' && t.calendarFixtures && t.calendarFixtures.length > 0
  );

  // New manual fixture state
  const [manualDate, setManualDate] = useState(displayDate);
  const [manualOpponent, setManualOpponent] = useState('');
  const [manualVenue, setManualVenue] = useState<'Casa' | 'Trasferta' | 'Campo Neutro'>('Casa');
  const [manualComp, setManualComp] = useState('Premier League');
  const [isCustomComp, setIsCustomComp] = useState(false);
  const [customCompInput, setCustomCompInput] = useState('');
  const [manualImportance, setManualImportance] = useState<'Cruciale' | 'Alta' | 'Media'>('Alta');

  const scrollToBottom = (smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
  };

  const scrollToTop = () => {
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const scrollToMarker = (smooth = true) => {
    if (markerRef.current) {
      markerRef.current.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'center' });
    } else {
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleAdvanceToDate = (targetDate: string) => {
    if (onUpdateCurrentDate) {
      onUpdateCurrentDate(targetDate);
      setTimeout(() => {
        scrollToMarker(true);
      }, 100);
    }
  };

  const renderBookmarkContent = (isEndOfList = false) => (
    <div className="relative bg-slate-900 border-2 border-emerald-500/60 text-emerald-300 text-xs px-4 py-2 rounded-2xl sm:rounded-full font-bold flex flex-wrap items-center justify-center gap-2 sm:gap-3 shadow-xl shadow-emerald-950/80">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
        <span>📍 SEGNALIBRO FM26 • Oggi in-game: {fullCurrentDateWithWeekday}</span>
        {onOpenEditDateModal && (
          <button
            type="button"
            onClick={onOpenEditDateModal}
            className="text-[10px] text-emerald-400 hover:text-white underline cursor-pointer ml-0.5 font-bold"
            title="Cambia data in-game"
          >
            Cambia
          </button>
        )}
      </div>

      {isEndOfList && (
        <span className="text-[10px] font-semibold text-slate-400 bg-slate-950 px-2 py-0.5 rounded-full border border-slate-800">
          (Tutte le gare visualizzate completate o antecedenti)
        </span>
      )}

      {/* Pulsante Avanza Match direttamente sul segnalibro */}
      {onUpdateCurrentDate && nextFixture && daysToNext !== 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleAdvanceToDate(nextFixture.date);
          }}
          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer border border-indigo-400/40 hover:border-indigo-300 hover:shadow-indigo-500/25 shrink-0"
          title={`Avanza la data dell'applicazione al giorno della prossima partita: vs ${nextFixture.opponent} (${nextFixture.date})`}
        >
          <FastForward className="w-3.5 h-3.5 text-indigo-200" />
          <span>Avanza a Match</span>
          <span className="text-[10px] text-indigo-200 font-medium hidden sm:inline">
            ({nextFixture.date})
          </span>
        </button>
      )}

      {onUpdateCurrentDate && daysToNext === 0 && nextFixture && (
        <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
          <span>Match Day Oggi: vs {nextFixture.opponent}!</span>
        </span>
      )}

      {onUpdateCurrentDate && daysToNext === 0 && subsequentFixture && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleAdvanceToDate(subsequentFixture.date);
          }}
          className="px-2.5 py-1 bg-indigo-600/80 hover:bg-indigo-500 active:scale-95 text-white text-xs font-bold rounded-xl shadow transition-all flex items-center gap-1 cursor-pointer border border-indigo-400/30 hover:border-indigo-300 shrink-0"
          title={`Avanza al prossimo match in programma: vs ${subsequentFixture.opponent} (${subsequentFixture.date})`}
        >
          <FastForward className="w-3.5 h-3.5 text-indigo-200" />
          <span>Prossimo Match ({subsequentFixture.date})</span>
        </button>
      )}
    </div>
  );

  // Center on current in-game date marker on initial load
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToMarker(true);
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  // When manual add is toggled, ensure bottom form is visible
  useEffect(() => {
    if (isAddingManual) {
      setTimeout(() => {
        scrollToBottom(true);
      }, 50);
    }
  }, [isAddingManual]);

  const handleScoreUpdate = (
    id: string,
    score: string,
    notes?: string,
    customVenue?: 'Casa' | 'Trasferta' | 'Campo Neutro',
    customDate?: string,
    scorers?: string[],
    newStatus: 'Giocata' | 'In Arrivo' = 'Giocata',
    newOutcome?: 'Vittoria' | 'Pareggio' | 'Sconfitta'
  ) => {
    let playedMatchDate: string | null = null;
    let playedOpponent: string | null = null;

    const updated = fixtures.map((f) => {
      if (f.id === id) {
        const targetDate = customDate || f.date;
        if (newStatus === 'Giocata') {
          playedMatchDate = targetDate;
          playedOpponent = f.opponent;
        }

        let calculatedOutcome = newOutcome;
        if (!calculatedOutcome && score && score.includes('-')) {
          const parts = score.split('-');
          const g1 = parseInt(parts[0], 10);
          const g2 = parseInt(parts[1], 10);
          if (!isNaN(g1) && !isNaN(g2)) {
            calculatedOutcome = g1 > g2 ? 'Vittoria' : g1 === g2 ? 'Pareggio' : 'Sconfitta';
          }
        }

        return {
          ...f,
          score: newStatus === 'In Arrivo' ? undefined : (score || `${f.score || '0-0'}`),
          status: newStatus,
          outcome: newStatus === 'In Arrivo' ? undefined : calculatedOutcome,
          tacticalNotes: notes,
          venue: customVenue || f.venue,
          date: targetDate,
          scorers: newStatus === 'In Arrivo' ? undefined : (scorers && scorers.length > 0 ? scorers : undefined),
        };
      }
      return f;
    });
    const sorted = sortFixturesByDate(updated);
    onUpdateFixtures(sorted);
    setEditingFixture(null);

    // Sposta automaticamente la data in-game al giorno della partita compilata
    if (newStatus === 'Giocata' && playedMatchDate && onUpdateCurrentDate) {
      onUpdateCurrentDate(playedMatchDate);
      setExportSuccessToast(
        `Partita contro ${playedOpponent || 'avversario'} compilata (${score})! Data in-game aggiornata automaticamente a: ${playedMatchDate}.`
      );
      setTimeout(() => {
        setExportSuccessToast((current) => current?.includes('Data in-game aggiornata') ? null : current);
      }, 4000);
      setTimeout(() => {
        scrollToMarker(true);
      }, 150);
    }
  };

  const handleRequestDeleteFixture = (fixture: Fixture) => {
    setFixtureToDelete(fixture);
  };

  const handleConfirmDeleteFixture = () => {
    if (fixtureToDelete) {
      onUpdateFixtures(fixtures.filter((f) => f.id !== fixtureToDelete.id));
      setFixtureToDelete(null);
    }
  };

  const handleAddManualFixture = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualOpponent.trim()) return;

    const finalCompetition = isCustomComp && customCompInput.trim()
      ? customCompInput.trim()
      : manualComp;

    const newF: Fixture = {
      id: `manual_f_${Date.now()}`,
      date: manualDate.trim() || displayDate,
      opponent: manualOpponent.trim(),
      venue: manualVenue,
      competition: finalCompetition || 'Amichevole',
      importance: manualImportance,
      status: 'In Arrivo',
      predictedFatigueRisk: 'Medio',
    };

    // Insert and sort fixtures chronologically by date
    const sortedFixtures = sortFixturesByDate([...fixtures, newF]);
    onUpdateFixtures(sortedFixtures);

    if (onUpdateCurrentDate && manualDate) {
      onUpdateCurrentDate(manualDate);
    }
    setManualOpponent('');
    setIsCustomComp(false);
    setCustomCompInput('');
    setIsAddingManual(false);

    // Scroll to bottom after adding
    setTimeout(() => {
      scrollToBottom(true);
    }, 100);
  };

  const handleQuickExport = () => {
    if (fixtures.length === 0) {
      setExportSuccessToast('Nessuna partita nel calendario da esportare.');
      setTimeout(() => setExportSuccessToast(null), 4000);
      return;
    }
    const inferred = inferSeasonFromFixtures(fixtures, displayDate);
    const { fileName, jsonContent } = exportCalendarToFile(
      fixtures,
      inferred.seasonCode,
      teamName,
      inferred.seasonLabel
    );
    setExportedJsonData(jsonContent);
    setExportSuccessToast(`File "${fileName}" esportato e scaricato!`);
    setTimeout(() => setExportSuccessToast(null), 6000);
  };

  const handleOpenExportModal = () => {
    if (fixtures.length === 0) {
      setExportSuccessToast('Nessuna partita nel calendario da esportare.');
      setTimeout(() => setExportSuccessToast(null), 4000);
      return;
    }
    const inferred = inferSeasonFromFixtures(fixtures, displayDate);
    setExportSeasonCode(inferred.seasonCode);
    setExportSeasonLabel(inferred.seasonLabel);
    setExportTeamName(teamName);
    setIsExportModalOpen(true);
  };

  const handleConfirmExport = () => {
    const cleanCode = exportSeasonCode.trim() || '2627';
    const cleanLabel = exportSeasonLabel.trim() || `Stagione ${cleanCode}`;
    const cleanTeam = exportTeamName.trim() || teamName;

    const { fileName, jsonContent } = exportCalendarToFile(
      fixtures,
      cleanCode,
      cleanTeam,
      cleanLabel
    );

    setExportedJsonData(jsonContent);
    setIsExportModalOpen(false);
    setExportSuccessToast(`File "${fileName}" esportato e scaricato con successo!`);
    setTimeout(() => setExportSuccessToast(null), 6000);
  };

  const handleClearAllFixtures = () => {
    setShowClearModal(true);
  };

  const handleConfirmClearAll = () => {
    onUpdateFixtures([]);
    setShowClearModal(false);
  };

  // Handle File Upload of an old calendar JSON
  const handleJsonFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportErrorToast(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = parseUploadedCalendarFile(content, file.name);
        setPendingCalendarImport(parsed);
      } catch (err: any) {
        setImportErrorToast(err.message || 'Errore: il file selezionato non è un file JSON di calendario valido (es. calendario-2930.json).');
        setTimeout(() => setImportErrorToast(null), 6000);
      }
    };
    reader.onerror = () => {
      setImportErrorToast('Impossibile leggere il file selezionato.');
      setTimeout(() => setImportErrorToast(null), 5000);
    };
    reader.readAsText(file);

    // Reset input so re-selecting same file works
    if (jsonFileInputRef.current) {
      jsonFileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = (mode: 'replace' | 'merge') => {
    if (!pendingCalendarImport) return;

    const incomingFixtures = pendingCalendarImport.fixtures;
    const finalFixtures = mode === 'replace'
      ? sortFixturesByDate(incomingFixtures)
      : sortFixturesByDate([...fixtures, ...incomingFixtures]);

    onUpdateFixtures(finalFixtures);

    // If option to save in archived calendars is enabled
    if (archiveCopyOnImport && onUpdateArchivedCalendars) {
      const currentArchives = archivedCalendars || [];
      const filtered = currentArchives.filter(c => c.id !== pendingCalendarImport.id && c.fileName !== pendingCalendarImport.fileName);
      onUpdateArchivedCalendars([pendingCalendarImport, ...filtered]);
    }

    // If replace mode, optionally sync in-game date to the oldest unplayed match
    if (mode === 'replace') {
      const unplayed = finalFixtures.filter(f => f.status === 'In Arrivo');
      if (unplayed.length > 0 && onUpdateCurrentDate) {
        onUpdateCurrentDate(unplayed[0].date);
      }
    }

    setExportSuccessToast(
      `Calendario "${pendingCalendarImport.fileName}" (${pendingCalendarImport.season}, ${pendingCalendarImport.fixtures.length} partite) ${mode === 'replace' ? 'caricato come calendario attivo' : 'unito al calendario attuale'}!`
    );
    setTimeout(() => setExportSuccessToast(null), 6000);

    setPendingCalendarImport(null);
  };

  const handleRestoreFromArchive = (archived: ArchivedSeasonCalendar) => {
    setPendingCalendarImport(archived);
    setIsArchivePickerModalOpen(false);
  };

  const handleImportFixtures = (newFixtures: Fixture[], replaceExisting: boolean) => {
    const combined = replaceExisting ? newFixtures : [...fixtures, ...newFixtures];
    const sorted = sortFixturesByDate(combined);
    onUpdateFixtures(sorted);

    // Se il calendario importato contiene partite giocate, sposta la data all'ultima gara disputata
    const playedMatches = sorted.filter(f => f.status === 'Giocata' && Boolean(f.score));
    if (playedMatches.length > 0 && onUpdateCurrentDate) {
      const latestPlayed = playedMatches[playedMatches.length - 1];
      if (latestPlayed && latestPlayed.date) {
        onUpdateCurrentDate(latestPlayed.date);
      }
    }

    setTimeout(() => {
      scrollToMarker(true);
    }, 200);
  };

  const getCompBadge = (comp: string) => {
    const lower = (comp || '').toLowerCase();
    if (lower.includes('champions')) {
      return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
    }
    if (lower.includes('premier') || lower.includes('serie a') || lower.includes('liga') || lower.includes('bundesliga')) {
      return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    }
    if (lower.includes('europa')) {
      return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    }
    if (lower.includes('conference')) {
      return 'bg-teal-500/20 text-teal-300 border-teal-500/30';
    }
    if (lower.includes('carabao') || lower.includes('fa cup') || lower.includes('coppa italia') || lower.includes('copa')) {
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    }
    if (lower.includes('intercontinental') || lower.includes('intercontinentale') || lower.includes('world cup') || lower.includes('mondiale') || lower.includes('fifa')) {
      return 'bg-amber-400/20 text-amber-200 border-amber-400/40 font-bold';
    }
    if (lower.includes('super') || lower.includes('shield')) {
      return 'bg-sky-500/20 text-sky-300 border-sky-500/30';
    }
    if (lower.includes('amichevole') || lower.includes('friendly')) {
      return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    }
    return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
  };

  return (
    <div className="space-y-6">
      {/* Top Anchor */}
      <div ref={topRef} />

      {/* Background Completed Banner */}
      {latestCompletedCalendarTask && latestCompletedCalendarTask.calendarFixtures && (
        <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-emerald-200 shadow-lg animate-fade-in">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <span className="font-bold text-white block text-sm">
                Scansione screenshot calendario completata in background!
              </span>
              <span className="text-slate-300 text-xs">
                Gemini Vision ha estratto {latestCompletedCalendarTask.calendarFixtures.length} partite da {latestCompletedCalendarTask.fileName}.
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap self-end sm:self-auto">
            <button
              type="button"
              onClick={() => applyCalendarFixtures(latestCompletedCalendarTask.id, true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
            >
              <Check className="w-4 h-4" /> Sostituisci Calendario
            </button>
            <button
              type="button"
              onClick={() => applyCalendarFixtures(latestCompletedCalendarTask.id, false)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4" /> Unisci
            </button>
            <button
              type="button"
              onClick={() => openReviewModal(latestCompletedCalendarTask.id)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer border border-slate-700 transition-colors"
            >
              Rivedi
            </button>
          </div>
        </div>
      )}

      {/* Top Compact Summary Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl px-5 py-3.5 shadow-md flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
            <Calendar className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <span>Calendario Stagionale</span>
              <span className="text-xs font-semibold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                {fixtures.length} partite
              </span>
            </h3>
            <p className="text-[11px] text-slate-400">
              {teamName} • Incontri ordinati cronologicamente
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => jsonFileInputRef.current?.click()}
            className="px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 text-xs font-semibold rounded-xl border border-sky-500/30 hover:border-sky-500/50 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
            title="Carica un vecchio calendario in formato JSON (es. calendario-2930.json)"
          >
            <Upload className="w-3.5 h-3.5 text-sky-400" />
            <span>Carica Calendario JSON</span>
          </button>
          {fixtures.length > 3 && (
            <button
              type="button"
              onClick={() => scrollToBottom(true)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Scorri fino ai controlli in fondo"
            >
              <span>Vai ai Controlli & Aggiungi</span>
              <ArrowDown className="w-3.5 h-3.5 text-emerald-400" />
            </button>
          )}
        </div>
      </div>

      {/* In-Game Date & Upcoming/Recent Match Hub */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800/90 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-400">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Data In-Game Attuale:
                </span>
                <span className="text-sm font-black text-emerald-400">
                  {fullCurrentDateWithWeekday}
                </span>
                {onOpenEditDateModal && (
                  <button
                    type="button"
                    onClick={onOpenEditDateModal}
                    className="px-2 py-0.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                    title="Apri il selettore del calendario annuo per modificare la data in-game"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Cambia Data</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => scrollToMarker(true)}
                  className="px-2 py-0.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                  title="Scorri subito fino al segnalino FM26 nella lista partite"
                >
                  <MapPin className="w-3 h-3 text-indigo-400" />
                  <span>Mostra Segnalino</span>
                </button>
                {onOpenRemindersModal && (
                  <button
                    type="button"
                    onClick={onOpenRemindersModal}
                    className={`px-2 py-0.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-all cursor-pointer border ${
                      activeRemindersCount > 0
                        ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40 animate-pulse'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                    }`}
                    title="Gestisci i promemoria e le scadenze operative legate alla data"
                  >
                    <Bell className="w-3 h-3 text-amber-400" />
                    <span>Promemoria & Scadenze</span>
                    {activeRemindersCount > 0 && (
                      <span className="bg-amber-500 text-slate-950 px-1.5 py-0.2 rounded-full text-[10px] font-black">
                        {activeRemindersCount}
                      </span>
                    )}
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Tutte le scadenze, età dei giocatori e distanze delle partite sono sincronizzate a questo giorno
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`text-xs px-2.5 py-1 rounded-lg border font-semibold flex items-center gap-1.5 ${
                marketStatus.isOpen
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${marketStatus.isOpen ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
              <span>{marketStatus.label}</span>
              {marketStatus.daysRemainingOrUntilNext !== undefined && (
                <span className="text-[10px] text-slate-400 opacity-90">
                  ({marketStatus.isOpen ? `${marketStatus.daysRemainingOrUntilNext}gg rimasti` : `tra ${marketStatus.daysRemainingOrUntilNext}gg`})
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Next Match & Last Match Quick Glance Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Next Match Card */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${isMatchDayToday ? 'bg-amber-400 animate-ping' : 'bg-indigo-400 animate-pulse'}`} />
                {isMatchDayToday ? 'OGGI: Giorno della Partita!' : 'Prossimo Impegno Ufficiale'}
              </span>
              {nextFixture && daysToNext !== null && (
                <span className={`text-[11px] font-extrabold px-2 py-0.5 rounded-md border ${
                  daysToNext === 0
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : daysToNext === 1
                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}>
                  {daysToNext === 0 ? 'Oggi' : daysToNext === 1 ? 'Domani' : `Mancano ${daysToNext} giorni`}
                </span>
              )}
            </div>

            {nextFixture ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-base font-extrabold text-white flex items-center gap-1.5">
                    <span>vs {nextFixture.opponent}</span>
                    <span className="text-xs font-semibold text-slate-400">
                      ({nextFixture.venue === 'Casa' ? 'C' : nextFixture.venue === 'Trasferta' ? 'T' : 'N'})
                    </span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {nextFixture.competition} • <strong className="text-slate-300">{nextFixture.date}</strong>
                  </p>
                </div>

                {onUpdateCurrentDate && daysToNext !== 0 && (
                  <button
                    type="button"
                    onClick={() => handleAdvanceToDate(nextFixture.date)}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                    title={`Avanza la data dell'applicazione al giorno della partita (${nextFixture.date})`}
                  >
                    <FastForward className="w-3.5 h-3.5" />
                    <span>Avanza a Match</span>
                  </button>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic py-2">
                Nessuna partita futura presente in calendario
              </p>
            )}
          </div>

          {/* Last Match Card */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                <span>Ultimo Risultato Registrato</span>
              </span>
              {lastPlayedFixture && daysSinceLast !== null && (
                <span className="text-[11px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">
                  {daysSinceLast === 0 ? 'Giocata oggi' : daysSinceLast === 1 ? 'Ieri' : `${daysSinceLast} giorni fa`}
                </span>
              )}
            </div>

            {lastPlayedFixture ? (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>vs {lastPlayedFixture.opponent}</span>
                    <span className="text-xs font-normal text-slate-400">
                      ({lastPlayedFixture.competition})
                    </span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Disputata il <strong className="text-slate-300">{lastPlayedFixture.date}</strong>
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-xs font-bold text-slate-200 block">
                    {lastPlayedFixture.score || 'Giocata'}
                  </span>
                  {lastPlayedFixture.outcome && (
                    <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded inline-block mt-0.5 ${
                      lastPlayedFixture.outcome === 'Vittoria'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : lastPlayedFixture.outcome === 'Pareggio'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                    }`}>
                      {lastPlayedFixture.outcome}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic py-2">
                Nessun incontro disputato registrato finora
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Fixtures List Section */}
      <div className="space-y-3">
        {fixtures.length === 0 && (
          <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl p-6 bg-slate-950/40">
            <Camera className="w-10 h-10 text-indigo-400 mx-auto mb-3 opacity-60" />
            <h4 className="text-sm font-bold text-slate-200">Nessuna Partita in Calendario</h4>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Puoi caricare un vecchio file di calendario JSON (es. <code className="text-sky-300">calendario-2930.json</code>), uno screenshot della schermata Partite/Calendario di FM26 tramite l'Intelligenza Artificiale Vision oppure aggiungere gli incontri manualmente.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => jsonFileInputRef.current?.click()}
                className="px-4 py-2 bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 text-xs font-semibold rounded-xl border border-sky-500/40 inline-flex items-center gap-1.5 cursor-pointer shadow-md hover:border-sky-400 transition-all"
                title="Carica un file JSON di calendario esportato in precedenza"
              >
                <Upload className="w-4 h-4 text-sky-400" /> Carica Vecchio Calendario JSON
              </button>
              <button
                type="button"
                onClick={() => setIsScreenshotModalOpen(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl shadow-md inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Camera className="w-4 h-4" /> Carica Screenshot Calendario (AI)
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsAddingManual(true);
                  setTimeout(() => scrollToBottom(true), 50);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-emerald-400" /> Aggiungi Manuale
              </button>
            </div>
          </div>
        )}

        {/* Temporal and Custom Range Filter Bar */}
        {fixtures.length > 0 && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 space-y-3 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <Filter className="w-4 h-4" />
              </span>
              <div>
                <span className="text-xs font-bold text-white block">Filtro Temporale Partite & Performance</span>
                <span className="text-[10px] text-slate-400">
                  Visualizza e calcola le statistiche di rendimento per intervalli personalizzati o mesi specifici
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {activeFilterDescription && (
                <button
                  type="button"
                  onClick={() => {
                    setTemporalFilterMode('all');
                    setCustomStartDate('');
                    setCustomEndDate('');
                    setFilterCompetition('ALL');
                    setFilterOutcome('ALL');
                  }}
                  className="px-2.5 py-1 text-[11px] font-semibold text-rose-300 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 rounded-lg flex items-center gap-1 cursor-pointer transition-all"
                >
                  <X className="w-3 h-3" />
                  <span>Azzera Filtri</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsFilterPanelOpen(prev => !prev)}
                className="px-2.5 py-1 text-[11px] font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg flex items-center gap-1 cursor-pointer transition-all"
              >
                <span>Filtri Avanzati</span>
                {isFilterPanelOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
          </div>

          {/* Quick Filter Buttons */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            <button
              type="button"
              onClick={() => setTemporalFilterMode('all')}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer border ${
                temporalFilterMode === 'all'
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20'
                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              Tutte le Gare ({fixtures.length})
            </button>

            <button
              type="button"
              onClick={() => setTemporalFilterMode('current_month')}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer border ${
                temporalFilterMode === 'current_month'
                  ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/20'
                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              Mese Corrente
            </button>

            <button
              type="button"
              onClick={() => {
                setTemporalFilterMode('custom_range');
                if (!customStartDate && fixtures.length > 0) {
                  const sorted = sortFixturesByDate(fixtures);
                  setCustomStartDate(sorted[0].date);
                  setCustomEndDate(displayDate);
                }
              }}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer border ${
                temporalFilterMode === 'custom_range'
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              📅 Intervallo 'Da Data X a Data Y'
            </button>

            {availableMonthsInCalendar.map(m => (
              <button
                key={m.index}
                type="button"
                onClick={() => setTemporalFilterMode(`month_${m.index}`)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer border ${
                  temporalFilterMode === `month_${m.index}`
                    ? 'bg-sky-600 text-white border-sky-400 shadow-md shadow-sky-600/20'
                    : 'bg-slate-950/70 text-slate-400 border-slate-800/80 hover:text-slate-200'
                }`}
              >
                {m.name} ({m.count})
              </button>
            ))}
          </div>

          {/* Custom Date Range Panel */}
          {temporalFilterMode === 'custom_range' && (
            <div className="bg-slate-950/90 border border-amber-500/30 rounded-xl p-3 space-y-2.5 animate-fadeIn">
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-amber-400 font-bold">Da data:</span>
                    <input
                      type="text"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      placeholder="es. 1 Settembre 2026"
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-white text-xs font-medium w-40 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-amber-400 font-bold">A data:</span>
                    <input
                      type="text"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      placeholder="es. 31 Ottobre 2026"
                      className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-white text-xs font-medium w-40 focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-400">Scorciatoie:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const d = parseDateComponents(displayDate);
                      if (d) {
                        const start = new Date(d.year, d.month, d.day - 30);
                        setCustomStartDate(formatItalianDate(start.getFullYear(), start.getMonth(), start.getDate()));
                        setCustomEndDate(displayDate);
                      }
                    }}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-semibold border border-slate-700 cursor-pointer"
                  >
                    Ultimi 30gg
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const played = sortFixturesByDate(fixtures).filter(f => f.status === 'Giocata');
                      if (played.length > 0) {
                        const slice5 = played.slice(-5);
                        setCustomStartDate(slice5[0].date);
                        setCustomEndDate(slice5[slice5.length - 1].date);
                      }
                    }}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-semibold border border-slate-700 cursor-pointer"
                  >
                    Ultime 5 giocate
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const query = `Analizza le performance delle partite da data ${customStartDate || '...'} a data ${customEndDate || '...'}`;
                      navigator.clipboard.writeText(query);
                      setCopiedCopilotFilter(true);
                      setTimeout(() => setCopiedCopilotFilter(false), 2000);
                    }}
                    className="px-2.5 py-0.5 bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 rounded text-[11px] font-bold border border-emerald-800/80 inline-flex items-center gap-1 cursor-pointer"
                    title="Copia il prompt dell'intervallo temporale da incollare nell'AI Copilot"
                  >
                    {copiedCopilotFilter ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-emerald-400" />}
                    <span>{copiedCopilotFilter ? 'Copiato!' : 'Copia per Copilot'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Advanced Filters Drawer (Competizioni & Esito) */}
          {isFilterPanelOpen && (
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-slate-400 font-bold block mb-1">Competizione:</label>
                <select
                  value={filterCompetition}
                  onChange={(e) => setFilterCompetition(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:border-indigo-400 focus:outline-none"
                >
                  <option value="ALL">Tutte le Competizioni</option>
                  {activeCompetitions.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1">Esito / Stato:</label>
                <select
                  value={filterOutcome}
                  onChange={(e) => setFilterOutcome(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-white text-xs focus:border-indigo-400 focus:outline-none"
                >
                  <option value="ALL">Tutti gli stati</option>
                  <option value="Giocata">Solo Concluse (Giocate)</option>
                  <option value="In Arrivo">Solo In Programma (In Arrivo)</option>
                  <option value="Vittoria">Solo Vittorie (V)</option>
                  <option value="Pareggio">Solo Pareggi (P)</option>
                  <option value="Sconfitta">Solo Sconfitte (S)</option>
                </select>
              </div>
            </div>
          )}

          {/* Active Filter Banner */}
          {activeFilterDescription && (
            <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
              <span className="text-indigo-200">
                Filtro attivo: <strong className="text-white">{activeFilterDescription}</strong> ({displayedFixtures.length} partite su {fixtures.length})
              </span>
              <button
                type="button"
                onClick={() => {
                  setTemporalFilterMode('all');
                  setCustomStartDate('');
                  setCustomEndDate('');
                  setFilterCompetition('ALL');
                  setFilterOutcome('ALL');
                }}
                className="text-indigo-300 hover:text-white underline cursor-pointer text-[11px]"
              >
                Rimuovi
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty Filter State */}
      {fixtures.length > 0 && displayedFixtures.length === 0 && (
        <div className="text-center py-10 border border-dashed border-slate-800 rounded-2xl p-6 bg-slate-950/40">
          <Filter className="w-8 h-8 text-amber-400 mx-auto mb-2 opacity-70" />
          <h4 className="text-sm font-bold text-slate-200">Nessuna Partita Trovata nell'Intervallo</h4>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Nessun incontro del calendario soddisfa i criteri di data o competizione selezionati. Prova a modificare le date o a reimpostare il filtro.
          </p>
          <button
            type="button"
            onClick={() => {
              setTemporalFilterMode('all');
              setCustomStartDate('');
              setCustomEndDate('');
              setFilterCompetition('ALL');
              setFilterOutcome('ALL');
            }}
            className="mt-3 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 inline-flex items-center gap-1.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5 text-rose-400" /> Azzera Filtro
          </button>
        </div>
      )}

      {displayedFixtures.map((f, idx) => {
          const isPlayed = f.status === 'Giocata';
          const isNextMatch = f.id === nextFixture?.id;
          const diffDays = getDaysDifference(displayDate, f.date);
          const relativeBadgeText = formatRelativeDays(diffDays);

          return (
            <React.Fragment key={f.id}>
              {/* Visual Divider indicating "Current In-Game Date" placed at its exact chronological position */}
              {idx === markerInsertIndex && (
                <div ref={markerRef} className="relative py-2.5 flex items-center justify-center my-3 transition-all scroll-mt-24">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t-2 border-emerald-500/50 shadow-sm" />
                  </div>
                  {renderBookmarkContent(false)}
                </div>
              )}

              <div
                className={`p-4 rounded-xl border transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-3 ${
                  diffDays === 0
                    ? 'bg-slate-950/95 border-amber-500/80 ring-2 ring-amber-500/40 shadow-xl shadow-amber-950/40 text-slate-100'
                    : isNextMatch
                    ? 'bg-slate-950/90 border-indigo-500/60 ring-1 ring-indigo-500/30 shadow-lg text-slate-100'
                    : isPlayed
                    ? 'bg-slate-950/60 border-slate-800/80 text-slate-400'
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-200'
                }`}
              >
                {/* Match Date & Competition */}
                <div className="flex items-center space-x-3">
                  <div className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 text-center min-w-[105px]">
                    <span className="text-[10px] text-slate-400 font-medium block">
                      {f.date}
                    </span>
                    <span className={`text-xs font-bold block ${
                      f.venue === 'Casa'
                        ? 'text-emerald-400'
                        : f.venue === 'Trasferta'
                        ? 'text-sky-400'
                        : 'text-amber-400'
                    }`}>
                      {f.venue === 'Casa' ? 'CASA (C)' : f.venue === 'Trasferta' ? 'TRASFERTA (T)' : 'NEUTRO (N)'}
                    </span>
                    {relativeBadgeText && (
                      <span className={`text-[9px] font-semibold px-1.5 py-0.2 rounded mt-1 inline-block ${
                        diffDays === 0
                          ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40 font-bold animate-pulse'
                          : diffDays !== null && diffDays > 0
                          ? 'bg-indigo-500/20 text-indigo-300'
                          : 'text-slate-500'
                      }`}>
                        {relativeBadgeText}
                      </span>
                    )}
                  </div>

                <div>
                  <div className="flex items-center space-x-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${getCompBadge(f.competition)}`}>
                      {f.competition}
                    </span>
                    {f.importance === 'Cruciale' && (
                      <span className="text-[10px] bg-rose-500/20 text-rose-300 px-1.5 py-0.2 rounded border border-rose-500/30">
                        Scontro Diretto / Top Match
                      </span>
                    )}
                  </div>
                  <div className="font-bold text-slate-100 text-base mt-1 flex items-center gap-2 flex-wrap">
                    {f.venue === 'Casa' ? (
                      <>
                        <span className="text-white font-extrabold">{teamName}</span>
                        <span className="text-slate-500 font-normal text-xs">vs</span>
                        <span className="text-slate-300 font-semibold">{f.opponent}</span>
                      </>
                    ) : f.venue === 'Trasferta' ? (
                      <>
                        <span className="text-slate-300 font-semibold">{f.opponent}</span>
                        <span className="text-slate-500 font-normal text-xs">vs</span>
                        <span className="text-white font-extrabold">{teamName}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-white font-extrabold">{teamName}</span>
                        <span className="text-slate-500 font-normal text-xs">vs</span>
                        <span className="text-slate-300 font-semibold">{f.opponent}</span>
                        <span className="text-amber-300/90 text-xs font-semibold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-amber-400" />
                          Neutro
                        </span>
                      </>
                    )}
                  </div>
                  {f.scorers && f.scorers.length > 0 && (
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/70 border border-emerald-500/30 px-2 py-0.5 rounded-lg inline-flex items-center gap-1">
                        <span>⚽</span> Marcatori:
                      </span>
                      {f.scorers.map((scorer, sIdx) => (
                        <span
                          key={sIdx}
                          className="text-[11px] bg-slate-900 border border-slate-700/80 text-emerald-200 px-2 py-0.5 rounded-lg font-semibold inline-flex items-center gap-1 shadow-sm"
                        >
                          {scorer}
                        </span>
                      ))}
                    </div>
                  )}

                  {f.tacticalNotes && (
                    <div className="mt-2.5 bg-slate-900 border border-amber-500/30 rounded-xl px-3 py-2 text-xs text-amber-100 flex items-start space-x-2 shadow-sm max-w-xl">
                      <FileText className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-amber-300 text-[10px] uppercase tracking-wider block">Note Tattiche & Match Report:</span>
                        <p className="text-slate-200 text-xs font-medium leading-relaxed whitespace-pre-wrap mt-0.5">
                          {f.tacticalNotes}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Status or Score */}
              <div className="flex items-center space-x-3">
                {isPlayed ? (
                  <div className="text-right flex flex-col items-end">
                    <span className="text-[10px] text-slate-500 block">Risultato Finale</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {(() => {
                        const res = getFixtureResult(f);
                        if (!res) return null;
                        if (res.isWin) {
                          return (
                            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" title="Vittoria">
                              V
                            </span>
                          );
                        } else if (res.isDraw) {
                          return (
                            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40" title="Pareggio">
                              P
                            </span>
                          );
                        } else {
                          return (
                            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40" title="Sconfitta">
                              S
                            </span>
                          );
                        }
                      })()}
                      <span className="font-extrabold text-lg text-emerald-400">
                        {getFixtureResult(f)?.displayScore || f.score}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleQuickSwapScore(f.id)}
                        className="p-1 hover:bg-slate-800 text-slate-500 hover:text-amber-300 rounded border border-transparent hover:border-slate-700 transition-colors cursor-pointer text-xs"
                        title="Inverti gol (es. 1-2 ⇄ 2-1 se registrato dal punto di vista avversario)"
                      >
                        ⇄
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-right">
                    <span className="text-[10px] text-slate-500 block">Status</span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded border bg-indigo-500/20 text-indigo-300 border-indigo-500/30">
                      In Programma
                    </span>
                  </div>
                )}

                <button
                  onClick={() => setEditingFixture(f)}
                  className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-800 transition-colors text-xs flex items-center gap-1"
                  title="Modifica Risultato, Marcatori e Note"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{isPlayed ? 'Note' : 'Risultato'}</span>
                </button>

                <button
                  onClick={() => handleRequestDeleteFixture(f)}
                  className="p-2 bg-slate-900 hover:bg-rose-950/60 text-slate-500 hover:text-rose-400 rounded-xl border border-slate-800 transition-colors text-xs cursor-pointer"
                  title="Elimina Partita"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            </React.Fragment>
          );
        })}

        {/* Marker if current in-game date is at or after the end of all fixtures in calendar */}
        {markerInsertIndex === displayedFixtures.length && displayedFixtures.length > 0 && (
          <div ref={markerRef} className="relative py-2.5 flex items-center justify-center my-3 transition-all scroll-mt-24">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t-2 border-emerald-500/50 shadow-sm" />
            </div>
            {renderBookmarkContent(true)}
          </div>
        )}
      </div>

      {/* RIEPILOGO STAGIONALE IN FONDO AL CALENDARIO (TUTTE LE COMPETIZIONI O INTERVALLO FILTRATO) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 mt-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-800/80">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl text-emerald-400">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-white">Riepilogo Rendimento Calendario</h3>
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-full">
                  {activeFilterDescription ? activeFilterDescription : 'Tutte le competizioni'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {activeFilterDescription
                  ? `Bilancio di rendimento calcolato unicamente per l'intervallo temporale selezionato (${displayedFixtures.length} partite)`
                  : "Bilancio generale di vittorie, pareggi, sconfitte e gol calcolato sull'intero calendario"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-400">Partite concluse:</span>
            <span className="font-bold text-white bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
              {calendarOverallStats.played} / {displayedFixtures.length} ({displayedFixtures.length > 0 ? Math.round((calendarOverallStats.played / displayedFixtures.length) * 100) : 0}%)
            </span>
          </div>
        </div>

        {/* 6 Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {/* Partite Giocate */}
          <div className="bg-slate-950/80 rounded-xl border border-slate-800 p-3 flex flex-col justify-between">
            <span className="text-[11px] font-medium text-slate-400 block">Partite Giocate</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-black text-white">{calendarOverallStats.played}</span>
              <span className="text-[10px] text-slate-400">
                {fixtures.length - calendarOverallStats.played} rimaste
              </span>
            </div>
          </div>

          {/* Vittorie */}
          <div className="bg-slate-950/80 rounded-xl border border-emerald-500/25 p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-emerald-400">Vittorie (V)</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-black text-emerald-400">{calendarOverallStats.wins}</span>
              <span className="text-[10px] font-semibold text-emerald-300/90">
                {calendarOverallStats.winRate}% win
              </span>
            </div>
          </div>

          {/* Pareggi */}
          <div className="bg-slate-950/80 rounded-xl border border-amber-500/25 p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-amber-400">Pareggi (P)</span>
              <span className="w-2 h-2 rounded-full bg-amber-400" />
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-black text-amber-400">{calendarOverallStats.draws}</span>
              <span className="text-[10px] text-slate-400">
                {calendarOverallStats.played > 0 ? Math.round((calendarOverallStats.draws / calendarOverallStats.played) * 100) : 0}%
              </span>
            </div>
          </div>

          {/* Sconfitte */}
          <div className="bg-slate-950/80 rounded-xl border border-rose-500/25 p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-rose-400">Sconfitte (S)</span>
              <span className="w-2 h-2 rounded-full bg-rose-400" />
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-black text-rose-400">{calendarOverallStats.losses}</span>
              <span className="text-[10px] text-slate-400">
                {calendarOverallStats.played > 0 ? Math.round((calendarOverallStats.losses / calendarOverallStats.played) * 100) : 0}%
              </span>
            </div>
          </div>

          {/* Gol Segnati */}
          <div className="bg-slate-950/80 rounded-xl border border-slate-800 p-3 flex flex-col justify-between">
            <span className="text-[11px] font-medium text-slate-400 block flex items-center gap-1">
              <span>⚽</span> Gol Segnati
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-black text-emerald-400">{calendarOverallStats.goalsScored}</span>
              <span className="text-[10px] text-slate-400">
                {calendarOverallStats.avgGoalsScored} /gara
              </span>
            </div>
          </div>

          {/* Gol Subiti */}
          <div className="bg-slate-950/80 rounded-xl border border-slate-800 p-3 flex flex-col justify-between">
            <span className="text-[11px] font-medium text-slate-400 block flex items-center gap-1">
              <span>🛡️</span> Gol Subiti
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xl font-black text-slate-200">{calendarOverallStats.goalsConceded}</span>
              <span className="text-[10px] text-slate-400">
                {calendarOverallStats.avgGoalsConceded} /gara
              </span>
            </div>
          </div>
        </div>

        {/* Secondary insights bar */}
        <div className="bg-slate-950/60 rounded-xl border border-slate-800/80 px-3.5 py-2.5 flex items-center justify-between flex-wrap gap-2 text-xs">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Differenza Reti:</span>
              <span className={`font-black ${
                calendarOverallStats.goalDiff > 0
                  ? 'text-emerald-400'
                  : calendarOverallStats.goalDiff === 0
                  ? 'text-slate-300'
                  : 'text-rose-400'
              }`}>
                {calendarOverallStats.goalDiff > 0 ? `+${calendarOverallStats.goalDiff}` : calendarOverallStats.goalDiff}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Punti Virtuali:</span>
              <span className="font-bold text-amber-300">
                {calendarOverallStats.points} pt
              </span>
              <span className="text-[10px] text-slate-500">
                ({calendarOverallStats.played > 0 ? (calendarOverallStats.points / calendarOverallStats.played).toFixed(2) : '0.00'} pt/gara)
              </span>
            </div>
          </div>

          {calendarOverallStats.played === 0 && (
            <span className="text-slate-400 italic text-[11px]">
              Nessuna partita registrata come giocata. Clicca su "Risultato" per inserire marcatori e punteggio.
            </span>
          )}
        </div>
      </div>

      {/* Control Panel / Actions Card positioned at the BOTTOM */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 mt-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base font-bold text-slate-100">Calendario e Risultati Partite</h3>
                {onOpenEditDateModal && (
                  <button
                    type="button"
                    onClick={onOpenEditDateModal}
                    className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs px-2.5 py-0.5 rounded-lg border border-amber-500/30 font-semibold flex items-center gap-1 transition-all cursor-pointer"
                    title="Clicca per modificare la data in-game"
                  >
                    <Calendar className="w-3 h-3 text-amber-400" />
                    <span>{displayDate}</span>
                    <Edit3 className="w-3 h-3 text-amber-300/80 ml-0.5" />
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {teamName} • Carica uno screenshot di FM26 o gestisci gli incontri
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto overflow-x-auto">
            {fixtures.length > 5 && (
              <>
                <button
                  type="button"
                  onClick={() => scrollToMarker(true)}
                  className="px-3 py-2 bg-slate-950 hover:bg-slate-800 text-emerald-400 hover:text-emerald-300 text-xs font-bold rounded-xl border border-emerald-500/40 transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm"
                  title="Centra subito sul segnalino della data attuale in-game"
                >
                  <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Segnalibro Oggi</span>
                </button>
                <button
                  type="button"
                  onClick={scrollToTop}
                  className="px-3 py-2 bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-medium rounded-xl border border-slate-800 transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                  title="Torna in cima al calendario"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                  <span>In Cima</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setIsScreenshotModalOpen(true)}
              className="px-3.5 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5 text-amber-300" />
              <Sparkles className="w-3.5 h-3.5 text-indigo-200" />
              <span>Carica Screenshot Calendario (AI OCR)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsAddingManual(!isAddingManual);
                if (!isAddingManual && activeCompetitions.length > 0) {
                  setManualComp(activeCompetitions[0]);
                }
              }}
              className={`px-3 py-2 text-xs font-semibold rounded-xl border transition-colors flex items-center gap-1 shrink-0 cursor-pointer ${
                isAddingManual
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                  : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800'
              }`}
            >
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isAddingManual ? 'Chiudi Inserimento' : 'Aggiungi Manuale'}</span>
            </button>

            {/* Carica Vecchio Calendario JSON */}
            <div className="flex items-center rounded-xl border border-sky-500/30 bg-slate-950 overflow-hidden shrink-0 shadow-sm">
              <button
                type="button"
                onClick={() => jsonFileInputRef.current?.click()}
                className="px-3.5 py-2 hover:bg-sky-500/10 text-sky-300 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Carica un vecchio calendario in formato JSON (es. calendario-2930.json)"
              >
                <Upload className="w-3.5 h-3.5 text-sky-400" />
                <span>Carica Calendario JSON</span>
              </button>
              {archivedCalendars && archivedCalendars.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsArchivePickerModalOpen(true)}
                  className="px-2.5 py-2 border-l border-sky-500/20 hover:bg-sky-500/15 text-sky-300 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1"
                  title="Scegli tra i vecchi calendari salvati in archivio storico"
                >
                  <Archive className="w-3.5 h-3.5 text-sky-400" />
                  <span className="text-[10px] bg-sky-950 px-1 py-0.2 rounded border border-sky-500/30 font-bold">
                    {archivedCalendars.length}
                  </span>
                </button>
              )}
            </div>

            <div className="flex items-center rounded-xl border border-emerald-500/30 bg-slate-950 overflow-hidden shrink-0 shadow-sm">
              <button
                type="button"
                onClick={handleQuickExport}
                className="px-3 py-2 hover:bg-slate-800 text-emerald-400 text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Esporta e scarica subito il calendario attuale in file JSON"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>Esporta File</span>
              </button>
              <button
                type="button"
                onClick={handleOpenExportModal}
                className="px-2 py-2 border-l border-emerald-500/20 hover:bg-slate-800 text-emerald-400 text-xs font-semibold transition-colors cursor-pointer"
                title="Personalizza nome file e opzioni di esportazione"
              >
                <Settings2 className="w-3.5 h-3.5 text-emerald-400/80 hover:text-emerald-300" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleClearAllFixtures}
              disabled={fixtures.length === 0}
              className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-40 text-rose-300 text-xs font-semibold rounded-xl border border-rose-500/30 transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
              title="Cancella tutte le partite del calendario"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Svuota Calendario</span>
            </button>
          </div>
        </div>

        {/* Mini stats counters */}
        {fixtures.length > 0 && (
          <div className="flex items-center gap-3 pt-2 border-t border-slate-800/80 text-xs">
            <div className="flex items-center gap-1.5 text-slate-400">
              <span className="font-semibold text-slate-200">{fixtures.length}</span> partite totali
            </div>
            <span className="text-slate-700">•</span>
            <div className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span><strong className="font-bold">{playedCount}</strong> giocate</span>
            </div>
            <span className="text-slate-700">•</span>
            <div className="flex items-center gap-1.5 text-indigo-300">
              <Clock className="w-3.5 h-3.5" />
              <span><strong className="font-bold">{upcomingCount}</strong> in programma</span>
            </div>
            {activeCompetitions.length > 0 && (
              <>
                <span className="text-slate-700">•</span>
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" />
                  <span><strong className="font-bold text-slate-200">{activeCompetitions.length}</strong> competizioni attive</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Form Aggiunta Manuale Partita */}
        {isAddingManual && (
          <form onSubmit={handleAddManualFixture} className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4 mt-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Nuova Partita Manuale
              </h4>
              <span className="text-[11px] text-slate-400">
                La partita verrà posizionata in ordine cronologico esatto in base alla data
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Data Partita</label>
                <input
                  type="text"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  placeholder="es. 28 Ottobre 2026"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Avversario</label>
                <input
                  type="text"
                  value={manualOpponent}
                  onChange={(e) => setManualOpponent(e.target.value)}
                  placeholder="es. Chelsea"
                  required
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Luogo / Sede</label>
                <select
                  value={manualVenue}
                  onChange={(e) => setManualVenue(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="Casa">C - Casa</option>
                  <option value="Trasferta">T - Trasferta</option>
                  <option value="Campo Neutro">N - Campo Neutro</option>
                </select>
              </div>

              {/* Competizione: Menù a tendina con competizioni attive + opzione manuale */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] text-slate-400 block">Competizione</label>
                  {!isCustomComp ? (
                    <button
                      type="button"
                      onClick={() => setIsCustomComp(true)}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 underline font-medium"
                    >
                      + Aggiungi a mano
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsCustomComp(false)}
                      className="text-[10px] text-slate-400 hover:text-slate-300 underline"
                    >
                      Menu a tendina
                    </button>
                  )}
                </div>

                {!isCustomComp ? (
                  <select
                    value={manualComp}
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setIsCustomComp(true);
                      } else {
                        setManualComp(e.target.value);
                      }
                    }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    {activeCompetitions.length > 0 && (
                      <optgroup label="Competizioni Attive in Rosa">
                        {activeCompetitions.map((c) => (
                          <option key={`active_${c}`} value={c}>
                            🏆 {c}
                          </option>
                        ))}
                      </optgroup>
                    )}

                    <optgroup label="Altre Competizioni Standard">
                      {allAvailableCompetitions
                        .filter(c => !activeCompetitions.includes(c))
                        .map((c) => (
                          <option key={`other_${c}`} value={c}>
                            {c}
                          </option>
                        ))}
                    </optgroup>

                    <option value="__custom__" className="text-emerald-400 font-bold bg-slate-950">
                      ➕ + Inserisci Altra Competizione a Mano...
                    </option>
                  </select>
                ) : (
                  <input
                    type="text"
                    value={customCompInput}
                    onChange={(e) => setCustomCompInput(e.target.value)}
                    placeholder="Es. Coppa Intercontinentale..."
                    required={isCustomComp}
                    autoFocus
                    className="w-full bg-slate-900 border border-emerald-500/60 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  />
                )}
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Importanza</label>
                <select
                  value={manualImportance}
                  onChange={(e) => setManualImportance(e.target.value as any)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="Cruciale">Cruciale</option>
                  <option value="Alta">Alta</option>
                  <option value="Media">Media</option>
                </select>
              </div>
            </div>

            {/* Quick Suggestions Chips when typing custom competition */}
            {isCustomComp && (
              <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
                <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>Suggerimenti rapidi per nuove competizioni:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTED_NEW_COMPETITIONS.map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setCustomCompInput(sug)}
                      className={`text-[10px] px-2 py-0.5 rounded-lg border transition-all ${
                        customCompInput === sug
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-bold'
                          : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      + {sug}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-1 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => {
                  setIsAddingManual(false);
                  setIsCustomComp(false);
                }}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 rounded-lg text-xs"
              >
                Annulla
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md"
              >
                <Plus className="w-3.5 h-3.5" /> Salva Incontro
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Bottom Anchor for auto-scrolling */}
      <div ref={bottomRef} />

      {/* Screenshot OCR Modal */}
      <CalendarScreenshotUploaderModal
        isOpen={isScreenshotModalOpen}
        onClose={() => setIsScreenshotModalOpen(false)}
        onImportFixtures={handleImportFixtures}
        teamName={teamName}
      />

      {/* Fixture Result & Scorers Modal */}
      {editingFixture && (
        <FixtureResultModal
          isOpen={Boolean(editingFixture)}
          fixture={editingFixture}
          teamName={teamName}
          allPlayers={allPlayers}
          onSave={handleScoreUpdate}
          onClose={() => setEditingFixture(null)}
          onDelete={handleRequestDeleteFixture}
        />
      )}

      {/* Export Calendar Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden my-6">
            {/* Header */}
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Esporta Calendario JSON
                  </h3>
                  <p className="text-xs text-slate-400">
                    Genera il file compatibile con l'Archivio Storico e il backup
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              {/* Summary card */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">Partite da esportare:</span>
                  <span className="font-mono font-bold text-white">{fixtures.length} partite</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-800/80">
                  <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800 flex items-center justify-between">
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Giocate:
                    </span>
                    <span className="font-mono font-bold text-emerald-300">{playedCount}</span>
                  </div>
                  <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800 flex items-center justify-between">
                    <span className="text-indigo-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Da giocare:
                    </span>
                    <span className="font-mono font-bold text-indigo-300">{upcomingCount}</span>
                  </div>
                </div>

                {activeCompetitions.length > 0 && (
                  <div className="pt-1.5 border-t border-slate-800/80">
                    <span className="text-[11px] text-slate-400 block mb-1">Competizioni rilevate:</span>
                    <div className="flex flex-wrap gap-1">
                      {activeCompetitions.map((comp) => (
                        <span key={comp} className="text-[10px] bg-slate-900 text-slate-300 px-2 py-0.5 rounded-md border border-slate-800">
                          {comp}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Form options */}
              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-300 font-semibold block mb-1">
                    Sigla Stagione (per nome file):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={exportSeasonCode}
                      onChange={(e) => setExportSeasonCode(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                      placeholder="es. 2930 o 2627"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono text-xs focus:border-emerald-500 focus:outline-none"
                    />
                    <div className="shrink-0 text-slate-400 font-mono text-[11px] bg-slate-950 px-2.5 py-2 rounded-xl border border-slate-800">
                      .json
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Nome file generato: <code className="text-emerald-400 font-mono">calendario-{exportSeasonCode || 'stagione'}.json</code>
                  </p>
                </div>

                <div>
                  <label className="text-slate-300 font-semibold block mb-1">
                    Nome / Anno Stagione:
                  </label>
                  <input
                    type="text"
                    value={exportSeasonLabel}
                    onChange={(e) => setExportSeasonLabel(e.target.value)}
                    placeholder="es. 2029/2030 o Stagione 29/30"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-slate-300 font-semibold block mb-1">
                    Nome Squadra:
                  </label>
                  <input
                    type="text"
                    value={exportTeamName}
                    onChange={(e) => setExportTeamName(e.target.value)}
                    placeholder="es. Mia Squadra FC"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-slate-950 px-6 py-3.5 border-t border-slate-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  const cleanCode = exportSeasonCode.trim() || '2627';
                  const cleanLabel = exportSeasonLabel.trim() || `Stagione ${cleanCode}`;
                  const cleanTeam = exportTeamName.trim() || teamName;
                  const { jsonContent } = exportCalendarToFile(
                    fixtures,
                    cleanCode,
                    cleanTeam,
                    cleanLabel
                  );
                  navigator.clipboard.writeText(jsonContent);
                  setCopiedNotice(true);
                  setTimeout(() => setCopiedNotice(false), 3000);
                }}
                className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-medium rounded-xl border border-slate-800 transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Copia l'intero contenuto JSON negli appunti"
              >
                {copiedNotice ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                <span>{copiedNotice ? 'Copiato!' : 'Copia JSON'}</span>
              </button>
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => setIsExportModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition-colors cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={handleConfirmExport}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Scarica File JSON</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export Success Toast Notification */}
      {exportSuccessToast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md bg-emerald-950/95 border border-emerald-500/50 rounded-2xl p-4 shadow-2xl backdrop-blur-md flex items-start justify-between gap-3 text-emerald-200 animate-in fade-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex flex-col space-y-1">
              <span className="text-xs font-semibold text-white">{exportSuccessToast}</span>
              {exportedJsonData && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(exportedJsonData);
                    setCopiedNotice(true);
                    setTimeout(() => setCopiedNotice(false), 3000);
                  }}
                  className="text-[11px] text-emerald-300 hover:text-white underline cursor-pointer flex items-center gap-1 pt-0.5"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedNotice ? 'Copiato negli appunti!' : 'Copia JSON negli appunti (se il download non si avvia)'}</span>
                </button>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExportSuccessToast(null)}
            className="text-emerald-400 hover:text-white p-1 rounded-lg hover:bg-emerald-900/50 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Confirmation Modal for Clear All Fixtures */}
      {showClearModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center space-x-3 text-rose-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-white">Cancellare tutto il calendario?</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Sei sicuro di voler cancellare l'intero calendario delle partite ({fixtures.length} {fixtures.length === 1 ? 'partita' : 'partite'})?
              <br /><br />
              Questa operazione svuoterà l'elenco attuale per permetterti di caricare un nuovo calendario o inserire le prossime partite.
            </p>
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setShowClearModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={handleConfirmClearAll}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-lg transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Sì, Cancella Calendario</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Hidden File Input for JSON Calendar Upload */}
      <input
        ref={jsonFileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleJsonFileSelected}
      />

      {/* JSON Import Error Toast */}
      {importErrorToast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md bg-rose-950/95 border border-rose-500/50 rounded-2xl p-4 shadow-2xl backdrop-blur-md flex items-start justify-between gap-3 text-rose-200 animate-in fade-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex flex-col space-y-1">
              <span className="text-xs font-bold text-white">Errore Caricamento File JSON</span>
              <p className="text-xs text-rose-300 leading-relaxed">{importErrorToast}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setImportErrorToast(null)}
            className="text-rose-400 hover:text-white p-1 rounded-lg hover:bg-rose-900/50 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pending Calendar Import Confirmation Modal */}
      {pendingCalendarImport && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5">
            <div className="flex items-start justify-between border-b border-slate-800/80 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-sky-500/15 border border-sky-500/30 rounded-2xl text-sky-400 shadow-sm">
                  <FileCheck2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">Carica Calendario JSON</h3>
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40 rounded-full">
                      {pendingCalendarImport.season}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    {pendingCalendarImport.fileName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingCalendarImport(null)}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Calendar summary stats */}
            <div className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-4 space-y-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Squadra nel File:</span>
                <span className="font-semibold text-slate-200">{pendingCalendarImport.teamName}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Partite Rilevate:</span>
                <span className="font-bold text-white bg-slate-800 px-2 py-0.5 rounded-lg">
                  {pendingCalendarImport.fixtures.length} incontri
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-center">
                  <span className="text-[11px] text-slate-400 block">Giocate</span>
                  <span className="text-sm font-bold text-emerald-400">
                    {pendingCalendarImport.fixtures.filter(f => f.status === 'Giocata').length}
                  </span>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-center">
                  <span className="text-[11px] text-slate-400 block">In Programma</span>
                  <span className="text-sm font-bold text-sky-400">
                    {pendingCalendarImport.fixtures.filter(f => f.status === 'In Arrivo').length}
                  </span>
                </div>
              </div>

              {/* Competitions in this calendar */}
              {Array.from(new Set(pendingCalendarImport.fixtures.map(f => f.competition).filter(Boolean))).length > 0 && (
                <div className="pt-2 border-t border-slate-800/80">
                  <span className="text-[11px] text-slate-400 block mb-1.5 font-medium">Competizioni incluse:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from(new Set(pendingCalendarImport.fixtures.map(f => f.competition).filter(Boolean))).map((comp, i) => (
                      <span key={i} className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md border border-slate-700/60 font-medium">
                        {comp}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Archive copy checkbox */}
            {onUpdateArchivedCalendars && (
              <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60 hover:border-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={archiveCopyOnImport}
                  onChange={(e) => setArchiveCopyOnImport(e.target.checked)}
                  className="w-4 h-4 rounded text-sky-500 bg-slate-900 border-slate-700 focus:ring-sky-500 cursor-pointer"
                />
                <span>Salva una copia anche nell'<strong>Archivio Storico</strong> della carriera</span>
              </label>
            )}

            {/* Modal action choices */}
            <div className="space-y-2 pt-2">
              <div className="text-xs text-slate-400 mb-1">
                Come desideri applicare questo calendario?
              </div>

              <button
                type="button"
                onClick={() => handleConfirmImport('replace')}
                className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-sky-950/50 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>Sostituisci Calendario Attivo (Consigliato)</span>
              </button>

              {fixtures.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleConfirmImport('merge')}
                  className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Unisci alle {fixtures.length} partite già presenti</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setPendingCalendarImport(null)}
                className="w-full py-1.5 text-slate-400 hover:text-slate-200 text-xs font-medium transition-colors cursor-pointer"
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive Calendars Picker Modal */}
      {isArchivePickerModalOpen && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-sky-500/15 text-sky-400 rounded-xl border border-sky-500/30">
                  <Archive className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Archivio Calendari Storici</h3>
                  <p className="text-xs text-slate-400">
                    Seleziona una stagione salvata in precedenza per ripristinarla
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsArchivePickerModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {(!archivedCalendars || archivedCalendars.length === 0) ? (
                <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-2xl">
                  Nessun calendario archiviato al momento. Puoi caricarne uno tramite file JSON.
                </div>
              ) : (
                archivedCalendars.map((cal) => (
                  <div
                    key={cal.id}
                    className="p-3.5 bg-slate-950/70 border border-slate-800/80 rounded-2xl flex items-center justify-between gap-3 hover:border-sky-500/40 transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{cal.season}</span>
                        <span className="text-[10px] font-mono text-sky-400 bg-sky-950/60 px-2 py-0.5 rounded-full border border-sky-500/30">
                          {cal.fileName}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {cal.teamName} • {cal.fixtures.length} partite ({cal.fixtures.filter(f => f.status === 'Giocata').length} giocate)
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRestoreFromArchive(cal)}
                      className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-xl transition-colors shrink-0 shadow cursor-pointer flex items-center gap-1"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Carica</span>
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
              <button
                type="button"
                onClick={() => {
                  setIsArchivePickerModalOpen(false);
                  setTimeout(() => jsonFileInputRef.current?.click(), 100);
                }}
                className="text-xs text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Carica da un nuovo file .json</span>
              </button>
              <button
                type="button"
                onClick={() => setIsArchivePickerModalOpen(false)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl transition-colors cursor-pointer"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog Modal for Deleting a Single Fixture */}
      <ConfirmDialogModal
        isOpen={Boolean(fixtureToDelete)}
        title="Elimina Partita dal Calendario"
        message={
          fixtureToDelete
            ? `Sei sicuro di voler eliminare la partita contro "${fixtureToDelete.opponent}" (${fixtureToDelete.venue} - ${fixtureToDelete.competition}) in programma per il ${fixtureToDelete.date}? L'operazione non potrà essere annullata.`
            : ''
        }
        confirmLabel="Elimina Partita"
        cancelLabel="Annulla"
        isDangerous={true}
        onConfirm={handleConfirmDeleteFixture}
        onCancel={() => setFixtureToDelete(null)}
      />
    </div>
  );
};

