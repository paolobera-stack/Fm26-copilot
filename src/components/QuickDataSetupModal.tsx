import React, { useState } from 'react';
import { Player, TacticPreset, Fixture, ScoutingTarget, SeasonPhaseInfo, StandingsRow, YouthSquad, SeasonHistoryEntry, ArchivedSeasonCalendar, GamePlanState } from '../types';
import { Settings, RefreshCw, Download, Upload, Check, X, FileSpreadsheet, Key } from 'lucide-react';
import { ConfirmDialogModal } from './ConfirmDialogModal';

interface QuickDataSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  players: Player[];
  tactic: TacticPreset;
  fixtures: Fixture[];
  targets: ScoutingTarget[];
  phaseInfo: SeasonPhaseInfo;
  standings?: StandingsRow[];
  youthSquads?: YouthSquad[];
  historyAwards?: SeasonHistoryEntry[];
  archivedCalendars?: ArchivedSeasonCalendar[];
  teamName?: string;
  tactics?: TacticPreset[];
  activeTacticIndex?: number;
  gamePlan?: GamePlanState;
  onResetToDefaults: () => void;
  onImportData: (data: {
    players: Player[];
    tactic: TacticPreset;
    tactics?: TacticPreset[];
    activeTacticIndex?: number;
    fixtures: Fixture[];
    targets: ScoutingTarget[];
    phaseInfo: SeasonPhaseInfo;
    standings?: StandingsRow[];
    youthSquads?: YouthSquad[];
    historyAwards?: SeasonHistoryEntry[];
    archivedCalendars?: ArchivedSeasonCalendar[];
    teamName?: string;
    gamePlan?: GamePlanState;
  }) => void;
  onOpenCsvModal?: (type: 'squad' | 'scouting') => void;
  onOpenApiKeyModal?: () => void;
}

export const QuickDataSetupModal: React.FC<QuickDataSetupModalProps> = ({
  isOpen,
  onClose,
  players,
  tactic,
  tactics,
  activeTacticIndex,
  fixtures,
  targets,
  phaseInfo,
  standings,
  youthSquads,
  historyAwards,
  archivedCalendars,
  teamName,
  gamePlan,
  onResetToDefaults,
  onImportData,
  onOpenCsvModal,
  onOpenApiKeyModal,
}) => {
  const [jsonInput, setJsonInput] = useState('');
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  if (!isOpen) return null;

  const handleExport = () => {
    const data = {
      teamName,
      players,
      youthSquads,
      tactic,
      tactics,
      activeTacticIndex,
      fixtures,
      targets,
      phaseInfo,
      standings,
      historyAwards,
      archivedCalendars,
      gamePlan
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FM26_${(teamName || 'Save').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };



  const handleImport = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      if (parsed.players && (parsed.tactic || parsed.tactics) && parsed.fixtures) {
        onImportData(parsed);
        alert('Dati di carriera importati con successo!');
        onClose();
      } else {
        alert('Formato JSON non valido. Assicurati che contenga i campi della rosa e tattiche.');
      }
    } catch (e: any) {
      alert(`Errore nell'importazione JSON: ${e.message}`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        setJsonInput(content);
        const parsed = JSON.parse(content);
        if (parsed.players || parsed.tactic || parsed.tactics || parsed.fixtures) {
          onImportData(parsed);
          alert('Dati di carriera importati direttamente dal file JSON!');
          onClose();
        } else {
          alert('File JSON letto ma non contiene i campi della carriera. Verificare la struttura.');
        }
      } catch (err: any) {
        alert(`Errore durante la lettura del file JSON: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };


  const handleConfirmReset = () => {
    onResetToDefaults();
    setIsResetConfirmOpen(false);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-xl w-full shadow-2xl space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2">
              <Settings className="w-5 h-5 text-emerald-400" />
              <h3 className="font-bold text-white text-base">Gestione Salvataggi & Dati FM26</h3>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            Puoi esportare la configurazione attuale della rosa, tattica e calendario per trasferirla o farne un backup, caricare nuovi dati da CSV, oppure effettuare un reset totale.
          </p>

          {/* BYOK (Bring Your Own Key) Quick Access */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                <Key className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-white block">Chiave API Gemini Personale (BYOK)</span>
                <span className="text-[11px] text-slate-400">Configura una chiave personale per non intaccare la quota e i costi dell'autore.</span>
              </div>
            </div>
            <button
              onClick={() => {
                onClose();
                onOpenApiKeyModal?.();
              }}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold rounded-lg border border-slate-700 shrink-0 transition-all cursor-pointer"
            >
              Configura
            </button>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={() => {
                onClose();
                if (onOpenCsvModal) onOpenCsvModal('squad');
              }}
              className="p-3 bg-[#721c24] hover:bg-red-800 border border-red-500/40 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-2 transition-all shadow-md"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> Carica File CSV
            </button>

            <button
              onClick={handleExport}
              className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-semibold text-emerald-400 flex items-center justify-center gap-2 transition-all"
            >
              <Download className="w-4 h-4" /> Esporta Backup (.json)
            </button>

            <button
              onClick={() => setIsResetConfirmOpen(true)}
              className="p-3 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-xl text-xs font-semibold text-rose-300 flex items-center justify-center gap-2 transition-all"
            >
              <RefreshCw className="w-4 h-4 text-rose-400" /> Reset Dati (Tabula Rasa)
            </button>
          </div>

          {/* Import JSON file or text */}
          <div className="space-y-3 pt-3 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-300 font-bold block">Carica o Incolla Salvataggio JSON:</label>
              <span className="text-[10px] text-emerald-400 font-mono">Formato .json supportato</span>
            </div>

            {/* Direct File Upload Input */}
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-400">
                <span className="font-bold text-white block">Carica direttamente il file .json</span>
                <span className="text-[11px] text-slate-500">Seleziona il file esportato dal tuo PC</span>
              </div>
              <input
                type="file"
                accept=".json,application/json"
                id="json-file-input"
                onChange={handleFileUpload}
                className="hidden"
              />
              <label
                htmlFor="json-file-input"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 shadow-lg"
              >
                <Upload className="w-4 h-4" /> Seleziona File JSON
              </label>
            </div>

            {/* Textarea Fallback */}
            <details className="group">
              <summary className="text-[11px] text-slate-500 hover:text-slate-300 font-medium cursor-pointer py-1">
                Oppure incolla manualmente il codice JSON (clicca per aprire)
              </summary>
              <div className="space-y-2 mt-2">
                <textarea
                  value={jsonInput}
                  onChange={(e) => setJsonInput(e.target.value)}
                  rows={3}
                  placeholder='Incolla il contenuto del file JSON qui...'
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white font-mono placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={handleImport}
                  disabled={!jsonInput.trim()}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 text-white text-xs font-semibold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-emerald-400" /> Importa da Codice Incollato
                </button>
              </div>
            </details>
          </div>

        </div>
      </div>

      {/* Explicit Warning Dialog Modal for Reset Data */}
      <ConfirmDialogModal
        isOpen={isResetConfirmOpen}
        title="⚠️ ATTENZIONE: Reset Completo Dati (Tabula Rasa)"
        message="Sei sicuro di voler resettare tutti i dati dell'applicazione? Tutti i dati salvati (rosa giocatori, formazione tattica, posizioni, calendario partite, scouting e avversari) verranno ELIMINATI DEFINITIVAMENTE senza inserire dati di esempio. L'operazione produrrà una tabula rasa completa. Questa azione è irreversibile."
        confirmLabel="Sì, Elimina e Resetta Tutto (Tabula Rasa)"
        cancelLabel="Annulla"
        isDangerous={true}
        onConfirm={handleConfirmReset}
        onCancel={() => setIsResetConfirmOpen(false)}
      />
    </>
  );
};
