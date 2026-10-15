import React, { useState } from 'react';
import {
  Activity,
  Cpu,
  Database,
  AlertTriangle,
  CheckCircle2,
  Zap,
  RefreshCw,
  Trash2,
  Sliders,
  Users,
  Target,
  GraduationCap,
  X,
  Info,
  Layers,
  FileText,
  MessageSquare,
  Trophy,
  Key,
  Calendar,
  TrendingUp
} from 'lucide-react';
import { hasCustomApiKey } from '../utils/apiKeyStorage';

export interface TokenUsageStats {
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
  timestamp?: string;
}

export interface PayloadBreakdown {
  playersCount: number;
  playersBytes: number;
  scoutingCount: number;
  scoutingBytes: number;
  youthCount: number;
  youthBytes: number;
  notesCount: number;
  notesBytes?: number;
  fixturesCount: number;
  fixturesPlayedCount?: number;
  calendarNotesCount?: number;
  playerNotesCount?: number;
  playersOnLoanCount?: number;
  fixturesBytes?: number;
  standingsCount: number;
  standingsBytes: number;
  competitionsCount: number;
  improvedPlayersCount?: number;
  declinedPlayersCount?: number;
  growthBytes?: number;
  hasGamePlan: boolean;
  gamePlanBytes: number;
  chatMessagesCount: number;
  chatBytes: number;
  totalBytes: number;
  estimatedTokens: number;
}

export interface PayloadConfig {
  contextMode?: 'smart' | 'full'; // 'smart' = Smart Focus (Ultra-Rapida, mirata), 'full' = Tutto il Database
  scoutingDetailMode: 'full' | 'summary';
  includeYouth: boolean;
  includeGamePlan?: boolean; // default false: disattivato da default, attivabile per big match & finali
  historyLimit: number; // 0 for unlimited, or e.g. 6, 10
  aiModel?: 'gemini-3.8-flash' | 'gemini-3.1-flash-lite'; // 'gemini-3.8-flash' (default), 'gemini-3.1-flash-lite' (ultra-fast)
  thinkingSpeed?: 'turbo' | 'deep'; // 'turbo' = ThinkingLevel.LOW (-80% latenza), 'deep' = ThinkingLevel.HIGH
  enableStreaming?: boolean; // default true
}

interface MemoryDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokenUsage: TokenUsageStats | null;
  breakdown: PayloadBreakdown;
  config: PayloadConfig;
  onChangeConfig: (newConfig: PayloadConfig) => void;
  onClearHistory: () => void;
  onRefreshLiveCount: () => void;
  isRecalculating?: boolean;
  onOpenApiKeyModal?: () => void;
}

export const MemoryDiagnosticsModal: React.FC<MemoryDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  tokenUsage,
  breakdown,
  config,
  onChangeConfig,
  onClearHistory,
  onRefreshLiveCount,
  isRecalculating = false,
  onOpenApiKeyModal,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'settings'>('overview');

  if (!isOpen) return null;

  // Evaluation criteria
  const estimatedTokens = breakdown.estimatedTokens || Math.round(breakdown.totalBytes / 3.7);
  const totalKB = (breakdown.totalBytes / 1024).toFixed(1);

  // Health Level:
  // Optimal: < 25,000 tokens
  // Moderate: 25,000 - 55,000 tokens
  // Heavy: > 55,000 tokens
  let healthStatus: 'optimal' | 'moderate' | 'heavy' = 'optimal';
  let healthLabel = 'Ottimale (Latenza Minima)';
  let healthColor = 'emerald';
  let healthPercent = Math.min(100, Math.round((estimatedTokens / 50000) * 100));

  if (estimatedTokens > 55000) {
    healthStatus = 'heavy';
    healthLabel = 'Pesante (Possibile Rallentamento)';
    healthColor = 'amber';
  } else if (estimatedTokens > 25000) {
    healthStatus = 'moderate';
    healthLabel = 'Moderato (Carico Medio)';
    healthColor = 'teal';
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">Controllo Token & Stato Memoria</h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  healthStatus === 'optimal'
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : healthStatus === 'moderate'
                    ? 'bg-teal-500/10 text-teal-300 border-teal-500/30'
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                }`}>
                  {healthStatus === 'optimal' ? '🟢 ' : healthStatus === 'moderate' ? '🟡 ' : '🟠 '}
                  {totalKB} KB
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Monitoraggio payload Gemini 3.8 Flash • Prevenzione rallentamenti e allucinazioni
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switchers */}
        <div className="px-6 pt-3 pb-1 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveSubTab('overview')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                activeSubTab === 'overview'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              Stato & Diagnostica
            </button>
            <button
              onClick={() => setActiveSubTab('settings')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                activeSubTab === 'settings'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              Filtri Ottimizzazione Payload
            </button>
          </div>

          <button
            onClick={onRefreshLiveCount}
            disabled={isRecalculating}
            className="px-2.5 py-1 text-[11px] rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 flex items-center gap-1 transition-all disabled:opacity-50"
            title="Ricalcola token con le API"
          >
            <RefreshCw className={`w-3 h-3 ${isRecalculating ? 'animate-spin text-emerald-400' : ''}`} />
            <span>{isRecalculating ? 'Calcolo...' : 'Ricalcola'}</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {activeSubTab === 'overview' ? (
            <>
              {/* Overall Health Status Banner */}
              <div className={`p-4 rounded-xl border ${
                healthStatus === 'optimal'
                  ? 'bg-emerald-950/20 border-emerald-500/30'
                  : healthStatus === 'moderate'
                  ? 'bg-teal-950/20 border-teal-500/30'
                  : 'bg-amber-950/20 border-amber-500/30'
              }`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${
                      healthStatus === 'optimal'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : healthStatus === 'moderate'
                        ? 'bg-teal-500/20 text-teal-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {healthStatus === 'optimal' ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Livello Carico Memoria
                      </div>
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        {healthLabel}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-slate-400">Token Stimati</div>
                    <div className="text-base font-extrabold text-white font-mono">
                      ~{estimatedTokens.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Progress Bar of Target Load */}
                <div className="mt-3">
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>Carico rispetto alla soglia rapida (50k token)</span>
                    <span className="font-mono">{healthPercent}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        healthStatus === 'optimal'
                          ? 'bg-emerald-500'
                          : healthStatus === 'moderate'
                          ? 'bg-teal-500'
                          : 'bg-amber-500'
                      }`}
                      style={{ width: `${healthPercent}%` }}
                    />
                  </div>
                </div>

                {/* Technical Diagnostics verdict */}
                <div className="mt-3 text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                  {healthStatus === 'optimal' && (
                    <p>
                      ✨ <strong>Stato perfetto:</strong> Il payload è compatto (~{totalKB} KB). L&apos;elaborazione sarà istantanea (1-2s) e Gemini 3.8 Flash risponderà con la massima accuratezza analitica senza allucinazioni.
                    </p>
                  )}
                  {healthStatus === 'moderate' && (
                    <p>
                      ⚡ <strong>Stato ottimale per FM:</strong> Il contesto include la prima squadra e gli obiettivi scouting (~{totalKB} KB). La latenza è normale (2-4s) e ideale per confronti dettagliati tra giocatori.
                    </p>
                  )}
                  {healthStatus === 'heavy' && (
                    <p>
                      ⚠️ <strong>Carico elevato:</strong> Il payload supera i 50k token (~{totalKB} KB), solitamente dovuto a moltissimi giocatori caricati in scouting con schede complete o una cronologia chat molto lunga. Puoi alleggerirlo passando al profilo <em>&quot;Scouting Sintetico&quot;</em> nella scheda filtri.
                    </p>
                  )}
                </div>
              </div>

              {/* BYOK Quota Mode Banner */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                    hasCustomApiKey()
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                      : 'bg-amber-500/10 border-amber-500/25 text-amber-400'
                  }`}>
                    <Key className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">
                        {hasCustomApiKey() ? 'Chiave Personale BYOK Attiva' : 'Chiave Predefinita del Server'}
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        hasCustomApiKey()
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}>
                        {hasCustomApiKey() ? 'Quota Personale Dedicata' : 'Quota Condivisa'}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      {hasCustomApiKey()
                        ? 'Le chiamate a Gemini utilizzano la tua chiave personale salvata in locale (nessun costo per l\'host).'
                        : 'Stai usando la chiave del server. Se la condividi o riscontri limiti, puoi inserire la tua chiave gratuita.'}
                    </span>
                  </div>
                </div>
                {onOpenApiKeyModal && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenApiKeyModal();
                    }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold rounded-lg border border-slate-700 shrink-0 transition-all cursor-pointer"
                  >
                    {hasCustomApiKey() ? 'Gestisci Chiave' : 'Imposta Chiave'}
                  </button>
                )}
              </div>

              {/* Real API Token Counters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                  <div className="text-[11px] text-slate-400 flex items-center justify-between">
                    <span>Ultimo Prompt (Input)</span>
                    <Layers className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                  <div className="text-lg font-bold text-white font-mono mt-1">
                    {tokenUsage ? tokenUsage.promptTokens.toLocaleString() : 'In attesa'}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {tokenUsage ? 'Token reali calcolati da Gemini' : 'Invia un messaggio per i dati reali'}
                  </div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                  <div className="text-[11px] text-slate-400 flex items-center justify-between">
                    <span>Risposta (Output)</span>
                    <Zap className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="text-lg font-bold text-emerald-400 font-mono mt-1">
                    {tokenUsage ? tokenUsage.candidatesTokens.toLocaleString() : 'In attesa'}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Token generati nell&apos;ultima analisi
                  </div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                  <div className="text-[11px] text-slate-400 flex items-center justify-between">
                    <span>Token Totali Consumati</span>
                    <Database className="w-3.5 h-3.5 text-teal-400" />
                  </div>
                  <div className="text-lg font-bold text-teal-300 font-mono mt-1">
                    {tokenUsage ? tokenUsage.totalTokens.toLocaleString() : 'In attesa'}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Modello: Gemini 3.8 Flash
                  </div>
                </div>
              </div>

              {/* Payload Breakdown by Section */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-emerald-400" />
                  Composizione Attuale del Payload
                </h4>

                <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl divide-y divide-slate-800/60 text-xs">
                  {/* First Team */}
                  <div className="p-3 flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <Users className="w-4 h-4 text-emerald-400" />
                      <div>
                        <span className="font-semibold text-white">Prima Squadra</span>
                        <span className="text-slate-400 ml-1.5">
                          ({breakdown.playersCount} giocatori{breakdown.playerNotesCount ? ` • ${breakdown.playerNotesCount} con note/tabellini` : ''}{breakdown.playersOnLoanCount ? ` • ${breakdown.playersOnLoanCount} in prestito` : ''})
                        </span>
                      </div>
                    </div>
                    <span className="font-mono text-slate-300 font-medium">
                      ~{(breakdown.playersBytes / 1024).toFixed(1)} KB
                    </span>
                  </div>

                  {/* Scouting */}
                  <div className="p-3 flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <Target className="w-4 h-4 text-cyan-400" />
                      <div>
                        <span className="font-semibold text-white">Obiettivi Scouting</span>
                        <span className="text-slate-400 ml-1.5">
                          ({breakdown.scoutingCount} giocatori {config.scoutingDetailMode === 'full' ? '• Dettaglio Completo' : '• Sintetico'})
                        </span>
                      </div>
                    </div>
                    <span className="font-mono text-slate-300 font-medium">
                      ~{(breakdown.scoutingBytes / 1024).toFixed(1)} KB
                    </span>
                  </div>

                  {/* Youth */}
                  <div className="p-3 flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <GraduationCap className="w-4 h-4 text-amber-400" />
                      <div>
                        <span className="font-semibold text-white">Vivai & Giovanili</span>
                        <span className="text-slate-400 ml-1.5">
                          ({breakdown.youthCount} giovani {config.includeYouth ? '• Inclusi' : '• Esclusi per leggerezza'})
                        </span>
                      </div>
                    </div>
                    <span className="font-mono text-slate-300 font-medium">
                      ~{(breakdown.youthBytes / 1024).toFixed(1)} KB
                    </span>
                  </div>

                  {/* Game Plan & Notes */}
                  <div className="p-3 flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <FileText className="w-4 h-4 text-indigo-400" />
                      <div>
                        <span className="font-semibold text-white">Piano Gara & Note Tattiche</span>
                        <span className="text-slate-400 ml-1.5">
                          ({breakdown.notesCount} note{breakdown.hasGamePlan ? (config.includeGamePlan ? ' • Piano Gara Big Match ATTIVO' : ' • Piano Gara disattivato per leggerezza') : ''})
                        </span>
                      </div>
                    </div>
                    <span className="font-mono text-slate-300 font-medium">
                      ~{(((config.includeGamePlan ? breakdown.gamePlanBytes : 0) || 0) + (breakdown.notesBytes || 1500) / 1024).toFixed(1)} KB
                    </span>
                  </div>

                  {/* Calendar & Match Scorers Performance */}
                  <div className="p-3 flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <Calendar className="w-4 h-4 text-emerald-400" />
                      <div>
                        <span className="font-semibold text-white">Calendario & Rendimento Gare</span>
                        <span className="text-slate-400 ml-1.5">
                          ({breakdown.fixturesCount} gare, {breakdown.fixturesPlayedCount ?? 0} giocate con marcatori{breakdown.calendarNotesCount ? `, ${breakdown.calendarNotesCount} con note partita` : ''})
                        </span>
                      </div>
                    </div>
                    <span className="font-mono text-slate-300 font-medium">
                      ~{((breakdown.fixturesBytes || 2500) / 1024).toFixed(1)} KB
                    </span>
                  </div>

                  {/* Competitions & Standings */}
                  <div className="p-3 flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <Trophy className="w-4 h-4 text-amber-400" />
                      <div>
                        <span className="font-semibold text-white">Competizioni & Classifica</span>
                        <span className="text-slate-400 ml-1.5">
                          ({breakdown.standingsCount} squadre in campionato, {breakdown.competitionsCount} competizioni)
                        </span>
                      </div>
                    </div>
                    <span className="font-mono text-slate-300 font-medium">
                      ~{(breakdown.standingsBytes / 1024).toFixed(1)} KB
                    </span>
                  </div>

                  {/* Player Growth & Variations */}
                  {breakdown.improvedPlayersCount !== undefined && (
                    <div className="p-3 flex items-center justify-between">
                      <div className="flex items-center space-x-2.5">
                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                        <div>
                          <span className="font-semibold text-white">Sviluppo Rosa & Variazioni</span>
                          <span className="text-slate-400 ml-1.5">
                            ({breakdown.improvedPlayersCount} in crescita{breakdown.declinedPlayersCount ? ` • ${breakdown.declinedPlayersCount} in calo` : ''})
                          </span>
                        </div>
                      </div>
                      <span className="font-mono text-slate-300 font-medium">
                        ~{(((breakdown.growthBytes || 0)) / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  )}

                  {/* Chat History */}
                  <div className="p-3 flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <MessageSquare className="w-4 h-4 text-rose-400" />
                      <div>
                        <span className="font-semibold text-white">Cronologia Messaggi Chat</span>
                        <span className="text-slate-400 ml-1.5">
                          ({breakdown.chatMessagesCount} messaggi in memoria)
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-300 font-medium">
                        ~{(breakdown.chatBytes / 1024).toFixed(1)} KB
                      </span>
                      {breakdown.chatMessagesCount > 4 && (
                        <button
                          onClick={onClearHistory}
                          className="px-2 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] flex items-center gap-1 transition-colors"
                          title="Svuota la cronologia chat per recuperare memoria"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                          Svuota
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Allegati e Screenshot Immediati (One-Off) */}
                  <div className="p-3 flex items-center justify-between border-t border-slate-800/80 bg-slate-950/40">
                    <div className="flex items-center space-x-2.5">
                      <Zap className="w-4 h-4 text-amber-400" />
                      <div>
                        <span className="font-semibold text-white">Screenshot & Allegati Situazionali</span>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Analisi multimodale immediata (non appesantisce i turni successivi)
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Memoria Protetta (One-off)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* Settings & Smart Optimization Controls */
            <div className="space-y-4 animate-fadeIn">
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-1.5">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <Sliders className="w-4 h-4" />
                  Ottimizzazione Dinamica del Payload
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Queste opzioni ti permettono di personalizzare la quantità di dati inviata a Gemini. Se noti rallentamenti o hai importato liste di scouting molto grandi (100+ giocatori), puoi alleggerire la memoria mantenendo inalterata la qualità delle risposte.
                </p>
              </div>

              {/* Setting 0: Context Mode (Smart Focus vs Full Memory) */}
              <div className="bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-950 p-4 rounded-xl border border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-xs sm:text-sm flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-amber-400" />
                      Modalità Analisi Payload
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Consigliata
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 mt-1 leading-relaxed">
                    <strong>Smart Focus (Filtro Intelligente)</strong>: Invia solo i dati e gli attributi strettamente correlati alla domanda (abbatte la latenza fino al 90%). 
                    <strong> Full Memory</strong>: Invia sempre l'intero database di FM (tutti i 60 attributi di 100+ calciatori).
                  </div>
                </div>

                <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-1 shrink-0">
                  <button
                    onClick={() => onChangeConfig({ ...config, contextMode: 'smart' })}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                      config.contextMode !== 'full'
                        ? 'bg-emerald-500 text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Smart Focus (-85% Latenza)
                  </button>
                  <button
                    onClick={() => onChangeConfig({ ...config, contextMode: 'full' })}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      config.contextMode === 'full'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Full Memory
                  </button>
                </div>
              </div>

              {/* Setting 0.1: Speed & Latency Mode (Turbo Thinking vs Deep Reasoning) */}
              <div className="bg-gradient-to-r from-amber-950/30 via-slate-900 to-slate-950 p-4 rounded-xl border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-xs sm:text-sm flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-amber-400" />
                      Velocità di Risposta & Latenza (Thinking Level)
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Risolve la lentezza
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 mt-1 leading-relaxed">
                    <strong>Turbo (Bassa Latenza • Consigliato)</strong>: Avvia la risposta in 1-2 secondi eliminando l'attesa del ragionamento invisibile di Gemini 3.8.
                    <br />
                    <strong>Ragionamento Profondo</strong>: Attende la generazione di migliaia di token di riflessione interna (può richiedere 15-25s).
                  </div>
                </div>

                <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-1 shrink-0">
                  <button
                    onClick={() => onChangeConfig({ ...config, thinkingSpeed: 'turbo' })}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                      config.thinkingSpeed !== 'deep'
                        ? 'bg-amber-400 text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    ⚡ Turbo (1-2s)
                  </button>
                  <button
                    onClick={() => onChangeConfig({ ...config, thinkingSpeed: 'deep' })}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      config.thinkingSpeed === 'deep'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    🧠 Profondo
                  </button>
                </div>
              </div>

              {/* Setting 0.2: AI Engine / Model Selection */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-white text-xs sm:text-sm flex items-center gap-1.5">
                    <Cpu className="w-4 h-4 text-emerald-400" />
                    Motore AI (Modello)
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    <strong>Gemini 3.8 Flash</strong>: Massima completezza e finezza tattica.
                    <br />
                    <strong>Gemini 3.1 Flash Lite</strong>: Velocità estrema (~100 token/sec), ideale per connessioni lente o consultazioni continue.
                  </div>
                </div>

                <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-1 shrink-0">
                  <button
                    onClick={() => onChangeConfig({ ...config, aiModel: 'gemini-3.8-flash' })}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      config.aiModel !== 'gemini-3.1-flash-lite'
                        ? 'bg-emerald-500 text-slate-950 shadow-sm font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    3.8 Flash
                  </button>
                  <button
                    onClick={() => onChangeConfig({ ...config, aiModel: 'gemini-3.1-flash-lite' })}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      config.aiModel === 'gemini-3.1-flash-lite'
                        ? 'bg-emerald-500 text-slate-950 shadow-sm font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    🚀 3.1 Flash Lite
                  </button>
                </div>
              </div>

              {/* Setting 0.3: Streaming Real-time Output */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-white text-xs sm:text-sm flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-teal-400" />
                    Streaming in Tempo Reale
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Mostra le parole non appena generate dal modello, azzerando l'attesa percepita (leggi subito mentre scrive).
                  </div>
                </div>

                <button
                  onClick={() => onChangeConfig({ ...config, enableStreaming: config.enableStreaming === false ? true : false })}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-all shrink-0 ${
                    config.enableStreaming !== false
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {config.enableStreaming !== false ? 'Attivo (Consigliato)' : 'Disattivato (Blocco unico)'}
                </button>
              </div>

              {/* Setting 1: Scouting Detail Mode */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-white text-xs sm:text-sm">
                    Dettaglio Attributi Scouting
                  </div>
                  <div className="text-xs text-slate-400">
                    Scegli se inviare tutti i 60 attributi 1-20 per ogni target o solo la sintesi strategica (CA, PA, Ruolo, Età, Valore).
                  </div>
                </div>

                <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-1 shrink-0">
                  <button
                    onClick={() => onChangeConfig({ ...config, scoutingDetailMode: 'full' })}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      config.scoutingDetailMode === 'full'
                        ? 'bg-emerald-500 text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Completo (1-20 FM)
                  </button>
                  <button
                    onClick={() => onChangeConfig({ ...config, scoutingDetailMode: 'summary' })}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      config.scoutingDetailMode === 'summary'
                        ? 'bg-emerald-500 text-slate-950 shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Sintetico (-60% KB)
                  </button>
                </div>
              </div>

              {/* Setting 2: Include Youth Squads */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-white text-xs sm:text-sm">
                    Includi Vivai & Giovanili
                  </div>
                  <div className="text-xs text-slate-400">
                    Se non stai chiedendo analisi specifiche sui giovani talenti, disattivarlo riduce il payload di ~15-25 KB.
                  </div>
                </div>

                <button
                  onClick={() => onChangeConfig({ ...config, includeYouth: !config.includeYouth })}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-all shrink-0 ${
                    config.includeYouth
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {config.includeYouth ? 'Incluso (Attivo)' : 'Escluso (Leggero)'}
                </button>
              </div>

              {/* Setting 2.1: Include Game Plan / Big Match Tactical Board */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-white text-xs sm:text-sm flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-amber-400" />
                    Modalità Big Match & Analisi Avversario (Piano Gara)
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Invia i profili avversari (CSV), le contromisure tattiche e lo studio del modulo. <strong>Disattivato di default</strong> per non pesare sul payload nelle normali chat (consigliato per finali o big match 2-3 volte l'anno).
                  </div>
                </div>

                <button
                  onClick={() => onChangeConfig({ ...config, includeGamePlan: !config.includeGamePlan })}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold border transition-all shrink-0 ${
                    config.includeGamePlan
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {config.includeGamePlan ? 'Attivo (Big Match)' : 'Disattivato (Default • Leggero)'}
                </button>
              </div>

              {/* Setting 3: Chat History Limit */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-white text-xs sm:text-sm">
                    Profondità Cronologia Chat
                  </div>
                  <div className="text-xs text-slate-400">
                    Limita il numero di messaggi passati inviati ad ogni richiesta per evitare che sessioni lunghe accumulino token.
                  </div>
                </div>

                <select
                  value={config.historyLimit}
                  onChange={(e) => onChangeConfig({ ...config, historyLimit: Number(e.target.value) })}
                  className="bg-slate-900 text-slate-200 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-emerald-500"
                >
                  <option value={6}>Ultimi 6 messaggi (~rapido)</option>
                  <option value={10}>Ultimi 10 messaggi (consigliato)</option>
                  <option value={20}>Ultimi 20 messaggi</option>
                  <option value={0}>Tutti i messaggi (nessun limite)</option>
                </select>
              </div>

              {/* Clear History Button */}
              <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-rose-300">Resetta Cronologia Chat</div>
                  <div className="text-[11px] text-slate-400">
                    Azzera i messaggi della sessione per liberare istantaneamente tutta la memoria chat accumulata.
                  </div>
                </div>
                <button
                  onClick={onClearHistory}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Svuota Chat
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/50 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-emerald-400" />
            <span>Finestra massima Gemini: <strong>1.000.000 di token</strong></span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors"
          >
            Chiudi Diagnostica
          </button>
        </div>
      </div>
    </div>
  );
};
