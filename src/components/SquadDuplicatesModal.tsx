import React, { useState, useMemo } from 'react';
import { Player, YouthSquad } from '../types';
import {
  findSquadDuplicates,
  resolveDuplicateKeepInSquad,
  removeSpecificDuplicateOccurrence,
  resolveAllDuplicatesSmart,
  DuplicateGroup,
  SquadDuplicateOccurrence,
} from '../utils/squadDuplicateUtils';
import { isCopilotNote } from '../utils/copilotNoteProposals';
import { useLanguage } from '../i18n/LanguageContext';
import {
  AlertTriangle,
  CheckCircle2,
  Users,
  Sparkles,
  Trash2,
  Shield,
  Search,
  Filter,
  ArrowRight,
  Zap,
  Info,
  X,
  Check,
  Bot,
  Layers,
  GraduationCap
} from 'lucide-react';

interface SquadDuplicatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  firstTeamPlayers: Player[];
  youthSquads: YouthSquad[];
  onApplySquadsUpdate: (updatedFirstTeam: Player[], updatedYouthSquads: YouthSquad[]) => void;
  initialSearchTerm?: string;
  teamName?: string;
}

export const SquadDuplicatesModal: React.FC<SquadDuplicatesModalProps> = ({
  isOpen,
  onClose,
  firstTeamPlayers,
  youthSquads,
  onApplySquadsUpdate,
  initialSearchTerm = '',
  teamName = 'Club',
}) => {
  const { language, t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  const [selectedSquadFilter, setSelectedSquadFilter] = useState<string>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showConfirmAutoAll, setShowConfirmAutoAll] = useState(false);

  // Calcola il report sui doppioni in tempo reale
  const report = useMemo(() => {
    return findSquadDuplicates(firstTeamPlayers, youthSquads);
  }, [firstTeamPlayers, youthSquads]);

  // Conteggio totale atleti del club
  const totalClubAthletes = useMemo(() => {
    const ftCount = firstTeamPlayers.length;
    const youthCount = youthSquads.reduce((acc, sq) => acc + (sq.players?.length || 0), 0);
    return ftCount + youthCount;
  }, [firstTeamPlayers, youthSquads]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 4000);
  };

  // Filtra i gruppi di doppioni in base a ricerca e squadra
  const filteredGroups = useMemo(() => {
    return report.groups.filter((group) => {
      // Filtro ricerca nome
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const matchesName = group.playerName.toLowerCase().includes(term);
        if (!matchesName) return false;
      }

      // Filtro per rosa
      if (selectedSquadFilter !== 'all') {
        if (selectedSquadFilter === 'first-team') {
          if (!group.occurrences.some((o) => o.isFirstTeam)) return false;
        } else {
          if (!group.occurrences.some((o) => o.squadId === selectedSquadFilter)) return false;
        }
      }

      return true;
    });
  }, [report.groups, searchTerm, selectedSquadFilter]);

  if (!isOpen) return null;

  // Azione: Mantieni in una rosa specifica e rimuovi dalle altre (unendo le note)
  const handleKeepInSquad = (group: DuplicateGroup, targetOccurrence: SquadDuplicateOccurrence) => {
    const res = resolveDuplicateKeepInSquad(
      firstTeamPlayers,
      youthSquads,
      group.key,
      targetOccurrence.squadId
    );
    onApplySquadsUpdate(res.updatedFirstTeam, res.updatedYouthSquads);
    showToast(
      `✓ ${res.resolvedPlayerName} mantenuto in "${targetOccurrence.squadName}". Copie rimosse dalle altre rose (dati e note uniti).`
    );
  };

  // Azione: Rimuovi singola istanza
  const handleRemoveOccurrence = (occ: SquadDuplicateOccurrence) => {
    const res = removeSpecificDuplicateOccurrence(
      firstTeamPlayers,
      youthSquads,
      occ.squadId,
      occ.player.id
    );
    onApplySquadsUpdate(res.updatedFirstTeam, res.updatedYouthSquads);
    showToast(`Copia di ${occ.player.name} rimossa da "${occ.squadName}".`);
  };

  // Azione: Risolvi Tutti in Automatico
  const handleResolveAllSmart = () => {
    const res = resolveAllDuplicatesSmart(firstTeamPlayers, youthSquads);
    onApplySquadsUpdate(res.updatedFirstTeam, res.updatedYouthSquads);
    setShowConfirmAutoAll(false);
    showToast(
      `⚡ Risolti con successo tutti i doppioni! ${res.resolvedPlayerCount} atleti unificati, ${res.removedCopiesCount} copie ridondanti rimosse.`
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 md:p-6 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* MODAL HEADER */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-inner">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-wide">
                  {t('duplicatesModal.title')}
                </h2>
                {report.hasDuplicates ? (
                  <span className="bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs px-2 py-0.5 rounded-full font-semibold">
                    {language === 'it' 
                      ? `${report.totalDuplicatePlayers} duplicat${report.totalDuplicatePlayers === 1 ? 'o' : 'i'}`
                      : `${report.totalDuplicatePlayers} duplicate${report.totalDuplicatePlayers === 1 ? '' : 's'}`}
                  </span>
                ) : (
                  <span className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> {language === 'it' ? 'Nessun doppione' : 'No duplicates'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {language === 'it'
                  ? `Verifica automatica incrociata tra Prima Squadra (${firstTeamPlayers.length}) e Giovanili (${totalClubAthletes - firstTeamPlayers.length})`
                  : `Automated cross-check between First Team (${firstTeamPlayers.length}) and Youth Squads (${totalClubAthletes - firstTeamPlayers.length})`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
            title={t('common.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* TOAST NOTIFICATION */}
        {toastMessage && (
          <div className="bg-emerald-600 text-white px-4 py-2.5 text-xs font-semibold flex items-center justify-between shadow-md shrink-0 animate-fadeIn">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{toastMessage}</span>
            </div>
            <button onClick={() => setToastMessage(null)} className="text-emerald-200 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* TOP METRICS & CONTROLS */}
        <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900/60 space-y-4 shrink-0">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                {language === 'it' ? 'Atleti Totali Club' : 'Total Club Athletes'}
              </span>
              <p className="text-lg font-black text-white mt-0.5">{totalClubAthletes}</p>
            </div>
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                {language === 'it' ? 'Giocatori Duplicati' : 'Duplicate Players'}
              </span>
              <p className={`text-lg font-black mt-0.5 ${report.totalDuplicatePlayers > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                {report.totalDuplicatePlayers}
              </p>
            </div>
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                {language === 'it' ? 'Copie Ridondanti' : 'Redundant Copies'}
              </span>
              <p className={`text-lg font-black mt-0.5 ${report.totalExcessCopies > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {report.totalExcessCopies}
              </p>
            </div>
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-center">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                {language === 'it' ? 'Rose Monitorate' : 'Monitored Squads'}
              </span>
              <p className="text-lg font-black text-indigo-400 mt-0.5">{1 + youthSquads.length}</p>
            </div>
          </div>

          {/* Search, Filter & Quick Action Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-2">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={language === 'it' ? "Cerca giocatore duplicato..." : "Search duplicate player..."}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500/80"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Squad Filter */}
              <select
                value={selectedSquadFilter}
                onChange={(e) => setSelectedSquadFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-amber-500/80 cursor-pointer"
              >
                <option value="all">{language === 'it' ? 'Tutte le rose' : 'All squads'}</option>
                <option value="first-team">{language === 'it' ? 'Prima Squadra' : 'First Team'}</option>
                {youthSquads.map((sq) => (
                  <option key={sq.id} value={sq.id}>
                    {sq.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Smart 1-Click Resolve Button */}
            {report.hasDuplicates && (
              <div>
                {!showConfirmAutoAll ? (
                  <button
                    onClick={() => setShowConfirmAutoAll(true)}
                    className="w-full sm:w-auto px-3.5 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-amber-950/40 transition-all cursor-pointer"
                    title={language === 'it' ? "Risolve automaticamente tutti i doppioni mantenendo i giocatori nella rosa principale e unendo le note" : "Automatically resolves all duplicates keeping players in the primary squad and merging notes"}
                  >
                    <Zap className="w-3.5 h-3.5 fill-current" />
                    <span>{t('duplicatesModal.autoResolveAll')}</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5 bg-slate-950 border border-amber-500/50 p-1 rounded-xl">
                    <span className="text-[11px] text-amber-300 px-2 font-medium">
                      {language === 'it' ? 'Confermi unione automatica?' : 'Confirm automatic merge?'}
                    </span>
                    <button
                      onClick={handleResolveAllSmart}
                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    >
                      {language === 'it' ? 'Sì, Risolvi' : 'Yes, Resolve'}
                    </button>
                    <button
                      onClick={() => setShowConfirmAutoAll(false)}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors cursor-pointer"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* MODAL CONTENT: DUPLICATES LIST */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          
          {/* ZERO DUPLICATES STATE */}
          {!report.hasDuplicates ? (
            <div className="py-12 px-4 text-center bg-slate-950/40 border border-emerald-500/20 rounded-2xl flex flex-col items-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-3 shadow-lg shadow-emerald-950/30">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-white mb-1">
                {t('duplicatesModal.noDuplicatesTitle')}
              </h3>
              <p className="text-xs text-slate-400 max-w-md mb-4">
                {language === 'it' 
                  ? `Tutti i ${totalClubAthletes} atleti registrati nel club sono distribuiti in modo pulito ed esclusivo tra la Prima Squadra e le Squadre Giovanili. Nessun giocatore è registrato due volte.`
                  : `All ${totalClubAthletes} registered club athletes are cleanly and exclusively distributed between the First Team and Youth Squads. No duplicate registrations found.`}
              </p>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                {t('common.close')}
              </button>
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="py-10 px-4 text-center bg-slate-950/40 border border-slate-800 rounded-2xl">
              <Users className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-sm font-semibold text-white">
                {language === 'it' ? 'Nessun doppione corrisponde ai filtri di ricerca.' : 'No duplicate matches search filters.'}
              </p>
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedSquadFilter('all');
                }}
                className="mt-3 text-xs text-amber-400 hover:underline cursor-pointer"
              >
                {t('common.reset')}
              </button>
            </div>
          ) : (
            filteredGroups.map((group) => {
              const hasCopilotNotes = group.occurrences.some((o) => isCopilotNote(o.player.notes));

              return (
                <div
                  key={group.key}
                  className="bg-slate-950/80 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 sm:p-5 shadow-lg transition-all space-y-3.5"
                >
                  {/* Player Main Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-white text-sm">
                        {group.playerName.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-bold text-white tracking-wide">
                            {group.playerName}
                          </h4>
                          {hasCopilotNotes && (
                            <span className="bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 font-semibold" title="Include note concordate con il Copilot AI">
                              <Bot className="w-3 h-3 text-indigo-400" />
                              <span>Nota Copilot</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                          <span>{group.occurrences[0].player.position || 'Ruolo N/D'}</span>
                          <span>•</span>
                          <span>{group.occurrences[0].player.age} anni</span>
                          <span>•</span>
                          <span>{group.occurrences[0].player.nationality}</span>
                        </div>
                      </div>
                    </div>

                    {/* Status badges */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        <span>Presente in {group.squadNames.length} {group.squadNames.length === 1 ? 'squadra' : 'rose diverse'} ({group.totalCopies} copie)</span>
                      </span>
                    </div>
                  </div>

                  {/* Occurrences Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {group.occurrences.map((occ, idx) => {
                      const isFirstTeam = occ.isFirstTeam;
                      const hasNote = Boolean(occ.player.notes?.trim());
                      const hasCopilot = isCopilotNote(occ.player.notes);

                      return (
                        <div
                          key={`${occ.squadId}_${occ.player.id}_${idx}`}
                          className={`rounded-xl border p-3.5 flex flex-col justify-between transition-all ${
                            isFirstTeam
                              ? 'bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-500/50'
                              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div>
                            {/* Squad Header badge */}
                            <div className="flex items-center justify-between mb-2.5">
                              <span
                                className={`text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1.5 ${
                                  isFirstTeam
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                    : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                                }`}
                              >
                                {isFirstTeam ? (
                                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <GraduationCap className="w-3.5 h-3.5 text-indigo-400" />
                                )}
                                <span>{occ.squadName}</span>
                              </span>

                              <span className="text-[11px] text-slate-400 font-mono">
                                Maglia #{occ.player.number || '-'}
                              </span>
                            </div>

                            {/* Player instance stats */}
                            <div className="grid grid-cols-3 gap-2 bg-slate-950/50 rounded-lg p-2 text-center text-xs mb-2.5 border border-slate-800/60">
                              <div>
                                <span className="text-[10px] text-slate-500 block uppercase">CA</span>
                                <span className="font-bold text-amber-300">{occ.player.ca || '-'}</span>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-500 block uppercase">PA</span>
                                <span className="font-bold text-emerald-300">{occ.player.pa || '-'}</span>
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-500 block uppercase">Valore</span>
                                <span className="font-semibold text-slate-300 truncate block">
                                  {occ.player.value || '-'}
                                </span>
                              </div>
                            </div>

                            {/* Notes preview if present */}
                            {hasNote ? (
                              <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2 text-xs mb-3">
                                <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 mb-1">
                                  {hasCopilot ? (
                                    <Bot className="w-3 h-3 text-indigo-400" />
                                  ) : (
                                    <Info className="w-3 h-3 text-slate-500" />
                                  )}
                                  <span>
                                    {language === 'it' 
                                      ? `Nota salvata (${hasCopilot ? 'Copilot AI' : 'Manager'}):`
                                      : `Saved note (${hasCopilot ? 'Copilot AI' : 'Manager'}):`}
                                  </span>
                                </div>
                                <p className="text-slate-300 text-[11px] line-clamp-2 italic">
                                  "{occ.player.notes}"
                                </p>
                              </div>
                            ) : (
                              <div className="text-[11px] text-slate-500 italic mb-3">
                                {language === 'it' ? 'Nessuna nota registrata su questa scheda.' : 'No notes recorded on this profile.'}
                              </div>
                            )}
                          </div>

                          {/* Action Buttons for this Occurrence */}
                          <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2">
                            <button
                              onClick={() => handleKeepInSquad(group, occ)}
                              className="flex-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer shadow-sm"
                              title={language === 'it'
                                ? `Mantieni ${group.playerName} in "${occ.squadName}" ed elimina le altre copie unendo le note salvate`
                                : `Keep ${group.playerName} in "${occ.squadName}" and clean other copies merging notes`}
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>
                                {language === 'it'
                                  ? `Mantieni in ${occ.isFirstTeam ? 'Prima Squadra' : occ.squadName.split(' ').slice(-1)[0]}`
                                  : `Keep in ${occ.isFirstTeam ? 'First Team' : occ.squadName.split(' ').slice(-1)[0]}`}
                              </span>
                            </button>
                            <button
                              onClick={() => handleRemoveOccurrence(occ)}
                              className="py-1.5 px-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 hover:border-rose-500/50 rounded-lg text-xs font-medium flex items-center justify-center transition-colors cursor-pointer"
                              title={language === 'it' ? `Rimuovi solo questa copia da ${occ.squadName}` : `Remove only this copy from ${occ.squadName}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}

          {/* HELPFUL ADVICE & FM EXPLANATION BOX */}
          <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-4 text-xs text-slate-400 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-300">
              <Info className="w-4 h-4 text-indigo-400" />
              <span>Come prevenire i doppioni nelle rose lunghe (60-70 giocatori)</span>
            </div>
            <p className="leading-relaxed">
              In Football Manager, le rose complessive (Prima Squadra, U21, U20, U18) superano rapidamente i 60-70 elementi. I doppioni si creano tipicamente quando:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-400">
              <li>Si importa un nuovo file CSV per la Prima Squadra mentre alcuni giovani erano già presenti nelle liste giovanili.</li>
              <li>Un giocatore viene promosso o demotato senza sincronizzare l'archivio precedente.</li>
            </ul>
            <p className="text-emerald-400 font-medium">
              💡 <strong>Protezione attiva integrata</strong>: Quando premi <em>"Mantieni in..."</em> o <em>"Risolvi Tutti in Automatico"</em>, il sistema fonde automaticamente tutte le note (comprese quelle formulate e concordate con il <strong>Copilot AI</strong>) e gli attributi più aggiornati nella scheda definitiva, eliminando le copie ridondanti.
            </p>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-500">
            {report.hasDuplicates
              ? `${report.totalDuplicatePlayers} atleti da sistemare • ${report.totalExcessCopies} copie da rimuovere`
              : 'Rose sincronizzate ed equilibrate'}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            Chiudi
          </button>
        </div>

      </div>
    </div>
  );
};
