/**
 * temporalFixturesFilter.ts
 *
 * Motore di analisi temporale intelligente per il Copilot e lo Smart Slicing (FM26).
 * Estrae dal prompt dell'utente (e dalla cronologia recente) intervalli temporali
 * specifici (singoli mesi, range tra mesi, giorni specifici, periodi relativi come
 * "questo mese" / "ultime due settimane" / "da inizio stagione" o conteggi personalizzati)
 * e filtra le partite del calendario preservando TUTTI i dati essenziali:
 * punteggio, marcatori, esito, note tattiche e avversario.
 */

import { Fixture } from '../types';
import {
  parseDateComponents,
  parseFixtureDate,
  formatItalianDate,
  ITALIAN_MONTHS,
  getDaysInMonth
} from './dateUtils';

export function safeResolveFixtureResult(fixture: Fixture): {
  isPlayed: boolean;
  teamGoals: number;
  oppGoals: number;
  outcome: 'Vittoria' | 'Pareggio' | 'Sconfitta';
  isWin: boolean;
  isDraw: boolean;
  isLoss: boolean;
  displayScore: string;
} | null {
  if (fixture.status !== 'Giocata' && !fixture.score) return null;
  if (!fixture.score) return null;

  const scoreMatch = fixture.score.match(/(\d+)\s*[-:]\s*(\d+)/);
  if (!scoreMatch) return null;

  let g1 = parseInt(scoreMatch[1], 10);
  let g2 = parseInt(scoreMatch[2], 10);
  let outcome = fixture.outcome;

  if (outcome === 'Vittoria' && g1 < g2) {
    const temp = g1;
    g1 = g2;
    g2 = temp;
  } else if (outcome === 'Sconfitta' && g1 > g2) {
    const temp = g1;
    g1 = g2;
    g2 = temp;
  } else if (!outcome) {
    outcome = g1 > g2 ? 'Vittoria' : g1 === g2 ? 'Pareggio' : 'Sconfitta';
  }

  const isWin = outcome === 'Vittoria' || g1 > g2;
  const isDraw = outcome === 'Pareggio' || (g1 === g2 && !isWin);
  const isLoss = outcome === 'Sconfitta' || (!isWin && !isDraw);

  return {
    isPlayed: true,
    teamGoals: g1,
    oppGoals: g2,
    outcome,
    isWin,
    isDraw,
    isLoss,
    displayScore: `${g1}-${g2}`,
  };
}

const MONTH_NAMES_MAP: Record<string, number> = {
  gennaio: 0,
  gen: 0,
  jan: 0,
  january: 0,
  febbraio: 1,
  feb: 1,
  february: 1,
  marzo: 2,
  mar: 2,
  march: 2,
  aprile: 3,
  apr: 3,
  april: 3,
  maggio: 4,
  mag: 4,
  may: 4,
  giugno: 5,
  giu: 5,
  jun: 5,
  june: 5,
  luglio: 6,
  lug: 6,
  jul: 6,
  july: 6,
  agosto: 7,
  ago: 7,
  aug: 7,
  august: 7,
  settembre: 8,
  set: 8,
  sett: 8,
  sep: 8,
  sept: 8,
  september: 8,
  ottobre: 9,
  ott: 9,
  oct: 9,
  october: 9,
  novembre: 10,
  nov: 10,
  november: 10,
  dicembre: 11,
  dic: 11,
  dec: 11,
  december: 11,
};

const ITALIAN_NUMBER_WORDS: Record<string, number> = {
  un: 1,
  uno: 1,
  una: 1,
  due: 2,
  tre: 3,
  quattro: 4,
  cinque: 5,
  sei: 6,
  sette: 7,
  otto: 8,
  nove: 9,
  dieci: 10,
  quindici: 15,
  venti: 20,
  trenta: 30,
};

export interface TemporalFixturesFilter {
  hasTemporalFilter: boolean;
  filterType:
    | 'single_month'
    | 'month_range'
    | 'day_range_in_month'
    | 'custom_date_range'
    | 'relative_month'
    | 'relative_time_span'
    | 'season_phase'
    | 'all_season_played'
    | 'explicit_count'
    | 'default_recent';
  label: string;
  startTs?: number;
  endTs?: number;
  startDateStr?: string;
  endDateStr?: string;
  specificMonthIndex?: number; // 0-11
  specificMonthName?: string;
  targetYear?: number;
  includeOnlyPlayed?: boolean;
  includeOnlyUpcoming?: boolean;
  explicitCount?: number;
  allPlayed?: boolean;
}

/**
 * Normalizza il testo rimuovendo accenti e portando tutto a minuscolo.
 */
function cleanQuery(text: string): string {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Risolve l'anno di riferimento per un dato mese nella stagione di Football Manager.
 * In FM una stagione tipica va da Luglio (Anno N) a Giugno (Anno N+1).
 * Es: se currentDate è "28 Ottobre 2026", la stagione è 2026/2027:
 * - Luglio..Dicembre appartengono al 2026
 * - Gennaio..Giugno appartengono al 2027
 */
export function resolveSeasonYearForMonth(
  monthIndex: number,
  inGameDateStr?: string
): number {
  const comp = parseDateComponents(inGameDateStr || '28 Ottobre 2026');
  const baseYear = comp ? comp.year : 2026;
  const baseMonth = comp ? comp.month : 9; // default Ottobre

  // Se la data di gioco è nella prima parte di stagione (Luglio - Dicembre, mesi 6-11)
  if (baseMonth >= 6) {
    if (monthIndex >= 6) {
      return baseYear;
    } else {
      return baseYear + 1; // Gennaio..Giugno successivi
    }
  } else {
    // Se la data di gioco è nella seconda parte di stagione (Gennaio - Giugno, mesi 0-5)
    if (monthIndex < 6) {
      return baseYear;
    } else {
      return baseYear - 1; // Luglio..Dicembre precedenti
    }
  }
}

/**
 * Analizza il prompt dell'utente e la data in-game per estrarre l'eventuale
 * intervallo temporale richiesto per le partite del calendario.
 */
export function extractTemporalRangeFilter(
  prompt: string,
  inGameDateStr?: string
): TemporalFixturesFilter | null {
  const text = cleanQuery(prompt);
  if (!text) return null;

  const currentComp = parseDateComponents(inGameDateStr || '28 Ottobre 2026') || {
    year: 2026,
    month: 9,
    day: 28,
  };
  const currentTs = parseFixtureDate(inGameDateStr || '28 Ottobre 2026');

  // 1. TUTTA LA STAGIONE / FINORA / DALL'INIZIO DEL CAMPIONATO
  const allSeasonMatch = /\b(tutt[ae]\s+(?:le\s+)?partit[ae]|tutt[ae]\s+(?:le\s+)?gar[ae]|tutta\s+la\s+stagione|dall['’]inizio\s+(?:del\s+campionato|della\s+stagione)|da\s+inizio\s+stagione|finora|fino\s+ad\s+oggi|fino\s+ad\s+ora|tutti\s+i\s+risultati|intero\s+campionato|storico\s+completo)\b/i.test(text);
  if (allSeasonMatch) {
    return {
      hasTemporalFilter: true,
      filterType: 'all_season_played',
      label: 'Tutte le gare disputate in stagione fino ad oggi',
      allPlayed: true,
      includeOnlyPlayed: true,
      endTs: currentTs + 86400000,
    };
  }

  // 1b. INTERVALLO PERSONALIZZATO DA DATA X A DATA Y (es. "da 1 settembre a 15 ottobre", "dal 10/09 al 20/10", "da data 1 settembre a data 31 ottobre", "dal 15 agosto 2026 al 25 settembre 2026")
  const customDateRangeRegex = /(?:da(?:ta)?|dal(?:l['’]|le|la)?|periodo\s+da|tra(?:\s+il)?)\s+(\d{1,2}(?:[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?|\s+(?:di\s+)?(?:[a-zàèéìòù]+)(?:\s+\d{2,4})?))\s+(?:a(?:l(?:l['’]|le|la)?)?|fino\s+a(?:l(?:l['’]|le|la)?)?|e|ed|-)\s+(?:data\s+)?(\d{1,2}(?:[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?|\s+(?:di\s+)?(?:[a-zàèéìòù]+)(?:\s+\d{2,4})?))/i;
  const matchCustomRange = text.match(customDateRangeRegex);
  if (matchCustomRange) {
    const rawStart = matchCustomRange[1].trim();
    const rawEnd = matchCustomRange[2].trim();
    const d1 = parseDateComponents(rawStart);
    const d2 = parseDateComponents(rawEnd);

    if (d1 && d2 && d1.month >= 0 && d1.month <= 11 && d2.month >= 0 && d2.month <= 11) {
      const year1 = d1.year || resolveSeasonYearForMonth(d1.month, inGameDateStr);
      const year2 = d2.year || resolveSeasonYearForMonth(d2.month, inGameDateStr);
      let startTs = new Date(year1, d1.month, d1.day, 0, 0, 0).getTime();
      let endTs = new Date(year2, d2.month, d2.day, 23, 59, 59).getTime();

      let labelStart = formatItalianDate(year1, d1.month, d1.day);
      let labelEnd = formatItalianDate(year2, d2.month, d2.day);

      if (startTs > endTs) {
        const tempTs = startTs;
        startTs = endTs;
        endTs = tempTs;
        const tempLabel = labelStart;
        labelStart = labelEnd;
        labelEnd = tempLabel;
      }

      return {
        hasTemporalFilter: true,
        filterType: 'custom_date_range',
        label: `Dal ${labelStart} al ${labelEnd}`,
        startTs,
        endTs,
        startDateStr: labelStart,
        endDateStr: labelEnd,
      };
    }
  }

  // 2. RANGE TRA DUE MESI (es. "tra settembre e ottobre", "da agosto a novembre", "settembre - ottobre")
  const monthNamesRegex = '(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre|sett?|ott|nov|dic|gen|feb|mar|apr|mag|giu|lug|ago)';
  const rangeTwoMonthsRegex = new RegExp(
    `(?:tra|da|dal(?:l['’]|le)?)\\s+(?:il\\s+mese\\s+di\\s+)?${monthNamesRegex}\\s+(?:e|ed|a|ad|fino\\s+a(?:l(?:le)?)?|-)\\s+(?:il\\s+mese\\s+di\\s+)?${monthNamesRegex}`,
    'i'
  );
  const matchRange = text.match(rangeTwoMonthsRegex);
  if (matchRange) {
    const m1Key = matchRange[1].toLowerCase();
    const m2Key = matchRange[2].toLowerCase();
    const idx1 = MONTH_NAMES_MAP[m1Key];
    const idx2 = MONTH_NAMES_MAP[m2Key];
    if (idx1 !== undefined && idx2 !== undefined) {
      const startYear = resolveSeasonYearForMonth(idx1, inGameDateStr);
      const endYear = resolveSeasonYearForMonth(idx2, inGameDateStr);
      const startTs = new Date(startYear, idx1, 1, 0, 0, 0).getTime();
      const endDays = getDaysInMonth(endYear, idx2);
      const endTs = new Date(endYear, idx2, endDays, 23, 59, 59).getTime();

      return {
        hasTemporalFilter: true,
        filterType: 'month_range',
        label: `Periodo da ${ITALIAN_MONTHS[idx1]} a ${ITALIAN_MONTHS[idx2]}`,
        startTs,
        endTs,
      };
    }
  }

  // 3. RANGE DI GIORNI SPECIFICI DENTRO UN MESE (es. "dall'1 al 15 settembre", "tra il 5 e il 20 ottobre", "1-15 settembre")
  const dayRangeInMonthRegex = new RegExp(
    `(?:da(?:ll['’]|l)?|tra\\s+il)?\\s*(\\d{1,2})\\s*(?:e|ed|a|ad|fino\\s+al?|-)\\s*(\\d{1,2})\\s+(?:di\\s+)?${monthNamesRegex}`,
    'i'
  );
  const matchDayRange = text.match(dayRangeInMonthRegex);
  if (matchDayRange) {
    const day1 = parseInt(matchDayRange[1], 10);
    const day2 = parseInt(matchDayRange[2], 10);
    const mKey = matchDayRange[3].toLowerCase();
    const mIdx = MONTH_NAMES_MAP[mKey];
    if (mIdx !== undefined && day1 >= 1 && day2 >= 1) {
      const year = resolveSeasonYearForMonth(mIdx, inGameDateStr);
      const minDay = Math.min(day1, day2);
      const maxDay = Math.min(Math.max(day1, day2), getDaysInMonth(year, mIdx));
      const startTs = new Date(year, mIdx, minDay, 0, 0, 0).getTime();
      const endTs = new Date(year, mIdx, maxDay, 23, 59, 59).getTime();

      return {
        hasTemporalFilter: true,
        filterType: 'day_range_in_month',
        label: `Dal ${minDay} al ${maxDay} ${ITALIAN_MONTHS[mIdx]} ${year}`,
        startTs,
        endTs,
        specificMonthIndex: mIdx,
        specificMonthName: ITALIAN_MONTHS[mIdx],
        targetYear: year,
      };
    }
  }

  // 4. MESE SPECIFICO (es. "settembre", "di settembre", "a ottobre", "nel mese di novembre", "gare di dicembre")
  const singleMonthRegex = new RegExp(
    `\\b(?:a|in|di|del\\s+mese\\s+di|nel\\s+mese\\s+di|mese\\s+di|per\\s+)?${monthNamesRegex}(?:\\s+(\\d{4}))?\\b`,
    'i'
  );
  const matchSingleMonth = text.match(singleMonthRegex);
  if (matchSingleMonth) {
    const mKey = matchSingleMonth[1].toLowerCase();
    const explicitYear = matchSingleMonth[2] ? parseInt(matchSingleMonth[2], 10) : undefined;
    const mIdx = MONTH_NAMES_MAP[mKey];
    if (mIdx !== undefined) {
      const year = explicitYear || resolveSeasonYearForMonth(mIdx, inGameDateStr);
      const maxDays = getDaysInMonth(year, mIdx);
      const startTs = new Date(year, mIdx, 1, 0, 0, 0).getTime();
      const endTs = new Date(year, mIdx, maxDays, 23, 59, 59).getTime();

      return {
        hasTemporalFilter: true,
        filterType: 'single_month',
        label: `Mese di ${ITALIAN_MONTHS[mIdx]} ${year}`,
        startTs,
        endTs,
        specificMonthIndex: mIdx,
        specificMonthName: ITALIAN_MONTHS[mIdx],
        targetYear: year,
      };
    }
  }

  // 5. PERIODI RELATIVI AL MESE CORRENTE IN-GAME ("questo mese", "mese scorso", "prossimo mese")
  if (/\b(questo\s+mese|mese\s+(?:in\s+corso|attuale)|del\s+mese\s+corrente)\b/i.test(text)) {
    const mIdx = currentComp.month;
    const year = currentComp.year;
    const maxDays = getDaysInMonth(year, mIdx);
    return {
      hasTemporalFilter: true,
      filterType: 'relative_month',
      label: `Questo mese (${ITALIAN_MONTHS[mIdx]} ${year})`,
      startTs: new Date(year, mIdx, 1, 0, 0, 0).getTime(),
      endTs: new Date(year, mIdx, maxDays, 23, 59, 59).getTime(),
      specificMonthIndex: mIdx,
      specificMonthName: ITALIAN_MONTHS[mIdx],
      targetYear: year,
    };
  }

  if (/\b(mese\s+scorso|lo\s+scorso\s+mese|mese\s+precedente|mese\s+passato)\b/i.test(text)) {
    const prevMonthIdx = currentComp.month === 0 ? 11 : currentComp.month - 1;
    const prevYear = currentComp.month === 0 ? currentComp.year - 1 : currentComp.year;
    const maxDays = getDaysInMonth(prevYear, prevMonthIdx);
    return {
      hasTemporalFilter: true,
      filterType: 'relative_month',
      label: `Mese scorso (${ITALIAN_MONTHS[prevMonthIdx]} ${prevYear})`,
      startTs: new Date(prevYear, prevMonthIdx, 1, 0, 0, 0).getTime(),
      endTs: new Date(prevYear, prevMonthIdx, maxDays, 23, 59, 59).getTime(),
      specificMonthIndex: prevMonthIdx,
      specificMonthName: ITALIAN_MONTHS[prevMonthIdx],
      targetYear: prevYear,
      includeOnlyPlayed: true,
    };
  }

  if (/\b(prossimo\s+mese|il\s+mese\s+prossimo|mese\s+successivo|mese\s+che\s+viene)\b/i.test(text)) {
    const nextMonthIdx = currentComp.month === 11 ? 0 : currentComp.month + 1;
    const nextYear = currentComp.month === 11 ? currentComp.year + 1 : currentComp.year;
    const maxDays = getDaysInMonth(nextYear, nextMonthIdx);
    return {
      hasTemporalFilter: true,
      filterType: 'relative_month',
      label: `Prossimo mese (${ITALIAN_MONTHS[nextMonthIdx]} ${nextYear})`,
      startTs: new Date(nextYear, nextMonthIdx, 1, 0, 0, 0).getTime(),
      endTs: new Date(nextYear, nextMonthIdx, maxDays, 23, 59, 59).getTime(),
      specificMonthIndex: nextMonthIdx,
      specificMonthName: ITALIAN_MONTHS[nextMonthIdx],
      targetYear: nextYear,
      includeOnlyUpcoming: true,
    };
  }

  // 6. SPAN TEMPORALI RELATIVI (es. "ultimi 15 giorni", "ultime 2 settimane", "ultimi 2 mesi")
  const recentSpanRegex = /\b(?:ultim[ie]|scors[ie])\s+(\d+|un|due|tre|quattro|cinque|sei|dieci|quindici|venti|trenta)?\s*(giorn[io]|settiman[ae]|mes[ie])\b/i;
  const matchRecentSpan = text.match(recentSpanRegex);
  if (matchRecentSpan) {
    const rawNum = matchRecentSpan[1] || '1';
    const num = /^\d+$/.test(rawNum) ? parseInt(rawNum, 10) : (ITALIAN_NUMBER_WORDS[rawNum] || 1);
    const unit = matchRecentSpan[2].toLowerCase();

    let days = 7;
    if (unit.startsWith('giorn')) days = num;
    else if (unit.startsWith('settiman')) days = num * 7;
    else if (unit.startsWith('mes')) days = num * 30;

    const startTs = currentTs - days * 86400000;
    const endTs = currentTs + 86400000;

    return {
      hasTemporalFilter: true,
      filterType: 'relative_time_span',
      label: `Ultimi ${days} giorni (fino a ${formatItalianDate(currentComp.year, currentComp.month, currentComp.day)})`,
      startTs,
      endTs,
      includeOnlyPlayed: true,
    };
  }

  // Prossimi span temporali (es. "prossime due settimane", "prossimi 30 giorni")
  const upcomingSpanRegex = /\b(?:prossim[ie])\s+(\d+|un|due|tre|quattro|cinque|sei|dieci|quindici|venti|trenta)?\s*(giorn[io]|settiman[ae]|mes[ie])\b/i;
  const matchUpcomingSpan = text.match(upcomingSpanRegex);
  if (matchUpcomingSpan) {
    const rawNum = matchUpcomingSpan[1] || '1';
    const num = /^\d+$/.test(rawNum) ? parseInt(rawNum, 10) : (ITALIAN_NUMBER_WORDS[rawNum] || 1);
    const unit = matchUpcomingSpan[2].toLowerCase();

    let days = 7;
    if (unit.startsWith('giorn')) days = num;
    else if (unit.startsWith('settiman')) days = num * 7;
    else if (unit.startsWith('mes')) days = num * 30;

    const startTs = currentTs;
    const endTs = currentTs + days * 86400000;

    return {
      hasTemporalFilter: true,
      filterType: 'relative_time_span',
      label: `Prossimi ${days} giorni (a partire da ${formatItalianDate(currentComp.year, currentComp.month, currentComp.day)})`,
      startTs,
      endTs,
      includeOnlyUpcoming: true,
    };
  }

  // 7. FASI STAGIONALI (Andata, Ritorno, Amichevoli Estive)
  if (/\b(girone\s+d['’]andata|fase\s+d['’]andata|girone\s+andata)\b/i.test(text)) {
    const year = currentComp.year;
    return {
      hasTemporalFilter: true,
      filterType: 'season_phase',
      label: "Girone d'Andata (Luglio - Dicembre)",
      startTs: new Date(year, 6, 1, 0, 0, 0).getTime(),
      endTs: new Date(year, 11, 31, 23, 59, 59).getTime(),
    };
  }

  if (/\b(girone\s+di\s+ritorno|fase\s+di\s+ritorno|girone\s+ritorno)\b/i.test(text)) {
    const nextYear = currentComp.month >= 6 ? currentComp.year + 1 : currentComp.year;
    return {
      hasTemporalFilter: true,
      filterType: 'season_phase',
      label: 'Girone di Ritorno (Gennaio - Giugno)',
      startTs: new Date(nextYear, 0, 1, 0, 0, 0).getTime(),
      endTs: new Date(nextYear, 5, 30, 23, 59, 59).getTime(),
    };
  }

  if (/\b(amichevol[ie]|pre-campionato|precampionato|estate|estive)\b/i.test(text)) {
    const year = currentComp.year;
    return {
      hasTemporalFilter: true,
      filterType: 'season_phase',
      label: 'Pre-Campionato & Amichevoli Estive (Luglio - Agosto)',
      startTs: new Date(year, 6, 1, 0, 0, 0).getTime(),
      endTs: new Date(year, 7, 31, 23, 59, 59).getTime(),
    };
  }

  // 8. CONTEGGI ESPLICITI (es. "ultime 5 partite", "ultime 10 gare", "prossime 4 partite")
  const countRegex = /\b(ultim[ae]|prossim[ae])\s+(\d+|un[oa]?|due|tre|quattro|cinque|sei|sette|otto|nove|dieci)\s*(?:partit[ae]|gar[ae]|match|incontr[io]|sfid[ae])\b/i;
  const matchCount = text.match(countRegex);
  if (matchCount) {
    const isUpcoming = matchCount[1].toLowerCase().startsWith('prossim');
    const rawVal = matchCount[2].toLowerCase();
    const count = /^\d+$/.test(rawVal) ? parseInt(rawVal, 10) : (ITALIAN_NUMBER_WORDS[rawVal] || 5);
    return {
      hasTemporalFilter: true,
      filterType: 'explicit_count',
      label: `${isUpcoming ? 'Prossime' : 'Ultime'} ${count} partite`,
      explicitCount: count,
      includeOnlyUpcoming: isUpcoming,
      includeOnlyPlayed: !isUpcoming,
    };
  }

  return null;
}

/**
 * Filtra e ordina le partite in base al filtro temporale estratto,
 * garantendo che OGNI partita restituita contenga i dati completi:
 * score, outcome, scorers (marcatori), tacticalNotes (note tattiche).
 */
export function filterFixturesByTemporalRange(
  fixtures: Fixture[] = [],
  filter: TemporalFixturesFilter | null,
  currentDateStr?: string
): any[] {
  if (!Array.isArray(fixtures) || fixtures.length === 0) return [];

  // Mappa completa con tutti i dettagli essenziali
  const fullFixtures = fixtures.map((f) => {
    const res = safeResolveFixtureResult(f);
    const ts = parseFixtureDate(f.date);
    const isPlayed = f.status === 'Giocata' || Boolean(f.score) || Boolean((f as any).played) || Boolean(res?.isPlayed);

    return {
      id: f.id,
      date: f.date,
      opponent: f.opponent,
      venue: f.venue,
      competition: f.competition,
      status: f.status,
      score: f.score || undefined,
      outcome: res?.outcome || f.outcome || undefined,
      scorers: Array.isArray(f.scorers) && f.scorers.length > 0 ? f.scorers : undefined,
      tacticalNotes: f.tacticalNotes && f.tacticalNotes.trim().length > 0 ? f.tacticalNotes.trim() : undefined,
      importance: f.importance || undefined,
      _ts: ts,
      _isPlayed: isPlayed,
    };
  });

  // Ordina cronologicamente
  const sorted = [...fullFixtures].sort((a, b) => a._ts - b._ts);

  // Se non c'è filtro temporale specifico
  if (!filter || !filter.hasTemporalFilter) {
    // Default smart: ultime 5 giocate + prossime 3/4 in programma
    const played = sorted.filter(f => f._isPlayed);
    const upcoming = sorted.filter(f => !f._isPlayed);
    return [
      ...played.slice(-5),
      ...upcoming.slice(0, 4)
    ].map(cleanInternalFields);
  }

  // 1. TUTTA LA STAGIONE (tutte le gare giocate)
  if (filter.filterType === 'all_season_played' || filter.allPlayed) {
    const played = sorted.filter(f => f._isPlayed);
    return (played.length > 0 ? played : sorted).map(cleanInternalFields);
  }

  // 2. CONTEGGI ESPLICITI (es. Ultime 5 / Prossime 4)
  if (filter.filterType === 'explicit_count' && filter.explicitCount) {
    const count = filter.explicitCount;
    if (filter.includeOnlyUpcoming) {
      const upcoming = sorted.filter(f => !f._isPlayed);
      return upcoming.slice(0, count).map(cleanInternalFields);
    } else {
      const played = sorted.filter(f => f._isPlayed);
      return played.slice(-count).map(cleanInternalFields);
    }
  }

  // 3. FILTRO TEMPORALE A RANGE (StartTs .. EndTs)
  if (filter.startTs !== undefined && filter.endTs !== undefined) {
    const inRange = sorted.filter(f => {
      if (f._ts === 0 || f._ts === 9999999999999) return false;
      return f._ts >= filter.startTs! && f._ts <= filter.endTs!;
    });

    if (inRange.length > 0) {
      if (filter.includeOnlyPlayed) {
        const playedInRange = inRange.filter(f => f._isPlayed);
        if (playedInRange.length > 0) return playedInRange.map(cleanInternalFields);
      }
      if (filter.includeOnlyUpcoming) {
        const upcomingInRange = inRange.filter(f => !f._isPlayed);
        if (upcomingInRange.length > 0) return upcomingInRange.map(cleanInternalFields);
      }
      return inRange.map(cleanInternalFields);
    }
  }

  // Fallback se il range non ha restituito partite (es. mese senza gare a calendario):
  // Ritorna le partite più vicine al periodo richiesto
  const played = sorted.filter(f => f._isPlayed);
  const upcoming = sorted.filter(f => !f._isPlayed);
  return [
    ...played.slice(-5),
    ...upcoming.slice(0, 4)
  ].map(cleanInternalFields);
}

function cleanInternalFields(f: any): any {
  const { _ts, _isPlayed, ...rest } = f;
  return rest;
}
