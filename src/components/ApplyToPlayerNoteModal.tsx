import React, { useState, useMemo, useEffect } from 'react';
import { UserCheck, X, Search, FileText, Check, AlertCircle, Sparkles } from 'lucide-react';
import { Player } from '../types';
import { combinePlayerNote } from '../utils/copilotNoteProposals';
import { matchesSearch } from '../utils/textUtils';

interface ApplyToPlayerNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialText?: string;
  defaultPlayerId?: string;
  allPlayersList: { player: Player; squadName: string }[];
  currentDate?: string;
  onSave: (playerId: string, newNoteText: string) => void;
}

export const ApplyToPlayerNoteModal: React.FC<ApplyToPlayerNoteModalProps> = ({
  isOpen,
  onClose,
  initialText = '',
  defaultPlayerId,
  allPlayersList,
  currentDate,
  onSave,
}) => {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(defaultPlayerId || '');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [noteContent, setNoteContent] = useState<string>(initialText);
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [includeCopilotTag, setIncludeCopilotTag] = useState<boolean>(true);
  const [showPreview, setShowPreview] = useState<boolean>(false);

  useEffect(() => {
    if (defaultPlayerId) {
      setSelectedPlayerId(defaultPlayerId);
    } else if (allPlayersList.length > 0 && !selectedPlayerId) {
      setSelectedPlayerId(allPlayersList[0].player.id);
    }
  }, [defaultPlayerId, allPlayersList]);

  useEffect(() => {
    setNoteContent(initialText);
  }, [initialText]);

  const filteredPlayers = useMemo(() => {
    if (!searchTerm.trim()) return allPlayersList;
    const term = searchTerm.trim();
    return allPlayersList.filter(
      item =>
        matchesSearch(item.player.name, term) ||
        matchesSearch(item.player.position, term) ||
        matchesSearch(item.squadName, term)
    );
  }, [allPlayersList, searchTerm]);

  const selectedTarget = useMemo(() => {
    return allPlayersList.find(item => item.player.id === selectedPlayerId) || null;
  }, [allPlayersList, selectedPlayerId]);

  const existingNotes = selectedTarget?.player.notes;

  const finalCombinedNote = useMemo(() => {
    return combinePlayerNote(existingNotes, noteContent, mode, currentDate, includeCopilotTag);
  }, [existingNotes, noteContent, mode, currentDate, includeCopilotTag]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!selectedTarget || !noteContent.trim()) return;
    onSave(selectedTarget.player.id, finalCombinedNote);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl relative text-xs">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Applica Nota a Scheda Calciatore</h3>
              <p className="text-[11px] text-slate-400">
                Salva o aggiorna gli appunti e le strategie consigliate direttamente sul profilo del giocatore.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Player Selection */}
        <div className="space-y-2">
          <label className="block text-slate-300 font-semibold">Seleziona Calciatore:</label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              placeholder="Cerca calciatore per nome o ruolo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3.5 py-2 text-white font-medium focus:outline-none focus:border-emerald-500 text-xs"
            />
          </div>

          <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 divide-y divide-slate-800/60">
            {filteredPlayers.length === 0 ? (
              <div className="p-3 text-center text-slate-500">Nessun calciatore trovato.</div>
            ) : (
              filteredPlayers.map((item) => {
                const isSelected = item.player.id === selectedPlayerId;
                return (
                  <button
                    key={item.player.id}
                    type="button"
                    onClick={() => setSelectedPlayerId(item.player.id)}
                    className={`w-full text-left p-2.5 flex items-center justify-between transition-colors cursor-pointer ${
                      isSelected ? 'bg-emerald-950/60 text-white font-bold' : 'hover:bg-slate-900/80 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{item.player.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                        {item.player.position}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {item.squadName}
                      </span>
                      {item.player.isOnLoan && (
                        <span className="text-[10px] text-amber-400 font-medium">
                          (Prestito {item.player.loanClub})
                        </span>
                      )}
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-emerald-400" />}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Existing Note on Selected Player */}
        {selectedTarget && existingNotes && existingNotes.trim().length > 0 && (
          <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
              Nota attuale su {selectedTarget.player.name}:
            </span>
            <div className="text-[11px] text-slate-300 max-h-20 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">
              {existingNotes}
            </div>
          </div>
        )}

        {/* Mode Selector & Copilot AI Tag */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-semibold">Modalità:</span>
            <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-[11px]">
              <button
                type="button"
                onClick={() => setMode('append')}
                className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  mode === 'append'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Aggiungi in calce
              </button>
              <button
                type="button"
                onClick={() => setMode('replace')}
                className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  mode === 'replace'
                    ? 'bg-rose-600/80 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sostituisci tutto
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIncludeCopilotTag(!includeCopilotTag)}
            className={`text-[11px] px-2.5 py-1 rounded-lg border font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              includeCopilotTag
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-300'
            }`}
          >
            <Sparkles className="w-3 h-3 text-cyan-400 shrink-0" />
            <span>Tag [Copilot AI]: {includeCopilotTag ? 'Attivo' : 'No'}</span>
          </button>
        </div>

        {/* Note Content to Save */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="block text-slate-300 font-semibold">Contenuto Nota:</label>
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="text-[11px] text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
            >
              {showPreview ? 'Nascondi anteprima' : 'Mostra anteprima finale'}
            </button>
          </div>
          <textarea
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            rows={4}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-xs font-medium focus:outline-none focus:border-emerald-500 leading-relaxed"
            placeholder="Scrivi qui la nota strategica, tabellino o promemoria per il giocatore..."
          />
        </div>

        {/* Live Preview */}
        {showPreview && (
          <div className="bg-slate-950 p-3 rounded-xl border border-emerald-900/50 space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold">
              Anteprima scheda {selectedTarget?.player.name}:
            </span>
            <div className="text-[11px] text-slate-200 whitespace-pre-wrap font-mono max-h-28 overflow-y-auto">
              {finalCombinedNote || '(Nessun testo)'}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-colors cursor-pointer"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={!selectedTarget || !noteContent.trim()}
            onClick={handleConfirm}
            className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold transition-all shadow-lg shadow-emerald-950/60 flex items-center gap-1.5 cursor-pointer"
          >
            <UserCheck className="w-4 h-4" />
            <span>Conferma e Salva sul Giocatore</span>
          </button>
        </div>
      </div>
    </div>
  );
};
