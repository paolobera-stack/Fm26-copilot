import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  AreaChart,
  BarChart,
  LineChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Cell
} from 'recharts';
import {
  TrendingUp,
  BarChart3,
  Activity,
  Shield,
  Target,
  Trophy,
  Calendar,
  Sparkles,
  RefreshCw,
  Flame,
  CheckCircle2,
  Filter,
  Home,
  Plane,
  Layers,
  ArrowRightLeft,
  Columns,
  RotateCcw
} from 'lucide-react';
import { Fixture, StandingsRow } from '../types';
import { getFixtureResult } from '../utils/calendarExportUtils';
import { sortFixturesByDate } from '../utils/dateUtils';
import { initialPlayedFixtures } from '../data/initialData';
import { ConfirmDialogModal } from './ConfirmDialogModal';

export interface GoalsTrendDashboardProps {
  fixtures: Fixture[];
  standings?: StandingsRow[];
  teamName?: string;
  onImportPlayedFixtures?: (fixturesToImport: Fixture[]) => void;
  onClearSeasonalTrend?: () => void;
  onResetToDemoData?: () => void;
}

export type ScopeMode = 'all' | 'league' | 'compare';
type ChartViewMode = 'cumulative' | 'perMatch' | 'difference' | 'homeAway';

interface MatchTrendPoint {
  index: number;
  label: string;
  shortLabel: string;
  date: string;
  opponent: string;
  venue: 'Casa' | 'Trasferta' | 'Campo Neutro';
  competition: string;
  score: string;
  outcome: 'Vittoria' | 'Pareggio' | 'Sconfitta';
  gf: number;
  ga: number;
  gd: number;
  cumulativeGf: number;
  cumulativeGa: number;
  cumulativeGd: number;
  avgGf: number;
  avgGa: number;
  cleanSheet: boolean;
  failedToScore: boolean;
  scorers?: string[];
  tacticalNotes?: string;
  fixtureId: string;
}

// Helper to convert fixture list into chronological trend points
function buildTrendPoints(fixturesList: Fixture[]): MatchTrendPoint[] {
  let runningGf = 0;
  let runningGa = 0;
  const sorted = sortFixturesByDate(fixturesList);

  return sorted.map((f, idx) => {
    const matchIndex = idx + 1;
    const res = getFixtureResult(f);
    const gf = res ? res.teamGoals : 0;
    const ga = res ? res.oppGoals : 0;
    const gd = gf - ga;
    const outcome = res ? res.outcome : (gd > 0 ? 'Vittoria' : gd === 0 ? 'Pareggio' : 'Sconfitta');
    const score = res ? res.displayScore : (f.score || `${gf}-${ga}`);

    runningGf += gf;
    runningGa += ga;
    const runningGd = runningGf - runningGa;

    const venueShort = f.venue === 'Casa' ? '(C)' : f.venue === 'Trasferta' ? '(T)' : '(N)';
    const shortOpp = f.opponent.length > 10 ? f.opponent.substring(0, 9) + '…' : f.opponent;

    return {
      index: matchIndex,
      label: `G${matchIndex} vs ${shortOpp} ${venueShort}`,
      shortLabel: `G${matchIndex}`,
      date: f.date,
      opponent: f.opponent,
      venue: f.venue,
      competition: f.competition,
      score,
      outcome,
      gf,
      ga,
      gd,
      cumulativeGf: runningGf,
      cumulativeGa: runningGa,
      cumulativeGd: runningGd,
      avgGf: Number((runningGf / matchIndex).toFixed(2)),
      avgGa: Number((runningGa / matchIndex).toFixed(2)),
      cleanSheet: ga === 0,
      failedToScore: gf === 0,
      scorers: f.scorers,
      tacticalNotes: f.tacticalNotes,
      fixtureId: f.id
    };
  });
}

// Helper to compute stats summary
function computeStatsSummary(points: MatchTrendPoint[]) {
  const totalMatches = points.length;
  if (totalMatches === 0) {
    return {
      totalMatches: 0,
      totalGf: 0,
      totalGa: 0,
      totalGd: 0,
      avgGf: '0.00',
      avgGa: '0.00',
      cleanSheets: 0,
      cleanSheetPct: 0,
      failedToScore: 0,
      failedToScorePct: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      winRate: 0,
      homeGf: 0,
      homeGa: 0,
      homeMatches: 0,
      awayGf: 0,
      awayGa: 0,
      awayMatches: 0,
      topScoringMatch: null as MatchTrendPoint | null
    };
  }

  let totalGf = 0;
  let totalGa = 0;
  let cleanSheets = 0;
  let failedToScore = 0;
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let homeGf = 0;
  let homeGa = 0;
  let homeMatches = 0;
  let awayGf = 0;
  let awayGa = 0;
  let awayMatches = 0;
  let maxGf = -1;
  let topScoringMatch: MatchTrendPoint | null = null;

  points.forEach(p => {
    totalGf += p.gf;
    totalGa += p.ga;
    if (p.cleanSheet) cleanSheets++;
    if (p.failedToScore) failedToScore++;
    if (p.outcome === 'Vittoria') wins++;
    else if (p.outcome === 'Pareggio') draws++;
    else losses++;

    if (p.venue === 'Casa') {
      homeMatches++;
      homeGf += p.gf;
      homeGa += p.ga;
    } else {
      awayMatches++;
      awayGf += p.gf;
      awayGa += p.ga;
    }

    if (p.gf > maxGf) {
      maxGf = p.gf;
      topScoringMatch = p;
    }
  });

  return {
    totalMatches,
    totalGf,
    totalGa,
    totalGd: totalGf - totalGa,
    avgGf: (totalGf / totalMatches).toFixed(2),
    avgGa: (totalGa / totalMatches).toFixed(2),
    cleanSheets,
    cleanSheetPct: Math.round((cleanSheets / totalMatches) * 100),
    failedToScore,
    failedToScorePct: Math.round((failedToScore / totalMatches) * 100),
    wins,
    draws,
    losses,
    winRate: Math.round((wins / totalMatches) * 100),
    homeGf,
    homeGa,
    homeMatches,
    awayGf,
    awayGa,
    awayMatches,
    topScoringMatch
  };
}

export const GoalsTrendDashboard: React.FC<GoalsTrendDashboardProps> = ({
  fixtures,
  standings = [],
  teamName = 'La Tua Squadra FC',
  onImportPlayedFixtures,
  onClearSeasonalTrend,
  onResetToDemoData
}) => {
  // Primary switch: 'all' (Tutte le partite) vs 'league' (Solo Campionato) vs 'compare' (Confronto Parallelo)
  const [scopeMode, setScopeMode] = useState<ScopeMode>('all');
  // Sub-filter for specific competition if in 'all' mode
  const [selectedCompetition, setSelectedCompetition] = useState<string>('all');
  // Recharts visualization mode
  const [viewMode, setViewMode] = useState<ChartViewMode>('cumulative');
  // Selected match for card detail
  const [selectedMatchIndex, setSelectedMatchIndex] = useState<number | null>(null);
  // DataSource switch: 'auto', 'state', or 'initial'
  const [dataSourceOverride, setDataSourceOverride] = useState<'auto' | 'state' | 'initial'>('auto');

  // Modal to confirm clearing the seasonal trend
  const [isClearTrendModalOpen, setIsClearTrendModalOpen] = useState(false);

  // Persistent track if seasonal trend was cleared
  const [isTrendCleared, setIsTrendCleared] = useState<boolean>(() => {
    try {
      return localStorage.getItem('fm26_trend_cleared') === 'true';
    } catch {
      return false;
    }
  });

  // Filter state fixtures that are played
  const statePlayedMatches = useMemo(() => {
    return fixtures.filter(f => f.status === 'Giocata' || Boolean(f.score));
  }, [fixtures]);

  // Synchronize when standings is emptied (e.g. user emptied the table for the new season)
  React.useEffect(() => {
    if (standings.length === 0) {
      setIsTrendCleared(true);
    }
  }, [standings.length]);

  // If live matches are entered, clear the "trend_cleared" flag
  React.useEffect(() => {
    if (statePlayedMatches.length > 0 && isTrendCleared) {
      try {
        localStorage.removeItem('fm26_trend_cleared');
      } catch {
        // ignore
      }
      setIsTrendCleared(false);
    }
  }, [statePlayedMatches.length, isTrendCleared]);

  // Determine active master dataset to use
  const { activeFixtures, isUsingInitialData } = useMemo(() => {
    // 1. Explicit override to initial demo dataset
    if (dataSourceOverride === 'initial') {
      return { activeFixtures: initialPlayedFixtures, isUsingInitialData: true };
    }
    // 2. Explicit override to state
    if (dataSourceOverride === 'state') {
      return { activeFixtures: statePlayedMatches, isUsingInitialData: false };
    }
    // 3. Live calendar has played matches: always prioritize actual played matches
    if (statePlayedMatches.length > 0) {
      return { activeFixtures: statePlayedMatches, isUsingInitialData: false };
    }
    // 4. Standings is empty (classifica svuotata per inizio nuova stagione) OR trend was cleared:
    // DO NOT fallback to previous season matches!
    if (isTrendCleared || standings.length === 0) {
      return { activeFixtures: [], isUsingInitialData: false };
    }
    // 5. Default initial demo fallback only when un-cleared with default standings
    return { activeFixtures: initialPlayedFixtures, isUsingInitialData: true };
  }, [statePlayedMatches, dataSourceOverride, isTrendCleared, standings.length]);

  // Detect league competition name (e.g. 'Premier League', 'Serie A', etc.)
  const leagueName = useMemo(() => {
    const candidates = ['Premier League', 'Serie A', 'La Liga', 'Bundesliga', 'Ligue 1', 'Campionato'];
    for (const cand of candidates) {
      if (activeFixtures.some(f => f.competition?.toLowerCase().includes(cand.toLowerCase()))) {
        return cand;
      }
    }
    // Fallback: first competition found
    return activeFixtures[0]?.competition || 'Premier League';
  }, [activeFixtures]);

  // Unique competitions present in dataset
  const availableCompetitions = useMemo(() => {
    const set = new Set<string>();
    activeFixtures.forEach(f => {
      if (f.competition) set.add(f.competition);
    });
    return Array.from(set);
  }, [activeFixtures]);

  // Datasets according to scope
  // 1. All matches dataset
  const allFixturesList = useMemo(() => {
    return activeFixtures;
  }, [activeFixtures]);

  // 2. League only dataset
  const leagueFixturesList = useMemo(() => {
    return activeFixtures.filter(f =>
      f.competition?.toLowerCase().includes(leagueName.toLowerCase()) ||
      f.competition?.toLowerCase().includes('premier') ||
      f.competition?.toLowerCase().includes('campionato')
    );
  }, [activeFixtures, leagueName]);

  // 3. Cups only dataset (other competitions)
  const cupsFixturesList = useMemo(() => {
    return activeFixtures.filter(f =>
      !f.competition?.toLowerCase().includes(leagueName.toLowerCase()) &&
      !f.competition?.toLowerCase().includes('premier') &&
      !f.competition?.toLowerCase().includes('campionato')
    );
  }, [activeFixtures, leagueName]);

  // Active trend points for current view
  const currentFixturesList = useMemo(() => {
    if (scopeMode === 'league') {
      return leagueFixturesList;
    }
    if (scopeMode === 'all') {
      if (selectedCompetition !== 'all') {
        return activeFixtures.filter(f => f.competition === selectedCompetition);
      }
      return allFixturesList;
    }
    // compare mode: default active is all
    return allFixturesList;
  }, [scopeMode, selectedCompetition, leagueFixturesList, allFixturesList, activeFixtures]);

  const trendPoints: MatchTrendPoint[] = useMemo(() => {
    return buildTrendPoints(currentFixturesList);
  }, [currentFixturesList]);

  const allTrendPoints: MatchTrendPoint[] = useMemo(() => {
    return buildTrendPoints(allFixturesList);
  }, [allFixturesList]);

  const leagueTrendPoints: MatchTrendPoint[] = useMemo(() => {
    return buildTrendPoints(leagueFixturesList);
  }, [leagueFixturesList]);

  // Stats for the active view
  const stats = useMemo(() => {
    return computeStatsSummary(trendPoints);
  }, [trendPoints]);

  const allStats = useMemo(() => {
    return computeStatsSummary(allTrendPoints);
  }, [allTrendPoints]);

  const leagueStats = useMemo(() => {
    return computeStatsSummary(leagueTrendPoints);
  }, [leagueTrendPoints]);

  // Comparison merged dataset for side-by-side progression chart
  const comparisonChartData = useMemo(() => {
    const maxLen = Math.max(allTrendPoints.length, leagueTrendPoints.length);
    const data = [];
    for (let i = 0; i < maxLen; i++) {
      const allPoint = allTrendPoints[i];
      const leaguePoint = leagueTrendPoints[i];
      data.push({
        matchNumber: `G${i + 1}`,
        allGf: allPoint ? allPoint.cumulativeGf : null,
        allGa: allPoint ? allPoint.cumulativeGa : null,
        allGd: allPoint ? allPoint.cumulativeGd : null,
        leagueGf: leaguePoint ? leaguePoint.cumulativeGf : null,
        leagueGa: leaguePoint ? leaguePoint.cumulativeGa : null,
        leagueGd: leaguePoint ? leaguePoint.cumulativeGd : null,
        allMatchLabel: allPoint ? `${allPoint.opponent} (${allPoint.competition})` : '',
        leagueMatchLabel: leaguePoint ? `${leaguePoint.opponent}` : ''
      });
    }
    return data;
  }, [allTrendPoints, leagueTrendPoints]);

  // Home vs Away data
  const homeAwayData = useMemo(() => {
    return [
      {
        location: 'In Casa',
        gf: stats.homeGf,
        ga: stats.homeGa,
        gd: stats.homeGf - stats.homeGa,
        partite: stats.homeMatches,
        avgGf: stats.homeMatches > 0 ? Number((stats.homeGf / stats.homeMatches).toFixed(2)) : 0,
        avgGa: stats.homeMatches > 0 ? Number((stats.homeGa / stats.homeMatches).toFixed(2)) : 0
      },
      {
        location: 'In Trasferta',
        gf: stats.awayGf,
        ga: stats.awayGa,
        gd: stats.awayGf - stats.awayGa,
        partite: stats.awayMatches,
        avgGf: stats.awayMatches > 0 ? Number((stats.awayGf / stats.awayMatches).toFixed(2)) : 0,
        avgGa: stats.awayMatches > 0 ? Number((stats.awayGa / stats.awayMatches).toFixed(2)) : 0
      }
    ];
  }, [stats]);

  // Selected match detail
  const activeSelectedMatch = useMemo(() => {
    if (selectedMatchIndex !== null) {
      return trendPoints.find(p => p.index === selectedMatchIndex) || null;
    }
    return trendPoints.length > 0 ? trendPoints[trendPoints.length - 1] : null;
  }, [trendPoints, selectedMatchIndex]);

  // Custom Recharts Tooltip
  const CustomChartTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const dataPoint: MatchTrendPoint | undefined = payload[0]?.payload;
    if (!dataPoint) return null;

    return (
      <div className="bg-slate-950/95 border border-slate-700/80 rounded-xl p-3.5 shadow-2xl backdrop-blur-md text-xs min-w-[220px] space-y-2 z-50">
        <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 gap-2">
          <div className="flex items-center gap-1.5 font-bold text-white">
            <Calendar className="w-3.5 h-3.5 text-emerald-400" />
            <span>Giornata {dataPoint.index}</span>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
              dataPoint.outcome === 'Vittoria'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : dataPoint.outcome === 'Pareggio'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
            }`}
          >
            {dataPoint.outcome} ({dataPoint.score})
          </span>
        </div>

        <div className="text-[11px] text-slate-300">
          <span className="text-slate-500">Avversario: </span>
          <span className="font-semibold text-white">
            vs {dataPoint.opponent} ({dataPoint.venue})
          </span>
        </div>
        <div className="text-[10px] text-slate-400 font-mono">
          {dataPoint.date} • {dataPoint.competition}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80 text-[11px]">
          <div className="bg-emerald-950/40 border border-emerald-500/20 rounded-lg p-1.5 text-center">
            <span className="text-[10px] text-emerald-400/80 block font-medium">Gol Fatti (GF)</span>
            <span className="font-extrabold text-emerald-300 text-sm">{dataPoint.gf}</span>
            <span className="text-[9px] text-slate-400 block">Prog: {dataPoint.cumulativeGf}</span>
          </div>
          <div className="bg-rose-950/40 border border-rose-500/20 rounded-lg p-1.5 text-center">
            <span className="text-[10px] text-rose-400/80 block font-medium">Gol Subiti (GS)</span>
            <span className="font-extrabold text-rose-300 text-sm">{dataPoint.ga}</span>
            <span className="text-[9px] text-slate-400 block">Prog: {dataPoint.cumulativeGa}</span>
          </div>
        </div>

        <div className="flex items-center justify-between text-[10px] bg-slate-900/80 px-2 py-1 rounded-md border border-slate-800 font-mono">
          <span className="text-slate-400">Diff. Reti Cumulativa:</span>
          <span className={`font-bold ${dataPoint.cumulativeGd >= 0 ? 'text-sky-300' : 'text-rose-400'}`}>
            {dataPoint.cumulativeGd > 0 ? `+${dataPoint.cumulativeGd}` : dataPoint.cumulativeGd}
          </span>
        </div>

        {dataPoint.scorers && dataPoint.scorers.length > 0 && (
          <div className="pt-1 border-t border-slate-800/80 text-[10px] text-slate-400">
            <span className="font-semibold text-emerald-400">Marcatori: </span>
            {dataPoint.scorers.join(', ')}
          </div>
        )}
      </div>
    );
  };

  const handleConfirmClearTrend = () => {
    try {
      localStorage.setItem('fm26_trend_cleared', 'true');
    } catch {
      // ignore
    }
    setIsTrendCleared(true);
    setDataSourceOverride('state');
    setSelectedMatchIndex(null);
    if (onClearSeasonalTrend) {
      onClearSeasonalTrend();
    }
    setIsClearTrendModalOpen(false);
  };

  return (
    <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-6 relative overflow-hidden backdrop-blur-sm">
      {/* Top Banner / Header with Recharts title and controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/90 pb-5">
        <div className="flex items-start space-x-3.5">
          <div className="p-2.5 bg-gradient-to-br from-emerald-500/20 via-sky-500/15 to-indigo-500/10 border border-emerald-500/30 rounded-2xl text-emerald-400 shadow-inner">
            <Activity className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-base font-extrabold text-white tracking-tight">
                Dashboard Rendimento & Trend Gol (Recharts)
              </h3>
              <span className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                <Flame className="w-3 h-3 text-emerald-400" />
                <span>Doppia Analisi Disponibile</span>
              </span>
              {isUsingInitialData ? (
                <span className="bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[10px] font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-indigo-400" />
                  <span>Dati Iniziali Serie (initialData.ts)</span>
                </span>
              ) : activeFixtures.length === 0 ? (
                <span className="bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <RotateCcw className="w-3 h-3 text-amber-400" />
                  <span>Trend Azzerato (Nuova Stagione)</span>
                </span>
              ) : (
                <span className="bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[10px] font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-sky-400" />
                  <span>Stato Calendario Live ({statePlayedMatches.length} match)</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 max-w-2xl">
              Monitoraggio analitico della progressione offensiva e difensiva di <strong>{teamName}</strong>. 
              Scegli se analizzare <strong>Tutte le competizioni</strong>, <strong>Solo Campionato ({leagueName})</strong> oppure attivare il <strong>Confronto Diretto</strong>.
            </p>
          </div>
        </div>

        {/* Right side controls: Data Source switch, Clear Trend & Sync */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Button to clear seasonal trend */}
          {activeFixtures.length > 0 && (
            <button
              type="button"
              onClick={() => setIsClearTrendModalOpen(true)}
              className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
              title="Azzera e pulisci il trend cumulativo stagionale per iniziare la nuova stagione"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
              <span>Azzera Trend Stagionale</span>
            </button>
          )}

          {activeFixtures.length === 0 && onResetToDemoData && (
            <button
              type="button"
              onClick={onResetToDemoData}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Ripristina i dati demo di esempio"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Ripristina Demo</span>
            </button>
          )}

          {statePlayedMatches.length > 0 && (
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setDataSourceOverride('state')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  dataSourceOverride === 'state' || (dataSourceOverride === 'auto' && !isUsingInitialData)
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Visualizza i dati inseriti nel calendario attivo"
              >
                Calendario Live ({statePlayedMatches.length})
              </button>
              <button
                type="button"
                onClick={() => setDataSourceOverride('initial')}
                className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                  dataSourceOverride === 'initial'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Visualizza i dati iniziali storici"
              >
                Dati Iniziali ({initialPlayedFixtures.length})
              </button>
            </div>
          )}

          {statePlayedMatches.length === 0 && onImportPlayedFixtures && (
            <button
              type="button"
              onClick={() => onImportPlayedFixtures(initialPlayedFixtures)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
              title="Carica le partite giocate nel calendario attivo"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Importa Partite nel Calendario</span>
            </button>
          )}
        </div>
      </div>

      {/* PRIMARY ANALYSIS TOGGLE: Tutte le Partite vs Solo Campionato vs Confronto Diretto */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold text-slate-400 px-2 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-emerald-400" />
            <span>Ambito Analisi:</span>
          </span>

          {/* Scope 1: Tutte le Partite */}
          <button
            type="button"
            onClick={() => {
              setScopeMode('all');
              setSelectedCompetition('all');
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer shadow-sm ${
              scopeMode === 'all'
                ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white ring-1 ring-emerald-400/50 shadow-emerald-900/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>Tutte le Partite</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              scopeMode === 'all' ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
            }`}>
              {allFixturesList.length}
            </span>
          </button>

          {/* Scope 2: Solo Campionato */}
          <button
            type="button"
            onClick={() => {
              setScopeMode('league');
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer shadow-sm ${
              scopeMode === 'league'
                ? 'bg-gradient-to-r from-sky-600 to-indigo-600 text-white ring-1 ring-sky-400/50 shadow-sky-900/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Solo {leagueName}</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              scopeMode === 'league' ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
            }`}>
              {leagueFixturesList.length}
            </span>
          </button>

          {/* Scope 3: Confronto Diretto / Side-by-Side */}
          <button
            type="button"
            onClick={() => {
              setScopeMode('compare');
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 cursor-pointer shadow-sm ${
              scopeMode === 'compare'
                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white ring-1 ring-purple-400/50 shadow-purple-900/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80'
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Confronto Diretto (Tutte vs Campionato)</span>
          </button>
        </div>

        {/* If in 'all' mode, allow fine-grained competition dropdown */}
        {scopeMode === 'all' && availableCompetitions.length > 1 && (
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
            <select
              value={selectedCompetition}
              onChange={(e) => setSelectedCompetition(e.target.value)}
              className="bg-transparent text-slate-200 font-semibold focus:outline-none text-xs cursor-pointer"
            >
              <option value="all" className="bg-slate-900 text-white">Tutte le Competizioni ({allFixturesList.length})</option>
              {availableCompetitions.map(comp => (
                <option key={comp} value={comp} className="bg-slate-900 text-white">
                  {comp} ({activeFixtures.filter(f => f.competition === comp).length})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Context badge if in 'league' mode */}
        {scopeMode === 'league' && (
          <div className="text-[11px] font-semibold text-sky-400 flex items-center gap-1.5 px-2">
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
            <span>Focus esclusivo sulle {leagueFixturesList.length} gare di Premier League</span>
          </div>
        )}

        {/* Context badge if in 'compare' mode */}
        {scopeMode === 'compare' && (
          <div className="text-[11px] font-semibold text-purple-400 flex items-center gap-1.5 px-2">
            <Columns className="w-3.5 h-3.5" />
            <span>Visione parallela KPI e curve sovrapposte</span>
          </div>
        )}
      </div>

      {/* KPI Section */}
      {scopeMode !== 'compare' ? (
        /* STANDARD KPI STRIP (for 'all' or 'league') */
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {/* Card 1: Gol Fatti */}
          <div className="bg-slate-950/70 border border-emerald-500/25 rounded-2xl p-3.5 space-y-1 relative overflow-hidden group hover:border-emerald-500/40 transition-colors">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-bold">Gol Fatti</span>
              <Target className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-2xl font-black text-white">{stats.totalGf}</span>
              <span className="text-[11px] text-emerald-400 font-bold">({stats.avgGf} / p.)</span>
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              Su {stats.totalMatches} match {stats.topScoringMatch ? `• Max: ${stats.topScoringMatch.gf} vs ${stats.topScoringMatch.opponent}` : ''}
            </div>
            <div className="absolute -right-4 -bottom-4 w-14 h-14 bg-emerald-500/5 rounded-full blur-xl pointer-events-none" />
          </div>

          {/* Card 2: Gol Subiti */}
          <div className="bg-slate-950/70 border border-rose-500/25 rounded-2xl p-3.5 space-y-1 relative overflow-hidden group hover:border-rose-500/40 transition-colors">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] font-mono uppercase tracking-wider text-rose-400 font-bold">Gol Subiti</span>
              <Shield className="w-4 h-4 text-rose-400" />
            </div>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-2xl font-black text-white">{stats.totalGa}</span>
              <span className="text-[11px] text-rose-400 font-bold">({stats.avgGa} / p.)</span>
            </div>
            <div className="text-[10px] text-slate-400">
              Clean sheet: {stats.cleanSheets} ({stats.cleanSheetPct}%)
            </div>
            <div className="absolute -right-4 -bottom-4 w-14 h-14 bg-rose-500/5 rounded-full blur-xl pointer-events-none" />
          </div>

          {/* Card 3: Differenza Reti */}
          <div className="bg-slate-950/70 border border-sky-500/25 rounded-2xl p-3.5 space-y-1 relative overflow-hidden group hover:border-sky-500/40 transition-colors">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] font-mono uppercase tracking-wider text-sky-400 font-bold">Diff. Reti</span>
              <TrendingUp className="w-4 h-4 text-sky-400" />
            </div>
            <div className="flex items-baseline space-x-1.5">
              <span className={`text-2xl font-black ${stats.totalGd >= 0 ? 'text-sky-300' : 'text-rose-400'}`}>
                {stats.totalGd > 0 ? `+${stats.totalGd}` : stats.totalGd}
              </span>
              <span className="text-[11px] text-slate-400 font-medium">totali</span>
            </div>
            <div className="text-[10px] text-slate-400">
              Margine netto medio: {(stats.totalGd / (stats.totalMatches || 1)).toFixed(2)}
            </div>
            <div className="absolute -right-4 -bottom-4 w-14 h-14 bg-sky-500/5 rounded-full blur-xl pointer-events-none" />
          </div>

          {/* Card 4: Bilancio Esiti */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5 space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-300 font-bold">Bilancio V-N-P</span>
              <Trophy className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-baseline space-x-1 font-mono">
              <span className="text-lg font-black text-emerald-400">{stats.wins}V</span>
              <span className="text-slate-600">-</span>
              <span className="text-lg font-black text-amber-400">{stats.draws}N</span>
              <span className="text-slate-600">-</span>
              <span className="text-lg font-black text-rose-400">{stats.losses}P</span>
            </div>
            <div className="text-[10px] text-emerald-400 font-semibold">
              {stats.winRate}% Vittorie
            </div>
          </div>

          {/* Card 5: Rendimento Casa */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5 space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1">
                <Home className="w-3 h-3 text-indigo-400" /> In Casa
              </span>
              <span className="text-[10px] text-slate-500">{stats.homeMatches} match</span>
            </div>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-lg font-bold text-white">{stats.homeGf} GF</span>
              <span className="text-slate-500 text-xs">/</span>
              <span className="text-sm font-bold text-rose-400">{stats.homeGa} GS</span>
            </div>
            <div className="text-[10px] text-indigo-300 font-medium">
              Diff. Reti: {stats.homeGf - stats.homeGa > 0 ? `+${stats.homeGf - stats.homeGa}` : stats.homeGf - stats.homeGa}
            </div>
          </div>

          {/* Card 6: Rendimento Trasferta */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-3.5 space-y-1">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1">
                <Plane className="w-3 h-3 text-sky-400" /> In Trasferta
              </span>
              <span className="text-[10px] text-slate-500">{stats.awayMatches} match</span>
            </div>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-lg font-bold text-white">{stats.awayGf} GF</span>
              <span className="text-slate-500 text-xs">/</span>
              <span className="text-sm font-bold text-rose-400">{stats.awayGa} GS</span>
            </div>
            <div className="text-[10px] text-sky-300 font-medium">
              Diff. Reti: {stats.awayGf - stats.awayGa > 0 ? `+${stats.awayGf - stats.awayGa}` : stats.awayGf - stats.awayGa}
            </div>
          </div>
        </div>
      ) : (
        /* DUAL COMPARISON KPI CARDS (Side-by-Side: Tutte vs Campionato) */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card A: Tutte le Partite */}
          <div className="bg-slate-950/80 border border-emerald-500/30 rounded-2xl p-4 space-y-3 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg">
                  <Trophy className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-white">Tutte le Competizioni</h4>
                  <span className="text-[10px] text-slate-400">{allStats.totalMatches} incontri totali disputati</span>
                </div>
              </div>
              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full text-xs font-bold">
                Totale Stagione
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-mono">Gol Fatti (GF)</span>
                <span className="text-lg font-black text-emerald-400">{allStats.totalGf}</span>
                <span className="text-[10px] text-slate-500 block">{allStats.avgGf} / gara</span>
              </div>
              <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-mono">Gol Subiti (GS)</span>
                <span className="text-lg font-black text-rose-400">{allStats.totalGa}</span>
                <span className="text-[10px] text-slate-500 block">{allStats.avgGa} / gara</span>
              </div>
              <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-mono">Diff. Reti</span>
                <span className="text-lg font-black text-sky-400">
                  {allStats.totalGd > 0 ? `+${allStats.totalGd}` : allStats.totalGd}
                </span>
                <span className="text-[10px] text-emerald-400 block">{allStats.winRate}% vittorie</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-900/40 px-3 py-1.5 rounded-xl border border-slate-800/60">
              <span>Clean Sheet: <strong className="text-white">{allStats.cleanSheets} ({allStats.cleanSheetPct}%)</strong></span>
              <span>Bilancio: <strong className="text-emerald-400">{allStats.wins}V</strong> - <strong className="text-amber-400">{allStats.draws}N</strong> - <strong className="text-rose-400">{allStats.losses}P</strong></span>
            </div>
          </div>

          {/* Card B: Solo Campionato */}
          <div className="bg-slate-950/80 border border-sky-500/30 rounded-2xl p-4 space-y-3 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-sky-500/20 text-sky-400 rounded-lg">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-white">Solo {leagueName}</h4>
                  <span className="text-[10px] text-slate-400">{leagueStats.totalMatches} giornate giocate di campionato</span>
                </div>
              </div>
              <span className="bg-sky-500/10 text-sky-400 border border-sky-500/30 px-2 py-0.5 rounded-full text-xs font-bold">
                Focus Campionato
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-mono">Gol Fatti (GF)</span>
                <span className="text-lg font-black text-emerald-400">{leagueStats.totalGf}</span>
                <span className="text-[10px] text-slate-500 block">{leagueStats.avgGf} / gara</span>
              </div>
              <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-mono">Gol Subiti (GS)</span>
                <span className="text-lg font-black text-rose-400">{leagueStats.totalGa}</span>
                <span className="text-[10px] text-slate-500 block">{leagueStats.avgGa} / gara</span>
              </div>
              <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-mono">Diff. Reti</span>
                <span className="text-lg font-black text-sky-400">
                  {leagueStats.totalGd > 0 ? `+${leagueStats.totalGd}` : leagueStats.totalGd}
                </span>
                <span className="text-[10px] text-emerald-400 block">{leagueStats.winRate}% vittorie</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-900/40 px-3 py-1.5 rounded-xl border border-slate-800/60">
              <span>Clean Sheet: <strong className="text-white">{leagueStats.cleanSheets} ({leagueStats.cleanSheetPct}%)</strong></span>
              <span>Bilancio: <strong className="text-emerald-400">{leagueStats.wins}V</strong> - <strong className="text-amber-400">{leagueStats.draws}N</strong> - <strong className="text-rose-400">{leagueStats.losses}P</strong></span>
            </div>
          </div>
        </div>
      )}

      {/* Main Chart Section with Tabs */}
      <div className="space-y-4">
        {/* Navigation tabs for the chart */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800 overflow-x-auto">
            <button
              type="button"
              onClick={() => setViewMode('cumulative')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                viewMode === 'cumulative'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Trend Cumulativo (Stagionale)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('perMatch')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                viewMode === 'perMatch'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Partita per Partita</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('difference')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                viewMode === 'difference'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>Margine & Diff. Reti</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('homeAway')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                viewMode === 'homeAway'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              <span>Casa vs Trasferta</span>
            </button>
          </div>

          <div className="text-[11px] text-slate-400 flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Gol Fatti (GF)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> Gol Subiti (GS)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" /> Diff. Reti (DR)
            </span>
          </div>
        </div>

        {/* Empty state if no data points */}
        {trendPoints.length === 0 ? (
          <div className="bg-slate-950/60 rounded-2xl border border-slate-800 p-8 text-center space-y-3.5">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 mx-auto shadow-inner">
              <TrendingUp className="w-6 h-6 text-slate-400" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">Trend Cumulativo Azzerato (Pronto per la Nuova Stagione)</h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                Nessuna partita disputata registrata per la stagione corrente. Il grafico e le statistiche dei gol si popoleranno automaticamente non appena registrerai le partite disputate nel Calendario.
              </p>
            </div>
            {onResetToDemoData && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onResetToDemoData}
                  className="bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-semibold px-3.5 py-1.5 rounded-xl inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Ripristina le partite di esempio per visualizzare i grafici demo"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Ripristina Dati Esempio Demo</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-slate-950/80 rounded-2xl border border-slate-800/80 p-4 shadow-inner">
            {/* SPECIAL COMPARE MODE: When scopeMode is 'compare' and viewMode is 'cumulative' */}
            {scopeMode === 'compare' && viewMode === 'cumulative' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-400 px-2">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <ArrowRightLeft className="w-3.5 h-3.5 text-purple-400" />
                    Confronto Curve: Tutte le Partite vs Solo {leagueName}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    <span className="text-emerald-400 font-bold">Linee continue = Tutte le competizioni</span> • <span className="text-sky-400 font-bold">Linee tratteggiate = Solo Campionato</span>
                  </span>
                </div>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={comparisonChartData}
                      margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
                    >
                      <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="matchNumber"
                        stroke="#64748b"
                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                        axisLine={{ stroke: '#334155' }}
                      />
                      <YAxis
                        stroke="#64748b"
                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                        axisLine={{ stroke: '#334155' }}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#090d16',
                          borderColor: '#334155',
                          borderRadius: '0.75rem',
                          color: '#fff',
                          fontSize: '11px'
                        }}
                      />
                      <Legend
                        verticalAlign="top"
                        height={36}
                        formatter={(value) => (
                          <span className="text-xs font-semibold text-slate-300">{value}</span>
                        )}
                      />
                      {/* Tutte le partite */}
                      <Line
                        type="monotone"
                        dataKey="allGf"
                        name="GF Totali (Tutte)"
                        stroke="#10b981"
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#10b981' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="allGa"
                        name="GS Totali (Tutte)"
                        stroke="#f43f5e"
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#f43f5e' }}
                      />
                      {/* Solo Campionato */}
                      <Line
                        type="monotone"
                        dataKey="leagueGf"
                        name={`GF Solo ${leagueName}`}
                        stroke="#38bdf8"
                        strokeWidth={2.5}
                        strokeDasharray="4 4"
                        dot={{ r: 3, fill: '#38bdf8' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="leagueGa"
                        name={`GS Solo ${leagueName}`}
                        stroke="#fb7185"
                        strokeWidth={2.5}
                        strokeDasharray="4 4"
                        dot={{ r: 3, fill: '#fb7185' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <>
                {/* VIEW 1: Trend Cumulativo (AreaChart) */}
                {viewMode === 'cumulative' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400 px-2">
                      <span className="font-semibold text-white flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                        Progressione Cumulativa Gol ({scopeMode === 'league' ? `Solo ${leagueName}` : selectedCompetition === 'all' ? 'Tutte le Partite' : selectedCompetition})
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Da Giornata 1 a Giornata {trendPoints.length}
                      </span>
                    </div>
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={trendPoints}
                          margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="gfGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                            </linearGradient>
                            <linearGradient id="gaGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.35} />
                              <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="shortLabel"
                            stroke="#64748b"
                            tick={{ fill: '#94a3b8', fontSize: 11 }}
                            axisLine={{ stroke: '#334155' }}
                          />
                          <YAxis
                            stroke="#64748b"
                            tick={{ fill: '#94a3b8', fontSize: 11 }}
                            axisLine={{ stroke: '#334155' }}
                            allowDecimals={false}
                          />
                          <Tooltip content={<CustomChartTooltip />} />
                          <Legend
                            verticalAlign="top"
                            height={36}
                            formatter={(value) => (
                              <span className="text-xs font-semibold text-slate-300">{value}</span>
                            )}
                          />
                          <Area
                            type="monotone"
                            dataKey="cumulativeGf"
                            name="Gol Fatti Cumulativi"
                            stroke="#10b981"
                            strokeWidth={3}
                            fill="url(#gfGradient)"
                            activeDot={{ r: 6, fill: '#10b981', stroke: '#fff', strokeWidth: 2 }}
                          />
                          <Area
                            type="monotone"
                            dataKey="cumulativeGa"
                            name="Gol Subiti Cumulativi"
                            stroke="#f43f5e"
                            strokeWidth={3}
                            fill="url(#gaGradient)"
                            activeDot={{ r: 6, fill: '#f43f5e', stroke: '#fff', strokeWidth: 2 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="cumulativeGd"
                            name="Diff. Reti Cumulativa"
                            stroke="#38bdf8"
                            strokeWidth={2.5}
                            strokeDasharray="4 4"
                            dot={{ r: 3, fill: '#38bdf8' }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* VIEW 2: Partita per Partita (ComposedChart / BarChart) */}
                {viewMode === 'perMatch' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400 px-2">
                      <span className="font-semibold text-white flex items-center gap-1.5">
                        <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
                        Gol Fatti e Subiti per Singolo Incontro ({scopeMode === 'league' ? `Solo ${leagueName}` : 'Tutte le Partite'})
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Barre = gol per match • Linea = scostamento netto
                      </span>
                    </div>
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          data={trendPoints}
                          margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
                        >
                          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="shortLabel"
                            stroke="#64748b"
                            tick={{ fill: '#94a3b8', fontSize: 11 }}
                            axisLine={{ stroke: '#334155' }}
                          />
                          <YAxis
                            stroke="#64748b"
                            tick={{ fill: '#94a3b8', fontSize: 11 }}
                            axisLine={{ stroke: '#334155' }}
                            allowDecimals={false}
                          />
                          <Tooltip content={<CustomChartTooltip />} />
                          <Legend
                            verticalAlign="top"
                            height={36}
                            formatter={(value) => (
                              <span className="text-xs font-semibold text-slate-300">{value}</span>
                            )}
                          />
                          <ReferenceLine y={0} stroke="#475569" strokeDasharray="2 2" />
                          <Bar
                            dataKey="gf"
                            name="Gol Fatti (GF)"
                            fill="#10b981"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={28}
                          />
                          <Bar
                            dataKey="ga"
                            name="Gol Subiti (GS)"
                            fill="#f43f5e"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={28}
                          />
                          <Line
                            type="monotone"
                            dataKey="gd"
                            name="Diff. Reti Match"
                            stroke="#38bdf8"
                            strokeWidth={2.5}
                            dot={{ r: 4, fill: '#38bdf8', stroke: '#0f172a', strokeWidth: 1.5 }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* VIEW 3: Margine e Differenza Reti per Partita (BarChart con colorazione dinamica) */}
                {viewMode === 'difference' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-400 px-2">
                      <span className="font-semibold text-white flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-sky-400" />
                        Margine Differenza Reti (GF - GS) per Partita ({scopeMode === 'league' ? `Solo ${leagueName}` : 'Tutte le Partite'})
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Verde = Vittoria • Giallo = Pareggio • Rosso = Sconfitta
                      </span>
                    </div>
                    <div className="h-72 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={trendPoints}
                          margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
                        >
                          <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="shortLabel"
                            stroke="#64748b"
                            tick={{ fill: '#94a3b8', fontSize: 11 }}
                            axisLine={{ stroke: '#334155' }}
                          />
                          <YAxis
                            stroke="#64748b"
                            tick={{ fill: '#94a3b8', fontSize: 11 }}
                            axisLine={{ stroke: '#334155' }}
                            allowDecimals={false}
                          />
                          <Tooltip content={<CustomChartTooltip />} />
                          <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1.5} />
                          <Bar dataKey="gd" name="Differenza Reti" maxBarSize={32} radius={[3, 3, 3, 3]}>
                            {trendPoints.map((entry, index) => {
                              const fillColor =
                                entry.gd > 0 ? '#10b981' : entry.gd === 0 ? '#f59e0b' : '#ef4444';
                              return <Cell key={`cell-${index}`} fill={fillColor} />;
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* VIEW 4: Casa vs Trasferta */}
                {viewMode === 'homeAway' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-slate-400 px-2">
                      <span className="font-semibold text-white flex items-center gap-1.5">
                        <Home className="w-3.5 h-3.5 text-indigo-400" />
                        Confronto Rendimento Casa vs Trasferta ({scopeMode === 'league' ? `Solo ${leagueName}` : 'Tutte le Partite'})
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Statistiche aggregate per sede
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={homeAwayData}
                            margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
                          >
                            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                            <XAxis
                              dataKey="location"
                              stroke="#64748b"
                              tick={{ fill: '#94a3b8', fontSize: 11 }}
                              axisLine={{ stroke: '#334155' }}
                            />
                            <YAxis
                              stroke="#64748b"
                              tick={{ fill: '#94a3b8', fontSize: 11 }}
                              axisLine={{ stroke: '#334155' }}
                              allowDecimals={false}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#090d16',
                                borderColor: '#334155',
                                borderRadius: '0.75rem',
                                color: '#fff',
                                fontSize: '11px'
                              }}
                            />
                            <Legend
                              verticalAlign="top"
                              height={36}
                              formatter={(value) => (
                                <span className="text-xs font-semibold text-slate-300">{value}</span>
                              )}
                            />
                            <Bar dataKey="gf" name="Gol Fatti Totali" fill="#10b981" maxBarSize={40} radius={[4, 4, 0, 0]} />
                            <Bar dataKey="ga" name="Gol Subiti Totali" fill="#f43f5e" maxBarSize={40} radius={[4, 4, 0, 0]} />
                            <Bar dataKey="gd" name="Diff. Reti" fill="#38bdf8" maxBarSize={40} radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={homeAwayData}
                            margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
                          >
                            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" vertical={false} />
                            <XAxis
                              dataKey="location"
                              stroke="#64748b"
                              tick={{ fill: '#94a3b8', fontSize: 11 }}
                              axisLine={{ stroke: '#334155' }}
                            />
                            <YAxis
                              stroke="#64748b"
                              tick={{ fill: '#94a3b8', fontSize: 11 }}
                              axisLine={{ stroke: '#334155' }}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#090d16',
                                borderColor: '#334155',
                                borderRadius: '0.75rem',
                                color: '#fff',
                                fontSize: '11px'
                              }}
                            />
                            <Legend
                              verticalAlign="top"
                              height={36}
                              formatter={(value) => (
                                <span className="text-xs font-semibold text-slate-300">{value}</span>
                              )}
                            />
                            <Bar dataKey="avgGf" name="Media Gol Fatti / Partita" fill="#34d399" maxBarSize={40} radius={[4, 4, 0, 0]} />
                            <Bar dataKey="avgGa" name="Media Gol Subiti / Partita" fill="#fb7185" maxBarSize={40} radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Match-by-match horizontal timeline pills & quick selection */}
      <div className="space-y-3 pt-2 border-t border-slate-800/80">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              Timeline Incontri Disputati ({trendPoints.length} match {scopeMode === 'league' ? `in ${leagueName}` : scopeMode === 'compare' ? 'Totali' : ''})
            </span>
          </span>
          <span className="text-[11px] text-slate-500">
            Clicca su una partita per visualizzare i dettagli completi
          </span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
          {trendPoints.map((p) => {
            const isSelected = activeSelectedMatch?.index === p.index;
            return (
              <button
                key={p.index}
                type="button"
                onClick={() => setSelectedMatchIndex(p.index)}
                className={`p-2 rounded-xl border text-left shrink-0 transition-all cursor-pointer min-w-[130px] space-y-1 ${
                  isSelected
                    ? 'bg-slate-800 border-emerald-500 shadow-md ring-1 ring-emerald-500/50'
                    : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-mono text-slate-400 font-bold">G{p.index}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${
                      p.outcome === 'Vittoria'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : p.outcome === 'Pareggio'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {p.outcome[0]} {p.score}
                  </span>
                </div>
                <div className="text-xs font-bold text-white truncate">
                  vs {p.opponent}
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span className="truncate max-w-[55px]">{p.venue === 'Casa' ? 'Casa' : 'Trasf.'}</span>
                  <span className="text-emerald-400 font-mono font-semibold">GF {p.gf} - {p.ga} GS</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Selected match details box */}
        {activeSelectedMatch && (
          <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono font-bold text-emerald-400">
                  Giornata {activeSelectedMatch.index}
                </span>
                <span className="text-xs text-slate-500">•</span>
                <span className="text-xs text-slate-300 font-medium">
                  {activeSelectedMatch.date}
                </span>
                <span className="text-xs text-slate-500">•</span>
                <span className="text-xs text-slate-400">
                  {activeSelectedMatch.competition}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    activeSelectedMatch.outcome === 'Vittoria'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : activeSelectedMatch.outcome === 'Pareggio'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  }`}
                >
                  {activeSelectedMatch.outcome} ({activeSelectedMatch.score})
                </span>
              </div>
              <h4 className="text-sm font-extrabold text-white">
                {teamName} vs {activeSelectedMatch.opponent} ({activeSelectedMatch.venue})
              </h4>
              {activeSelectedMatch.scorers && activeSelectedMatch.scorers.length > 0 && (
                <p className="text-xs text-emerald-300 font-medium">
                  ⚽ Marcatori: {activeSelectedMatch.scorers.join(', ')}
                </p>
              )}
              {activeSelectedMatch.tacticalNotes && (
                <p className="text-[11px] text-slate-400 italic pt-0.5 max-w-2xl">
                  "{activeSelectedMatch.tacticalNotes}"
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-center">
                <span className="text-[10px] text-slate-500 block font-mono uppercase">Gol Fatti</span>
                <span className="text-base font-extrabold text-emerald-400">{activeSelectedMatch.gf}</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-center">
                <span className="text-[10px] text-slate-500 block font-mono uppercase">Gol Subiti</span>
                <span className="text-base font-extrabold text-rose-400">{activeSelectedMatch.ga}</span>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-center">
                <span className="text-[10px] text-slate-500 block font-mono uppercase">Prog. Reti</span>
                <span className="text-base font-extrabold text-sky-400">
                  {activeSelectedMatch.cumulativeGd > 0 ? `+${activeSelectedMatch.cumulativeGd}` : activeSelectedMatch.cumulativeGd}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Clear Seasonal Trend Confirmation Dialog */}
      <ConfirmDialogModal
        isOpen={isClearTrendModalOpen}
        title="Azzerare il Trend Cumulativo Stagionale?"
        message="Sei sicuro di voler azzerare il trend cumulativo stagionale? Verranno rimossi i risultati e le partite disputate della stagione precedente dal conteggio. Tutte le metriche dei gol, clean sheet e progressioni ripartiranno da zero per la nuova stagione."
        confirmLabel="Sì, Azzera Trend"
        cancelLabel="Annulla"
        isDangerous={true}
        onConfirm={handleConfirmClearTrend}
        onCancel={() => setIsClearTrendModalOpen(false)}
      />
    </div>
  );
};
