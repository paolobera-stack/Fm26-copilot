import { Fixture } from '../types';

const ITALIAN_MONTHS_MAP: Record<string, number> = {
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

export const ITALIAN_MONTHS = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre',
] as const;

export const ITALIAN_WEEKDAYS = [
  'Domenica',
  'Lunedì',
  'Martedì',
  'Mercoledì',
  'Giovedì',
  'Venerdì',
  'Sabato',
] as const;

export const ITALIAN_WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'] as const;

/**
 * Returns exact number of days in a given month of a specific year (handles leap years).
 * month is 0-indexed (0 = Gennaio, 11 = Dicembre).
 */
export function getDaysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Checks if year, month, day represent a valid Gregorian calendar date.
 */
export function isValidCalendarDate(year: number, monthIndex: number, day: number): boolean {
  if (year < 1970 || year > 2100) return false;
  if (monthIndex < 0 || monthIndex > 11) return false;
  const maxDays = getDaysInMonth(year, monthIndex);
  return day >= 1 && day <= maxDays;
}

/**
 * Formats year, month (0-11), day (1-31) into Italian standard "D Mese YYYY"
 */
export function formatItalianDate(year: number, monthIndex: number, day: number): string {
  const safeMonth = Math.max(0, Math.min(11, monthIndex));
  const monthName = ITALIAN_MONTHS[safeMonth];
  return `${day} ${monthName} ${year}`;
}

/**
 * Formats into "GiornoSettimana, D Mese YYYY" (e.g. "Mercoledì, 28 Ottobre 2026")
 */
export function formatItalianDateWithWeekday(year: number, monthIndex: number, day: number): string {
  const d = new Date(year, monthIndex, day);
  const weekdayName = ITALIAN_WEEKDAYS[d.getDay()];
  return `${weekdayName}, ${formatItalianDate(year, monthIndex, day)}`;
}

/**
 * Parses any date string and extracts { year, month (0-11), day }
 */
export function parseDateComponents(dateStr: string): { year: number; month: number; day: number } | null {
  if (!dateStr || typeof dateStr !== 'string') return null;

  const clean = dateStr.trim().toLowerCase();

  // Pattern 1: Day + Month Name (Italian or English) + optional Year (e.g. "28 Ottobre 2026", "1 Luglio 2026")
  const matchNamedMonth = clean.match(/(?:[a-z]{2,4}\.?\s+)?(\d{1,2})\s+([a-zàèéìòù]+)(?:\s+(\d{2,4}))?/i);
  if (matchNamedMonth) {
    const day = parseInt(matchNamedMonth[1], 10);
    const monthKey = matchNamedMonth[2].toLowerCase();
    let year = matchNamedMonth[3] ? parseInt(matchNamedMonth[3], 10) : 2026;
    if (year < 100) year += 2000;

    if (ITALIAN_MONTHS_MAP[monthKey] !== undefined) {
      const month = ITALIAN_MONTHS_MAP[monthKey];
      return { year, month, day };
    }
  }

  // Pattern 2: DD/MM/YYYY or DD-MM-YYYY
  const matchNumericDMY = clean.match(/(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?/);
  if (matchNumericDMY) {
    const day = parseInt(matchNumericDMY[1], 10);
    const month = parseInt(matchNumericDMY[2], 10) - 1;
    let year = matchNumericDMY[3] ? parseInt(matchNumericDMY[3], 10) : 2026;
    if (year < 100) year += 2000;
    return { year, month, day };
  }

  // Pattern 3: YYYY-MM-DD
  const matchISO = clean.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (matchISO) {
    const year = parseInt(matchISO[1], 10);
    const month = parseInt(matchISO[2], 10) - 1;
    const day = parseInt(matchISO[3], 10);
    return { year, month, day };
  }

  const ts = Date.parse(dateStr);
  if (!isNaN(ts)) {
    const d = new Date(ts);
    return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
  }

  return null;
}

/**
 * Calculates calendar grid days for a given month/year starting on Monday.
 */
export interface CalendarGridDay {
  day: number;
  monthIndex: number;
  year: number;
  isCurrentMonth: boolean;
  dateString: string;
}

export function buildMonthGrid(year: number, monthIndex: number): CalendarGridDay[] {
  const daysInMonth = getDaysInMonth(year, monthIndex);
  const firstDay = new Date(year, monthIndex, 1);
  // getDay(): 0 = Sun, 1 = Mon ... 6 = Sat -> Mon = 0, Sun = 6
  let firstDayCol = firstDay.getDay() - 1;
  if (firstDayCol === -1) firstDayCol = 6;

  const grid: CalendarGridDay[] = [];

  // Previous month padding
  const prevMonthIndex = monthIndex === 0 ? 11 : monthIndex - 1;
  const prevMonthYear = monthIndex === 0 ? year - 1 : year;
  const daysInPrevMonth = getDaysInMonth(prevMonthYear, prevMonthIndex);

  for (let i = firstDayCol - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i;
    grid.push({
      day: dayNum,
      monthIndex: prevMonthIndex,
      year: prevMonthYear,
      isCurrentMonth: false,
      dateString: formatItalianDate(prevMonthYear, prevMonthIndex, dayNum),
    });
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    grid.push({
      day: d,
      monthIndex,
      year,
      isCurrentMonth: true,
      dateString: formatItalianDate(year, monthIndex, d),
    });
  }

  // Next month padding to fill out 7-day rows
  const remaining = (7 - (grid.length % 7)) % 7;
  const nextMonthIndex = monthIndex === 11 ? 0 : monthIndex + 1;
  const nextMonthYear = monthIndex === 11 ? year + 1 : year;

  for (let d = 1; d <= remaining; d++) {
    grid.push({
      day: d,
      monthIndex: nextMonthIndex,
      year: nextMonthYear,
      isCurrentMonth: false,
      dateString: formatItalianDate(nextMonthYear, nextMonthIndex, d),
    });
  }

  return grid;
}

/**
 * Calculates the difference in full days between fromDate and toDate (toDate - fromDate).
 */
export function getDaysDifference(fromDateStr: string, toDateStr: string): number | null {
  const tFrom = parseFixtureDate(fromDateStr);
  const tTo = parseFixtureDate(toDateStr);
  if (tFrom === 9999999999999 || tTo === 9999999999999) return null;

  const dFrom = new Date(tFrom);
  const dTo = new Date(tTo);
  const utcA = Date.UTC(dFrom.getFullYear(), dFrom.getMonth(), dFrom.getDate());
  const utcB = Date.UTC(dTo.getFullYear(), dTo.getMonth(), dTo.getDate());

  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((utcB - utcA) / msPerDay);
}

/**
 * Formats relative day difference into clear Italian text
 */
export function formatRelativeDays(diff: number): string {
  if (diff === 0) return 'Oggi';
  if (diff === 1) return 'Domani';
  if (diff === 2) return 'Dopodomani';
  if (diff === -1) return 'Ieri';
  if (diff === -2) return "L'altro ieri";
  if (diff > 0) return `Tra ${diff} giorni`;
  return `${Math.abs(diff)} giorni fa`;
}

/**
 * Given the current in-game date and the list of fixtures:
 * Returns contextual insights (next upcoming match, last played, countdown, matchday today).
 */
export function getContextualFixtures(fixtures: Fixture[], currentDateStr: string) {
  const sorted = sortFixturesByDate(fixtures);
  const currentTs = parseFixtureDate(currentDateStr);

  const currentComp = parseDateComponents(currentDateStr);
  const currentFormatted = currentComp
    ? formatItalianDate(currentComp.year, currentComp.month, currentComp.day)
    : currentDateStr;

  // Matches today
  const matchesToday = sorted.filter((f) => {
    const fComp = parseDateComponents(f.date);
    if (!fComp || !currentComp) return f.date.trim().toLowerCase() === currentDateStr.trim().toLowerCase();
    return (
      fComp.year === currentComp.year &&
      fComp.month === currentComp.month &&
      fComp.day === currentComp.day
    );
  });

  // Fixtures on or after current in-game date
  const upcomingOrToday = sorted.filter((f) => parseFixtureDate(f.date) >= currentTs);

  // Next fixture: the earliest upcoming match that is unplayed ("In Arrivo").
  // If all upcoming matches are marked played, pick the earliest upcoming fixture.
  // If there are NO matches on or after currentTs (e.g. season ended or date is past all fixtures),
  // return null so it doesn't falsely grab an ancient fixture from the past.
  const nextFixture =
    upcomingOrToday.find((f) => f.status === 'In Arrivo') ||
    upcomingOrToday[0] ||
    null;

  // Last played fixture: the latest played fixture on or before currentTs.
  const pastOrToday = sorted.filter((f) => parseFixtureDate(f.date) <= currentTs);
  const pastPlayed = pastOrToday.filter((f) => f.status === 'Giocata');
  const lastPlayedFixture = pastPlayed.length > 0
    ? pastPlayed[pastPlayed.length - 1]
    : null;

  const daysToNext = nextFixture ? getDaysDifference(currentFormatted, nextFixture.date) : null;
  const daysSinceLast = lastPlayedFixture ? getDaysDifference(lastPlayedFixture.date, currentFormatted) : null;

  return {
    sorted,
    matchesToday,
    isMatchDayToday: matchesToday.length > 0,
    nextFixture,
    lastPlayedFixture,
    daysToNext,
    daysSinceLast,
  };
}

/**
 * Calculates the exact chronological position where the current in-game date
 * should be placed in a list of sorted fixtures.
 * Returns the index (0 <= index <= sortedFixtures.length) before which the marker should appear.
 */
export function findCalendarMarkerIndex(sortedFixtures: Fixture[], currentDateStr: string): number {
  if (!sortedFixtures || sortedFixtures.length === 0) return 0;
  const currentTs = parseFixtureDate(currentDateStr);
  const idx = sortedFixtures.findIndex((f) => parseFixtureDate(f.date) >= currentTs);
  return idx === -1 ? sortedFixtures.length : idx;
}

/**
 * Returns football transfer window status based on current in-game date
 */
export function getTransferMarketStatus(currentDateStr: string): {
  isOpen: boolean;
  windowName: 'Estiva' | 'Invernale' | 'Chiusa';
  label: string;
  daysRemainingOrUntilNext?: number;
} {
  const comp = parseDateComponents(currentDateStr);
  if (!comp) {
    return { isOpen: false, windowName: 'Chiusa', label: 'Mercato Chiuso' };
  }

  const { year, month, day } = comp;

  // Summer window: 1 Luglio (month 6) to 1 Settembre (month 8, day 1)
  const isSummer = month === 6 || month === 7 || (month === 8 && day <= 1);
  if (isSummer) {
    const endSummerStr = formatItalianDate(year, 8, 1);
    const remaining = getDaysDifference(currentDateStr, endSummerStr);
    return {
      isOpen: true,
      windowName: 'Estiva',
      label: 'Sessione Estiva Aperta',
      daysRemainingOrUntilNext: remaining !== null ? Math.max(0, remaining) : undefined,
    };
  }

  // Winter window: 1 Gennaio (month 0) to 1 Febbraio (month 1, day 1)
  const isWinter = month === 0 || (month === 1 && day <= 1);
  if (isWinter) {
    const endWinterStr = formatItalianDate(year, 1, 1);
    const remaining = getDaysDifference(currentDateStr, endWinterStr);
    return {
      isOpen: true,
      windowName: 'Invernale',
      label: 'Sessione Invernale Aperta',
      daysRemainingOrUntilNext: remaining !== null ? Math.max(0, remaining) : undefined,
    };
  }

  // Closed
  let nextDateStr = '';
  let nextWindowName = '';
  if (month < 6) {
    nextDateStr = formatItalianDate(year, 6, 1);
    nextWindowName = 'Estiva';
  } else {
    nextDateStr = formatItalianDate(year + 1, 0, 1);
    nextWindowName = 'Invernale';
  }

  const daysUntil = getDaysDifference(currentDateStr, nextDateStr);
  return {
    isOpen: false,
    windowName: 'Chiusa',
    label: `Mercato Chiuso (Apertura: ${nextWindowName})`,
    daysRemainingOrUntilNext: daysUntil !== null ? Math.max(0, daysUntil) : undefined,
  };
}


/**
 * Parses any date string (e.g. "28 Ottobre 2026", "28/10/2026", "2026-10-28", "Sab 5 Nov 2026")
 * into a unix timestamp for precise chronological sorting.
 */
export function parseFixtureDate(dateStr: string): number {
  if (!dateStr || typeof dateStr !== 'string') return 0;

  const clean = dateStr.trim().toLowerCase();

  // Pattern 1: Day + Month Name (Italian or English) + optional Year (e.g. "28 Ottobre 2026", "5 Nov 2026", "Sab 12 Dicembre 2026")
  const matchNamedMonth = clean.match(/(?:[a-z]{2,4}\.?\s+)?(\d{1,2})\s+([a-zàèéìòù]+)(?:\s+(\d{2,4}))?/i);
  if (matchNamedMonth) {
    const day = parseInt(matchNamedMonth[1], 10);
    const monthKey = matchNamedMonth[2].toLowerCase();
    let year = matchNamedMonth[3] ? parseInt(matchNamedMonth[3], 10) : 2026;
    if (year < 100) year += 2000;

    if (ITALIAN_MONTHS_MAP[monthKey] !== undefined) {
      const month = ITALIAN_MONTHS_MAP[monthKey];
      return new Date(year, month, day).getTime();
    }
  }

  // Pattern 2: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const matchNumericDMY = clean.match(/(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?/);
  if (matchNumericDMY) {
    const day = parseInt(matchNumericDMY[1], 10);
    const month = parseInt(matchNumericDMY[2], 10) - 1;
    let year = matchNumericDMY[3] ? parseInt(matchNumericDMY[3], 10) : 2026;
    if (year < 100) year += 2000;
    return new Date(year, month, day).getTime();
  }

  // Pattern 3: YYYY-MM-DD
  const matchISO = clean.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (matchISO) {
    const year = parseInt(matchISO[1], 10);
    const month = parseInt(matchISO[2], 10) - 1;
    const day = parseInt(matchISO[3], 10);
    return new Date(year, month, day).getTime();
  }

  // Fallback
  const parsed = Date.parse(dateStr);
  if (!isNaN(parsed)) return parsed;

  return 9999999999999;
}

/**
 * Sorts fixtures in chronological order by match date.
 */
export function sortFixturesByDate(fixtures: Fixture[]): Fixture[] {
  return [...fixtures].sort((a, b) => {
    const timeA = parseFixtureDate(a.date);
    const timeB = parseFixtureDate(b.date);
    return timeA - timeB;
  });
}
