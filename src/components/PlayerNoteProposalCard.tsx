import React, { useState, useMemo } from 'react';
import { UserCheck, FileText, Check, X, Edit3, AlertTriangle, ChevronDown, ChevronUp, Sparkles, User } from 'lucide-react';
import { Player } from '../types';
import { PlayerNoteProposal, combinePlayerNote } from '../utils/copilotNoteProposals';

interface PlayerNoteProposalCardProps {
  proposal: PlayerNoteProposal;
  targetPlayer: Player | null;
  squadName?: string;
  allPlayersList: { player: Player; squadName: string }[];
  currentDate?: string;
  status: 'pending' | 'approved' | 'rejected';
  onApprove: (playerId: string, finalNoteText: string) => void;
  onReject: (proposalId: string) => void;
}

export const PlayerNoteProposalCard: React.FC<PlayerNoteProposalCardProps> = ({
  proposal,
  targetPlayer: initialTargetPlayer,
  squadName: initialSquadName,
  allPlayersList,
  currentDate,
  status,
  onApprove,
  onReject,
}) => {
  // Se il player non era stato trovato automaticamente o l'utente vuole riassegnarlo
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>(
    initialTargetPlayer?.id || ''
  );

  const activeTarget = useMemo(() => {
    if (selectedPlayerId) {
      const match = allPlayersList.find(p => p.player.id === selectedPlayerId);
      if (match) return match;
    }
    if (initialTargetPlayer) {
      return { player: initialTargetPlayer, squadName: initialSquadName || 'Rosa' };
    }
    return null;
  }, [selectedPlayerId, allPlayersList, initialTargetPlayer, initialSquadName]);

  const [mode, setMode] = useState<'append' | 'replace'>(proposal.mode || 'append');
  const [includeCopilotTag, setIncludeCopilotTag] = useState<boolean>(true);
  const [editableNote, setEditableNote] = useState<string>(proposal.proposedNote);
  const [showCurrentNote, setShowCurrentNote] = useState<boolean>(false);
  const [showPreview, setShowPreview] = useState<boolean>(true);

  const existingNotes = activeTarget?.player.notes;

  // Calcolo anteprima finale
  const combinedPreview = useMemo(() => {
    return combinePlayerNote(existingNotes, editableNote, mode, currentDate, includeCopilotTag);
  }, [existingNotes, editableNote, mode, currentDate, includeCopilotTag]);

  const handleConfirm = () => {
    if (!activeTarget) return;
    onApprove(activeTarget.player.id, combinedPreview);
  };

  if (status === 'rejected') {
    return (
      <div className="mt-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs text-slate-500 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <X className="w-4 h-4 text-slate-500" />
          <span>
            Proposta di nota per <strong>{activeTarget?.player.name || proposal.playerName}</strong> rifiutata.
          </span>
        </div>
      </div>
    );
  }

  if (status === 'approved') {
    return (
      <div className="mt-3 p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-300 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-emerald-500/20 text-emerald-400">
              <Check className="w-3.5 h-3.5" />
            </span>
            <span>Nota applicata con successo sulla scheda di {activeTarget?.player.name || proposal.playerName}!</span>
          </div>
          <span className="text-[10px] bg-emerald-900/60 text-emerald-200 px-2 py-0.5 rounded-full border border-emerald-700/50">
            {activeTarget?.squadName || 'Rosa'}
          </span>
        </div>
        <div className="bg-slate-950/80 rounded-lg p-2.5 border border-emerald-900/40 text-[11px] text-slate-200 whitespace-pre-wrap font-mono">
          {combinedPreview}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3.5 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 border-2 border-emerald-500/40 shadow-xl overflow-hidden transition-all text-xs">
      {/* Header Banner */}
      <div className="bg-emerald-950/60 border-b border-emerald-800/50 px-4 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-emerald-300 font-bold">
          <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>Proposta di Aggiornamento Nota Calciatore</span>
        </div>
        {proposal.reason && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-200 border border-emerald-500/30">
            {proposal.reason}
          </span>
        )}
      </div>

      <div className="p-4 space-y-3.5">
        {/* Target Player Identification */}
        {activeTarget ? (
          <div className="flex items-center justify-between bg-slate-950/80 p-2.5 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold shrink-0">
                <User className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white text-sm">{activeTarget.player.name}</span>
                  <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-medium">
                    {activeTarget.player.position}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {activeTarget.player.age} anni
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                  <span>Squadra: <strong className="text-slate-300">{activeTarget.squadName}</strong></span>
                  {activeTarget.player.ca && (
                    <span>• CA: <strong className="text-emerald-400">{activeTarget.player.ca}</strong></span>
                  )}
                  {activeTarget.player.pa && (
                    <span>• PA: <strong className="text-emerald-400">{activeTarget.player.pa}</strong></span>
                  )}
                  {activeTarget.player.isOnLoan && (
                    <span className="text-amber-400 font-medium">• In prestito al {activeTarget.player.loanClub || 'club'}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Pulsante cambio giocatore se necessario */}
            {allPlayersList.length > 1 && (
              <select
                value={activeTarget.player.id}
                onChange={(e) => setSelectedPlayerId(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-slate-300 text-[11px] rounded-lg px-2 py-1 max-w-[140px] truncate cursor-pointer hover:border-slate-500"
                title="Cambia giocatore target"
              >
                {allPlayersList.map(item => (
                  <option key={item.player.id} value={item.player.id}>
                    {item.player.name} ({item.squadName})
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : (
          <div className="bg-amber-950/30 border border-amber-500/40 rounded-xl p-3 text-amber-200">
            <div className="flex items-center gap-2 font-semibold mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Calciatore indicato: "{proposal.playerName}" non identificato automaticamente.</span>
            </div>
            <p className="text-[11px] text-amber-300/80 mb-2">
              Seleziona dalla lista a quale calciatore applicare la nota:
            </p>
            <select
              value={selectedPlayerId}
              onChange={(e) => setSelectedPlayerId(e.target.value)}
              className="w-full bg-slate-950 border border-amber-500/50 text-white rounded-lg p-2 text-xs font-semibold"
            >
              <option value="">-- Scegli Calciatore della Rosa o Giovanili --</option>
              {allPlayersList.map(item => (
                <option key={item.player.id} value={item.player.id}>
                  {item.player.name} - {item.player.position} ({item.squadName})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Existing Note Collapsible (if any) */}
        {existingNotes && existingNotes.trim().length > 0 && (
          <div className="bg-slate-950/60 rounded-xl border border-slate-800/80 overflow-hidden">
            <button
              onClick={() => setShowCurrentNote(!showCurrentNote)}
              className="w-full px-3 py-2 text-left flex items-center justify-between text-slate-400 hover:text-slate-300 cursor-pointer"
            >
              <div className="flex items-center gap-1.5 font-medium text-[11px]">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>Nota attualmente salvata sulla scheda ({existingNotes.length} caratteri)</span>
              </div>
              {showCurrentNote ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {showCurrentNote && (
              <div className="p-3 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-300 whitespace-pre-wrap font-mono leading-relaxed max-h-36 overflow-y-auto">
                {existingNotes}
              </div>
            )}
          </div>
        )}

        {/* Mode Selector & Copilot AI Tag */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Modalità:</span>
            <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-[11px]">
              <button
                type="button"
                onClick={() => setMode('append')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
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
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  mode === 'replace'
                    ? 'bg-rose-600/80 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sostituisci tutto
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIncludeCopilotTag(!includeCopilotTag)}
              title="Aggiunge il prefisso [Copilot AI] per riconoscere che la nota è nata da un confronto con il Co-Allenatore"
              className={`text-[11px] px-2.5 py-1 rounded-lg border font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                includeCopilotTag
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-300'
              }`}
            >
              <Sparkles className="w-3 h-3 text-cyan-400 shrink-0" />
              <span>Tag [Copilot AI]: {includeCopilotTag ? 'Attivo' : 'Disattivato'}</span>
            </button>
          </div>
        </div>

        {/* Editable Proposed Note Content */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-slate-300 font-semibold flex items-center gap-1.5">
              <Edit3 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Testo proposto dal Co-Allenatore (modificabile prima di salvare):</span>
            </label>
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="text-[11px] text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
            >
              {showPreview ? 'Nascondi anteprima' : 'Mostra anteprima'}
            </button>
          </div>

          <textarea
            value={editableNote}
            onChange={(e) => setEditableNote(e.target.value)}
            rows={3}
            className="w-full bg-slate-950 border border-slate-700/90 rounded-xl p-3 text-white text-xs font-medium focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 leading-relaxed transition-all"
            placeholder="Scrivi o modifica la nota..."
          />
        </div>

        {/* Live Preview Section (if toggled) */}
        {showPreview && (
          <div className="bg-slate-950 p-3 rounded-xl border border-emerald-900/50 space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold">
              Anteprima risultato finale sulla scheda:
            </span>
            <div className="text-[11px] text-slate-200 whitespace-pre-wrap font-mono leading-relaxed max-h-32 overflow-y-auto">
              {combinedPreview || '(Nessun testo)'}
            </div>
          </div>
        )}

        {/* Action Controls */}
        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800/80">
          <button
            type="button"
            onClick={() => onReject(proposal.id)}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-800 text-slate-400 hover:text-slate-200 font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Rifiuta</span>
          </button>

          <button
            type="button"
            disabled={!activeTarget || !editableNote.trim()}
            onClick={handleConfirm}
            className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-lg shadow-emerald-950/60 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Conferma e Salva su Scheda Giocatore</span>
          </button>
        </div>
      </div>
    </div>
  );
};
