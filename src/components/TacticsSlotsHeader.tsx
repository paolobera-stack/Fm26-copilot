import React, { useState } from 'react';
import { TacticPreset, TacticalStyle } from '../types';
import {
  Compass,
  Edit3,
  Plus,
  Copy,
  Trash2,
  Check,
  CheckCircle2,
  X,
  Layers,
  Sparkles,
  ArrowRight,
  Sliders
} from 'lucide-react';
import {
  FORMATION_PRESETS,
  createTacticFromFormationPreset,
  duplicateTactic
} from '../data/formationPresets';
import { emptyTactic } from '../data/initialData';

interface TacticsSlotsHeaderProps {
  tactics: TacticPreset[];
  activeTacticIndex: number;
  onSelectSlot: (index: number) => void;
  onUpdateTactics: (newTactics: TacticPreset[], newActiveIdx?: number) => void;
  onUpdateActiveTactic: (updated: TacticPreset) => void;
}

export const TacticsSlotsHeader: React.FC<TacticsSlotsHeaderProps> = ({
  tactics,
  activeTacticIndex,
  onSelectSlot,
  onUpdateTactics,
  onUpdateActiveTactic,
}) => {
  // Modal states
  const [editModalSlotIndex, setEditModalSlotIndex] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editFormation, setEditFormation] = useState('');
  const [reapplyCoordinates, setReapplyCoordinates] = useState(false);

  // New Slot Modal (when clicking an empty slot)
  const [newSlotModalIndex, setNewSlotModalIndex] = useState<number | null>(null);
  const [newSlotMode, setNewSlotMode] = useState<'duplicate' | 'preset' | 'empty'>('preset');
  const [selectedFormationId, setSelectedFormationId] = useState<string>('4-2-3-1');
  const [newSlotCustomName, setNewSlotCustomName] = useState('');

  // Duplicate prompt modal
  const [duplicateModalSourceIndex, setDuplicateModalSourceIndex] = useState<number | null>(null);
  const [duplicateTargetIndex, setDuplicateTargetIndex] = useState<number>(1);
  const [duplicateCustomName, setDuplicateCustomName] = useState('');

  // Delete confirm modal
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);

  // Open Edit Modal for a slot
  const handleOpenEditModal = (slotIndex: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const targetTactic = tactics[slotIndex];
    if (!targetTactic) return;
    setEditModalSlotIndex(slotIndex);
    setEditName(targetTactic.name);
    setEditFormation(targetTactic.formation);
    setReapplyCoordinates(false);
  };

  // Save Edit
  const handleSaveEdit = () => {
    if (editModalSlotIndex === null) return;
    const targetTactic = tactics[editModalSlotIndex];
    if (!targetTactic) return;

    const trimmedName = editName.trim() || `Tattica Slot ${editModalSlotIndex + 1}`;
    const trimmedFormation = editFormation.trim() || targetTactic.formation || '4-3-3';

    let updatedTactic: TacticPreset = {
      ...targetTactic,
      name: trimmedName,
      formation: trimmedFormation
    };

    // If manager requested automatic pitch coordinate repositioning for the new formation
    if (reapplyCoordinates) {
      const matchedPreset = FORMATION_PRESETS.find(
        f => f.name.toLowerCase() === trimmedFormation.toLowerCase() || f.id.toLowerCase() === trimmedFormation.toLowerCase()
      );
      if (matchedPreset) {
        // Map existing player assignments if possible
        const existingPositions = targetTactic.positions || [];
        const newPositions = matchedPreset.positions.map((p, idx) => {
          const oldPos = existingPositions[idx];
          return {
            ...p,
            id: `pos_${p.label.toLowerCase()}_${Math.random().toString(36).substring(2, 6)}`,
            playerId: oldPos?.playerId
          };
        });

        updatedTactic = {
          ...updatedTactic,
          positions: newPositions,
          inPossessionPositions: newPositions.map(p => ({ ...p })),
          outOfPossessionPositions: newPositions.map(p => ({ ...p })),
          combinedPositions: newPositions.map(p => ({ ...p }))
        };
      }
    }

    const updatedList = [...tactics];
    updatedList[editModalSlotIndex] = updatedTactic;
    onUpdateTactics(updatedList);
    setEditModalSlotIndex(null);
  };

  // Open New Slot Modal
  const handleOpenNewSlot = (slotIndex: number) => {
    setNewSlotModalIndex(slotIndex);
    const defaultFormation = slotIndex === 1 ? '4-2-3-1' : '3-5-2';
    setSelectedFormationId(defaultFormation);
    const defaultPreset = FORMATION_PRESETS.find(f => f.id === defaultFormation);
    setNewSlotCustomName(defaultPreset ? `${defaultPreset.name} (Slot ${slotIndex + 1})` : `Tattica Slot ${slotIndex + 1}`);
    setNewSlotMode('preset');
  };

  // Create New Slot
  const handleCreateNewSlot = () => {
    if (newSlotModalIndex === null) return;
    const slotIdx = newSlotModalIndex;
    let newTactic: TacticPreset;

    if (newSlotMode === 'duplicate') {
      const source = tactics[activeTacticIndex] || tactics[0];
      newTactic = duplicateTactic(
        source,
        slotIdx + 1,
        newSlotCustomName.trim() || `${source.name} (Slot ${slotIdx + 1})`
      );
    } else if (newSlotMode === 'preset') {
      newTactic = createTacticFromFormationPreset(
        selectedFormationId,
        newSlotCustomName.trim(),
        slotIdx + 1
      );
    } else {
      // Empty
      newTactic = {
        ...emptyTactic,
        id: `t_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: newSlotCustomName.trim() || `Tattica Slot ${slotIdx + 1}`
      };
    }

    const nextTactics = [...tactics];
    if (slotIdx >= nextTactics.length) {
      nextTactics.push(newTactic);
    } else {
      nextTactics[slotIdx] = newTactic;
    }

    onUpdateTactics(nextTactics, slotIdx);
    setNewSlotModalIndex(null);
  };

  // Open Duplicate Modal
  const handleOpenDuplicate = (sourceIndex: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const sourceTactic = tactics[sourceIndex];
    if (!sourceTactic) return;

    // Pick first available target slot
    let target = 1;
    if (sourceIndex === 1) target = tactics.length < 3 ? 2 : 0;
    else if (sourceIndex === 0) target = tactics.length > 1 ? (tactics.length < 3 ? 2 : 1) : 1;
    else target = 0;

    setDuplicateModalSourceIndex(sourceIndex);
    setDuplicateTargetIndex(target);
    setDuplicateCustomName(`${sourceTactic.name} (Copia Slot ${target + 1})`);
  };

  // Confirm Duplicate
  const handleConfirmDuplicate = () => {
    if (duplicateModalSourceIndex === null) return;
    const source = tactics[duplicateModalSourceIndex];
    if (!source) return;

    const targetIdx = duplicateTargetIndex;
    const cloned = duplicateTactic(
      source,
      targetIdx + 1,
      duplicateCustomName.trim() || `${source.name} (Copia)`
    );

    const nextTactics = [...tactics];
    if (targetIdx >= nextTactics.length) {
      nextTactics.push(cloned);
    } else {
      nextTactics[targetIdx] = cloned;
    }

    onUpdateTactics(nextTactics, targetIdx);
    setDuplicateModalSourceIndex(null);
  };

  // Delete Slot
  const handleConfirmDelete = () => {
    if (deleteConfirmIndex === null) return;
    const targetIdx = deleteConfirmIndex;
    if (targetIdx === 0 && tactics.length === 1) {
      // Cannot delete the only tactic
      setDeleteConfirmIndex(null);
      return;
    }

    const nextTactics = tactics.filter((_, idx) => idx !== targetIdx);
    let nextActive = activeTacticIndex;
    if (nextActive === targetIdx) {
      nextActive = 0;
    } else if (nextActive > targetIdx) {
      nextActive = nextActive - 1;
    }

    onUpdateTactics(nextTactics, nextActive);
    setDeleteConfirmIndex(null);
  };

  return (
    <div className="space-y-3">
      {/* Slots Bar Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              Slot Tattici Squadra
              <span className="text-[11px] font-medium text-slate-400">
                (Fino a 3 moduli memorizzati)
              </span>
            </h2>
            <p className="text-[11px] text-slate-400">
              Passa rapidamente da un modulo all'altro, rinomina le tattiche o crea varianti per gara in casa/trasferta.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400 text-[11px] hidden md:inline">
            Tattica attiva in partita:
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-[11px] flex items-center gap-1.5 shadow-sm">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Slot {activeTacticIndex + 1}: {tactics[activeTacticIndex]?.formation || '4-3-3'}
          </span>
        </div>
      </div>

      {/* 3 Slots Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[0, 1, 2].map((slotIdx) => {
          const slotTactic = tactics[slotIdx];
          const isActive = activeTacticIndex === slotIdx;
          const slotLabel = slotIdx === 0 ? 'Primaria' : slotIdx === 1 ? 'Secondaria' : 'Terziaria';

          if (slotTactic) {
            return (
              <div
                key={slotTactic.id || `slot_${slotIdx}`}
                onClick={() => onSelectSlot(slotIdx)}
                className={`relative rounded-2xl p-4 transition-all cursor-pointer border ${
                  isActive
                    ? 'bg-slate-900/95 border-emerald-500 shadow-xl shadow-emerald-950/30 ring-2 ring-emerald-500/30'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/90 text-slate-300'
                }`}
              >
                {/* Top badge & active indicator */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-1.5">
                    <span
                      className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md tracking-wider border ${
                        isActive
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-extrabold'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      Slot {slotIdx + 1} • {slotLabel}
                    </span>
                    {isActive && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-md border border-emerald-500/40">
                        <Check className="w-3 h-3" /> Attiva
                      </span>
                    )}
                  </div>

                  {/* Slot action icons */}
                  <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={(e) => handleOpenEditModal(slotIdx, e)}
                      title="Rinomina tattica o cambia modulo"
                      className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleOpenDuplicate(slotIdx, e)}
                      title="Duplica questa tattica in un altro slot"
                      className="p-1 rounded-lg text-slate-400 hover:text-sky-400 hover:bg-slate-800 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    {slotIdx > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmIndex(slotIdx);
                        }}
                        title="Rimuovi questo slot tattico"
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Tactic Title & Formation */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3
                      className={`text-sm font-extrabold truncate ${
                        isActive ? 'text-white' : 'text-slate-200'
                      }`}
                      title={slotTactic.name}
                    >
                      {slotTactic.name}
                    </h3>
                    <span className="shrink-0 bg-slate-950 border border-slate-700 text-emerald-400 text-xs font-mono font-bold px-2 py-0.5 rounded-lg shadow-sm">
                      {slotTactic.formation}
                    </span>
                  </div>

                  {/* Tactical Style & Mentality tags */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                    <span className="bg-sky-500/15 text-sky-300 px-2 py-0.5 rounded-md border border-sky-500/30 font-medium">
                      {slotTactic.tacticalStyle || 'Gegenpress'}
                    </span>
                    <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md border border-slate-700">
                      {slotTactic.mentality}
                    </span>
                    <span className="text-[10px] text-slate-400 ml-auto">
                      {slotTactic.positions?.length || 11} ruoli
                    </span>
                  </div>
                </div>
              </div>
            );
          }

          // Empty Slot Card
          return (
            <div
              key={`empty_slot_${slotIdx}`}
              onClick={() => handleOpenNewSlot(slotIdx)}
              className="group border-2 border-dashed border-slate-800 hover:border-emerald-500/50 bg-slate-900/30 hover:bg-slate-900/60 rounded-2xl p-4 flex flex-col items-center justify-center text-center transition-all cursor-pointer min-h-[110px]"
            >
              <div className="w-9 h-9 rounded-xl bg-slate-800 group-hover:bg-emerald-500/20 group-hover:text-emerald-400 text-slate-400 flex items-center justify-center mb-2 transition-colors">
                <Plus className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-slate-300 group-hover:text-white">
                + Attiva Slot {slotIdx + 1} ({slotLabel})
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Aggiungi un modulo alternativo (es. 4-2-3-1 o 3-5-2)
              </p>
            </div>
          );
        })}
      </div>

      {/* MODAL 1: Edit Tactic Name & Formation */}
      {editModalSlotIndex !== null && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden my-6">
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Modifica Slot {editModalSlotIndex + 1}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Rinomina la tattica o aggiorna il modulo di gioco
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditModalSlotIndex(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Nome Tattica input */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Nome Tattica
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="es. Gegenpress Casa, 4-3-3 Asimmetrico, 3-5-2 Contropiede"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:border-emerald-500 focus:outline-none"
                  autoFocus
                />
              </div>

              {/* Modulo / Formazione input */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                  Modulo / Formazione
                </label>
                <input
                  type="text"
                  value={editFormation}
                  onChange={(e) => setEditFormation(e.target.value)}
                  placeholder="es. 4-3-3, 4-2-3-1, 3-5-2"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs font-mono focus:border-emerald-500 focus:outline-none mb-2"
                />

                {/* Quick Chips for Standard Formations */}
                <div className="space-y-1">
                  <span className="text-[11px] text-slate-400 block">Moduli consigliati rapidi:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {FORMATION_PRESETS.map((fp) => (
                      <button
                        key={fp.id}
                        type="button"
                        onClick={() => {
                          setEditFormation(fp.name);
                        }}
                        className={`text-[10px] px-2.5 py-1 rounded-lg border font-mono font-bold transition-all cursor-pointer ${
                          editFormation === fp.name
                            ? 'bg-emerald-600 text-white border-emerald-400'
                            : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {fp.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Checkbox: Reapply 2D pitch coordinates */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reapplyCoordinates}
                    onChange={(e) => setReapplyCoordinates(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-slate-200 block">
                      Riorganizza le coordinate del campo 2D per il modulo {editFormation}
                    </span>
                    <span className="text-[11px] text-slate-400 block mt-0.5">
                      Riposiziona graficamente i cerchi dei giocatori nelle posizioni standard del modulo mantenendo i giocatori già assegnati.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            <div className="bg-slate-950 px-6 py-3.5 border-t border-slate-800 flex items-center justify-end space-x-2.5">
              <button
                type="button"
                onClick={() => setEditModalSlotIndex(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Salva Modifiche</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Create New Slot */}
      {newSlotModalIndex !== null && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden my-6">
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-500/30 text-sky-400 flex items-center justify-center">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Attiva Slot {newSlotModalIndex + 1}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Scegli come inizializzare questo nuovo modulo di gioco
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNewSlotModalIndex(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Method Selection: Preset vs Duplicate vs Clean */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNewSlotMode('preset');
                    const p = FORMATION_PRESETS.find(f => f.id === selectedFormationId);
                    if (p) setNewSlotCustomName(`${p.name} (Slot ${newSlotModalIndex + 1})`);
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    newSlotMode === 'preset'
                      ? 'bg-emerald-950/60 border-emerald-500 text-white shadow-lg'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <Layers className="w-4 h-4 text-emerald-400 mb-1" />
                  <span className="text-xs font-bold block text-white">Modulo Pronto</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">4-2-3-1, 3-5-2...</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setNewSlotMode('duplicate');
                    const src = tactics[activeTacticIndex] || tactics[0];
                    if (src) setNewSlotCustomName(`${src.name} (Slot ${newSlotModalIndex + 1})`);
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    newSlotMode === 'duplicate'
                      ? 'bg-sky-950/60 border-sky-500 text-white shadow-lg'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <Copy className="w-4 h-4 text-sky-400 mb-1" />
                  <span className="text-xs font-bold block text-white">Duplica Attuale</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Clona Slot {activeTacticIndex + 1}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setNewSlotMode('empty');
                    setNewSlotCustomName(`Tattica Slot ${newSlotModalIndex + 1}`);
                  }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    newSlotMode === 'empty'
                      ? 'bg-indigo-950/60 border-indigo-500 text-white shadow-lg'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-indigo-400 mb-1" />
                  <span className="text-xs font-bold block text-white">Tabula Rasa</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5">Lavagna vuota</span>
                </button>
              </div>

              {/* Form details */}
              <div className="space-y-3 pt-1">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Nome della Tattica nello Slot {newSlotModalIndex + 1}:
                  </label>
                  <input
                    type="text"
                    value={newSlotCustomName}
                    onChange={(e) => setNewSlotCustomName(e.target.value)}
                    placeholder="es. 4-2-3-1 Dominio Possesso"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {newSlotMode === 'preset' && (
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      Seleziona il Modulo Preimpostato:
                    </label>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {FORMATION_PRESETS.map((fp) => (
                        <div
                          key={fp.id}
                          onClick={() => {
                            setSelectedFormationId(fp.id);
                            setNewSlotCustomName(`${fp.name} (Slot ${newSlotModalIndex + 1})`);
                          }}
                          className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between text-xs ${
                            selectedFormationId === fp.id
                              ? 'bg-emerald-950/40 border-emerald-500/80 text-white'
                              : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <div>
                            <span className="font-bold text-white block">{fp.label}</span>
                            <span className="text-[10px] text-slate-400">
                              Stile predefinito: {fp.defaultStyle} • {fp.defaultMentality}
                            </span>
                          </div>
                          <span className="font-mono font-extrabold text-emerald-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                            {fp.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {newSlotMode === 'duplicate' && (
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-300">
                    <p className="font-semibold text-sky-400 mb-1">
                      Clonazione Tattica Attuale:
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Verranno copiati tutti i compiti, le istruzioni, i giocatori titolari e gli screenshot dallo{' '}
                      <b>Slot {activeTacticIndex + 1} ({tactics[activeTacticIndex]?.name})</b>. Potrai poi modificare liberamente la nuova tattica senza alterare l'originale.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-950 px-6 py-3.5 border-t border-slate-800 flex items-center justify-end space-x-2.5">
              <button
                type="button"
                onClick={() => setNewSlotModalIndex(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleCreateNewSlot}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Crea e Attiva Slot</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Duplicate into Slot */}
      {duplicateModalSourceIndex !== null && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden my-6">
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-500/30 text-sky-400 flex items-center justify-center">
                  <Copy className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Duplica Tattica (Slot {duplicateModalSourceIndex + 1})
                  </h3>
                  <p className="text-xs text-slate-400">
                    Copia questa configurazione tattica in un altro slot
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDuplicateModalSourceIndex(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Seleziona Slot di Destinazione:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((idx) => {
                    const isSelf = idx === duplicateModalSourceIndex;
                    const isSelected = duplicateTargetIndex === idx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={isSelf}
                        onClick={() => {
                          setDuplicateTargetIndex(idx);
                          const src = tactics[duplicateModalSourceIndex!];
                          if (src) setDuplicateCustomName(`${src.name} (Slot ${idx + 1})`);
                        }}
                        className={`p-2.5 rounded-xl border text-center font-bold transition-all cursor-pointer ${
                          isSelf
                            ? 'opacity-30 border-slate-800 bg-slate-950 text-slate-600 cursor-not-allowed'
                            : isSelected
                            ? 'bg-sky-600 text-white border-sky-400 shadow-md'
                            : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        Slot {idx + 1}
                        {tactics[idx] ? (
                          <span className="block text-[9px] font-normal text-slate-400 truncate">
                            {tactics[idx].formation}
                          </span>
                        ) : (
                          <span className="block text-[9px] font-normal text-emerald-400">
                            (Vuoto)
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-semibold block mb-1">
                  Nome per la Copia:
                </label>
                <input
                  type="text"
                  value={duplicateCustomName}
                  onChange={(e) => setDuplicateCustomName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="bg-slate-950 px-6 py-3.5 border-t border-slate-800 flex items-center justify-end space-x-2.5">
              <button
                type="button"
                onClick={() => setDuplicateModalSourceIndex(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleConfirmDuplicate}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold rounded-xl shadow-lg flex items-center gap-1.5"
              >
                <Copy className="w-4 h-4" />
                <span>Conferma Duplicazione</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Delete Confirm Modal */}
      {deleteConfirmIndex !== null && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Rimuovere Slot {deleteConfirmIndex + 1}?
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Stai per eliminare la tattica "
                <span className="text-slate-200 font-semibold">
                  {tactics[deleteConfirmIndex]?.name}
                </span>
                " dallo Slot {deleteConfirmIndex + 1}. L'operazione non può essere annullata.
              </p>
            </div>
            <div className="flex items-center justify-end space-x-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmIndex(null)}
                className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-lg"
              >
                Elimina Slot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
