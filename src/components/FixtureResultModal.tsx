import React, { useState, useMemo } from 'react';
import { Fixture } from '../types';
import { 
  X, Check, Trash2, Calendar, MapPin, Search, Plus, Minus, 
  FileText, Trophy, Users, ShieldAlert, Sparkles, AlertCircle, RotateCcw 
} from 'lucide-react';
import { matchesSearch } from '../utils/textUtils';

export interface PlayerOption {
  id: string;
  name: string;
  position: string;
  squadName: string;
  number?: number;
}

interface FixtureResultModalProps {
  isOpen: boolean;
  fixture: Fixture;
  teamName: string;
  allPlayers: PlayerOption[];
  onSave: (
    id: string,
    score: string,
    notes?: string,
    customVenue?: 'Casa' | 'Trasferta' | 'Campo Neutro',
    customDate?: string,
    scorers?: string[],
    status?: 'Giocata' | 'In Arrivo',
    outcome?: 'Vittoria' | 'Pareggio' | 'Sconfitta'
  ) => void;
  onClose: () => void;
  onDelete?: (fixture: Fixture) => void;
}

interface ScorerItem {
  id: string;
  playerName: string;
  goals: number;
  squadName?: string;
}

export const FixtureResultModal: React.FC<FixtureResultModalProps> = ({
  isOpen,
  fixture,
  teamName,
  allPlayers,
  onSave,
  onClose,
  onDelete,
}) => {
  if (!isOpen || !fixture) return null;

  // Parse existing score (e.g. "2-1" -> 2, 1)
  const initialGoals = useMemo(() => {
    if (fixture.score) {
      const match = fixture.score.match(/(\d+)\s*[-:]\s*(\d+)/);
      if (match) {
        return {
          our: parseInt(match[1], 10),
          opp: parseInt(match[2], 10),
        };
      }
    }
    return { our: 0, opp: 0 };
  }, [fixture.score]);

  const [ourGoals, setOurGoals] = useState<number>(initialGoals.our);
  const [oppGoals, setOppGoals] = useState<number>(initialGoals.opp);
  const [status, setStatus] = useState<'Giocata' | 'In Arrivo'>(
    fixture.status || (fixture.score ? 'Giocata' : 'In Arrivo')
  );
  const [venue, setVenue] = useState<'Casa' | 'Trasferta' | 'Campo Neutro'>(fixture.venue);
  const [date, setDate] = useState<string>(fixture.date);
  const [notes, setNotes] = useState<string>(fixture.tacticalNotes || '');

  // Parse initial scorers
  const initialScorersList = useMemo<ScorerItem[]>(() => {
    if (!fixture.scorers || !Array.isArray(fixture.scorers) || fixture.scorers.length === 0) {
      return [];
    }

    return fixture.scorers.map((str, idx) => {
      // Look for format "Player Name (2)" or "Player Name"
      const match = str.match(/^(.*?)\s*\((\d+)\)$/);
      if (match) {
        const pName = match[1].trim();
        const goalsCount = parseInt(match[2], 10) || 1;
        const matchedPlayer = allPlayers.find(
          p => p.name.toLowerCase() === pName.toLowerCase()
        );
        return {
          id: matchedPlayer ? matchedPlayer.id : `scorer_${idx}`,
          playerName: pName,
          goals: goalsCount,
          squadName: matchedPlayer?.squadName,
        };
      } else {
        const pName = str.trim();
        const matchedPlayer = allPlayers.find(
          p => p.name.toLowerCase() === pName.toLowerCase()
        );
        return {
          id: matchedPlayer ? matchedPlayer.id : `scorer_${idx}`,
          playerName: pName,
          goals: 1,
          squadName: matchedPlayer?.squadName,
        };
      }
    });
  }, [fixture.scorers, allPlayers]);

  const [scorers, setScorers] = useState<ScorerItem[]>(initialScorersList);

  // Player search & filter
  const [playerSearch, setPlayerSearch] = useState('');
  const [squadFilter, setSquadFilter] = useState<'Tutte' | 'Prima Squadra' | 'Giovanili'>('Tutte');
  const [customScorerInput, setCustomScorerInput] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  // Filtered player options
  const filteredPlayers = useMemo(() => {
    const term = playerSearch.trim();
    return allPlayers.filter(p => {
      // Squad filter
      if (squadFilter === 'Prima Squadra' && p.squadName !== 'Prima Squadra') return false;
      if (squadFilter === 'Giovanili' && p.squadName === 'Prima Squadra') return false;

      // Text search
      if (!term) return true;
      return (
        matchesSearch(p.name, term) ||
        matchesSearch(p.position, term) ||
        matchesSearch(p.squadName, term)
      );
    });
  }, [allPlayers, playerSearch, squadFilter]);

  // Squad tabs summary
  const squadCounts = useMemo(() => {
    const firstTeam = allPlayers.filter(p => p.squadName === 'Prima Squadra').length;
    const youth = allPlayers.length - firstTeam;
    return { all: allPlayers.length, firstTeam, youth };
  }, [allPlayers]);

  // Total goals scored by registered scorers
  const totalScorerGoals = useMemo(() => {
    return scorers.reduce((acc, curr) => acc + curr.goals, 0);
  }, [scorers]);

  // Outcome computation
  const outcome = useMemo(() => {
    if (ourGoals > oppGoals) return { label: 'Vittoria', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' };
    if (ourGoals === oppGoals) return { label: 'Pareggio', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' };
    return { label: 'Sconfitta', color: 'bg-rose-500/20 text-rose-300 border-rose-500/40' };
  }, [ourGoals, oppGoals]);

  // Add a player as scorer
  const handleAddPlayerScorer = (player: PlayerOption) => {
    const existingIndex = scorers.findIndex(
      s => s.id === player.id || s.playerName.toLowerCase() === player.name.toLowerCase()
    );

    if (existingIndex >= 0) {
      // Increment goals
      const updated = [...scorers];
      updated[existingIndex] = {
        ...updated[existingIndex],
        goals: updated[existingIndex].goals + 1,
      };
      setScorers(updated);
    } else {
      // Add new
      setScorers([
        ...scorers,
        {
          id: player.id,
          playerName: player.name,
          goals: 1,
          squadName: player.squadName,
        },
      ]);
    }

    // Auto-adjust team goals if total scorer goals exceed team goals
    if (totalScorerGoals + 1 > ourGoals) {
      setOurGoals(totalScorerGoals + 1);
    }
  };

  // Add custom scorer
  const handleAddCustomScorer = () => {
    const clean = customScorerInput.trim();
    if (!clean) return;

    const existingIndex = scorers.findIndex(
      s => s.playerName.toLowerCase() === clean.toLowerCase()
    );

    if (existingIndex >= 0) {
      const updated = [...scorers];
      updated[existingIndex] = {
        ...updated[existingIndex],
        goals: updated[existingIndex].goals + 1,
      };
      setScorers(updated);
    } else {
      setScorers([
        ...scorers,
        {
          id: `custom_${Date.now()}`,
          playerName: clean,
          goals: 1,
          squadName: 'Altro / Autogol',
        },
      ]);
    }

    if (totalScorerGoals + 1 > ourGoals) {
      setOurGoals(totalScorerGoals + 1);
    }

    setCustomScorerInput('');
    setShowCustomInput(false);
  };

  // Increment scorer goals
  const handleIncrementScorer = (idx: number) => {
    const updated = [...scorers];
    updated[idx] = { ...updated[idx], goals: updated[idx].goals + 1 };
    setScorers(updated);

    if (totalScorerGoals + 1 > ourGoals) {
      setOurGoals(totalScorerGoals + 1);
    }
  };

  // Decrement scorer goals
  const handleDecrementScorer = (idx: number) => {
    const updated = [...scorers];
    if (updated[idx].goals > 1) {
      updated[idx] = { ...updated[idx], goals: updated[idx].goals - 1 };
      setScorers(updated);
    } else {
      // Remove if drops to 0
      updated.splice(idx, 1);
      setScorers(updated);
    }
  };

  // Remove scorer completely
  const handleRemoveScorer = (idx: number) => {
    const updated = [...scorers];
    updated.splice(idx, 1);
    setScorers(updated);
  };

  // Save handler - Saves score and marks match as Giocata
  const handleSave = () => {
    const finalScore = `${ourGoals}-${oppGoals}`;

    // Format scorers as strings (e.g. "Evan Ferguson (2)", "Bukayo Saka")
    const formattedScorers = scorers.map(s => {
      return s.goals > 1 ? `${s.playerName} (${s.goals})` : s.playerName;
    });

    onSave(
      fixture.id,
      finalScore,
      notes.trim() || undefined,
      venue,
      date.trim() || fixture.date,
      formattedScorers,
      'Giocata',
      outcome.value
    );
  };

  const handleResetToUnplayed = () => {
    onSave(
      fixture.id,
      '',
      notes.trim() || undefined,
      venue,
      date.trim() || fixture.date,
      [],
      'In Arrivo',
      undefined
    );
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-slate-950 px-5 py-3.5 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
              <Trophy className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {fixture.competition}
                </span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${
                  venue === 'Casa'
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : venue === 'Trasferta'
                    ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                }`}>
                  {venue}
                </span>
              </div>
              <h2 className="text-sm sm:text-base font-bold text-white mt-0.5">
                {venue === 'Casa' ? `${teamName} vs ${fixture.opponent}` : `${fixture.opponent} vs ${teamName}`}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body (Scrollable) */}
        <div className="p-5 overflow-y-auto space-y-5 text-slate-200 text-xs sm:text-sm">
          {/* SEZIONE 1: RISULTATO & TABELLONE */}
          <div className="bg-slate-950/80 rounded-2xl border border-slate-800 p-4 space-y-3 shadow-inner">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-emerald-400" />
                Risultato Partita
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const temp = ourGoals;
                    setOurGoals(oppGoals);
                    setOppGoals(temp);
                  }}
                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-amber-300 border border-slate-700/80 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Inverti i nostri gol con i gol subiti se il tabellino era letto al contrario"
                >
                  <span>⇄</span> Scambia Gol
                </button>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${outcome.color}`}>
                  {outcome.label}
                </span>
              </div>
            </div>

            {venue === 'Trasferta' && (
              <div className="text-[11px] bg-sky-950/40 border border-sky-500/30 rounded-xl px-3 py-1.5 text-sky-200 flex items-center justify-between gap-2">
                <span>
                  ✈️ <strong>Partita in Trasferta:</strong> il box verde a sinistra indica sempre i <strong>Nostri Gol</strong> segnati da {teamName}.
                </span>
                {(ourGoals < oppGoals) && (
                  <button
                    type="button"
                    onClick={() => {
                      const temp = ourGoals;
                      setOurGoals(oppGoals);
                      setOppGoals(temp);
                    }}
                    className="text-[10px] text-amber-300 hover:underline font-bold shrink-0 cursor-pointer"
                  >
                    Hai vinto tu? Inverti
                  </button>
                )}
              </div>
            )}

            {/* Scoreboard controls */}
            <div className="grid grid-cols-5 items-center gap-2 pt-1">
              {/* Our Team */}
              <div className="col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-center space-y-1.5">
                <span className="text-[11px] font-bold text-emerald-400 truncate block">
                  {teamName}
                </span>
                <span className="text-[10px] text-slate-400 block">Nostri Gol</span>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOurGoals(prev => Math.max(0, prev - 1))}
                    className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold text-sm cursor-pointer border border-slate-700 transition-colors"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={ourGoals}
                    onChange={(e) => setOurGoals(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-12 h-9 bg-slate-950 border border-emerald-500/40 rounded-lg text-center font-black text-xl text-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  />
                  <button
                    type="button"
                    onClick={() => setOurGoals(prev => prev + 1)}
                    className="w-8 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center font-bold text-sm cursor-pointer shadow-md shadow-emerald-950/40 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* VS Divider */}
              <div className="col-span-1 text-center flex flex-col items-center justify-center">
                <span className="text-slate-500 font-bold text-xs uppercase tracking-widest">VS</span>
                <span className="text-xl font-black text-slate-400">:</span>
              </div>

              {/* Opponent */}
              <div className="col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-center space-y-1.5">
                <span className="text-[11px] font-bold text-slate-200 truncate block">
                  {fixture.opponent}
                </span>
                <span className="text-[10px] text-slate-400 block">Gol Subiti</span>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOppGoals(prev => Math.max(0, prev - 1))}
                    className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold text-sm cursor-pointer border border-slate-700 transition-colors"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={oppGoals}
                    onChange={(e) => setOppGoals(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    className="w-12 h-9 bg-slate-950 border border-slate-700 rounded-lg text-center font-black text-xl text-white focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setOppGoals(prev => prev + 1)}
                    className="w-8 h-8 rounded-lg bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center font-bold text-sm cursor-pointer transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* SEZIONE 2: MARCATORI (TUTTE LE ROSE) */}
          <div className="bg-slate-950/80 rounded-2xl border border-slate-800 p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <span>⚽</span> Marcatori della Squadra
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Scegli tra tutti i giocatori registrati (Prima Squadra e Rose Giovanili)
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                  totalScorerGoals === ourGoals
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : totalScorerGoals < ourGoals
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                }`}>
                  {totalScorerGoals} / {ourGoals} gol assegnati
                </span>
              </div>
            </div>

            {/* Selected scorers list */}
            {scorers.length > 0 ? (
              <div className="space-y-1.5">
                <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                  Marcatori inseriti:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {scorers.map((scorer, idx) => (
                    <div
                      key={scorer.id || idx}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 flex items-center justify-between gap-2 shadow-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white truncate">
                            {scorer.playerName}
                          </span>
                        </div>
                        {scorer.squadName && (
                          <span className="text-[9px] text-slate-400 truncate block">
                            {scorer.squadName}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleDecrementScorer(idx)}
                          className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center font-bold text-xs cursor-pointer border border-slate-700"
                          title="Riduci gol"
                        >
                          <Minus className="w-2.5 h-2.5" />
                        </button>
                        <span className="text-xs font-extrabold text-emerald-400 px-1 min-w-[16px] text-center">
                          {scorer.goals}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleIncrementScorer(idx)}
                          className="w-5 h-5 rounded bg-emerald-600/80 hover:bg-emerald-600 text-white flex items-center justify-center font-bold text-xs cursor-pointer"
                          title="Aggiungi gol"
                        >
                          <Plus className="w-2.5 h-2.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveScorer(idx)}
                          className="w-5 h-5 rounded hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 flex items-center justify-center ml-1 cursor-pointer transition-colors"
                          title="Rimuovi marcatore"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-3 bg-slate-900/60 rounded-xl border border-dashed border-slate-800 text-center text-slate-400 text-xs">
                Nessun marcatore ancora selezionato. Cerca un giocatore qui sotto per aggiungerlo.
              </div>
            )}

            {/* Scorer Selection & Search */}
            <div className="pt-2 border-t border-slate-800/80 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                {/* Squad filter tabs */}
                <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setSquadFilter('Tutte')}
                    className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                      squadFilter === 'Tutte'
                        ? 'bg-slate-800 text-white font-semibold shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Tutte ({squadCounts.all})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSquadFilter('Prima Squadra')}
                    className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                      squadFilter === 'Prima Squadra'
                        ? 'bg-slate-800 text-emerald-300 font-semibold shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Prima Squadra ({squadCounts.firstTeam})
                  </button>
                  {squadCounts.youth > 0 && (
                    <button
                      type="button"
                      onClick={() => setSquadFilter('Giovanili')}
                      className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                        squadFilter === 'Giovanili'
                          ? 'bg-slate-800 text-sky-300 font-semibold shadow-xs'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Giovanili ({squadCounts.youth})
                    </button>
                  )}
                </div>

                {/* Toggle custom scorer button */}
                <button
                  type="button"
                  onClick={() => setShowCustomInput(!showCustomInput)}
                  className="text-[10px] text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  <span>Altro / Autogol</span>
                </button>
              </div>

              {/* Custom Scorer Input Form */}
              {showCustomInput && (
                <div className="p-2.5 bg-slate-900 rounded-xl border border-amber-500/30 space-y-2 animate-in fade-in duration-150">
                  <span className="text-[10px] text-amber-300 font-semibold block">
                    Inserisci marcatore speciale (es. "Autogol avversario", giocatore in prova):
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Nome marcatore o Autogol..."
                      value={customScorerInput}
                      onChange={(e) => setCustomScorerInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomScorer();
                        }
                      }}
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomScorer}
                      disabled={!customScorerInput.trim()}
                      className="px-3 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                    >
                      Aggiungi
                    </button>
                  </div>
                </div>
              )}

              {/* Search Bar for Players */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Cerca giocatore per nome, ruolo (es. PC, CC)..."
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              {/* Scrollable list of players to quickly click and add */}
              <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                {filteredPlayers.length > 0 ? (
                  filteredPlayers.map((player) => {
                    const isAlreadyScorer = scorers.some(
                      s => s.id === player.id || s.playerName.toLowerCase() === player.name.toLowerCase()
                    );
                    const currentGoals = scorers.find(
                      s => s.id === player.id || s.playerName.toLowerCase() === player.name.toLowerCase()
                    )?.goals || 0;

                    return (
                      <button
                        key={player.id}
                        type="button"
                        onClick={() => handleAddPlayerScorer(player)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg border transition-all flex items-center justify-between text-xs cursor-pointer ${
                          isAlreadyScorer
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                            : 'bg-slate-900/70 border-slate-800/80 hover:bg-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center space-x-2 min-w-0">
                          {player.number ? (
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1 py-0.2 rounded shrink-0">
                              #{player.number}
                            </span>
                          ) : null}
                          <span className="font-semibold text-white truncate">{player.name}</span>
                          <span className="text-[10px] text-slate-400 bg-slate-950 px-1.5 py-0.2 rounded border border-slate-800 shrink-0">
                            {player.position}
                          </span>
                        </div>

                        <div className="flex items-center space-x-2 shrink-0">
                          <span className={`text-[9px] px-1.5 py-0.2 rounded ${
                            player.squadName === 'Prima Squadra'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-sky-500/10 text-sky-400'
                          }`}>
                            {player.squadName}
                          </span>
                          {isAlreadyScorer ? (
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-500/30">
                              +1 ({currentGoals})
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400 bg-slate-800 hover:bg-slate-700 px-1.5 py-0.5 rounded font-medium">
                              + Gol
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="text-center py-2 text-[11px] text-slate-500">
                    Nessun giocatore trovato con questo nome.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* SEZIONE 3: NOTE TATTICHE & ANNOTAZIONI DELLA PARTITA */}
          <div className="bg-slate-950/80 rounded-2xl border border-slate-800 p-4 space-y-2">
            <label htmlFor="fixture-notes-textarea" className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-amber-400" />
              Note Tattiche & Annotazioni Partita
            </label>
            <p className="text-[11px] text-slate-400">
              Spazio libero per considerazioni post-gara, prestazioni dei singoli, cambi effettuati e analisi avversario.
            </p>
            <textarea
              id="fixture-notes-textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="es. Ferguson dominante nel gioco aereo, assist di Kerkez al 65'. Ottima fase di non possesso nel finale..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/40"
            />
          </div>

          {/* SEZIONE 4: DATA & SEDE PARTITA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label htmlFor="fixture-date-field" className="text-[11px] font-semibold text-slate-400 block mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-slate-400" />
                Data Incontro
              </label>
              <input
                type="text"
                id="fixture-date-field"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="es. 18 Ottobre 2026"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-slate-700"
              />
            </div>

            <div>
              <label htmlFor="fixture-venue-field" className="text-[11px] font-semibold text-slate-400 block mb-1 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-slate-400" />
                Luogo / Sede
              </label>
              <select
                id="fixture-venue-field"
                value={venue}
                onChange={(e) => setVenue(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-slate-700"
              >
                <option value="Casa">C - Casa</option>
                <option value="Trasferta">T - Trasferta</option>
                <option value="Campo Neutro">N - Campo Neutro</option>
              </select>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-950 px-5 py-3 border-t border-slate-800 flex items-center justify-between shrink-0">
          {onDelete ? (
            <button
              type="button"
              onClick={() => {
                const target = fixture;
                onClose();
                onDelete(target);
              }}
              className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Elimina</span>
            </button>
          ) : <div />}

          <div className="flex items-center space-x-2">
            {(fixture.status === 'Giocata' || Boolean(fixture.score)) && (
              <button
                type="button"
                onClick={handleResetToUnplayed}
                className="px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                title="Ripristina come partita non ancora disputata (rimuove il punteggio e marcatori)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Ripristina come</span> Non Giocata
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer transition-colors"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-950/50 flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Salva Risultato e Note</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
