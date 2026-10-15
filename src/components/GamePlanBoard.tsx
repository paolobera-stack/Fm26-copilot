import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { Player, TacticPreset, Fixture, SeasonPhaseInfo, OpponentPlayerCSV, GamePlanState } from '../types';
import { ConfirmDialogModal } from './ConfirmDialogModal';
import { getContextualFixtures } from '../utils/dateUtils';
import {
  Zap,
  Calendar,
  AlertTriangle,
  CheckCircle,
  FileText,
  RefreshCw,
  Target,
  Upload,
  X,
  RotateCcw,
  Sliders,
  Shield,
  Compass
} from 'lucide-react';

// Dynamic lazy import of the heavy AI analysis engine:
// Only loaded across the network when the user flips the 'Game Plan AI' toggle to ON.
const GamePlanAiAnalysisEngine = lazy(() =>
  import('./GamePlanAiAnalysisEngine').then(m => ({ default: m.GamePlanAiAnalysisEngine }))
);

function GamePlanLoadingFallback() {
  return (
    <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-10 text-center shadow-2xl space-y-4 animate-pulse">
      <div className="w-12 h-12 bg-indigo-600/20 border border-indigo-500/40 rounded-2xl flex items-center justify-center text-indigo-400 mx-auto">
        <RefreshCw className="w-6 h-6 animate-spin" />
      </div>
      <div className="space-y-1.5 max-w-md mx-auto">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
          Caricamento Motore Game Plan AI...
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          Inizializzazione dei moduli per scansione Vision dello screenshot tattico, parser rose avversarie CSV e simulatore 1v1 Gemini.
        </p>
      </div>
    </div>
  );
}

interface GamePlanBoardProps {
  tactic: TacticPreset;
  tactics?: TacticPreset[];
  activeTacticIndex?: number;
  onSelectSlot?: (index: number) => void;
  players: Player[];
  fixtures: Fixture[];
  currentDate: string;
  phaseInfo: SeasonPhaseInfo;
  teamName?: string;
  gamePlan?: GamePlanState;
  onUpdateGamePlan?: (plan: GamePlanState) => void;
}

export const GamePlanBoard: React.FC<GamePlanBoardProps> = ({
  tactic,
  tactics,
  activeTacticIndex = 0,
  onSelectSlot,
  players,
  fixtures,
  currentDate,
  phaseInfo,
  teamName = 'La Tua Squadra',
  gamePlan,
  onUpdateGamePlan
}) => {
  const upcomingFixtures = fixtures.filter(f => f.status === 'In Arrivo');
  const defaultFixture = upcomingFixtures.length > 0 ? upcomingFixtures[0] : null;

  const { nextFixture, daysToNext } = useMemo(() => {
    return getContextualFixtures(fixtures, currentDate);
  }, [fixtures, currentDate]);

  // Match info
  const [selectedOpponent, setSelectedOpponent] = useState(
    gamePlan?.opponent || defaultFixture?.opponent || 'Real Madrid'
  );
  const [venue, setVenue] = useState<'Casa' | 'Trasferta' | 'Campo Neutro'>(
    gamePlan?.venue || defaultFixture?.venue || 'Casa'
  );
  const [competition, setCompetition] = useState(
    gamePlan?.competition || defaultFixture?.competition || 'Premier League'
  );
  const [opponentStyle, setOpponentStyle] = useState(
    gamePlan?.opponentStyle || 'Contropiede Rapido su Fasce'
  );
  const [strategicPriority, setStrategicPriority] = useState(
    gamePlan?.strategicPriority || 'Pressione Alta e Transizione Rapida'
  );

  // Opponent Tactical Data Acquisition
  const [opponentFormation, setOpponentFormation] = useState(
    gamePlan?.opponentFormation || '4-3-3'
  );
  const [opponentMentality, setOpponentMentality] = useState(
    gamePlan?.opponentMentality || 'Equilibrata / Contropiede'
  );
  const [opponentTacticalNotes, setOpponentTacticalNotes] = useState(
    gamePlan?.opponentTacticalNotes || ''
  );
  const [opponentScreenshotBase64, setOpponentScreenshotBase64] = useState<string | null>(
    gamePlan?.opponentScreenshotBase64 || null
  );

  // Opponent Squad Data via CSV / manual
  const [opponentPlayers, setOpponentPlayers] = useState<OpponentPlayerCSV[]>(() => {
    if (gamePlan?.opponentPlayers && gamePlan.opponentPlayers.length > 0) {
      return gamePlan.opponentPlayers;
    }
    try {
      const saved = localStorage.getItem(`fm26_opp_players_${gamePlan?.opponent || selectedOpponent}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error(e);
    }
    return [
      { id: 'opp_1', name: 'Vinícius Júnior', position: 'AS', qualities: 'Velocità bruciante e dribbling nello stretto', weaknesses: 'Poco rientro difensivo' },
      { id: 'opp_2', name: 'Jude Bellingham', position: 'TRQ', qualities: 'Inserimenti senza palla e fisicità', weaknesses: 'Tende a commettere fallo se pressato alto' },
      { id: 'opp_3', name: 'Thibaut Courtois', position: 'POR', qualities: 'Uscite alte e riflessi fenomenali', weaknesses: 'Gioco coi piedi sotto pressione' }
    ];
  });

  // AI Match plan and Manager personal notes
  const [aiMatchPlan, setAiMatchPlan] = useState<string | null>(() => {
    return gamePlan?.aiMatchPlan || localStorage.getItem('fm26_gameplan_report') || null;
  });
  const [managerNotes, setManagerNotes] = useState<string>(() => {
    return gamePlan?.managerNotes || localStorage.getItem('fm26_gameplan_notes') || '';
  });

  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'info'; message: string } | null>(null);

  // 'Game Plan AI' toggle (default: false / light payload and light dependencies)
  // Dynamic import of GamePlanAiAnalysisEngine is triggered ONLY when this flips to true!
  const [isCopilotSyncEnabled, setIsCopilotSyncEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('fm26_payload_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        return Boolean(parsed.includeGamePlan);
      }
    } catch {}
    return false;
  });

  const handleToggleCopilotSync = () => {
    const nextState = !isCopilotSyncEnabled;
    setIsCopilotSyncEnabled(nextState);
    try {
      const saved = localStorage.getItem('fm26_payload_config');
      const parsed = saved ? JSON.parse(saved) : {};
      parsed.includeGamePlan = nextState;
      localStorage.setItem('fm26_payload_config', JSON.stringify(parsed));
      window.dispatchEvent(new CustomEvent('fm26_payload_config_updated', { detail: parsed }));
      setActionFeedback({
        type: 'success',
        message: nextState
          ? '⚡ Modalità Game Plan AI attivata: motore di analisi e profili avversari caricati nel sistema.'
          : '💤 Modalità Game Plan AI disattivata: motore a riposo e payload alleggerito per le normali chat quotidiane.'
      });
    } catch {}
  };

  // Sync state if changed externally in Copilot or Memory Diagnostics
  useEffect(() => {
    const handleConfigEvent = () => {
      try {
        const saved = localStorage.getItem('fm26_payload_config');
        if (saved) {
          const parsed = JSON.parse(saved);
          setIsCopilotSyncEnabled(Boolean(parsed.includeGamePlan));
        }
      } catch {}
    };

    window.addEventListener('fm26_payload_config_updated', handleConfigEvent);
    window.addEventListener('storage', handleConfigEvent);
    return () => {
      window.removeEventListener('fm26_payload_config_updated', handleConfigEvent);
      window.removeEventListener('storage', handleConfigEvent);
    };
  }, []);

  // Auto-dismiss action feedback after 5 seconds
  useEffect(() => {
    if (actionFeedback) {
      const timer = setTimeout(() => setActionFeedback(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [actionFeedback]);

  // Save opponent players to localStorage when selected opponent or players list change
  useEffect(() => {
    try {
      localStorage.setItem(`fm26_opp_players_${selectedOpponent}`, JSON.stringify(opponentPlayers));
    } catch (e) {
      console.error(e);
    }
  }, [selectedOpponent, opponentPlayers]);

  // Sync report & manager notes to localStorage and to parent gamePlan state
  useEffect(() => {
    if (aiMatchPlan) {
      localStorage.setItem('fm26_gameplan_report', aiMatchPlan);
    }
  }, [aiMatchPlan]);

  useEffect(() => {
    localStorage.setItem('fm26_gameplan_notes', managerNotes);
  }, [managerNotes]);

  // Keep parent and global gamePlan updated with latest changes
  useEffect(() => {
    const updatedPlan: GamePlanState = {
      opponent: selectedOpponent,
      venue,
      competition,
      opponentStyle,
      strategicPriority,
      opponentFormation,
      opponentMentality,
      opponentTacticalNotes,
      opponentScreenshotBase64,
      opponentPlayers,
      aiMatchPlan,
      managerNotes,
      lastUpdated: currentDate
    };

    if (onUpdateGamePlan) {
      onUpdateGamePlan(updatedPlan);
    }
    try {
      localStorage.setItem('fm26_active_gameplan', JSON.stringify(updatedPlan));
    } catch (e) {
      console.error(e);
    }
  }, [
    selectedOpponent,
    venue,
    competition,
    opponentStyle,
    strategicPriority,
    opponentFormation,
    opponentMentality,
    opponentTacticalNotes,
    opponentScreenshotBase64,
    opponentPlayers,
    aiMatchPlan,
    managerNotes,
    onUpdateGamePlan
  ]);

  const handleFixtureSelect = (oppName: string) => {
    setSelectedOpponent(oppName);
    const fix = fixtures.find(f => f.opponent === oppName);
    if (fix) {
      setVenue(fix.venue);
      setCompetition(fix.competition);
      if (fix.tacticalNotes) {
        setManagerNotes(prev => prev ? `${prev}\n\n[Note Partita]: ${fix.tacticalNotes}` : fix.tacticalNotes || '');
      }
    }
  };

  // Export full match data to JSON file
  const handleExportMatchJson = () => {
    const matchData = {
      version: 'FM26-GamePlan-v1',
      exportedAt: new Date().toISOString(),
      matchInfo: {
        opponent: selectedOpponent,
        venue,
        competition,
        opponentStyle,
        strategicPriority,
        currentDate,
      },
      opponentTactics: {
        formation: opponentFormation,
        mentality: opponentMentality,
        tacticalNotes: opponentTacticalNotes,
        screenshotBase64: opponentScreenshotBase64,
      },
      opponentPlayers,
      aiMatchPlan,
      managerNotes,
      squadTactic: tactic
    };

    const blob = new Blob([JSON.stringify(matchData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FM26_Match_${selectedOpponent.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import full match data from JSON file
  const handleImportMatchJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);

        if (parsed.matchInfo) {
          if (parsed.matchInfo.opponent) setSelectedOpponent(parsed.matchInfo.opponent);
          if (parsed.matchInfo.venue) setVenue(parsed.matchInfo.venue);
          if (parsed.matchInfo.competition) setCompetition(parsed.matchInfo.competition);
          if (parsed.matchInfo.opponentStyle) setOpponentStyle(parsed.matchInfo.opponentStyle);
          if (parsed.matchInfo.strategicPriority) setStrategicPriority(parsed.matchInfo.strategicPriority);
        }

        if (parsed.opponentTactics) {
          if (parsed.opponentTactics.formation) setOpponentFormation(parsed.opponentTactics.formation);
          if (parsed.opponentTactics.mentality) setOpponentMentality(parsed.opponentTactics.mentality);
          if (parsed.opponentTactics.tacticalNotes !== undefined) setOpponentTacticalNotes(parsed.opponentTactics.tacticalNotes);
          if (parsed.opponentTactics.screenshotBase64 !== undefined) setOpponentScreenshotBase64(parsed.opponentTactics.screenshotBase64);
        }

        if (parsed.opponentPlayers && Array.isArray(parsed.opponentPlayers)) {
          setOpponentPlayers(parsed.opponentPlayers);
        }

        if (parsed.aiMatchPlan) setAiMatchPlan(parsed.aiMatchPlan);
        if (parsed.managerNotes !== undefined) setManagerNotes(parsed.managerNotes);

        setActionFeedback({
          type: 'success',
          message: `✅ Dati partita per "${parsed.matchInfo?.opponent || 'Avversario'}" importati con successo da file JSON!`
        });
        e.target.value = '';
      } catch (err: any) {
        alert(`Errore nell'importazione del file JSON della partita: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  const injuredPlayers = players.filter(p => p.isInjured);

  // Full reset of all game plan data
  const handleResetEverything = () => {
    const opp = defaultFixture?.opponent || 'Avversario';
    setSelectedOpponent(opp);
    setVenue(defaultFixture?.venue || 'Casa');
    setCompetition(defaultFixture?.competition || 'Premier League');
    setOpponentStyle('Contropiede Rapido su Fasce');
    setStrategicPriority('Pressione Alta e Transizione Rapida');
    setOpponentFormation('');
    setOpponentMentality('Equilibrata / Contropiede');
    setOpponentTacticalNotes('');
    setOpponentScreenshotBase64(null);
    setOpponentPlayers([]);
    setAiMatchPlan(null);
    setManagerNotes('');

    try {
      localStorage.removeItem('fm26_gameplan_report');
      localStorage.removeItem('fm26_gameplan_notes');
      localStorage.removeItem('fm26_active_gameplan');
      if (selectedOpponent) {
        localStorage.removeItem(`fm26_opp_players_${selectedOpponent}`);
      }
      localStorage.removeItem(`fm26_opp_players_${opp}`);
    } catch (e) {
      console.error(e);
    }

    setIsResetConfirmOpen(false);
    setActionFeedback({
      type: 'success',
      message: 'Piano di Gara resettato con successo ai valori iniziali.'
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 rounded-2xl p-6 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-indigo-600/20 border border-indigo-500/40 rounded-2xl flex items-center justify-center text-indigo-400 shadow-inner shrink-0">
            <Zap className={`w-6 h-6 ${isCopilotSyncEnabled ? 'text-amber-400 animate-pulse' : 'text-indigo-400'}`} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xl font-black text-white tracking-tight">Piano di Gara AI (Match Analyst Hub)</h2>
              <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                FM26 Match Intelligence
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Imposta il piano partita per {teamName} contro {selectedOpponent}. Attiva il motore AI avanzato per le sfide decisive o le finali.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Explicit 'Game Plan AI' toggle button */}
          <button
            onClick={handleToggleCopilotSync}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer border shadow-sm ${
              isCopilotSyncEnabled
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30 ring-1 ring-amber-500/40'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
            }`}
            title="Attiva o disattiva il motore avanzato Game Plan AI (acquisizione screenshot Vision, scouting CSV e simulatore tattico)"
          >
            <Zap className={`w-4 h-4 ${isCopilotSyncEnabled ? 'text-amber-400 animate-pulse' : 'text-slate-500'}`} />
            <span>Game Plan AI: {isCopilotSyncEnabled ? '⚡ ATTIVO (Big Match)' : '💤 DISATTIVATO (Default)'}</span>
          </button>

          <div className="flex items-center space-x-2 bg-slate-950/80 px-3.5 py-2 rounded-xl border border-slate-800 text-xs">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <span className="text-slate-300">Data Partita:</span>
            <span className="font-bold text-emerald-400">{currentDate}</span>
          </div>

          <button
            onClick={handleExportMatchJson}
            className="bg-slate-950 hover:bg-slate-800 border border-slate-800 text-emerald-400 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Esporta tutti i dati di questa partita in un file JSON"
          >
            <Upload className="w-3.5 h-3.5 rotate-180" />
            <span>Esporta Match JSON</span>
          </button>

          <input
            type="file"
            accept=".json,application/json"
            id="match-json-file-input"
            onChange={handleImportMatchJson}
            className="hidden"
          />
          <label
            htmlFor="match-json-file-input"
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-md"
            title="Carica un file JSON con i dati di una partita salvata"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Importa Match JSON</span>
          </label>

          <button
            onClick={() => setIsResetConfirmOpen(true)}
            className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/30 font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
            title="Azzera e ripristina tutti i dati del Piano Gara"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Resetta Tutto</span>
          </button>
        </div>
      </div>

      {/* Action feedback notification banner */}
      {actionFeedback && (
        <div className="bg-slate-900/90 border border-emerald-500/30 text-emerald-300 px-4 py-3 rounded-xl flex items-center justify-between text-xs shadow-lg animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionFeedback.message}</span>
          </div>
          <button
            onClick={() => setActionFeedback(null)}
            className="text-slate-400 hover:text-white p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Grid: Match Setup & Baseline Tactic */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Match Basic Parameters */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 flex-wrap gap-2">
            <div className="flex items-center space-x-2">
              <Target className="w-5 h-5 text-indigo-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Dati Match & Avversario</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] bg-slate-950 text-slate-400 border border-slate-800 px-2 py-0.5 rounded-lg flex items-center gap-1">
                <Calendar className="w-3 h-3 text-emerald-400" />
                <span>Oggi: <strong>{currentDate}</strong></span>
              </span>
              <span className="text-xs text-slate-400 font-mono">{competition}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {/* Opponent Selection */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-slate-300 font-semibold block">Seleziona Avversario</label>
                {nextFixture && selectedOpponent !== nextFixture.opponent && (
                  <button
                    type="button"
                    onClick={() => handleFixtureSelect(nextFixture.opponent)}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold underline cursor-pointer"
                    title={`Imposta il match imminente: vs ${nextFixture.opponent} (${nextFixture.date})`}
                  >
                    ⚡ Prossima: vs {nextFixture.opponent}
                  </button>
                )}
              </div>
              {fixtures.length > 0 ? (
                <select
                  value={selectedOpponent}
                  onChange={(e) => handleFixtureSelect(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-white font-bold rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500"
                >
                  {fixtures.map((fix, idx) => (
                    <option key={idx} value={fix.opponent}>
                      {fix.opponent} ({fix.date} • {fix.competition})
                    </option>
                  ))}
                  <option value={selectedOpponent}>-- Altro: {selectedOpponent} --</option>
                </select>
              ) : (
                <input
                  type="text"
                  value={selectedOpponent}
                  onChange={(e) => setSelectedOpponent(e.target.value)}
                  placeholder="Nome club avversario"
                  className="w-full bg-slate-950 border border-slate-800 text-white font-bold rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500"
                />
              )}
            </div>

            {/* Venue & Competition */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-400 font-medium block mb-1.5">Sede</label>
                <select
                  value={venue}
                  onChange={(e) => setVenue(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500 font-semibold"
                >
                  <option value="Casa">Casa</option>
                  <option value="Trasferta">Trasferta</option>
                  <option value="Campo Neutro">Campo Neutro</option>
                </select>
              </div>
              <div>
                <label className="text-slate-400 font-medium block mb-1.5">Competizione</label>
                <input
                  type="text"
                  value={competition}
                  onChange={(e) => setCompetition(e.target.value)}
                  placeholder="Es. Premier League"
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Opponent Presumed Style */}
            <div>
              <label className="text-slate-400 font-medium block mb-1.5">Stile di Gioco Avversario</label>
              <select
                value={opponentStyle}
                onChange={(e) => setOpponentStyle(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500"
              >
                <option value="Contropiede Rapido su Fasce">Contropiede Rapido su Fasce</option>
                <option value="Gegenpress Asfissiante">Gegenpress Asfissiante</option>
                <option value="Possesso Palla e Dominio Territoriale">Possesso Palla e Dominio Territoriale</option>
                <option value="Blocco Basso e Catenaccio">Blocco Basso e Catenaccio</option>
                <option value="Palla Lunga sul Target Man">Palla Lunga sul Target Man</option>
                <option value="Tiki-Taka Verticale">Tiki-Taka Verticale</option>
              </select>
            </div>

            {/* Our Tactical Priority */}
            <div>
              <label className="text-slate-400 font-medium block mb-1.5">Priorità Strategica del Nostro Match</label>
              <select
                value={strategicPriority}
                onChange={(e) => setStrategicPriority(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-emerald-400 font-bold rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500"
              >
                <option value="Pressione Alta e Transizione Rapida">Pressione Alta e Transizione Rapida</option>
                <option value="Controllo Ritmi e Possesso Sicuro">Controllo Ritmi e Possesso Sicuro</option>
                <option value="Compattezza Difensiva e Ripartenza">Compattezza Difensiva e Ripartenza</option>
                <option value="Sfruttamento Ampiezza e Sovrapposizioni">Sfruttamento Ampiezza e Sovrapposizioni</option>
                <option value="Gabbia sul Regista Avversario">Gabbia sul Regista Avversario</option>
              </select>
            </div>
          </div>

          {/* Quick Context Fixture Info */}
          {nextFixture && (
            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center space-x-2">
                <Target className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>
                  Match da calendario: <strong className="text-white">{nextFixture.opponent}</strong> ({nextFixture.venue}, {nextFixture.competition})
                </span>
              </div>
              <span className="font-mono text-emerald-400 font-semibold">{daysToNext}</span>
            </div>
          )}
        </div>

        {/* Baseline Tactic Summary */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
              <div className="flex items-center space-x-2">
                <Shield className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Assetto Tattico Partita</h3>
              </div>
              <span className="text-xs bg-emerald-500/10 text-emerald-300 font-bold px-2 py-0.5 rounded border border-emerald-500/30">
                {tactic.formation}
              </span>
            </div>

            {/* 3-Slot Tactic Selector if available */}
            {tactics && tactics.length > 1 && onSelectSlot && (
              <div className="mb-3 space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
                  Seleziona Slot Tattica Base:
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {tactics.slice(0, 3).map((slotTactic, idx) => (
                    <button
                      key={slotTactic.id || idx}
                      type="button"
                      onClick={() => onSelectSlot(idx)}
                      className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-all truncate border text-center ${
                        activeTacticIndex === idx
                          ? 'bg-emerald-600 text-white border-emerald-400 shadow-md ring-1 ring-emerald-400/50'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
                      }`}
                      title={slotTactic.name}
                    >
                      <div className="truncate">{slotTactic.name}</div>
                      <div className="text-[10px] opacity-80 font-mono truncate">{slotTactic.formation}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Modulo:</span>
                <span className="font-bold text-white">{tactic.formation}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Mentalità Base:</span>
                <span className="font-bold text-emerald-400">{tactic.mentality}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Stile di Gioco:</span>
                <span className="font-medium text-slate-200">{tactic.tacticalStyle || 'Gegenpress'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Ritmo / Passaggi:</span>
                <span className="font-medium text-slate-200">{tactic.tempo} / {tactic.passingStyle}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Pressing / Linea:</span>
                <span className="font-medium text-slate-200">{tactic.pressingTrigger} / {tactic.defensiveLine}</span>
              </div>
            </div>

            {injuredPlayers.length > 0 && (
              <div className="mt-3 p-2.5 rounded-xl bg-rose-950/30 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span className="truncate">
                  {injuredPlayers.length} infortunati: {injuredPlayers.map(p => p.name).join(', ')}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* DYNAMIC ANALYSIS ENGINE SECTION:
          Loaded dynamically ONLY when the user turns the 'Game Plan AI' toggle to ON.
          When OFF, renders a clean standby explanation card. */}
      {isCopilotSyncEnabled ? (
        <Suspense fallback={<GamePlanLoadingFallback />}>
          <GamePlanAiAnalysisEngine
            selectedOpponent={selectedOpponent}
            venue={venue}
            competition={competition}
            opponentStyle={opponentStyle}
            setOpponentStyle={setOpponentStyle}
            strategicPriority={strategicPriority}
            setStrategicPriority={setStrategicPriority}
            opponentFormation={opponentFormation}
            setOpponentFormation={setOpponentFormation}
            opponentMentality={opponentMentality}
            setOpponentMentality={setOpponentMentality}
            opponentTacticalNotes={opponentTacticalNotes}
            setOpponentTacticalNotes={setOpponentTacticalNotes}
            opponentScreenshotBase64={opponentScreenshotBase64}
            setOpponentScreenshotBase64={setOpponentScreenshotBase64}
            opponentPlayers={opponentPlayers}
            setOpponentPlayers={setOpponentPlayers}
            aiMatchPlan={aiMatchPlan}
            setAiMatchPlan={setAiMatchPlan}
            players={players}
            tactic={tactic}
            currentDate={currentDate}
            teamName={teamName}
            onActionFeedback={(msg) => setActionFeedback({ type: 'success', message: msg })}
          />
        </Suspense>
      ) : (
        /* Standby Card when Game Plan AI toggle is OFF */
        <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border border-slate-800 hover:border-amber-500/40 rounded-2xl p-8 shadow-xl text-center space-y-5 transition-all">
          <div className="w-14 h-14 bg-slate-900 border border-slate-700/80 rounded-2xl flex items-center justify-center text-amber-400/80 mx-auto shadow-inner">
            <Zap className="w-7 h-7" />
          </div>
          <div className="max-w-xl mx-auto space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-slate-300 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-slate-500"></span>
              Motore Game Plan AI: Disattivato di Default
            </div>
            <h3 className="text-lg font-black text-white tracking-tight">
              Analisi Pre-Partita Avanzata a Riposo
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              L'elaborazione pesante (scansione Vision dello screenshot avversario, parser rose CSV e simulatore tattico 1v1 con AI) è a riposo per preservare la massima velocità e mantenere snello il payload del Copilot.
              <br />
              <span className="text-slate-300 font-medium">Ideale da attivare quelle 2-3 volte all'anno in occasione di finali di coppa o big match decisivi.</span>
            </p>
          </div>
          <div className="pt-1">
            <button
              type="button"
              onClick={handleToggleCopilotSync}
              className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs px-6 py-3 rounded-xl transition-all shadow-lg hover:shadow-amber-500/20 flex items-center gap-2 mx-auto cursor-pointer"
            >
              <Zap className="w-4 h-4 fill-current" />
              <span>Attiva Game Plan AI per questa partita</span>
            </button>
          </div>
        </div>
      )}

      {/* SECTION: Note Personali del Manager per la Partita (Always accessible) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <FileText className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-white text-sm uppercase tracking-wider">
              Note Personali del Manager per la Partita
            </h3>
          </div>
          <span className="text-xs text-slate-500">Salvataggio automatico</span>
        </div>

        <p className="text-xs text-slate-400">
          Annota qui le tue direttive per la sfida contro <strong>{selectedOpponent}</strong>, le sostituzioni concordate o le contromisure da dare negli spogliatoi.
        </p>

        <textarea
          value={managerNotes}
          onChange={(e) => setManagerNotes(e.target.value)}
          placeholder="Es: Al 60' sostituire la punta affaticata se siamo in vantaggio; passare al 4-5-1 se l'avversario spinge sulle fasce..."
          rows={4}
          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/60 font-mono leading-relaxed shadow-inner"
        />
      </div>

      {/* Reset Confirmation Dialog */}
      <ConfirmDialogModal
        isOpen={isResetConfirmOpen}
        title="Resettare l'intero Piano di Gara?"
        message="Sei sicuro di voler azzerare tutti i parametri del piano gara? Verranno rimossi l'avversario selezionato, lo screenshot della tattica, i giocatori avversari caricati, il report AI e le note del manager."
        confirmLabel="Sì, Resetta Tutto"
        cancelLabel="Annulla"
        isDangerous={true}
        onConfirm={handleResetEverything}
        onCancel={() => setIsResetConfirmOpen(false)}
      />
    </div>
  );
};
