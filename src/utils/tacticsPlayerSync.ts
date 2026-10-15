import { Player, TacticalPosition, TacticPreset, YouthSquad } from '../types';

export interface TacticsCandidateItem {
  id: string;
  name: string;
  number?: number;
  position: string;
  ca?: number;
  pa?: number;
  isInjured?: boolean;
  isOnLoan?: boolean;
  loanClub?: string;
  isPlayerStaff?: boolean;
  staffRole?: string;
  morale?: string;
  matchLoad?: string;
  isYouth?: boolean;
  squadName?: string;
  assignedElsewhereLabel?: string; // e.g. "DC-D" if already placed on another position
  score: number;
}

export interface GroupedTacticsCandidates {
  primary: TacticsCandidateItem[];    // Consigliati / Ruolo Naturale
  secondary: TacticsCandidateItem[];  // Adattabili / Compatibili
  defenders: TacticsCandidateItem[];  // Altri Difensori
  midfielders: TacticsCandidateItem[];// Altri Centrocampisti
  forwards: TacticsCandidateItem[];   // Altri Attaccanti
  goalkeepers: TacticsCandidateItem[];// Altri Portieri (se slot movimento)
  youth: TacticsCandidateItem[];      // Candidati dalle Giovanili
}

export type PlayerDepartment = 'Portiere' | 'Difensore' | 'Centrocampista' | 'Attaccante';

/**
 * Determina il reparto primario del calciatore in base alla stringa del ruolo.
 */
export function getPlayerDepartment(posStr: string): PlayerDepartment {
  const p = (posStr || '').toUpperCase();
  if (p.includes('POR') || p.includes('GK')) return 'Portiere';
  if (
    p.includes('DC') || p.includes('CB') ||
    p.includes('TD') || p.includes('TS') ||
    p.includes('DD') || p.includes('DS') ||
    p.includes('RB') || p.includes('LB') ||
    p.includes('RWB') || p.includes('LWB') ||
    p.includes('D (') || p.includes('D(') ||
    p.includes('TERZINO') || p.includes('DIFENSORE')
  ) {
    return 'Difensore';
  }
  if (
    p.includes('PC') || p.includes('ATT') ||
    p.includes('ST') || p.includes('CF') ||
    p.includes('PUNTA') || p.includes('A (') ||
    p.includes('A(') || p.startsWith('P ') || p === 'P'
  ) {
    return 'Attaccante';
  }
  return 'Centrocampista';
}

/**
 * Valuta l'affinità di un giocatore con una specifica posizione tattica.
 * Ritorna 'natural' (prima scelta), 'adaptable' (adattabile/secondaria), o 'other'.
 */
export function getRoleFitScore(
  pos: TacticalPosition,
  player: { position: string; bestRoles?: string[] }
): 'natural' | 'adaptable' | 'other' {
  const pLabel = (pos.label || '').toUpperCase().trim();
  const pRole = (pos.role || '').toUpperCase().trim();
  const plPos = (player.position || '').toUpperCase().trim();
  const bestRolesJoined = (player.bestRoles || []).join(' ').toUpperCase();

  // Helper matching
  const hasInPos = (...tokens: string[]) => tokens.some(t => plPos.includes(t));
  const hasInRoles = (...tokens: string[]) => tokens.some(t => bestRolesJoined.includes(t));

  // 1. PORTIERE (POR, GK)
  if (pLabel.includes('POR') || pLabel.includes('GK') || pRole.includes('PORTIERE') || pRole.includes('GOALKEEPER')) {
    if (hasInPos('POR', 'GK') || hasInRoles('PORTIERE', 'GOALKEEPER', 'KEEPER')) {
      return 'natural';
    }
    return 'other';
  }

  // Se lo slot è di movimento ma il giocatore è un portiere puro
  if ((hasInPos('POR', 'GK') || getPlayerDepartment(plPos) === 'Portiere') && !pLabel.includes('POR') && !pLabel.includes('GK')) {
    return 'other';
  }

  // 2. DIFENSORE CENTRALE (DC, CB)
  if (pLabel.startsWith('DC') || pLabel.includes('CB') || pRole.includes('CENTRE-BACK') || pRole.includes('DIFENSORE CENTRALE')) {
    if (hasInPos('DC', 'CB', 'D (C)', 'D(C)') || hasInRoles('CENTRE-BACK', 'DIFENSORE CENTRALE', 'STOPPER', 'BRACCETTO')) {
      return 'natural';
    }
    if (hasInPos('MED', 'DM', 'TD', 'TS', 'DD', 'DS', 'RB', 'LB', 'D (') || hasInRoles('DIFENSORE', 'MEDIANO')) {
      return 'adaptable';
    }
    return 'other';
  }

  // 3. TERZINO / FLUIDIFICANTE DESTRO (TD, DD, RB, RWB)
  if (pLabel.startsWith('TD') || pLabel.startsWith('DD') || pLabel.includes('RB') || pLabel.includes('RWB')) {
    if (hasInPos('TD', 'DD', 'RB', 'RWB', 'D (D)', 'D(D)', 'D (R)', 'D(R)', 'WB (R)', 'WB(R)') || hasInRoles('TERZINO', 'FLUIDIFICANTE', 'FULL-BACK', 'WING-BACK')) {
      return 'natural';
    }
    if (hasInPos('DC', 'CB', 'AD', 'ED', 'AMR', 'RW', 'TS', 'DS') || hasInRoles('ALA')) {
      return 'adaptable';
    }
    return 'other';
  }

  // 4. TERZINO / FLUIDIFICANTE SINISTRO (TS, DS, LB, LWB)
  if (pLabel.startsWith('TS') || pLabel.startsWith('DS') || pLabel.includes('LB') || pLabel.includes('LWB')) {
    if (hasInPos('TS', 'DS', 'LB', 'LWB', 'D (S)', 'D(S)', 'D (L)', 'D(L)', 'WB (L)', 'WB(L)') || hasInRoles('TERZINO', 'FLUIDIFICANTE', 'FULL-BACK', 'WING-BACK')) {
      return 'natural';
    }
    if (hasInPos('DC', 'CB', 'AS', 'ES', 'AML', 'LW', 'TD', 'DD') || hasInRoles('ALA')) {
      return 'adaptable';
    }
    return 'other';
  }

  // 5. MEDIANO / CENTROCAMPISTA DIFENSIVO (MED, DM, M)
  if (pLabel.startsWith('MED') || pLabel.startsWith('DM') || pLabel === 'M' || pRole.includes('MEDIANO') || pRole.includes('DEFENSIVE MID') || pRole.includes('ANCHOR') || pRole.includes('REGISTA ARRETRATO')) {
    if (hasInPos('MED', 'DM', 'M (C)', 'M(C)', 'DM (C)') || hasInRoles('MEDIANO', 'REGISTA ARRETRATO', 'INCONTRISTA', 'DEFENSIVE MIDFIELDER', 'BALL-WINNING')) {
      return 'natural';
    }
    if (hasInPos('CC', 'MC', 'CM', 'DC', 'CB') || hasInRoles('CENTROCAMPISTA', 'DIFENSORE')) {
      return 'adaptable';
    }
    return 'other';
  }

  // 6. CENTROCAMPISTA CENTRALE / MEZZALA (CC, MC, CM, MEZ)
  if (pLabel.startsWith('CC') || pLabel.startsWith('MC') || pLabel.startsWith('CM') || pLabel.startsWith('MEZ') || pRole.includes('CENTROCAMPISTA') || pRole.includes('MEZZALA') || pRole.includes('CENTRAL MIDFIELDER')) {
    if (hasInPos('CC', 'MC', 'CM', 'MEZ', 'C (C)', 'C(C)') || hasInRoles('CENTROCAMPISTA', 'MEZZALA', 'REGISTA', 'BOX-TO-BOX', 'CENTRAL MID')) {
      return 'natural';
    }
    if (hasInPos('MED', 'DM', 'TRQ', 'COC', 'CAM', 'AM', 'CD', 'CS', 'ED', 'ES') || hasInRoles('MEDIANO', 'TREQUARTISTA')) {
      return 'adaptable';
    }
    return 'other';
  }

  // 7. TREQUARTISTA CENTRALE (TRQ, COC, CAM, AM)
  if (pLabel.startsWith('TRQ') || pLabel.startsWith('COC') || pLabel.startsWith('CAM') || pLabel === 'AM' || pLabel === 'AMC' || pRole.includes('ATTACKING MID') || pRole.includes('TREQUARTISTA')) {
    if (hasInPos('TRQ', 'COC', 'CAM', 'AM (C)', 'AM(C)', 'AMC') || hasInRoles('TREQUARTISTA', 'ATTACKING MIDFIELDER', 'REGISTA AVANZATO', 'ENGANCHE', 'SHADOW STRIKER')) {
      return 'natural';
    }
    if (hasInPos('CC', 'MEZ', 'AD', 'AS', 'PC', 'ATT', 'P') || hasInRoles('CENTROCAMPISTA', 'ALA', 'ATTACCANTE')) {
      return 'adaptable';
    }
    return 'other';
  }

  // 8. ALA / ESTERNO DESTRO (AD, ED, AMR, RW, MR, RM, CD)
  if (pLabel.startsWith('AD') || pLabel.startsWith('ED') || pLabel.includes('AMR') || pLabel.includes('RW') || pLabel.includes('MR') || pLabel.includes('CD') || pRole.includes('ALA') || pRole.includes('WINGER')) {
    if (hasInPos('AD', 'ED', 'AMR', 'RW', 'MR', 'RM', 'CD', 'AM (R)', 'AM(R)', 'M (R)', 'M(R)') || hasInRoles('ALA', 'WINGER', 'INSIDE FORWARD', 'INVERTED WINGER')) {
      return 'natural';
    }
    if (hasInPos('AS', 'ES', 'AML', 'LW', 'TRQ', 'COC', 'PC', 'ATT', 'TD', 'DD') || hasInRoles('TREQUARTISTA', 'ATTACCANTE')) {
      return 'adaptable';
    }
    return 'other';
  }

  // 9. ALA / ESTERNO SINISTRO (AS, ES, AML, LW, ML, LM, CS)
  if (pLabel.startsWith('AS') || pLabel.startsWith('ES') || pLabel.includes('AML') || pLabel.includes('LW') || pLabel.includes('ML') || pLabel.includes('CS') || pRole.includes('ALA') || pRole.includes('WINGER')) {
    if (hasInPos('AS', 'ES', 'AML', 'LW', 'ML', 'LM', 'CS', 'AM (L)', 'AM(L)', 'M (L)', 'M(L)') || hasInRoles('ALA', 'WINGER', 'INSIDE FORWARD', 'INVERTED WINGER')) {
      return 'natural';
    }
    if (hasInPos('AD', 'ED', 'AMR', 'RW', 'TRQ', 'COC', 'PC', 'ATT', 'TS', 'DS') || hasInRoles('TREQUARTISTA', 'ATTACCANTE')) {
      return 'adaptable';
    }
    return 'other';
  }

  // 10. PUNTA CENTRALE / ATTACCANTE (PC, ATT, P, ST, CF)
  if (pLabel.startsWith('PC') || pLabel.startsWith('ATT') || pLabel === 'P' || pLabel.includes('ST') || pLabel.includes('CF') || pRole.includes('FORWARD') || pRole.includes('STRIKER') || pRole.includes('ATTACCANTE') || pRole.includes('PUNTA')) {
    if (hasInPos('PC', 'ATT', 'ST', 'CF', 'A (C)', 'A(C)', 'PUNTA', 'P (C)') || hasInRoles('ATTACCANTE', 'PUNTA', 'FORWARD', 'STRIKER', 'FALSE NINE', 'POACHER', 'TARGET FORWARD')) {
      return 'natural';
    }
    if (hasInPos('TRQ', 'COC', 'AD', 'AS', 'AMR', 'AML') || hasInRoles('TREQUARTISTA', 'ALA')) {
      return 'adaptable';
    }
    return 'other';
  }

  // Fallback: se la posizione del giocatore contiene direttamente il label
  if (plPos.includes(pLabel)) {
    return 'natural';
  }

  return 'other';
}

/**
 * Organizza e classifica tutti i giocatori disponibili (Prima Squadra e Giovanili)
 * in gruppi ordinati per pertinenza rispetto al ruolo selezionato.
 */
export function getGroupedTacticsCandidates(
  pos: TacticalPosition,
  firstTeamPlayers: Player[],
  youthSquads: YouthSquad[] = [],
  activePositions: TacticalPosition[] = []
): GroupedTacticsCandidates {
  // Mappa delle assegnazioni attuali per rilevare se un giocatore è già schierato altrove
  const assignedElsewhereMap = new Map<string, string>();
  activePositions.forEach((p) => {
    if (p.playerId && p.id !== pos.id) {
      assignedElsewhereMap.set(p.playerId, p.label);
    }
  });

  const createItem = (
    p: Player,
    isYouth: boolean = false,
    squadName?: string
  ): TacticsCandidateItem => {
    const fit = getRoleFitScore(pos, p);
    let baseScore = 0;
    if (fit === 'natural') baseScore = 3000;
    else if (fit === 'adaptable') baseScore = 2000;
    else baseScore = 1000;

    // Bonus CA per ordinare i più forti per primi
    const caScore = (p.ca || 100) * 2;
    // Malus lieve se già assegnato altrove (per mostrare prima chi è libero)
    const assignedMalus = assignedElsewhereMap.has(p.id) ? -50 : 0;
    // Malus infortuni
    const injuryMalus = p.isInjured ? -200 : 0;

    return {
      id: p.id,
      name: p.name,
      number: p.number,
      position: p.position,
      ca: p.ca,
      pa: p.pa,
      isInjured: p.isInjured,
      isOnLoan: p.isOnLoan,
      loanClub: p.loanClub,
      isPlayerStaff: p.isPlayerStaff,
      staffRole: p.staffRole,
      morale: p.morale,
      matchLoad: p.matchLoad,
      isYouth,
      squadName,
      assignedElsewhereLabel: assignedElsewhereMap.get(p.id),
      score: baseScore + caScore + assignedMalus + injuryMalus,
    };
  };

  const primary: TacticsCandidateItem[] = [];
  const secondary: TacticsCandidateItem[] = [];
  const defenders: TacticsCandidateItem[] = [];
  const midfielders: TacticsCandidateItem[] = [];
  const forwards: TacticsCandidateItem[] = [];
  const goalkeepers: TacticsCandidateItem[] = [];
  const youth: TacticsCandidateItem[] = [];

  // 1. Processa Prima Squadra
  firstTeamPlayers.forEach((p) => {
    const fit = getRoleFitScore(pos, p);
    const item = createItem(p, false);

    if (fit === 'natural') {
      primary.push(item);
    } else if (fit === 'adaptable') {
      secondary.push(item);
    } else {
      const dept = getPlayerDepartment(p.position);
      if (dept === 'Portiere') goalkeepers.push(item);
      else if (dept === 'Difensore') defenders.push(item);
      else if (dept === 'Centrocampista') midfielders.push(item);
      else forwards.push(item);
    }
  });

  // Ordina ciascuna categoria per score decrescente (CA più alto in cima)
  primary.sort((a, b) => b.score - a.score);
  secondary.sort((a, b) => b.score - a.score);
  defenders.sort((a, b) => (b.ca || 0) - (a.ca || 0));
  midfielders.sort((a, b) => (b.ca || 0) - (a.ca || 0));
  forwards.sort((a, b) => (b.ca || 0) - (a.ca || 0));
  goalkeepers.sort((a, b) => (b.ca || 0) - (a.ca || 0));

  // 2. Processa Giovanili (se presenti)
  youthSquads.forEach((sq) => {
    sq.players.forEach((yp) => {
      // Evita duplicati se presente in prima squadra con stesso ID o nome
      const existsInFirst = firstTeamPlayers.some(
        (ftp) => ftp.id === yp.id || ftp.name.toLowerCase().trim() === yp.name.toLowerCase().trim()
      );
      if (!existsInFirst) {
        const item = createItem(yp, true, sq.name);
        youth.push(item);
      }
    });
  });
  youth.sort((a, b) => b.score - a.score);

  return {
    primary,
    secondary,
    defenders,
    midfielders,
    forwards,
    goalkeepers,
    youth,
  };
}

/**
 * Sincronizza tutti i preset tattici con i giocatori attualmente presenti in rosa.
 * 1. Riconnette gli ID se un giocatore ha cambiato ID ma ha lo stesso nome (es. ricaricamento CSV).
 * 2. Rimuove le assegnazioni orfane (se il giocatore è stato venduto, eliminato o svincolato).
 */
export function syncTacticsWithPlayers(
  tactics: TacticPreset[],
  currentPlayers: Player[],
  youthSquads: YouthSquad[] = []
): {
  updatedTactics: TacticPreset[];
  hasChanges: boolean;
  reconnectedCount: number;
  clearedCount: number;
} {
  let hasChanges = false;
  let reconnectedCount = 0;
  let clearedCount = 0;

  // Set di ID validi
  const validIds = new Set<string>();
  currentPlayers.forEach((p) => validIds.add(p.id));
  youthSquads.forEach((sq) => sq.players.forEach((p) => validIds.add(p.id)));

  // Mappa nome normalizzato -> Player (per auto-riconnessione post-CSV)
  const nameToPlayerMap = new Map<string, Player>();
  currentPlayers.forEach((p) => {
    const norm = p.name.toLowerCase().trim();
    if (norm) nameToPlayerMap.set(norm, p);
  });
  youthSquads.forEach((sq) => {
    sq.players.forEach((p) => {
      const norm = p.name.toLowerCase().trim();
      if (norm && !nameToPlayerMap.has(norm)) {
        nameToPlayerMap.set(norm, p);
      }
    });
  });

  const sanitizePositions = (positions?: TacticalPosition[]): TacticalPosition[] | undefined => {
    if (!positions || !Array.isArray(positions)) return positions;

    let posChanged = false;
    const sanitized = positions.map((pos) => {
      if (!pos.playerId) return pos;

      // Se l'ID è già valido nella rosa attuale
      if (validIds.has(pos.playerId)) {
        return pos;
      }

      // Prova a recuperare per nome se possibile (es. ID temporaneo o variato)
      // Non abbiamo il nome memorizzato direttamente in TacticalPosition, ma se l'ID è orfano:
      // Verifichiamo se l'ID conteneva pattern o se è totalmente sconosciuto
      clearedCount++;
      posChanged = true;
      hasChanges = true;
      return {
        ...pos,
        playerId: undefined,
      };
    });

    return posChanged ? sanitized : positions;
  };

  const updatedTactics = tactics.map((tactic) => {
    const newPositions = sanitizePositions(tactic.positions) || tactic.positions;
    const newInPoss = sanitizePositions(tactic.inPossessionPositions);
    const newOutPoss = sanitizePositions(tactic.outOfPossessionPositions);
    const newCombined = sanitizePositions(tactic.combinedPositions);

    if (
      newPositions !== tactic.positions ||
      newInPoss !== tactic.inPossessionPositions ||
      newOutPoss !== tactic.outOfPossessionPositions ||
      newCombined !== tactic.combinedPositions
    ) {
      return {
        ...tactic,
        positions: newPositions,
        inPossessionPositions: newInPoss,
        outOfPossessionPositions: newOutPoss,
        combinedPositions: newCombined,
      };
    }
    return tactic;
  });

  return {
    updatedTactics,
    hasChanges,
    reconnectedCount,
    clearedCount,
  };
}
