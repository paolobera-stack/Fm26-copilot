/**
 * dataTruncator.ts
 *
 * Utility per il pre-processing e il troncamento mirato degli oggetti JSON di Squad e Tactic
 * prima dell'invio all'API Google Gemini (Smart Slicing Architecture).
 *
 * Filtra gli attributi non essenziali e i metadati pesanti in base all'intento specifico
 * del prompt dell'utente (es. se la domanda riguarda la tattica, invia solo i ruoli tattici
 * e la disposizione; se riguarda lo scouting, mantiene gli attributi scout ma elimina
 * lo storico completo delle partite; se riguarda un singolo calciatore, compatta il resto della rosa).
 */

import {
  Player,
  TacticPreset,
  TacticalPosition,
  YouthSquad,
  ScoutingTarget,
  Fixture,
  GamePlanState,
  TacticalNote,
  StandingsRow,
} from '../types';
import {
  extractTemporalRangeFilter,
  filterFixturesByTemporalRange,
  TemporalFixturesFilter,
} from './temporalFixturesFilter';
import {
  parseStatsFromPlayerNote,
  enrichPlayerWithLoanStats,
  getAllLoanedPlayersEnriched,
  extractPlayerStats,
  isPlayerOnLoan
} from './loanStatsParser';

export type PromptIntentCategory =
  | 'tactics'
  | 'scouting'
  | 'growth'
  | 'player_specific'
  | 'youth'
  | 'fixtures_calendar'
  | 'gameplan'
  | 'loans'
  | 'notes'
  | 'general';

export interface TruncateIntent {
  category: PromptIntentCategory;
  isTactics: boolean;
  isScouting: boolean;
  isGrowth: boolean;
  isPlayerSpecific: boolean;
  isYouth: boolean;
  isFixtures: boolean;
  isGamePlan: boolean;
  isLoans: boolean;
  isNotes: boolean;
  matchedPlayerNames: string[];
  matchedPlayerIds: string[];
  matchedTargetNames: string[];
  matchedYouthSquadNames: string[];
  queriedRoles: string[];
  summary: string;
  temporalFilter?: TemporalFixturesFilter | null;
}

export interface TruncateOptions {
  prompt: string;
  recentMessages?: { role: string; content: string }[];
  squadContext?: any;
  players?: Player[];
  tactic?: TacticPreset | any;
  youthSquads?: YouthSquad[];
  targets?: ScoutingTarget[];
  fixtures?: Fixture[];
  gamePlan?: GamePlanState;
  tacticalNotes?: TacticalNote[];
  standings?: StandingsRow[];
  currentDate?: string;
  teamName?: string;
}

export interface TruncatedResult {
  truncatedContext: any;
  intent: TruncateIntent;
  stats: {
    originalChars: number;
    truncatedChars: number;
    reductionPercent: number;
    retainedPlayerCount: number;
    focusedPlayerCount: number;
  };
}

/**
 * Normalizza il testo rimuovendo accenti e convertendo a minuscolo per confronti robusti
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Determina se un giocatore è specificamente menzionato nel prompt
 */
export function isPlayerMentionedInPrompt(player: { name: string; id?: string }, promptText: string): boolean {
  if (!player?.name || !promptText) return false;
  const normPrompt = normalizeText(promptText);
  const normName = normalizeText(player.name);

  if (normPrompt.includes(normName)) return true;

  const parts = normName.split(/\s+/).filter(part => part.length >= 3);
  for (const part of parts) {
    if (['san', 'del', 'dos', 'van', 'de', 'di', 'da'].includes(part)) continue;
    const regex = new RegExp(`\\b${part}\\b`, 'i');
    if (regex.test(normPrompt)) return true;
  }
  return false;
}

/**
 * Rileva l'intento prevalente del prompt dell'utente e della conversazione recente
 */
export function detectPromptIntent(
  prompt: string,
  recentMessages: { role: string; content: string }[] = [],
  availablePlayers: Player[] = [],
  scoutingTargets: ScoutingTarget[] = [],
  youthSquads: YouthSquad[] = [],
  currentDate?: string
): TruncateIntent {
  const conversationText = [
    prompt,
    ...recentMessages.slice(-2).map(m => m.content || '')
  ].join(' ');

  const text = normalizeText(conversationText);
  const promptOnly = normalizeText(prompt);

  // 1. Individua calciatori prima squadra citati
  const matchedPlayerNames: string[] = [];
  const matchedPlayerIds: string[] = [];
  for (const p of availablePlayers) {
    if (isPlayerMentionedInPrompt(p, conversationText)) {
      if (!matchedPlayerIds.includes(p.id)) {
        matchedPlayerIds.push(p.id);
        matchedPlayerNames.push(p.name);
      }
    }
  }

  // 2. Individua target scouting citati
  const matchedTargetNames: string[] = [];
  for (const t of scoutingTargets) {
    if (isPlayerMentionedInPrompt(t, conversationText)) {
      if (!matchedTargetNames.includes(t.name)) {
        matchedTargetNames.push(t.name);
      }
    }
  }

  // 3. Individua squadre e giocatori giovanili citati
  const matchedYouthSquadNames: string[] = [];
  for (const ys of youthSquads) {
    const ysNameNorm = normalizeText(ys.name);
    if (text.includes(ysNameNorm) || (ys.category && text.includes(normalizeText(ys.category)))) {
      if (!matchedYouthSquadNames.includes(ys.name)) {
        matchedYouthSquadNames.push(ys.name);
      }
    }
    for (const yp of ys.players || []) {
      if (isPlayerMentionedInPrompt(yp, conversationText)) {
        if (!matchedPlayerNames.includes(yp.name)) {
          matchedPlayerNames.push(yp.name);
        }
      }
    }
  }

  // 4. Rilevamento posizioni e ruoli tattici
  const queriedRoles: string[] = [];
  if (/\b(portier|portieri|gk|estremo difensore|clean sheet|tra i pali)\b/i.test(text)) queriedRoles.push('Portiere');
  if (/\b(difensor|difensori|centrale|centrali|dc|cb|marcatore|braccetto)\b/i.test(text)) queriedRoles.push('Difensore Centrale');
  if (/\b(terzin|terzini|laterale|laterali|dr|dl|wbr|wbl|fascia|terzino destro|terzino sinistro)\b/i.test(text)) queriedRoles.push('Terzino / Esterno Basso');
  if (/\b(centrocampist|centrocampo|median|mediani|mezzala|mezzali|regista|registi|mc|cm|dm|volante)\b/i.test(text)) queriedRoles.push('Centrocampista / Regista');
  if (/\b(ala|ali|estern|esterni|amr|aml|ala destra|ala sinistra|fantasista)\b/i.test(text)) queriedRoles.push('Ala / Trequartista');
  if (/\b(attaccant|attaccanti|punt|punte|centravanti|st|bomber|striker|finalizzatore)\b/i.test(text)) queriedRoles.push('Attaccante / Centravanti');

  // 5. Pattern per domini specifici e filtro temporale intelligente
  const temporalFilter = extractTemporalRangeFilter(conversationText, currentDate);

  const isTactics = /\b(tattic|formazion|modulo|undici|titolari|panchina|rotazion|pressing|mentalit|linea difensiva|ampiezza|ritmo|istruzioni|stile|4-3-3|4-2-3-1|3-5-2|3-4-2-1|4-4-2|5-3-2|contropiede|possesso|ruoli|ruolo|compito|duties)\b/i.test(text);
  const isScouting = matchedTargetNames.length > 0 || /\b(scout|scouting|mercat|calciomercato|acquist|ceder|cessio|comprar|trattativ|budget|target|obiettivo|clausol|svincolat|upgrade|prezzo|ingaggio|clausola)\b/i.test(text);
  const isGrowth = /\b(crescit|svilupp|variazi|variazioni|migliorat|calat|peggiorat|progression|increment|delta|allenament|ca diff|progresso)\b/i.test(text);
  const isYouth = matchedYouthSquadNames.length > 0 || /\b(giovanil|giovani|vivaio|under 20|under 18|u20|u18|under 21|u21|wonderkid|prospect|talent|promozion|promuov|aggreg|settore giovanile)\b/i.test(text);
  const isFixtures = Boolean(temporalFilter?.hasTemporalFilter) ||
    /\b(calendari|partit|partite|gara|gare|prossim|sfida|risultat|marcat|gol|classific|campionat|copp|champions|rendiment|andamento|score|tabellino|match)\b/i.test(text);
  const isGamePlan = /\b(piano gara|gameplan|game plan|avversari|opponen|contromisur|prossima partita|match plan|studio avversario)\b/i.test(text);
  const isLoans = /\b(prestit|prestiti|in prestito|loan|club di prestito|andamento prestit|rientro prestito|prestito secco|prestito con diritto|statistiche dei prestiti)\b/i.test(text);
  const isNotes = /\b(not|note|appunt|promemori|ricord|concordat|strategia salvat|memoria|note& memory|note & memory|modello)\b/i.test(text);
  const isPlayerSpecific = matchedPlayerNames.length > 0 || /\b(scheda di|profilo di|attributi di|statistiche di|confronto tra|chi schiero tra|meglio .* o)\b/i.test(promptOnly);

  // Determina la categoria primaria
  let category: PromptIntentCategory = 'general';
  if (isGamePlan) category = 'gameplan';
  else if (isTactics && !isScouting) category = 'tactics';
  else if (isScouting) category = 'scouting';
  else if (isGrowth) category = 'growth';
  else if (isLoans) category = 'loans';
  else if (isNotes) category = 'notes';
  else if (isYouth) category = 'youth';
  else if (isFixtures) category = 'fixtures_calendar';
  else if (isPlayerSpecific) category = 'player_specific';

  const summary = [
    isTactics ? 'Tattica' : null,
    isScouting ? 'Scouting' : null,
    isPlayerSpecific ? `Giocatori (${matchedPlayerNames.slice(0, 2).join(', ')})` : null,
    isYouth ? 'Vivai' : null,
    temporalFilter?.label ? `Calendario (${temporalFilter.label})` : (isFixtures ? 'Calendario' : null),
    isGrowth ? 'Crescita' : null,
    isLoans ? 'Prestiti' : null,
    isNotes ? 'Note & Memoria' : null,
  ].filter(Boolean).join(' + ') || 'Generale';

  return {
    category,
    isTactics,
    isScouting,
    isGrowth,
    isPlayerSpecific,
    isYouth,
    isFixtures,
    isGamePlan,
    isLoans,
    isNotes,
    matchedPlayerNames,
    matchedPlayerIds,
    matchedTargetNames,
    matchedYouthSquadNames,
    queriedRoles,
    summary,
    temporalFilter,
  };
}

/**
 * Troncamento dei dati tattici:
 * - Se la domanda è sulla tattica: invia formazione completa, compiti, ruoli, istruzioni e titolari.
 * - Se la domanda NON è sulla tattica (es. scouting o mercato): invia solo riassunto compatto
 *   (modulo, stile, mentalità) per azzerare il carico di token non pertinenti.
 */
export function truncateTacticData(
  tactic: TacticPreset | any,
  intent: TruncateIntent,
  players: Player[] = []
): Record<string, any> | undefined {
  if (!tactic || typeof tactic !== 'object') return undefined;

  const isTacticsRelevant = intent.isTactics || intent.isGamePlan || intent.category === 'tactics';

  if (!isTacticsRelevant) {
    // Versione ultra compatta per prompt non tattici
    return {
      name: tactic.name,
      formation: tactic.formation,
      mentality: tactic.mentality,
      tacticalStyle: tactic.tacticalStyle || tactic.style,
      startingXI: Array.isArray(tactic.positions)
        ? tactic.positions
            .map((pos: TacticalPosition) => {
              const assigned = players.find(p => p.id === pos.playerId);
              return assigned ? `${pos.label}: ${assigned.name} (${pos.role} - ${pos.duty})` : null;
            })
            .filter(Boolean)
        : undefined,
    };
  }

  // Versione dettagliata per domande tattiche
  return {
    name: tactic.name,
    formation: tactic.formation,
    mentality: tactic.mentality,
    tacticalStyle: tactic.tacticalStyle || tactic.style,
    tempo: tactic.tempo,
    passingStyle: tactic.passingStyle,
    width: tactic.width,
    defensiveLine: tactic.defensiveLine,
    pressingTrigger: tactic.pressingTrigger,
    positions: Array.isArray(tactic.positions)
      ? tactic.positions.map((p: TacticalPosition) => {
          const assigned = players.find(pl => pl.id === p.playerId);
          return {
            label: p.label,
            role: p.role,
            duty: p.duty,
            assignedPlayerName: assigned ? assigned.name : 'Non assegnato',
            assignedPlayerId: p.playerId,
            assignedPlayerPositions: assigned?.position,
            assignedPlayerBestRoles: assigned?.bestRoles,
          };
        })
      : [],
    inPossession: tactic.inPossessionInstructions,
    outOfPossession: tactic.outOfPossessionInstructions,
    inTransition: tactic.inTransitionInstructions,
  };
}

/**
 * Filtra gli attributi non essenziali di un singolo calciatore in base all'intento.
 *
 * - Domanda Tattica: conserva ruolo, compiti, posizione, bestRoles, forma, morale, infortuni.
 *   Elimina tutti i 40+ attributi individuali (passaggi, visione, marcatura...) a meno che il giocatore non sia citato direttamente.
 * - Domanda Scouting/Mercato: conserva attributi, valore, contratto, età, CA/PA, prospect tag.
 *   Elimina storico completo delle partite, note tattiche irrilevanti e minuzie di squadra.
 * - Domanda Crescita: conserva CA/PA, delta attributi migliorati/peggiorati, velocità di crescita.
 * - Giocatore Specifico: se il giocatore è citato nel prompt, mantiene gli attributi completi.
 *   Per tutti gli altri giocatori della rosa, applica un compattamento aggressivo.
 */
/**
 * Rimuove ricorsivamente o puntualmente qualsiasi cronologia partite o registro match
 * (matchHistory, recentMatches, matchLogs, fixtureHistory, attributeHistory) da un oggetto.
 */
export function stripMatchHistory<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;
  const clone = { ...obj };
  delete (clone as any).matchHistory;
  delete (clone as any).recentMatches;
  delete (clone as any).fixtureLogs;
  delete (clone as any).allMatchLogs;
  delete (clone as any).matchReports;
  delete (clone as any).attributeHistory;
  delete (clone as any).matchRatings;
  return clone;
}

/**
 * Estrae solo i ruoli tattici e i compiti assegnati a un giocatore in una tattica
 */
export function getTacticalPlayerRoles(player: Player | any, tactic?: TacticPreset | any): {
  position: string;
  bestRoles: string[];
  assignedRole?: string;
  assignedDuty?: string;
} {
  const assignedPos = tactic?.positions?.find((p: TacticalPosition) => p.playerId === player.id);
  return {
    position: player.position,
    bestRoles: player.bestRoles || [],
    assignedRole: assignedPos?.role,
    assignedDuty: assignedPos?.duty,
  };
}

/**
 * Filtra gli attributi non essenziali di un giocatore in base all'intento specifico.
 */
export function filterNonEssentialPlayerAttributes(
  player: Player | any,
  intent: TruncateIntent,
  isTargeted = false,
  tactic?: TacticPreset | any
): Record<string, any> {
  return truncatePlayerData(player, intent, isTargeted, tactic);
}

/**
 * Filtra gli attributi non essenziali di un singolo calciatore in base all'intento.
 *
 * - Domanda Tattica: se l'utente chiede della tattica, invia solo i ruoli tattici,
 *   compiti, posizione, bestRoles e stato disponibilità, omettendo tutti i 40+ attributi
 *   individuali per azzerare il carico di token non pertinenti.
 * - Domanda Scouting/Mercato: conserva gli attributi scout (tecnici, mentali, fisici,
 *   valore, ingaggio, CA/PA), ma elimina rigorosamente lo storico partite e i registri match.
 * - Domanda Crescita: conserva CA/PA, delta attributi migliorati/peggiorati, velocità di crescita.
 * - Giocatore Specifico: se il giocatore è citato nel prompt, mantiene gli attributi completi.
 *   Per tutti gli altri giocatori della rosa, applica un compattamento aggressivo.
 */
export function truncatePlayerData(
  player: Player | any,
  intent: TruncateIntent,
  isTargeted = false,
  tactic?: TacticPreset | any
): Record<string, any> {
  if (!player || typeof player !== 'object') return player;

  const ext = extractPlayerStats(player);
  const onLoan = isPlayerOnLoan(player);

  const isNamed = isTargeted ||
    intent.matchedPlayerNames.includes(player.name) ||
    (player.id && intent.matchedPlayerIds.includes(player.id));

  const isLoanRelevant = (intent.isLoans || intent.isNotes) && onLoan;

  // Estrai statistiche di rendimento e tabellini dalle note e dallo stato
  const parsedStats = parseStatsFromPlayerNote(
    player.notes,
    ext.goals,
    ext.assists,
    ext.avgRating,
    ext.appearances,
    ext.minutesPlayed
  );
  const appearances = ext.appearances !== undefined ? ext.appearances : parsedStats.appearances;
  const goals = ext.goals !== undefined ? ext.goals : parsedStats.goals;
  const assists = ext.assists !== undefined ? ext.assists : parsedStats.assists;
  const avgRating = ext.avgRating !== undefined ? ext.avgRating : parsedStats.avgRating;
  const loanClub = player.loanClub || parsedStats.cleanClubMention || (onLoan ? "Club esterno non specificato" : undefined);
  const loanPerformanceStats = player.loanPerformanceStats || (onLoan ? {
    appearances: appearances ?? 0,
    subAppearances: parsedStats.subAppearances || ext.subAppearances || 0,
    goals: goals ?? 0,
    assists: assists ?? 0,
    avgRating: avgRating ?? 6.75,
    minutes: ext.minutesPlayed || parsedStats.minutesPlayed,
    summary: parsedStats.formattedStatsSummary || "In prestito",
    hasQuantitativeStats: true,
    noteText: (player.notes && player.notes.trim()) ? player.notes.trim() : undefined,
  } : (parsedStats.hasQuantitativeStats ? {
    appearances,
    subAppearances: parsedStats.subAppearances || ext.subAppearances || 0,
    goals,
    assists,
    avgRating,
    minutes: ext.minutesPlayed || parsedStats.minutesPlayed,
    summary: parsedStats.formattedStatsSummary,
    hasQuantitativeStats: true,
    noteText: (player.notes && player.notes.trim()) ? player.notes.trim() : undefined,
  } : undefined));

  // 1. SCENARIO A: Domanda incentrata sulle TATTICHE (Modulo, Ruoli, Istruzioni)
  if (intent.isTactics && !isNamed && !isLoanRelevant) {
    const tacticalInfo = getTacticalPlayerRoles(player, tactic);
    return {
      id: player.id,
      name: player.name,
      number: player.number,
      position: tacticalInfo.position,
      bestRoles: tacticalInfo.bestRoles,
      assignedTacticalRole: tacticalInfo.assignedRole,
      tacticalDuty: tacticalInfo.assignedDuty,
      age: player.age,
      ca: player.ca,
      pa: player.pa,
      morale: player.morale,
      matchLoad: player.matchLoad,
      isInjured: player.isInjured ? true : undefined,
      injuryNote: player.injuryNote,
      isOnLoan: onLoan ? true : undefined,
      loanClub,
      appearances: appearances ?? (onLoan ? 0 : undefined),
      goals: goals ?? (onLoan ? 0 : undefined),
      assists: assists ?? (onLoan ? 0 : undefined),
      avgRating: avgRating ?? (onLoan ? 6.75 : undefined),
      loanPerformanceStats,
      notes: player.notes ? player.notes.trim() : undefined,
    };
  }

  // 2. SCENARIO B: Giocatore NON mirato in una richiesta specifica su altri giocatori o su scouting
  if (!isNamed && !isLoanRelevant && (intent.isPlayerSpecific || intent.isScouting) && intent.matchedPlayerNames.length > 0) {
    return {
      id: player.id,
      name: player.name,
      position: player.position,
      age: player.age,
      ca: player.ca,
      pa: player.pa,
      isInjured: player.isInjured ? true : undefined,
      isOnLoan: onLoan ? true : undefined,
      loanClub,
      appearances: appearances ?? (onLoan ? 0 : undefined),
      goals: goals ?? (onLoan ? 0 : undefined),
      assists: assists ?? (onLoan ? 0 : undefined),
      avgRating: avgRating ?? (onLoan ? 6.75 : undefined),
      loanPerformanceStats,
      notes: player.notes ? player.notes.trim() : undefined,
    };
  }

  // Base comune con metadati essenziali puliti (senza matchHistory o snapshot storici)
  const baseData: Record<string, any> = stripMatchHistory({
    id: player.id,
    name: player.name,
    number: player.number,
    position: player.position,
    bestRoles: player.bestRoles,
    age: player.age,
    ca: player.ca,
    pa: player.pa,
    height: player.height,
    value: player.value,
    wage: player.wage,
    nationality: player.nationality,
    isInjured: Boolean(player.isInjured),
    injuryNote: player.injuryNote || undefined,
    isOnLoan: onLoan,
    loanStatus: onLoan ? `IN PRESTITO ATTIVO (${loanClub ? `presso ${loanClub}` : 'club esterno'})` : 'IN ROSA',
    loanClub,
    isPlayerStaff: Boolean(player.isPlayerStaff),
    staffRole: player.staffRole || undefined,
    availableForYouth: Boolean(player.availableForYouth),
    youthMatchMinutes: player.youthMatchMinutes || undefined,
    morale: player.morale,
    matchLoad: player.matchLoad,
    notes: player.notes ? player.notes.trim() : undefined,
    appearances: appearances ?? (onLoan ? 0 : undefined),
    goals: goals ?? (onLoan ? 0 : undefined),
    assists: assists ?? (onLoan ? 0 : undefined),
    avgRating: avgRating ?? (onLoan ? 6.75 : undefined),
    loanPerformanceStats,
  });

  // 3. SCENARIO C: Domanda sullo SVILUPPO / CRESCITA
  if (intent.isGrowth) {
    if (player.lastVariation || player.growthVariation) {
      const g = player.lastVariation || player.growthVariation;
      baseData.growth = {
        status: g.status,
        caDiff: g.caDiff,
        paDiff: g.paDiff,
        paceLabel: g.paceLabel,
        timeSpanLabel: g.timeSpanLabel,
        improvedAttributes: g.improvedAttrs ? g.improvedAttrs.slice(0, 4) : g.improvedAttributes?.slice(0, 4),
        declinedAttributes: g.declinedAttrs ? g.declinedAttrs.slice(0, 4) : g.declinedAttributes?.slice(0, 4),
      };
    }
  }

  // 4. Se il giocatore è nominato direttamente o l'intento richiede gli attributi scout
  if (isNamed || intent.isScouting || (!intent.isTactics && !intent.isFixtures)) {
    if (player.technicalAttributes) baseData.technicalAttributes = player.technicalAttributes;
    if (player.mentalAttributes) baseData.mentalAttributes = player.mentalAttributes;
    if (player.physicalAttributes) baseData.physicalAttributes = player.physicalAttributes;
    if (player.goalkeepingAttributes && (player.position?.includes('GK') || player.position?.includes('POR'))) {
      baseData.goalkeepingAttributes = player.goalkeepingAttributes;
    }
    if (player.positionsDetail) baseData.positionsDetail = player.positionsDetail;
  }

  return baseData;
}

/**
 * Troncamento dei target di Scouting:
 * Mantiene le schede complete dei target solo se la query riguarda lo scouting
 * o se un target specifico è nominato. Negli altri casi, compatta la lista in un riepilogo numerico.
 */
export function truncateScoutingTargets(
  targets: ScoutingTarget[] = [],
  intent: TruncateIntent
): any[] {
  if (!Array.isArray(targets) || targets.length === 0) return [];

  const isScoutingRelevant = intent.isScouting || intent.category === 'scouting' || intent.matchedTargetNames.length > 0;

  if (!isScoutingRelevant) {
    return [
      {
        totalTargetsCount: targets.length,
        summary: `${targets.length} profili salvati nella lista scouting (dati omessi per la richiesta corrente; nomina un target o chiedi di scouting/mercato per caricarli).`,
      }
    ];
  }

  return targets.map(t => {
    const isTargetNamed = intent.matchedTargetNames.includes(t.name);
    const baseTarget: Record<string, any> = stripMatchHistory({
      id: t.id,
      name: t.name,
      age: t.age,
      position: t.position,
      roles: t.roles,
      currentClub: t.currentClub,
      estimatedValue: t.estimatedValue,
      weeklyWage: t.weeklyWage,
      rating: t.rating,
      priority: t.priority,
      ca: t.ca,
      pa: t.pa,
      notes: t.notes,
    });

    // Includi matrici complete degli attributi solo se è un target cercato o in focus
    if (isTargetNamed || intent.matchedTargetNames.length === 0) {
      if (t.technicalAttributes) baseTarget.technicalAttributes = t.technicalAttributes;
      if (t.mentalAttributes) baseTarget.mentalAttributes = t.mentalAttributes;
      if (t.physicalAttributes) baseTarget.physicalAttributes = t.physicalAttributes;
    }

    return baseTarget;
  });
}

/**
 * Troncamento delle Squadre Giovanili:
 * Se la query non riguarda le giovanili, omette gli elenchi giocatore per giocatore
 * e restituisce un compatto riepilogo della cantera.
 */
export function truncateYouthSquads(
  youthSquads: YouthSquad[] = [],
  intent: TruncateIntent
): any[] {
  if (!Array.isArray(youthSquads) || youthSquads.length === 0) return [];

  const isYouthRelevant = intent.isYouth || intent.isLoans || intent.isNotes || intent.category === 'youth' || intent.matchedYouthSquadNames.length > 0;

  if (!isYouthRelevant) {
    return youthSquads.map(ys => ({
      squadId: ys.id,
      squadName: ys.name,
      category: ys.category || 'Giovanile',
      totalPlayers: (ys.players || []).length,
      wonderkidsCount: (ys.players || []).filter(p => (p.pa || 0) >= 170).length || undefined,
      summary: `Rosa di ${(ys.players || []).length} giovani (dettagli individuali omessi per ottimizzare la memoria).`,
    }));
  }

  return youthSquads.map(ys => {
    const isTargetedSquad = intent.matchedYouthSquadNames.includes(ys.name) || intent.matchedYouthSquadNames.length === 0;
    if (!isTargetedSquad) {
      return {
        squadId: ys.id,
        squadName: ys.name,
        category: ys.category,
        totalPlayers: (ys.players || []).length,
      };
    }

    return {
      squadId: ys.id,
      squadName: ys.name,
      category: ys.category,
      totalPlayers: (ys.players || []).length,
      players: (ys.players || []).map(yp => {
        const ext = extractPlayerStats(yp);
        const onLoan = isPlayerOnLoan(yp);
        const parsed = parseStatsFromPlayerNote(
          yp.notes,
          ext.goals,
          ext.assists,
          ext.avgRating,
          ext.appearances,
          ext.minutesPlayed
        );
        const appearances = ext.appearances !== undefined ? ext.appearances : parsed.appearances;
        const goals = ext.goals !== undefined ? ext.goals : parsed.goals;
        const assists = ext.assists !== undefined ? ext.assists : parsed.assists;
        const avgRating = ext.avgRating !== undefined ? ext.avgRating : parsed.avgRating;
        const loanClub = yp.loanClub || parsed.cleanClubMention || (onLoan ? "Club esterno non specificato" : undefined);

        const loanPerformanceStats = yp.loanPerformanceStats || (onLoan ? {
          appearances: appearances ?? 0,
          subAppearances: parsed.subAppearances || ext.subAppearances || 0,
          goals: goals ?? 0,
          assists: assists ?? 0,
          avgRating: avgRating ?? 6.75,
          minutes: ext.minutesPlayed || parsed.minutesPlayed,
          summary: parsed.formattedStatsSummary || "In prestito",
          hasQuantitativeStats: true,
          noteText: (yp.notes && yp.notes.trim()) ? yp.notes.trim() : undefined,
        } : (parsed.hasQuantitativeStats ? {
          appearances,
          subAppearances: parsed.subAppearances || ext.subAppearances || 0,
          goals,
          assists,
          avgRating,
          minutes: ext.minutesPlayed || parsed.minutesPlayed,
          summary: parsed.formattedStatsSummary,
          hasQuantitativeStats: true,
          noteText: (yp.notes && yp.notes.trim()) ? yp.notes.trim() : undefined,
        } : undefined));

        return stripMatchHistory({
          id: yp.id,
          name: yp.name,
          position: yp.position,
          age: yp.age,
          ca: yp.ca,
          pa: yp.pa,
          prospectTag: (yp.pa || 0) >= 170 ? 'Wonderkid' : (yp.pa || 0) >= 150 ? 'Top Prospect' : undefined,
          isOnLoan: onLoan,
          loanClub,
          loanStatus: onLoan ? `IN PRESTITO ATTIVO (${loanClub ? `presso ${loanClub}` : 'club esterno'})` : undefined,
          notes: (yp.notes && yp.notes.trim()) ? yp.notes.trim() : undefined,
          appearances: appearances ?? (onLoan ? 0 : undefined),
          goals: goals ?? (onLoan ? 0 : undefined),
          assists: assists ?? (onLoan ? 0 : undefined),
          avgRating: avgRating ?? (onLoan ? 6.75 : undefined),
          loanPerformanceStats,
        });
      }),
    };
  });
}

/**
 * Troncamento del Calendario e Risultati:
 * Se la query non riguarda il calendario o il prossimo avversario, conserva
 * solo l'ultima partita giocata e il prossimo impegno imminente.
 */
export function truncateFixturesData(
  fixtures: Fixture[] = [],
  intent: TruncateIntent,
  prompt?: string,
  currentDate?: string
): any[] {
  if (!Array.isArray(fixtures) || fixtures.length === 0) return [];

  const temporalFilter = intent.temporalFilter || extractTemporalRangeFilter(prompt || '', currentDate);
  if (temporalFilter?.hasTemporalFilter) {
    return filterFixturesByTemporalRange(fixtures, temporalFilter, currentDate);
  }

  const isFixturesRelevant = intent.isFixtures || intent.isGamePlan || intent.category === 'fixtures_calendar';

  if (!isFixturesRelevant) {
    // Conserva al massimo 1 risultato recente e 1 prossimo impegno
    const played = fixtures.filter(f => f.status === 'Giocata' || Boolean(f.score) || Boolean((f as any).played));
    const upcoming = fixtures.filter(f => f.status !== 'Giocata' && !f.score && !(f as any).played);

    const concise: any[] = [];
    if (played.length > 0) {
      const last = played[played.length - 1];
      concise.push({
        status: 'Ultimo match giocato',
        opponent: last.opponent,
        score: last.score || (last as any).result,
        outcome: last.outcome,
        date: last.date
      });
    }
    if (upcoming.length > 0) {
      const next = upcoming[0];
      concise.push({ status: 'Prossimo match', opponent: next.opponent, date: next.date, venue: next.venue });
    }
    return concise;
  }

  // Se rilevante ma senza range temporale esplicito, usa il motore temporale smart (5 giocate + 4 prossime)
  return filterFixturesByTemporalRange(fixtures, null, currentDate);
}

/**
 * Funzione Principale: Troncamento Intelligente di Squadra e Tattica (dataTruncator)
 *
 * Prende in ingresso il contesto o le singole collezioni e il prompt utente,
 * esegue il rilevamento dell'intento e produce il payload JSON compresso
 * ottimizzato per l'architettura Smart Slicing.
 */
export function truncateSquadAndTactic({
  prompt,
  recentMessages = [],
  squadContext,
  players = [],
  tactic,
  youthSquads = [],
  targets = [],
  fixtures = [],
  gamePlan,
  tacticalNotes = [],
  standings = [],
  currentDate,
  teamName,
}: TruncateOptions): TruncatedResult {
  // Se squadContext completo è già stato passato, estrai gli elementi
  const effectivePlayers = (players && players.length > 0)
    ? players
    : (squadContext?.allPlayers || []);

  const effectiveTactic = tactic || squadContext?.tactic;
  const effectiveYouth = (youthSquads && youthSquads.length > 0)
    ? youthSquads
    : (squadContext?.youthSquads || []);
  const effectiveTargets = (targets && targets.length > 0)
    ? targets
    : (squadContext?.scoutingTargets || []);
  const effectiveFixtures = (fixtures && fixtures.length > 0)
    ? fixtures
    : (squadContext?.allFixtures || []);
  const effectiveGamePlan = gamePlan || squadContext?.gamePlan;
  const effectiveTeamName = teamName || squadContext?.teamName || 'Squadra FC';
  const effectiveDate = currentDate || squadContext?.currentDate || 'Oggi';

  // Calcola dimensione originale
  const originalPayloadToMeasure = squadContext || {
    teamName: effectiveTeamName,
    currentDate: effectiveDate,
    tactic: effectiveTactic,
    allPlayers: effectivePlayers,
    youthSquads: effectiveYouth,
    scoutingTargets: effectiveTargets,
    allFixtures: effectiveFixtures,
    gamePlan: effectiveGamePlan,
  };
  const originalChars = JSON.stringify(originalPayloadToMeasure).length;

  // 1. Rileva l'intento dell'utente
  const intent = detectPromptIntent(
    prompt,
    recentMessages,
    effectivePlayers,
    effectiveTargets,
    effectiveYouth,
    effectiveDate
  );

  // 2. Tronca Tattica
  const truncatedTactic = truncateTacticData(effectiveTactic, intent, effectivePlayers);

  // 3. Tronca Calciatori Prima Squadra con riferimento tattico
  const truncatedPlayers = effectivePlayers.map(p =>
    truncatePlayerData(p, intent, intent.matchedPlayerIds.includes(p.id), effectiveTactic)
  );

  // 4. Tronca Scouting
  const truncatedScouting = truncateScoutingTargets(effectiveTargets, intent);

  // 5. Tronca Giovanili
  const truncatedYouth = truncateYouthSquads(effectiveYouth, intent);

  // 6. Tronca Calendario con filtro temporale intelligente
  const truncatedFixtures = truncateFixturesData(effectiveFixtures, intent, prompt, effectiveDate);

  // 7. Assembla il contesto troncato
  const truncatedContext: Record<string, any> = {
    teamName: effectiveTeamName,
    currentDate: effectiveDate,
    intentCategory: intent.category,
    activeFocus: intent.summary,
  };

  if (intent.temporalFilter?.label) {
    truncatedContext.activeTemporalFilter = intent.temporalFilter.label;
  }

  if (truncatedTactic) truncatedContext.tactic = truncatedTactic;
  if (truncatedPlayers.length > 0) truncatedContext.allPlayers = truncatedPlayers;
  if (truncatedScouting.length > 0) truncatedContext.scoutingTargets = truncatedScouting;
  if (truncatedYouth.length > 0) truncatedContext.youthSquads = truncatedYouth;
  if (truncatedFixtures.length > 0) truncatedContext.allFixtures = truncatedFixtures;

  // Preserva il riepilogo calendario e le note se presenti in squadContext
  if (squadContext?.calendarPerformanceSummary && (intent.isFixtures || intent.isGamePlan)) {
    truncatedContext.calendarPerformanceSummary = squadContext.calendarPerformanceSummary;
  }
  if (squadContext?.calendarMatchNotes && (intent.isFixtures || intent.isGamePlan)) {
    truncatedContext.calendarMatchNotes = squadContext.calendarMatchNotes;
  }
  if (squadContext?.immediateMatchContext) {
    truncatedContext.immediateMatchContext = squadContext.immediateMatchContext;
  }
  if (squadContext?.competitionsAndStandings && (intent.isFixtures || !intent.isPlayerSpecific)) {
    truncatedContext.competitionsAndStandings = squadContext.competitionsAndStandings;
  }

  // Preserva giocatori ufficialmente in prestito e sintesi prestiti completi
  const loansList = squadContext?.playersCurrentlyOnLoan || getAllLoanedPlayersEnriched(effectivePlayers, effectiveYouth);
  truncatedContext.playersCurrentlyOnLoan = loansList;

  truncatedContext.officialLoanSummary = squadContext?.officialLoanSummary || {
    totalPlayersCurrentlyOnLoan: loansList.length,
    activeLoanPlayerNames: loansList.map((p: any) => p.name),
    playersWithRecordedLoanStats: loansList.map((p: any) =>
      `${p.name} (${p.loanClub || 'Club esterno'} - ${p.position}): ${p.loanPerformanceStats?.summary || p.notes || 'In prestito'}`
    ),
    allLoanProfilesTable: loansList.map((p: any) => ({
      name: p.name,
      squad: p.squad,
      position: p.position,
      age: p.age,
      ca: p.ca,
      pa: p.pa,
      club: p.loanClub,
      appearances: p.appearances,
      goals: p.goals,
      assists: p.assists,
      avgRating: p.avgRating,
      summary: p.loanPerformanceStats?.summary,
      notes: p.notes,
    })),
    officialSystemNotice: "ATTENZIONE COPILOT: I dati quantitativi e qualitativi dei giocatori in prestito provengono direttamente dai campi e dalle note registrate dal Manager (sintetizzati in loanPerformanceStats e nei campi numerici goals/assists/avgRating/appearances). Leggi TUTTI i profili senza escluderne alcuno e applica il modello a tutti i calciatori in prestito (inclusi Zedníček, Turull, Behiratche, Kern, Vera, Nisi, Piñón e ogni altro elemento).",
  };

  truncatedContext.playersWithNotes = squadContext?.playersWithNotes || [
    ...effectivePlayers
      .filter(p => p.notes && p.notes.trim())
      .map(p => ({ ...enrichPlayerWithLoanStats(p), squad: 'Prima Squadra' })),
    ...effectiveYouth.flatMap(ys =>
      (ys.players || [])
        .filter((p: any) => p.notes && p.notes.trim())
        .map((p: any) => ({ ...enrichPlayerWithLoanStats(p), squad: ys.name }))
    ),
  ];

  truncatedContext.playersWithNotesAndLoans = squadContext?.playersWithNotesAndLoans || [
    ...effectivePlayers
      .filter(p => Boolean(p.notes && p.notes.trim()) || Boolean(p.isOnLoan) || Boolean(p.loanClub && p.loanClub.trim()))
      .map(p => ({ ...enrichPlayerWithLoanStats(p), squad: 'Prima Squadra' })),
    ...effectiveYouth.flatMap(ys =>
      (ys.players || [])
        .filter((p: any) => Boolean(p.notes && p.notes.trim()) || Boolean(p.isOnLoan) || Boolean(p.loanClub && p.loanClub.trim()))
        .map((p: any) => ({ ...enrichPlayerWithLoanStats(p), squad: ys.name }))
    ),
  ];

  // Includi Game Plan solo se c'è focus avversario o partita
  if (effectiveGamePlan && (intent.isGamePlan || intent.isFixtures)) {
    truncatedContext.gamePlan = {
      opponent: effectiveGamePlan.opponent,
      analysis: effectiveGamePlan.notes || effectiveGamePlan.strengthsWeaknesses,
    };
  }

  // Includi Note Tattiche (Note & Memory) in versione integrale se attinenti
  const isNotesRelevant = intent.isNotes || intent.isTactics || intent.isLoans || intent.category === 'tactics' || intent.category === 'notes';
  if (tacticalNotes && tacticalNotes.length > 0 && isNotesRelevant) {
    truncatedContext.tacticalNotes = tacticalNotes.map(n => ({
      title: n.title,
      category: n.category,
      content: n.content,
      operationalDate: n.operationalDate || undefined,
    }));
  }

  const truncatedChars = JSON.stringify(truncatedContext).length;
  const reductionPercent = originalChars > 0
    ? Math.max(0, Math.round(((originalChars - truncatedChars) / originalChars) * 100))
    : 0;

  return {
    truncatedContext,
    intent,
    stats: {
      originalChars,
      truncatedChars,
      reductionPercent,
      retainedPlayerCount: truncatedPlayers.length,
      focusedPlayerCount: intent.matchedPlayerNames.length,
    },
  };
}
