import { Player, PlayerAttributeSnapshot, PlayerVariationInfo, PlayerVariationAttribute } from '../types';
import { getDaysDifference } from './dateUtils';

export interface AttributeDiffItem {
  attribute: string;
  category: 'Tecnico' | 'Mentale' | 'Fisico' | 'Portiere' | 'Abilità';
  oldVal: number;
  newVal: number;
  diff: number;
}

export interface PlayerDiffResult {
  playerId: string;
  name: string;
  position: string;
  oldCa?: number;
  newCa?: number;
  caDiff: number;
  oldPa?: number;
  newPa?: number;
  paDiff: number;
  improved: AttributeDiffItem[];
  declined: AttributeDiffItem[];
  unchangedCount: number;
  isNew: boolean;
  status: 'improved' | 'declined' | 'stable' | 'new';
  // Temporal fields
  baselineDate?: string;
  comparisonDate?: string;
  daysElapsed?: number;
  monthsElapsed?: number;
  timeSpanLabel?: string;
  caPacePerMonth?: number;
  paceAssessment?: 'rapida' | 'regolare' | 'lenta' | 'stabile' | 'calo_rapido' | 'calo_graduale';
  paceLabel?: string;
}

export interface SquadDiffSummary {
  improvedPlayers: PlayerDiffResult[];
  declinedPlayers: PlayerDiffResult[];
  stablePlayers: PlayerDiffResult[];
  newPlayers: PlayerDiffResult[];
  totalImprovedCount: number;
  totalDeclinedCount: number;
  totalNewCount: number;
  totalUnchangedCount: number;
  // Dati Temporali del Confronto Squadra
  baselineDate?: string;
  comparisonDate?: string;
  daysElapsed?: number;
  monthsElapsed?: number;
  timeSpanLabel?: string;
  avgImprovedPacePerMonth?: number;
}

export interface TemporalSpanInfo {
  fromDate?: string;
  toDate?: string;
  daysElapsed: number;
  monthsElapsed: number;
  timeSpanLabel: string;
  caPacePerMonth?: number;
  paceAssessment: 'rapida' | 'regolare' | 'lenta' | 'stabile' | 'calo_rapido' | 'calo_graduale';
  paceLabel: string;
}

/**
 * Calcola l'intervallo temporale tra due date in giorni e mesi,
 * determinando la velocità di sviluppo (es. +2 CA in 3 mesi = +0.67/mese vs +2 in 8 mesi = +0.25/mese).
 */
export function calculateTemporalSpan(
  fromDateStr?: string,
  toDateStr?: string,
  caDiff: number = 0
): TemporalSpanInfo {
  const fromClean = fromDateStr?.trim();
  const toClean = toDateStr?.trim();

  let days = 0;
  if (fromClean && toClean) {
    const diff = getDaysDifference(fromClean, toClean);
    if (diff !== null) {
      days = Math.abs(diff);
    }
  }

  // Calcolo mesi (in media 30.42 giorni al mese)
  const months = days > 0 ? Number((days / 30.417).toFixed(1)) : 0;

  let timeSpanLabel = '';
  if (days === 0) {
    timeSpanLabel = fromClean && toClean && fromClean !== toClean
      ? `Intervallo rilevato (${fromClean} → ${toClean})`
      : 'Stessa rilevazione';
  } else if (days < 30) {
    timeSpanLabel = `${days} giorni (${fromClean || ''} → ${toClean || ''})`.trim();
  } else {
    const roundedMonths = Math.max(1, Math.round(months));
    const mLabel = roundedMonths === 1 ? '1 mese' : `${roundedMonths} mesi`;
    timeSpanLabel = fromClean && toClean
      ? `${mLabel} (${days} gg, dal ${fromClean} al ${toClean})`
      : `${mLabel} (${days} giorni)`;
  }

  // Calcolo tasso di variazione CA al mese (evitando divisioni anomale se mesi < 0.25)
  let caPacePerMonth = 0;
  if (caDiff !== 0) {
    const effectiveMonths = Math.max(0.25, months);
    caPacePerMonth = Number((caDiff / effectiveMonths).toFixed(2));
  }

  let paceAssessment: 'rapida' | 'regolare' | 'lenta' | 'stabile' | 'calo_rapido' | 'calo_graduale' = 'stabile';
  let paceLabel = 'Livello Stabile (0 CA/mese)';

  if (caDiff > 0) {
    if (caPacePerMonth >= 0.5) {
      paceAssessment = 'rapida';
      paceLabel = `Crescita Rapida (+${caPacePerMonth} CA/mese)`;
    } else if (caPacePerMonth >= 0.2) {
      paceAssessment = 'regolare';
      paceLabel = `Crescita Regolare (+${caPacePerMonth} CA/mese)`;
    } else {
      paceAssessment = 'lenta';
      paceLabel = `Crescita Graduale (+${caPacePerMonth} CA/mese)`;
    }
  } else if (caDiff < 0) {
    if (caPacePerMonth <= -0.5) {
      paceAssessment = 'calo_rapido';
      paceLabel = `Calo Rapido (${caPacePerMonth} CA/mese)`;
    } else {
      paceAssessment = 'calo_graduale';
      paceLabel = `Calo Graduale (${caPacePerMonth} CA/mese)`;
    }
  } else {
    paceAssessment = 'stabile';
    paceLabel = 'Livello Stabile (0 CA/mese)';
  }

  return {
    fromDate: fromClean,
    toDate: toClean,
    daysElapsed: days,
    monthsElapsed: months,
    timeSpanLabel,
    caPacePerMonth,
    paceAssessment,
    paceLabel,
  };
}

/**
 * Normalizza il nome per matching case-insensitive e pulito
 */
export function normalizePlayerName(name: string): string {
  return (name || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Confronta gli attributi numerici di due oggetti record
 */
function diffAttributeRecords(
  category: 'Tecnico' | 'Mentale' | 'Fisico' | 'Portiere',
  oldRecord?: Record<string, number>,
  newRecord?: Record<string, number>
): { improved: AttributeDiffItem[]; declined: AttributeDiffItem[]; unchangedCount: number } {
  const improved: AttributeDiffItem[] = [];
  const declined: AttributeDiffItem[] = [];
  let unchangedCount = 0;

  if (!oldRecord && !newRecord) {
    return { improved, declined, unchangedCount };
  }

  const allKeys = new Set([...Object.keys(oldRecord || {}), ...Object.keys(newRecord || {})]);

  for (const key of allKeys) {
    const oldVal = oldRecord ? oldRecord[key] : undefined;
    const newVal = newRecord ? newRecord[key] : undefined;

    if (oldVal !== undefined && newVal !== undefined) {
      const diff = newVal - oldVal;
      if (diff > 0) {
        improved.push({ attribute: key, category, oldVal, newVal, diff });
      } else if (diff < 0) {
        declined.push({ attribute: key, category, oldVal, newVal, diff });
      } else {
        unchangedCount++;
      }
    }
  }

  return { improved, declined, unchangedCount };
}

/**
 * Confronta un singolo giocatore esistente con quello in arrivo dal CSV,
 * calcolando anche la temporalità e il tasso mensile di variazione.
 */
export function comparePlayerAttributes(
  existing: Player,
  incoming: Player,
  baselineDateStr?: string,
  newDateStr?: string
): PlayerDiffResult {
  const oldCa = existing.ca;
  const newCa = incoming.ca;
  const caDiff = (newCa !== undefined && oldCa !== undefined) ? newCa - oldCa : 0;

  const oldPa = existing.pa;
  const newPa = incoming.pa;
  const paDiff = (newPa !== undefined && oldPa !== undefined) ? newPa - oldPa : 0;

  const techDiff = diffAttributeRecords('Tecnico', existing.technicalAttributes, incoming.technicalAttributes);
  const mentDiff = diffAttributeRecords('Mentale', existing.mentalAttributes, incoming.mentalAttributes);
  const physDiff = diffAttributeRecords('Fisico', existing.physicalAttributes, incoming.physicalAttributes);
  const gkDiff = diffAttributeRecords('Portiere', existing.goalkeepingAttributes, incoming.goalkeepingAttributes);

  const improved = [...techDiff.improved, ...mentDiff.improved, ...physDiff.improved, ...gkDiff.improved];
  const declined = [...techDiff.declined, ...mentDiff.declined, ...physDiff.declined, ...gkDiff.declined];
  const unchangedCount = techDiff.unchangedCount + mentDiff.unchangedCount + physDiff.unchangedCount + gkDiff.unchangedCount;

  let status: 'improved' | 'declined' | 'stable' | 'new' = 'stable';
  if (caDiff > 0 || (caDiff === 0 && improved.length > declined.length && improved.length > 0)) {
    status = 'improved';
  } else if (caDiff < 0 || (caDiff === 0 && declined.length > improved.length && declined.length > 0)) {
    status = 'declined';
  }

  const effBaseline = baselineDateStr || existing.lastUpdatedDate ||
    (existing.attributeHistory && existing.attributeHistory.length > 0 ? existing.attributeHistory[existing.attributeHistory.length - 1].date : '1 Luglio 2026');
  const effNewDate = newDateStr || incoming.lastUpdatedDate || new Date().toISOString().split('T')[0];
  const temporal = calculateTemporalSpan(effBaseline, effNewDate, caDiff);

  return {
    playerId: existing.id,
    name: incoming.name || existing.name,
    position: incoming.position || existing.position,
    oldCa,
    newCa,
    caDiff,
    oldPa,
    newPa,
    paDiff,
    improved,
    declined,
    unchangedCount,
    isNew: false,
    status,
    baselineDate: effBaseline,
    comparisonDate: effNewDate,
    daysElapsed: temporal.daysElapsed,
    monthsElapsed: temporal.monthsElapsed,
    timeSpanLabel: temporal.timeSpanLabel,
    caPacePerMonth: temporal.caPacePerMonth,
    paceAssessment: temporal.paceAssessment,
    paceLabel: temporal.paceLabel,
  };
}

/**
 * Calcola il resoconto completo delle differenze tra i giocatori attuali e quelli nel nuovo CSV,
 * includendo la finestra temporale e il ritmo medio di sviluppo della rosa.
 */
export function computeSquadDiffReport(
  existingPlayers: Player[],
  incomingPlayers: Player[],
  baselineDateStr?: string,
  newDateStr?: string
): SquadDiffSummary {
  const existingMap = new Map<string, Player>();
  existingPlayers.forEach(p => {
    existingMap.set(normalizePlayerName(p.name), p);
  });

  const improvedPlayers: PlayerDiffResult[] = [];
  const declinedPlayers: PlayerDiffResult[] = [];
  const stablePlayers: PlayerDiffResult[] = [];
  const newPlayers: PlayerDiffResult[] = [];

  incomingPlayers.forEach(incoming => {
    const key = normalizePlayerName(incoming.name);
    const existing = existingMap.get(key);

    if (!existing) {
      newPlayers.push({
        playerId: incoming.id,
        name: incoming.name,
        position: incoming.position,
        newCa: incoming.ca,
        newPa: incoming.pa,
        caDiff: 0,
        paDiff: 0,
        improved: [],
        declined: [],
        unchangedCount: 0,
        isNew: true,
        status: 'new'
      });
    } else {
      const diff = comparePlayerAttributes(existing, incoming, baselineDateStr, newDateStr);
      if (diff.status === 'improved') {
        improvedPlayers.push(diff);
      } else if (diff.status === 'declined') {
        declinedPlayers.push(diff);
      } else {
        stablePlayers.push(diff);
      }
    }
  });

  // Ordina per tasso mensile e poi entità di crescita
  improvedPlayers.sort((a, b) => (b.caPacePerMonth || 0) - (a.caPacePerMonth || 0) || b.caDiff - a.caDiff);
  declinedPlayers.sort((a, b) => a.caDiff - b.caDiff || b.declined.length - a.declined.length);

  // Metriche temporali complessive di squadra
  const effBaseline = baselineDateStr || (existingPlayers[0]?.lastUpdatedDate || '1 Luglio 2026');
  const effNewDate = newDateStr || (incomingPlayers[0]?.lastUpdatedDate || new Date().toISOString().split('T')[0]);
  const overallTemporal = calculateTemporalSpan(effBaseline, effNewDate);

  let avgImprovedPacePerMonth: number | undefined = undefined;
  if (improvedPlayers.length > 0) {
    const sumPace = improvedPlayers.reduce((acc, p) => acc + (p.caPacePerMonth || 0), 0);
    avgImprovedPacePerMonth = Number((sumPace / improvedPlayers.length).toFixed(2));
  }

  return {
    improvedPlayers,
    declinedPlayers,
    stablePlayers,
    newPlayers,
    totalImprovedCount: improvedPlayers.length,
    totalDeclinedCount: declinedPlayers.length,
    totalNewCount: newPlayers.length,
    totalUnchangedCount: stablePlayers.length,
    baselineDate: effBaseline,
    comparisonDate: effNewDate,
    daysElapsed: overallTemporal.daysElapsed,
    monthsElapsed: overallTemporal.monthsElapsed,
    timeSpanLabel: overallTemporal.timeSpanLabel,
    avgImprovedPacePerMonth,
  };
}

/**
 * Crea uno snapshot archiviabile delle caratteristiche attuali del giocatore
 */
export function createAttributeSnapshot(player: Player, dateStr?: string): PlayerAttributeSnapshot {
  return {
    date: dateStr || player.lastUpdatedDate || new Date().toISOString().split('T')[0],
    timestamp: Date.now(),
    ca: player.ca,
    pa: player.pa,
    value: player.value,
    technicalAttributes: player.technicalAttributes ? { ...player.technicalAttributes } : undefined,
    mentalAttributes: player.mentalAttributes ? { ...player.mentalAttributes } : undefined,
    physicalAttributes: player.physicalAttributes ? { ...player.physicalAttributes } : undefined,
    goalkeepingAttributes: player.goalkeepingAttributes ? { ...player.goalkeepingAttributes } : undefined,
    notes: player.notes,
  };
}

/**
 * Unisce il giocatore in arrivo con quello esistente, salvando lo snapshot precedente nello storico
 * e calcolando la variazione puntuale con timestamp dell'importazione.
 */
export function mergePlayerWithHistory(
  existing: Player,
  incoming: Player,
  currentDateStr?: string,
  updateTimestamp?: number,
  baselineDateStr?: string
): Player {
  const history = [...(existing.attributeHistory || [])];
  const nowTimestamp = updateTimestamp || Date.now();
  const effectiveDate = currentDateStr || existing.lastUpdatedDate || new Date().toISOString().split('T')[0];

  // Data di partenza del confronto (baseline)
  const previousDate = baselineDateStr || existing.lastUpdatedDate ||
    (history.length > 0 ? history[history.length - 1].date : '1 Luglio 2026');

  // Verifica se ci sono attributi effettivi da archiviare
  const hasAttributes = existing.ca !== undefined ||
    (existing.technicalAttributes && Object.keys(existing.technicalAttributes).length > 0) ||
    (existing.mentalAttributes && Object.keys(existing.mentalAttributes).length > 0) ||
    (existing.physicalAttributes && Object.keys(existing.physicalAttributes).length > 0);

  // Crea snapshot della versione precedente se c'è sostanza e differisce
  if (hasAttributes) {
    const previousSnapshot: PlayerAttributeSnapshot = {
      ...createAttributeSnapshot(existing, existing.lastUpdatedDate || previousDate),
      timestamp: existing.lastUpdatedTimestamp || nowTimestamp - 60000,
    };

    // Evita duplicati identici consecutivi se archiviati lo stesso giorno con gli stessi valori
    const lastSnapshot = history[history.length - 1];
    const isDuplicate = lastSnapshot &&
      lastSnapshot.date === previousSnapshot.date &&
      lastSnapshot.ca === previousSnapshot.ca &&
      lastSnapshot.pa === previousSnapshot.pa;

    if (!isDuplicate) {
      history.push(previousSnapshot);
      // Mantieni al massimo gli ultimi 15 snapshot per non appesantire la memoria
      if (history.length > 15) {
        history.splice(0, history.length - 15);
      }
    }
  }

  // Calcola la variazione tra i valori precedenti e quelli nuovi considerando l'intervallo temporale
  const diff = comparePlayerAttributes(existing, incoming, previousDate, effectiveDate);
  const temporal = calculateTemporalSpan(previousDate, effectiveDate, diff.caDiff);
  let lastVariation: PlayerVariationInfo | undefined = undefined;

  const hasDiffs = diff.caDiff !== 0 || diff.paDiff !== 0 || diff.improved.length > 0 || diff.declined.length > 0;
  if (hasDiffs) {
    lastVariation = {
      status: diff.status === 'new' ? 'stable' : diff.status,
      caDiff: diff.caDiff,
      paDiff: diff.paDiff,
      improvedCount: diff.improved.length,
      declinedCount: diff.declined.length,
      improvedAttrs: diff.improved.map((i) => ({
        name: i.attribute,
        category: i.category,
        oldVal: i.oldVal,
        newVal: i.newVal,
        diff: i.diff,
      })),
      declinedAttrs: diff.declined.map((d) => ({
        name: d.attribute,
        category: d.category,
        oldVal: d.oldVal,
        newVal: d.newVal,
        diff: d.diff,
      })),
      timestamp: nowTimestamp,
      date: effectiveDate,
      previousDate,
      currentDate: effectiveDate,
      daysElapsed: temporal.daysElapsed,
      monthsElapsed: temporal.monthsElapsed,
      timeSpanLabel: temporal.timeSpanLabel,
      caPacePerMonth: temporal.caPacePerMonth,
      paceAssessment: temporal.paceAssessment,
      paceLabel: temporal.paceLabel,
    };
  } else {
    // Valore 0 nelle crescite e cali -> Livello STABILE (0)
    lastVariation = {
      status: 'stable',
      caDiff: 0,
      paDiff: 0,
      improvedCount: 0,
      declinedCount: 0,
      improvedAttrs: [],
      declinedAttrs: [],
      timestamp: nowTimestamp,
      date: effectiveDate,
      previousDate,
      currentDate: effectiveDate,
      daysElapsed: temporal.daysElapsed,
      monthsElapsed: temporal.monthsElapsed,
      timeSpanLabel: temporal.timeSpanLabel,
      caPacePerMonth: 0,
      paceAssessment: 'stabile',
      paceLabel: 'Livello Stabile (0 CA/mese)',
    };
  }

  return {
    ...existing,
    ...incoming,
    id: existing.id,
    notes: existing.notes || incoming.notes,
    injuryNote: existing.isInjured ? existing.injuryNote : incoming.injuryNote,
    isOnLoan: existing.isOnLoan !== undefined ? existing.isOnLoan : incoming.isOnLoan,
    loanClub: existing.loanClub || incoming.loanClub,
    isPlayerStaff: existing.isPlayerStaff !== undefined ? existing.isPlayerStaff : incoming.isPlayerStaff,
    staffRole: existing.staffRole || incoming.staffRole,
    availableForYouth: existing.availableForYouth !== undefined ? existing.availableForYouth : incoming.availableForYouth,
    youthSquadDesignation: existing.youthSquadDesignation || incoming.youthSquadDesignation,
    youthMatchMinutes: existing.youthMatchMinutes || incoming.youthMatchMinutes,
    technicalAttributes: { ...(existing.technicalAttributes || {}), ...(incoming.technicalAttributes || {}) },
    mentalAttributes: { ...(existing.mentalAttributes || {}), ...(incoming.mentalAttributes || {}) },
    physicalAttributes: { ...(existing.physicalAttributes || {}), ...(incoming.physicalAttributes || {}) },
    goalkeepingAttributes: { ...(existing.goalkeepingAttributes || {}), ...(incoming.goalkeepingAttributes || {}) },
    personalityAttributes: { ...(existing.personalityAttributes || {}), ...(incoming.personalityAttributes || {}) },
    positionsDetail: { ...(existing.positionsDetail || {}), ...(incoming.positionsDetail || {}) },
    attributeHistory: history,
    lastUpdatedDate: effectiveDate,
    lastUpdatedTimestamp: nowTimestamp,
    lastVariation,
  };
}

/**
 * Ricava la variazione recente di un giocatore rispetto all'ultima importazione CSV,
 * arricchita con la metrica temporale (giorni, mesi, ritmo di crescita mensile).
 */
export function getPlayerLastVariation(player: Player): PlayerVariationInfo | null {
  if (player.lastVariation) {
    // Se mancano i dati temporali (es. importazioni precedenti o state parziale), arricchiscili al volo
    if (player.lastVariation.timeSpanLabel === undefined) {
      const prevDate = player.lastVariation.previousDate ||
        (player.attributeHistory && player.attributeHistory.length > 0 ? player.attributeHistory[0].date : '1 Luglio 2026');
      const curDate = player.lastVariation.date || player.lastUpdatedDate || new Date().toISOString().split('T')[0];
      const temporal = calculateTemporalSpan(prevDate, curDate, player.lastVariation.caDiff);
      return {
        ...player.lastVariation,
        previousDate: prevDate,
        currentDate: curDate,
        daysElapsed: temporal.daysElapsed,
        monthsElapsed: temporal.monthsElapsed,
        timeSpanLabel: temporal.timeSpanLabel,
        caPacePerMonth: temporal.caPacePerMonth,
        paceAssessment: temporal.paceAssessment,
        paceLabel: temporal.paceLabel,
      };
    }
    return player.lastVariation;
  }

  if (!player.attributeHistory || player.attributeHistory.length === 0) {
    return null;
  }

  const lastSnapshot = player.attributeHistory[player.attributeHistory.length - 1];
  const oldCa = lastSnapshot.ca;
  const newCa = player.ca;
  const caDiff = (newCa !== undefined && oldCa !== undefined) ? newCa - oldCa : 0;

  const oldPa = lastSnapshot.pa;
  const newPa = player.pa;
  const paDiff = (newPa !== undefined && oldPa !== undefined) ? newPa - oldPa : 0;

  const techDiff = diffAttributeRecords('Tecnico', lastSnapshot.technicalAttributes, player.technicalAttributes);
  const mentDiff = diffAttributeRecords('Mentale', lastSnapshot.mentalAttributes, player.mentalAttributes);
  const physDiff = diffAttributeRecords('Fisico', lastSnapshot.physicalAttributes, player.physicalAttributes);
  const gkDiff = diffAttributeRecords('Portiere', lastSnapshot.goalkeepingAttributes, player.goalkeepingAttributes);

  const improved = [...techDiff.improved, ...mentDiff.improved, ...physDiff.improved, ...gkDiff.improved];
  const declined = [...techDiff.declined, ...mentDiff.declined, ...physDiff.declined, ...gkDiff.declined];

  let status: 'improved' | 'declined' | 'stable' = 'stable';
  if (caDiff > 0 || (caDiff === 0 && improved.length > declined.length && improved.length > 0)) {
    status = 'improved';
  } else if (caDiff < 0 || (caDiff === 0 && declined.length > improved.length && declined.length > 0)) {
    status = 'declined';
  }

  const previousDate = lastSnapshot.date;
  const effectiveDate = player.lastUpdatedDate || new Date().toISOString().split('T')[0];
  const temporal = calculateTemporalSpan(previousDate, effectiveDate, caDiff);

  return {
    status,
    caDiff,
    paDiff,
    improvedCount: improved.length,
    declinedCount: declined.length,
    improvedAttrs: improved.map((i) => ({
      name: i.attribute,
      category: i.category,
      oldVal: i.oldVal,
      newVal: i.newVal,
      diff: i.diff,
    })),
    declinedAttrs: declined.map((d) => ({
      name: d.attribute,
      category: d.category,
      oldVal: d.oldVal,
      newVal: d.newVal,
      diff: d.diff,
    })),
    timestamp: player.lastUpdatedTimestamp || lastSnapshot.timestamp || Date.now(),
    date: effectiveDate,
    previousDate,
    currentDate: effectiveDate,
    daysElapsed: temporal.daysElapsed,
    monthsElapsed: temporal.monthsElapsed,
    timeSpanLabel: temporal.timeSpanLabel,
    caPacePerMonth: temporal.caPacePerMonth,
    paceAssessment: temporal.paceAssessment,
    paceLabel: temporal.paceLabel,
  };
}

/**
 * Formatta in italiano la data e ora del timestamp
 */
export function formatVariationDate(timestamp?: number, dateStr?: string): string {
  if (!timestamp && !dateStr) return 'Rilevazione recente';
  if (timestamp) {
    const d = new Date(timestamp);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${day}/${month}/${year} ore ${hours}:${minutes}`;
    }
  }
  return dateStr || 'Ultimo CSV';
}

/**
 * Genera il testo esplicativo dettagliato del tooltip per il badge di variazione,
 * evidenziando le date di confronto, la durata e la velocità mensile.
 */
export function formatVariationTooltip(variation: PlayerVariationInfo, playerName: string): string {
  const isUp = variation.status === 'improved' || variation.caDiff > 0 || variation.improvedCount > variation.declinedCount;
  const isDown = !isUp && (variation.status === 'declined' || variation.caDiff < 0 || variation.declinedCount > variation.improvedCount);
  const header = isUp
    ? `📈 Variazione Positiva (Crescita) • ${playerName}`
    : isDown
    ? `📉 Variazione Negativa (Calo) • ${playerName}`
    : `➡️ Livello Stabile (0) • ${playerName}`;

  const formattedDate = formatVariationDate(variation.timestamp, variation.date);
  const lines: string[] = [
    header,
    `⏱️ Aggiornato da CSV: ${formattedDate}`,
  ];

  if (variation.previousDate && variation.date) {
    lines.push(`📅 Periodo Confronto: dal ${variation.previousDate} al ${variation.date}`);
  }

  if (variation.timeSpanLabel) {
    lines.push(`⏳ Intervallo: ${variation.timeSpanLabel}`);
  }

  if (variation.paceLabel) {
    lines.push(`⚡ Velocità Sviluppo: ${variation.paceLabel}`);
  }

  lines.push('----------------------------------------');

  if (!isUp && !isDown) {
    lines.push('• Variazione CA/Attributi: 0 (Valori stabili, nessun incremento né calo)');
  }

  if (variation.caDiff !== 0) {
    const sign = variation.caDiff > 0 ? `+${variation.caDiff}` : `${variation.caDiff}`;
    const paceDetail = variation.caPacePerMonth
      ? ` (${sign} in ${variation.monthsElapsed || 0} mesi, ${variation.caPacePerMonth > 0 ? '+' : ''}${variation.caPacePerMonth} CA/mese)`
      : '';
    lines.push(`• Abilità Attuale (CA): ${sign}${paceDetail}`);
  }

  if (variation.paDiff !== 0) {
    const sign = variation.paDiff > 0 ? `+${variation.paDiff}` : `${variation.paDiff}`;
    lines.push(`• Potenziale (PA): ${sign}`);
  }

  if (variation.improvedAttrs.length > 0) {
    const topImpr = variation.improvedAttrs.slice(0, 6).map((a) => `${a.name} (+${a.diff})`).join(', ');
    const more = variation.improvedAttrs.length > 6 ? ` e altri ${variation.improvedAttrs.length - 6}` : '';
    lines.push(`• Attributi Cresciuti (${variation.improvedAttrs.length}): ${topImpr}${more}`);
  }

  if (variation.declinedAttrs.length > 0) {
    const topDecl = variation.declinedAttrs.slice(0, 6).map((a) => `${a.name} (${a.diff})`).join(', ');
    const more = variation.declinedAttrs.length > 6 ? ` e altri ${variation.declinedAttrs.length - 6}` : '';
    lines.push(`• Attributi Calati (${variation.declinedAttrs.length}): ${topDecl}${more}`);
  }

  return lines.join('\n');
}

