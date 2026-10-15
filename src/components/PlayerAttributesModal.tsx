import React, { useState } from 'react';
import { Player, ScoutingTarget, PlayerAttributeSnapshot, PlayerVariationAttribute, PlayerVariationInfo } from '../types';
import { getEffectiveAge } from '../utils/csvParser';
import { ProspectBadge } from './ProspectBadge';
import { PlayerVariationBadge } from './PlayerVariationBadge';
import { formatVariationDate, calculateTemporalSpan } from '../utils/attributeDiffUtils';
import { extractCopilotNoteSegments, isCopilotNote } from '../utils/copilotNoteProposals';
import {
  X,
  Shield,
  Star,
  Sparkles,
  FileText,
  ChevronRight,
  Trash2,
  Briefcase,
  ArrowUp,
  ArrowDown,
  History,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  MoveRight,
  Calendar,
  Clock,
  GraduationCap,
  Check,
  Gauge,
  Zap,
  Bot,
  Pin,
  Plane,
  AlertCircle,
  Edit2,
  UserPlus
} from 'lucide-react';

interface PlayerAttributesModalProps {
  player: Player | ScoutingTarget | null;
  onClose: () => void;
  currentDate?: string;
  onDeletePlayer?: (player: Player | ScoutingTarget) => void;
  onDemoteToYouth?: (player: Player) => void;
  onPromoteToFirstTeam?: (player: Player) => void;
  onPromoteToU20?: (player: Player) => void;
  onAskCopilot?: (prompt: string) => void;
  onUpdatePlayer?: (player: Player) => void;
  onSignScoutingTarget?: (target: ScoutingTarget) => void;
}

const ATTRIBUTE_TRANSLATIONS: Record<string, string> = {
  // Goalkeeping (Porta)
  reflexes: 'Riflessi',
  riflessi: 'Riflessi',
  handling: 'Presa',
  prese: 'Presa',
  presa: 'Presa',
  aerialability: 'Presa Alta',
  aerialreach: 'Presa Alta',
  presaalta: 'Presa Alta',
  commandofarea: "Comando dell'Area",
  comandoarea: "Comando dell'Area",
  communication: 'Comunicazione',
  comunicazione: 'Comunicazione',
  rushingout: 'Uscite',
  uscite: 'Uscite',
  oneonones: 'Uno Contro Uno',
  unocontrouno: 'Uno Contro Uno',
  kicking: 'Rinvii',
  rinvii: 'Rinvii',
  throwing: 'Rimesse con le Mani',
  rimesse: 'Rimesse con le Mani',
  tendencytopunch: 'Tendenza alla Respinta',
  tendenzapugno: 'Tendenza alla Respinta',
  eccentricity: 'Eccentricità',
  eccentricita: 'Eccentricità',

  // Technical Outfield (Tecnica Movimento)
  technique: 'Tecnica',
  tecnica: 'Tecnica',
  tackling: 'Contrasti',
  contrasti: 'Contrasti',
  penaltytaking: 'Rigori',
  rigori: 'Rigori',
  passing: 'Passaggi',
  passaggi: 'Passaggi',
  marking: 'Marcatura',
  marcatura: 'Marcatura',
  longthrows: 'Rimesse Lunghe',
  rimesselunghe: 'Rimesse Lunghe',
  longshots: 'Tiri da Fuori',
  tiridafuori: 'Tiri da Fuori',
  heading: 'Colpo di Testa',
  colpoditesta: 'Colpo di Testa',
  freekicks: 'Calci Piazzati',
  calcipiazzati: 'Calci Piazzati',
  firsttouch: 'Controllo Palla',
  controllopalla: 'Controllo Palla',
  finishing: 'Finalizzazione',
  finalizzazione: 'Finalizzazione',
  dribbling: 'Dribbling',
  crossing: 'Cross',
  cross: 'Cross',
  corners: "Calci d'Angolo",
  calcidangolo: "Calci d'Angolo",

  // Mental (Mentale)
  workrate: 'Impegno',
  impegno: 'Impegno',
  teamwork: 'Gioco di Squadra',
  giocodisquadra: 'Gioco di Squadra',
  positioning: 'Posizionamento',
  posizionamento: 'Posizionamento',
  offtheball: 'Senza Palla',
  senzapalla: 'Senza Palla',
  leadership: 'Leadership',
  flair: 'Fantasia',
  fantasia: 'Fantasia',
  determination: 'Determinazione',
  determinazione: 'Determinazione',
  decisions: 'Decisioni',
  decisioni: 'Decisioni',
  vision: 'Visione di Gioco',
  visionedigioco: 'Visione di Gioco',
  concentration: 'Concentrazione',
  concentrazione: 'Concentrazione',
  composure: 'Freddezza / Compostezza',
  compostezza: 'Freddezza / Compostezza',
  freddezza: 'Freddezza / Compostezza',
  bravery: 'Coraggio',
  coraggio: 'Coraggio',
  anticipation: 'Anticipazione',
  anticipazione: 'Anticipazione',
  aggression: 'Aggressività',
  aggressivita: 'Aggressività',

  // Physical (Fisico)
  strength: 'Forza',
  forza: 'Forza',
  stamina: 'Resistenza',
  resistenza: 'Resistenza',
  pace: 'Velocità',
  velocita: 'Velocità',
  naturalfitness: 'Integrità Fisica',
  integritafisica: 'Integrità Fisica',
  jumping: 'Elevazione',
  elevazione: 'Elevazione',
  balance: 'Equilibrio',
  equilibrio: 'Equilibrio',
  agility: 'Agilità',
  agilita: 'Agilità',
  acceleration: 'Accelerazione',
  accelerazione: 'Accelerazione',
  reattivita: 'Reattività',

  // Positions
  goalkeeper: 'Portiere (POR)',
  defenderleft: 'Terzino Sinistro (TS)',
  defenderright: 'Terzino Destro (TD)',
  defendercentral: 'Difensore Centrale (DC)',
  defensivemidfielder: 'Mediano (MED)',
  midfieldercentral: 'Centrocampista Centrale (CC)',
  midfielderleft: 'Centrocampista Sinistro (CS)',
  midfielderright: 'Centrocampista Destro (CD)',
  attackingmidleft: 'Ala Sinistra (AS)',
  attackingmidright: 'Ala Destra (AD)',
  attackingmidcentral: 'Trequartista (TRQ)',
  striker: 'Punta Centrale (PC)'
};

const formatAttributeLabel = (rawKey: string): string => {
  const norm = rawKey.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (ATTRIBUTE_TRANSLATIONS[norm]) return ATTRIBUTE_TRANSLATIONS[norm];
  return rawKey.replace(/([A-Z])/g, ' $1').trim();
};

export const PlayerAttributesModal: React.FC<PlayerAttributesModalProps> = ({
  player,
  onClose,
  currentDate,
  onDeletePlayer,
  onDemoteToYouth,
  onPromoteToFirstTeam,
  onPromoteToU20,
  onAskCopilot,
  onUpdatePlayer,
  onSignScoutingTarget
}) => {
  if (!player) return null;

  const isSquadPlayer = 'number' in player;
  const ca = player.ca || 145;
  const pa = player.pa || 170;
  const height = player.height || 185;
  const valStr = 'value' in player ? player.value : player.estimatedValue;

  const history: PlayerAttributeSnapshot[] = ('attributeHistory' in player ? player.attributeHistory : undefined) || [];
  const [selectedSnapshotIndex, setSelectedSnapshotIndex] = useState<number | 'none'>(
    history.length > 0 ? history.length - 1 : 'none'
  );

  const [fixedSuccessMessage, setFixedSuccessMessage] = useState<string | null>(null);
  const [isEditingLoanClub, setIsEditingLoanClub] = useState(false);
  const [customLoanClub, setCustomLoanClub] = useState(player && 'loanClub' in player ? (player.loanClub || '') : '');

  const handleToggleLoanStatus = (newLoanState?: boolean, clubName?: string) => {
    if (!isSquadPlayer || !onUpdatePlayer) return;
    const currentLoan = Boolean('isOnLoan' in player && (player as Player).isOnLoan);
    const nextLoan = newLoanState !== undefined ? newLoanState : !currentLoan;
    const updatedPlayer: Player = {
      ...(player as Player),
      isOnLoan: nextLoan,
      isInjured: nextLoan ? false : (player as Player).isInjured,
      loanClub: nextLoan ? (clubName !== undefined ? clubName : ((player as Player).loanClub || '')) : undefined,
    };
    onUpdatePlayer(updatedPlayer);
    setIsEditingLoanClub(false);
  };

  const activeSnapshot: PlayerAttributeSnapshot | null =
    selectedSnapshotIndex !== 'none' && history[selectedSnapshotIndex]
      ? history[selectedSnapshotIndex]
      : null;

  const caDiff = activeSnapshot?.ca !== undefined && ca !== undefined ? ca - activeSnapshot.ca : 0;
  const paDiff = activeSnapshot?.pa !== undefined && pa !== undefined ? pa - activeSnapshot.pa : 0;

  // Calcolo temporalità per lo snapshot attivo
  const effCurrentDate = player.lastUpdatedDate || currentDate || 'Attuale';
  const activeSnapshotSpan = activeSnapshot
    ? calculateTemporalSpan(activeSnapshot.date, effCurrentDate, caDiff)
    : null;

  // Check if player is a goalkeeper
  const posUpper = (player.position || '').toUpperCase();
  const isGoalkeeper =
    posUpper.includes('POR') ||
    posUpper.includes('GK') ||
    posUpper.trim() === 'P' ||
    player.position?.toLowerCase().includes('portiere') ||
    player.position?.toLowerCase().includes('goalkeeper') ||
    Boolean(player.positionsDetail?.Goalkeeper && player.positionsDetail.Goalkeeper >= 15) ||
    Boolean(player.goalkeepingAttributes && Object.keys(player.goalkeepingAttributes).length > 0);

  const [activeTab, setActiveTab] = useState<'overview' | 'goalkeeping' | 'technical' | 'mental' | 'physical' | 'history'>('overview');

  // Trova un attributo in un determinato snapshot storico
  const findAttributeInSnapshot = (snapshot: PlayerAttributeSnapshot | null, rawKey: string): number | undefined => {
    if (!snapshot) return undefined;
    const targetNorm = rawKey.toLowerCase().replace(/[^a-z0-9]/g, '');
    const pools = [
      snapshot.technicalAttributes,
      snapshot.mentalAttributes,
      snapshot.physicalAttributes,
      snapshot.goalkeepingAttributes
    ];
    for (const pool of pools) {
      if (!pool) continue;
      for (const [k, v] of Object.entries(pool)) {
        if (k.toLowerCase().replace(/[^a-z0-9]/g, '') === targetNorm) {
          return Number(v);
        }
      }
    }
    return undefined;
  };

  // Fissa lo snapshot scelto come confronto ufficiale per Copilot e i badge
  const handleFixComparisonForCopilot = (snapshot: PlayerAttributeSnapshot) => {
    if (!isSquadPlayer || !onUpdatePlayer) return;

    const currentCa = player.ca;
    const currentPa = player.pa;
    const caDifference = (currentCa !== undefined && snapshot.ca !== undefined) ? currentCa - snapshot.ca : 0;
    const paDifference = (currentPa !== undefined && snapshot.pa !== undefined) ? currentPa - snapshot.pa : 0;
    const compEndDate = player.lastUpdatedDate || currentDate || new Date().toISOString().split('T')[0];
    const temporal = calculateTemporalSpan(snapshot.date, compEndDate, caDifference);

    const changedAttrs: PlayerVariationAttribute[] = [];
    const checkPool = (category: 'Tecnico' | 'Mentale' | 'Fisico' | 'Portiere', oldAttrs?: Record<string, number>, newAttrs?: Record<string, number>) => {
      if (!newAttrs) return;
      for (const [key, val] of Object.entries(newAttrs)) {
        const oldVal = findAttributeInSnapshot(snapshot, key);
        if (oldVal !== undefined && Number(oldVal) !== Number(val)) {
          changedAttrs.push({
            name: formatAttributeLabel(key),
            category,
            oldVal: Number(oldVal),
            newVal: Number(val),
            diff: Number(val) - Number(oldVal),
          });
        }
      }
    };

    checkPool('Tecnico', snapshot.technicalAttributes, player.technicalAttributes);
    checkPool('Mentale', snapshot.mentalAttributes, player.mentalAttributes);
    checkPool('Fisico', snapshot.physicalAttributes, player.physicalAttributes);
    checkPool('Portiere', snapshot.goalkeepingAttributes, player.goalkeepingAttributes);

    const improvedAttrs = changedAttrs.filter(a => a.diff > 0);
    const declinedAttrs = changedAttrs.filter(a => a.diff < 0);

    let status: 'improved' | 'declined' | 'stable' = 'stable';
    if (caDifference > 0 || (caDifference === 0 && improvedAttrs.length > declinedAttrs.length && improvedAttrs.length > 0)) {
      status = 'improved';
    } else if (caDifference < 0 || (caDifference === 0 && declinedAttrs.length > improvedAttrs.length && declinedAttrs.length > 0)) {
      status = 'declined';
    }

    const fixedVariation: PlayerVariationInfo = {
      status,
      caDiff: caDifference,
      paDiff: paDifference,
      improvedCount: improvedAttrs.length,
      declinedCount: declinedAttrs.length,
      improvedAttrs,
      declinedAttrs,
      timestamp: Date.now(),
      date: compEndDate,
      previousDate: snapshot.date,
      currentDate: compEndDate,
      daysElapsed: temporal.daysElapsed,
      monthsElapsed: temporal.monthsElapsed,
      timeSpanLabel: temporal.timeSpanLabel,
      caPacePerMonth: temporal.caPacePerMonth,
      paceAssessment: temporal.paceAssessment,
      paceLabel: temporal.paceLabel,
    };

    const updatedPlayer: Player = {
      ...(player as Player),
      lastVariation: fixedVariation,
    };

    onUpdatePlayer(updatedPlayer);
    setFixedSuccessMessage(`Intervallo fissato con successo: ${snapshot.date} → ${compEndDate} (${temporal.timeSpanLabel}). Il Copilot e i badge useranno queste date per l'analisi!`);
    setTimeout(() => setFixedSuccessMessage(null), 4000);
  };

  // Invia query guidata al Copilot includendo arco temporale, ritmo e date
  const handleAskCopilotGrowth = (snapshot: PlayerAttributeSnapshot) => {
    if (!onAskCopilot) return;
    const compEndDate = player.lastUpdatedDate || currentDate || 'Attuale';
    const caDifference = (player.ca !== undefined && snapshot.ca !== undefined) ? player.ca - snapshot.ca : 0;
    const temporal = calculateTemporalSpan(snapshot.date, compEndDate, caDifference);
    const diffSign = caDifference > 0 ? `+${caDifference}` : `${caDifference}`;
    const effAge = getEffectiveAge(player, currentDate);
    const prompt = `Analizza la crescita temporale di ${player.name} nel periodo dal ${snapshot.date} al ${compEndDate} (${temporal.timeSpanLabel}). In questo intervallo ha registrato una variazione CA di ${diffSign} con un ritmo di ${temporal.paceLabel}. Valuta l'efficacia di questo sviluppo in base alla sua età (${effAge} anni), al potenziale (PA ${player.pa || 'N/D'}) e al tempo trascorso, suggerendo il piano d'allenamento ideale per il futuro.`;
    onAskCopilot(prompt);
    onClose();
  };

  // Extract or generate realistic goalkeeping attributes
  const getGoalkeepingAttributes = (): Record<string, number> => {
    if (player.goalkeepingAttributes && Object.keys(player.goalkeepingAttributes).length > 0) {
      return player.goalkeepingAttributes;
    }
    // Check if technicalAttributes contains GK attributes
    if (player.technicalAttributes) {
      const gkKeys = [
        'riflessi', 'prese', 'presa', 'uscite', 'unocontrouno', 'presaalta',
        'comandoarea', 'comunicazione', 'rinvii', 'rimesse', 'tendenzapugno',
        'eccentricita', 'reflexes', 'handling', 'rushingout', 'oneonones',
        'aerialreach', 'aerialability', 'commandofarea', 'communication',
        'kicking', 'throwing', 'tendencytopunch', 'eccentricity'
      ];
      const foundGk: Record<string, number> = {};
      for (const [k, v] of Object.entries(player.technicalAttributes)) {
        if (gkKeys.includes(k.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
          foundGk[k] = Number(v);
        }
      }
      if (Object.keys(foundGk).length > 0) return foundGk;
    }

    // If isGoalkeeper, generate realistic baseline values centered on CA
    if (isGoalkeeper) {
      const base = Math.min(18, Math.max(8, Math.round((ca / 200) * 16 + 2)));
      return {
        riflessi: Math.min(20, Math.max(1, base + 1)),
        prese: Math.min(20, Math.max(1, base)),
        uscite: Math.min(20, Math.max(1, base)),
        unoControUno: Math.min(20, Math.max(1, base + 1)),
        presaAlta: Math.min(20, Math.max(1, base)),
        comandoArea: Math.min(20, Math.max(1, base)),
        rinvii: Math.min(20, Math.max(1, Math.max(10, base - 1))),
        rimesse: Math.min(20, Math.max(1, Math.max(10, base - 1))),
        comunicazione: Math.min(20, Math.max(1, base - 1)),
        tendenzaPugno: Math.min(20, Math.max(1, Math.max(6, base - 3))),
        eccentricita: Math.min(20, Math.max(1, Math.max(4, base - 5))),
      };
    }
    return {};
  };

  const gkAttrs = getGoalkeepingAttributes();

  // Helper for FM style attribute color coding
  const getAttrBadgeClass = (val: number) => {
    if (val >= 16) return 'bg-amber-500/20 text-amber-300 font-black border-amber-500/40';
    if (val >= 13) return 'bg-emerald-500/20 text-emerald-400 font-bold border-emerald-500/40';
    if (val >= 10) return 'bg-slate-800 text-slate-200 border-slate-700';
    return 'bg-slate-900 text-slate-400 border-slate-800';
  };

  const renderAttributeGrid = (attributes?: Record<string, number>, title?: string, isGkGrid = false) => {
    if (!attributes || Object.keys(attributes).length === 0) {
      return (
        <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-500 text-center">
          Nessun attributo specifico {title ? title.toLowerCase() : ''} specificato per questo giocatore.
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {Object.entries(attributes).map(([attrKey, attrVal]) => {
          const oldVal = findAttributeInSnapshot(activeSnapshot, attrKey);
          const hasDiff = oldVal !== undefined && Number(oldVal) !== Number(attrVal);
          const diff = hasDiff ? Number(attrVal) - Number(oldVal) : 0;

          return (
            <div
              key={attrKey}
              className={`border p-2.5 rounded-xl flex items-center justify-between transition-colors ${
                isGkGrid ? 'bg-slate-950/90 border-amber-500/20 hover:border-amber-500/40' : 'bg-slate-950 border-slate-800/80 hover:border-slate-700'
              }`}
            >
              <span className="text-xs text-slate-300 capitalize font-medium truncate mr-2" title={formatAttributeLabel(attrKey)}>
                {formatAttributeLabel(attrKey)}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                {hasDiff && diff > 0 && (
                  <span
                    className="text-[10px] text-emerald-400 bg-emerald-500/20 px-1 py-0.5 rounded border border-emerald-500/30 font-mono font-bold flex items-center"
                    title={`Crescita da ${oldVal} a ${attrVal} (+${diff})`}
                  >
                    ▲+{diff}
                  </span>
                )}
                {hasDiff && diff < 0 && (
                  <span
                    className="text-[10px] text-rose-400 bg-rose-500/20 px-1 py-0.5 rounded border border-rose-500/30 font-mono font-bold flex items-center"
                    title={`Calo da ${oldVal} a ${attrVal} (${diff})`}
                  >
                    ▼{diff}
                  </span>
                )}
                <span
                  className={`text-xs px-2 py-0.5 rounded-lg border font-mono ${getAttrBadgeClass(Number(attrVal))}`}
                >
                  {attrVal}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden my-6">
        {/* Header */}
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-11 h-11 border rounded-2xl flex items-center justify-center font-black shadow-lg ${
              isSquadPlayer && 'isInjured' in player && player.isInjured
                ? 'bg-rose-950 border-rose-500/60 text-rose-300'
                : isSquadPlayer && 'isOnLoan' in player && player.isOnLoan
                ? 'bg-blue-950 border-blue-500/60 text-blue-300'
                : isGoalkeeper
                ? 'bg-amber-950/80 border-amber-500/50 text-amber-300'
                : 'bg-[#721c24] border-red-500/40 text-white'
            }`}>
              {isSquadPlayer ? `#${player.number}` : isGoalkeeper ? '🧤' : <Star className="w-5 h-5 text-amber-300" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className={`text-base font-bold tracking-tight ${
                  isSquadPlayer && 'isInjured' in player && player.isInjured
                    ? 'text-rose-400'
                    : isSquadPlayer && 'isOnLoan' in player && player.isOnLoan
                    ? 'text-blue-400'
                    : 'text-white'
                }`}>
                  {player.name}
                </h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono font-bold flex items-center gap-1 ${
                  isGoalkeeper
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}>
                  {isGoalkeeper ? '🧤 ' : ''}{player.position}
                </span>
                {isSquadPlayer && <PlayerVariationBadge player={player as Player} size="sm" showTimestamp={false} />}
                <ProspectBadge pa={player.pa} age={getEffectiveAge(player, currentDate)} size="sm" />
                {isSquadPlayer && 'isPlayerStaff' in player && player.isPlayerStaff && (
                  <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/40 font-bold flex items-center gap-1 shadow-sm">
                    <Briefcase className="w-3 h-3 text-purple-400" /> GIOCATORE/STAFF {player.staffRole ? `(${player.staffRole})` : ''}
                  </span>
                )}
                {isSquadPlayer && 'availableForYouth' in player && Boolean((player as Player).availableForYouth) && (
                  <span
                    className="text-[10px] bg-teal-500/20 text-teal-300 px-2 py-0.5 rounded-full border border-teal-500/40 font-bold flex items-center gap-1 shadow-sm"
                    title={`Si allena con la rosa titolare • Disponibile per ${(player as Player).youthSquadDesignation || 'Giovanili'} (${(player as Player).youthMatchMinutes || 'Fino a 90 min'})`}
                  >
                    <GraduationCap className="w-3 h-3 text-teal-400" />
                    DISP. GIOVANILI {(player as Player).youthSquadDesignation ? `(${(player as Player).youthSquadDesignation})` : ''}
                  </span>
                )}
                {isSquadPlayer && 'isInjured' in player && player.isInjured && (
                  <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2.5 py-0.5 rounded-full border border-rose-500/40 font-bold flex items-center gap-1.5 shadow-sm">
                    <span>🚑 INFORTUNATO</span>
                    {'injuryNote' in player && player.injuryNote && (
                      <span className="text-rose-200/90 font-normal">({player.injuryNote})</span>
                    )}
                  </span>
                )}
                {isSquadPlayer && 'isOnLoan' in player && player.isOnLoan ? (
                  <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full border border-blue-500/40 font-bold flex items-center gap-1.5 shadow-sm">
                    <span>✈️ PRESTITO {player.loanClub ? `(${player.loanClub})` : ''}</span>
                    {onUpdatePlayer && (
                      <button
                        type="button"
                        onClick={() => handleToggleLoanStatus(false)}
                        className="hover:text-white hover:bg-blue-500/30 rounded-full p-0.5 transition-colors cursor-pointer"
                        title="Rientrato dal prestito (rimuovi flag prestito)"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </span>
                ) : isSquadPlayer && onUpdatePlayer ? (
                  <button
                    type="button"
                    onClick={() => handleToggleLoanStatus(true)}
                    className="text-[10px] bg-slate-800/80 hover:bg-blue-950/60 text-slate-400 hover:text-blue-300 px-2 py-0.5 rounded-full border border-slate-700/80 hover:border-blue-500/40 font-medium flex items-center gap-1 transition-all cursor-pointer"
                    title="Segna giocatore come ceduto in prestito (Flag ufficiale per AI Copilot)"
                  >
                    <Plane className="w-3 h-3 text-slate-400 group-hover:text-blue-300" />
                    <span>+ In Prestito</span>
                  </button>
                ) : null}
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-2 mt-0.5 flex-wrap">
                <span>{'nationality' in player ? player.nationality : player.currentClub}</span>
                <span>•</span>
                <span>{getEffectiveAge(player, currentDate)} anni</span>
                <span>•</span>
                <span>{height} cm</span>
                <span>•</span>
                <span className="text-amber-400 font-semibold">{valStr || '€15M'}</span>
                {isSquadPlayer && (
                  <>
                    <span>•</span>
                    <span className="text-slate-400 font-medium flex items-center gap-1 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800">
                      <Clock className="w-3 h-3 text-emerald-400" />
                      <span>Ultimo CSV: {formatVariationDate((player as Player).lastUpdatedTimestamp, (player as Player).lastUpdatedDate)}</span>
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {!isSquadPlayer && onSignScoutingTarget && (
              <button
                type="button"
                onClick={() => {
                  onSignScoutingTarget(player as ScoutingTarget);
                }}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500/40 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-emerald-950/40"
                title="Conferma l'acquisto e tesseramento di questo giocatore"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Acquista Giocatore</span>
                <span className="sm:hidden">Acquista</span>
              </button>
            )}
            {onAskCopilot && (
              <button
                onClick={() => {
                  onClose();
                  onAskCopilot(`Fai un'analisi e un confronto numerico approfondito sulla scheda FM completa di ${player.name} (${player.position}, ${isSquadPlayer ? 'Giocatore della Rosa' : `Obiettivo di Scouting [Club: ${(player as ScoutingTarget).currentClub || 'N/D'}]`}, CA: ${ca}, PA: ${pa}, Altezza: ${height}cm). Analizza la scheda dettagliata (Tecnica, Mentale, Fisica in scala 1-20), punti di forza, lacune numeriche e confrontalo con i giocatori del nostro organico nello stesso ruolo.`);
                }}
                className="px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Chiedi al Copilot un'analisi e confronto numerico"
              >
                <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden sm:inline">Chiedi al Copilot</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* CA/PA Ability Banner & History Comparison */}
        <div className="bg-slate-950/60 border-b border-slate-800 px-6 py-3 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-6 text-xs flex-wrap gap-y-1">
            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">Abilità Attuale (CA):</span>
              <span className="font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                {ca} / 200
              </span>
              {isSquadPlayer && (
                <PlayerVariationBadge player={player as Player} size="xs" showTimestamp={false} />
              )}
              {activeSnapshot && (
                <span
                  className={`font-mono text-[11px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-1 ${
                    caDiff > 0
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : caDiff < 0
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : 'bg-slate-800 text-white border-slate-700'
                  }`}
                  title={`Confronto CA con rilevazione del ${activeSnapshot.date}: ${caDiff > 0 ? `+${caDiff}` : caDiff < 0 ? `${caDiff}` : 'Livello stabile (0)'}`}
                >
                  {caDiff > 0 ? (
                    <>
                      <TrendingUp className="w-3 h-3 text-emerald-400" />
                      <span>+{caDiff}</span>
                    </>
                  ) : caDiff < 0 ? (
                    <>
                      <TrendingDown className="w-3 h-3 text-rose-400" />
                      <span>{caDiff}</span>
                    </>
                  ) : (
                    <>
                      <MoveRight className="w-3 h-3 text-slate-200" />
                      <span>0</span>
                    </>
                  )}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium">Potenziale (PA):</span>
              <span className="font-mono font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
                {pa} / 200
              </span>
              {activeSnapshot && paDiff !== 0 && (
                <span
                  className={`font-mono text-[11px] font-bold px-1.5 py-0.5 rounded border ${
                    paDiff > 0
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  }`}
                >
                  {paDiff > 0 ? `+${paDiff}` : paDiff}
                </span>
              )}
              <ProspectBadge pa={pa} age={getEffectiveAge(player, currentDate)} size="sm" />
            </div>

            <div className="hidden sm:flex items-center gap-2">
              <span className="text-slate-400 font-medium">Margine di Crescita:</span>
              <span className="font-mono text-purple-400 font-semibold">
                +{Math.max(0, pa - ca)} CA
              </span>
            </div>
          </div>

          {history.length > 0 ? (
            <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded-xl border border-slate-800 text-[11px]">
              <History className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-slate-400 hidden sm:inline">Delta vs:</span>
              <select
                value={selectedSnapshotIndex}
                onChange={(e) => setSelectedSnapshotIndex(e.target.value === 'none' ? 'none' : Number(e.target.value))}
                className="bg-slate-950 text-slate-200 text-[11px] rounded-lg border border-slate-700 px-2 py-0.5 font-medium cursor-pointer"
              >
                <option value="none">Nessun delta</option>
                {history.map((snap, idx) => (
                  <option key={idx} value={idx}>
                    {idx === history.length - 1 ? `Ultimo snapshot (${snap.date})` : `Snapshot ${snap.date} (CA: ${snap.ca ?? 'N/D'})`}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="text-[11px] text-slate-400 font-mono bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
              {player.homegrown}
            </div>
          )}
        </div>

        {/* Notifica di successo per fissaggio date di confronto */}
        {fixedSuccessMessage && (
          <div className="bg-emerald-950/80 border-b border-emerald-500/50 px-6 py-2.5 text-xs text-emerald-300 flex items-center justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-medium">{fixedSuccessMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setFixedSuccessMessage(null)}
              className="text-emerald-400 hover:text-emerald-200 text-xs px-1.5 py-0.5 rounded cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Banner di confronto temporale attivo per snapshot selezionato */}
        {activeSnapshot && activeSnapshotSpan && (
          <div className="bg-slate-950/90 border-b border-slate-800/80 px-6 py-2.5 flex items-center justify-between flex-wrap gap-2.5 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-400 flex items-center gap-1.5 font-medium">
                <Calendar className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-slate-200 font-semibold">{activeSnapshot.date}</span>
                <MoveRight className="w-3.5 h-3.5 text-slate-500 inline shrink-0" />
                <span className="text-slate-200 font-semibold">{player.lastUpdatedDate || currentDate || 'Attuale'}</span>
              </span>
              <span className="text-slate-600 font-mono hidden sm:inline">•</span>
              <span className="text-slate-300 font-medium flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                <Clock className="w-3 h-3 text-cyan-400 shrink-0" />
                {activeSnapshotSpan.timeSpanLabel}
              </span>
              <span
                className={`px-2 py-0.5 rounded border font-semibold flex items-center gap-1 ${
                  activeSnapshotSpan.paceAssessment === 'rapida'
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                    : activeSnapshotSpan.paceAssessment === 'regolare'
                    ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                    : activeSnapshotSpan.paceAssessment === 'lenta'
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                    : (activeSnapshotSpan.paceAssessment === 'calo_rapido' || activeSnapshotSpan.paceAssessment === 'calo_graduale')
                    ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
                }`}
              >
                <Gauge className="w-3 h-3 shrink-0" />
                {activeSnapshotSpan.paceLabel}
              </span>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {isSquadPlayer && onUpdatePlayer && (
                <button
                  type="button"
                  onClick={() => handleFixComparisonForCopilot(activeSnapshot)}
                  title="Fissa questo intervallo di date e variazioni per il Copilot e i badge"
                  className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Pin className="w-3 h-3" />
                  Fissa per Copilot
                </button>
              )}
              {onAskCopilot && (
                <button
                  type="button"
                  onClick={() => handleAskCopilotGrowth(activeSnapshot)}
                  title="Invia al Copilot per analizzare la crescita con queste date e ritmo"
                  className="bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 text-[11px] font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Bot className="w-3 h-3" />
                  Chiedi al Copilot
                </button>
              )}
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="bg-slate-900 px-6 pt-3 border-b border-slate-800 flex space-x-2 overflow-x-auto">
          {(isGoalkeeper
            ? [
                { id: 'overview', label: 'Panoramica & Ruoli' },
                { id: 'goalkeeping', label: 'Attributi Porta 🧤' },
                { id: 'mental', label: 'Mentale 🧠' },
                { id: 'physical', label: 'Fisico & Posizioni ⚡' },
                { id: 'technical', label: 'Movimento / Piedi 👟' },
                { id: 'history', label: history.length > 0 ? `Storico & Crescita (${history.length}) 📈` : 'Storico & Crescita 📈' }
              ]
            : [
                { id: 'overview', label: 'Panoramica & Ruoli' },
                { id: 'technical', label: 'Tecnica' },
                { id: 'mental', label: 'Mentale' },
                { id: 'physical', label: 'Fisico & Posizioni' },
                { id: 'history', label: history.length > 0 ? `Storico & Crescita (${history.length}) 📈` : 'Storico & Crescita 📈' }
              ]
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-2.5 text-xs font-semibold border-b-2 transition-all px-2.5 whitespace-nowrap cursor-pointer ${
                activeTab === tab.id
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Contents */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              {isSquadPlayer && 'isPlayerStaff' in player && player.isPlayerStaff && (
                <div className="bg-purple-950/30 border border-purple-800/60 rounded-xl p-3.5 flex items-start gap-3">
                  <div className="p-2 bg-purple-900/50 rounded-lg text-purple-300 shrink-0 mt-0.5">
                    <Briefcase className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-purple-200">
                      Investimento Quadri Tecnici Societari & Staff
                    </h4>
                    <p className="text-xs text-purple-300/80 mt-0.5 leading-relaxed">
                      Questo giocatore è contrassegnato come risorsa per lo staff tecnico societario {player.staffRole ? `(Ruolo: ${player.staffRole})` : ''}. Non viene considerato un esubero nelle analisi e valutazioni della rosa.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-2">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" /> Ruoli Migliori & Mansioni
                  </h4>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {('bestRoles' in player ? player.bestRoles : player.roles).map((r, i) => (
                      <span
                        key={i}
                        className={`text-xs px-2.5 py-1 rounded-lg font-medium border ${
                          isGoalkeeper
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                            : 'bg-slate-900 border-slate-800 text-emerald-400'
                        }`}
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-amber-400" /> Note & Valutazione Strategica
                    </h4>
                    {player.notes && isCopilotNote(player.notes) && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
                        <Bot className="w-3 h-3 text-cyan-400" />
                        Accordi Copilot AI
                      </span>
                    )}
                  </div>

                  {/* Smart Indicator for Loan Sync & AI Copilot */}
                  {isSquadPlayer && (
                    <>
                      {/* Case 1: Notes mention loan, but official loan flag is FALSE */}
                      {!('isOnLoan' in player && player.isOnLoan) && player.notes && /\b(prestit|ceduto in prestito|loan)\b/i.test(player.notes) && (
                        <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-3 space-y-2 text-xs">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-1.5 font-bold text-amber-300">
                              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                              <span>Nota con menzione di prestito • Flag Ufficiale NON attivo</span>
                            </div>
                            {onUpdatePlayer && (
                              <button
                                type="button"
                                onClick={() => handleToggleLoanStatus(true)}
                                className="px-2.5 py-1 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 border border-blue-500/40 text-[11px] font-semibold shrink-0 cursor-pointer flex items-center gap-1 transition-colors"
                              >
                                <Plane className="w-3 h-3 text-blue-400" />
                                <span>Attiva Flag Prestito</span>
                              </button>
                            )}
                          </div>
                          <p className="text-slate-300 text-[11px] leading-relaxed">
                            Questa nota contiene riferimenti al prestito. Il Copilot AI sa che il calciatore è <strong>regolarmente IN ROSA</strong> perché il flag ufficiale non è spuntato (evita errori da vecchie note non aggiornate). Se invece il giocatore è attualmente ceduto in prestito, clicca su &quot;Attiva Flag Prestito&quot;.
                          </p>
                        </div>
                      )}

                      {/* Case 2: Official loan flag is TRUE */}
                      {'isOnLoan' in player && player.isOnLoan && (
                        <div className="bg-blue-950/40 border border-blue-500/40 rounded-xl p-3 space-y-2 text-xs">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5 font-bold text-blue-300">
                              <Plane className="w-4 h-4 text-blue-400 shrink-0" />
                              <span>Flag Ufficiale Copilot AI: In Prestito Attivo {player.loanClub ? `(${player.loanClub})` : ''}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {!isEditingLoanClub ? (
                                <button
                                  type="button"
                                  onClick={() => setIsEditingLoanClub(true)}
                                  className="px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-semibold cursor-pointer flex items-center gap-1"
                                  title="Modifica club di destinazione"
                                >
                                  <Edit2 className="w-2.5 h-2.5 text-blue-400" />
                                  <span>{player.loanClub ? 'Modifica Club' : 'Inserisci Club'}</span>
                                </button>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    placeholder="Es. Monza, Girona..."
                                    value={customLoanClub}
                                    onChange={(e) => setCustomLoanClub(e.target.value)}
                                    className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-white w-28 focus:outline-none focus:border-blue-500"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleToggleLoanStatus(true, customLoanClub)}
                                    className="p-1 rounded bg-blue-600 text-white text-xs hover:bg-blue-500 cursor-pointer"
                                    title="Salva club"
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                              {onUpdatePlayer && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleLoanStatus(false)}
                                  className="px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-[10px] font-semibold cursor-pointer transition-colors"
                                  title="Rimuovi flag prestito e fallo tornare in rosa"
                                >
                                  Segna Rientrato
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="text-slate-300 text-[11px] leading-relaxed">
                            Questo calciatore è contrassegnato con il flag ufficiale: il Copilot sa inequivocabilmente che è ceduto in prestito, lo esclude dalle formazioni e legge le note come tabellino esterno.
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  {!player.notes || !player.notes.trim() ? (
                    <p className="text-xs text-slate-400 italic pt-1">
                      Nessuna nota aggiuntiva specificata per questo calciatore.
                    </p>
                  ) : (
                    <div className="space-y-2.5 pt-1">
                      {extractCopilotNoteSegments(player.notes).map((seg, sIdx) => {
                        if (seg.isCopilot) {
                          return (
                            <div
                              key={sIdx}
                              className="bg-cyan-950/30 border border-cyan-500/30 rounded-lg p-3 space-y-1.5 transition-colors"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-200 text-[10px] font-bold border border-cyan-500/40">
                                    <Bot className="w-3 h-3 text-cyan-400" />
                                    {seg.headerTag || '[Copilot AI]'}
                                  </span>
                                  <span className="text-[10px] text-cyan-400/80 font-medium">
                                    Nota concordata con il Co-Allenatore
                                  </span>
                                </div>
                                {onAskCopilot && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onAskCopilot(`Rivediamo la nota concordata per ${player.name}: "${seg.body}". Quali aggiornamenti o prossimi passi consigli per la sua gestione?`);
                                      onClose();
                                    }}
                                    className="text-[10px] text-cyan-300 hover:text-cyan-100 bg-cyan-900/40 hover:bg-cyan-900/60 px-2 py-0.5 rounded border border-cyan-500/30 flex items-center gap-1 transition-colors cursor-pointer"
                                  >
                                    <Sparkles className="w-2.5 h-2.5" />
                                    Rivedi con Copilot
                                  </button>
                                )}
                              </div>
                              <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                                {seg.body}
                              </p>
                            </div>
                          );
                        }

                        return (
                          <div key={sIdx} className="bg-slate-900/60 border border-slate-800/80 rounded-lg p-2.5">
                            <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                              {seg.body}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Highlight attributes for Goalkeeper */}
              {isGoalkeeper ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-amber-400" /> Profilo Tecnico Portiere FM:
                    </h4>
                    <button
                      onClick={() => setActiveTab('goalkeeping')}
                      className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      Vedi tutti in porta <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-slate-950 border border-amber-500/30 p-3 rounded-xl space-y-2">
                      <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1 block">
                        🧤 Porta Top
                      </span>
                      {renderAttributeGrid(gkAttrs, 'porta', true)}
                    </div>

                    <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-2">
                      <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
                        🧠 Mentale Top
                      </span>
                      {renderAttributeGrid(player.mentalAttributes, 'mentale')}
                    </div>

                    <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-2">
                      <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider block">
                        ⚡ Fisico Top
                      </span>
                      {renderAttributeGrid(player.physicalAttributes, 'fisico')}
                    </div>
                  </div>
                </div>
              ) : (
                /* Highlight attributes for Outfield Player */
                (player.technicalAttributes || player.mentalAttributes || player.physicalAttributes) && (
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Principali Attributi FM Rilevati:
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-2">
                        <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">
                          Tecnica Top
                        </span>
                        {renderAttributeGrid(player.technicalAttributes, 'tecnico')}
                      </div>

                      <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-2">
                        <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
                          Mentale Top
                        </span>
                        {renderAttributeGrid(player.mentalAttributes, 'mentale')}
                      </div>

                      <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-2">
                        <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider block">
                          Fisico Top
                        </span>
                        {renderAttributeGrid(player.physicalAttributes, 'fisico')}
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          {/* Dedicated Goalkeeping Attributes Tab */}
          {activeTab === 'goalkeeping' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-amber-400" /> Attributi Portiere / Tra i Pali (Scala 1 - 20):
                </h4>
                <span className="text-[11px] text-slate-400 font-mono">
                  Ruolo Primario: {player.position}
                </span>
              </div>
              {renderAttributeGrid(gkAttrs, 'portiere', true)}
            </div>
          )}

          {activeTab === 'technical' && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                {isGoalkeeper ? 'Attributi di Movimento & Gioco con i Piedi (1 - 20):' : 'Attributi Tecnici (1 - 20):'}
              </h4>
              {renderAttributeGrid(player.technicalAttributes, 'tecnico')}
            </div>
          )}

          {activeTab === 'mental' && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Attributi Mentali (1 - 20):
              </h4>
              {renderAttributeGrid(player.mentalAttributes, 'mentale')}
            </div>
          )}

          {activeTab === 'physical' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Attributi Fisici (1 - 20):
                </h4>
                {renderAttributeGrid(player.physicalAttributes, 'fisico')}
              </div>

              {player.positionsDetail && Object.keys(player.positionsDetail).length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Idoneità Posizioni (Rating 1 - 20):
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(player.positionsDetail).map(([pName, pVal]) => (
                      <div
                        key={pName}
                        className="bg-slate-950 border border-slate-800 p-2 rounded-xl flex items-center justify-between text-xs"
                      >
                        <span className="text-slate-300 font-medium">{formatAttributeLabel(pName)}</span>
                        <span className={`px-2 py-0.5 rounded border font-mono ${getAttrBadgeClass(Number(pVal))}`}>
                          {pVal}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="space-y-4">
              {/* Info Header */}
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex items-start justify-between gap-4 flex-wrap">
                <div className="max-w-xl">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                    <History className="w-4 h-4 text-emerald-400" />
                    Storico Rilevazioni & Progressione Attributi
                  </h4>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Ogni volta che carichi un nuovo file CSV aggiornando la rosa, il sistema archivia automaticamente lo stato precedente per consentirti di monitorare la crescita e i cambiamenti nel tempo.
                  </p>
                </div>

                {onAskCopilot && history.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onAskCopilot(`Analizza la progressione e la crescita storica di ${player.name} (${player.position}, CA attuale: ${ca}, PA: ${pa}). Confronta le ${history.length} rilevazioni registrate nel tempo (a partire dal ${history[0]?.date || 'inizio'}) e metti in evidenza i miglioramenti negli attributi tecnici, mentali e fisici o eventuali cali.`);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                    <span>Chiedi al Copilot l'Analisi di Crescita</span>
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <div className="p-8 text-center bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
                  <Calendar className="w-8 h-8 text-slate-600 mx-auto" />
                  <h5 className="text-xs font-bold text-slate-300">Nessuna rilevazione precedente registrata</h5>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Questo giocatore ha attualmente solo la versione base. Al prossimo import da file CSV (sia in modalità Merge che Sostituisci), i valori attuali verranno salvati nello storico e vedrai qui l'evoluzione di CA, PA e attributi.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400 flex-wrap gap-2">
                    <span className="font-semibold text-slate-300">
                      Rilevazioni Archiviate: {history.length} snapshot
                    </span>
                    {history[0]?.ca !== undefined && (
                      <span className="font-mono font-bold flex items-center gap-1 text-xs">
                        <span className="text-slate-400 font-normal">Progressione totale CA:</span>
                        <span className="text-slate-200">{history[0].ca} → {ca}</span>
                        {ca - history[0].ca > 0 ? (
                          <span className="text-emerald-400 font-bold">(+{ca - history[0].ca})</span>
                        ) : ca - history[0].ca < 0 ? (
                          <span className="text-rose-400 font-bold">({ca - history[0].ca})</span>
                        ) : (
                          <span className="text-white font-bold inline-flex items-center gap-0.5" title="Livello stabile (0)">
                            (<MoveRight className="w-2.5 h-2.5 text-slate-200" /> 0)
                          </span>
                        )}
                      </span>
                    )}
                  </div>

                    <div className="space-y-3">
                    {[...history].reverse().map((snap, revIdx) => {
                      const snapIdx = history.length - 1 - revIdx;
                      const snapCaDiff = snap.ca !== undefined ? ca - snap.ca : 0;
                      const isSelected = selectedSnapshotIndex === snapIdx;
                      const snapSpan = calculateTemporalSpan(snap.date, player.lastUpdatedDate || currentDate || 'Attuale', snapCaDiff);

                      // Calcola attributi variati rispetto a questo snapshot
                      const changedAttrs: { name: string; oldVal: number; currentVal: number; diff: number }[] = [];
                      const allCurrentAttrs = {
                        ...(player.technicalAttributes || {}),
                        ...(player.mentalAttributes || {}),
                        ...(player.physicalAttributes || {}),
                        ...(player.goalkeepingAttributes || {}),
                      };

                      for (const [k, v] of Object.entries(allCurrentAttrs)) {
                        const oldVal = findAttributeInSnapshot(snap, k);
                        if (oldVal !== undefined && Number(oldVal) !== Number(v)) {
                          changedAttrs.push({
                            name: formatAttributeLabel(k),
                            oldVal: Number(oldVal),
                            currentVal: Number(v),
                            diff: Number(v) - Number(oldVal)
                          });
                        }
                      }

                      return (
                        <div
                          key={revIdx}
                          className={`p-3.5 rounded-xl border transition-all ${
                            isSelected
                              ? 'bg-slate-950 border-emerald-500/60 shadow-lg shadow-emerald-950/20'
                              : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                Rilevazione del {snap.date}
                              </span>
                              {revIdx === 0 && (
                                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-1.5 py-0.5 rounded border border-emerald-500/30">
                                  Ultima prima dell'attuale
                                </span>
                              )}
                              <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded border border-slate-800/80">
                                <Clock className="w-3 h-3 text-cyan-400" />
                                {snapSpan.timeSpanLabel}
                              </span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold flex items-center gap-1 ${
                                  snapSpan.paceAssessment === 'rapida'
                                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                    : snapSpan.paceAssessment === 'regolare'
                                    ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                                    : snapSpan.paceAssessment === 'lenta'
                                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                    : (snapSpan.paceAssessment === 'calo_rapido' || snapSpan.paceAssessment === 'calo_graduale')
                                    ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                                    : 'bg-slate-800 text-slate-300 border-slate-700'
                                }`}
                              >
                                <Gauge className="w-2.5 h-2.5" />
                                {snapSpan.paceLabel}
                              </span>
                              {snap.value && (
                                <span className="text-[11px] text-amber-400 font-semibold">
                                  • {snap.value}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                              {snap.ca !== undefined && (
                                <span className="text-xs font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-slate-200 inline-flex items-center gap-1">
                                  <span>CA: {snap.ca}</span>
                                  {snapCaDiff > 0 ? (
                                    <span className="text-emerald-400 font-bold">
                                      (+{snapCaDiff})
                                    </span>
                                  ) : snapCaDiff < 0 ? (
                                    <span className="text-rose-400 font-bold">
                                      ({snapCaDiff})
                                    </span>
                                  ) : (
                                    <span className="text-white font-bold inline-flex items-center gap-0.5" title="Livello stabile (0)">
                                      (<MoveRight className="w-2.5 h-2.5 text-slate-200" /> 0)
                                    </span>
                                  )}
                                </span>
                              )}
                              {snap.pa !== undefined && (
                                <span className="text-xs font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-slate-200">
                                  PA: {snap.pa}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => setSelectedSnapshotIndex(snapIdx)}
                                className={`text-[11px] px-2 py-0.5 rounded-lg border font-semibold transition-colors cursor-pointer ${
                                  isSelected
                                    ? 'bg-emerald-600 text-white border-emerald-500'
                                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                                }`}
                              >
                                {isSelected ? '✓ In Confronto' : 'Confronta'}
                              </button>

                              {isSquadPlayer && onUpdatePlayer && (
                                <button
                                  type="button"
                                  onClick={() => handleFixComparisonForCopilot(snap)}
                                  title="Fissa questo snapshot come confronto ufficiale per il Copilot e la rosa"
                                  className="text-[11px] px-2 py-0.5 rounded-lg border font-semibold bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border-emerald-500/40 flex items-center gap-1 transition-colors cursor-pointer"
                                >
                                  <Pin className="w-3 h-3" />
                                  Fissa per Copilot
                                </button>
                              )}

                              {onAskCopilot && (
                                <button
                                  type="button"
                                  onClick={() => handleAskCopilotGrowth(snap)}
                                  title="Chiedi al Copilot l'analisi di sviluppo su questo arco temporale"
                                  className="text-[11px] px-2 py-0.5 rounded-lg border font-semibold bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 border-cyan-500/40 flex items-center gap-1 transition-colors cursor-pointer"
                                >
                                  <Bot className="w-3 h-3" />
                                  Copilot
                                </button>
                              )}
                            </div>
                          </div>

                          {snap.notes && (
                            <p className="text-xs text-slate-400 italic mt-2 bg-slate-900/60 p-2 rounded-lg border border-slate-800/80">
                              "{snap.notes}"
                            </p>
                          )}

                          {changedAttrs.length > 0 && (
                            <div className="mt-2.5 pt-2 border-t border-slate-800/80">
                              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                                Variazioni di attributi ({changedAttrs.length} caratteristiche):
                              </span>
                              <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                                {changedAttrs.map((caItem) => (
                                  <span
                                    key={caItem.name}
                                    className={`text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${
                                      caItem.diff > 0
                                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                        : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                                    }`}
                                  >
                                    {caItem.diff > 0 ? <ArrowUpRight className="w-2.5 h-2.5" /> : <ArrowDownRight className="w-2.5 h-2.5" />}
                                    {caItem.name}: {caItem.oldVal} → {caItem.currentVal} ({caItem.diff > 0 ? `+${caItem.diff}` : caItem.diff})
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-950 px-6 py-3.5 border-t border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
              ID: {player.id}
            </span>
            {isSquadPlayer && onPromoteToU20 && (
              <button
                type="button"
                onClick={() => {
                  onPromoteToU20(player as Player);
                  onClose();
                }}
                className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                title="Promuovi questo giovane nella formazione Under 20 / Primavera"
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-indigo-400" />
                <span>Promuovi in U20</span>
              </button>
            )}
            {isSquadPlayer && onPromoteToFirstTeam && (
              <button
                type="button"
                onClick={() => {
                  onPromoteToFirstTeam(player as Player);
                  onClose();
                }}
                className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/40 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                title="Promuovi questo giovane nella Prima Squadra"
              >
                <ArrowUp className="w-3.5 h-3.5 text-emerald-400" />
                <span>Promuovi in 1ª Squadra</span>
              </button>
            )}
            {isSquadPlayer && onDemoteToYouth && (
              <button
                type="button"
                onClick={() => {
                  onDemoteToYouth(player as Player);
                  onClose();
                }}
                className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                title="Rimanda questo giocatore nelle rose giovanili"
              >
                <ArrowDown className="w-3.5 h-3.5" />
                <span>Rimanda alle Giovanili</span>
              </button>
            )}
            {onDeletePlayer && (
              <button
                type="button"
                onClick={() => {
                  onDeletePlayer(player);
                  onClose();
                }}
                className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                title={isSquadPlayer ? "Elimina o Cedi Giocatore dalla Rosa" : "Rimuovi Giocatore dai Target"}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isSquadPlayer ? 'Cedi / Elimina dalla Rosa' : 'Rimuovi dai Target'}</span>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};
