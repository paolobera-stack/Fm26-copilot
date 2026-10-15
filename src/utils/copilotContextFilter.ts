import {
  Player,
  YouthSquad,
  ScoutingTarget,
  Fixture,
  GamePlanState,
  TacticalNote,
  StandingsRow,
  TacticPreset,
  SeasonPhaseInfo
} from '../types';
import { PayloadConfig } from '../components/MemoryDiagnosticsModal';
import { getEffectiveAge } from './csvParser';
import { getPlayerLastVariation, formatVariationDate } from './attributeDiffUtils';
import { isCopilotNote } from './copilotNoteProposals';
import { getFixtureResult, getCalendarPerformancePayload } from './calendarExportUtils';
import {
  parseFixtureDate,
  getContextualFixtures
} from './dateUtils';
import {
  TemporalFixturesFilter,
  extractTemporalRangeFilter,
  filterFixturesByTemporalRange
} from './temporalFixturesFilter';
import {
  parseStatsFromPlayerNote,
  enrichPlayerWithLoanStats,
  getAllLoanedPlayersEnriched,
  extractPlayerStats,
  isPlayerOnLoan
} from './loanStatsParser';

export interface QueryIntentAnalysis {
  contextMode: 'smart' | 'full';
  matchedPlayerNames: string[];
  matchedPlayerIds: string[];
  matchedYouthSquadNames: string[];
  matchedTargetNames: string[];
  // Domain flags
  isPlayerSpecific: boolean;
  isTacticsFocus: boolean;
  isGamePlanFocus: boolean;
  isScoutingFocus: boolean;
  isYouthFocus: boolean;
  isCalendarFocus: boolean;
  isStandingsFocus: boolean;
  isGrowthFocus: boolean;
  isNotesFocus: boolean;
  isLoanFocus: boolean;
  // Summary tags for UI badge
  targetedDomains: string[];
  estimatedReductionPercent: number;
  temporalFilter?: TemporalFixturesFilter | null;
}

function cleanText(str: string): string {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Analizza la domanda dell'utente (e gli ultimi messaggi per continuità di contesto)
 * per determinare quali entità e domini sono direttamente pertinenti all'interazione.
 */
export function detectQueryIntents(
  query: string,
  recentMessages: { role: string; content: string }[],
  players: Player[],
  youthSquads: YouthSquad[],
  targets: ScoutingTarget[],
  fixtures: Fixture[],
  gamePlan?: GamePlanState,
  mode: 'smart' | 'full' = 'smart',
  payloadConfig?: PayloadConfig,
  currentDateStr?: string
): QueryIntentAnalysis {
  if (mode === 'full') {
    return {
      contextMode: 'full',
      matchedPlayerNames: [],
      matchedPlayerIds: [],
      matchedYouthSquadNames: [],
      matchedTargetNames: [],
      isPlayerSpecific: true,
      isTacticsFocus: true,
      isGamePlanFocus: Boolean(payloadConfig?.includeGamePlan),
      isScoutingFocus: true,
      isYouthFocus: true,
      isCalendarFocus: true,
      isStandingsFocus: true,
      isGrowthFocus: true,
      isNotesFocus: true,
      isLoanFocus: true,
      targetedDomains: ['Tutto il Database (Full Memory)'],
      estimatedReductionPercent: 0,
      temporalFilter: null,
    };
  }

  // Combina la domanda attuale con gli ultimi 2 messaggi per catturare pronomi e riferimenti
  const conversationSnippet = [
    query,
    ...recentMessages.slice(-2).map(m => m.content)
  ].join(' ');

  const text = cleanText(conversationSnippet);
  const queryOnly = cleanText(query);

  const matchedPlayerNames: string[] = [];
  const matchedPlayerIds: string[] = [];
  const matchedYouthSquadNames: string[] = [];
  const matchedTargetNames: string[] = [];

  // 1. Ricerca calciatori prima squadra citati
  players.forEach((p) => {
    const fullNameClean = cleanText(p.name);
    const parts = fullNameClean.split(/\s+/).filter(pt => pt.length > 2);
    const matchesFull = text.includes(fullNameClean);
    const matchesPart = parts.some(pt => {
      if (['san', 'del', 'dos', 'van', 'de', 'di', 'da'].includes(pt)) return false;
      if (pt.length <= 4) {
        const regex = new RegExp(`\\b${pt}\\b`, 'i');
        return regex.test(text);
      }
      return text.includes(pt);
    });

    if (matchesFull || matchesPart) {
      if (!matchedPlayerIds.includes(p.id)) {
        matchedPlayerIds.push(p.id);
        matchedPlayerNames.push(p.name);
      }
    }
  });

  // 2. Ricerca calciatori e categorie giovanili citati
  (youthSquads || []).forEach((ys) => {
    const squadNameClean = cleanText(ys.name);
    if (text.includes(squadNameClean) || text.includes(cleanText(ys.category || ''))) {
      if (!matchedYouthSquadNames.includes(ys.name)) {
        matchedYouthSquadNames.push(ys.name);
      }
    }
    (ys.players || []).forEach((yp) => {
      const pClean = cleanText(yp.name);
      const parts = pClean.split(/\s+/).filter(pt => pt.length > 3);
      if (text.includes(pClean) || parts.some(pt => text.includes(pt))) {
        if (!matchedPlayerNames.includes(yp.name)) {
          matchedPlayerNames.push(yp.name);
        }
      }
    });
  });

  // 3. Ricerca target scouting citati
  (targets || []).forEach((t) => {
    const tClean = cleanText(t.name);
    const parts = tClean.split(/\s+/).filter(pt => pt.length > 3);
    if (text.includes(tClean) || parts.some(pt => text.includes(pt))) {
      if (!matchedTargetNames.includes(t.name)) {
        matchedTargetNames.push(t.name);
      }
    }
  });

  // 4. Rilevamento avversario attuale (da gamePlan o prossimo match)
  const opponentName = cleanText(gamePlan?.opponent || '');
  const isOpponentMentioned = opponentName.length > 2 && text.includes(opponentName);

  // 5. Keyword analysis per i singoli domini
  const isPlayerSpecific = matchedPlayerNames.length > 0 ||
    /\b(giocator|calciator|attribut|profilo|scheda|crescita di|statistiche di|rigorist|capitano|panchinaro|titolare)\b/i.test(queryOnly);

  const isTacticsFocus = /\b(tattic|modul|pressing|linea difensiv|mentalit|ruol|ampiezz|ritmo|istruzion|stile|titolari|panchin|undici|xi|schier|rotazion|4-3-3|4-2-3-1|3-5-2|3-4-2-1|4-4-2|5-3-2|duelli|palle inattiv|calci d'angolo|punizioni)\b/i.test(text);

  // Il focus sul Piano Gara si attiva solo se il toggle Big Match è abilitato e c'è richiesta specifica
  const isGamePlanFocus = Boolean(payloadConfig?.includeGamePlan) && (
    isOpponentMentioned ||
    /\b(piano gara|gameplan|game plan|match plan|studio avversario)\b/i.test(text)
  );

  const isScoutingFocus = matchedTargetNames.length > 0 ||
    /\b(scout|mercat|calciomercat|comprar|acquist|ceder|cession|target|osservator|svincolat|trattativ|clausol|prezz|stipendi|budget|innesto|rinforzo|esubero)\b/i.test(text);

  const isYouthFocus = matchedYouthSquadNames.length > 0 ||
    /\b(giovanil|giovani|vivaio|under 21|u21|under 18|u18|under 20|u20|squadra b|primaver|wonderkid|prospect|promuov|promozion|disponibile per le partite delle giovanili|minutaggio giovanili|settore giovanile)\b/i.test(text);

  // Rilevamento intervallo temporale intelligente per calendario / partite
  const temporalFilter = extractTemporalRangeFilter(conversationSnippet, currentDateStr);

  const isCalendarFocus = Boolean(temporalFilter?.hasTemporalFilter) ||
    /\b(calendar|partit|partite|gara|gare|match|incontr|sfid|risultat|score|gol|marcat|andament|vittori|sconfitt|paregg|rendiment|note partit|resocont|post-partit|tabellin|calendario gare|prossimi impegni|ultime gare|ultimi match)\b/i.test(text);

  const isStandingsFocus = /\b(classific|punt|campionat|copp|competizion|zona champions|salvezz|differenza ret|rivali in classifica|primo posto|vetta|corsa al titolo|retrocessione)\b/i.test(text);

  const isGrowthFocus = /\b(crescit|svilupp|migliorat|calat|peggiorat|variazion|attribut|progress|allenament|ca diff|differenza ca|ritmo di crescita|progressione)\b/i.test(text);

  const isNotesFocus = /\b(not|note|appunt|promemori|ricord|concordat|strategia salvat|cosa abbiamo scritto|memoria tattica|note& memory|note & memory|modello|modelli)\b/i.test(text);

  const isLoanFocus = /\b(prestit|prestiti|in prestito|loan|loans|cedut.*in prestito|giocator.*in prestito|calciator.*in prestito|club di prestito|andamento prestit|rientr.*prestit|prestito secco|prestito con diritto|tabellin.*prestit|statistiche dei prestiti|statistiche prestiti)\b/i.test(text);

  // Costruzione riepilogo domini mirati per UI badge
  const targetedDomains: string[] = ['Rosa Base'];

  if (matchedPlayerNames.length > 0) {
    targetedDomains.push(`Dettagli: ${matchedPlayerNames.slice(0, 2).join(', ')}${matchedPlayerNames.length > 2 ? ` (+${matchedPlayerNames.length - 2})` : ''}`);
  }
  if (isTacticsFocus) targetedDomains.push('Tattica & Istruzioni');
  if (isGamePlanFocus) targetedDomains.push(gamePlan?.opponent ? `Piano Gara vs ${gamePlan.opponent}` : 'Piano Gara');
  if (isScoutingFocus) targetedDomains.push('Scouting & Mercato');
  if (isYouthFocus) targetedDomains.push('Vivai & Giovani');
  if (temporalFilter?.label) {
    targetedDomains.push(`Calendario (${temporalFilter.label})`);
  } else if (isCalendarFocus) {
    targetedDomains.push('Calendario & Risultati');
  }
  if (isStandingsFocus) targetedDomains.push('Classifica & Obiettivi');
  if (isGrowthFocus) targetedDomains.push('Sviluppo Attributi');
  if (isNotesFocus) targetedDomains.push('Note Tattiche');
  if (isLoanFocus) targetedDomains.push('Prestiti (Flag Ufficiale)');

  // Stima riduzione percentuale
  let estimatedReduction = 85;
  if (targetedDomains.length >= 5) estimatedReduction = 60;
  else if (targetedDomains.length >= 3) estimatedReduction = 75;

  return {
    contextMode: 'smart',
    matchedPlayerNames,
    matchedPlayerIds,
    matchedYouthSquadNames,
    matchedTargetNames,
    isPlayerSpecific,
    isTacticsFocus,
    isGamePlanFocus,
    isScoutingFocus,
    isYouthFocus,
    isCalendarFocus,
    isStandingsFocus,
    isGrowthFocus,
    isNotesFocus,
    isLoanFocus,
    targetedDomains,
    estimatedReductionPercent: estimatedReduction,
    temporalFilter,
  };
}

export interface BuildTargetedContextParams {
  teamName: string;
  currentDate: string;
  phaseInfo?: SeasonPhaseInfo;
  tactic: TacticPreset;
  players: Player[];
  youthSquads: YouthSquad[];
  targets: ScoutingTarget[];
  fixtures: Fixture[];
  standings: StandingsRow[];
  calendarCompetitions: string[];
  effectiveCompetitionGoals: Record<string, string>;
  userTeamRow?: StandingsRow;
  effectiveGamePlan?: GamePlanState;
  tacticalNotes: TacticalNote[];
  growthStats: any;
  payloadConfig: PayloadConfig;
  intents: QueryIntentAnalysis;
}

/**
 * Costruisce un payload squadContext mirato, che invia solo i dati necessari
 * per l'interazione specifica dell'utente riducendo il carico di lettura del modello.
 */
export function buildTargetedSquadContext({
  teamName,
  currentDate,
  phaseInfo,
  tactic,
  players,
  youthSquads,
  targets,
  fixtures,
  standings,
  calendarCompetitions,
  effectiveCompetitionGoals,
  userTeamRow,
  effectiveGamePlan,
  tacticalNotes,
  growthStats,
  payloadConfig,
  intents,
}: BuildTargetedContextParams) {
  const isFull = intents.contextMode === 'full';

  // 1. Tattica
  const tacticPayload = isFull || intents.isTacticsFocus
    ? {
        name: tactic.name,
        formation: tactic.formation,
        mentality: tactic.mentality,
        pressing: tactic.pressingTrigger,
        defensiveLine: tactic.defensiveLine,
        width: tactic.width,
        tempo: tactic.tempo,
        passingStyle: tactic.passingStyle,
        tacticalStyle: tactic.tacticalStyle,
        positions: tactic.positions.map(p => ({
          label: p.label,
          role: p.role,
          duty: p.duty,
          assignedPlayerName: players.find(pl => pl.id === p.playerId)?.name || 'Non assegnato'
        }))
      }
    : {
        name: tactic.name,
        formation: tactic.formation,
        mentality: tactic.mentality,
        tacticalStyle: tactic.tacticalStyle,
        startingLineup: tactic.positions
          .map(p => {
            const pl = players.find(x => x.id === p.playerId);
            return pl ? `${p.label}: ${pl.name} (${p.role} - ${p.duty})` : null;
          })
          .filter(Boolean),
      };

  // 2. Rosa Prima Squadra (allPlayers)
  // In modalità Smart, i 60 attributi 1-20 vengono inclusi SOLO per i giocatori citati o in focus
  const allPlayersPayload = players.map(p => {
    const effAge = getEffectiveAge(p, currentDate);
    const ext = extractPlayerStats(p);
    const onLoan = isPlayerOnLoan(p);
    const isPlayerTargeted = isFull ||
      intents.matchedPlayerIds.includes(p.id) ||
      intents.matchedPlayerNames.includes(p.name) ||
      (intents.isLoanFocus && onLoan) ||
      (intents.isNotesFocus && Boolean(p.notes));
    const variation = getPlayerLastVariation(p);

    const parsedStats = parseStatsFromPlayerNote(
      p.notes,
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
    const loanClub = p.loanClub || parsedStats.cleanClubMention || (onLoan ? "Club esterno non specificato" : undefined);
    const loanPerformanceStats = p.loanPerformanceStats || (onLoan ? {
      appearances: appearances ?? 0,
      subAppearances: parsedStats.subAppearances || ext.subAppearances || 0,
      goals: goals ?? 0,
      assists: assists ?? 0,
      avgRating: avgRating ?? 6.75,
      minutes: ext.minutesPlayed || parsedStats.minutesPlayed,
      summary: parsedStats.formattedStatsSummary || "In prestito",
      hasQuantitativeStats: true,
      noteText: (p.notes && p.notes.trim()) ? p.notes.trim() : undefined,
    } : (parsedStats.hasQuantitativeStats ? {
      appearances,
      subAppearances: parsedStats.subAppearances || ext.subAppearances || 0,
      goals,
      assists,
      avgRating,
      minutes: ext.minutesPlayed || parsedStats.minutesPlayed,
      summary: parsedStats.formattedStatsSummary,
      hasQuantitativeStats: true,
      noteText: (p.notes && p.notes.trim()) ? p.notes.trim() : undefined,
    } : undefined));

    // In Smart Focus, se la domanda cita 1-3 giocatori specifici e non riguarda la formazione complessiva,
    // comprimiamo gli altri giocatori della rosa ai soli dati anagrafici e statistici essenziali:
    if (!isFull && intents.matchedPlayerNames.length > 0 && !isPlayerTargeted && !intents.isTacticsFocus && !intents.isLoanFocus) {
      return {
        name: p.name,
        number: p.number,
        position: p.position,
        age: effAge,
        ca: p.ca,
        pa: p.pa,
        isInjured: Boolean(p.isInjured) ? true : undefined,
        isOnLoan: onLoan ? true : undefined,
        loanStatus: onLoan ? `IN PRESTITO ATTIVO (${loanClub ? `presso ${loanClub}` : 'club esterno'})` : 'IN ROSA / NON IN PRESTITO',
        loanClub,
        appearances: appearances ?? (onLoan ? 0 : undefined),
        goals: goals ?? (onLoan ? 0 : undefined),
        assists: assists ?? (onLoan ? 0 : undefined),
        avgRating: avgRating ?? (onLoan ? 6.75 : undefined),
        loanPerformanceStats,
        notes: (p.notes && p.notes.trim().length > 0) ? p.notes.trim() : undefined,
      };
    }

    const basePlayerInfo = {
      name: p.name,
      number: p.number,
      position: p.position,
      bestRoles: p.bestRoles,
      age: effAge,
      ca: p.ca,
      pa: p.pa,
      height: p.height,
      value: p.value,
      prospectTag: effAge < 22 ? ((p.pa || 0) >= 170 ? 'Wonderkid' : (p.pa || 0) >= 150 ? 'Top Prospect' : (p.pa || 0) >= 130 ? 'Top Talent' : undefined) : undefined,
      isInjured: Boolean(p.isInjured),
      injuryNote: p.injuryNote || undefined,
      isOnLoan: onLoan,
      loanStatus: onLoan ? `IN PRESTITO ATTIVO (${loanClub ? `presso ${loanClub}` : 'club esterno'})` : 'IN ROSA / NON IN PRESTITO',
      loanClub,
      isPlayerStaff: Boolean(p.isPlayerStaff),
      staffRole: p.staffRole || undefined,
      availableForYouth: Boolean(p.availableForYouth),
      youthSquadDesignation: p.availableForYouth ? (p.youthSquadDesignation || 'Giovanili') : undefined,
      youthMatchMinutes: p.availableForYouth ? (p.youthMatchMinutes ? p.youthMatchMinutes.toLowerCase().replace(' min', 'min') : 'fino a 90min') : undefined,
      youthAvailabilityTag: p.availableForYouth ? `disponibile per le partite delle giovanili (${p.youthMatchMinutes ? p.youthMatchMinutes.toLowerCase().replace(' min', 'min') : 'fino a 90min'})` : undefined,
      matchLoad: p.matchLoad,
      morale: p.morale,
      homegrown: p.homegrown,
      appearances: appearances ?? (onLoan ? 0 : undefined),
      goals: goals ?? (onLoan ? 0 : undefined),
      assists: assists ?? (onLoan ? 0 : undefined),
      avgRating: avgRating ?? (onLoan ? 6.75 : undefined),
      loanPerformanceStats,
      notes: (p.notes && p.notes.trim().length > 0) ? p.notes.trim() : undefined,
      hasCopilotNote: (p.notes && isCopilotNote(p.notes)) ? true : undefined,
    };

    // Includi attributi dettagliati 1-20 solo se il giocatore è direttamente coinvolto
    if (isPlayerTargeted) {
      return {
        ...basePlayerInfo,
        technicalAttributes: p.technicalAttributes,
        mentalAttributes: p.mentalAttributes,
        physicalAttributes: p.physicalAttributes,
        goalkeepingAttributes: p.goalkeepingAttributes,
        personalityAttributes: p.personalityAttributes,
        positionsDetail: p.positionsDetail,
        growthVariation: variation ? {
          status: variation.status,
          caDiff: variation.caDiff,
          paDiff: variation.paDiff,
          improvedCount: variation.improvedCount,
          declinedCount: variation.declinedCount,
          improvedAttributes: (variation.improvedAttrs || []).map(a => `${a.name}: ${a.oldVal} -> ${a.newVal} (+${a.diff})`),
          declinedAttributes: (variation.declinedAttrs || []).map(a => `${a.name}: ${a.oldVal} -> ${a.newVal} (${a.diff})`),
          recordedDate: variation.date || p.lastUpdatedDate || undefined,
          formattedDate: formatVariationDate(variation.timestamp, variation.date),
          caPacePerMonth: variation.caPacePerMonth,
          paceAssessment: variation.paceAssessment,
          paceLabel: variation.paceLabel,
        } : undefined,
      };
    }

    return basePlayerInfo;
  });

  // 3. Giocatori disponibili per partite delle giovanili
  const availableForYouthPayload = players
    .filter(p => Boolean(p.availableForYouth) && !p.isOnLoan)
    .map(p => ({
      name: p.name,
      number: p.number,
      position: p.position,
      age: getEffectiveAge(p, currentDate),
      ca: p.ca,
      pa: p.pa,
      tag: `disponibile per le partite delle giovanili (${p.youthMatchMinutes ? p.youthMatchMinutes.toLowerCase().replace(' min', 'min') : 'fino a 90min'})`,
      youthSquadDesignation: p.youthSquadDesignation || 'Giovanili',
      youthMatchMinutes: p.youthMatchMinutes ? p.youthMatchMinutes.toLowerCase().replace(' min', 'min') : 'fino a 90min',
    }));

  // 4. Vivai e Giovanili (In Smart Focus: preserviamo sempre i vivai e i prestiti se attinenti)
  const isAnyYouthTargeted = isFull || intents.isYouthFocus || intents.isLoanFocus || intents.isNotesFocus || intents.matchedYouthSquadNames.length > 0;
  const youthSquadsPayload = (youthSquads || []).map(ys => {
    const isTargetedSquad = isFull || intents.isYouthFocus || intents.isLoanFocus || intents.isNotesFocus || intents.matchedYouthSquadNames.includes(ys.name);
    if (!payloadConfig.includeYouth || (!isFull && !isTargetedSquad)) {
      const wonderkidsCount = (ys.players || []).filter(p => (p.pa || 0) >= 170).length;
      const topProspectsCount = (ys.players || []).filter(p => (p.pa || 0) >= 150 && (p.pa || 0) < 170).length;
      return {
        squadId: ys.id,
        squadName: ys.name,
        category: ys.category || 'Giovanile',
        totalPlayers: (ys.players || []).length,
        wonderkidsCount: wonderkidsCount > 0 ? wonderkidsCount : undefined,
        topProspectsCount: topProspectsCount > 0 ? topProspectsCount : undefined,
        summary: `Rosa di ${(ys.players || []).length} giovani (dettagli individuali omessi in Smart Focus: richiedi info sul vivaio o cita un giovane per analizzarli).`,
      };
    }

    return {
      squadId: ys.id,
      squadName: ys.name,
      category: ys.category || 'Giovanile',
      totalPlayers: (ys.players || []).length,
      notes: ys.notes || undefined,
      players: (ys.players || []).map(p => {
        const effAge = getEffectiveAge(p, currentDate);
        const ext = extractPlayerStats(p);
        const onLoan = isPlayerOnLoan(p);
        const isTargetedPlayer = isFull ||
          intents.matchedPlayerNames.includes(p.name) ||
          (intents.isLoanFocus && onLoan) ||
          Boolean(p.notes);

        const parsedStats = parseStatsFromPlayerNote(
          p.notes,
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
        const loanClub = p.loanClub || parsedStats.cleanClubMention || (onLoan ? "Club esterno non specificato" : undefined);

        const loanPerformanceStats = p.loanPerformanceStats || (onLoan ? {
          appearances: appearances ?? 0,
          subAppearances: parsedStats.subAppearances || ext.subAppearances || 0,
          goals: goals ?? 0,
          assists: assists ?? 0,
          avgRating: avgRating ?? 6.75,
          minutes: ext.minutesPlayed || parsedStats.minutesPlayed,
          summary: parsedStats.formattedStatsSummary || "In prestito",
          hasQuantitativeStats: true,
          noteText: (p.notes && p.notes.trim()) ? p.notes.trim() : undefined,
        } : (parsedStats.hasQuantitativeStats ? {
          appearances,
          subAppearances: parsedStats.subAppearances || ext.subAppearances || 0,
          goals,
          assists,
          avgRating,
          minutes: ext.minutesPlayed || parsedStats.minutesPlayed,
          summary: parsedStats.formattedStatsSummary,
          hasQuantitativeStats: true,
          noteText: (p.notes && p.notes.trim()) ? p.notes.trim() : undefined,
        } : undefined));

        const baseYouth = {
          name: p.name,
          number: p.number,
          position: p.position,
          age: effAge,
          ca: p.ca || 120,
          pa: p.pa || 155,
          prospectTag: effAge < 22 ? ((p.pa || 0) >= 170 ? 'Wonderkid' : (p.pa || 0) >= 150 ? 'Top Prospect' : (p.pa || 0) >= 130 ? 'Top Talent' : undefined) : undefined,
          growthPotential: Math.max(0, (p.pa || 155) - (p.ca || 120)),
          isInjured: Boolean(p.isInjured),
          isOnLoan: onLoan,
          loanStatus: onLoan ? `IN PRESTITO ATTIVO (${loanClub ? `presso ${loanClub}` : 'club esterno'})` : 'IN ROSA / NON IN PRESTITO',
          loanClub,
          notes: (p.notes && p.notes.trim().length > 0) ? p.notes.trim() : undefined,
          appearances: appearances ?? (onLoan ? 0 : undefined),
          goals: goals ?? (onLoan ? 0 : undefined),
          assists: assists ?? (onLoan ? 0 : undefined),
          avgRating: avgRating ?? (onLoan ? 6.75 : undefined),
          loanStatsSummary: parsedStats.hasQuantitativeStats ? parsedStats.formattedStatsSummary : (loanPerformanceStats?.summary || undefined),
          loanPerformanceStats,
        };
        if (isTargetedPlayer) {
          return {
            ...baseYouth,
            technicalAttributes: p.technicalAttributes,
            mentalAttributes: p.mentalAttributes,
            physicalAttributes: p.physicalAttributes,
          };
        }
        return baseYouth;
      })
    };
  });

  // 5. Scouting Targets (In Smart Focus: se non pertinenti alla domanda, inviamo riassunto compatto per abbattere i token)
  const isAnyScoutingTargeted = isFull || intents.isScoutingFocus || intents.matchedTargetNames.length > 0;
  const scoutingPayload = isAnyScoutingTargeted
    ? (targets || []).map(t => {
        const effAge = getEffectiveAge(t, currentDate);
        const isTargeted = isFull || intents.isScoutingFocus || intents.matchedTargetNames.includes(t.name);
        const baseScout = {
          name: t.name,
          age: effAge,
          position: t.position,
          roles: t.roles,
          currentClub: t.currentClub,
          estimatedValue: t.estimatedValue,
          weeklyWage: t.weeklyWage,
          rating: t.rating,
          priority: t.priority,
          ca: t.ca,
          pa: t.pa,
          prospectTag: effAge < 22 ? ((t.pa || 0) >= 170 ? 'Wonderkid' : (t.pa || 0) >= 150 ? 'Top Prospect' : (t.pa || 0) >= 130 ? 'Top Talent' : undefined) : undefined,
          notes: t.notes,
        };
        if (isTargeted && payloadConfig.scoutingDetailMode === 'full') {
          return {
            ...baseScout,
            technicalAttributes: t.technicalAttributes,
            mentalAttributes: t.mentalAttributes,
            physicalAttributes: t.physicalAttributes,
          };
        }
        return baseScout;
      })
    : [
        {
          totalTargetsLoaded: (targets || []).length,
          summary: `${(targets || []).length} obiettivi presenti nella lista scouting (dettagli omessi in Smart Focus: nomina un obiettivo o chiedi di scouting/mercato per caricarli)`,
        }
      ];

  // 6. Piano Gara AI & Analisi Avversario (Modalità Big Match)
  // DISATTIVATO DA DEFAULT per non appesantire il payload del Copilot:
  // Viene incluso SOLO ed ESCLUSIVAMENTE se la Modalità Big Match è esplicitamente attivata dall'utente (payloadConfig.includeGamePlan === true).
  // Nelle normali chat di routine rimane disattivato e non occupa spazio nel payload.
  const isGamePlanActive = Boolean(payloadConfig.includeGamePlan);

  const gamePlanPayload = (effectiveGamePlan && isGamePlanActive) ? {
    opponent: effectiveGamePlan.opponent,
    venue: effectiveGamePlan.venue,
    competition: effectiveGamePlan.competition,
    opponentStyle: effectiveGamePlan.opponentStyle,
    strategicPriority: effectiveGamePlan.strategicPriority,
    opponentFormation: effectiveGamePlan.opponentFormation,
    opponentMentality: effectiveGamePlan.opponentMentality,
    opponentTacticalNotes: effectiveGamePlan.opponentTacticalNotes || undefined,
    totalOpponentPlayersLoaded: (effectiveGamePlan.opponentPlayers || []).length,
    opponentPlayers: (isFull || intents.isGamePlanFocus)
      ? (effectiveGamePlan.opponentPlayers || []).map(p => ({
          name: p.name,
          position: p.position,
          qualities: p.qualities || undefined,
          weaknesses: p.weaknesses || undefined,
          notes: p.notes || undefined,
        }))
      : undefined,
    aiMatchPlanReport: effectiveGamePlan.aiMatchPlan || undefined,
    hasGeneratedReport: Boolean(effectiveGamePlan.aiMatchPlan),
    managerPersonalNotes: effectiveGamePlan.managerNotes || undefined,
  } : undefined;

  // 7. Calendario, Risultati e Note Partita
  const calendarPerformanceSummary = getCalendarPerformancePayload(fixtures || []);
  const calendarMatchNotes = (fixtures || [])
    .filter(f => f.tacticalNotes && f.tacticalNotes.trim().length > 0)
    .map(f => {
      const res = getFixtureResult(f);
      return {
        date: f.date,
        opponent: f.opponent,
        venue: f.venue,
        competition: f.competition,
        score: f.score || undefined,
        outcome: res?.outcome || f.outcome || undefined,
        scorers: (Array.isArray(f.scorers) && f.scorers.length > 0) ? f.scorers : undefined,
        notes: f.tacticalNotes!.trim(),
      };
    });

  const contextualFixturesInfo = getContextualFixtures(fixtures || [], currentDate || "28 Ottobre 2026");
  const currentTsVal = parseFixtureDate(currentDate || "28 Ottobre 2026");

  // Filter future fixtures relative to current in-game date
  const upcomingChronological = contextualFixturesInfo.sorted
    .filter(f => parseFixtureDate(f.date) >= currentTsVal && f.status === 'In Arrivo')
    .slice(0, 4);

  const finalSmartFixtures = upcomingChronological.length > 0
    ? upcomingChronological
    : contextualFixturesInfo.sorted
        .filter(f => parseFixtureDate(f.date) >= currentTsVal)
        .slice(0, 3);

  const temporalFilter = intents.temporalFilter;
  const isTemporalActive = Boolean(temporalFilter?.hasTemporalFilter);

  // Filtra le partite con il motore temporale intelligente
  const temporallyFilteredFixtures = filterFixturesByTemporalRange(
    fixtures || [],
    temporalFilter || null,
    currentDate || "28 Ottobre 2026"
  );

  const allFixturesPayload = (isFull || intents.isCalendarFocus || isTemporalActive)
    ? temporallyFilteredFixtures.map(f => {
        const res = getFixtureResult(f);
        return {
          date: f.date,
          opponent: f.opponent,
          venue: f.venue,
          competition: f.competition,
          status: f.status,
          score: f.score,
          outcome: res?.outcome || f.outcome || undefined,
          scorers: (Array.isArray(f.scorers) && f.scorers.length > 0) ? f.scorers : undefined,
          tacticalNotes: (f.tacticalNotes && f.tacticalNotes.trim().length > 0) ? f.tacticalNotes.trim() : undefined,
        };
      })
    : finalSmartFixtures.map(f => ({
        date: f.date,
        opponent: f.opponent,
        venue: f.venue,
        competition: f.competition,
        status: f.status,
      }));

  const immediateMatchContext = {
    currentInGameDate: currentDate || "28 Ottobre 2026",
    nextMatch: contextualFixturesInfo.nextFixture ? {
      opponent: contextualFixturesInfo.nextFixture.opponent,
      date: contextualFixturesInfo.nextFixture.date,
      venue: contextualFixturesInfo.nextFixture.venue,
      competition: contextualFixturesInfo.nextFixture.competition,
      daysToMatch: contextualFixturesInfo.daysToNext,
      isToday: contextualFixturesInfo.daysToNext === 0,
    } : null,
    lastPlayedMatch: contextualFixturesInfo.lastPlayedFixture ? {
      opponent: contextualFixturesInfo.lastPlayedFixture.opponent,
      date: contextualFixturesInfo.lastPlayedFixture.date,
      score: contextualFixturesInfo.lastPlayedFixture.score,
      venue: contextualFixturesInfo.lastPlayedFixture.venue,
      competition: contextualFixturesInfo.lastPlayedFixture.competition,
    } : null,
  };

  // 8. Classifica & Competizioni
  const competitionsAndStandingsPayload = {
    userTeamStanding: userTeamRow ? {
      position: userTeamRow.position,
      team: userTeamRow.team,
      points: userTeamRow.points,
      form: userTeamRow.form || undefined,
    } : null,
    activeCompetitions: calendarCompetitions,
    competitionGoals: effectiveCompetitionGoals,
    standings: (isFull || intents.isStandingsFocus)
      ? standings.slice(0, 24).map(s => ({
          position: s.position,
          team: s.team,
          points: s.points,
          gd: s.gd,
          form: s.form,
        }))
      : (userTeamRow ? [{ position: userTeamRow.position, team: userTeamRow.team, points: userTeamRow.points, form: userTeamRow.form }] : []),
  };

  // 9. Sviluppo Rosa & Variazioni
  const growthPayload = {
    totalMonitored: growthStats?.totalMonitored || 0,
    totalImproved: growthStats?.totalImproved || 0,
    totalDeclined: growthStats?.totalDeclined || 0,
    improvedPlayers: (isFull || intents.isGrowthFocus)
      ? (growthStats?.improvedList || []).slice(0, 10).map((item: any) => ({
          name: item.player.name,
          caDiff: item.variation?.caDiff > 0 ? `+${item.variation?.caDiff}` : item.variation?.caDiff,
          improvedAttributes: (item.variation?.improvedAttrs || []).map((a: any) => `${a.name} (+${a.diff})`).join(', '),
        }))
      : undefined,
  };

  // 10. Note Tattiche
  const notesPayload = (tacticalNotes || []).map(n => ({
    title: n.title,
    category: n.category,
    content: n.content,
    operationalDate: n.operationalDate || undefined,
  }));

  // 11. Giocatori UFFICIALMENTE in prestito (flag isOnLoan: true) & Sintesi Ufficiale
  const playersCurrentlyOnLoan = getAllLoanedPlayersEnriched(players, youthSquads || []);

  const officialLoanSummary = {
    totalPlayersCurrentlyOnLoan: playersCurrentlyOnLoan.length,
    activeLoanPlayerNames: playersCurrentlyOnLoan.map(p => p.name),
    playersWithRecordedLoanStats: playersCurrentlyOnLoan.map(p =>
      `${p.name} (${p.loanClub || 'Club esterno'} - ${p.position}): ${p.loanPerformanceStats?.summary || p.notes || 'In prestito'}`
    ),
    allLoanProfilesTable: playersCurrentlyOnLoan.map(p => ({
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

  // 12. Giocatori con note testuali (con esplicita indicazione se in rosa o in prestito)
  const playersWithNotes = [
    ...players
      .filter(p => p.notes && p.notes.trim().length > 0)
      .map(p => ({
        ...enrichPlayerWithLoanStats(p),
        squad: 'Prima Squadra',
        hasCopilotNote: isCopilotNote(p.notes!),
      })),
    ...(youthSquads || []).flatMap(ys =>
      (ys.players || [])
        .filter(p => p.notes && p.notes.trim().length > 0)
        .map(p => ({
          ...enrichPlayerWithLoanStats(p),
          squad: ys.name,
          hasCopilotNote: isCopilotNote(p.notes!),
        }))
    ),
  ];

  // 13. Insieme unificato di calciatori con note e/o in prestito
  const playersWithNotesAndLoans = [
    ...players
      .filter(p => Boolean(p.notes && p.notes.trim()) || Boolean(p.isOnLoan) || Boolean(p.loanClub && p.loanClub.trim()))
      .map(p => ({
        ...enrichPlayerWithLoanStats(p),
        squad: 'Prima Squadra',
        hasCopilotNote: (p.notes && isCopilotNote(p.notes)) ? true : undefined,
      })),
    ...(youthSquads || []).flatMap(ys =>
      (ys.players || [])
        .filter((p: any) => Boolean(p.notes && p.notes.trim()) || Boolean(p.isOnLoan) || Boolean(p.loanClub && p.loanClub.trim()))
        .map((p: any) => ({
          ...enrichPlayerWithLoanStats(p),
          squad: ys.name,
          hasCopilotNote: (p.notes && isCopilotNote(p.notes)) ? true : undefined,
        }))
    ),
  ];

  return {
    club: teamName || "La Tua Squadra FC",
    currentDate,
    phaseInfo: {
      phaseName: phaseInfo?.phaseName,
      currentMonth: phaseInfo?.currentMonth,
      leaguePosition: phaseInfo?.leaguePosition,
    },
    contextFilterSummary: {
      mode: intents.contextMode,
      activeDomains: intents.targetedDomains,
      playersWithFullAttributes: intents.matchedPlayerNames,
    },
    tactic: tacticPayload,
    allPlayers: allPlayersPayload,
    playersAvailableForYouthMatches: availableForYouthPayload,
    youthSquads: youthSquadsPayload,
    scoutingTargets: scoutingPayload,
    gamePlan: gamePlanPayload,
    calendarPerformanceSummary,
    calendarMatchNotes,
    immediateMatchContext,
    temporalFilterLabel: temporalFilter?.label || undefined,
    allFixtures: allFixturesPayload,
    competitionsAndStandings: competitionsAndStandingsPayload,
    squadGrowthAndVariations: growthPayload,
    tacticalNotes: notesPayload,
    playersCurrentlyOnLoan,
    officialLoanSummary,
    playersWithNotes,
    playersWithNotesAndLoans,
  };
}
