import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  Copy,
  Check,
  X,
  Minus,
  Square,
  Play,
  RotateCcw,
  Zap,
  Cpu,
  Wifi,
  ExternalLink,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import { getApiHeaders, hasCustomApiKey } from '../utils/apiKeyStorage';
import { safeFetchJson } from '../utils/apiUtils';

interface GeminiPingCmdModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenApiKeyModal?: () => void;
}

interface PingPacket {
  seq: number;
  success: boolean;
  ip?: string;
  bytes?: number;
  rtt: number;
  ttl?: number;
  status?: number;
  httpStatus?: number;
  error?: string;
  model?: string;
  tokens?: number;
  reply?: string;
  isQuota?: boolean;
  isHighDemand?: boolean;
}

interface PingStats {
  transmitted: number;
  received: number;
  lost: number;
  lossPercent: number;
  minRtt: number;
  maxRtt: number;
  avgRtt: number;
}

interface PingResponse {
  type: 'network' | 'ai';
  target: string;
  ip?: string;
  packets: PingPacket[];
  stats: PingStats;
  error?: string;
}

const DEFAULT_BANNER = `Microsoft Windows [Versione 10.0.19045.3803]
(c) Microsoft Corporation. Tutti i diritti riservati.

`;

export const GeminiPingCmdModal: React.FC<GeminiPingCmdModalProps> = ({
  isOpen,
  onClose,
  onOpenApiKeyModal,
}) => {
  const [terminalLines, setTerminalLines] = useState<string[]>([
    DEFAULT_BANNER,
    `C:\\FM26\\Northampton> `,
  ]);
  const [commandInput, setCommandInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [activeMode, setActiveMode] = useState<'network' | 'ai'>('network');

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalLines]);

  if (!isOpen) return null;

  const appendLine = (text: string) => {
    setTerminalLines(prev => [...prev, text]);
  };

  const executePing = async (type: 'network' | 'ai' = 'network', count: number = 4) => {
    if (isRunning) return;
    setIsRunning(true);
    setActiveMode(type);

    const targetLabel = type === 'network' ? 'generativelanguage.googleapis.com' : 'gemini-3.8-flash';
    const cmdText = type === 'network'
      ? `ping generativelanguage.googleapis.com -n ${count}`
      : `ping ${targetLabel} --ai-probe -n ${count}`;

    // Update current prompt line with command
    setTerminalLines(prev => {
      const copy = [...prev];
      if (copy.length > 0 && copy[copy.length - 1].startsWith('C:\\FM26\\Northampton>')) {
        copy[copy.length - 1] = `C:\\FM26\\Northampton> ${cmdText}`;
      } else {
        copy.push(`C:\\FM26\\Northampton> ${cmdText}`);
      }
      return copy;
    });

    appendLine('');

    if (type === 'ai' && !hasCustomApiKey()) {
      appendLine(`[ERRORE 0x80070005]: Chiave Google Gemini API (BYOK) non trovata.`);
      appendLine(`Per testare l'inferenza AI è necessario configurare la tua chiave personale.`);
      appendLine(`Digita 'key' o clicca il pulsante in basso per inserire la chiave gratuita.`);
      appendLine('');
      appendLine('C:\\FM26\\Northampton> ');
      setIsRunning(false);
      return;
    }

    if (type === 'network') {
      appendLine(`Esecuzione di Ping verso generativelanguage.googleapis.com con 32 byte di dati:`);
    } else {
      appendLine(`Esecuzione di Ping Inferenza verso motore AI [${targetLabel}] con probe testuale:`);
    }

    try {
      const data = await safeFetchJson<PingResponse>('/api/gemini/ping', {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          type,
          host: 'generativelanguage.googleapis.com',
          model: 'gemini-3.8-flash',
          count,
        }),
      });

      if (data.error) {
        appendLine(`Errore generale: ${data.error}`);
      } else if (data.packets && data.packets.length > 0) {
        // Stream packet results line by line with authentic delay
        for (let i = 0; i < data.packets.length; i++) {
          await new Promise(r => setTimeout(r, 180));
          const p = data.packets[i];

          if (type === 'network') {
            if (p.success) {
              appendLine(`Risposta da ${p.ip || data.ip || '172.217.112.4'}: byte=${p.bytes || 32} tempo=${p.rtt}ms TTL=${p.ttl || 116}`);
            } else {
              appendLine(`Richiesta scaduta (Timeout) per ${p.ip || data.ip || 'host'}: tempo=${p.rtt}ms`);
            }
          } else {
            // AI probe packet
            if (p.success) {
              appendLine(`Risposta da Gemini [${p.model}]: HTTP 200 OK • latenza inferenza=${p.rtt}ms • token=${p.tokens || 2}`);
            } else if (p.isQuota) {
              appendLine(`Risposta da Gemini [${p.model}]: HTTP 429 Quota Raggiunta • ${p.error || 'Limite temporaneo attivo'}`);
            } else if (p.isHighDemand) {
              appendLine(`Risposta da Gemini [${p.model}]: HTTP 503 Sovraccarico Server • Traffico elevato su Google Gemini (riprova tra ${p.rtt}ms)`);
            } else {
              appendLine(`Risposta da Gemini [${p.model}]: HTTP ${p.status || 500} Errore • ${p.error || 'Mancata risposta'}`);
            }
          }
        }

        // Print stats block
        appendLine('');
        const targetIpOrModel = data.ip || targetLabel;
        appendLine(`Statistiche Ping per ${targetIpOrModel}:`);
        appendLine(`    Pacchetti: Trasmessi = ${data.stats.transmitted}, Ricevuti = ${data.stats.received}, Persi = ${data.stats.lost} (${data.stats.lossPercent}% persi),`);

        if (data.stats.received > 0) {
          appendLine(`Tempo approssimativo percorsi andata/ritorno in millisecondi:`);
          appendLine(`    Minimo = ${data.stats.minRtt}ms, Massimo = ${data.stats.maxRtt}ms, Medio = ${data.stats.avgRtt}ms`);
          appendLine('');

          // Diagnostic summary
          if (type === 'network') {
            if (data.stats.avgRtt < 80) {
              appendLine(`[DIAGNOSTICA]: 🟢 Connessione di Rete ECCELLENTE (<80ms). I server Google rispondono istantaneamente.`);
            } else if (data.stats.avgRtt < 300) {
              appendLine(`[DIAGNOSTICA]: 🟡 Latenza di Rete NORMALE (${data.stats.avgRtt}ms). Connessione stabile.`);
            } else {
              appendLine(`[DIAGNOSTICA]: 🟠 Latenza di Rete ELEVATA (>300ms). Possibili rallentamenti sulla tratta internet.`);
            }
          } else {
            if (data.stats.lossPercent === 0) {
              appendLine(`[DIAGNOSTICA]: 🟢 Motore AI Gemini OPERATIVO. Tempo risposta inferenza: ${data.stats.avgRtt}ms.`);
            } else {
              appendLine(`[DIAGNOSTICA]: ⚠️ Riscontrate anomalie o limitazioni di quota nel motore AI.`);
            }
          }
        } else {
          appendLine('');
          appendLine(`[DIAGNOSTICA]: 🔴 Nessun pacchetto ricevuto. Verificare connessione internet o stato server.`);
        }
      }
    } catch (err: any) {
      appendLine(`[ERRORE DI TRASPORTO]: ${err?.message || 'Impossibile completare la chiamata'}`);
    } finally {
      appendLine('');
      appendLine('C:\\FM26\\Northampton> ');
      setIsRunning(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isRunning) return;
    const cmd = commandInput.trim();
    setCommandInput('');

    if (!cmd) {
      appendLine('C:\\FM26\\Northampton> ');
      return;
    }

    const lower = cmd.toLowerCase();

    if (lower === 'cls' || lower === 'clear') {
      setTerminalLines([
        DEFAULT_BANNER,
        'C:\\FM26\\Northampton> ',
      ]);
      return;
    }

    if (lower === 'exit') {
      onClose();
      return;
    }

    if (lower === 'key' || lower === 'apikey') {
      if (onOpenApiKeyModal) {
        onOpenApiKeyModal();
        appendLine(`C:\\FM26\\Northampton> ${cmd}`);
        appendLine(`Apertura modale di configurazione Google Gemini API Key...`);
        appendLine('');
        appendLine('C:\\FM26\\Northampton> ');
      }
      return;
    }

    if (lower === 'help' || lower === '?') {
      appendLine(`C:\\FM26\\Northampton> ${cmd}`);
      appendLine('');
      appendLine('COMANDI PING & DIAGNOSTICA DISPONIBILI:');
      appendLine('  ping                        Esegue ping di rete standard (4 pacchetti, 0 quota)');
      appendLine('  ping -n 1                   Esegue ping rapido di rete a pacchetto singolo');
      appendLine('  ping --ai                   Testa inferenza e reattività reale del modello Gemini (1 token)');
      appendLine('  key                         Apre la schermata di configurazione Google Gemini API Key');
      appendLine('  cls                         Pulisce lo schermo del terminale');
      appendLine('  exit                        Chiude la finestra del prompt dei comandi');
      appendLine('');
      appendLine('C:\\FM26\\Northampton> ');
      return;
    }

    if (lower.startsWith('ping')) {
      const isAi = lower.includes('--ai') || lower.includes('-ai') || lower.includes('ai');
      let count = 4;
      const countMatch = cmd.match(/-n\s+(\d+)/i);
      if (countMatch && countMatch[1]) {
        count = parseInt(countMatch[1], 10);
      } else if (isAi) {
        count = 1; // Default to 1 for AI to be quota-friendly
      }
      executePing(isAi ? 'ai' : 'network', Math.min(Math.max(count, 1), 4));
      return;
    }

    // Unrecognized command
    appendLine(`C:\\FM26\\Northampton> ${cmd}`);
    appendLine(`"${cmd}" non è riconosciuto come comando interno o esterno,`);
    appendLine(`un programma eseguibile o un file batch.`);
    appendLine(`Digita 'help' per consultare l'elenco dei comandi disponibili.`);
    appendLine('');
    appendLine('C:\\FM26\\Northampton> ');
  };

  const handleCopyOutput = () => {
    const text = terminalLines.join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-sm animate-fadeIn">
      {/* Windows CMD Container */}
      <div
        className={`bg-[#0c0c0c] border border-slate-700/80 rounded-lg shadow-2xl flex flex-col overflow-hidden text-[#cccccc] font-mono transition-all duration-200 ${
          isMaximized ? 'w-full h-full max-w-none rounded-none' : 'w-full max-w-3xl h-[620px] max-h-[92vh]'
        }`}
        style={{
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.95), 0 0 0 1px rgba(255, 255, 255, 0.08)',
        }}
      >
        {/* Windows CMD Classic Title Bar */}
        <div className="bg-[#1f1f1f] text-slate-200 px-3 py-1.5 flex items-center justify-between border-b border-black select-none shrink-0">
          <div className="flex items-center space-x-2 text-xs">
            {/* Windows Command Prompt Icon */}
            <div className="w-4 h-4 bg-black border border-slate-500 rounded-xs flex items-center justify-center text-[9px] font-black text-slate-100 font-mono">
              &gt;_
            </div>
            <span className="font-sans font-medium text-slate-300 text-[11px] sm:text-xs tracking-tight">
              Prompt dei comandi - ping generativelanguage.googleapis.com
            </span>
          </div>

          {/* Classic Windows Window Controls */}
          <div className="flex items-center space-x-1">
            <button
              onClick={() => {}}
              className="w-7 h-5 flex items-center justify-center hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              title="Riduci a icona"
            >
              <Minus className="w-3 h-3" />
            </button>
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className="w-7 h-5 flex items-center justify-center hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              title={isMaximized ? "Ripristina" : "Ingrandisci"}
            >
              <Square className="w-2.5 h-2.5" />
            </button>
            <button
              onClick={onClose}
              className="w-9 h-5 flex items-center justify-center hover:bg-rose-600 text-slate-400 hover:text-white transition-colors"
              title="Chiudi (exit)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Quick Toolbar */}
        <div className="bg-[#181818] px-3 py-1.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs font-sans shrink-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => executePing('network', 4)}
              disabled={isRunning}
              className="px-2.5 py-1 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-medium flex items-center gap-1 transition-all disabled:opacity-50 cursor-pointer"
              title="Esegue un ping reale di rete (4 pacchetti) verso i server Google Gemini. ZERO quota consumata."
            >
              <Wifi className="w-3 h-3 text-emerald-400" />
              <span>Ping Rete (Zero Quota)</span>
            </button>

            <button
              onClick={() => executePing('ai', 1)}
              disabled={isRunning}
              className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-medium flex items-center gap-1 transition-all disabled:opacity-50 cursor-pointer"
              title="Invia un micro-probe di 1 token al modello Gemini per testare l'inferenza e le quote attive."
            >
              <Cpu className="w-3 h-3 text-amber-400" />
              <span>Test Inferenza AI (1 probe)</span>
            </button>

            <button
              onClick={() => {
                setTerminalLines([DEFAULT_BANNER, 'C:\\FM26\\Northampton> ']);
              }}
              disabled={isRunning}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer"
              title="Pulisce lo schermo del terminale (cls)"
            >
              <RotateCcw className="w-3 h-3" />
              <span>cls</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCopyOutput}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer"
              title="Copia tutto il testo del terminale negli appunti"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? 'Copiato!' : 'Copia'}</span>
            </button>
          </div>
        </div>

        {/* Terminal Body Screen */}
        <div
          className="flex-1 p-3 sm:p-4 overflow-y-auto text-[12px] sm:text-[13px] leading-snug bg-black select-text font-mono cursor-text"
          onClick={() => inputRef.current?.focus()}
        >
          {terminalLines.map((line, idx) => {
            const isError = line.includes('[ERRORE') || line.includes('Errore') || line.includes('Scaduta') || line.includes('429') || line.includes('503');
            const isSuccess = line.includes('Risposta da') || line.includes('🟢');
            const isWarning = line.includes('🟡') || line.includes('🟠');
            const isHeading = line.startsWith('Esecuzione di Ping') || line.startsWith('Statistiche Ping');

            return (
              <div
                key={idx}
                className={`whitespace-pre-wrap ${
                  isError
                    ? 'text-rose-400'
                    : isSuccess
                    ? 'text-emerald-300'
                    : isWarning
                    ? 'text-amber-300'
                    : isHeading
                    ? 'text-white font-bold'
                    : 'text-[#cccccc]'
                }`}
              >
                {line}
              </div>
            );
          })}

          {/* Interactive Command Line Prompt */}
          <form onSubmit={handleCommandSubmit} className="flex items-center mt-1">
            <span className="text-[#cccccc] whitespace-pre mr-1">C:\FM26\Northampton&gt;</span>
            <input
              ref={inputRef}
              type="text"
              value={commandInput}
              onChange={e => setCommandInput(e.target.value)}
              disabled={isRunning}
              className="flex-1 bg-transparent border-0 outline-none text-[#ffffff] font-mono text-[12px] sm:text-[13px] p-0 caret-white focus:ring-0"
              placeholder={isRunning ? 'Elaborazione ping in corso...' : 'Digita comando (es. ping, ping --ai, cls, help)...'}
              autoFocus
            />
            {isRunning && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400 ml-2 shrink-0" />
            )}
          </form>

          <div ref={bottomRef} />
        </div>

        {/* Terminal Bottom Status Bar */}
        <div className="bg-[#141414] px-3 py-1 border-t border-slate-800 text-[11px] font-sans text-slate-400 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`} />
              <span>{isRunning ? 'Esecuzione pacchetti...' : 'Terminale Pronto'}</span>
            </span>
            <span className="text-slate-600">|</span>
            <span className="hidden sm:inline">Host: <span className="font-mono text-slate-300">generativelanguage.googleapis.com</span></span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500">Premi Invio per eseguire</span>
            <button
              onClick={onClose}
              className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              Chiudi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
