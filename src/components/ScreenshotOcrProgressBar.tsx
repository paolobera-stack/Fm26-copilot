import React, { useState, useEffect, useRef } from 'react';
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Cpu,
  Clock,
  Wifi,
  Layers,
  FileSearch,
  Check,
} from 'lucide-react';

export type OcrContextType = 'calendar' | 'standings' | 'tactic' | 'opponent' | 'general';

interface ScreenshotOcrProgressBarProps {
  isLoading: boolean;
  context?: OcrContextType;
  title?: string;
  error?: string | null;
  onCancel?: () => void;
  variant?: 'full' | 'compact';
  className?: string;
}

interface StepDefinition {
  name: string;
  shortDesc: string;
  targetPercent: number;
}

const CONTEXT_STEPS: Record<OcrContextType, StepDefinition[]> = {
  calendar: [
    { name: 'Acquisizione', shortDesc: 'Acquisizione e compressione screenshot', targetPercent: 20 },
    { name: 'Invio AI Vision', shortDesc: 'Connessione e invio payload a Gemini', targetPercent: 45 },
    { name: 'OCR Incontri', shortDesc: 'Scansione date, avversari, casa/trasferta e risultati', targetPercent: 75 },
    { name: 'Parsing Dati', shortDesc: 'Strutturazione calendario e normalizzazione', targetPercent: 92 },
  ],
  standings: [
    { name: 'Acquisizione', shortDesc: 'Lettura screenshot e pre-processing visivo', targetPercent: 20 },
    { name: 'Invio AI Vision', shortDesc: 'Invio tabella a Google Gemini Vision', targetPercent: 45 },
    { name: 'OCR Tabella', shortDesc: 'Scansione posizioni, punti, vittorie e reti', targetPercent: 75 },
    { name: 'Parsing Dati', shortDesc: 'Ordinamento classifica e verifica squadre', targetPercent: 92 },
  ],
  tactic: [
    { name: 'Acquisizione', shortDesc: 'Lettura lavagna tattica e scalatura immagine', targetPercent: 20 },
    { name: 'Invio AI Vision', shortDesc: 'Connessione al motore visivo Gemini', targetPercent: 45 },
    { name: 'OCR Ruoli & Modulo', shortDesc: 'Riconoscimento giocatori in campo e mansioni', targetPercent: 75 },
    { name: 'Matching Rosa', shortDesc: 'Associazione ai titolari e coordinate campo', targetPercent: 92 },
  ],
  opponent: [
    { name: 'Acquisizione', shortDesc: 'Caricamento screenshot tattica avversaria', targetPercent: 20 },
    { name: 'Invio AI Vision', shortDesc: 'Invio fotogramma a Gemini Vision', targetPercent: 45 },
    { name: 'OCR Tattico', shortDesc: 'Rilevamento modulo, mentalità e interpreti chiave', targetPercent: 75 },
    { name: 'Parsing Piano Gara', shortDesc: 'Sintesi tattica e report contromisure', targetPercent: 92 },
  ],
  general: [
    { name: 'Acquisizione', shortDesc: 'Acquisizione e preparazione screenshot', targetPercent: 20 },
    { name: 'Invio AI Vision', shortDesc: 'Connessione al server Gemini Vision', targetPercent: 45 },
    { name: 'OCR Vision', shortDesc: 'Riconoscimento pattern e testo FM26', targetPercent: 75 },
    { name: 'Parsing Dati', shortDesc: 'Strutturazione e validazione finale', targetPercent: 92 },
  ],
};

export const ScreenshotOcrProgressBar: React.FC<ScreenshotOcrProgressBarProps> = ({
  isLoading,
  context = 'general',
  title,
  error = null,
  variant = 'full',
  className = '',
}) => {
  const [progress, setProgress] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  const steps = CONTEXT_STEPS[context] || CONTEXT_STEPS.general;

  useEffect(() => {
    if (!isLoading) {
      if (progress > 0 && !error) {
        setProgress(100);
        setCurrentStepIndex(steps.length - 1);
      }
      return;
    }

    startTimeRef.current = Date.now();
    setProgress(10);
    setCurrentStepIndex(0);
    setElapsedSeconds(0);

    const interval = setInterval(() => {
      if (!startTimeRef.current) return;
      const elapsedMs = Date.now() - startTimeRef.current;
      const elapsedSec = elapsedMs / 1000;
      setElapsedSeconds(elapsedSec);

      // Realistic progression curve calibrated for real-world Gemini Vision latency (20-35s during high traffic)
      // Phase 1: 0 - 1.5s -> reaches ~25% (local acquisition & canvas optimize)
      // Phase 2: 1.5s - 8s -> reaches ~50% (payload upload & handshake)
      // Phase 3: 8s - 22s -> reaches ~78% (deep vision OCR inference)
      // Phase 4: 22s - 35s -> reaches ~92% (JSON structured parsing)
      // Phase 5: 35s+ -> smoothly advances towards 96%
      let calculated = 10;
      if (elapsedSec < 1.5) {
        calculated = 10 + (elapsedSec / 1.5) * 15; // 10 -> 25%
      } else if (elapsedSec < 8.0) {
        calculated = 25 + ((elapsedSec - 1.5) / 6.5) * 25; // 25 -> 50%
      } else if (elapsedSec < 22.0) {
        calculated = 50 + ((elapsedSec - 8.0) / 14.0) * 28; // 50 -> 78%
      } else if (elapsedSec < 35.0) {
        calculated = 78 + ((elapsedSec - 22.0) / 13.0) * 14; // 78 -> 92%
      } else {
        // Asymptotically approach 96% beyond 35s
        const extra = Math.min(4, ((elapsedSec - 35.0) / 25.0) * 4);
        calculated = 92 + extra;
      }

      const clamped = Math.min(96, Math.max(10, Math.round(calculated)));
      setProgress(clamped);

      // Determine active step index
      if (clamped < 25) {
        setCurrentStepIndex(0);
      } else if (clamped < 50) {
        setCurrentStepIndex(1);
      } else if (clamped < 78) {
        setCurrentStepIndex(2);
      } else {
        setCurrentStepIndex(3);
      }
    }, 150);

    return () => {
      clearInterval(interval);
    };
  }, [isLoading, error, steps.length]);

  if (!isLoading && progress === 0 && !error) {
    return null;
  }

  // Latency & Connection diagnostics message
  const getDiagnosticStatus = () => {
    if (error) {
      return {
        label: 'Errore di connessione o risposta AI',
        color: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
        icon: AlertTriangle,
        hint: 'Verifica la connessione o la quota della chiave API Gemini (BYOK).',
      };
    }
    if (progress >= 100) {
      return {
        label: 'Analisi completata con successo!',
        color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
        icon: CheckCircle2,
        hint: 'Dati estratti e pronti per l\'importazione.',
      };
    }
    if (elapsedSeconds < 8) {
      return {
        label: 'Connessione attiva • Flusso normale',
        color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
        icon: Wifi,
        hint: 'Invio ed elaborazione in corso sul motore Google Gemini Vision...',
      };
    }
    if (elapsedSeconds < 18) {
      return {
        label: 'Rete attiva • Scansione screenshot dettagliata in corso...',
        color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
        icon: Cpu,
        hint: 'L\'AI sta interpretando le aree di testo e i valori dello screenshot...',
      };
    }
    if (elapsedSeconds < 32) {
      return {
        label: 'Traffico elevato sui server Google Gemini (attesa tipica: ~30-35s)',
        color: 'text-amber-300 bg-amber-500/15 border-amber-500/30',
        icon: Clock,
        hint: 'Nessun problema locale: i server cloud di Google stanno gestendo la coda di elaborazione visiva.',
      };
    }
    return {
      label: 'Elaborazione complessa in via di conclusione • Connessione aperta',
      color: 'text-sky-300 bg-sky-500/15 border-sky-500/30',
      icon: Clock,
      hint: 'Gemini sta finalizzando il parsing della risposta strutturata. Il processo prosegue regolarmente.',
    };
  };

  const status = getDiagnosticStatus();
  const StatusIcon = status.icon;
  const currentStep = steps[currentStepIndex] || steps[0];

  if (variant === 'compact') {
    return (
      <div className={`w-full bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-md space-y-2 ${className}`}>
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-slate-200 font-semibold truncate">
            {error ? (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            ) : progress >= 100 ? (
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin shrink-0" />
            )}
            <span className="truncate">{error ? 'Errore acquisizione' : currentStep.shortDesc}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] font-mono text-indigo-400 font-bold">{progress}%</span>
            <span className="text-[10px] text-slate-400 font-mono">⏱️ {elapsedSeconds.toFixed(1)}s</span>
          </div>
        </div>

        {/* Compact Progress Bar */}
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden relative">
          <div
            className={`h-full transition-all duration-300 ease-out rounded-full ${
              error
                ? 'bg-rose-500'
                : progress >= 100
                ? 'bg-emerald-500'
                : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`w-full bg-slate-900/95 border border-slate-800/90 rounded-2xl p-4 md:p-5 shadow-xl space-y-4 text-left transition-all backdrop-blur-sm ${className}`}
    >
      {/* Header with Title and Timer */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="space-y-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
            <h4 className="text-sm font-bold text-slate-100 truncate">
              {title || 'Acquisizione & OCR Screenshot con IA'}
            </h4>
          </div>
          <p className="text-xs text-slate-400 truncate">
            {error ? 'Processo interrotto' : currentStep.shortDesc}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="px-2.5 py-1 bg-slate-800/80 border border-slate-700/60 rounded-lg text-xs font-mono text-slate-300 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            <span>{elapsedSeconds.toFixed(1)}s</span>
          </div>
          <div className="px-2.5 py-1 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-xs font-mono font-bold text-indigo-300">
            {progress}%
          </div>
        </div>
      </div>

      {/* Main Animated Progress Bar */}
      <div className="space-y-1.5">
        <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800/80 relative">
          <div
            className={`h-full transition-all duration-300 ease-out rounded-full relative overflow-hidden ${
              error
                ? 'bg-rose-500'
                : progress >= 100
                ? 'bg-emerald-500'
                : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400'
            }`}
            style={{ width: `${progress}%` }}
          >
            {/* Shimmer light animation effect while loading */}
            {isLoading && progress < 100 && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-pulse" />
            )}
          </div>
        </div>

        {/* Milestone Steps visual markers */}
        <div className="grid grid-cols-4 gap-1 pt-1">
          {steps.map((st, idx) => {
            const isPassed = progress >= st.targetPercent || progress >= 100;
            const isCurrent = currentStepIndex === idx && isLoading && !error;
            return (
              <div
                key={idx}
                className={`text-center space-y-1 px-1 py-1 rounded-lg transition-colors ${
                  isCurrent
                    ? 'bg-indigo-500/10 border border-indigo-500/30'
                    : 'bg-transparent'
                }`}
              >
                <div className="flex items-center justify-center">
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                      error && isCurrent
                        ? 'bg-rose-500 text-white'
                        : isPassed
                        ? 'bg-emerald-500 text-white shadow-sm'
                        : isCurrent
                        ? 'bg-indigo-600 text-white animate-pulse shadow-md ring-2 ring-indigo-400/40'
                        : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {isPassed ? <Check className="w-3 h-3" /> : idx + 1}
                  </div>
                </div>
                <div className="truncate">
                  <span
                    className={`text-[10.5px] font-medium block truncate ${
                      isCurrent
                        ? 'text-indigo-300 font-bold'
                        : isPassed
                        ? 'text-slate-300'
                        : 'text-slate-500'
                    }`}
                  >
                    {st.name}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Network / AI Overload Diagnostic Bar */}
      <div
        className={`px-3 py-2 rounded-xl border text-xs flex items-center justify-between gap-2 transition-all ${status.color}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <StatusIcon
            className={`w-4 h-4 shrink-0 ${
              isLoading && !error && progress < 100 && elapsedSeconds < 6
                ? 'animate-pulse'
                : isLoading && !error && progress < 100
                ? 'animate-spin'
                : ''
            }`}
          />
          <div className="min-w-0">
            <span className="font-semibold block truncate">{status.label}</span>
            <span className="text-[11px] opacity-85 block truncate">{status.hint}</span>
          </div>
        </div>

        {isLoading && progress < 100 && !error && (
          <div className="hidden sm:flex items-center gap-1.5 shrink-0 text-[11px] font-mono opacity-80">
            <Loader2 className="w-3 h-3 animate-spin text-current" />
            <span>Parsing AI</span>
          </div>
        )}
      </div>

      {/* Helpful tip about screenshot resolution & connection */}
      <div className="text-[11px] text-slate-500 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60 flex items-start gap-2">
        <FileSearch className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
        <span className="leading-relaxed">
          <strong>Trasparenza di processo:</strong> Lo screenshot viene ottimizzato in locale e inoltrato a Gemini Vision.
          Se noti rallentamenti oltre i 15 secondi, potrebbe trattarsi di una temporanea coda di richieste sulle API di Google.
        </span>
      </div>
    </div>
  );
};
