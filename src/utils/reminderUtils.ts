import { DateReminder, TacticalNote } from '../types';
import { parseFixtureDate, getDaysDifference, parseDateComponents, formatItalianDate, ITALIAN_MONTHS } from './dateUtils';

export interface ActiveReminderItem {
  id: string;
  sourceType: 'reminder' | 'note';
  title: string;
  description?: string;
  targetDate: string;
  category: string;
  isDismissed: boolean;
  priority?: 'alta' | 'media' | 'bassa';
  relatedNoteId?: string;
  relatedPlayerName?: string;
  daysDifference: number; // 0 = today, >0 = overdue by X days, <0 = upcoming in X days
  status: 'due_today' | 'overdue' | 'upcoming';
}

/**
 * Checks if targetDate is reached or passed compared to currentDate.
 * (e.g. 1 Gennaio 2027 is reached if currentDate is 1 Gennaio 2027 or later).
 */
export function isReminderDue(targetDate: string, currentDate: string): boolean {
  if (!targetDate || !currentDate) return false;
  const targetTs = parseFixtureDate(targetDate);
  const currentTs = parseFixtureDate(currentDate);
  if (targetTs === 9999999999999 || currentTs === 9999999999999) return false;
  return currentTs >= targetTs;
}

/**
 * Calculates days between targetDate and currentDate.
 * Positive = overdue (currentDate is after targetDate)
 * 0 = exactly today
 * Negative = upcoming in future
 */
export function getReminderDaysDiff(targetDate: string, currentDate: string): number {
  if (!targetDate || !currentDate) return 0;
  const diff = getDaysDifference(targetDate, currentDate);
  return diff ?? 0;
}

/**
 * Formats a clear relative label for reminders
 */
export function formatReminderRelativeLabel(targetDate: string, currentDate: string, language: 'it' | 'en' = 'it'): {
  status: 'due_today' | 'overdue' | 'upcoming';
  label: string;
  days: number;
} {
  const daysDiff = getReminderDaysDiff(targetDate, currentDate);

  if (daysDiff === 0) {
    return {
      status: 'due_today',
      label: language === 'it' ? 'Scatta OGGI' : 'Due TODAY',
      days: 0,
    };
  } else if (daysDiff > 0) {
    return {
      status: 'overdue',
      label: language === 'it'
        ? (daysDiff === 1 ? 'Superata da ieri' : `Superata da ${daysDiff} giorni`)
        : (daysDiff === 1 ? 'Overdue by 1 day' : `Overdue by ${daysDiff} days`),
      days: daysDiff,
    };
  } else {
    const absDays = Math.abs(daysDiff);
    return {
      status: 'upcoming',
      label: language === 'it'
        ? (absDays === 1 ? 'Scade domani' : `Tra ${absDays} giorni`)
        : (absDays === 1 ? 'Due tomorrow' : `In ${absDays} days`),
      days: daysDiff,
    };
  }
}

/**
 * Combines standalone reminders and tactical notes with operational start dates,
 * returning the list of currently active reminders (targetDate <= currentDate and not dismissed).
 */
export function getActiveReminders(
  reminders: DateReminder[],
  notes: TacticalNote[],
  currentDate: string
): ActiveReminderItem[] {
  const activeList: ActiveReminderItem[] = [];

  // 1. Process dedicated reminders
  reminders.forEach((r) => {
    if (r.isDismissed || r.isCompleted) return;
    if (isReminderDue(r.targetDate, currentDate)) {
      const daysDiff = getReminderDaysDiff(r.targetDate, currentDate);
      activeList.push({
        id: r.id,
        sourceType: 'reminder',
        title: r.title,
        description: r.description,
        targetDate: r.targetDate,
        category: r.category,
        isDismissed: r.isDismissed,
        priority: r.priority || 'media',
        relatedNoteId: r.relatedNoteId,
        relatedPlayerName: r.relatedPlayerName,
        daysDifference: daysDiff,
        status: daysDiff === 0 ? 'due_today' : 'overdue',
      });
    }
  });

  // 2. Process tactical notes with operational start date
  notes.forEach((n) => {
    if (!n.operationalDate || n.isReminderActive === false || n.isReminderDismissed) return;
    if (isReminderDue(n.operationalDate, currentDate)) {
      const daysDiff = getReminderDaysDiff(n.operationalDate, currentDate);
      activeList.push({
        id: `note_rem_${n.id}`,
        sourceType: 'note',
        title: `[Nota Operativa] ${n.title}`,
        description: n.content,
        targetDate: n.operationalDate,
        category: n.category,
        isDismissed: Boolean(n.isReminderDismissed),
        priority: 'alta',
        relatedNoteId: n.id,
        daysDifference: daysDiff,
        status: daysDiff === 0 ? 'due_today' : 'overdue',
      });
    }
  });

  // Sort by priority (alta first), then by most recent/urgent
  return activeList.sort((a, b) => {
    const priorityWeight = (p?: string) => (p === 'alta' ? 3 : p === 'media' ? 2 : 1);
    const weightDiff = priorityWeight(b.priority) - priorityWeight(a.priority);
    if (weightDiff !== 0) return weightDiff;
    return b.daysDifference - a.daysDifference;
  });
}

/**
 * Gets upcoming reminders (future targetDate > currentDate)
 */
export function getUpcomingReminders(
  reminders: DateReminder[],
  notes: TacticalNote[],
  currentDate: string
): ActiveReminderItem[] {
  const upcomingList: ActiveReminderItem[] = [];

  reminders.forEach((r) => {
    if (r.isDismissed || r.isCompleted) return;
    if (!isReminderDue(r.targetDate, currentDate)) {
      const daysDiff = getReminderDaysDiff(r.targetDate, currentDate);
      upcomingList.push({
        id: r.id,
        sourceType: 'reminder',
        title: r.title,
        description: r.description,
        targetDate: r.targetDate,
        category: r.category,
        isDismissed: r.isDismissed,
        priority: r.priority || 'media',
        relatedNoteId: r.relatedNoteId,
        relatedPlayerName: r.relatedPlayerName,
        daysDifference: daysDiff,
        status: 'upcoming',
      });
    }
  });

  notes.forEach((n) => {
    if (!n.operationalDate || n.isReminderActive === false || n.isReminderDismissed) return;
    if (!isReminderDue(n.operationalDate, currentDate)) {
      const daysDiff = getReminderDaysDiff(n.operationalDate, currentDate);
      upcomingList.push({
        id: `note_rem_${n.id}`,
        sourceType: 'note',
        title: `[Nota Operativa] ${n.title}`,
        description: n.content,
        targetDate: n.operationalDate,
        category: n.category,
        isDismissed: Boolean(n.isReminderDismissed),
        priority: 'alta',
        relatedNoteId: n.id,
        daysDifference: daysDiff,
        status: 'upcoming',
      });
    }
  });

  return upcomingList.sort((a, b) => parseFixtureDate(a.targetDate) - parseFixtureDate(b.targetDate));
}

/**
 * Generate standard quick date presets dynamically based on current in-game date and year
 */
export function getCommonReminderDatePresets(currentDate: string): { label: string; date: string }[] {
  const comp = parseDateComponents(currentDate) || { year: 2026, month: 9, day: 28 };
  const currentYear = comp.year;
  const currentMonth = comp.month; // 0-indexed: 0 = Gen, 1 = Feb, 9 = Ott

  // Calculate target years based on the football season cycle
  // Gennaio (Aggiornamento Valori Giocatori & Calciomercato):
  // Se siamo tra luglio e dicembre (mesi 6-11), il prossimo gennaio è nell'anno successivo (currentYear + 1).
  // Se siamo a gennaio o inizio anno (mesi 0-5), il prossimo gennaio è currentYear + 1 solo se superato il 1° gen, oppure 1° gen dell'anno successivo per pianificare a lungo termine.
  const janYear = currentMonth >= 6 ? currentYear + 1 : currentYear;
  const febYear = currentMonth > 1 ? currentYear + 1 : currentYear;
  const mayYear = currentMonth > 4 ? currentYear + 1 : currentYear;
  const julYear = currentMonth > 6 ? currentYear + 1 : currentYear;

  const nextMonthIdx = (currentMonth + 1) % 12;
  const nextMonthYear = nextMonthIdx === 0 ? currentYear + 1 : currentYear;

  return [
    {
      label: `Inizio Prossimo Mese (1 ${formatItalianDate(nextMonthYear, nextMonthIdx, 1).split(' ').slice(1).join(' ')})`,
      date: formatItalianDate(nextMonthYear, nextMonthIdx, 1),
    },
    {
      label: `Inizio Gennaio (Aggiorna Valori Giocatori & Mercato - 1 Gen ${janYear})`,
      date: formatItalianDate(janYear, 0, 1),
    },
    {
      label: `Chiusura Mercato Invernale (1 Feb ${febYear})`,
      date: formatItalianDate(febYear, 1, 1),
    },
    {
      label: `Finale di Stagione (1 Maggio ${mayYear})`,
      date: formatItalianDate(mayYear, 4, 1),
    },
    {
      label: `Nuova Stagione (1 Luglio ${julYear})`,
      date: formatItalianDate(julYear, 6, 1),
    },
  ];
}

/**
 * Calculates available years for reminders dynamically based on in-game currentDate.
 * Generates an interval of 5 years from current in-game year (e.g. 2042 -> 2042..2047).
 * Also preserves any extra selected year if currently editing a legacy/out-of-range reminder.
 */
export function getAvailableReminderYears(currentDateStr: string, extraSelectedYear?: number): number[] {
  const comp = parseDateComponents(currentDateStr) || { year: 2026, month: 9, day: 28 };
  const currentYear = comp.year;
  const years: number[] = [];

  for (let y = currentYear; y <= currentYear + 5; y++) {
    years.push(y);
  }

  if (extraSelectedYear && !years.includes(extraSelectedYear)) {
    years.push(extraSelectedYear);
    years.sort((a, b) => a - b);
  }

  return years;
}

