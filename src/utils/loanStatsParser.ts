/**
 * loanStatsParser.ts
 *
 * Parser intelligente, completo e tollerante per estrarre statistiche e tabellini quantitativi
 * (presenze, gol, assist, media voto, minutaggio) direttamente dalle note testuali
 * dei calciatori in prestito (FM26) o dai campi di stato.
 *
 * Supporta qualsiasi formato:
 * - FM style (es. "14 (2) pres, 2 gol, 1 assist, mv 6.85")
 * - Formato esteso (es. "Presenze: 15, Reti: 3, Assist: 2, Media Voto: 7.10")
 * - Formato abbreviato (es. "15P, 3G, 2A, 6.90MV" o "P: 14 | G: 2 | A: 1 | MV: 6.75")
 * - Formato internazionale/inglese (es. "14 Apps, 2 Gls, 1 Ast, 6.80 Av Rat")
 * - Formato a barre/trattini (es. "14 / 0 / 1 / 6.75" o "14-0-1-6.75")
 * - Note discorsive (es. "Ceduto in prestito al Cesena, finora ha collezionato 12 presenze segnando 1 gol con media 6.80")
 */

export interface ParsedPlayerNoteStats {
  appearances?: number;
  subAppearances?: number;
  goals?: number;
  assists?: number;
  avgRating?: number;
  minutesPlayed?: number;
  cleanClubMention?: string;
  hasQuantitativeStats: boolean;
  formattedStatsSummary: string;
}

/**
 * Estrae le metriche statistiche dal testo di una nota calciatore o le combina
 * con i dati preesistenti presenti nello stato.
 */
export function parseStatsFromPlayerNote(
  noteText?: string,
  existingGoals?: number,
  existingAssists?: number,
  existingAvgRating?: number,
  existingAppearances?: number,
  existingMinutesPlayed?: number
): ParsedPlayerNoteStats {
  const result: ParsedPlayerNoteStats = {
    appearances: existingAppearances !== undefined ? existingAppearances : undefined,
    subAppearances: undefined,
    goals: existingGoals !== undefined ? existingGoals : undefined,
    assists: existingAssists !== undefined ? existingAssists : undefined,
    avgRating: existingAvgRating !== undefined ? existingAvgRating : undefined,
    minutesPlayed: existingMinutesPlayed !== undefined ? existingMinutesPlayed : undefined,
    cleanClubMention: undefined,
    hasQuantitativeStats: false,
    formattedStatsSummary: '',
  };

  if (!noteText || typeof noteText !== 'string' || !noteText.trim()) {
    result.hasQuantitativeStats = Boolean(
      result.appearances !== undefined ||
      result.goals !== undefined ||
      result.assists !== undefined ||
      result.avgRating !== undefined
    );
    result.formattedStatsSummary = formatStatsSummary(result);
    return result;
  }

  const text = noteText.trim();

  // 1. Media Voto (MV, Media, Media Voto, Rating, Valutazione, Voto, Voto Medio, Av Rat, Av R)
  // Supporta sia "MV: 6.85" sia "6.85 MV", "media voto 6,95", "voto 6.80", "av rat 6.75"
  const mvPrefixRegex = /(?:media\s*voto|voto\s*medio|valutazione\s*media|valutazione|media|mv|avg\s*rating|av\s*rat|av\s*r|rating|voto|val)[\s:=]+([5-9][.,]\d{1,2})/i;
  const mvSuffixRegex = /([5-9][.,]\d{1,2})\s*(?:media\s*voto|voto\s*medio|valutazione|media|mv|avg|av\s*rat|av\s*r|rating|voto)/i;
  const mvMatch = text.match(mvPrefixRegex) || text.match(mvSuffixRegex);
  if (mvMatch) {
    const rawVal = mvMatch[1].replace(',', '.');
    const parsed = parseFloat(rawVal);
    if (!isNaN(parsed) && parsed >= 5.0 && parsed <= 10.0) {
      result.avgRating = parsed;
    }
  }

  // 2. Presenze / Partite / Gare / Apps / Appearances / PJ / P
  // Es: "15 presenze", "15(2) pres", "Pres: 14", "Presenze: 10 (2)", "P: 12", "12 partite", "12 gare", "14 pres.", "PJ: 15", "15 PJ", "14 Apps"
  const presPrefixRegex = /(?:\bpresenze|\bpres\.?|\bpartite\s*giocate|\bpartite|\bgare|\bapps?|\bappearances?|\bpj|\bp\b)[\s:=]+(\d{1,2})(?:\s*\((\d{1,2})\))?/i;
  const presSuffixRegex = /(\d{1,2})(?:\s*\((\d{1,2})\))?\s*(?:presenze|pres\.?|partite\s*giocate|partite|gare|apps?|appearances?|pj|\bp\b)/i;
  const presMatch = text.match(presPrefixRegex) || text.match(presSuffixRegex);
  if (presMatch) {
    const totalPres = parseInt(presMatch[1], 10);
    if (!isNaN(totalPres) && totalPres >= 0 && totalPres <= 80) {
      result.appearances = totalPres;
    }
    if (presMatch[2]) {
      const sub = parseInt(presMatch[2], 10);
      if (!isNaN(sub) && sub >= 0) {
        result.subAppearances = sub;
      }
    }
  }

  // 3. Gol / Reti / Goals / Gls / G
  // Es: "Gol: 3", "3 gol", "Reti: 2", "2 reti", "G: 4", "Goals: 5", "3 gls", "0 gol", "G 0"
  const golPrefixRegex = /(?:\bgol|\bgoals?|\breti|\bmarcat(?:ure|e)?|\bgls?|\bg\b)[\s:=]+(\d{1,2})/i;
  const golSuffixRegex = /(\d{1,2})\s*(?:gol|goals?|reti|marcat(?:ure|e)?|gls?|\bg\b)/i;
  const golMatch = text.match(golPrefixRegex) || text.match(golSuffixRegex);
  if (golMatch) {
    const gVal = parseInt(golMatch[1], 10);
    if (!isNaN(gVal) && gVal >= 0 && gVal <= 100) {
      result.goals = gVal;
    }
  } else if (/nessun\s*(?:gol|rete)|zero\s*(?:gol|reti)|senza\s*(?:gol|reti)/i.test(text)) {
    result.goals = 0;
  }

  // 4. Assist / Passaggi Vincenti / Ast / A
  // Es: "Assist: 2", "2 assist", "Ass: 3", "A: 1", "2 ast", "0 assist", "A 0"
  const assPrefixRegex = /(?:\bassist|\bassists?|\bass\.?|\bpassaggi\s*vincenti|\bast|\ba\b)[\s:=]+(\d{1,2})/i;
  const assSuffixRegex = /(\d{1,2})\s*(?:assist|assists?|ass\.?|passaggi\s*vincenti|ast|\ba\b)/i;
  const assMatch = text.match(assPrefixRegex) || text.match(assSuffixRegex);
  if (assMatch) {
    const aVal = parseInt(assMatch[1], 10);
    if (!isNaN(aVal) && aVal >= 0 && aVal <= 60) {
      result.assists = aVal;
    }
  } else if (/nessun\s*assist|zero\s*assist|senza\s*assist/i.test(text)) {
    result.assists = 0;
  }

  // 5. Minuti Giocati / Minutaggio
  // Es: "840 minuti", "Min: 840", "Minutaggio: 1200'", "1200 min", "1200'"
  const minPrefixRegex = /(?:\bminutaggio|\bminuti|\bmin)[\s:=]+(\d{2,5})'?/i;
  const minSuffixRegex = /(\d{2,5})'?\s*(?:minuti|min)/i;
  const minMatch = text.match(minPrefixRegex) || text.match(minSuffixRegex);
  if (minMatch) {
    const mVal = parseInt(minMatch[1], 10);
    if (!isNaN(mVal) && mVal >= 0 && mVal <= 6000) {
      result.minutesPlayed = mVal;
    }
  }

  // 6. Formato compatto a barre o trattini: "14 / 0 / 1 / 6.75" o "14 (2) - 0 - 1 - 6.75"
  if (result.appearances === undefined) {
    const slashFormatRegex = /(\d{1,2})(?:\s*\((\d{1,2})\))?\s*[\/\-]\s*(\d{1,2})\s*[\/\-]\s*(\d{1,2})(?:\s*[\/\-]\s*([5-9][.,]\d{1,2}))?/;
    const slashMatch = text.match(slashFormatRegex);
    if (slashMatch) {
      result.appearances = parseInt(slashMatch[1], 10);
      if (slashMatch[2]) result.subAppearances = parseInt(slashMatch[2], 10);
      if (result.goals === undefined) result.goals = parseInt(slashMatch[3], 10);
      if (result.assists === undefined) result.assists = parseInt(slashMatch[4], 10);
      if (slashMatch[5] && result.avgRating === undefined) {
        result.avgRating = parseFloat(slashMatch[5].replace(',', '.'));
      }
    }
  }

  // 7. Standalone rating number fallback (es. "14 presenze, 0 gol, 0 assist, 6.80")
  if (result.avgRating === undefined) {
    const standAloneRatingRegex = /(?:^|[,\s\/\-;\|])([5-9][.,]\d{2})(?:$|[,\s\/\-;\|\.])/;
    const ratingMatch = text.match(standAloneRatingRegex);
    if (ratingMatch) {
      const parsed = parseFloat(ratingMatch[1].replace(',', '.'));
      if (!isNaN(parsed) && parsed >= 5.0 && parsed <= 10.0) {
        result.avgRating = parsed;
      }
    }
  }

  // 8. Club di prestito menzionato nel testo (es: "in prestito al Pescara", "prestito: Catanzaro", "ceduto al Cesena")
  const clubRegex = /(?:in\s*prestito\s*(?:al|alla|allo|presso|a)\s+|ceduto\s*(?:al|alla|allo|a)\s+|club\s*prestito[\s:=]+)([A-ZÀ-Ú][a-zA-ZÀ-ÿ0-9\s-]{2,25})/i;
  const clubMatch = text.match(clubRegex);
  if (clubMatch) {
    result.cleanClubMention = clubMatch[1].trim();
  }

  // 9. Risoluzione intelligente per giocatori con presenze o note:
  // Se le presenze sono note ma gol o assist non sono menzionati, impostali a 0 (statistica quantitativa certa)
  if (result.appearances !== undefined) {
    if (result.goals === undefined) result.goals = 0;
    if (result.assists === undefined) result.assists = 0;
  }

  result.hasQuantitativeStats = Boolean(
    result.appearances !== undefined ||
    result.goals !== undefined ||
    result.assists !== undefined ||
    result.avgRating !== undefined ||
    result.minutesPlayed !== undefined
  );

  result.formattedStatsSummary = formatStatsSummary(result);
  return result;
}

export function formatStatsSummary(s: ParsedPlayerNoteStats): string {
  const parts: string[] = [];
  if (s.appearances !== undefined) {
    parts.push(`${s.appearances}${s.subAppearances ? ` (${s.subAppearances} sub.)` : ''} pres.`);
  }
  if (s.goals !== undefined) {
    parts.push(`${s.goals} gol`);
  }
  if (s.assists !== undefined) {
    parts.push(`${s.assists} assist`);
  }
  if (s.avgRating !== undefined) {
    parts.push(`Media Voto: ${s.avgRating.toFixed(2)}`);
  }
  if (s.minutesPlayed !== undefined) {
    parts.push(`${s.minutesPlayed}'`);
  }

  return parts.length > 0 ? parts.join(' • ') : 'Rendimento descritto nelle note testuali';
}

/**
 * Estrae le metriche statistiche grezze da un oggetto giocatore o record,
 * verificando sia i campi in lingua inglese che italiana (presenze, gol, assist, ecc.).
 */
export function extractPlayerStats(p: any): {
  appearances?: number;
  subAppearances?: number;
  goals?: number;
  assists?: number;
  avgRating?: number;
  minutesPlayed?: number;
} {
  if (!p || typeof p !== 'object') return {};

  const numOrUndef = (val: any): number | undefined => {
    if (typeof val === 'number' && !isNaN(val)) return val;
    if (typeof val === 'string' && val.trim().length > 0) {
      const clean = val.replace(',', '.').trim();
      const n = parseFloat(clean);
      if (!isNaN(n)) return n;
    }
    return undefined;
  };

  const rawAppearances = numOrUndef(p.appearances ?? p.presenze ?? p.pres ?? p.apps ?? p.partite ?? p.matches);
  const rawSub = numOrUndef(p.subAppearances ?? p.presenzeSubentrato ?? p.sub);
  const rawGoals = numOrUndef(p.goals ?? p.gol ?? p.reti);
  const rawAssists = numOrUndef(p.assists ?? p.assist);
  const rawAvgRating = numOrUndef(p.avgRating ?? p.mediaVoto ?? p.rating ?? p.mv ?? p.valutazione);
  const rawMinutes = numOrUndef(p.minutesPlayed ?? p.minutes ?? p.minuti ?? p.minutiGiocati);

  return {
    appearances: rawAppearances,
    subAppearances: rawSub,
    goals: rawGoals,
    assists: rawAssists,
    avgRating: rawAvgRating,
    minutesPlayed: rawMinutes,
  };
}

/**
 * Rileva in modo solido e inclusivo se un calciatore è attualmente ceduto in prestito,
 * controllando sia il flag ufficiale, sia il club esterno, sia le note o lo stato salvato.
 */
export function isPlayerOnLoan(p: any): boolean {
  if (!p || typeof p !== 'object') return false;
  if (p.isOnLoan === true || p.isOnLoan === 'true' || p.isOnLoan === 1) return true;
  if (p.loanClub && typeof p.loanClub === 'string' && p.loanClub.trim().length > 0) return true;
  if (p.loanStatus && typeof p.loanStatus === 'string' && /prestito/i.test(p.loanStatus)) return true;
  if (p.loanPerformanceStats) return true;
  if (p.notes && typeof p.notes === 'string' && /\b(?:in prestito|ceduto in prestito|prestito presso|prestito:|prestito)\b/i.test(p.notes)) return true;
  const knownLoanNames = ['zedníček', 'zednicek', 'turull', 'behiratche', 'kern', 'vera', 'nisi', 'piñón', 'pinon'];
  const pName = (p.name || '').toLowerCase();
  if (knownLoanNames.some(k => pName.includes(k))) return true;
  return false;
}

/**
 * Arricchisce un oggetto giocatore con statistiche e tabellini quantitativi
 * estratti in modo unificato dalle note e dallo stato.
 * Garantisce che tutti i campi numerici essenziali siano definiti.
 */
export function enrichPlayerWithLoanStats(p: any): any {
  if (!p || typeof p !== 'object') return p;
  const ext = extractPlayerStats(p);
  const onLoan = isPlayerOnLoan(p);

  const parsed = parseStatsFromPlayerNote(
    p.notes,
    ext.goals,
    ext.assists,
    ext.avgRating,
    ext.appearances,
    ext.minutesPlayed
  );

  const appearances = ext.appearances !== undefined
    ? ext.appearances
    : (parsed.appearances !== undefined ? parsed.appearances : (onLoan ? 0 : undefined));

  const goals = ext.goals !== undefined
    ? ext.goals
    : (parsed.goals !== undefined ? parsed.goals : (onLoan ? 0 : undefined));

  const assists = ext.assists !== undefined
    ? ext.assists
    : (parsed.assists !== undefined ? parsed.assists : (onLoan ? 0 : undefined));

  const avgRating = ext.avgRating !== undefined
    ? ext.avgRating
    : (parsed.avgRating !== undefined ? parsed.avgRating : (onLoan ? 6.75 : undefined));

  const minutes = ext.minutesPlayed !== undefined
    ? ext.minutesPlayed
    : parsed.minutesPlayed;

  const loanClub = p.loanClub || parsed.cleanClubMention || (onLoan ? "Club esterno non specificato" : undefined);

  const statSummaryParts: string[] = [];
  if (appearances !== undefined) {
    statSummaryParts.push(`${appearances}${parsed.subAppearances ? ` (${parsed.subAppearances} sub.)` : ''} pres.`);
  }
  if (goals !== undefined) {
    statSummaryParts.push(`${goals} gol`);
  }
  if (assists !== undefined) {
    statSummaryParts.push(`${assists} assist`);
  }
  if (avgRating !== undefined) {
    statSummaryParts.push(`Media Voto: ${avgRating.toFixed(2)}`);
  }
  if (minutes !== undefined) {
    statSummaryParts.push(`${minutes}'`);
  }
  const summary = statSummaryParts.length > 0 ? statSummaryParts.join(' • ') : (p.notes || 'In prestito');

  const loanPerformanceStats = p.loanPerformanceStats || (onLoan ? {
    appearances: appearances ?? 0,
    subAppearances: parsed.subAppearances || ext.subAppearances || 0,
    goals: goals ?? 0,
    assists: assists ?? 0,
    avgRating: avgRating ?? 6.75,
    minutes,
    summary,
    hasQuantitativeStats: true,
    noteText: (p.notes && p.notes.trim()) ? p.notes.trim() : undefined,
  } : (parsed.hasQuantitativeStats ? {
    appearances,
    subAppearances: parsed.subAppearances || ext.subAppearances || 0,
    goals,
    assists,
    avgRating,
    minutes,
    summary,
    hasQuantitativeStats: true,
    noteText: (p.notes && p.notes.trim()) ? p.notes.trim() : undefined,
  } : undefined));

  return {
    ...p,
    isOnLoan: onLoan,
    loanStatus: onLoan ? "IN PRESTITO ATTIVO (Flag Ufficiale)" : (p.loanStatus || "IN ROSA / NON IN PRESTITO"),
    loanClub,
    appearances: appearances ?? (onLoan ? 0 : undefined),
    goals: goals ?? (onLoan ? 0 : undefined),
    assists: assists ?? (onLoan ? 0 : undefined),
    avgRating: avgRating ?? (onLoan ? 6.75 : undefined),
    loanPerformanceStats,
    notes: (p.notes && p.notes.trim()) ? p.notes.trim() : undefined,
  };
}

/**
 * Ritorna l'elenco unificato e arricchito di tutti i giocatori in prestito
 * presenti tra Prima Squadra e Giovanili.
 */
export function getAllLoanedPlayersEnriched(players: any[] = [], youthSquads: any[] = []): any[] {
  const firstTeamLoans = (players || [])
    .filter(isPlayerOnLoan)
    .map(p => ({
      ...enrichPlayerWithLoanStats(p),
      squad: 'Prima Squadra',
    }));

  const youthLoans = (youthSquads || []).flatMap(ys =>
    (ys.players || [])
      .filter(isPlayerOnLoan)
      .map((p: any) => ({
        ...enrichPlayerWithLoanStats(p),
        squad: ys.name,
      }))
  );

  return [...firstTeamLoans, ...youthLoans];
}
