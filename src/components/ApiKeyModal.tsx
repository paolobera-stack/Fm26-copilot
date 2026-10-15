import React, { useState, useEffect } from 'react';
import { Key, ShieldCheck, ExternalLink, Check, AlertCircle, Trash2, Eye, EyeOff, Sparkles, X, Loader2, Info, Terminal } from 'lucide-react';
import { getCustomApiKey, setCustomApiKey, removeCustomApiKey } from '../utils/apiKeyStorage';
import { safeFetchJson } from '../utils/apiUtils';

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeySaved?: () => void;
  onOpenPingModal?: () => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onClose, onKeySaved, onOpenPingModal }) => {
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const current = getCustomApiKey();
      setSavedKey(current);
      setApiKeyInput(current || '');
      setStatusMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleValidateAndSave = async () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setStatusMessage({ type: 'error', text: 'Inserisci una chiave API valida prima di salvare.' });
      return;
    }

    if (!trimmed.startsWith('AIza') && trimmed.length < 20) {
      setStatusMessage({
        type: 'error',
        text: 'Il formato della chiave non sembra valido (le chiavi Google Gemini iniziano solitamente con "AIza").'
      });
      return;
    }

    setIsValidating(true);
    setStatusMessage({ type: 'info', text: 'Verifica della chiave in corso con i server Google...' });

    try {
      const data = await safeFetchJson<{ success?: boolean; error?: string }>('/api/gemini/validate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: trimmed }),
      });

      if (data.success) {
        setCustomApiKey(trimmed);
        setSavedKey(trimmed);
        setStatusMessage({
          type: 'success',
          text: 'Chiave verificata e salvata con successo! Le tue richieste useranno la tua quota personale.'
        });
        if (onKeySaved) onKeySaved();
      } else {
        setStatusMessage({
          type: 'error',
          text: data.error || 'La chiave inserita non è stata accettata da Google Gemini. Controlla che sia corretta e attiva.'
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Errore durante la connessione al server: ${err.message || 'Impossibile verificare la chiave.'}`
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleRemoveKey = () => {
    removeCustomApiKey();
    setSavedKey(null);
    setApiKeyInput('');
    setStatusMessage({
      type: 'info',
      text: 'Chiave personale rimossa. Le funzionalità IA saranno disattivate finché non inserirai una nuova chiave personale.'
    });
    if (onKeySaved) onKeySaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div
        id="api-key-modal"
        className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden text-slate-100 relative"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-inner">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Chiave API Personale (Obbligatoria)
              </h2>
              <p className="text-xs text-slate-400">
                Inserisci la tua Google Gemini API Key per attivare il Co-Allenatore, l'OCR e le analisi tattiche
              </p>
            </div>
          </div>
          <button
            id="close-api-key-modal-btn"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            aria-label="Chiudi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Current Status Pill */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800">
            <span className="text-xs text-slate-400 font-medium">Stato Configurazione IA:</span>
            {savedKey ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <ShieldCheck className="w-3.5 h-3.5" />
                Chiave Personale Attiva (Tutto Sbloccato)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                <AlertCircle className="w-3.5 h-3.5" />
                Nessuna Chiave (Funzionalità IA Bloccate)
              </span>
            )}
          </div>

          {/* Explanation Box */}
          <div className="p-3.5 rounded-xl bg-blue-950/20 border border-blue-500/20 text-xs text-blue-200/90 space-y-2">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-blue-300">Modalità Obbligatoria BYOK (Bring Your Own Key)</p>
                <p className="mt-0.5 text-slate-300 leading-relaxed">
                  Per utilizzare questa applicazione senza costi di hosting o interruzioni, <strong>ogni manager deve fornire la propria API Key di Google Gemini</strong>.
                </p>
              </div>
            </div>
            <ul className="text-slate-300 text-[11px] space-y-1 pl-6 list-disc">
              <li><strong>100% Gratuito</strong>: Google AI Studio offre un generoso piano gratuito per le API Gemini senza carta di credito obbligatoria.</li>
              <li><strong>Privacy Totale</strong>: La tua chiave viene conservata unicamente nella memoria locale del tuo browser (<code className="text-amber-300">localStorage</code>) e mai condivisa o registrata in database.</li>
              <li><strong>Nessun limite condiviso</strong>: La tua quota è solo tua, al riparo dal traffico di altri utenti.</li>
            </ul>
          </div>

          {/* Steps */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2">
            <span className="text-xs font-bold text-slate-200 block">Come ottenere la tua chiave in 3 passaggi:</span>
            <ol className="text-xs text-slate-300 space-y-1.5 list-decimal pl-4">
              <li>
                Accedi a{' '}
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-400 hover:text-emerald-300 underline font-medium inline-flex items-center gap-1"
                >
                  Google AI Studio API Keys
                  <ExternalLink className="w-3 h-3" />
                </a>{' '}
                con il tuo account Google.
              </li>
              <li>Clicca sul pulsante blu <strong>"Create API Key"</strong> (o "Get API key").</li>
              <li>Copia la chiave generata (inizia con <code>AIzaSy...</code>) e incollala nel riquadro qui sotto.</li>
            </ol>
          </div>

          {/* Form */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-200" htmlFor="gemini-api-key-input">
              Google Gemini API Key
            </label>
            <div className="relative flex items-center">
              <input
                id="gemini-api-key-input"
                type={showKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="Incolla qui la tua chiave (es. AIzaSy...)"
                disabled={isValidating}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 pr-20 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent font-mono"
              />
              <div className="absolute right-2 flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                  title={showKey ? 'Nascondi chiave' : 'Mostra chiave'}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
              <span>Non hai una chiave Gemini?</span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 hover:text-emerald-300 underline font-medium inline-flex items-center gap-1"
              >
                Ottienine una gratis su Google AI Studio
                <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </div>

          {/* Feedback message */}
          {statusMessage && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                  : statusMessage.type === 'error'
                  ? 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                  : 'bg-blue-950/30 border-blue-500/40 text-blue-300'
              }`}
            >
              {statusMessage.type === 'success' && <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />}
              {statusMessage.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />}
              {statusMessage.type === 'info' && <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />}
              <span className="leading-relaxed">{statusMessage.text}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          {savedKey ? (
            <button
              id="remove-api-key-btn"
              type="button"
              onClick={handleRemoveKey}
              disabled={isValidating}
              className="w-full sm:w-auto px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-rose-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Rimuovi Chiave
            </button>
          ) : (
            <div className="text-[11px] text-amber-400/80 hidden sm:flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Inserisci la chiave per attivare il Co-Allenatore</span>
            </div>
          )}

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {onOpenPingModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenPingModal();
                }}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border border-emerald-500/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer font-mono"
                title="Apri il terminale CMD per verificare il ping di rete o testare l'inferenza AI verso Google Gemini"
              >
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span>&gt;_ Ping CMD</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={isValidating}
              className="w-1/2 sm:w-auto px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Chiudi
            </button>
            <button
              id="save-api-key-btn"
              type="button"
              onClick={handleValidateAndSave}
              disabled={isValidating || !apiKeyInput.trim()}
              className="w-1/2 sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {isValidating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Verifica in corso...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Verifica e Salva
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
