import React, { useState } from 'react';
import {
  useBackgroundOcr,
  BackgroundOcrTask,
} from '../context/BackgroundOcrContext';
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
  ChevronUp,
  ChevronDown,
  Calendar,
  Trophy,
  Check,
  Eye,
  Trash2,
  RefreshCw,
  Zap,
  Layers,
  ArrowRight
} from 'lucide-react';
import { formatBytes } from '../utils/screenshotOptimizer';

export const BackgroundOcrWidget: React.FC = () => {
  const {
    tasks,
    activeTasks,
    completedTasks,
    latestNotification,
    activeReviewTask,
    cancelTask,
    dismissTask,
    clearAllCompleted,
    applyCalendarFixtures,
    applyStandings,
    openReviewModal,
    closeReviewModal,
    dismissNotification,
  } = useBackgroundOcr();

  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [selectedCalendarMode, setSelectedCalendarMode] = useState<Record<string, 'replace' | 'merge'>>({});

  if (tasks.length === 0 && !latestNotification) {
    return null;
  }

  const hasActive = activeTasks.length > 0;
  const hasCompleted = completedTasks.length > 0;

  return (
    <>
      {/* Toast Notification for background completion */}
      {latestNotification && (
        <div className="fixed bottom-20 right-6 z-50 max-w-md animate-bounce-subtle pointer-events-auto">
          <div
            className={`flex items-start gap-3 p-4 rounded-2xl shadow-2xl border backdrop-blur-md transition-all ${
              latestNotification.type === 'success'
                ? 'bg-slate-900/95 border-emerald-500/50 text-slate-100 shadow-emerald-950/40'
                : latestNotification.type === 'error'
                ? 'bg-slate-900/95 border-rose-500/50 text-slate-100 shadow-rose-950/40'
                : 'bg-slate-900/95 border-sky-500/50 text-slate-100 shadow-sky-950/40'
            }`}
          >
            <div className="p-2 rounded-xl shrink-0 mt-0.5 bg-slate-800">
              {latestNotification.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : latestNotification.type === 'error' ? (
                <AlertTriangle className="w-5 h-5 text-rose-400" />
              ) : (
                <Sparkles className="w-5 h-5 text-sky-400" />
              )}
            </div>

            <div className="flex-1 min-w-0 pr-2">
              <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {latestNotification.type === 'success'
                  ? 'Gemini Vision Background'
                  : latestNotification.type === 'error'
                  ? 'Attenzione Scansione'
                  : 'Notifica'}
              </h5>
              <p className="text-sm font-semibold text-white mt-0.5 leading-snug">
                {latestNotification.message}
              </p>
              {latestNotification.taskId && (
                <div className="mt-2.5 flex items-center gap-2">
                  <button
                    onClick={() => {
                      openReviewModal(latestNotification.taskId);
                      dismissNotification();
                    }}
                    className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                  >
                    <Eye className="w-3.5 h-3.5" /> Rivedi Risultati
                  </button>
                  <button
                    onClick={dismissNotification}
                    className="text-xs text-slate-400 hover:text-white px-2 py-1.5 transition-colors cursor-pointer"
                  >
                    Chiudi
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={dismissNotification}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Bottom-Right Background OCR Pill / Dock */}
      <div className="fixed bottom-4 right-6 z-40 max-w-sm w-full sm:w-auto pointer-events-auto">
        {!isExpanded ? (
          /* Minimized Compact Pill */
          <div
            onClick={() => setIsExpanded(true)}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl border shadow-xl backdrop-blur-md cursor-pointer transition-all hover:scale-102 ${
              hasActive
                ? 'bg-slate-900/95 border-indigo-500/50 text-indigo-300 hover:border-indigo-400 shadow-indigo-950/50'
                : 'bg-slate-900/95 border-emerald-500/50 text-emerald-300 hover:border-emerald-400 shadow-emerald-950/50'
            }`}
          >
            <div className="relative flex items-center justify-center">
              {hasActive ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                </>
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              )}
            </div>

            <div className="flex flex-col text-left">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                {hasActive ? (
                  <>
                    <span>Background OCR</span>
                    <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.2 rounded font-mono">
                      {activeTasks.length} in corso
                    </span>
                  </>
                ) : (
                  <>
                    <span>OCR Completato</span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded font-mono">
                      {completedTasks.length} pronti
                    </span>
                  </>
                )}
              </span>
              <span className="text-[11px] text-slate-300 line-clamp-1 max-w-[200px]">
                {hasActive
                  ? `${activeTasks[0].title} (${activeTasks[0].elapsedSeconds}s)`
                  : `${completedTasks[0]?.title} completato`}
              </span>
            </div>

            <ChevronUp className="w-4 h-4 text-slate-400 ml-1" />
          </div>
        ) : (
          /* Expanded Card Dock */
          <div className="bg-slate-900/95 border border-slate-700/80 rounded-2xl shadow-2xl p-4 space-y-3 w-88 backdrop-blur-md text-slate-200 animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <h4 className="text-xs font-bold text-white tracking-wide uppercase">
                  Screenshot in Background
                </h4>
              </div>
              <div className="flex items-center gap-1">
                {completedTasks.length > 0 && (
                  <button
                    onClick={clearAllCompleted}
                    title="Pulisci completati"
                    className="text-[11px] text-slate-400 hover:text-slate-200 px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Pulisci
                  </button>
                )}
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-snug">
              L'elaborazione continua in background: puoi navigare tra rose, tattiche e copilot senza interruzioni.
            </p>

            {/* Tasks List */}
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {tasks.map(task => {
                const isCal = task.type === 'calendar';
                const calMode = selectedCalendarMode[task.id] || 'replace';

                return (
                  <div
                    key={task.id}
                    className={`p-3 rounded-xl border text-xs space-y-2 transition-all ${
                      task.status === 'completed'
                        ? 'bg-emerald-950/20 border-emerald-500/40'
                        : task.status === 'error'
                        ? 'bg-rose-950/20 border-rose-500/40'
                        : 'bg-slate-800/60 border-slate-700/60'
                    }`}
                  >
                    {/* Top Row: Icon + Title + Status Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {isCal ? (
                          <Calendar className="w-4 h-4 text-sky-400 shrink-0" />
                        ) : (
                          <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
                        )}
                        <div>
                          <div className="font-bold text-white text-[12px] flex items-center gap-1.5">
                            <span>{task.title}</span>
                            {task.status === 'analyzing' || task.status === 'optimizing' ? (
                              <span className="text-[10px] text-indigo-400 font-mono">
                                ({task.elapsedSeconds}s)
                              </span>
                            ) : null}
                          </div>
                          <span className="text-[10px] text-slate-400 line-clamp-1">
                            {task.fileName}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {task.status === 'optimizing' || task.status === 'analyzing' ? (
                          <button
                            onClick={() => cancelTask(task.id)}
                            title="Annulla elaborazione"
                            className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-700/50 transition-colors cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => dismissTask(task.id)}
                            title="Rimuovi"
                            className="p-1 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-700/50 transition-colors cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Image Preview & Optimization Info if available */}
                    {task.imagePreview && (
                      <div className="flex items-center gap-2 bg-slate-950/40 p-1.5 rounded-lg border border-slate-800">
                        <img
                          src={task.imagePreview}
                          alt="Thumbnail"
                          className="w-12 h-9 object-cover rounded bg-slate-900 border border-slate-700 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <span className="text-[10px] text-slate-300 block truncate font-medium">
                            {task.phaseLabel}
                          </span>
                          {task.optimizedStats && (
                            <span className="text-[9px] text-emerald-400 flex items-center gap-1">
                              <Zap className="w-2.5 h-2.5 text-amber-400" />
                              {formatBytes(task.optimizedStats.optimizedSize)} (-
                              {task.optimizedStats.reducedPercent}%)
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Progress Bar for active tasks */}
                    {(task.status === 'optimizing' || task.status === 'analyzing') && (
                      <div className="space-y-1">
                        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-indigo-500 to-purple-500 h-1.5 rounded-full transition-all duration-300 animate-pulse"
                            style={{
                              width: `${
                                task.status === 'optimizing' ? 30 : Math.min(95, 30 + task.elapsedSeconds * 4)
                              }%`,
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                          <span className="flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                            {task.phaseLabel}
                          </span>
                          <span>{task.elapsedSeconds}s</span>
                        </div>
                      </div>
                    )}

                    {/* Error display */}
                    {task.status === 'error' && (
                      <div className="p-2 bg-rose-500/10 border border-rose-500/20 rounded-lg text-[11px] text-rose-300 space-y-1">
                        <div className="flex items-center gap-1 font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>Scansione fallita</span>
                        </div>
                        <p className="line-clamp-2">{task.error}</p>
                      </div>
                    )}

                    {/* Completed Actions for Calendar */}
                    {task.status === 'completed' && isCal && task.calendarFixtures && (
                      <div className="space-y-2 pt-1 border-t border-emerald-500/20">
                        <div className="flex items-center justify-between text-[11px] text-emerald-300">
                          <span className="font-bold flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            {task.calendarFixtures.length} partite trovate
                          </span>
                          <button
                            onClick={() => openReviewModal(task.id)}
                            className="text-[11px] text-indigo-400 hover:text-indigo-300 underline font-semibold cursor-pointer"
                          >
                            Rivedi lista
                          </button>
                        </div>

                        {/* Replace vs Merge Switcher */}
                        <div className="flex items-center gap-2 text-[10px]">
                          <label className="text-slate-400">Modalità:</label>
                          <div className="flex rounded-lg bg-slate-900 p-0.5 border border-slate-700">
                            <button
                              onClick={() =>
                                setSelectedCalendarMode(prev => ({ ...prev, [task.id]: 'replace' }))
                              }
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                                calMode === 'replace'
                                  ? 'bg-indigo-600 text-white'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              Sostituisci
                            </button>
                            <button
                              onClick={() =>
                                setSelectedCalendarMode(prev => ({ ...prev, [task.id]: 'merge' }))
                              }
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                                calMode === 'merge'
                                  ? 'bg-indigo-600 text-white'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              Unisci
                            </button>
                          </div>
                        </div>

                        {/* Apply Button */}
                        <button
                          onClick={() => applyCalendarFixtures(task.id, calMode === 'replace')}
                          className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 shadow transition-all cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Applica al Calendario</span>
                        </button>
                      </div>
                    )}

                    {/* Completed Actions for Standings */}
                    {task.status === 'completed' && !isCal && task.standingsRows && (
                      <div className="space-y-2 pt-1 border-t border-emerald-500/20">
                        <div className="flex items-center justify-between text-[11px] text-emerald-300">
                          <span className="font-bold flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            {task.standingsRows.length} squadre trovate
                          </span>
                          <button
                            onClick={() => openReviewModal(task.id)}
                            className="text-[11px] text-indigo-400 hover:text-indigo-300 underline font-semibold cursor-pointer"
                          >
                            Rivedi classifica
                          </button>
                        </div>

                        {/* Apply Button */}
                        <button
                          onClick={() => applyStandings(task.id)}
                          className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 shadow transition-all cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Applica alla Classifica</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Review Modal if activeReviewTask is selected */}
      {activeReviewTask && (
        <ReviewTaskModal
          task={activeReviewTask}
          onClose={closeReviewModal}
          onApplyCalendar={(replace) => applyCalendarFixtures(activeReviewTask.id, replace)}
          onApplyStandings={() => applyStandings(activeReviewTask.id)}
        />
      )}
    </>
  );
};

interface ReviewTaskModalProps {
  task: BackgroundOcrTask;
  onClose: () => void;
  onApplyCalendar: (replace: boolean) => void;
  onApplyStandings: () => void;
}

const ReviewTaskModal: React.FC<ReviewTaskModalProps> = ({
  task,
  onClose,
  onApplyCalendar,
  onApplyStandings,
}) => {
  const isCal = task.type === 'calendar';
  const [replaceExisting, setReplaceExisting] = useState<boolean>(true);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 space-y-4 shadow-2xl relative max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
          <div className="flex items-center space-x-2">
            {isCal ? (
              <Calendar className="w-5 h-5 text-sky-400" />
            ) : (
              <Trophy className="w-5 h-5 text-amber-400" />
            )}
            <div>
              <h3 className="font-bold text-white text-base">
                Rivedi Risultati Scansione Background: {task.title}
              </h3>
              <p className="text-xs text-slate-400">{task.fileName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 hover:bg-slate-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="overflow-y-auto flex-1 space-y-4 pr-1">
          {/* Calendar Fixtures Table */}
          {isCal && task.calendarFixtures && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>
                  Partite rilevate con successo dallo screenshot: <strong>{task.calendarFixtures.length}</strong>
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Modalità:</span>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      checked={replaceExisting}
                      onChange={() => setReplaceExisting(true)}
                    />
                    <span>Sostituisci</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      checked={!replaceExisting}
                      onChange={() => setReplaceExisting(false)}
                    />
                    <span>Unisci</span>
                  </label>
                </div>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase font-mono sticky top-0">
                    <tr>
                      <th className="p-2.5">Data</th>
                      <th className="p-2.5">Avversario</th>
                      <th className="p-2.5">Luogo</th>
                      <th className="p-2.5">Competizione</th>
                      <th className="p-2.5">Stato / Risultato</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-900/60">
                    {task.calendarFixtures.map((f, i) => (
                      <tr key={f.id || i} className="hover:bg-slate-800/40">
                        <td className="p-2.5 font-medium text-slate-200">{f.date}</td>
                        <td className="p-2.5 font-bold text-white">{f.opponent}</td>
                        <td className="p-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              f.venue === 'Casa'
                                ? 'bg-sky-500/20 text-sky-300'
                                : f.venue === 'Trasferta'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-purple-500/20 text-purple-300'
                            }`}
                          >
                            {f.venue}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-300">{f.competition}</td>
                        <td className="p-2.5">
                          {f.score ? (
                            <span className="font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                              {f.score} ({f.outcome || 'Giocata'})
                            </span>
                          ) : (
                            <span className="text-slate-400">{f.status}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Standings Table */}
          {!isCal && task.standingsRows && (
            <div className="space-y-3">
              <div className="text-xs text-slate-300">
                Squadre estratte dalla classifica: <strong>{task.standingsRows.length}</strong>
              </div>

              <div className="border border-slate-800 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase font-mono sticky top-0">
                    <tr>
                      <th className="p-2 text-center">#</th>
                      <th className="p-2">Squadra</th>
                      <th className="p-2 text-center">G</th>
                      <th className="p-2 text-center">V</th>
                      <th className="p-2 text-center">N</th>
                      <th className="p-2 text-center">P</th>
                      <th className="p-2 text-center">GF</th>
                      <th className="p-2 text-center">GS</th>
                      <th className="p-2 text-center">DR</th>
                      <th className="p-2 text-center font-bold text-white">Pt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-900/60 font-mono">
                    {task.standingsRows.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-800/40">
                        <td className="p-2 text-center text-slate-400 font-bold">{r.position}</td>
                        <td className="p-2 font-sans font-bold text-white">{r.team}</td>
                        <td className="p-2 text-center text-slate-300">{r.played}</td>
                        <td className="p-2 text-center text-slate-300">{r.won}</td>
                        <td className="p-2 text-center text-slate-300">{r.drawn}</td>
                        <td className="p-2 text-center text-slate-300">{r.lost}</td>
                        <td className="p-2 text-center text-slate-300">{r.gf}</td>
                        <td className="p-2 text-center text-slate-300">{r.ga}</td>
                        <td className="p-2 text-center text-slate-300">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                        <td className="p-2 text-center font-bold text-amber-400">{r.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 cursor-pointer"
          >
            Chiudi
          </button>

          {isCal ? (
            <button
              onClick={() => onApplyCalendar(replaceExisting)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer shadow-lg transition-all"
            >
              <Check className="w-4 h-4" />
              <span>Conferma e Applica al Calendario</span>
            </button>
          ) : (
            <button
              onClick={onApplyStandings}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 cursor-pointer shadow-lg transition-all"
            >
              <Check className="w-4 h-4" />
              <span>Conferma e Applica alla Classifica</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
