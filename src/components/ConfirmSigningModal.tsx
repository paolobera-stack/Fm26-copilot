import React, { useState, useMemo, useEffect } from 'react';
import { ScoutingTarget, Player, YouthSquad } from '../types';
import { getEffectiveAge } from '../utils/csvParser';
import { ProspectBadge } from './ProspectBadge';
import {
  X,
  UserPlus,
  Check,
  AlertCircle,
  GraduationCap,
  Shield,
  Star,
  Hash,
  Building2,
  FileText,
  Sparkles,
  ArrowRight
} from 'lucide-react';

export interface ConfirmSigningResult {
  target: ScoutingTarget;
  destination: 'first_team' | string; // 'first_team' or youth squad id
  destinationLabel: string;
  shirtNumber: number;
  removeFromScouting: boolean;
  notes?: string;
}

interface ConfirmSigningModalProps {
  isOpen: boolean;
  target: ScoutingTarget | null;
  onClose: () => void;
  onConfirm: (result: ConfirmSigningResult) => void;
  firstTeamPlayers: Player[];
  youthSquads: YouthSquad[];
  currentDate?: string;
}

export const ConfirmSigningModal: React.FC<ConfirmSigningModalProps> = ({
  isOpen,
  target,
  onClose,
  onConfirm,
  firstTeamPlayers,
  youthSquads,
  currentDate,
}) => {
  if (!isOpen || !target) return null;

  const effectiveAge = getEffectiveAge(target, currentDate);

  // Default destination: if age <= 19 and youth squads exist, default can be youth or first team based on CA
  const defaultDestination = useMemo(() => {
    if (effectiveAge <= 18 && youthSquads.length > 0 && (target.ca || 130) < 135) {
      // Suggest youth squad (e.g. U18 or U20)
      const u18 = youthSquads.find(ys => ys.name.includes('18') || (ys.category && ys.category.includes('18')));
      if (u18) return u18.id;
      return youthSquads[0].id;
    }
    return 'first_team';
  }, [effectiveAge, youthSquads, target.ca]);

  const [destination, setDestination] = useState<'first_team' | string>(defaultDestination);
  const [removeFromScouting, setRemoveFromScouting] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>('');

  // Players in the currently selected destination
  const currentDestinationPlayers = useMemo(() => {
    if (destination === 'first_team') {
      return firstTeamPlayers;
    }
    const squad = youthSquads.find(ys => ys.id === destination);
    return squad ? squad.players : [];
  }, [destination, firstTeamPlayers, youthSquads]);

  // Find lowest available shirt number in chosen squad
  const suggestedNumber = useMemo(() => {
    const used = new Set(currentDestinationPlayers.map(p => p.number).filter(Boolean));
    for (let n = 2; n <= 99; n++) {
      if (!used.has(n)) return n;
    }
    return 99;
  }, [currentDestinationPlayers]);

  const [shirtNumber, setShirtNumber] = useState<number>(suggestedNumber);

  // Update shirt number when destination changes
  useEffect(() => {
    setShirtNumber(suggestedNumber);
  }, [suggestedNumber]);

  // Check if chosen shirt number is taken
  const playerWithNumber = useMemo(() => {
    return currentDestinationPlayers.find(p => p.number === shirtNumber);
  }, [currentDestinationPlayers, shirtNumber]);

  const selectedSquadName = useMemo(() => {
    if (destination === 'first_team') return 'Prima Squadra';
    const found = youthSquads.find(ys => ys.id === destination);
    return found ? found.name : 'Squadra Giovanile';
  }, [destination, youthSquads]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm({
      target,
      destination,
      destinationLabel: selectedSquadName,
      shirtNumber: Math.max(1, Math.min(99, shirtNumber || 1)),
      removeFromScouting,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-inner">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Conferma Acquisto & Tesseramento
                </h3>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-full font-bold">
                  Calciomercato
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Completa il trasferimento di <strong>{target.name}</strong> nel tuo club
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {/* Target Card Summary */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base font-bold text-white">{target.name}</span>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    {target.position}
                  </span>
                  <ProspectBadge pa={target.pa} age={effectiveAge} size="sm" />
                </div>
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3 h-3 text-slate-500" />
                    {target.currentClub || 'Svincolato'}
                  </span>
                  <span>•</span>
                  <span>{effectiveAge} anni</span>
                  {target.height && (
                    <>
                      <span>•</span>
                      <span>{target.height} cm</span>
                    </>
                  )}
                  {target.homegrown && (
                    <>
                      <span>•</span>
                      <span className="text-slate-300">{target.homegrown}</span>
                    </>
                  )}
                </p>
              </div>

              <div className="flex items-center space-x-1 text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 text-xs shrink-0 font-bold">
                <Star className="w-3.5 h-3.5 fill-amber-400" />
                <span>{target.rating}/5</span>
              </div>
            </div>

            {/* Quick Financials & Ratings */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-900 text-xs">
              <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/80">
                <span className="text-[10px] text-slate-500 block uppercase font-bold">Valore Cartellino</span>
                <span className="font-semibold text-amber-300">{target.estimatedValue || '€10M'}</span>
              </div>
              <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/80">
                <span className="text-[10px] text-slate-500 block uppercase font-bold">Stipendio Stimato</span>
                <span className="font-semibold text-slate-200">{target.weeklyWage || '€25k/sett'}</span>
              </div>
              <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/80">
                <span className="text-[10px] text-slate-500 block uppercase font-bold">Abilità Attuale (CA)</span>
                <span className="font-bold text-emerald-400 font-mono">{target.ca || '-'}/200</span>
              </div>
              <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/80">
                <span className="text-[10px] text-slate-500 block uppercase font-bold">Potenziale (PA)</span>
                <span className="font-bold text-sky-400 font-mono">{target.pa || '-'}/200</span>
              </div>
            </div>
          </div>

          {/* Destination Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <span>Destinazione di Tesseramento</span>
              <span className="text-rose-400">*</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Option 1: First Team */}
              <div
                onClick={() => setDestination('first_team')}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-1.5 ${
                  destination === 'first_team'
                    ? 'bg-emerald-950/30 border-emerald-500/60 ring-1 ring-emerald-500/40 shadow-sm'
                    : 'bg-slate-950 border-slate-800 hover:border-slate-700 hover:bg-slate-900/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className={`w-4 h-4 ${destination === 'first_team' ? 'text-emerald-400' : 'text-slate-400'}`} />
                    <span className="font-bold text-sm text-white">Prima Squadra</span>
                  </div>
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    destination === 'first_team' ? 'border-emerald-400 bg-emerald-500' : 'border-slate-700'
                  }`}>
                    {destination === 'first_team' && <Check className="w-2.5 h-2.5 text-slate-950 stroke-[3]" />}
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Rosa senior titolare ({firstTeamPlayers.length} calciatori). Arruolabile subito per match e rotazioni tattiche.
                </p>
              </div>

              {/* Option 2+: Youth Squads */}
              {youthSquads.length > 0 ? (
                youthSquads.map((ys) => (
                  <div
                    key={ys.id}
                    onClick={() => setDestination(ys.id)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-1.5 ${
                      destination === ys.id
                        ? 'bg-sky-950/30 border-sky-500/60 ring-1 ring-sky-500/40 shadow-sm'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700 hover:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <GraduationCap className={`w-4 h-4 ${destination === ys.id ? 'text-sky-400' : 'text-slate-400'}`} />
                        <span className="font-bold text-sm text-white truncate max-w-[170px]" title={ys.name}>
                          {ys.name}
                        </span>
                      </div>
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        destination === ys.id ? 'border-sky-400 bg-sky-500' : 'border-slate-700'
                      }`}>
                        {destination === ys.id && <Check className="w-2.5 h-2.5 text-slate-950 stroke-[3]" />}
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      {ys.category || 'Vivaio'} ({ys.players.length} calciatori). Percorso di crescita e sviluppo nel vivaio.
                    </p>
                  </div>
                ))
              ) : (
                <div
                  onClick={() => setDestination('create_u20')}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between space-y-1.5 ${
                    destination === 'create_u20'
                      ? 'bg-sky-950/30 border-sky-500/60 ring-1 ring-sky-500/40 shadow-sm'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700 hover:bg-slate-900/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GraduationCap className={`w-4 h-4 ${destination === 'create_u20' ? 'text-sky-400' : 'text-slate-400'}`} />
                      <span className="font-bold text-sm text-white">Squadra Giovanile (U20)</span>
                    </div>
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                      destination === 'create_u20' ? 'border-sky-400 bg-sky-500' : 'border-slate-700'
                    }`}>
                      {destination === 'create_u20' && <Check className="w-2.5 h-2.5 text-slate-950 stroke-[3]" />}
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Inizializza il settore giovanile inserendo il ragazzo nella rosa Primavera.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Shirt Number Picker */}
          <div className="space-y-1.5 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-emerald-400" />
                <span>Numero di Maglia Ufficiale</span>
              </label>
              {playerWithNumber ? (
                <span className="text-[11px] font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Maglia già di {playerWithNumber.name}
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Maglia #{shirtNumber} Libera
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 pt-1">
              <div className="relative w-28">
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={shirtNumber}
                  onChange={(e) => setShirtNumber(parseInt(e.target.value, 10) || 1)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-center text-base font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="text-xs text-slate-400 leading-relaxed flex-1">
                Numero suggerito in base alle maglie attualmente libere in <strong>{selectedSquadName}</strong>. Puoi impostare qualsiasi numero tra 1 e 99.
              </div>
            </div>
          </div>

          {/* Remove from Scouting Checkbox */}
          <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80">
            <label className="flex items-center space-x-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={removeFromScouting}
                onChange={(e) => setRemoveFromScouting(e.target.checked)}
                className="w-4 h-4 rounded text-emerald-600 bg-slate-900 border-slate-700 focus:ring-emerald-500 cursor-pointer"
              />
              <div>
                <span className="text-xs font-bold text-slate-200">
                  Rimuovi dalla lista degli obiettivi scouting
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  Consigliato: il calciatore è ora tesserato nel tuo club e non è più necessario monitorarlo come target esterno.
                </span>
              </div>
            </label>
          </div>

          {/* Optional Transfer Note */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400 flex items-center gap-1">
              <FileText className="w-3 h-3 text-slate-500" />
              <span>Note Aggiuntive sul Tesseramento (Opzionale)</span>
            </label>
            <input
              type="text"
              placeholder="Es. Titolarità promessa, opzione di rinnovo, acquistato per la sessione invernale..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end space-x-2.5 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Annulla
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-lg shadow-emerald-950/40 flex items-center gap-2 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Conferma Acquisto & Firma ✍️</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
