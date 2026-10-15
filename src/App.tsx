import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { Key, AlertTriangle } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { findSquadDuplicates } from './utils/squadDuplicateUtils';
import { hasCustomApiKey } from './utils/apiKeyStorage';
import { sortFixturesByDate } from './utils/dateUtils';
import { Player, TacticPreset, Fixture, ScoutingTarget, SeasonPhaseInfo, TacticalNote, StandingsRow, YouthSquad, SeasonHistoryEntry, ArchivedSeasonCalendar, TacticalPosition, GamePlanState, OpponentPlayerCSV, DateReminder } from './types';
import {
  initialPlayers,
  initialTactic,
  initialTactics,
  initialFixtures,
  initialScoutingTargets,
  initialSeasonPhase,
  initialTacticalNotes,
  initialStandings,
  initialHistoryAwards,
  emptyTactic,
  emptySeasonPhase,
  getInitialYouthSquads,
  initialDateReminders
} from './data/initialData';
import { getActiveReminders } from './utils/reminderUtils';
import { RemindersAlertBanner } from './components/RemindersAlertBanner';
import { ConfirmSigningResult } from './components/ConfirmSigningModal';
import { extractCurrentYear, getEffectiveAge } from './utils/csvParser';
import { syncTacticsWithPlayers } from './utils/tacticsPlayerSync';
import { BackgroundOcrProvider } from './context/BackgroundOcrContext';
import { BackgroundOcrWidget } from './components/BackgroundOcrWidget';

// Code-split heavy tab views to reduce initial bundle from 1.9MB to lightweight lazy chunks
const AiCopilot = lazy(() => import('./components/AiCopilot').then(m => ({ default: m.AiCopilot })));
const SquadManager = lazy(() => import('./components/SquadManager').then(m => ({ default: m.SquadManager })));
const YouthSquadManager = lazy(() => import('./components/YouthSquadManager').then(m => ({ default: m.YouthSquadManager })));
const TacticsBoard = lazy(() => import('./components/TacticsBoard').then(m => ({ default: m.TacticsBoard })));
const GamePlanBoard = lazy(() => import('./components/GamePlanBoard').then(m => ({ default: m.GamePlanBoard })));
const SeasonPhaseCalendar = lazy(() => import('./components/SeasonPhaseCalendar').then(m => ({ default: m.SeasonPhaseCalendar })));
const ScoutingBoard = lazy(() => import('./components/ScoutingBoard').then(m => ({ default: m.ScoutingBoard })));
const CompetitionsBoard = lazy(() => import('./components/CompetitionsBoard').then(m => ({ default: m.CompetitionsBoard })));
const TacticalNotesBoard = lazy(() => import('./components/TacticalNotesBoard').then(m => ({ default: m.TacticalNotesBoard })));
const HistoryBoard = lazy(() => import('./components/HistoryBoard').then(m => ({ default: m.HistoryBoard })));

// Code-split heavy modals
const QuickDataSetupModal = lazy(() => import('./components/QuickDataSetupModal').then(m => ({ default: m.QuickDataSetupModal })));
const CsvUploaderModal = lazy(() => import('./components/CsvUploaderModal').then(m => ({ default: m.CsvUploaderModal })));
const EditAppDateModal = lazy(() => import('./components/EditAppDateModal').then(m => ({ default: m.EditAppDateModal })));
const ApiKeyModal = lazy(() => import('./components/ApiKeyModal').then(m => ({ default: m.ApiKeyModal })));
const SquadDuplicatesModal = lazy(() => import('./components/SquadDuplicatesModal').then(m => ({ default: m.SquadDuplicatesModal })));
const RemindersManagerModal = lazy(() => import('./components/RemindersManagerModal').then(m => ({ default: m.RemindersManagerModal })));
const GeminiPingCmdModal = lazy(() => import('./components/GeminiPingCmdModal').then(m => ({ default: m.GeminiPingCmdModal })));
const TeamLogoGeneratorModal = lazy(() => import('./components/TeamLogoGeneratorModal').then(m => ({ default: m.TeamLogoGeneratorModal })));

function TabLoadingSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-slate-400 space-y-3">
      <div className="w-8 h-8 border-2 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin"></div>
      <p className="text-xs font-semibold text-slate-300">Caricamento modulo...</p>
    </div>
  );
}


export default function App() {
  const [activeTab, setActiveTab] = useState('copilot');
  const [isSetupOpen, setIsSetupOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [isEditDateModalOpen, setIsEditDateModalOpen] = useState(false);
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isPingModalOpen, setIsPingModalOpen] = useState(false);
  const [isCustomKeyActive, setIsCustomKeyActive] = useState<boolean>(() => hasCustomApiKey());
  const [hasNewNote, setHasNewNote] = useState(false);
  const [csvDefaultDestination, setCsvDefaultDestination] = useState<string>('squad');
  const [copilotInitialPrompt, setCopilotInitialPrompt] = useState<string | undefined>(undefined);
  const [isRemindersModalOpen, setIsRemindersModalOpen] = useState(false);
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);

  // Date-Linked Reminders state persistence
  const [reminders, setReminders] = useState<DateReminder[]>(() => {
    const isCleared = localStorage.getItem('fm26_cleared');
    if (isCleared === 'true') return [];
    const saved = localStorage.getItem('fm26_date_reminders');
    if (!saved) return initialDateReminders;
    try {
      return JSON.parse(saved);
    } catch {
      return initialDateReminders;
    }
  });

  useEffect(() => {
    localStorage.setItem('fm26_date_reminders', JSON.stringify(reminders));
  }, [reminders]);

  // Sync API Key status and automatically prompt new users on first launch
  useEffect(() => {
    const handleKeyChange = () => {
      setIsCustomKeyActive(hasCustomApiKey());
    };
    window.addEventListener('custom-api-key-changed', handleKeyChange);
    return () => window.removeEventListener('custom-api-key-changed', handleKeyChange);
  }, []);

  useEffect(() => {
    if (!hasCustomApiKey()) {
      setIsApiKeyModalOpen(true);
    }
  }, []);

  const handleAskCopilot = (prompt: string) => {
    setCopilotInitialPrompt(prompt);
    handleTabChange('copilot');
  };

  const [teamName, setTeamName] = useState<string>(() => {
    const isCleared = localStorage.getItem('fm26_cleared');
    if (isCleared === 'true') return 'La Tua Squadra FC';
    const saved = localStorage.getItem('fm26_team_name');
    return saved || 'La Tua Squadra FC';
  });

  const [teamLogo, setTeamLogo] = useState<string | null>(() => {
    const isCleared = localStorage.getItem('fm26_cleared');
    if (isCleared === 'true') return null;
    return localStorage.getItem('fm26_team_logo');
  });

  const handleUpdateTeamLogo = (logo: string | null) => {
    setTeamLogo(logo);
    if (logo) {
      localStorage.setItem('fm26_team_logo', logo);
    } else {
      localStorage.removeItem('fm26_team_logo');
    }
  };

  // LocalStorage state persistence
  const [notes, setNotes] = useState<TacticalNote[]>(() => {
    const isCleared = localStorage.getItem('fm26_cleared');
    if (isCleared === 'true') return [];
    const saved = localStorage.getItem('fm26_northampton_notes');
    if (!saved) return initialTacticalNotes;
    try {
      return JSON.parse(saved);
    } catch {
      return initialTacticalNotes;
    }
  });

  useEffect(() => {
    localStorage.setItem('fm26_northampton_notes', JSON.stringify(notes));
  }, [notes]);

  const handleSaveNoteToMemory = (newNoteData: Omit<TacticalNote, 'id'>) => {
    const newNote: TacticalNote = {
      ...newNoteData,
      id: `n_${Date.now()}`
    };
    setNotes(prev => [newNote, ...prev]);
    setHasNewNote(true);
  };

  const handleUpdatePlayerNote = (playerId: string, newNote: string) => {
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, notes: newNote } : p));
    setYouthSquads(prev => prev.map(sq => ({
      ...sq,
      players: sq.players.map(p => p.id === playerId ? { ...p, notes: newNote } : p)
    })));
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === 'notes') {
      setHasNewNote(false);
    }
  };


  // LocalStorage state persistence
  const [players, setPlayers] = useState<Player[]>(() => {
    const isCleared = localStorage.getItem('fm26_cleared');
    if (isCleared === 'true') return [];
    const saved = localStorage.getItem('fm26_northampton_players');
    if (!saved) return initialPlayers;
    try {
      const parsed: Player[] = JSON.parse(saved);
      const seenIds = new Set<string>();
      return parsed.map((p, idx) => {
        let uniqueId = p.id;
        if (!uniqueId || seenIds.has(uniqueId)) {
          uniqueId = `p_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${idx}`;
        }
        seenIds.add(uniqueId);
        return { ...p, id: uniqueId };
      });
    } catch {
      return [];
    }
  });

  // Youth Squads state persistence (B team, U20, U18, etc.)
  const [youthSquads, setYouthSquads] = useState<YouthSquad[]>(() => {
    const isCleared = localStorage.getItem('fm26_cleared');
    if (isCleared === 'true') return [];
    const saved = localStorage.getItem('fm26_youth_squads');
    if (!saved) return getInitialYouthSquads(teamName);
    try {
      return JSON.parse(saved);
    } catch {
      return getInitialYouthSquads(teamName);
    }
  });

  useEffect(() => {
    localStorage.setItem('fm26_youth_squads', JSON.stringify(youthSquads));
  }, [youthSquads]);

  // Duplicate squads check state & report
  const [isDuplicatesModalOpen, setIsDuplicatesModalOpen] = useState(false);
  const [duplicateFilterPlayerName, setDuplicateFilterPlayerName] = useState<string>('');

  const squadDuplicatesReport = useMemo(() => {
    return findSquadDuplicates(players, youthSquads);
  }, [players, youthSquads]);

  const handleOpenDuplicatesModal = (initialPlayerName?: string) => {
    setDuplicateFilterPlayerName(initialPlayerName || '');
    setIsDuplicatesModalOpen(true);
  };

  const handleApplySquadsUpdate = (updatedFirstTeam: Player[], updatedYouthSquads: YouthSquad[]) => {
    setPlayers(updatedFirstTeam);
    setYouthSquads(updatedYouthSquads);
  };

  const handlePromoteToFirstTeam = (player: Player) => {
    // 1. Aggiungi alla Prima Squadra se non già presente
    setPlayers((prev) => {
      if (prev.some((p) => p.id === player.id || p.name.toLowerCase().trim() === player.name.toLowerCase().trim())) {
        return prev;
      }
      return [player, ...prev];
    });

    // 2. Rimuovi dalle rose giovanili per evitare doppioni
    setYouthSquads((prevSquads) =>
      prevSquads.map((sq) => ({
        ...sq,
        players: sq.players.filter(
          (p) => p.id !== player.id && p.name.toLowerCase().trim() !== player.name.toLowerCase().trim()
        ),
      }))
    );
  };

  const handleDemoteToYouthSquad = (player: Player, targetSquadId?: string) => {
    // 1. Remove player from first team
    setPlayers((prev) => prev.filter((p) => p.id !== player.id));

    // 2. Add player to targeted youth squad (or default first squad, or create a default if none exists)
    setYouthSquads((prevSquads) => {
      let squads = [...prevSquads];
      if (squads.length === 0) {
        squads = getInitialYouthSquads(teamName);
      }

      const targetId = targetSquadId || squads[0]?.id;
      let matched = false;

      const updated = squads.map((sq) => {
        if (sq.id === targetId || (!targetId && !matched)) {
          matched = true;
          // Avoid duplicate
          const remaining = sq.players.filter((p) => p.id !== player.id && p.name.toLowerCase() !== player.name.toLowerCase());
          return {
            ...sq,
            players: [player, ...remaining],
          };
        }
        return sq;
      });

      if (!matched && squads.length > 0) {
        const first = squads[0];
        const remaining = first.players.filter((p) => p.id !== player.id && p.name.toLowerCase() !== player.name.toLowerCase());
        updated[0] = {
          ...first,
          players: [player, ...remaining],
        };
      }

      return updated;
    });

    // 3. Remove player assignment from tactics positions if assigned
    setTactics((prevTactics) => {
      return prevTactics.map((t) => {
        const cleanPositions = (posList?: TacticalPosition[]) => {
          if (!posList) return posList;
          return posList.map((pos) => {
            if (pos.playerId === player.id) {
              return { ...pos, playerId: undefined };
            }
            return pos;
          });
        };

        return {
          ...t,
          positions: cleanPositions(t.positions) || t.positions,
          inPossessionPositions: cleanPositions(t.inPossessionPositions),
          outOfPossessionPositions: cleanPositions(t.outOfPossessionPositions),
          combinedPositions: cleanPositions(t.combinedPositions),
        };
      });
    });
  };

  const handleConfirmSigning = (result: ConfirmSigningResult) => {
    const { target, destination, shirtNumber, removeFromScouting, notes } = result;

    const currentYear = extractCurrentYear(currentDate);
    const effectiveAge = getEffectiveAge(target, currentDate);
    const finalBirthYear = target.birthYear || (currentYear - effectiveAge);

    const newPlayer: Player = {
      id: `p_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: target.name,
      number: shirtNumber || 99,
      position: target.position,
      bestRoles: target.roles && target.roles.length > 0 ? target.roles : [target.position],
      age: effectiveAge,
      birthYear: finalBirthYear,
      birthDate: target.birthDate,
      nationality: 'Italiana',
      morale: 'Superbo',
      matchLoad: 'Fresco',
      homegrown: target.homegrown || 'Straniero / Non-HG',
      championsLeagueRegistered: true,
      notes: notes || (target.notes ? `[Acquistato da ${target.currentClub || 'svincolato'}] ${target.notes}` : `Acquistato da ${target.currentClub || 'svincolato'}`),
      ca: target.ca,
      pa: target.pa,
      height: target.height,
      value: target.estimatedValue,
      goalkeepingAttributes: target.goalkeepingAttributes,
      technicalAttributes: target.technicalAttributes,
      mentalAttributes: target.mentalAttributes,
      physicalAttributes: target.physicalAttributes,
      personalityAttributes: target.personalityAttributes,
      positionsDetail: target.positionsDetail,
      lastUpdatedDate: currentDate,
      lastUpdatedTimestamp: Date.now(),
    };

    if (destination === 'first_team') {
      // 1. Add to First Team
      setPlayers((prev) => {
        const exists = prev.some(
          (p) => p.id === newPlayer.id || p.name.toLowerCase().trim() === newPlayer.name.toLowerCase().trim()
        );
        if (exists) {
          return prev.map((p) =>
            p.name.toLowerCase().trim() === newPlayer.name.toLowerCase().trim() ? newPlayer : p
          );
        }
        return [newPlayer, ...prev];
      });

      // 2. Remove from youth squads to prevent duplicates
      setYouthSquads((prevSquads) =>
        prevSquads.map((sq) => ({
          ...sq,
          players: sq.players.filter(
            (p) => p.name.toLowerCase().trim() !== newPlayer.name.toLowerCase().trim()
          ),
        }))
      );
    } else {
      // Add to Youth Squad (existing youth squad or initialize default if needed)
      setYouthSquads((prevSquads) => {
        let squads = [...prevSquads];
        if (squads.length === 0) {
          squads = getInitialYouthSquads(teamName);
        }

        const targetSquadId = destination === 'create_u20' ? squads[0]?.id : destination;
        let matched = false;

        const updated = squads.map((sq) => {
          if (sq.id === targetSquadId || (!targetSquadId && !matched)) {
            matched = true;
            const remaining = sq.players.filter(
              (p) => p.name.toLowerCase().trim() !== newPlayer.name.toLowerCase().trim()
            );
            return {
              ...sq,
              players: [newPlayer, ...remaining],
            };
          }
          return sq;
        });

        if (!matched && squads.length > 0) {
          const first = squads[0];
          const remaining = first.players.filter(
            (p) => p.name.toLowerCase().trim() !== newPlayer.name.toLowerCase().trim()
          );
          updated[0] = {
            ...first,
            players: [newPlayer, ...remaining],
          };
        }

        return updated;
      });

      // Remove from first team to avoid duplicates
      setPlayers((prev) =>
        prev.filter((p) => p.name.toLowerCase().trim() !== newPlayer.name.toLowerCase().trim())
      );
    }

    // 3. Remove from scouting targets if requested
    if (removeFromScouting) {
      setTargets((prev) => prev.filter((t) => t.id !== target.id));
    }
  };

  const [tactics, setTactics] = useState<TacticPreset[]>(() => {
    const isCleared = localStorage.getItem('fm26_cleared');
    if (isCleared === 'true') return [emptyTactic];
    const savedTactics = localStorage.getItem('fm26_northampton_tactics');
    if (savedTactics) {
      try {
        const parsed = JSON.parse(savedTactics);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.slice(0, 3);
        }
      } catch (e) {
        console.error("Error loading saved tactics", e);
      }
    }
    const savedSingle = localStorage.getItem('fm26_northampton_tactic');
    if (savedSingle) {
      try {
        const parsed = JSON.parse(savedSingle);
        return [parsed];
      } catch (e) {
        console.error("Error loading single saved tactic", e);
      }
    }
    return initialTactics || [initialTactic];
  });

  const [activeTacticIndex, setActiveTacticIndex] = useState<number>(() => {
    const savedIdx = localStorage.getItem('fm26_northampton_active_tactic_idx');
    if (savedIdx !== null) {
      const parsed = parseInt(savedIdx, 10);
      return isNaN(parsed) ? 0 : Math.min(Math.max(parsed, 0), 2);
    }
    return 0;
  });

  const safeActiveIdx = activeTacticIndex < tactics.length ? activeTacticIndex : 0;
  const tactic = tactics[safeActiveIdx] || tactics[0] || initialTactic;

  const handleUpdateActiveTactic = (updatedTactic: TacticPreset) => {
    setTactics(prev => {
      const next = [...prev];
      const idx = safeActiveIdx < next.length ? safeActiveIdx : 0;
      next[idx] = updatedTactic;
      return next;
    });
  };

  const handleUpdateAllTactics = (newTactics: TacticPreset[], newActiveIdx?: number) => {
    setTactics(newTactics);
    if (newActiveIdx !== undefined) {
      setActiveTacticIndex(newActiveIdx);
    }
  };

  // Synchronize tactics with the current players and youth squads
  useEffect(() => {
    setTactics((prevTactics) => {
      const { updatedTactics, hasChanges } = syncTacticsWithPlayers(prevTactics, players, youthSquads);
      return hasChanges ? updatedTactics : prevTactics;
    });
  }, [players, youthSquads]);

  const [fixtures, setFixtures] = useState<Fixture[]>(() => {
    const isCleared = localStorage.getItem('fm26_cleared');
    if (isCleared === 'true') return [];
    const saved = localStorage.getItem('fm26_northampton_fixtures');
    const loaded = saved ? JSON.parse(saved) : initialFixtures;
    return sortFixturesByDate(loaded);
  });

  const [targets, setTargets] = useState<ScoutingTarget[]>(() => {
    const isCleared = localStorage.getItem('fm26_cleared');
    if (isCleared === 'true') return [];
    const saved = localStorage.getItem('fm26_northampton_targets');
    if (!saved) return initialScoutingTargets;
    try {
      const parsed: ScoutingTarget[] = JSON.parse(saved);
      const seenIds = new Set<string>();
      return parsed.map((t, idx) => {
        let uniqueId = t.id;
        if (!uniqueId || seenIds.has(uniqueId)) {
          uniqueId = `t_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${idx}`;
        }
        seenIds.add(uniqueId);
        return { ...t, id: uniqueId };
      });
    } catch {
      return [];
    }
  });

  const [phaseInfo, setPhaseInfo] = useState<SeasonPhaseInfo>(() => {
    const isCleared = localStorage.getItem('fm26_cleared');
    if (isCleared === 'true') return emptySeasonPhase;
    const saved = localStorage.getItem('fm26_northampton_phase');
    return saved ? JSON.parse(saved) : initialSeasonPhase;
  });

  const [standings, setStandings] = useState<StandingsRow[]>(() => {
    const isCleared = localStorage.getItem('fm26_cleared');
    if (isCleared === 'true') return [];
    const saved = localStorage.getItem('fm26_northampton_standings');
    if (!saved) return initialStandings;
    try {
      return JSON.parse(saved);
    } catch {
      return initialStandings;
    }
  });

  const [historyAwards, setHistoryAwards] = useState<SeasonHistoryEntry[]>(() => {
    const isCleared = localStorage.getItem('fm26_cleared');
    if (isCleared === 'true') return [];
    const saved = localStorage.getItem('fm26_history_awards');
    if (!saved) return initialHistoryAwards;
    try {
      return JSON.parse(saved);
    } catch {
      return initialHistoryAwards;
    }
  });

  const [archivedCalendars, setArchivedCalendars] = useState<ArchivedSeasonCalendar[]>(() => {
    const isCleared = localStorage.getItem('fm26_cleared');
    if (isCleared === 'true') return [];
    const saved = localStorage.getItem('fm26_archived_calendars');
    if (!saved) return [];
    try {
      return JSON.parse(saved);
    } catch {
      return [];
    }
  });

  const [gamePlan, setGamePlan] = useState<GamePlanState>(() => {
    try {
      const isCleared = localStorage.getItem('fm26_cleared');
      if (isCleared === 'true') {
        return {
          opponent: 'Real Madrid',
          venue: 'Casa',
          competition: 'Premier League',
          opponentStyle: 'Contropiede Rapido su Fasce',
          strategicPriority: 'Pressione Alta e Transizione Rapida',
          opponentFormation: '4-3-3',
          opponentMentality: 'Equilibrata / Contropiede',
          opponentTacticalNotes: '',
          opponentPlayers: [],
          aiMatchPlan: null,
          managerNotes: ''
        };
      }

      const saved = localStorage.getItem('fm26_active_gameplan');
      const upcoming = initialFixtures.find(f => f.status === 'In Arrivo');
      const opp = upcoming?.opponent || 'Real Madrid';

      const report = localStorage.getItem('fm26_gameplan_report') || null;
      const notes = localStorage.getItem('fm26_gameplan_notes') || '';
      let oppPlayers: OpponentPlayerCSV[] = [];
      try {
        const oppPlayersRaw = localStorage.getItem(`fm26_opp_players_${opp}`);
        if (oppPlayersRaw) oppPlayers = JSON.parse(oppPlayersRaw);
      } catch {}

      if (saved) {
        const parsed: GamePlanState = JSON.parse(saved);
        return {
          ...parsed,
          aiMatchPlan: report || parsed.aiMatchPlan || null,
          managerNotes: notes || parsed.managerNotes || '',
          opponentPlayers: (parsed.opponentPlayers && parsed.opponentPlayers.length > 0) ? parsed.opponentPlayers : oppPlayers
        };
      }

      return {
        opponent: opp,
        venue: upcoming?.venue || 'Casa',
        competition: upcoming?.competition || 'Premier League',
        opponentStyle: 'Contropiede Rapido su Fasce',
        strategicPriority: 'Pressione Alta e Transizione Rapida',
        opponentFormation: '4-3-3',
        opponentMentality: 'Equilibrata / Contropiede',
        opponentTacticalNotes: '',
        opponentPlayers: oppPlayers,
        aiMatchPlan: report,
        managerNotes: notes
      };
    } catch {
      return {
        opponent: 'Real Madrid',
        venue: 'Casa',
        competition: 'Premier League',
        opponentStyle: 'Contropiede Rapido su Fasce',
        strategicPriority: 'Pressione Alta e Transizione Rapida',
        opponentFormation: '4-3-3',
        opponentMentality: 'Equilibrata / Contropiede',
        opponentTacticalNotes: '',
        opponentPlayers: [],
        aiMatchPlan: null,
        managerNotes: ''
      };
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('fm26_active_gameplan', JSON.stringify(gamePlan));
      if (gamePlan.aiMatchPlan) {
        localStorage.setItem('fm26_gameplan_report', gamePlan.aiMatchPlan);
      }
      if (gamePlan.managerNotes !== undefined) {
        localStorage.setItem('fm26_gameplan_notes', gamePlan.managerNotes);
      }
      if (gamePlan.opponent && gamePlan.opponentPlayers) {
        localStorage.setItem(`fm26_opp_players_${gamePlan.opponent}`, JSON.stringify(gamePlan.opponentPlayers));
      }
    } catch (e) {
      console.error(e);
    }
  }, [gamePlan]);

  useEffect(() => {
    localStorage.setItem('fm26_team_name', teamName);
  }, [teamName]);

  useEffect(() => {
    localStorage.setItem('fm26_northampton_players', JSON.stringify(players));
  }, [players]);

  useEffect(() => {
    localStorage.setItem('fm26_northampton_tactics', JSON.stringify(tactics));
    if (tactic) {
      localStorage.setItem('fm26_northampton_tactic', JSON.stringify(tactic));
    }
  }, [tactics, tactic]);

  useEffect(() => {
    localStorage.setItem('fm26_northampton_active_tactic_idx', activeTacticIndex.toString());
  }, [activeTacticIndex]);

  useEffect(() => {
    localStorage.setItem('fm26_northampton_fixtures', JSON.stringify(fixtures));
  }, [fixtures]);

  useEffect(() => {
    localStorage.setItem('fm26_northampton_targets', JSON.stringify(targets));
  }, [targets]);

  useEffect(() => {
    localStorage.setItem('fm26_northampton_phase', JSON.stringify(phaseInfo));
  }, [phaseInfo]);

  useEffect(() => {
    localStorage.setItem('fm26_northampton_standings', JSON.stringify(standings));
  }, [standings]);

  useEffect(() => {
    localStorage.setItem('fm26_history_awards', JSON.stringify(historyAwards));
  }, [historyAwards]);

  useEffect(() => {
    localStorage.setItem('fm26_archived_calendars', JSON.stringify(archivedCalendars));
  }, [archivedCalendars]);


  const handleUpdateCurrentDate = (newDate: string) => {
    setPhaseInfo((prev) => ({
      ...prev,
      currentDate: newDate,
      currentMonth: newDate.includes(' ') ? newDate.split(' ').slice(-2).join(' ') : prev.currentMonth,
    }));
  };

  const syncAppDateWithOldestUnplayedFixture = (fixtureList: Fixture[]) => {
    const unplayed = fixtureList.filter((f) => f.status === 'In Arrivo');
    if (unplayed.length > 0) {
      const MONTHS_IT: Record<string, number> = {
        gennaio: 0, febbraio: 1, marzo: 2, aprile: 3, maggio: 4, giugno: 5,
        luglio: 6, agosto: 7, settembre: 8, ottobre: 9, novembre: 10, dicembre: 11
      };

      const parseDate = (dStr: string) => {
        if (!dStr) return new Date(8640000000000000);
        const parts = dStr.trim().split(/\s+/);
        if (parts.length >= 3) {
          const day = parseInt(parts[0], 10);
          const mName = parts[1].toLowerCase();
          const yr = parseInt(parts[2], 10);
          const mIdx = MONTHS_IT[mName] !== undefined ? MONTHS_IT[mName] : 0;
          if (!isNaN(day) && !isNaN(yr)) {
            return new Date(yr, mIdx, day);
          }
        }
        const ts = Date.parse(dStr);
        return isNaN(ts) ? new Date(8640000000000000) : new Date(ts);
      };

      const sorted = [...unplayed].sort((a, b) => parseDate(a.date).getTime() - parseDate(b.date).getTime());
      const oldest = sorted[0];
      if (oldest && oldest.date) {
        setPhaseInfo((prev) => ({
          ...prev,
          currentDate: oldest.date,
          currentMonth: oldest.date.includes(' ') ? oldest.date.split(' ').slice(-2).join(' ') : prev.currentMonth,
        }));
      }
    }
  };

  const handleUpdateFixtures = (newFixtures: Fixture[]) => {
    setFixtures(newFixtures);
    // User manual in-game date is preserved and never silently overwritten
  };

  const handleResetToDefaults = () => {
    localStorage.clear();
    localStorage.setItem('fm26_cleared', 'true');
    setTeamName('Mia Squadra FC');
    setTeamLogo(null);
    setPlayers([]);
    setYouthSquads([]);
    setTactics([emptyTactic]);
    setActiveTacticIndex(0);
    setFixtures([]);
    setTargets([]);
    setPhaseInfo(emptySeasonPhase);
    setStandings([]);
    setHistoryAwards([]);
    setArchivedCalendars([]);
    setGamePlan({
      opponent: 'Real Madrid',
      venue: 'Casa',
      competition: 'Premier League',
      opponentStyle: 'Contropiede Rapido su Fasce',
      strategicPriority: 'Pressione Alta e Transizione Rapida',
      opponentFormation: '4-3-3',
      opponentMentality: 'Equilibrata / Contropiede',
      opponentTacticalNotes: '',
      opponentPlayers: [],
      aiMatchPlan: null,
      managerNotes: ''
    });
  };

  const handleImportData = (data: {
    players: Player[];
    tactic?: TacticPreset;
    tactics?: TacticPreset[];
    activeTacticIndex?: number;
    fixtures: Fixture[];
    targets: ScoutingTarget[];
    phaseInfo: SeasonPhaseInfo;
    teamName?: string;
    standings?: StandingsRow[];
    youthSquads?: YouthSquad[];
    historyAwards?: SeasonHistoryEntry[];
    archivedCalendars?: ArchivedSeasonCalendar[];
    gamePlan?: GamePlanState;
  }) => {
    localStorage.removeItem('fm26_cleared');
    if (data.teamName) setTeamName(data.teamName);
    if (data.players) setPlayers(data.players);
    if (data.youthSquads) setYouthSquads(data.youthSquads);
    if (data.tactics && Array.isArray(data.tactics) && data.tactics.length > 0) {
      setTactics(data.tactics.slice(0, 3));
      if (data.activeTacticIndex !== undefined) {
        setActiveTacticIndex(Math.min(Math.max(data.activeTacticIndex, 0), data.tactics.length - 1));
      }
    } else if (data.tactic) {
      setTactics([data.tactic]);
      setActiveTacticIndex(0);
    }
    if (data.fixtures) handleUpdateFixtures(data.fixtures);
    if (data.targets) setTargets(data.targets);
    if (data.phaseInfo) setPhaseInfo(data.phaseInfo);
    if (data.standings) setStandings(data.standings);
    if (data.historyAwards) setHistoryAwards(data.historyAwards);
    if (data.archivedCalendars) setArchivedCalendars(data.archivedCalendars);
    if (data.gamePlan) setGamePlan(data.gamePlan);
  };


  const handleOpenCsvModal = (type: string = 'squad') => {
    setCsvDefaultDestination(type);
    setIsCsvModalOpen(true);
  };

  const injuredCount = players.filter(p => p.isInjured).length;
  const currentDate = phaseInfo.currentDate || '28 Ottobre 2026';
  const latestFixtureDate = fixtures.length > 0 ? fixtures[fixtures.length - 1].date : undefined;

  // Active reminders calculation (due today or overdue, not yet dismissed)
  const activeRemindersList = useMemo(() => {
    return getActiveReminders(reminders, notes, currentDate);
  }, [reminders, notes, currentDate]);

  const handleDismissReminder = (id: string, sourceType: 'reminder' | 'note') => {
    if (sourceType === 'reminder') {
      setReminders(prev =>
        prev.map(r => (r.id === id ? { ...r, isDismissed: true, dismissedAt: currentDate } : r))
      );
    } else if (sourceType === 'note') {
      const noteId = id.replace('note_rem_', '');
      setNotes(prev =>
        prev.map(n =>
          n.id === noteId
            ? { ...n, isReminderDismissed: true, reminderDismissedAt: currentDate }
            : n
        )
      );
    }
  };

  return (
    <BackgroundOcrProvider
      fixtures={fixtures}
      onUpdateFixtures={handleUpdateFixtures}
      standings={standings}
      onUpdateStandings={setStandings}
      teamName={teamName}
      currentDate={currentDate}
      onUpdateCurrentDate={handleUpdateCurrentDate}
    >
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      <Navbar
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        teamName={teamName}
        onUpdateTeamName={setTeamName}
        teamLogo={teamLogo}
        onOpenLogoModal={() => setIsLogoModalOpen(true)}
        injuredCount={injuredCount}
        hasNewNote={hasNewNote}
        currentDate={currentDate}
        onOpenEditDateModal={() => setIsEditDateModalOpen(true)}
        onOpenQuickSetup={() => setIsSetupOpen(true)}
        onOpenCsvModal={handleOpenCsvModal}
        onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
        fixtures={fixtures}
        duplicatesCount={squadDuplicatesReport.totalDuplicatePlayers}
        onOpenDuplicatesModal={() => handleOpenDuplicatesModal()}
        remindersCount={activeRemindersList.length}
        onOpenRemindersModal={() => setIsRemindersModalOpen(true)}
        onOpenPingModal={() => setIsPingModalOpen(true)}
      />

      {/* Persistent Active Reminders Alert Banner ("rimane fino a quando non la disattivo") */}
      <RemindersAlertBanner
        activeReminders={activeRemindersList}
        currentDate={currentDate}
        onDismissReminder={handleDismissReminder}
        onOpenRemindersModal={() => setIsRemindersModalOpen(true)}
      />

      {/* Mandatory BYOK Banner for Users without a Saved Key */}
      {!isCustomKeyActive && (
        <aside aria-label="Avviso configurazione chiave API" className="bg-gradient-to-r from-amber-500/15 via-amber-600/20 to-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 shadow-sm">
          <div className="max-w-7xl w-full mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-amber-200">
              <span className="p-1 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </span>
              <span>
                <strong className="text-white font-semibold">Configurazione obbligatoria:</strong> Per chattare con il Co-Allenatore IA, importare screenshot del calendario e generare piani gara è necessario inserire la tua <strong>Google Gemini API Key personale gratuita</strong>.
              </span>
            </div>
            <button
              id="banner-open-api-key-modal-btn"
              onClick={() => setIsApiKeyModalOpen(true)}
              className="w-full sm:w-auto px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg shrink-0 transition-all shadow-md shadow-amber-950/40 flex items-center justify-center gap-1.5 cursor-pointer text-xs"
            >
              <Key className="w-3.5 h-3.5" />
              Inserisci la tua Chiave (Gratis)
            </button>
          </div>
        </aside>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Suspense fallback={<TabLoadingSkeleton />}>
          {activeTab === 'copilot' && (
            <AiCopilot
              players={players}
              youthSquads={youthSquads}
              tactic={tactic}
              fixtures={fixtures}
              targets={targets}
              currentDate={currentDate}
              phaseInfo={phaseInfo}
              tacticalNotes={notes}
              teamName={teamName}
              gamePlan={gamePlan}
              standings={standings}
              initialPrompt={copilotInitialPrompt}
              onClearInitialPrompt={() => setCopilotInitialPrompt(undefined)}
              onSaveNoteToMemory={handleSaveNoteToMemory}
              onNavigateToNotes={() => handleTabChange('notes')}
              onNavigateToGamePlan={() => handleTabChange('gameplan')}
              onNavigateToCompetitions={() => handleTabChange('competitions')}
              onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
              onOpenPingModal={() => setIsPingModalOpen(true)}
              onUpdatePlayerNote={handleUpdatePlayerNote}
            />
          )}

          {activeTab === 'notes' && (
            <TacticalNotesBoard
              notes={notes}
              onUpdateNotes={setNotes}
              currentDate={currentDate}
            />
          )}

          {activeTab === 'squad' && (
            <SquadManager
              players={players}
              onUpdatePlayers={setPlayers}
              onOpenCsvModal={handleOpenCsvModal}
              currentDate={currentDate}
              teamName={teamName}
              youthSquads={youthSquads}
              onDemoteToYouthSquad={handleDemoteToYouthSquad}
              onAskCopilot={handleAskCopilot}
              onOpenDuplicatesModal={handleOpenDuplicatesModal}
            />
          )}

          {activeTab === 'youth' && (
            <YouthSquadManager
              youthSquads={youthSquads}
              firstTeamPlayers={players}
              onUpdateYouthSquads={setYouthSquads}
              onPromoteToFirstTeam={handlePromoteToFirstTeam}
              onOpenCsvModal={handleOpenCsvModal}
              currentDate={currentDate}
              teamName={teamName}
              onAskCopilot={handleAskCopilot}
              onOpenDuplicatesModal={handleOpenDuplicatesModal}
            />
          )}

          {activeTab === 'tactics' && (
            <TacticsBoard
              tactic={tactic}
              players={players}
              youthSquads={youthSquads}
              fixtures={fixtures}
              onUpdateTactic={handleUpdateActiveTactic}
              tactics={tactics}
              activeTacticIndex={safeActiveIdx}
              onSelectSlot={setActiveTacticIndex}
              onUpdateTactics={handleUpdateAllTactics}
            />
          )}

          {activeTab === 'gameplan' && (
            <GamePlanBoard
              tactic={tactic}
              tactics={tactics}
              activeTacticIndex={safeActiveIdx}
              onSelectSlot={setActiveTacticIndex}
              players={players}
              fixtures={fixtures}
              currentDate={currentDate}
              phaseInfo={phaseInfo}
              teamName={teamName}
              gamePlan={gamePlan}
              onUpdateGamePlan={setGamePlan}
            />
          )}

          {activeTab === 'calendar' && (
            <SeasonPhaseCalendar
              phaseInfo={phaseInfo}
              fixtures={fixtures}
              currentDate={currentDate}
              teamName={teamName}
              players={players}
              youthSquads={youthSquads}
              onOpenEditDateModal={() => setIsEditDateModalOpen(true)}
              onUpdateCurrentDate={handleUpdateCurrentDate}
              onUpdateFixtures={handleUpdateFixtures}
              archivedCalendars={archivedCalendars}
              onUpdateArchivedCalendars={setArchivedCalendars}
              onOpenRemindersModal={() => setIsRemindersModalOpen(true)}
              activeRemindersCount={activeRemindersList.length}
            />
          )}

          {activeTab === 'competitions' && (
            <CompetitionsBoard
              fixtures={fixtures}
              standings={standings}
              onUpdateStandings={setStandings}
              teamName={teamName}
              currentDate={currentDate}
              onUpdateFixtures={handleUpdateFixtures}
            />
          )}

          {activeTab === 'history' && (
            <HistoryBoard
              historyAwards={historyAwards}
              onUpdateHistoryAwards={setHistoryAwards}
              archivedCalendars={archivedCalendars}
              onUpdateArchivedCalendars={setArchivedCalendars}
              currentFixtures={fixtures}
              currentDate={currentDate}
              teamName={teamName}
              players={players}
              onRestoreCalendarToActive={handleUpdateFixtures}
            />
          )}

          {activeTab === 'scouting' && (
            <ScoutingBoard
              targets={targets}
              onUpdateTargets={setTargets}
              onOpenCsvModal={handleOpenCsvModal}
              currentDate={currentDate}
              onAskCopilot={handleAskCopilot}
              firstTeamPlayers={players}
              youthSquads={youthSquads}
              onConfirmSigning={handleConfirmSigning}
            />
          )}
        </Suspense>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500">
        FM26 Personal Executive & Tactical Assistant • Powered by Google Gemini AI
      </footer>

      {/* Modals wrapped in lightweight Suspense */}
      <Suspense fallback={null}>
        {/* Edit App Date Modal */}
        {isEditDateModalOpen && (
          <EditAppDateModal
            isOpen={isEditDateModalOpen}
            onClose={() => setIsEditDateModalOpen(false)}
            currentDate={currentDate}
            onSaveDate={handleUpdateCurrentDate}
            latestFixtureDate={latestFixtureDate}
            fixtures={fixtures}
          />
        )}

        {/* Setup / Import Modal */}
        {isSetupOpen && (
          <QuickDataSetupModal
            isOpen={isSetupOpen}
            onClose={() => setIsSetupOpen(false)}
            players={players}
            tactic={tactic}
            tactics={tactics}
            activeTacticIndex={safeActiveIdx}
            fixtures={fixtures}
            targets={targets}
            phaseInfo={phaseInfo}
            standings={standings}
            youthSquads={youthSquads}
            historyAwards={historyAwards}
            archivedCalendars={archivedCalendars}
            teamName={teamName}
            gamePlan={gamePlan}
            onResetToDefaults={handleResetToDefaults}
            onImportData={handleImportData}
            onOpenCsvModal={handleOpenCsvModal}
            onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
          />
        )}

        {/* CSV Uploader Modal */}
        {isCsvModalOpen && (
          <CsvUploaderModal
            isOpen={isCsvModalOpen}
            onClose={() => setIsCsvModalOpen(false)}
            currentPlayers={players}
            currentTargets={targets}
            youthSquads={youthSquads}
            onUpdatePlayers={setPlayers}
            onUpdateTargets={setTargets}
            onUpdateYouthSquads={setYouthSquads}
            defaultDestination={csvDefaultDestination}
            currentDate={currentDate}
          />
        )}

        {/* Bring Your Own Key (BYOK) Modal */}
        {isApiKeyModalOpen && (
          <ApiKeyModal
            isOpen={isApiKeyModalOpen}
            onClose={() => setIsApiKeyModalOpen(false)}
            onOpenPingModal={() => setIsPingModalOpen(true)}
          />
        )}

        {/* Windows CMD Ping Modal */}
        {isPingModalOpen && (
          <GeminiPingCmdModal
            isOpen={isPingModalOpen}
            onClose={() => setIsPingModalOpen(false)}
            onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
          />
        )}

        {/* Controllo e Risoluzione Doppioni Rose Modal */}
        {isDuplicatesModalOpen && (
          <SquadDuplicatesModal
            isOpen={isDuplicatesModalOpen}
            onClose={() => setIsDuplicatesModalOpen(false)}
            firstTeamPlayers={players}
            youthSquads={youthSquads}
            onApplySquadsUpdate={handleApplySquadsUpdate}
            initialSearchTerm={duplicateFilterPlayerName}
            teamName={teamName}
          />
        )}

        {/* Gestione Promemoria & Scadenze con Data Modal */}
        {isRemindersModalOpen && (
          <RemindersManagerModal
            isOpen={isRemindersModalOpen}
            onClose={() => setIsRemindersModalOpen(false)}
            currentDate={currentDate}
            reminders={reminders}
            onUpdateReminders={setReminders}
            notes={notes}
            onUpdateNotes={setNotes}
            players={players}
            onGoToNotes={() => handleTabChange('notes')}
          />
        )}

        {/* Generatore Logo Squadra AI Modal */}
        {isLogoModalOpen && (
          <TeamLogoGeneratorModal
            isOpen={isLogoModalOpen}
            onClose={() => setIsLogoModalOpen(false)}
            teamName={teamName}
            currentLogo={teamLogo}
            onSaveLogo={handleUpdateTeamLogo}
            onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
          />
        )}
      </Suspense>

      {/* Floating Background Screenshot OCR Status Widget & Mini-Dock */}
      <BackgroundOcrWidget />
    </div>
  </BackgroundOcrProvider>
  );
}

