import React, { useState } from 'react';
import { ScoutingTarget, HomegrownStatus, Player, YouthSquad } from '../types';
import { ConfirmDialogModal } from './ConfirmDialogModal';
import { PlayerAttributesModal } from './PlayerAttributesModal';
import { ConfirmSigningModal, ConfirmSigningResult } from './ConfirmSigningModal';
import { ProspectBadge } from './ProspectBadge';
import { getEffectiveAge, extractCurrentYear } from '../utils/csvParser';
import { matchesSearch } from '../utils/textUtils';
import { Search, Plus, Star, Award, Trash2, Edit2, ShieldCheck, DollarSign, Filter, FileSpreadsheet, Eye, Sparkles, Calendar, UserPlus, CheckCircle2 } from 'lucide-react';
import { getTransferMarketStatus } from '../utils/dateUtils';

interface ScoutingBoardProps {
  targets: ScoutingTarget[];
  onUpdateTargets: (targets: ScoutingTarget[]) => void;
  onOpenCsvModal?: (type: 'squad' | 'scouting') => void;
  currentDate?: string;
  onAskCopilot?: (prompt: string) => void;
  firstTeamPlayers?: Player[];
  youthSquads?: YouthSquad[];
  onConfirmSigning?: (result: ConfirmSigningResult) => void;
}

export const ScoutingBoard: React.FC<ScoutingBoardProps> = ({
  targets,
  onUpdateTargets,
  onOpenCsvModal,
  currentDate,
  onAskCopilot,
  firstTeamPlayers = [],
  youthSquads = [],
  onConfirmSigning,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editingTarget, setEditingTarget] = useState<ScoutingTarget | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [targetToDelete, setTargetToDelete] = useState<{ id: string; name: string } | null>(null);
  const [selectedTargetForDetails, setSelectedTargetForDetails] = useState<ScoutingTarget | null>(null);
  const [targetToSign, setTargetToSign] = useState<ScoutingTarget | null>(null);
  const [signingSuccessToast, setSigningSuccessToast] = useState<{ name: string; destination: string } | null>(null);

  const handleSigningConfirmed = (result: ConfirmSigningResult) => {
    if (onConfirmSigning) {
      onConfirmSigning(result);
    } else {
      if (result.removeFromScouting) {
        onUpdateTargets(targets.filter(t => t.id !== result.target.id));
      }
    }
    setSigningSuccessToast({
      name: result.target.name,
      destination: result.destinationLabel,
    });
    setTargetToSign(null);
    setTimeout(() => {
      setSigningSuccessToast(null);
    }, 4500);
  };

  const filteredTargets = targets.filter(t =>
    matchesSearch(t.name, searchTerm) ||
    matchesSearch(t.position, searchTerm) ||
    matchesSearch(t.currentClub, searchTerm)
  );

  const handleSave = (target: ScoutingTarget) => {
    const currentYear = extractCurrentYear(currentDate);
    const updatedTarget: ScoutingTarget = {
      ...target,
      age: Math.max(14, target.age || 21),
      birthYear: target.birthYear || (currentYear - (target.age || 21))
    };
    if (targets.some(t => t.id === target.id)) {
      onUpdateTargets(targets.map(t => t.id === target.id ? updatedTarget : t));
    } else {
      onUpdateTargets([...targets, updatedTarget]);
    }
    setEditingTarget(null);
    setIsCreating(false);
  };

  const handleDelete = (id: string) => {
    const target = targets.find(t => t.id === id);
    if (target) {
      setTargetToDelete({ id: target.id, name: target.name });
    }
  };

  const confirmDeleteTarget = () => {
    if (targetToDelete) {
      onUpdateTargets(targets.filter(t => t.id !== targetToDelete.id));
      if (editingTarget && editingTarget.id === targetToDelete.id) {
        setEditingTarget(null);
        setIsCreating(false);
      }
      if (selectedTargetForDetails && selectedTargetForDetails.id === targetToDelete.id) {
        setSelectedTargetForDetails(null);
      }
      setTargetToDelete(null);
    }
  };

  const marketStatus = getTransferMarketStatus(currentDate);

  return (
    <div className="space-y-6">
      {/* Signing Success Toast */}
      {signingSuccessToast && (
        <div className="bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 px-4 py-3 rounded-2xl flex items-center justify-between gap-3 shadow-lg animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">
                Trasferimento Completato! 🎉
              </div>
              <div className="text-[11px] text-emerald-300">
                <strong>{signingSuccessToast.name}</strong> è stato ufficialmente acquistato e inserito in <strong>{signingSuccessToast.destination}</strong>.
              </div>
            </div>
          </div>
          <button
            onClick={() => setSigningSuccessToast(null)}
            className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <Search className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">Lista Osservati & Target di Calciomercato</h2>
            {currentDate && (
              <span className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-full flex items-center gap-1 font-semibold">
                <Calendar className="w-3 h-3 text-emerald-400" />
                <span>al {currentDate}</span>
              </span>
            )}
            <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold flex items-center gap-1 ${
              marketStatus.isOpen
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${marketStatus.isOpen ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span>{marketStatus.label}</span>
              {marketStatus.daysRemainingOrUntilNext !== undefined && (
                <span className="opacity-80">
                  ({marketStatus.isOpen ? `${marketStatus.daysRemainingOrUntilNext}gg rimasti` : `tra ${marketStatus.daysRemainingOrUntilNext}gg`})
                </span>
              )}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Pianifica le strategie di acquisto e cessione. Le età dei target e lo status contrattuale sono calcolati in base alla data in-game.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onAskCopilot && targets.length > 0 && (
            <button
              onClick={() => onAskCopilot(`Effettua un confronto numerico dettagliato basato sulle schede complete tra tutti gli obiettivi di scouting caricati (${targets.map(t => `${t.name} [${t.position}]`).slice(0, 5).join(', ')}${targets.length > 5 ? '...' : ''}) e i nostri titolari attuali nei rispettivi ruoli. Analizza le differenze numeriche sugli attributi tecnici, mentali e fisici (scala 1-20), CA/PA e dimmi per ciascuno se rappresenta un upgrade immediato per l'XI iniziale.`)}
              className="bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/40 text-xs font-semibold px-3 py-2 rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
              title="Confronta tutti i target di scouting con la rosa tramite Copilot AI"
            >
              <Sparkles className="w-4 h-4 text-sky-400" /> Confronto Copilot AI
            </button>
          )}

          <button
            onClick={() => onOpenCsvModal && onOpenCsvModal('scouting')}
            className="bg-slate-950 hover:bg-slate-800 text-emerald-400 border border-emerald-500/40 text-xs font-semibold px-3 py-2 rounded-xl transition-all shadow-md flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> Carica CSV Target
          </button>

          <button
            onClick={() => {
              setEditingTarget({
                id: `s_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                name: '',
                currentClub: '',
                age: 21,
                position: 'CC',
                roles: ['Centrocampista'],
                estimatedValue: '€20M',
                weeklyWage: '€30k/sett',
                homegrown: 'HG Nazione (3 anni in UK)',
                rating: 4,
                priority: 'Priorità Alta (Gennaio)',
                notes: ''
              });
              setIsCreating(true);
            }}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-md shadow-emerald-900/30 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Aggiungi Obiettivo
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            placeholder="Filtra per nome, squadra attuale o ruolo (es. Bellingham, TD, Sunderland)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Targets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredTargets.map((target, index) => (
          <div
            key={`${target.id}_${index}`}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl hover:border-slate-700 transition-all space-y-3 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-slate-100 text-base">{target.name}</h3>
                    <ProspectBadge pa={target.pa} age={getEffectiveAge(target, currentDate)} size="sm" />
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {getEffectiveAge(target, currentDate)} anni • {target.currentClub} • <strong className="text-emerald-400">{target.position}</strong>
                  </p>
                </div>
                <div className="flex items-center space-x-1 text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 text-xs shrink-0">
                  <Star className="w-3.5 h-3.5 fill-amber-400" />
                  <span>{target.rating}/5</span>
                </div>
              </div>

              {/* Roles & HG Status */}
              <div className="mt-3 space-y-1.5 text-xs">
                <div className="flex items-center justify-between bg-slate-950 p-2 rounded-xl border border-slate-800">
                  <span className="text-slate-400 text-[11px]">Ruoli Adatti:</span>
                  <span className="text-slate-200 font-semibold">{target.roles.join(', ')}</span>
                </div>

                <div className="flex items-center justify-between bg-slate-950 p-2 rounded-xl border border-slate-800">
                  <span className="text-slate-400 text-[11px]">Status HG / UEFA:</span>
                  <span className={target.homegrown.includes('HG') ? 'text-emerald-400 font-bold' : 'text-slate-300'}>
                    {target.homegrown}
                  </span>
                </div>

                <div className="flex items-center justify-between bg-slate-950 p-2 rounded-xl border border-slate-800">
                  <span className="text-slate-400 text-[11px]">Valore / Ingaggio Stmato:</span>
                  <span className="text-amber-300 font-semibold">{target.estimatedValue} • {target.weeklyWage}</span>
                </div>
              </div>

              {/* Notes */}
              {target.notes && (
                <p className="text-xs text-slate-300 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 mt-2 italic">
                  "{target.notes}"
                </p>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                  target.priority === 'Priorità Alta (Gennaio)'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                    : 'bg-sky-500/20 text-sky-300 border-sky-500/30'
                }`}>
                  {target.priority}
                </span>

                <button
                  type="button"
                  onClick={() => setTargetToSign(target)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-2.5 py-1 rounded-lg transition-all shadow-md shadow-emerald-950/40 flex items-center gap-1.5 cursor-pointer active:scale-95"
                  title="Conferma l'acquisto: scegli se mandarlo in prima squadra o nelle giovanili"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Conferma Acquisto</span>
                </button>
              </div>

              <div className="flex items-center space-x-1">
                {onAskCopilot && (
                  <button
                    onClick={() => onAskCopilot(`Fai un confronto numerico approfondito tra l'obiettivo di scouting ${target.name} (${target.position}, ${target.currentClub || 'Svincolato'}, CA ${target.ca || 'N/D'}, PA ${target.pa || 'N/D'}, Altezza ${target.height || 185}cm) e i nostri giocatori della rosa nello stesso ruolo (${target.position}). Confronta la scheda attributi completa (Tecnica, Mentale, Fisica in scala 1-20 FM), i differenziali numerici e valuta se vale la pena acquistarlo per la nostra tattica.`)}
                    className="p-1.5 text-sky-400 hover:text-sky-300 hover:bg-slate-800 rounded-lg transition-colors text-xs cursor-pointer"
                    title="Confronta con Copilot AI su base numerica"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setSelectedTargetForDetails(target)}
                  className="p-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-slate-800 rounded-lg transition-colors text-xs"
                  title="Vedi Scheda Attributi FM Completa"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setEditingTarget(target)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-xs"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(target.id)}
                  className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Target Modal */}
      {editingTarget && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-3">
            <h3 className="text-sm font-bold text-white">
              {isCreating ? 'Aggiungi Obiettivo Scouting' : `Modifica: ${editingTarget.name}`}
            </h3>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Nome</label>
                <input
                  type="text"
                  value={editingTarget.name}
                  onChange={(e) => setEditingTarget({ ...editingTarget, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Squadra Attuale</label>
                <input
                  type="text"
                  value={editingTarget.currentClub}
                  onChange={(e) => setEditingTarget({ ...editingTarget, currentClub: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Età (Anni)</label>
                <input
                  type="number"
                  min={14}
                  max={45}
                  value={editingTarget.age || 21}
                  onChange={(e) => {
                    const newAge = parseInt(e.target.value, 10) || 21;
                    const cYear = extractCurrentYear(currentDate);
                    setEditingTarget({
                      ...editingTarget,
                      age: newAge,
                      birthYear: cYear - newAge
                    });
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Ruolo Principale</label>
                <input
                  type="text"
                  value={editingTarget.position}
                  onChange={(e) => setEditingTarget({ ...editingTarget, position: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Valutazione (1-5 Stelle)</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={editingTarget.rating}
                  onChange={(e) => setEditingTarget({ ...editingTarget, rating: parseInt(e.target.value) || 3 })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Priorità Acquisto</label>
                <select
                  value={editingTarget.priority}
                  onChange={(e) => setEditingTarget({ ...editingTarget, priority: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white"
                >
                  <option value="Priorità Alta (Gennaio)">Priorità Alta (Gennaio)</option>
                  <option value="Monitorare">Monitorare</option>
                  <option value="Piano B">Piano B</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Valore Stimato</label>
                <input
                  type="text"
                  value={editingTarget.estimatedValue}
                  onChange={(e) => setEditingTarget({ ...editingTarget, estimatedValue: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Ingaggio Settimanale</label>
                <input
                  type="text"
                  value={editingTarget.weeklyWage || '€30k/sett'}
                  onChange={(e) => setEditingTarget({ ...editingTarget, weeklyWage: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white"
                />
              </div>

              <div className="col-span-2">
                <label className="text-slate-400 block mb-1">Status Homegrown</label>
                <select
                  value={editingTarget.homegrown}
                  onChange={(e) => setEditingTarget({ ...editingTarget, homegrown: e.target.value as HomegrownStatus })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white"
                >
                  <option value="HG Nazione (3 anni in UK)">HG Nazione (3 anni in UK)</option>
                  <option value="HG Club (3 anni in club)">HG Club (3 anni in club)</option>
                  <option value="Straniero / Non-HG">Straniero / Non-HG</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-slate-400 block mb-1 text-xs">Note di Osservazione</label>
              <textarea
                value={editingTarget.notes}
                onChange={(e) => setEditingTarget({ ...editingTarget, notes: e.target.value })}
                rows={2}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-white"
              />
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              {!isCreating ? (
                <button
                  type="button"
                  onClick={() => handleDelete(editingTarget.id)}
                  className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Rimuovi Target
                </button>
              ) : (
                <div />
              )}
              <div className="flex items-center space-x-2">
                {!isCreating && (
                  <button
                    type="button"
                    onClick={() => {
                      const t = { ...editingTarget };
                      setEditingTarget(null);
                      setTargetToSign(t);
                    }}
                    className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                    title="Conferma l'acquisto di questo obiettivo"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Acquista
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setEditingTarget(null);
                    setIsCreating(false);
                  }}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={() => handleSave(editingTarget)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-medium cursor-pointer"
                >
                  Salva
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Deleting Scouting Target */}
      <ConfirmDialogModal
        isOpen={targetToDelete !== null}
        title="Rimuovere Obiettivo Scouting?"
        message={
          targetToDelete
            ? `Sei sicuro di voler rimuovere "${targetToDelete.name}" dalla lista degli obiettivi osservati?`
            : ''
        }
        confirmLabel="Rimuovi Target"
        cancelLabel="Annulla"
        isDangerous={true}
        onConfirm={confirmDeleteTarget}
        onCancel={() => setTargetToDelete(null)}
      />

      {/* FM Detailed Attributes Modal */}
      <PlayerAttributesModal
        player={selectedTargetForDetails}
        onClose={() => setSelectedTargetForDetails(null)}
        currentDate={currentDate}
        onDeletePlayer={(t) => handleDelete(t.id)}
        onAskCopilot={onAskCopilot}
        onSignScoutingTarget={(target) => {
          setSelectedTargetForDetails(null);
          setTargetToSign(target);
        }}
      />

      {/* Confirm Signing & Assignment Modal (First Team vs Youth Squads) */}
      <ConfirmSigningModal
        isOpen={targetToSign !== null}
        target={targetToSign}
        onClose={() => setTargetToSign(null)}
        onConfirm={handleSigningConfirmed}
        firstTeamPlayers={firstTeamPlayers}
        youthSquads={youthSquads}
        currentDate={currentDate}
      />
    </div>
  );
};
