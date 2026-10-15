import React, { useState, useEffect } from 'react';
import {
  TacticPreset,
  Player,
  TacticalPosition,
  Duty,
  Fixture,
  InPossessionInstructions,
  OutOfPossessionInstructions,
  InTransitionInstructions,
  TacticalStyle,
  YouthSquad
} from '../types';
import { TACTICAL_STYLES_PRESETS } from '../data/tacticalPresets';
import { TacticsSlotsHeader } from './TacticsSlotsHeader';
import {
  Compass,
  Sparkles,
  Shield,
  Layers,
  RefreshCw,
  Upload,
  Image as ImageIcon,
  CheckCircle,
  AlertCircle,
  Eye,
  Trash2,
  Zap,
  Sliders,
  Maximize2,
  X,
  Edit3,
  ListFilter,
  Check,
  Users
} from 'lucide-react';
import { getApiHeaders, hasCustomApiKey } from '../utils/apiKeyStorage';
import { safeFetchJson } from '../utils/apiUtils';
import { ScreenshotOcrProgressBar } from './ScreenshotOcrProgressBar';
import {
  getGroupedTacticsCandidates,
  TacticsCandidateItem,
  syncTacticsWithPlayers
} from '../utils/tacticsPlayerSync';

export interface FM26RoleCategory {
  category: string;
  inPossession: string[];
  outOfPossession: string[];
}

// Standard Official FM26 English Roles List provided by user
export const FM26_ROLES: FM26RoleCategory[] = [
  {
    category: "Portiere (GK)",
    inPossession: ["Goalkeeper", "No-Nonsense Goalkeeper", "Ball-Playing Goalkeeper", "Sweeper Keeper"],
    outOfPossession: ["Line-Holding Goalkeeper", "Sweeper Keeper"]
  },
  {
    category: "Difensore Centrale (DC)",
    inPossession: ["Centre-Back", "No-Nonsense CB", "Ball-Playing CB", "Overlapping CB", "Advanced CB", "Wide CB"],
    outOfPossession: ["Standard Centre-Back", "Stopping Centre-Back", "Covering Centre-Back"]
  },
  {
    category: "Terzino (DL / DR)",
    inPossession: ["Full-Back", "No-Nonsense Full-Back", "Inverted Full-Back", "Holding Full-Back"],
    outOfPossession: ["Standard Full-Back", "Pressing Full-Back", "Holding Full-Back"]
  },
  {
    category: "Esterno di Difesa / Quinto (WBL / WBR)",
    inPossession: ["Wing-Back", "Inverted Wing-Back", "Playmaking Wing-Back", "Advanced Wing-Back"],
    outOfPossession: ["Standard Wing-Back", "Pressing Wing-Back", "Holding Wing-Back"]
  },
  {
    category: "Mediano (DM)",
    inPossession: ["Defensive Midfielder", "Half-Back", "Deep-Lying Playmaker", "Dropping DM"],
    outOfPossession: ["Defensive Midfielder", "Screening DM", "Wide Covering DM", "Pressing DM"]
  },
  {
    category: "Centrocampista Centrale (MC)",
    inPossession: ["Central Midfielder", "Box-to-Box Midfielder", "Midfield Playmaker", "Channel Midfielder", "Wide Central Midfielder", "Box-to-Box Playmaker"],
    outOfPossession: ["Central Midfielder", "Screening CM", "Wide Covering CM", "Box-to-Box Midfielder"]
  },
  {
    category: "Esterno Offensivo / Ala (AML / AMR)",
    inPossession: ["Winger", "Inside Winger", "Half-Space Winger", "Inverting Outlet Winger", "Wide Playmaker", "Wide Forward", "Inside Forward"],
    outOfPossession: ["Standard Winger", "Tracking Winger", "Wide Outlet Winger"]
  },
  {
    category: "Trequartista Centrale (AMC)",
    inPossession: ["Attacking Midfielder", "Advanced Playmaker", "Free Role"],
    outOfPossession: ["Standard Attacking Midfielder", "Tracking AM", "Screening CM"]
  },
  {
    category: "Punta / Attaccante Centrale (ST)",
    inPossession: ["Centre Forward", "Deep-Lying Forward", "False Nine", "Channel Forward", "Half-Space Forward", "Second Striker"],
    outOfPossession: ["Centre Forward", "Tracking Centre Forward", "Central Outlet CF", "Splitting Outlet CF"]
  }
];

export const ALL_FM26_ROLE_NAMES = Array.from(
  new Set(FM26_ROLES.flatMap(c => [...c.inPossession, ...c.outOfPossession]))
);

interface TacticsBoardProps {
  tactic: TacticPreset;
  players: Player[];
  youthSquads?: YouthSquad[];
  fixtures?: Fixture[];
  onUpdateTactic: (updatedTactic: TacticPreset) => void;
  tactics?: TacticPreset[];
  activeTacticIndex?: number;
  onSelectSlot?: (index: number) => void;
  onUpdateTactics?: (newTactics: TacticPreset[], newActiveIdx?: number) => void;
}

export const TacticsBoard: React.FC<TacticsBoardProps> = ({
  tactic,
  players,
  youthSquads = [],
  fixtures = [],
  onUpdateTactic,
  tactics,
  activeTacticIndex = 0,
  onSelectSlot,
  onUpdateTactics
}) => {
  const upcomingFixtures = fixtures.filter(f => f.status === 'In Arrivo');
  const defaultOpponent = upcomingFixtures.length > 0 ? upcomingFixtures[0].opponent : 'Real Madrid';

  // Inline Tactic Name & Formation Editing
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitleName, setTempTitleName] = useState(tactic.name);
  const [tempTitleFormation, setTempTitleFormation] = useState(tactic.formation);

  useEffect(() => {
    setTempTitleName(tactic.name);
    setTempTitleFormation(tactic.formation);
    setIsEditingTitle(false);
  }, [tactic.id, tactic.name, tactic.formation]);

  const handleSaveTitleEdit = () => {
    const trimmedName = tempTitleName.trim() || tactic.name || 'Tattica';
    const trimmedFormation = tempTitleFormation.trim() || tactic.formation || '4-3-3';
    const updated = {
      ...tactic,
      name: trimmedName,
      formation: trimmedFormation
    };
    onUpdateTactic(updated);
    if (tactics && onUpdateTactics) {
      const activeIdx = activeTacticIndex ?? 0;
      const nextList = [...tactics];
      nextList[activeIdx] = updated;
      onUpdateTactics(nextList);
    }
    setIsEditingTitle(false);
  };

  // Active Phase Tab for Instructions & Pitch view: 'inPossession' | 'outOfPossession' | 'combined'
  const [activePhase, setActivePhase] = useState<'inPossession' | 'outOfPossession' | 'combined'>('inPossession');

  // Scanning Vision state
  const [scanningPhase, setScanningPhase] = useState<'inPossession' | 'outOfPossession' | 'combined' | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);

  // Screenshot modal preview
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);

  // Tactical Verification Modal State
  const [verificationResult, setVerificationResult] = useState<{
    isOpen: boolean;
    isValid: boolean;
    errors: string[];
    warnings: string[];
    inPossCount: number;
    outPossCount: number;
    combinedCount: number;
  } | null>(null);

  // Verification logic: checks that the 3 tactical setups have the same players and no duplicate assignments within the same setup
  const runTacticalVerification = () => {
    const inPoss = tactic.inPossessionPositions || tactic.positions;
    const outPoss = tactic.outOfPossessionPositions || tactic.inPossessionPositions || tactic.positions;
    const combined = tactic.combinedPositions || tactic.positions;

    const errors: string[] = [];
    const warnings: string[] = [];

    const getPlayerName = (id: string) => players.find(p => p.id === id)?.name || 'Giocatore Sconosciuto';

    // 1. Check duplicates within each setup
    const checkDuplicatesInPhase = (list: TacticalPosition[], phaseName: string) => {
      const counts: Record<string, { count: number; roles: string[] }> = {};
      list.forEach(p => {
        if (p.playerId) {
          if (!counts[p.playerId]) {
            counts[p.playerId] = { count: 0, roles: [] };
          }
          counts[p.playerId].count += 1;
          counts[p.playerId].roles.push(`${p.label} (${p.role})`);
        }
      });

      Object.entries(counts).forEach(([pid, data]) => {
        if (data.count > 1) {
          errors.push(
            `Nella disposizione "${phaseName}", ${getPlayerName(pid)} è schierato ${data.count} volte contemporaneamente (ruoli: ${data.roles.join(', ')}).`
          );
        }
      });
    };

    checkDuplicatesInPhase(inPoss, 'In Possesso');
    checkDuplicatesInPhase(outPoss, 'Non in Possesso');
    checkDuplicatesInPhase(combined, 'Combinata');

    // 2. Count assigned players in each phase
    const inPossPlayerIds = inPoss.map(p => p.playerId).filter(Boolean) as string[];
    const outPossPlayerIds = outPoss.map(p => p.playerId).filter(Boolean) as string[];
    const combinedPlayerIds = combined.map(p => p.playerId).filter(Boolean) as string[];

    if (inPossPlayerIds.length < 11) {
      warnings.push(`Fase In Possesso: ci sono solo ${inPossPlayerIds.length}/11 giocatori assegnati.`);
    }
    if (outPossPlayerIds.length < 11) {
      warnings.push(`Fase Non in Possesso: ci sono solo ${outPossPlayerIds.length}/11 giocatori assegnati.`);
    }
    if (combinedPlayerIds.length < 11) {
      warnings.push(`Fase Combinata: ci sono solo ${combinedPlayerIds.length}/11 giocatori assegnati.`);
    }

    // 3. Compare unique assigned player sets across the 3 setups
    const setInPoss = new Set(inPossPlayerIds);
    const setOutPoss = new Set(outPossPlayerIds);
    const setCombined = new Set(combinedPlayerIds);

    const allAssignedPlayerIds = Array.from(new Set([...inPossPlayerIds, ...outPossPlayerIds, ...combinedPlayerIds]));

    if (allAssignedPlayerIds.length === 0) {
      warnings.push("Nessun giocatore è stato ancora assegnato in alcuna delle 3 disposizioni tattiche.");
    } else {
      allAssignedPlayerIds.forEach(pid => {
        const name = getPlayerName(pid);
        const presentIn: string[] = [];
        const missingFrom: string[] = [];

        if (setInPoss.has(pid)) presentIn.push('In Possesso'); else missingFrom.push('In Possesso');
        if (setOutPoss.has(pid)) presentIn.push('Non in Possesso'); else missingFrom.push('Non in Possesso');
        if (setCombined.has(pid)) presentIn.push('Combinata'); else missingFrom.push('Combinata');

        if (missingFrom.length > 0) {
          errors.push(
            `${name} è schierato in [${presentIn.join(', ')}] ma manca in [${missingFrom.join(', ')}].`
          );
        }
      });
    }

    setVerificationResult({
      isOpen: true,
      isValid: errors.length === 0,
      errors,
      warnings,
      inPossCount: inPossPlayerIds.length,
      outPossCount: outPossPlayerIds.length,
      combinedCount: combinedPlayerIds.length
    });
  };

  // Ensure nested instructions are initialized
  const inPossession: InPossessionInstructions = tactic.inPossessionInstructions || {
    tempo: tactic.tempo || 'Alto',
    passingStyle: tactic.passingStyle || 'Corto',
    width: tactic.width || 'Standard',
    playOutOfBack: true,
    workBallIntoBox: true,
    focusChannels: 'Misto'
  };

  const outOfPossession: OutOfPossessionInstructions = tactic.outOfPossessionInstructions || {
    defensiveLine: tactic.defensiveLine || 'Alta',
    lineOfEngagement: 'Alta',
    pressingTrigger: tactic.pressingTrigger || 'Estremo',
    pressingTrap: "Verso l'Esterno",
    useOffsideTrap: true,
    tackling: 'Standard'
  };

  const inTransition: InTransitionInstructions = tactic.inTransitionInstructions || {
    whenLost: 'Contropressing',
    whenWon: 'Contropiede',
    goalkeeperDistribution: 'Rinvio Rapido'
  };

  // Helper to update specific instruction sets
  const handleTacticalStyleChange = (style: TacticalStyle) => {
    const preset = TACTICAL_STYLES_PRESETS[style];
    if (!preset) {
      onUpdateTactic({ ...tactic, tacticalStyle: style });
      return;
    }

    const updatedInPossession: InPossessionInstructions = {
      ...inPossession,
      ...preset.inPossession,
    };

    const updatedOutOfPossession: OutOfPossessionInstructions = {
      ...outOfPossession,
      ...preset.outOfPossession,
    };

    onUpdateTactic({
      ...tactic,
      tacticalStyle: style,
      mentality: preset.mentality || tactic.mentality,
      tempo: (preset.inPossession.tempo || tactic.tempo) as any,
      passingStyle: (preset.inPossession.passingStyle || tactic.passingStyle) as any,
      defensiveLine: (preset.outOfPossession.defensiveLine || tactic.defensiveLine) as any,
      pressingTrigger: (preset.outOfPossession.pressingTrigger || tactic.pressingTrigger) as any,
      inPossessionInstructions: updatedInPossession,
      outOfPossessionInstructions: updatedOutOfPossession,
    });

    setScanNotice(`🎯 Stile Tattico "${style}" applicato! ${preset.description}`);
  };

  const updateInPossession = (updated: Partial<InPossessionInstructions>) => {
    const newObj = { ...inPossession, ...updated };
    onUpdateTactic({
      ...tactic,
      tempo: newObj.tempo as any,
      passingStyle: newObj.passingStyle as any,
      width: newObj.width as any,
      inPossessionInstructions: newObj
    });
  };

  const updateOutOfPossession = (updated: Partial<OutOfPossessionInstructions>) => {
    const newObj = { ...outOfPossession, ...updated };
    onUpdateTactic({
      ...tactic,
      defensiveLine: newObj.defensiveLine as any,
      pressingTrigger: newObj.pressingTrigger as any,
      outOfPossessionInstructions: newObj
    });
  };

  const activePositions = activePhase === 'outOfPossession'
    ? (tactic.outOfPossessionPositions || tactic.inPossessionPositions || tactic.positions)
    : activePhase === 'combined'
    ? (tactic.combinedPositions || tactic.positions)
    : (tactic.inPossessionPositions || tactic.positions);

  const handleDutyChange = (positionId: string, newDuty: Duty) => {
    const currentList = activePhase === 'outOfPossession'
      ? (tactic.outOfPossessionPositions || tactic.inPossessionPositions || tactic.positions)
      : activePhase === 'combined'
      ? (tactic.combinedPositions || tactic.positions)
      : (tactic.inPossessionPositions || tactic.positions);

    const updatedPositions = currentList.map(p =>
      p.id === positionId ? { ...p, duty: newDuty } : p
    );

    if (activePhase === 'outOfPossession') {
      onUpdateTactic({ ...tactic, outOfPossessionPositions: updatedPositions });
    } else if (activePhase === 'combined') {
      onUpdateTactic({ ...tactic, combinedPositions: updatedPositions, positions: updatedPositions });
    } else {
      onUpdateTactic({ ...tactic, positions: updatedPositions, inPossessionPositions: updatedPositions });
    }
  };

  const handlePlayerAssign = (positionId: string, playerId: string) => {
    const assignedId = playerId || undefined;

    const assignInList = (list: TacticalPosition[]) => {
      return list.map(p => {
        if (p.id === positionId) return { ...p, playerId: assignedId };
        // Se il calciatore era già presente in un'altra casella, liberala automaticamente
        if (assignedId && p.playerId === assignedId) return { ...p, playerId: undefined };
        return p;
      });
    };

    if (activePhase === 'combined') {
      const currentCombined = tactic.combinedPositions || tactic.positions;
      const updatedCombined = assignInList(currentCombined);

      const currentInPoss = tactic.inPossessionPositions || tactic.positions;
      const updatedInPoss = assignInList(currentInPoss);

      const currentOutPoss = tactic.outOfPossessionPositions || tactic.positions;
      const updatedOutPoss = assignInList(currentOutPoss);

      const updatedBase = assignInList(tactic.positions);

      onUpdateTactic({
        ...tactic,
        positions: updatedBase,
        combinedPositions: updatedCombined,
        inPossessionPositions: updatedInPoss,
        outOfPossessionPositions: updatedOutPoss
      });
    } else if (activePhase === 'outOfPossession') {
      const currentList = tactic.outOfPossessionPositions || tactic.positions;
      const updatedPositions = assignInList(currentList);

      let updatedCombined = tactic.combinedPositions;
      if (updatedCombined) {
        updatedCombined = assignInList(updatedCombined);
      }

      onUpdateTactic({
        ...tactic,
        outOfPossessionPositions: updatedPositions,
        combinedPositions: updatedCombined
      });
    } else {
      const currentList = tactic.inPossessionPositions || tactic.positions;
      const updatedPositions = assignInList(currentList);

      let updatedCombined = tactic.combinedPositions;
      if (updatedCombined) {
        updatedCombined = assignInList(updatedCombined);
      }

      onUpdateTactic({
        ...tactic,
        positions: updatedPositions,
        inPossessionPositions: updatedPositions,
        combinedPositions: updatedCombined
      });
    }
  };

  const handleManualSync = () => {
    const targetTactics = tactics && tactics.length > 0 ? tactics : [tactic];
    const { updatedTactics, hasChanges, clearedCount } = syncTacticsWithPlayers(
      targetTactics,
      players,
      youthSquads
    );

    if (hasChanges) {
      if (onUpdateTactics && tactics && tactics.length > 0) {
        onUpdateTactics(updatedTactics, activeTacticIndex);
      } else {
        onUpdateTactic(updatedTactics[0]);
      }
      setScanNotice(
        `✨ Sincronizzazione completata: la tattica è stata sincronizzata con la rosa attuale${
          clearedCount > 0 ? ` (${clearedCount} assegnazioni obsolete rimosse)` : ''
        }.`
      );
    } else {
      setScanNotice(
        `✅ Rosa e Tattica già sincronizzate: tutte le assegnazioni corrispondono alla rosa attuale.`
      );
    }
  };

  const [customRoleModal, setCustomRoleModal] = useState<{ positionId: string; currentRole: string } | null>(null);
  const [customRoleInput, setCustomRoleInput] = useState<string>('');

  const handleRoleChange = (positionId: string, newRole: string) => {
    if (newRole === '__CUSTOM__') {
      const currentList = activePhase === 'outOfPossession'
        ? (tactic.outOfPossessionPositions || tactic.inPossessionPositions || tactic.positions)
        : activePhase === 'combined'
        ? (tactic.combinedPositions || tactic.positions)
        : (tactic.inPossessionPositions || tactic.positions);
      const targetPos = currentList.find(p => p.id === positionId);
      setCustomRoleModal({ positionId, currentRole: targetPos?.role || '' });
      setCustomRoleInput(targetPos?.role || '');
      return;
    }

    const currentList = activePhase === 'outOfPossession'
      ? (tactic.outOfPossessionPositions || tactic.inPossessionPositions || tactic.positions)
      : activePhase === 'combined'
      ? (tactic.combinedPositions || tactic.positions)
      : (tactic.inPossessionPositions || tactic.positions);

    const updatedPositions = currentList.map(p =>
      p.id === positionId ? { ...p, role: newRole } : p
    );

    if (activePhase === 'outOfPossession') {
      onUpdateTactic({ ...tactic, outOfPossessionPositions: updatedPositions });
    } else if (activePhase === 'combined') {
      onUpdateTactic({ ...tactic, combinedPositions: updatedPositions, positions: updatedPositions });
    } else {
      onUpdateTactic({ ...tactic, positions: updatedPositions, inPossessionPositions: updatedPositions });
    }
  };

  const handleSaveCustomRole = () => {
    if (!customRoleModal) return;
    const { positionId } = customRoleModal;
    const finalRole = customRoleInput.trim() || 'Ruolo Personalizzato';

    const currentList = activePhase === 'outOfPossession'
      ? (tactic.outOfPossessionPositions || tactic.inPossessionPositions || tactic.positions)
      : activePhase === 'combined'
      ? (tactic.combinedPositions || tactic.positions)
      : (tactic.inPossessionPositions || tactic.positions);

    const updatedPositions = currentList.map(p =>
      p.id === positionId ? { ...p, role: finalRole } : p
    );

    if (activePhase === 'outOfPossession') {
      onUpdateTactic({ ...tactic, outOfPossessionPositions: updatedPositions });
    } else if (activePhase === 'combined') {
      onUpdateTactic({ ...tactic, combinedPositions: updatedPositions, positions: updatedPositions });
    } else {
      onUpdateTactic({ ...tactic, positions: updatedPositions, inPossessionPositions: updatedPositions });
    }

    setCustomRoleModal(null);
  };

  const renderRoleSelect = (position: TacticalPosition) => {
    const isCustom = !ALL_FM26_ROLE_NAMES.includes(position.role);

    return (
      <select
        value={position.role}
        onChange={(e) => handleRoleChange(position.id, e.target.value)}
        className="w-full text-[9px] font-extrabold rounded px-1 py-0.5 mt-1 focus:outline-none focus:ring-1 focus:ring-sky-400 bg-slate-950 text-slate-100 border border-slate-700 cursor-pointer truncate shadow-sm"
        title={`Ruolo attuale: ${position.role}. Clicca per selezionare dal listino FM26 in inglese.`}
      >
        {isCustom && (
          <option value={position.role} className="bg-slate-900 text-amber-300 font-semibold">
            {position.role} (Personalizzato)
          </option>
        )}

        <option value="__CUSTOM__" className="bg-slate-900 text-sky-400 font-bold">
          ✏️ Digita Ruolo Personalizzato...
        </option>

        {FM26_ROLES.map((cat) => {
          const rolesForPhase = activePhase === 'outOfPossession'
            ? cat.outOfPossession
            : activePhase === 'inPossession'
            ? cat.inPossession
            : Array.from(new Set([...cat.inPossession, ...cat.outOfPossession]));

          return (
            <optgroup key={cat.category} label={cat.category} className="bg-slate-950 text-sky-400 font-extrabold">
              {rolesForPhase.map((r) => (
                <option key={r} value={r} className="bg-slate-900 text-slate-100 font-medium py-0.5">
                  {r}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
    );
  };

  const renderPlayerSelectOptions = (pos: TacticalPosition) => {
    const activeList = activePhase === 'outOfPossession'
      ? (tactic.outOfPossessionPositions || tactic.inPossessionPositions || tactic.positions)
      : activePhase === 'combined'
      ? (tactic.combinedPositions || tactic.positions)
      : (tactic.inPossessionPositions || tactic.positions);

    const grouped = getGroupedTacticsCandidates(pos, players, youthSquads, activeList);

    const renderOption = (c: TacticsCandidateItem) => {
      const prefix = c.isInjured ? '🚑 [INF] ' : c.isOnLoan ? '✈️ [PREST] ' : c.isPlayerStaff ? '👔 [STAFF] ' : '';
      const elsewhere = c.assignedElsewhereLabel ? ` ⚠️ [in ${c.assignedElsewhereLabel}]` : '';
      const caText = c.ca ? ` • CA ${c.ca}` : '';
      const numText = c.number ? ` • #${c.number}` : '';
      const squadText = c.squadName ? ` [${c.squadName}]` : '';

      return (
        <option
          key={c.id}
          value={c.id}
          className={`bg-slate-900 py-1 ${
            c.isInjured
              ? 'text-rose-300'
              : c.assignedElsewhereLabel
              ? 'text-amber-200'
              : 'text-white'
          } font-semibold`}
        >
          {prefix}{c.name} ({c.position}){caText}{numText}{squadText}{elsewhere}
        </option>
      );
    };

    return (
      <>
        <option value="" className="bg-slate-900 text-amber-400 font-bold py-1">
          ⚠️ -- Da Assegnare (Vuoto) --
        </option>

        {grouped.primary.length > 0 && (
          <optgroup label={`⭐ Prima Scelta: ${pos.label} (${grouped.primary.length})`} className="bg-slate-950 text-emerald-400 font-extrabold">
            {grouped.primary.map(renderOption)}
          </optgroup>
        )}

        {grouped.secondary.length > 0 && (
          <optgroup label={`🔄 Ruoli Compatibili / Adattabili (${grouped.secondary.length})`} className="bg-slate-950 text-sky-400 font-extrabold">
            {grouped.secondary.map(renderOption)}
          </optgroup>
        )}

        {grouped.defenders.length > 0 && (
          <optgroup label={`🛡️ Altri Difensori in Rosa (${grouped.defenders.length})`} className="bg-slate-950 text-slate-300 font-bold">
            {grouped.defenders.map(renderOption)}
          </optgroup>
        )}

        {grouped.midfielders.length > 0 && (
          <optgroup label={`⚙️ Altri Centrocampisti in Rosa (${grouped.midfielders.length})`} className="bg-slate-950 text-slate-300 font-bold">
            {grouped.midfielders.map(renderOption)}
          </optgroup>
        )}

        {grouped.forwards.length > 0 && (
          <optgroup label={`⚡ Altri Attaccanti in Rosa (${grouped.forwards.length})`} className="bg-slate-950 text-slate-300 font-bold">
            {grouped.forwards.map(renderOption)}
          </optgroup>
        )}

        {grouped.goalkeepers.length > 0 && (
          <optgroup label={`🧤 Portieri (${grouped.goalkeepers.length})`} className="bg-slate-950 text-slate-300 font-bold">
            {grouped.goalkeepers.map(renderOption)}
          </optgroup>
        )}

        {grouped.youth.length > 0 && (
          <optgroup label={`🌱 Giovanili & Vivaio (${grouped.youth.length})`} className="bg-slate-950 text-amber-300 font-bold">
            {grouped.youth.map(renderOption)}
          </optgroup>
        )}
      </>
    );
  };

  // Image Upload Handlers for Screenshots
  const handleScreenshotUpload = (phase: 'inPossession' | 'outOfPossession' | 'combined', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (phase === 'inPossession') {
        onUpdateTactic({ ...tactic, inPossessionScreenshot: base64 });
      } else if (phase === 'outOfPossession') {
        onUpdateTactic({ ...tactic, outOfPossessionScreenshot: base64 });
      } else {
        onUpdateTactic({ ...tactic, combinedScreenshot: base64 });
      }
    };
    reader.readAsDataURL(file);
  };

  // AI Vision Scanner for Screenshot
  const handleScanScreenshotWithAi = async (phase: 'inPossession' | 'outOfPossession' | 'combined') => {
    const imageBase64 = phase === 'inPossession'
      ? tactic.inPossessionScreenshot
      : phase === 'outOfPossession'
      ? tactic.outOfPossessionScreenshot
      : tactic.combinedScreenshot;

    if (!imageBase64) return;

    if (!hasCustomApiKey()) {
      setScanNotice("⚠️ Chiave API personale richiesta: inserisci la tua Google Gemini API Key gratuita (BYOK) nella barra superiore per avviare la scansione AI dello screenshot tattico.");
      return;
    }

    setScanningPhase(phase);
    setScanNotice(null);

    try {
      const data = await safeFetchJson<{ parsed?: any; error?: string }>('/api/gemini/parse-tactic-screenshot', {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          imageBase64,
          phase,
          squadPlayers: players.map(p => ({ id: p.id, name: p.name, position: p.position }))
        })
      });
      if (data.parsed) {
        const p = data.parsed;

        let matchedCount = 0;
        let unassignedCount = 0;

        const sourcePositions = phase === 'outOfPossession'
          ? (tactic.outOfPossessionPositions || tactic.inPossessionPositions || tactic.positions)
          : phase === 'combined'
          ? (tactic.combinedPositions || tactic.positions)
          : (tactic.inPossessionPositions || tactic.positions);

        let updatedPositions = sourcePositions;

        if (Array.isArray(p.positions) && p.positions.length > 0) {
          updatedPositions = p.positions.map((pos: any, idx: number) => {
            const existingPos = sourcePositions[idx];

            let matchedPlayer = players.find(player => player.id === pos.matchedPlayerId);

            if (!matchedPlayer && pos.recognizedPlayerName && typeof pos.recognizedPlayerName === 'string') {
              const recName = pos.recognizedPlayerName.toLowerCase().trim();
              if (recName.length >= 2) {
                matchedPlayer = players.find(player => {
                  const pName = player.name.toLowerCase();
                  const parts = pName.split(' ');
                  const surname = parts[parts.length - 1];
                  return (
                    pName === recName ||
                    pName.includes(recName) ||
                    recName.includes(pName) ||
                    (surname.length >= 3 && recName.includes(surname))
                  );
                });
              }
            }

            if (matchedPlayer) {
              matchedCount++;
            } else {
              unassignedCount++;
            }

            return {
              id: pos.id || `pos${idx + 1}`,
              label: pos.label || existingPos?.label || `P${idx + 1}`,
              role: pos.role || existingPos?.role || 'Ruolo Personalizzato',
              duty: (['Attacco', 'Supporto', 'Difesa'].includes(pos.duty) ? pos.duty : existingPos?.duty || 'Supporto') as Duty,
              playerId: matchedPlayer ? matchedPlayer.id : undefined,
              coords: {
                x: typeof pos.coords?.x === 'number' && pos.coords.x > 0 ? Math.max(5, Math.min(95, pos.coords.x)) : (existingPos?.coords?.x || 50),
                y: typeof pos.coords?.y === 'number' && pos.coords.y > 0 ? Math.max(5, Math.min(95, pos.coords.y)) : (existingPos?.coords?.y || 50),
              }
            };
          });
        }

        if (phase === 'combined') {
          // Break combined roles into possession (1st role) and outOfPossession (2nd role)
          const derivedInPossession = updatedPositions.map(pos => {
            const parts = pos.role.split('/');
            return {
              ...pos,
              role: parts[0]?.trim() || pos.role
            };
          });

          const derivedOutOfPossession = updatedPositions.map(pos => {
            const parts = pos.role.split('/');
            return {
              ...pos,
              role: parts[1]?.trim() || parts[0]?.trim() || pos.role
            };
          });

          onUpdateTactic({
            ...tactic,
            formation: p.formation || tactic.formation,
            mentality: p.mentality || tactic.mentality,
            tacticalStyle: (p.tacticalStyle as TacticalStyle) || tactic.tacticalStyle || 'Gegenpress',
            positions: derivedInPossession,
            combinedPositions: updatedPositions,
            inPossessionPositions: derivedInPossession,
            outOfPossessionPositions: derivedOutOfPossession
          });
        } else if (phase === 'inPossession') {
          const newInPossession: InPossessionInstructions = {
            ...inPossession,
            tempo: p.tempo || inPossession.tempo,
            passingStyle: p.passingStyle || inPossession.passingStyle,
            width: p.width || inPossession.width,
            playOutOfBack: typeof p.playOutOfBack === 'boolean' ? p.playOutOfBack : inPossession.playOutOfBack,
            workBallIntoBox: typeof p.workBallIntoBox === 'boolean' ? p.workBallIntoBox : inPossession.workBallIntoBox,
            focusChannels: p.focusChannels || inPossession.focusChannels
          };

          onUpdateTactic({
            ...tactic,
            formation: p.formation || tactic.formation,
            mentality: p.mentality || tactic.mentality,
            tacticalStyle: (p.tacticalStyle as TacticalStyle) || tactic.tacticalStyle || 'Gegenpress',
            tempo: newInPossession.tempo as any,
            passingStyle: newInPossession.passingStyle as any,
            width: newInPossession.width as any,
            positions: updatedPositions,
            inPossessionPositions: updatedPositions,
            inPossessionInstructions: newInPossession
          });
        } else {
          const newOutOfPossession: OutOfPossessionInstructions = {
            ...outOfPossession,
            defensiveLine: p.defensiveLine || outOfPossession.defensiveLine,
            lineOfEngagement: p.lineOfEngagement || outOfPossession.lineOfEngagement,
            pressingTrigger: p.pressingTrigger || outOfPossession.pressingTrigger,
            pressingTrap: p.pressingTrap || outOfPossession.pressingTrap,
            useOffsideTrap: typeof p.useOffsideTrap === 'boolean' ? p.useOffsideTrap : outOfPossession.useOffsideTrap,
            tackling: p.tackling || outOfPossession.tackling
          };

          onUpdateTactic({
            ...tactic,
            defensiveLine: newOutOfPossession.defensiveLine as any,
            pressingTrigger: newOutOfPossession.pressingTrigger as any,
            outOfPossessionPositions: updatedPositions,
            outOfPossessionInstructions: newOutOfPossession
          });
        }

        setActivePhase(phase);

        const msgDetails = unassignedCount > 0
          ? ` (${matchedCount} giocatori abbinati automaticamente, ${unassignedCount} posizioni lasciate vuote per la scelta manuale).`
          : ` (${matchedCount} giocatori abbinati alla rosa).`;

        setScanNotice(`✨ Scansione completata! Formazione "${p.formation || tactic.formation}" e modulo 2D aggiornati con successo${msgDetails}`);
      } else {
        throw new Error(data.error || 'Nessun dato estratto');
      }
    } catch (err: any) {
      setScanNotice(`⚠️ Errore nella scansione dello screenshot: ${err.message}`);
    } finally {
      setScanningPhase(null);
    }
  };

  const getDutyBadge = (duty: Duty) => {
    switch (duty) {
      case 'Attacco': return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
      case 'Supporto': return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'Difesa': return 'bg-sky-500/20 text-sky-300 border-sky-500/30';
      default: return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Tactical Slots Header (Up to 3 Slots) */}
      {tactics && onSelectSlot && onUpdateTactics && (
        <TacticsSlotsHeader
          tactics={tactics}
          activeTacticIndex={activeTacticIndex}
          onSelectSlot={onSelectSlot}
          onUpdateTactics={onUpdateTactics}
          onUpdateActiveTactic={onUpdateTactic}
        />
      )}

      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="w-full md:w-auto">
          {isEditingTitle ? (
            <div className="flex flex-wrap items-center gap-2">
              <Compass className="w-5 h-5 text-emerald-400 shrink-0" />
              <input
                type="text"
                value={tempTitleName}
                onChange={(e) => setTempTitleName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTitleEdit();
                  if (e.key === 'Escape') setIsEditingTitle(false);
                }}
                placeholder="Nome tattica..."
                className="bg-slate-950 border border-emerald-500 rounded-lg px-2.5 py-1 text-sm font-bold text-white focus:outline-none w-48 sm:w-64"
                autoFocus
              />
              <input
                type="text"
                value={tempTitleFormation}
                onChange={(e) => setTempTitleFormation(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTitleEdit();
                  if (e.key === 'Escape') setIsEditingTitle(false);
                }}
                placeholder="Modulo (es. 4-3-3)"
                className="bg-slate-950 border border-emerald-500 rounded-lg px-2 py-1 text-xs font-mono font-bold text-emerald-400 focus:outline-none w-24"
              />
              <button
                type="button"
                onClick={handleSaveTitleEdit}
                className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all"
                title="Salva nome"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsEditingTitle(false)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-all"
                title="Annulla"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <Compass className="w-5 h-5 text-emerald-400 shrink-0" />
              <h2
                onClick={() => setIsEditingTitle(true)}
                className="text-base font-bold text-white hover:text-emerald-300 transition-colors cursor-pointer flex items-center gap-1.5 group"
                title="Clicca per modificare il nome della tattica"
              >
                <span>{tactic.name}</span>
                <Edit3 className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400 transition-colors" />
              </h2>
              <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2 py-0.5 rounded border border-emerald-500/30 font-semibold font-mono">
                {tactic.formation}
              </span>
            </div>
          )}
          <p className="text-xs text-slate-400 mt-1">
            Gestisci la tattica differenziando la fase <b>In Possesso</b>, <b>Non in Possesso</b> e la <b>Tattica Combinata</b> con screenshot dedicati ed estrazione AI.
          </p>
        </div>

        {/* Stile Tattico & Mentalità Selectors */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* Stile Tattico Dropdown */}
          <div className="flex items-center space-x-1.5">
            <label className="text-xs text-slate-400 font-medium hidden sm:inline">Stile:</label>
            <select
              value={tactic.tacticalStyle || 'Gegenpress'}
              onChange={(e) => handleTacticalStyleChange(e.target.value as TacticalStyle)}
              className="bg-slate-950 border border-slate-800 text-xs text-sky-400 font-extrabold rounded-xl px-3 py-2 focus:outline-none focus:border-sky-500 shadow-sm cursor-pointer"
            >
              <option value="Controllo del possesso" className="bg-slate-900 text-slate-100">Stile: Controllo del possesso</option>
              <option value="Gegenpress" className="bg-slate-900 text-slate-100">Stile: Gegenpress</option>
              <option value="Tiki-taka" className="bg-slate-900 text-slate-100">Stile: Tiki-taka</option>
              <option value="Tiki-taka verticale" className="bg-slate-900 text-slate-100">Stile: Tiki-taka verticale</option>
              <option value="Gioco sulle fasce" className="bg-slate-900 text-slate-100">Stile: Gioco sulle fasce</option>
              <option value="Palla lunga" className="bg-slate-900 text-slate-100">Stile: Palla lunga</option>
              <option value="Contropiede fluido" className="bg-slate-900 text-slate-100">Stile: Contropiede fluido</option>
              <option value="Contropiede diretto" className="bg-slate-900 text-slate-100">Stile: Contropiede diretto</option>
              <option value="Catenaccio" className="bg-slate-900 text-slate-100">Stile: Catenaccio</option>
              <option value="Parcheggia l'autobus" className="bg-slate-900 text-slate-100">Stile: Parcheggia l'autobus</option>
              <option value="Tabula rasa" className="bg-slate-900 text-slate-100">Stile: Tabula rasa</option>
            </select>
          </div>

          {/* Mentalità Dropdown */}
          <div className="flex items-center space-x-1.5">
            <label className="text-xs text-slate-400 font-medium hidden sm:inline">Mentalità:</label>
            <select
              value={tactic.mentality}
              onChange={(e) => onUpdateTactic({ ...tactic, mentality: e.target.value as any })}
              className="bg-slate-950 border border-slate-800 text-xs text-emerald-400 font-extrabold rounded-xl px-3 py-2 focus:outline-none focus:border-emerald-500 shadow-sm cursor-pointer"
            >
              <option value="Molto Offensiva" className="bg-slate-900 text-slate-100">Mentalità: Molto Offensiva</option>
              <option value="Offensiva" className="bg-slate-900 text-slate-100">Mentalità: Offensiva</option>
              <option value="Positiva" className="bg-slate-900 text-slate-100">Mentalità: Positiva</option>
              <option value="Equilibrata" className="bg-slate-900 text-slate-100">Mentalità: Equilibrata</option>
              <option value="Prudente" className="bg-slate-900 text-slate-100">Mentalità: Prudente</option>
              <option value="Difensiva" className="bg-slate-900 text-slate-100">Mentalità: Difensiva</option>
            </select>
          </div>

          {/* Button: Sincronizza Rosa con Tattica */}
          <button
            onClick={handleManualSync}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl transition-all shadow-lg flex items-center gap-1.5 cursor-pointer border border-emerald-400/30"
            title="Sincronizza e riconnette i giocatori schierati con la rosa attuale, rimuovendo assegnazioni orfane"
          >
            <RefreshCw className="w-4 h-4 text-emerald-200" />
            <span>Sincronizza Rosa</span>
          </button>

          {/* Button: Verifica Tattica / Coerenza Disposizioni */}
          <button
            onClick={runTacticalVerification}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl transition-all shadow-lg flex items-center gap-1.5 cursor-pointer border border-indigo-400/30"
            title="Verifica se i giocatori nelle 3 disposizioni sono gli stessi e senza duplicati"
          >
            <CheckCircle className="w-4 h-4 text-indigo-200" />
            <span>Verifica Tattica</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: Screenshot Triple Upload Cards (In Possession vs Out of Possession vs Combined Tactic) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Screenshot Card 1: In Possesso */}
        <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-emerald-400" /> Screenshot: In Possesso
              </h3>
            </div>
            {tactic.inPossessionScreenshot && (
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setPreviewImage({ url: tactic.inPossessionScreenshot!, title: "Screenshot Tattica - In Possesso" })}
                  className="p-1 text-slate-400 hover:text-white bg-slate-800 rounded-lg text-xs flex items-center gap-1 px-2"
                  title="Ingrandisci"
                >
                  <Maximize2 className="w-3.5 h-3.5" /> Ingrandisci
                </button>
                <button
                  onClick={() => onUpdateTactic({ ...tactic, inPossessionScreenshot: undefined })}
                  className="p-1 text-rose-400 hover:text-rose-300 bg-slate-800 rounded-lg"
                  title="Rimuovi"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {tactic.inPossessionScreenshot ? (
            <div className="space-y-3">
              <div className="relative group rounded-xl overflow-hidden border border-slate-800 aspect-[16/9] bg-slate-950 flex items-center justify-center">
                <img
                  src={tactic.inPossessionScreenshot}
                  alt="In Possesso Screenshot"
                  className="w-full h-full object-contain"
                />
              </div>
              <button
                onClick={() => handleScanScreenshotWithAi('inPossession')}
                disabled={scanningPhase === 'inPossession'}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 text-white text-xs font-bold py-2 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer"
              >
                {scanningPhase === 'inPossession' ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Scansione AI in corso...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" /> Scansiona AI (In Possesso)
                  </>
                )}
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-800 hover:border-emerald-500/50 rounded-xl p-5 bg-slate-950 cursor-pointer transition-all text-center h-40">
              <Upload className="w-6 h-6 text-emerald-400 mb-2" />
              <span className="text-xs font-semibold text-slate-200">Carica Screenshot "In Possesso"</span>
              <span className="text-[10px] text-slate-500 mt-1">Carica l'immagine della tua tattica con la palla in FM26</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleScreenshotUpload('inPossession', e)}
                className="hidden"
              />
            </label>
          )}
        </div>

        {/* Screenshot Card 2: Non in Possesso */}
        <div className="bg-slate-900 border border-rose-500/30 rounded-2xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-rose-300 flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-rose-400" /> Screenshot: Non in Possesso
              </h3>
            </div>
            {tactic.outOfPossessionScreenshot && (
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setPreviewImage({ url: tactic.outOfPossessionScreenshot!, title: "Screenshot Tattica - Non in Possesso" })}
                  className="p-1 text-slate-400 hover:text-white bg-slate-800 rounded-lg text-xs flex items-center gap-1 px-2"
                  title="Ingrandisci"
                >
                  <Maximize2 className="w-3.5 h-3.5" /> Ingrandisci
                </button>
                <button
                  onClick={() => onUpdateTactic({ ...tactic, outOfPossessionScreenshot: undefined })}
                  className="p-1 text-rose-400 hover:text-rose-300 bg-slate-800 rounded-lg"
                  title="Rimuovi"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {tactic.outOfPossessionScreenshot ? (
            <div className="space-y-3">
              <div className="relative group rounded-xl overflow-hidden border border-slate-800 aspect-[16/9] bg-slate-950 flex items-center justify-center">
                <img
                  src={tactic.outOfPossessionScreenshot}
                  alt="Non in Possesso Screenshot"
                  className="w-full h-full object-contain"
                />
              </div>
              <button
                onClick={() => handleScanScreenshotWithAi('outOfPossession')}
                disabled={scanningPhase === 'outOfPossession'}
                className="w-full bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 text-white text-xs font-bold py-2 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer"
              >
                {scanningPhase === 'outOfPossession' ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Scansione AI in corso...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" /> Scansiona AI (Non in Possesso)
                  </>
                )}
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-800 hover:border-rose-500/50 rounded-xl p-5 bg-slate-950 cursor-pointer transition-all text-center h-40">
              <Upload className="w-6 h-6 text-rose-400 mb-2" />
              <span className="text-xs font-semibold text-slate-200">Carica Screenshot "Non in Possesso"</span>
              <span className="text-[10px] text-slate-500 mt-1">Carica l'immagine della tua fase difensiva/pressing in FM26</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleScreenshotUpload('outOfPossession', e)}
                className="hidden"
              />
            </label>
          )}
        </div>

        {/* Screenshot Card 3: Tattica Combinata */}
        <div className="bg-slate-900 border border-sky-500/30 rounded-2xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-sky-300 flex items-center gap-1.5">
                <ImageIcon className="w-4 h-4 text-sky-400" /> Screenshot: Tattica Combinata
              </h3>
            </div>
            {tactic.combinedScreenshot && (
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setPreviewImage({ url: tactic.combinedScreenshot!, title: "Screenshot Tattica - Combinata" })}
                  className="p-1 text-slate-400 hover:text-white bg-slate-800 rounded-lg text-xs flex items-center gap-1 px-2"
                  title="Ingrandisci"
                >
                  <Maximize2 className="w-3.5 h-3.5" /> Ingrandisci
                </button>
                <button
                  onClick={() => onUpdateTactic({ ...tactic, combinedScreenshot: undefined })}
                  className="p-1 text-rose-400 hover:text-rose-300 bg-slate-800 rounded-lg"
                  title="Rimuovi"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {tactic.combinedScreenshot ? (
            <div className="space-y-3">
              <div className="relative group rounded-xl overflow-hidden border border-slate-800 aspect-[16/9] bg-slate-950 flex items-center justify-center">
                <img
                  src={tactic.combinedScreenshot}
                  alt="Tattica Combinata Screenshot"
                  className="w-full h-full object-contain"
                />
              </div>
              <button
                onClick={() => handleScanScreenshotWithAi('combined')}
                disabled={scanningPhase === 'combined'}
                className="w-full bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 text-white text-xs font-bold py-2 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer"
              >
                {scanningPhase === 'combined' ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Scansione AI in corso...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" /> Scansiona AI (Combinata)
                  </>
                )}
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-800 hover:border-sky-500/50 rounded-xl p-5 bg-slate-950 cursor-pointer transition-all text-center h-40">
              <Upload className="w-6 h-6 text-sky-400 mb-2" />
              <span className="text-xs font-semibold text-slate-200">Carica Screenshot "Combinata"</span>
              <span className="text-[10px] text-slate-500 mt-1">Carica l'immagine con ruoli doppi (Possesso/Non Possesso)</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleScreenshotUpload('combined', e)}
                className="hidden"
              />
            </label>
          )}
        </div>
      </div>

      {/* Real-time OCR Progress Bar & Latency Diagnostics when scanning */}
      {scanningPhase && (
        <ScreenshotOcrProgressBar
          isLoading={!!scanningPhase}
          context="tactic"
          title={`Scansione Tattica FM26 (Gemini Vision OCR): ${
            scanningPhase === 'inPossession'
              ? 'Fase In Possesso'
              : scanningPhase === 'outOfPossession'
              ? 'Fase Non In Possesso'
              : 'Tattica Combinata'
          }`}
          error={scanNotice && scanNotice.includes('⚠️') ? scanNotice : null}
        />
      )}

      {/* Banner Notice after scanning */}
      {scanNotice && (
        <div className="bg-slate-900 border border-emerald-500/40 rounded-xl p-3 flex items-center justify-between text-xs text-emerald-200">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{scanNotice}</span>
          </div>
          <button onClick={() => setScanNotice(null)} className="text-slate-400 hover:text-white ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Grid: Pitch (7 cols) + Differentiated Sidebar (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Visual 2D Pitch Column (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl flex flex-col items-center">
          <div className="flex flex-col sm:flex-row items-center justify-between w-full mb-4 gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-emerald-400" /> Campo Tattico 2D ({tactic.formation})
              </h3>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                activePositions.filter(p => p.playerId).length === 11
                  ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-950/60 text-amber-300 border-amber-500/30'
              }`}>
                {activePositions.filter(p => p.playerId).length}/11 Titolari
              </span>
            </div>
            {/* Phase Selector Toggle for Pitch Visual */}
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px] font-semibold w-full sm:w-auto justify-center">
              <button
                onClick={() => setActivePhase('inPossession')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  activePhase === 'inPossession'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                In Possesso
              </button>
              <button
                onClick={() => setActivePhase('outOfPossession')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  activePhase === 'outOfPossession'
                    ? 'bg-rose-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Non in Possesso
              </button>
              <button
                onClick={() => setActivePhase('combined')}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  activePhase === 'combined'
                    ? 'bg-sky-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Tattica Combinata
              </button>
            </div>
          </div>

          {/* Football Field Visual */}
          <div className="relative w-full max-w-md aspect-[3/4] bg-emerald-950/90 rounded-2xl border-2 border-emerald-700/50 p-4 shadow-2xl overflow-hidden">
            {/* Field Lines Pattern */}
            <div className="absolute inset-0 border-2 border-emerald-500/20 rounded-2xl m-3 pointer-events-none" />
            <div className="absolute top-1/2 left-3 right-3 h-0.5 bg-emerald-500/20 pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 rounded-full border-2 border-emerald-500/20 pointer-events-none" />
            <div className="absolute top-3 left-1/2 -translate-x-1/2 w-36 h-20 border-2 border-t-0 border-emerald-500/20 pointer-events-none" />
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-36 h-20 border-2 border-b-0 border-emerald-500/20 pointer-events-none" />

            {/* Tactical Overlay graphics depending on active phase */}
            {activePhase === 'inPossession' && (
              <div className="absolute top-8 left-1/2 -translate-x-1/2 text-[10px] font-bold text-emerald-400/60 uppercase tracking-widest pointer-events-none flex items-center gap-1">
                ▲ Sviluppo Offensivo ({inPossession.passingStyle} / {inPossession.tempo})
              </div>
            )}
            {activePhase === 'outOfPossession' && (
              <div className="absolute top-12 left-1/2 -translate-x-1/2 text-[10px] font-bold text-rose-400/60 uppercase tracking-widest pointer-events-none flex items-center gap-1">
                ▼ Blocco Difensivo ({outOfPossession.defensiveLine} / Pressing {outOfPossession.pressingTrigger})
              </div>
            )}
            {activePhase === 'combined' && (
              <div className="absolute top-10 left-1/2 -translate-x-1/2 text-[10px] font-bold text-sky-300/80 uppercase tracking-widest pointer-events-none flex items-center gap-1 bg-slate-950/70 px-2 py-0.5 rounded-full border border-sky-500/30">
                ⚡ Tattica Combinata (Doppia Fase Possesso/Non Possesso)
              </div>
            )}

            {/* Tactical Positions Cards */}
            {activePositions.map((pos) => {
              const allAvailablePlayers = [
                ...players,
                ...youthSquads.flatMap(sq => sq.players)
              ];
              const assignedPlayer = allAvailablePlayers.find(p => p.id === pos.playerId);
              const isInjured = assignedPlayer && Boolean(assignedPlayer.isInjured);
              const isOnLoan = assignedPlayer && Boolean(assignedPlayer.isOnLoan);
              const isUnassigned = !assignedPlayer;

              return (
                <div
                  key={pos.id}
                  style={{
                    left: `${pos.coords.x}%`,
                    top: `${pos.coords.y}%`,
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer"
                >
                  <div className={`flex flex-col items-center bg-slate-950/95 border ${
                    isUnassigned
                      ? 'border-amber-500/60 shadow-amber-950/30'
                      : isInjured
                      ? 'border-rose-500 shadow-rose-900/50 ring-1 ring-rose-500/50 bg-rose-950/40'
                      : isOnLoan
                      ? 'border-blue-500 shadow-blue-900/50 ring-1 ring-blue-500/50 bg-blue-950/40'
                      : activePhase === 'combined'
                      ? 'border-sky-500/60 shadow-sky-950/40'
                      : 'border-slate-700 shadow-black/60'
                  } p-1.5 rounded-xl shadow-xl hover:scale-105 transition-all w-28 text-center z-10`}>
                    
                    {/* Position Label & Duty */}
                    <div className="flex items-center justify-between w-full text-[9px] font-bold text-slate-300 border-b border-slate-800 pb-0.5 mb-1">
                      <span className="text-emerald-400 font-extrabold truncate max-w-[55px]">{pos.label}</span>
                      <button
                        onClick={() => {
                          const duties: Duty[] = ['Attacco', 'Supporto', 'Difesa'];
                          const nextDuty = duties[(duties.indexOf(pos.duty) + 1) % duties.length];
                          handleDutyChange(pos.id, nextDuty);
                        }}
                        className={`px-1 py-0.5 rounded text-[8px] font-bold border ${getDutyBadge(pos.duty)}`}
                        title="Clicca per cambiare compito (Attacco / Supporto / Difesa)"
                      >
                        {pos.duty}
                      </button>
                    </div>

                    {/* Assigned Player Dropdown with Role-Organized Optgroups */}
                    <select
                      value={pos.playerId || ''}
                      onChange={(e) => handlePlayerAssign(pos.id, e.target.value)}
                      className={`w-full text-[10px] font-extrabold rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-400 truncate cursor-pointer shadow-md ${
                        isUnassigned
                          ? 'bg-slate-950 text-amber-300 border border-amber-500/60 font-bold'
                          : isInjured
                          ? 'bg-slate-950 text-rose-300 border border-rose-500/60 font-bold'
                          : isOnLoan
                          ? 'bg-slate-950 text-blue-300 border border-blue-500/60 font-bold'
                          : 'bg-slate-950 text-white border border-slate-700 font-bold'
                      }`}
                    >
                      {renderPlayerSelectOptions(pos)}
                    </select>

                    {/* Role Dropdown (FM26 English Official Roles) */}
                    {renderRoleSelect(pos)}

                    {assignedPlayer ? (
                      <div className="flex items-center justify-between w-full text-[8px] mt-1 pt-0.5 border-t border-slate-800/80">
                        {assignedPlayer.ca ? (
                          <span className="text-emerald-400 font-bold font-mono">CA {assignedPlayer.ca}</span>
                        ) : (
                          <span className="text-slate-400 font-mono">#{assignedPlayer.number}</span>
                        )}
                        {assignedPlayer.isInjured ? (
                          <span className="text-rose-400 font-bold tracking-tight">
                            🚑 Infortunato
                          </span>
                        ) : assignedPlayer.isOnLoan ? (
                          <span className="text-blue-400 font-bold tracking-tight" title={assignedPlayer.loanClub ? `In prestito a ${assignedPlayer.loanClub}` : 'In prestito'}>
                            ✈️ In Prestito
                          </span>
                        ) : assignedPlayer.isPlayerStaff ? (
                          <span className="text-purple-400 font-bold tracking-tight" title={assignedPlayer.staffRole ? `Staff: ${assignedPlayer.staffRole}` : 'Staff'}>
                            👔 Staff
                          </span>
                        ) : (
                          <span className="text-slate-400 font-medium">
                            {assignedPlayer.morale}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="text-[8px] text-amber-400/80 mt-1 font-semibold">
                        Seleziona Giocatore
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tactical Controls & Differentiated Team Instructions Sidebar (5 cols) */}
        <div className="lg:col-span-5 space-y-6">

          {/* Differentiated Instructions Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-emerald-400" /> Istruzioni di Squadra (FM26)
              </h3>
            </div>

            {/* Sidebar Phase Selector Tabs */}
            <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold text-center">
              <button
                onClick={() => setActivePhase('inPossession')}
                className={`py-2 rounded-lg transition-all cursor-pointer ${
                  activePhase === 'inPossession'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                In Possesso
              </button>
              <button
                onClick={() => setActivePhase('outOfPossession')}
                className={`py-2 rounded-lg transition-all cursor-pointer ${
                  activePhase === 'outOfPossession'
                    ? 'bg-rose-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Non in Possesso
              </button>
              <button
                onClick={() => setActivePhase('combined')}
                className={`py-2 rounded-lg transition-all cursor-pointer ${
                  activePhase === 'combined'
                    ? 'bg-sky-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Combinata
              </button>
            </div>

            {/* PHASE 1: IN POSSESSO (IN POSSESSION) CONTROLS */}
            {activePhase === 'inPossession' && (
              <div className="space-y-3 text-xs">
                <div className="bg-emerald-950/30 border border-emerald-500/20 p-2.5 rounded-xl text-emerald-300 font-medium text-[11px] mb-2">
                  🟢 Impostazioni per la fase d'attacco e gestione del pallone.
                </div>

                {/* Tempo */}
                <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-300 font-medium">Ritmo di Gioco:</span>
                  <select
                    value={inPossession.tempo}
                    onChange={(e) => updateInPossession({ tempo: e.target.value as any })}
                    className="bg-slate-900 text-emerald-400 font-semibold rounded-lg px-2 py-1 border border-slate-800"
                  >
                    <option value="Molto Alto">Molto Alto</option>
                    <option value="Alto">Alto</option>
                    <option value="Standard">Standard</option>
                    <option value="Basso">Basso</option>
                    <option value="Molto Basso">Molto Basso</option>
                  </select>
                </div>

                {/* Passing Style */}
                <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-300 font-medium">Stile Passaggi:</span>
                  <select
                    value={inPossession.passingStyle}
                    onChange={(e) => updateInPossession({ passingStyle: e.target.value as any })}
                    className="bg-slate-900 text-emerald-400 font-semibold rounded-lg px-2 py-1 border border-slate-800"
                  >
                    <option value="Molto Corto">Molto Corto (Tiki-Taka)</option>
                    <option value="Corto">Corto (Possesso)</option>
                    <option value="Misto">Misto</option>
                    <option value="Diretto">Diretto (Verticale)</option>
                    <option value="Molto Diretto">Molto Diretto (Lancio)</option>
                  </select>
                </div>

                {/* Width */}
                <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-300 font-medium">Ampiezza di Gioco:</span>
                  <select
                    value={inPossession.width}
                    onChange={(e) => updateInPossession({ width: e.target.value as any })}
                    className="bg-slate-900 text-emerald-400 font-semibold rounded-lg px-2 py-1 border border-slate-800"
                  >
                    <option value="Molto Ampio">Molto Ampio</option>
                    <option value="Ampio">Ampio</option>
                    <option value="Standard">Standard</option>
                    <option value="Stretto">Stretto</option>
                    <option value="Molto Stretto">Molto Stretto</option>
                  </select>
                </div>

                {/* Focus Channels */}
                <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-300 font-medium">Canali di Sviluppo:</span>
                  <select
                    value={inPossession.focusChannels}
                    onChange={(e) => updateInPossession({ focusChannels: e.target.value as any })}
                    className="bg-slate-900 text-emerald-400 font-semibold rounded-lg px-2 py-1 border border-slate-800"
                  >
                    <option value="Misto">Misto</option>
                    <option value="Sulle Fasce">Sulle Fasce</option>
                    <option value="Per Vie Centrali">Per Vie Centrali</option>
                    <option value="Cerca i Sovrapposizioni">Cerca Sovrapposizioni</option>
                  </select>
                </div>

                {/* Checkboxes for Specific In Possession Instructions */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <label className="flex items-center space-x-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={inPossession.playOutOfBack}
                      onChange={(e) => updateInPossession({ playOutOfBack: e.target.checked })}
                      className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-900"
                    />
                    <span className="text-slate-200 font-medium text-[11px]">Parti dalla Difesa</span>
                  </label>

                  <label className="flex items-center space-x-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={inPossession.workBallIntoBox}
                      onChange={(e) => updateInPossession({ workBallIntoBox: e.target.checked })}
                      className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-500 bg-slate-900"
                    />
                    <span className="text-slate-200 font-medium text-[11px]">Porta Pallone in Area</span>
                  </label>
                </div>
              </div>
            )}

            {/* PHASE 2: NON IN POSSESSO (OUT OF POSSESSION) CONTROLS */}
            {activePhase === 'outOfPossession' && (
              <div className="space-y-3 text-xs">
                <div className="bg-rose-950/30 border border-rose-500/20 p-2.5 rounded-xl text-rose-300 font-medium text-[11px] mb-2">
                  🔴 Impostazioni per il blocco difensivo, altezza e trappole di pressing.
                </div>

                {/* Defensive Line */}
                <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-300 font-medium">Linea Difensiva:</span>
                  <select
                    value={outOfPossession.defensiveLine}
                    onChange={(e) => updateOutOfPossession({ defensiveLine: e.target.value as any })}
                    className="bg-slate-900 text-rose-400 font-semibold rounded-lg px-2 py-1 border border-slate-800"
                  >
                    <option value="Molto Alta">Molto Alta</option>
                    <option value="Alta">Alta</option>
                    <option value="Standard">Standard</option>
                    <option value="Bassa">Bassa</option>
                    <option value="Molto Bassa">Molto Bassa</option>
                  </select>
                </div>

                {/* Line of Engagement */}
                <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-300 font-medium">Linea d'Ingaggio (Pressing):</span>
                  <select
                    value={outOfPossession.lineOfEngagement}
                    onChange={(e) => updateOutOfPossession({ lineOfEngagement: e.target.value as any })}
                    className="bg-slate-900 text-rose-400 font-semibold rounded-lg px-2 py-1 border border-slate-800"
                  >
                    <option value="Molto Alta">Molto Alta</option>
                    <option value="Alta">Alta</option>
                    <option value="Standard">Standard</option>
                    <option value="Bassa">Bassa</option>
                  </select>
                </div>

                {/* Pressing Trigger */}
                <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-300 font-medium">Intensità Pressing:</span>
                  <select
                    value={outOfPossession.pressingTrigger}
                    onChange={(e) => updateOutOfPossession({ pressingTrigger: e.target.value as any })}
                    className="bg-slate-900 text-rose-400 font-semibold rounded-lg px-2 py-1 border border-slate-800"
                  >
                    <option value="Estremo">Estremo (Gegenpress)</option>
                    <option value="Molto Spesso">Molto Spesso</option>
                    <option value="Standard">Standard</option>
                    <option value="Lieve">Lieve</option>
                    <option value="Mai">Mai (Attesa)</option>
                  </select>
                </div>

                {/* Pressing Trap */}
                <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-300 font-medium">Trappola di Pressing:</span>
                  <select
                    value={outOfPossession.pressingTrap}
                    onChange={(e) => updateOutOfPossession({ pressingTrap: e.target.value as any })}
                    className="bg-slate-900 text-rose-400 font-semibold rounded-lg px-2 py-1 border border-slate-800"
                  >
                    <option value="Verso l'Esterno">Verso l'Esterno (Corsie)</option>
                    <option value="Verso l'Interno">Verso l'Interno (Centro)</option>
                    <option value="Nessuna">Nessuna</option>
                  </select>
                </div>

                {/* Tackling */}
                <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                  <span className="text-slate-300 font-medium">Stile Contrasti:</span>
                  <select
                    value={outOfPossession.tackling}
                    onChange={(e) => updateOutOfPossession({ tackling: e.target.value as any })}
                    className="bg-slate-900 text-rose-400 font-semibold rounded-lg px-2 py-1 border border-slate-800"
                  >
                    <option value="Aggressivi">Aggressivi</option>
                    <option value="Standard">Standard</option>
                    <option value="Rimanere in Piedi">Rimanere in Piedi</option>
                  </select>
                </div>

                {/* Checkbox for Offside Trap */}
                <div className="pt-1">
                  <label className="flex items-center space-x-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={outOfPossession.useOffsideTrap}
                      onChange={(e) => updateOutOfPossession({ useOffsideTrap: e.target.checked })}
                      className="rounded border-slate-700 text-rose-500 focus:ring-rose-500 bg-slate-900"
                    />
                    <span className="text-slate-200 font-medium text-[11px]">Trappola del Fuorigioco Attiva</span>
                  </label>
                </div>
              </div>
            )}

            {/* PHASE 3: COMBINED TACTIC (TATTICA COMBINATA) PANEL */}
            {activePhase === 'combined' && (
              <div className="space-y-3 text-xs">
                <div className="bg-sky-950/40 border border-sky-500/30 p-3 rounded-xl text-sky-200 font-medium text-[11px] space-y-2.5">
                  <div className="flex items-center gap-1.5 font-bold text-sky-300 text-xs">
                    <Sparkles className="w-4 h-4 text-sky-400" />
                    Master Assignment: Tattica Combinata
                  </div>
                  <p className="leading-relaxed text-slate-300">
                    La scheda <b>Combinata</b> è il punto di controllo principale per l'assegnazione dei titolari. Quando selezioni un giocatore qui per una posizione, la sua scelta viene propagata automaticamente sia nella formazione <b>In Possesso</b> che <b>Non in Possesso</b>!
                  </p>
                  <div className="bg-slate-950/90 p-2.5 rounded-xl border border-slate-800 text-[10px] text-slate-300 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                      <span className="text-emerald-300 font-bold">1° Ruolo (Possesso):</span> E.g. Centrocampista Offensivo (in possesso)
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />
                      <span className="text-rose-300 font-bold">2° Ruolo (Non Possesso):</span> E.g. Centrocampista di Quantità (non in possesso)
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SIDEBAR CARD: GESTIONE MANUALE RUOLI (FM26 INGLESE) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <ListFilter className="w-4 h-4 text-sky-400" /> Ruoli Tattici FM26
              </h3>
              <span className="text-[10px] text-sky-300 font-extrabold bg-sky-950 px-2 py-0.5 rounded-full border border-sky-800/80">
                {activePhase === 'inPossession' ? 'In Possesso' : activePhase === 'outOfPossession' ? 'Non in Possesso' : 'Combinata'}
              </span>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Modifica o seleziona manualmente i ruoli in inglese per ciascuna delle 11 posizioni schierate:
            </p>

            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {activePositions.map((pos) => {
                return (
                  <div key={pos.id} className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-emerald-400 font-extrabold text-xs">{pos.label} ({pos.role})</span>
                      <button
                        onClick={() => {
                          const duties: Duty[] = ['Attacco', 'Supporto', 'Difesa'];
                          const nextDuty = duties[(duties.indexOf(pos.duty) + 1) % duties.length];
                          handleDutyChange(pos.id, nextDuty);
                        }}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${getDutyBadge(pos.duty)}`}
                      >
                        {pos.duty}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 items-center">
                      <div>
                        <label className="text-[9px] text-slate-400 font-semibold block mb-0.5">Titolare:</label>
                        <select
                          value={pos.playerId || ''}
                          onChange={(e) => handlePlayerAssign(pos.id, e.target.value)}
                          className="w-full text-[10px] font-bold rounded px-1.5 py-1 bg-slate-900 text-white border border-slate-700 truncate cursor-pointer"
                        >
                          <option value="" className="bg-slate-900 text-amber-400">⚠️ -- Da Assegnare --</option>
                          {players.map(p => (
                            <option key={p.id} value={p.id} className="bg-slate-900 text-white">
                              {p.isInjured ? '🚑 [INFORTUNATO] ' : p.isOnLoan ? '✈️ [IN PRESTITO] ' : p.isPlayerStaff ? '👔 [STAFF] ' : ''}{p.name} ({p.position}){p.isPlayerStaff && p.staffRole ? ` (${p.staffRole})` : ''}{p.isOnLoan && p.loanClub ? ` (al ${p.loanClub})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[9px] text-slate-400 font-semibold block mb-0.5">Ruolo FM26:</label>
                        {renderRoleSelect(pos)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen Image Zoom Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full p-4 space-y-3 relative shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="text-sm font-bold text-white">{previewImage.title}</h4>
              <button
                onClick={() => setPreviewImage(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-[80vh] overflow-auto flex items-center justify-center">
              <img src={previewImage.url} alt="Full Preview" className="max-w-full max-h-[75vh] object-contain rounded-xl" />
            </div>
          </div>
        </div>
      )}

      {/* Tactical Verification Results Modal */}
      {verificationResult?.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 relative shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold text-white">Verifica Coerenza Disposizioni Tattiche</h3>
              </div>
              <button
                onClick={() => setVerificationResult(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Counts breakdown */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">In Possesso</span>
                <span className="text-base font-extrabold text-emerald-400">{verificationResult.inPossCount} / 11</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Non In Possesso</span>
                <span className="text-base font-extrabold text-rose-400">{verificationResult.outPossCount} / 11</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Combinata</span>
                <span className="text-base font-extrabold text-sky-400">{verificationResult.combinedCount} / 11</span>
              </div>
            </div>

            {/* Result Status Box */}
            {verificationResult.isValid ? (
              <div className="bg-emerald-950/60 border border-emerald-500/50 p-4 rounded-xl text-emerald-200 space-y-2">
                <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                  <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>Verifica Superata con Successo!</span>
                </div>
                <p className="text-xs text-emerald-100/90 leading-relaxed">
                  Tutte e 3 le disposizioni tattiche (In Possesso, Non in Possesso, Combinata) sono perfettamente coerenti. Gli stessi giocatori sono schierati in ciascuna fase senza alcuna sovrapposizione o duplicato.
                </p>
              </div>
            ) : (
              <div className="bg-rose-950/60 border border-rose-500/50 p-4 rounded-xl text-rose-200 space-y-3">
                <div className="flex items-center gap-2 text-rose-300 font-bold text-sm">
                  <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
                  <span>Rilevate Incongruenze o Duplicati ({verificationResult.errors.length})</span>
                </div>
                <ul className="space-y-1.5 text-xs text-rose-100 list-disc list-inside bg-slate-950/70 p-3 rounded-lg border border-rose-900/40">
                  {verificationResult.errors.map((err, idx) => (
                    <li key={idx} className="leading-relaxed">{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Warnings list if any */}
            {verificationResult.warnings.length > 0 && (
              <div className="bg-amber-950/40 border border-amber-500/30 p-3.5 rounded-xl text-amber-200 space-y-2">
                <span className="text-xs font-bold text-amber-300 block">Avvisi Assegnazione Ruoli:</span>
                <ul className="space-y-1 text-xs text-amber-100/90 list-disc list-inside">
                  {verificationResult.warnings.map((warn, idx) => (
                    <li key={idx}>{warn}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setVerificationResult(null)}
                className="bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer transition-all border border-slate-700"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Custom Role Input Modal */}
      {customRoleModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-sky-400" />
                <h3 className="text-base font-bold text-white">Modifica Ruolo Personalizzato</h3>
              </div>
              <button
                onClick={() => setCustomRoleModal(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Inserisci la denominazione del ruolo personalizzato per questa posizione:
            </p>

            <input
              type="text"
              value={customRoleInput}
              onChange={(e) => setCustomRoleInput(e.target.value)}
              placeholder="Es. Ball-Playing Defender / Inverted Wing-Back"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-sky-500 font-medium"
              autoFocus
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setCustomRoleModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-800 cursor-pointer"
              >
                Annulla
              </button>
              <button
                onClick={handleSaveCustomRole}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 cursor-pointer transition-all shadow-md"
              >
                Salva Ruolo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
