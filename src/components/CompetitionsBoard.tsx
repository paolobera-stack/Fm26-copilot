import React, { useState } from 'react';
import { StandingsRow, Fixture, CompetitionInfo } from '../types';
import {
  Trophy,
  Upload,
  Sparkles,
  Calendar,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  FileImage,
  RefreshCw,
  Info,
  Shield,
  Search,
  Flag,
  TrendingUp,
  AlertCircle,
  RotateCcw,
  Layers
} from 'lucide-react';
import { ConfirmDialogModal } from './ConfirmDialogModal';
import { initialStandings, initialPlayedFixtures } from '../data/initialData';
import { getApiHeaders, hasCustomApiKey } from '../utils/apiKeyStorage';
import { safeFetchJson } from '../utils/apiUtils';
import { ScreenshotOcrProgressBar } from './ScreenshotOcrProgressBar';
import { getDaysDifference, formatRelativeDays } from '../utils/dateUtils';
import { GoalsTrendDashboard } from './GoalsTrendDashboard';
import { useBackgroundOcr } from '../context/BackgroundOcrContext';

interface CompetitionsBoardProps {
  fixtures: Fixture[];
  standings: StandingsRow[];
  onUpdateStandings: (standings: StandingsRow[]) => void;
  teamName?: string;
  currentDate?: string;
  onUpdateFixtures?: (fixtures: Fixture[]) => void;
}

export const CompetitionsBoard: React.FC<CompetitionsBoardProps> = ({
  fixtures,
  standings,
  onUpdateStandings,
  teamName = 'La Tua Squadra FC',
  currentDate = '28 Ottobre 2026',
  onUpdateFixtures
}) => {
  // Extract unique competition names from fixtures
  const calendarCompetitions: string[] = Array.from(new Set(fixtures.map(f => f.competition).filter((c): c is string => Boolean(c))));


  // Custom objectives state stored locally
  const [competitionGoals, setCompetitionGoals] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('fm26_competition_goals');
      return saved ? JSON.parse(saved) : {
        'Premier League': 'Piazzamento Top 4 (Qualificazione Champions)',
        'Champions League': 'Raggiungere la Fase a Eliminazione Diretta',
        'Carabao Cup': 'Semifinale o Finale',
        'FA Cup': 'Turno 5 / Quarti di Finale'
      };
    } catch {
      return {};
    }
  });

  const handleUpdateGoal = (compName: string, newGoal: string) => {
    const updated = { ...competitionGoals, [compName]: newGoal };
    setCompetitionGoals(updated);
    localStorage.setItem('fm26_competition_goals', JSON.stringify(updated));
  };

  // OCR Modal State
  const [isOcrModalOpen, setIsOcrModalOpen] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedPreview, setParsedPreview] = useState<StandingsRow[] | null>(null);

  // Edit / Add Row Modal State
  const [editingRow, setEditingRow] = useState<StandingsRow | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isClearStandingsModalOpen, setIsClearStandingsModalOpen] = useState(false);
  const [isClearTrendModalOpen, setIsClearTrendModalOpen] = useState(false);
  const [clearTrendWithStandings, setClearTrendWithStandings] = useState(true);
  const [rowPos, setRowPos] = useState<number>(1);
  const [rowTeam, setRowTeam] = useState('');
  const [rowPlayed, setRowPlayed] = useState<number>(0);
  const [rowWon, setRowWon] = useState<number>(0);
  const [rowDrawn, setRowDrawn] = useState<number>(0);
  const [rowLost, setRowLost] = useState<number>(0);
  const [rowGf, setRowGf] = useState<number>(0);
  const [rowGa, setRowGa] = useState<number>(0);
  const [rowPoints, setRowPoints] = useState<number>(0);
  const [rowForm, setRowForm] = useState('');

  const { startStandingsTask, completedTasks, applyStandings } = useBackgroundOcr();

  const latestCompletedStandingsTask = completedTasks.find(
    t => t.type === 'standings' && t.standingsRows && t.standingsRows.length > 0
  );

  const handleStartBackgroundOcr = () => {
    if (!imagePreview) return;
    if (!hasCustomApiKey()) {
      setParseError("Chiave API personale richiesta: per analizzare lo screenshot della classifica con l'IA, inserisci prima la tua Google Gemini API Key gratuita (BYOK) nella barra in alto.");
      return;
    }
    startStandingsTask(imagePreview, imageFile?.name || 'Screenshot Classifica');
    setIsOcrModalOpen(false);
  };

  const handleSendToBackground = () => {
    if (imagePreview) {
      startStandingsTask(imagePreview, imageFile?.name || 'Screenshot Classifica');
    }
    setParsing(false);
    setIsOcrModalOpen(false);
  };

  const handleSafeCloseOcr = () => {
    if (parsing && imagePreview) {
      startStandingsTask(imagePreview, imageFile?.name || 'Screenshot Classifica');
    }
    setIsOcrModalOpen(false);
  };

  // Handle image selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Run OCR
  const handleAnalyzeScreenshot = async () => {
    if (!imagePreview) return;

    if (!hasCustomApiKey()) {
      setParseError("Chiave API personale richiesta: per analizzare lo screenshot della classifica con l'IA, inserisci prima la tua Google Gemini API Key gratuita (BYOK) nella barra in alto.");
      return;
    }

    setParsing(true);
    setParseError(null);
    setParsedPreview(null);

    try {
      const data = await safeFetchJson<{ standings?: StandingsRow[]; error?: string }>('/api/gemini/parse-standings-screenshot', {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          imageBase64: imagePreview,
          mimeType: imageFile?.type || 'image/png',
          userTeamName: teamName
        })
      });

      if (data.standings && Array.isArray(data.standings) && data.standings.length > 0) {
        setParsedPreview(data.standings);
      } else {
        throw new Error('Nessuna riga di classifica valida riconosciuta nell\'immagine.');
      }
    } catch (err: any) {
      setParseError(err.message || 'Impossibile analizzare lo screenshot della classifica.');
    } finally {
      setParsing(false);
    }
  };

  const handleApplyParsedStandings = () => {
    if (parsedPreview) {
      onUpdateStandings(parsedPreview);
      setIsOcrModalOpen(false);
      setImageFile(null);
      setImagePreview(null);
      setParsedPreview(null);
    }
  };

  // Open Edit / Create Row
  const handleOpenCreateRow = () => {
    setEditingRow(null);
    setRowPos(standings.length + 1);
    setRowTeam('');
    setRowPlayed(0);
    setRowWon(0);
    setRowDrawn(0);
    setRowLost(0);
    setRowGf(0);
    setRowGa(0);
    setRowPoints(0);
    setRowForm('V V N');
    setIsEditModalOpen(true);
  };

  const handleOpenEditRow = (row: StandingsRow) => {
    setEditingRow(row);
    setRowPos(row.position);
    setRowTeam(row.team);
    setRowPlayed(row.played);
    setRowWon(row.won);
    setRowDrawn(row.drawn);
    setRowLost(row.lost);
    setRowGf(row.gf);
    setRowGa(row.ga);
    setRowPoints(row.points);
    setRowForm(row.form || '');
    setIsEditModalOpen(true);
  };

  const handleSaveRow = () => {
    if (!rowTeam.trim()) return;

    const gd = rowGf - rowGa;
    const newRow: StandingsRow = {
      position: rowPos,
      team: rowTeam.trim(),
      played: rowPlayed,
      won: rowWon,
      drawn: rowDrawn,
      lost: rowLost,
      gf: rowGf,
      ga: rowGa,
      gd,
      points: rowPoints,
      form: rowForm.trim()
    };

    let updated: StandingsRow[];
    if (editingRow) {
      updated = standings.map(r => (r.position === editingRow.position && r.team === editingRow.team ? newRow : r));
    } else {
      updated = [...standings, newRow];
    }

    // Sort by position
    updated.sort((a, b) => a.position - b.position);
    onUpdateStandings(updated);
    setIsEditModalOpen(false);
  };

  const handleDeleteRow = (pos: number, team: string) => {
    if (confirm(`Eliminare la riga di ${team} dalla classifica?`)) {
      const updated = standings.filter(r => !(r.position === pos && r.team === team));
      onUpdateStandings(updated);
    }
  };

  // Find user team row in standings
  const userTeamRow = standings.find(
    r => r.team.toLowerCase().includes(teamName.toLowerCase()) || teamName.toLowerCase().includes(r.team.toLowerCase())
  );

  const handleImportPlayedFixtures = (fixturesToImport: Fixture[]) => {
    if (onUpdateFixtures) {
      const existingIds = new Set(fixtures.map(f => f.id));
      const merged = [...fixtures];
      fixturesToImport.forEach(f => {
        if (!existingIds.has(f.id)) {
          merged.push(f);
        }
      });
      onUpdateFixtures(merged);
    }
  };

  const handleClearSeasonalTrend = () => {
    try {
      localStorage.setItem('fm26_trend_cleared', 'true');
    } catch {
      // ignore
    }
    if (onUpdateFixtures) {
      // Filter out any played fixtures so the season trend starts clean from 0
      const unplayedFixtures = fixtures.filter(f => f.status !== 'Giocata' && !Boolean(f.score));
      onUpdateFixtures(unplayedFixtures);
    }
  };

  const handleResetTrendToDemo = () => {
    try {
      localStorage.removeItem('fm26_trend_cleared');
    } catch {
      // ignore
    }
    if (onUpdateFixtures) {
      const existingIds = new Set(fixtures.map(f => f.id));
      const merged = [...fixtures];
      initialPlayedFixtures.forEach(f => {
        if (!existingIds.has(f.id)) {
          merged.push(f);
        }
      });
      onUpdateFixtures(merged);
    }
  };

  return (
    <div className="space-y-6">
      {/* Active Competitions Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Flag className="w-4 h-4 text-emerald-400" />
            <span>Competizioni Attive in Calendario ({calendarCompetitions.length})</span>
          </h3>
          <span className="text-[11px] text-slate-500 font-medium">Estratte in tempo reale dalle partite caricate</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {calendarCompetitions.map((compName) => {
            const compFixtures = fixtures.filter(f => f.competition === compName);
            const playedCount = compFixtures.filter(f => f.status === 'Giocata').length;
            const upcomingCount = compFixtures.filter(f => f.status === 'In Arrivo').length;
            const nextFixture = compFixtures.find(f => f.status === 'In Arrivo');
            const currentGoal = competitionGoals[compName] || 'Obiettivo non impostato';

            return (
              <div
                key={compName}
                className="bg-slate-900/90 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4 shadow-lg space-y-3 relative overflow-hidden group transition-all"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 block">Torneo</span>
                    <h4 className="text-sm font-extrabold text-white group-hover:text-emerald-400 transition-colors">
                      {compName}
                    </h4>
                  </div>
                  <div className="p-2 bg-slate-950 border border-slate-800 rounded-xl text-indigo-400">
                    <Trophy className="w-4 h-4" />
                  </div>
                </div>

                {/* Competition Stats */}
                <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                  <div>
                    <span className="text-slate-500 block">Partite Totali:</span>
                    <span className="font-bold text-white">{compFixtures.length}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Giocate / In Arrivo:</span>
                    <span className="font-bold text-emerald-400">{playedCount}</span>
                    <span className="text-slate-400 font-medium"> / {upcomingCount}</span>
                  </div>
                </div>

                {/* Next Fixture */}
                {nextFixture ? (() => {
                  const diffDays = getDaysDifference(currentDate, nextFixture.date);
                  const relText = formatRelativeDays(diffDays);
                  return (
                    <div className="text-[11px] bg-slate-950/40 p-2 rounded-lg border border-slate-800/50 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500 font-medium text-[10px] block">Prossimo Match:</span>
                        {relText && (
                          <span className={`text-[9px] font-semibold px-1 rounded ${
                            diffDays === 0
                              ? 'bg-amber-500/20 text-amber-300 font-bold'
                              : 'bg-indigo-500/20 text-indigo-300'
                          }`}>
                            {relText}
                          </span>
                        )}
                      </div>
                      <div className="font-bold text-slate-200 truncate">
                        vs {nextFixture.opponent} ({nextFixture.venue})
                      </div>
                      <div className="text-slate-400 text-[10px]">{nextFixture.date}</div>
                    </div>
                  );
                })() : (
                  <div className="text-[10px] text-slate-500 italic">Nessun match programmato</div>
                )}

                {/* Target Objective Input */}
                <div className="pt-2 border-t border-slate-800/80">
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">Obiettivo di Stagione:</label>
                  <input
                    type="text"
                    value={competitionGoals[compName] || ''}
                    onChange={(e) => handleUpdateGoal(compName, e.target.value)}
                    placeholder="Es. Top 4 / Vittoria finale..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-[11px] text-emerald-300 placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-medium"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recharts Dashboard Trend Gol Fatti e Subiti */}
      <GoalsTrendDashboard
        fixtures={fixtures}
        standings={standings}
        teamName={teamName}
        onImportPlayedFixtures={onUpdateFixtures ? handleImportPlayedFixtures : undefined}
        onClearSeasonalTrend={handleClearSeasonalTrend}
        onResetToDemoData={onUpdateFixtures ? handleResetTrendToDemo : undefined}
      />

      {/* Main Section - League Table Standings */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        {/* Background Scan Completed Banner if available */}
        {latestCompletedStandingsTask && latestCompletedStandingsTask.standingsRows && (
          <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-emerald-200 shadow-lg animate-fade-in">
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <span className="font-bold text-white block text-sm">
                  Nuova scansione classifica disponibile in background!
                </span>
                <span className="text-slate-300 text-xs">
                  Gemini Vision ha estratto {latestCompletedStandingsTask.standingsRows.length} squadre da {latestCompletedStandingsTask.fileName}.
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                onClick={() => applyStandings(latestCompletedStandingsTask.id)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-sm transition-colors"
              >
                <Check className="w-4 h-4" /> Applica Subito
              </button>
              <button
                onClick={() => {
                  if (latestCompletedStandingsTask.standingsRows) {
                    setParsedPreview(latestCompletedStandingsTask.standingsRows);
                    setIsOcrModalOpen(true);
                  }
                }}
                className="bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white font-semibold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer border border-slate-700 transition-colors"
              >
                Rivedi
              </button>
            </div>
          </div>
        )}

        {/* Table Header Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2 flex-wrap">
                <span>Classifica Premier League / Campionato</span>
                {currentDate && (
                  <span className="bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-emerald-400" />
                    <span>al {currentDate}</span>
                  </span>
                )}
                {userTeamRow && (
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Shield className="w-3 h-3" /> #{userTeamRow.position} {teamName} ({userTeamRow.points} Pt)
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                Sincronizza e visualizza la classifica in tempo reale.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleOpenCreateRow}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Aggiungi Riga
            </button>
            <button
              onClick={() => setIsOcrModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-md"
            >
              <Sparkles className="w-3.5 h-3.5" /> Upload Screenshot (OCR)
            </button>
            <button
              type="button"
              onClick={() => setIsClearTrendModalOpen(true)}
              className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Azzera e pulisci il trend cumulativo dei gol per iniziare la nuova stagione"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-400" />
              <span>Azzera Trend Stagionale</span>
            </button>
            <button
              type="button"
              onClick={() => setIsClearStandingsModalOpen(true)}
              disabled={standings.length === 0}
              className="bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-40 disabled:pointer-events-none text-rose-300 border border-rose-500/30 text-xs font-semibold px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Cancella e azzera la classifica (utile a fine stagione)"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Cancella Classifica</span>
            </button>
          </div>
        </div>

        {/* Legend / Info Bar */}
        <div className="flex items-center justify-between text-[11px] text-slate-400 bg-slate-950/60 px-3 py-2 rounded-xl border border-slate-800/60 flex-wrap gap-2">
          <div className="flex items-center space-x-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" /> Champions League (1-4)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Europa League (5)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> Retrocessione (18-20)
            </span>
          </div>
          <span className="text-slate-500 font-mono">
            {standings.length} Squadre Registrate
          </span>
        </div>

        {/* Standings Table or Empty State */}
        {standings.length === 0 ? (
          <div className="bg-slate-950/60 rounded-2xl border border-slate-800 p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-400 mx-auto shadow-inner">
              <TrendingUp className="w-6 h-6 text-slate-400" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white">Classifica Azzerata (Pronta per la Nuova Stagione)</h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                Nessuna squadra presente in classifica. Carica lo screenshot della nuova stagione tramite OCR o inserisci le squadre manualmente.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
              <button
                type="button"
                onClick={() => setIsOcrModalOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-md"
              >
                <Sparkles className="w-3.5 h-3.5" /> Upload Screenshot (OCR)
              </button>
              <button
                type="button"
                onClick={handleOpenCreateRow}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold px-4 py-2 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Aggiungi Riga
              </button>
              <button
                type="button"
                onClick={() => onUpdateStandings(initialStandings)}
                className="bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 text-xs font-medium px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Ripristina la classifica iniziale di esempio"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Ripristina Dati Esempio
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 font-mono uppercase tracking-wider text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-3.5 text-center w-12">#</th>
                  <th className="py-3 px-4">Squadra</th>
                  <th className="py-3 px-2.5 text-center">PG</th>
                  <th className="py-3 px-2.5 text-center">V</th>
                  <th className="py-3 px-2.5 text-center">N</th>
                  <th className="py-3 px-2.5 text-center">P</th>
                  <th className="py-3 px-2.5 text-center">GF</th>
                  <th className="py-3 px-2.5 text-center">GS</th>
                  <th className="py-3 px-2.5 text-center">DR</th>
                  <th className="py-3 px-3 text-center font-bold text-white">Pt</th>
                  <th className="py-3 px-3 text-center hidden sm:table-cell">Forma</th>
                  <th className="py-3 px-3 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {standings.map((row) => {
                  const isUserTeam = row.team.toLowerCase().includes(teamName.toLowerCase()) || teamName.toLowerCase().includes(row.team.toLowerCase());
                  const isChampionsZone = row.position >= 1 && row.position <= 4;
                  const isEuropaZone = row.position === 5;
                  const isRelegationZone = row.position >= 18;

                  return (
                    <tr
                      key={`${row.position}_${row.team}`}
                      className={`transition-colors ${
                        isUserTeam
                          ? 'bg-emerald-950/40 font-bold text-white border-l-4 border-l-emerald-500'
                          : isChampionsZone
                          ? 'hover:bg-slate-800/60 border-l-2 border-l-indigo-500/80 text-slate-200'
                          : isEuropaZone
                          ? 'hover:bg-slate-800/60 border-l-2 border-l-amber-500/80 text-slate-200'
                          : isRelegationZone
                          ? 'hover:bg-slate-800/60 border-l-2 border-l-rose-500/80 text-slate-300'
                          : 'hover:bg-slate-800/40 text-slate-300'
                      }`}
                    >
                      {/* Position */}
                      <td className="py-2.5 px-3.5 text-center font-mono font-bold text-slate-300">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-[11px] ${
                          isUserTeam ? 'bg-emerald-600 text-white font-extrabold shadow' :
                          isChampionsZone ? 'bg-indigo-950 text-indigo-300 border border-indigo-800/80' :
                          isEuropaZone ? 'bg-amber-950 text-amber-300 border border-amber-800/80' :
                          isRelegationZone ? 'bg-rose-950 text-rose-300 border border-rose-800/80' :
                          'bg-slate-950 text-slate-400'
                        }`}>
                          {row.position}
                        </span>
                      </td>

                      {/* Team Name */}
                      <td className="py-2.5 px-4 font-semibold flex items-center gap-2">
                        <span className={isUserTeam ? 'text-emerald-300 font-extrabold text-sm' : 'text-slate-100'}>
                          {row.team}
                        </span>
                        {isUserTeam && (
                          <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-black px-1.5 py-0.5 rounded uppercase">
                            Tua Squadra
                          </span>
                        )}
                      </td>

                      {/* Stats */}
                      <td className="py-2.5 px-2.5 text-center font-mono text-slate-300">{row.played}</td>
                      <td className="py-2.5 px-2.5 text-center font-mono text-emerald-400 font-semibold">{row.won}</td>
                      <td className="py-2.5 px-2.5 text-center font-mono text-amber-300">{row.drawn}</td>
                      <td className="py-2.5 px-2.5 text-center font-mono text-rose-400">{row.lost}</td>
                      <td className="py-2.5 px-2.5 text-center font-mono text-slate-400">{row.gf}</td>
                      <td className="py-2.5 px-2.5 text-center font-mono text-slate-400">{row.ga}</td>
                      <td className={`py-2.5 px-2.5 text-center font-mono font-bold ${row.gd > 0 ? 'text-emerald-400' : row.gd < 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                        {row.gd > 0 ? `+${row.gd}` : row.gd}
                      </td>

                      {/* Points */}
                      <td className="py-2.5 px-3 text-center font-mono font-black text-sm text-white bg-slate-950/40">
                        {row.points}
                      </td>

                      {/* Form */}
                      <td className="py-2.5 px-3 text-center font-mono text-[10px] hidden sm:table-cell">
                        {row.form ? (
                          <span className="bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-slate-300 tracking-widest font-bold">
                            {row.form}
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => handleOpenEditRow(row)}
                            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="Modifica riga"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteRow(row.position, row.team)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="Elimina riga"
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

      {/* OCR Standings Screenshot Modal */}
      {isOcrModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-white text-base">Analizza Screenshot Classifica FM26 (Gemini AI OCR)</h3>
              </div>
              <button
                onClick={handleSafeCloseOcr}
                title={parsing ? "Riduci e continua l'elaborazione in background" : "Chiudi"}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Carica una foto o uno screenshot della schermata della <strong>Classifica</strong> di Football Manager 2026. L'AI estrarrà istantaneamente tutte le posizioni, partite giocate, vittorie, pareggi, gol e punti!
            </p>

            {/* Banner for completed background task if present */}
            {latestCompletedStandingsTask && latestCompletedStandingsTask.standingsRows && !parsedPreview && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-emerald-300 animate-fade-in">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    Trovata un'analisi completata in background: <strong>{latestCompletedStandingsTask.standingsRows.length} squadre</strong> ({latestCompletedStandingsTask.fileName})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (latestCompletedStandingsTask.standingsRows) {
                      setParsedPreview(latestCompletedStandingsTask.standingsRows);
                    }
                  }}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs cursor-pointer shadow-sm transition-colors self-start sm:self-auto"
                >
                  Carica in questa tabella
                </button>
              </div>
            )}

            {/* Upload Area */}
            <div className="border-2 border-dashed border-slate-700 hover:border-emerald-500 rounded-2xl p-6 text-center space-y-3 bg-slate-950/60 transition-colors">
              <input
                type="file"
                accept="image/*"
                id="standings-file-input"
                onChange={handleFileChange}
                className="hidden"
              />
              <label htmlFor="standings-file-input" className="cursor-pointer space-y-2 block">
                <FileImage className="w-10 h-10 text-emerald-400 mx-auto" />
                <span className="text-xs font-bold text-white block">
                  Clicca o trascina qui lo screenshot della classifica
                </span>
                <span className="text-[11px] text-slate-400 block">Formati supportati: PNG, JPG, WEBP (FM26 Schedule/Table)</span>
              </label>

              {imagePreview && (
                <div className="mt-3 relative inline-block border border-slate-800 rounded-xl overflow-hidden max-h-48">
                  <img src={imagePreview} alt="Preview Classifica" className="max-h-48 object-contain mx-auto" />
                </div>
              )}
            </div>

            {/* Real-time OCR Progress Bar & Diagnostics */}
            {parsing && (
              <div className="space-y-2">
                <ScreenshotOcrProgressBar
                  isLoading={parsing}
                  context="standings"
                  title="Analisi & Scansione Classifica FM26"
                  error={parseError}
                />
                <button
                  type="button"
                  onClick={handleSendToBackground}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white font-semibold text-xs rounded-xl border border-indigo-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
                >
                  <Layers className="w-4 h-4 text-indigo-400" />
                  <span>⚡ Riduci ed elabora in Background (continua a usare l'applet)</span>
                </button>
              </div>
            )}

            {parseError && !parsing && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{parseError}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2">
              <button
                type="button"
                onClick={handleSafeCloseOcr}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-800 cursor-pointer"
              >
                Annulla
              </button>

              <div className="flex items-center gap-2 flex-wrap">
                {imagePreview && !parsing && (
                  <button
                    type="button"
                    onClick={handleStartBackgroundOcr}
                    disabled={!imagePreview || parsing}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-indigo-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-indigo-500/40 disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer shadow-md"
                  >
                    <Layers className="w-4 h-4 text-indigo-400" />
                    <span>🚀 Avvia in Background (usa l'applet)</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleAnalyzeScreenshot}
                  disabled={!imagePreview || parsing}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer shadow-lg"
                >
                  {parsing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Scansione in corso...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Analizza in Primo Piano</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Extracted Preview */}
            {parsedPreview && (
              <div className="space-y-3 pt-4 border-t border-slate-800 animate-fade-in">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <Check className="w-4 h-4" /> Risultato Analisi: {parsedPreview.length} Squadre Riconosciute
                  </h4>
                  <button
                    onClick={handleApplyParsedStandings}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <Check className="w-4 h-4" /> Applica alla Classifica
                  </button>
                </div>

                <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-800 text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase font-mono">
                      <tr>
                        <th className="p-2 text-center">#</th>
                        <th className="p-2">Squadra</th>
                        <th className="p-2 text-center">PG</th>
                        <th className="p-2 text-center">V</th>
                        <th className="p-2 text-center">N</th>
                        <th className="p-2 text-center">P</th>
                        <th className="p-2 text-center">GF</th>
                        <th className="p-2 text-center">GS</th>
                        <th className="p-2 text-center font-bold">Pt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {parsedPreview.map((row) => (
                        <tr key={`${row.position}_${row.team}`} className="hover:bg-slate-800/50">
                          <td className="p-2 text-center font-bold">{row.position}</td>
                          <td className="p-2 font-semibold text-white">{row.team}</td>
                          <td className="p-2 text-center">{row.played}</td>
                          <td className="p-2 text-center text-emerald-400">{row.won}</td>
                          <td className="p-2 text-center text-amber-300">{row.drawn}</td>
                          <td className="p-2 text-center text-rose-400">{row.lost}</td>
                          <td className="p-2 text-center">{row.gf}</td>
                          <td className="p-2 text-center">{row.ga}</td>
                          <td className="p-2 text-center font-bold text-emerald-300">{row.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit / Create Standings Row Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base">
                {editingRow ? `Modifica: ${editingRow.team}` : 'Aggiungi Nuova Squadra in Classifica'}
              </h3>
              <button onClick={() => setIsEditModalOpen(false)} className="p-1 text-slate-400 hover:text-white rounded-lg bg-slate-800">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Posizione (#):</label>
                  <input
                    type="number"
                    value={rowPos}
                    onChange={(e) => setRowPos(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-slate-400 font-bold mb-1">Nome Squadra:</label>
                  <input
                    type="text"
                    value={rowTeam}
                    onChange={(e) => setRowTeam(e.target.value)}
                    placeholder="Es. Arsenal"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">PG:</label>
                  <input
                    type="number"
                    value={rowPlayed}
                    onChange={(e) => setRowPlayed(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Vittorie:</label>
                  <input
                    type="number"
                    value={rowWon}
                    onChange={(e) => setRowWon(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-emerald-400 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Pareggi:</label>
                  <input
                    type="number"
                    value={rowDrawn}
                    onChange={(e) => setRowDrawn(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-amber-300 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Sconfitte:</label>
                  <input
                    type="number"
                    value={rowLost}
                    onChange={(e) => setRowLost(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-rose-400 font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Gol Fatti (GF):</label>
                  <input
                    type="number"
                    value={rowGf}
                    onChange={(e) => setRowGf(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Gol Subiti (GS):</label>
                  <input
                    type="number"
                    value={rowGa}
                    onChange={(e) => setRowGa(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-bold mb-1">Punti (Pt):</label>
                  <input
                    type="number"
                    value={rowPoints}
                    onChange={(e) => setRowPoints(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-emerald-300 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Forma Recente (es. V V N P V):</label>
                <input
                  type="text"
                  value={rowForm}
                  onChange={(e) => setRowForm(e.target.value)}
                  placeholder="V V N P V"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-800 cursor-pointer"
              >
                Annulla
              </button>
              <button
                onClick={handleSaveRow}
                disabled={!rowTeam.trim()}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 cursor-pointer shadow-md"
              >
                Salva Riga
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Standings Modal with Trend Reset Option */}
      {isClearStandingsModalOpen && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 space-y-4">
              <div className="flex items-start space-x-3.5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-md bg-rose-500/20 text-rose-400 border border-rose-500/40">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white tracking-tight">Azzerare la Classifica per la Nuova Stagione?</h3>
                  <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                    Tutte le {standings.length} squadre, punti, statistiche e differenze reti registrate verranno rimosse dalla classifica di campionato.
                  </p>
                </div>
              </div>

              {/* Checkbox to also clear the seasonal trend */}
              <label className="flex items-start gap-3 p-3 bg-slate-950/80 border border-slate-800 rounded-xl cursor-pointer hover:border-slate-700 transition-colors">
                <input
                  type="checkbox"
                  checked={clearTrendWithStandings}
                  onChange={(e) => setClearTrendWithStandings(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-rose-600 bg-slate-900 border-slate-700 focus:ring-rose-500 cursor-pointer"
                />
                <div className="text-xs">
                  <span className="font-bold text-white block">Azzera anche il Trend Cumulativo Stagionale</span>
                  <span className="text-slate-400 block mt-0.5 leading-relaxed">
                    Rimuove le partite giocate della passata stagione, resettando i grafici dei gol e le curve da Giornata 0.
                  </span>
                </div>
              </label>

              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsClearStandingsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateStandings([]);
                    if (clearTrendWithStandings) {
                      handleClearSeasonalTrend();
                    }
                    setIsClearStandingsModalOpen(false);
                  }}
                  className="px-4 py-2 text-white bg-rose-600 hover:bg-rose-500 rounded-xl text-xs font-semibold shadow-lg shadow-rose-950/40 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Sì, Cancella Classifica</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clear Seasonal Trend Confirmation Dialog */}
      <ConfirmDialogModal
        isOpen={isClearTrendModalOpen}
        title="Pulizia Trend Cumulativo Stagionale"
        message="Sei sicuro di voler azzerare il trend cumulativo stagionale? Tutte le partite disputate della scorsa stagione verranno rimosse dal calendario e le statistiche dei gol ripartiranno da zero per la nuova stagione."
        confirmLabel="Sì, Pulisci Trend"
        cancelLabel="Annulla"
        isDangerous={true}
        onConfirm={() => {
          handleClearSeasonalTrend();
          setIsClearTrendModalOpen(false);
        }}
        onCancel={() => setIsClearTrendModalOpen(false)}
      />
    </div>
  );
};
