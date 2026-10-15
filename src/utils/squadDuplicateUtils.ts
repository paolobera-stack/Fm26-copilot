import { Player, YouthSquad } from '../types';
import { normalizePlayerName } from './attributeDiffUtils';

export interface SquadDuplicateOccurrence {
  squadId: string; // 'first-team' oppure id della youth squad
  squadName: string; // 'Prima Squadra' o nome della squadra giovanile
  isFirstTeam: boolean;
  player: Player;
  index: number;
}

export interface DuplicateGroup {
  key: string; // nome normalizzato
  playerName: string; // nome formattato per la visualizzazione
  occurrences: SquadDuplicateOccurrence[];
  hasCrossSquadDuplicate: boolean;
  hasIntraSquadDuplicate: boolean;
  totalCopies: number;
  squadNames: string[];
  firstTeamCount: number;
  youthSquadCount: number;
}

export interface SquadDuplicatesReport {
  groups: DuplicateGroup[];
  totalDuplicatePlayers: number;
  totalExcessCopies: number;
  crossSquadDuplicateCount: number;
  intraSquadDuplicateCount: number;
  hasDuplicates: boolean;
  // Mappa rapida per playerId -> array di nomi delle ALTRE rose in cui il giocatore è presente
  playerToOtherSquadsMap: Map<string, string[]>;
  // Mappa rapida per nome normalizzato -> array di tutte le rose in cui compare
  nameToAllSquadsMap: Map<string, string[]>;
}

/**
 * Normalizza il nome del giocatore per confronto sicuro
 */
export function getNormalizedKey(name: string): string {
  return normalizePlayerName(name);
}

/**
 * Scansiona la Prima Squadra e tutte le Squadre Giovanili alla ricerca di doppioni
 */
export function findSquadDuplicates(
  firstTeamPlayers: Player[] = [],
  youthSquads: YouthSquad[] = []
): SquadDuplicatesReport {
  const groupsMap = new Map<string, SquadDuplicateOccurrence[]>();
  const displayNameMap = new Map<string, string>();

  // 1. Inserisci Prima Squadra
  firstTeamPlayers.forEach((player, idx) => {
    if (!player || !player.name) return;
    const key = getNormalizedKey(player.name);
    if (!key) return;

    if (!displayNameMap.has(key)) {
      displayNameMap.set(key, player.name.trim());
    }

    const occ: SquadDuplicateOccurrence = {
      squadId: 'first-team',
      squadName: 'Prima Squadra',
      isFirstTeam: true,
      player,
      index: idx,
    };

    if (!groupsMap.has(key)) {
      groupsMap.set(key, [occ]);
    } else {
      groupsMap.get(key)!.push(occ);
    }
  });

  // 2. Inserisci Giovanili
  youthSquads.forEach((sq) => {
    (sq.players || []).forEach((player, idx) => {
      if (!player || !player.name) return;
      const key = getNormalizedKey(player.name);
      if (!key) return;

      if (!displayNameMap.has(key)) {
        displayNameMap.set(key, player.name.trim());
      }

      const occ: SquadDuplicateOccurrence = {
        squadId: sq.id,
        squadName: sq.name || 'Rosa Giovanile',
        isFirstTeam: false,
        player,
        index: idx,
      };

      if (!groupsMap.has(key)) {
        groupsMap.set(key, [occ]);
      } else {
        groupsMap.get(key)!.push(occ);
      }
    });
  });

  // 3. Filtra solo i gruppi con almeno 2 occorrenze (doppioni)
  const duplicateGroups: DuplicateGroup[] = [];
  const playerToOtherSquadsMap = new Map<string, string[]>();
  const nameToAllSquadsMap = new Map<string, string[]>();

  let totalExcessCopies = 0;
  let crossSquadDuplicateCount = 0;
  let intraSquadDuplicateCount = 0;

  groupsMap.forEach((occurrences, key) => {
    if (occurrences.length > 1) {
      const uniqueSquadIds = new Set(occurrences.map((o) => o.squadId));
      const hasCrossSquad = uniqueSquadIds.size > 1;
      const hasIntraSquad = occurrences.some(
        (o) => occurrences.filter((sub) => sub.squadId === o.squadId).length > 1
      );

      const uniqueSquadNames = Array.from(new Set(occurrences.map((o) => o.squadName)));
      const firstTeamCount = occurrences.filter((o) => o.isFirstTeam).length;
      const youthSquadCount = occurrences.length - firstTeamCount;

      totalExcessCopies += occurrences.length - 1;
      if (hasCrossSquad) crossSquadDuplicateCount++;
      if (hasIntraSquad) intraSquadDuplicateCount++;

      nameToAllSquadsMap.set(key, uniqueSquadNames);

      // Popola mappa per singolo player id
      occurrences.forEach((occ) => {
        const otherSquadNames = occurrences
          .filter((other) => other !== occ)
          .map((other) => other.squadName);
        const uniqueOtherNames = Array.from(new Set(otherSquadNames));
        playerToOtherSquadsMap.set(occ.player.id, uniqueOtherNames);
      });

      duplicateGroups.push({
        key,
        playerName: displayNameMap.get(key) || occurrences[0].player.name,
        occurrences,
        hasCrossSquadDuplicate: hasCrossSquad,
        hasIntraSquadDuplicate: hasIntraSquad,
        totalCopies: occurrences.length,
        squadNames: uniqueSquadNames,
        firstTeamCount,
        youthSquadCount,
      });
    }
  });

  // Ordina i gruppi: prima quelli presenti sia in Prima Squadra che giovanili, poi per numero di copie
  duplicateGroups.sort((a, b) => {
    if (a.hasCrossSquadDuplicate && !b.hasCrossSquadDuplicate) return -1;
    if (!a.hasCrossSquadDuplicate && b.hasCrossSquadDuplicate) return 1;
    return b.totalCopies - a.totalCopies;
  });

  return {
    groups: duplicateGroups,
    totalDuplicatePlayers: duplicateGroups.length,
    totalExcessCopies,
    crossSquadDuplicateCount,
    intraSquadDuplicateCount,
    hasDuplicates: duplicateGroups.length > 0,
    playerToOtherSquadsMap,
    nameToAllSquadsMap,
  };
}

/**
 * Fonde due versioni dello stesso giocatore per preservare note, statistiche e attributi migliori
 */
export function mergePlayerData(primary: Player, secondary: Player): Player {
  const merged: Player = { ...secondary, ...primary };

  // 1. Preserva CA e PA più alti se presenti
  if (secondary.ca !== undefined && (primary.ca === undefined || secondary.ca > primary.ca)) {
    merged.ca = secondary.ca;
  }
  if (secondary.pa !== undefined && (primary.pa === undefined || secondary.pa > primary.pa)) {
    merged.pa = secondary.pa;
  }

  // 2. Preserva valore se il primario non ne ha
  if (!merged.value && secondary.value) {
    merged.value = secondary.value;
  }

  // 3. Fonde le note senza perdere appunti del manager o tag [Copilot AI]
  const notesPrimary = (primary.notes || '').trim();
  const notesSecondary = (secondary.notes || '').trim();

  if (notesPrimary && notesSecondary && notesPrimary !== notesSecondary) {
    if (!notesPrimary.includes(notesSecondary) && !notesSecondary.includes(notesPrimary)) {
      merged.notes = `${notesPrimary}\n\n[Nota importata da altra rosa]: ${notesSecondary}`;
    } else if (notesSecondary.length > notesPrimary.length) {
      merged.notes = notesSecondary;
    } else {
      merged.notes = notesPrimary;
    }
  } else if (!notesPrimary && notesSecondary) {
    merged.notes = notesSecondary;
  }

  // 4. Preserva lo storico attributi combinato
  const histP = primary.attributeHistory || [];
  const histS = secondary.attributeHistory || [];
  if (histS.length > 0) {
    const combinedHistory = [...histP];
    histS.forEach((item) => {
      if (!combinedHistory.some((h) => h.date === item.date)) {
        combinedHistory.push(item);
      }
    });
    merged.attributeHistory = combinedHistory;
  }

  // 5. Preserva attributi tecnici/mentali/fisici più completi
  if (!merged.technicalAttributes && secondary.technicalAttributes) {
    merged.technicalAttributes = secondary.technicalAttributes;
  }
  if (!merged.mentalAttributes && secondary.mentalAttributes) {
    merged.mentalAttributes = secondary.mentalAttributes;
  }
  if (!merged.physicalAttributes && secondary.physicalAttributes) {
    merged.physicalAttributes = secondary.physicalAttributes;
  }
  if (!merged.goalkeepingAttributes && secondary.goalkeepingAttributes) {
    merged.goalkeepingAttributes = secondary.goalkeepingAttributes;
  }

  return merged;
}

/**
 * Risolve un doppione mantenendo il giocatore in una specifica rosa (targetSquadId)
 * e rimuovendolo da tutte le altre rose (e da copie duplicate all'interno della stessa rosa).
 */
export function resolveDuplicateKeepInSquad(
  firstTeamPlayers: Player[],
  youthSquads: YouthSquad[],
  normalizedKey: string,
  targetSquadId: string
): {
  updatedFirstTeam: Player[];
  updatedYouthSquads: YouthSquad[];
  resolvedPlayerName: string;
} {
  const normKey = normalizedKey.trim().toLowerCase();

  // Raccogli tutte le copie del giocatore
  const allInstances: { squadId: string; player: Player }[] = [];

  firstTeamPlayers.forEach((p) => {
    if (getNormalizedKey(p.name) === normKey) {
      allInstances.push({ squadId: 'first-team', player: p });
    }
  });

  youthSquads.forEach((sq) => {
    (sq.players || []).forEach((p) => {
      if (getNormalizedKey(p.name) === normKey) {
        allInstances.push({ squadId: sq.id, player: p });
      }
    });
  });

  if (allInstances.length === 0) {
    return {
      updatedFirstTeam: firstTeamPlayers,
      updatedYouthSquads: youthSquads,
      resolvedPlayerName: '',
    };
  }

  // Trova l'istanza primaria nella rosa target
  const targetInstance =
    allInstances.find((inst) => inst.squadId === targetSquadId) || allInstances[0];

  // Fonde tutti i dati delle altre copie nell'istanza primaria
  let finalPlayer = { ...targetInstance.player };
  allInstances.forEach((inst) => {
    if (inst !== targetInstance) {
      finalPlayer = mergePlayerData(finalPlayer, inst.player);
    }
  });

  const resolvedPlayerName = finalPlayer.name;

  // Costruisci le nuove liste
  let updatedFirstTeam: Player[];
  if (targetSquadId === 'first-team') {
    // Mantieni solo l'istanza finale in Prima Squadra
    let inserted = false;
    updatedFirstTeam = [];
    firstTeamPlayers.forEach((p) => {
      if (getNormalizedKey(p.name) === normKey) {
        if (!inserted) {
          updatedFirstTeam.push(finalPlayer);
          inserted = true;
        }
      } else {
        updatedFirstTeam.push(p);
      }
    });
    if (!inserted) {
      updatedFirstTeam.unshift(finalPlayer);
    }
  } else {
    // Rimuovi completamente dalla Prima Squadra
    updatedFirstTeam = firstTeamPlayers.filter((p) => getNormalizedKey(p.name) !== normKey);
  }

  const updatedYouthSquads = youthSquads.map((sq) => {
    if (sq.id === targetSquadId) {
      // In questa rosa target mantieni solo l'istanza finale
      let inserted = false;
      const newPlayers: Player[] = [];
      (sq.players || []).forEach((p) => {
        if (getNormalizedKey(p.name) === normKey) {
          if (!inserted) {
            newPlayers.push(finalPlayer);
            inserted = true;
          }
        } else {
          newPlayers.push(p);
        }
      });
      if (!inserted) {
        newPlayers.unshift(finalPlayer);
      }
      return { ...sq, players: newPlayers };
    } else {
      // Rimuovi da questa squadra
      return {
        ...sq,
        players: (sq.players || []).filter((p) => getNormalizedKey(p.name) !== normKey),
      };
    }
  });

  return {
    updatedFirstTeam,
    updatedYouthSquads,
    resolvedPlayerName,
  };
}

/**
 * Rimuove una specifica istanza singola di un giocatore da una rosa
 */
export function removeSpecificDuplicateOccurrence(
  firstTeamPlayers: Player[],
  youthSquads: YouthSquad[],
  squadId: string,
  playerId: string
): {
  updatedFirstTeam: Player[];
  updatedYouthSquads: YouthSquad[];
} {
  if (squadId === 'first-team') {
    return {
      updatedFirstTeam: firstTeamPlayers.filter((p) => p.id !== playerId),
      updatedYouthSquads: youthSquads,
    };
  }

  const updatedYouthSquads = youthSquads.map((sq) => {
    if (sq.id === squadId) {
      return {
        ...sq,
        players: (sq.players || []).filter((p) => p.id !== playerId),
      };
    }
    return sq;
  });

  return {
    updatedFirstTeam: firstTeamPlayers,
    updatedYouthSquads,
  };
}

/**
 * Risoluzione Automatica Intelligente di TUTTI i doppioni:
 * 1. Se il giocatore è in Prima Squadra -> lo mantiene in Prima Squadra (unendo note/statistiche dalle giovanili) e lo rimuove dalle giovanili.
 * 2. Se è in più giovanili -> lo mantiene nella rosa di categoria superiore (B > U21 > U20 > U19 > U18), unendo i dati.
 * 3. Se duplicato all'interno della stessa rosa -> mantiene una singola copia con i dati uniti.
 */
export function resolveAllDuplicatesSmart(
  firstTeamPlayers: Player[],
  youthSquads: YouthSquad[]
): {
  updatedFirstTeam: Player[];
  updatedYouthSquads: YouthSquad[];
  resolvedPlayerCount: number;
  removedCopiesCount: number;
} {
  const report = findSquadDuplicates(firstTeamPlayers, youthSquads);
  if (!report.hasDuplicates) {
    return {
      updatedFirstTeam: firstTeamPlayers,
      updatedYouthSquads: youthSquads,
      resolvedPlayerCount: 0,
      removedCopiesCount: 0,
    };
  }

  let currentFT = [...firstTeamPlayers];
  let currentYouth = [...youthSquads];
  let resolvedCount = 0;
  let removedCopiesCount = 0;

  report.groups.forEach((group) => {
    // Determina quale rosa è la prioritaria:
    // Priorità 1: Prima Squadra se presente
    const hasFT = group.occurrences.some((o) => o.isFirstTeam);
    let targetSquadId = 'first-team';

    if (!hasFT) {
      // Cerca la giovanile con priorità più alta
      const youthOccs = group.occurrences.filter((o) => !o.isFirstTeam);
      const categoryRank: Record<string, number> = {
        B: 10,
        U23: 9,
        U21: 8,
        U20: 7,
        U19: 6,
        U18: 5,
        U17: 4,
      };

      let bestRank = -1;
      let bestSquadId = youthOccs[0]?.squadId || '';

      youthOccs.forEach((occ) => {
        const sq = youthSquads.find((s) => s.id === occ.squadId);
        const cat = (sq?.category || '').toUpperCase();
        const rank = categoryRank[cat] || 1;
        if (rank > bestRank) {
          bestRank = rank;
          bestSquadId = occ.squadId;
        }
      });

      targetSquadId = bestSquadId;
    }

    const res = resolveDuplicateKeepInSquad(currentFT, currentYouth, group.key, targetSquadId);
    currentFT = res.updatedFirstTeam;
    currentYouth = res.updatedYouthSquads;
    resolvedCount++;
    removedCopiesCount += group.totalCopies - 1;
  });

  return {
    updatedFirstTeam: currentFT,
    updatedYouthSquads: currentYouth,
    resolvedPlayerCount: resolvedCount,
    removedCopiesCount,
  };
}
