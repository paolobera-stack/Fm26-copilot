import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Check,
  X,
  Clock,
  ChevronLeft,
  ChevronRight,
  Trophy,
  FastForward,
  RotateCcw,
  Sparkles,
  ShoppingBag,
  Info,
} from 'lucide-react';
import { Fixture } from '../types';
import {
  ITALIAN_MONTHS,
  ITALIAN_WEEKDAYS_SHORT,
  buildMonthGrid,
  formatItalianDate,
  formatItalianDateWithWeekday,
  parseDateComponents,
  getDaysDifference,
  formatRelativeDays,
  getContextualFixtures,
  getTransferMarketStatus,
} from '../utils/dateUtils';

interface EditAppDateModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDate: string;
  onSaveDate: (newDate: string) => void;
  latestFixtureDate?: string;
  fixtures?: Fixture[];
}

export const EditAppDateModal: React.FC<EditAppDateModalProps> = ({
  isOpen,
  onClose,
  currentDate,
  onSaveDate,
  latestFixtureDate,
  fixtures = [],
}) => {
  // Parse current in-game date components
  const parsedCurrent = useMemo(() => {
    const parsed = parseDateComponents(currentDate);
    if (parsed) return parsed;
    return { year: 2026, month: 9, day: 28 };
  }, [currentDate]);

  // Selected date state (actual real calendar date)
  const [selectedYear, setSelectedYear] = useState<number>(parsedCurrent.year);
  const [selectedMonth, setSelectedMonth] = useState<number>(parsedCurrent.month);
  const [selectedDay, setSelectedDay] = useState<number>(parsedCurrent.day);

  // Sync state whenever modal opens
  useEffect(() => {
    if (isOpen) {
      const p = parseDateComponents(currentDate) || { year: 2026, month: 9, day: 28 };
      setSelectedYear(p.year);
      setSelectedMonth(p.month);
      setSelectedDay(p.day);
    }
  }, [isOpen, currentDate]);

  // Build real month grid (Monday to Sunday)
  const monthGrid = useMemo(() => {
    return buildMonthGrid(selectedYear, selectedMonth);
  }, [selectedYear, selectedMonth]);

  // Dynamic available calendar years (from base - 2 to base + 10)
  const availableCalendarYears = useMemo(() => {
    const base = parsedCurrent.year;
    const list: number[] = [];
    const min = Math.min(base - 2, selectedYear);
    const max = Math.max(base + 10, selectedYear);
    for (let y = min; y <= max; y++) {
      list.push(y);
    }
    return list;
  }, [parsedCurrent.year, selectedYear]);

  // Map fixtures by formatted date for fast lookup
  const fixturesByDate = useMemo(() => {
    const map = new Map<string, Fixture[]>();
    fixtures.forEach((f) => {
      const comp = parseDateComponents(f.date);
      if (comp) {
        const key = `${comp.year}-${comp.month}-${comp.day}`;
        const existing = map.get(key) || [];
        existing.push(f);
        map.set(key, existing);
      }
    });
    return map;
  }, [fixtures]);

  // Contextual fixtures insights
  const { nextFixture, lastPlayedFixture } = useMemo(() => {
    return getContextualFixtures(fixtures, currentDate);
  }, [fixtures, currentDate]);

  if (!isOpen) return null;

  // Currently selected date string formatted
  const selectedDateStr = formatItalianDate(selectedYear, selectedMonth, selectedDay);
  const selectedDateFullWeekday = formatItalianDateWithWeekday(selectedYear, selectedMonth, selectedDay);
  const daysDiffFromAppCurrent = getDaysDifference(currentDate, selectedDateStr);

  // Matches on currently selected date
  const matchesOnSelectedDate = fixturesByDate.get(`${selectedYear}-${selectedMonth}-${selectedDay}`) || [];

  // Transfer market status for the selected date
  const marketStatus = getTransferMarketStatus(selectedDateStr);

  // Navigation handlers
  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedYear((y) => y - 1);
      setSelectedMonth(11);
    } else {
      setSelectedMonth((m) => m - 1);
    }
    setSelectedDay(1);
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedYear((y) => y + 1);
      setSelectedMonth(0);
    } else {
      setSelectedMonth((m) => m + 1);
    }
    setSelectedDay(1);
  };

  const handleSelectDay = (year: number, month: number, day: number) => {
    setSelectedYear(year);
    setSelectedMonth(month);
    setSelectedDay(day);
  };

  const handleAdvanceDays = (days: number) => {
    const d = new Date(selectedYear, selectedMonth, selectedDay);
    d.setDate(d.getDate() + days);
    setSelectedYear(d.getFullYear());
    setSelectedMonth(d.getMonth());
    setSelectedDay(d.getDate());
  };

  const handleJumpToFixture = (fixture: Fixture) => {
    const comp = parseDateComponents(fixture.date);
    if (comp) {
      setSelectedYear(comp.year);
      setSelectedMonth(comp.month);
      setSelectedDay(comp.day);
    }
  };

  const handleResetToCurrent = () => {
    setSelectedYear(parsedCurrent.year);
    setSelectedMonth(parsedCurrent.month);
    setSelectedDay(parsedCurrent.day);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveDate(selectedDateStr);
    onClose();
  };

  // Predefined realistic Football Season Milestones for the active year
  const seasonMilestones = [
    { label: '☀️ Inizio Pre-Stagione', day: 1, month: 6, year: selectedYear }, // 1 Luglio
    { label: '⚽ Inizio Campionato', day: 15, month: 7, year: selectedYear }, // 15 Agosto
    { label: '🔒 Chiusura Mercato Estivo', day: 1, month: 8, year: selectedYear }, // 1 Settembre
    { label: '❄️ Apertura Mercato Invernale', day: 1, month: 0, year: selectedYear + (selectedMonth >= 6 ? 1 : 0) }, // 1 Gennaio
    { label: '🏁 Fine Stagione & Coppe', day: 25, month: 4, year: selectedYear + (selectedMonth >= 6 ? 1 : 0) }, // 25 Maggio
  ];

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-slate-950 px-5 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20">
              <CalendarIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>Calendario Annuo FM26</span>
                <span className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 px-2 py-0.5 rounded-full">
                  Calendario Reale Effettivo
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Seleziona una data reale del calendario gregoriano per sincronizzare il gioco
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer border border-slate-800"
            title="Chiudi"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto space-y-5">
          {/* Quick Context Bar & Fixture shortcuts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {nextFixture && (
              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase text-indigo-400 block tracking-wider">
                    Prossima Partita in Programma
                  </span>
                  <p className="text-xs font-semibold text-slate-200 truncate mt-0.5">
                    vs {nextFixture.opponent} • {nextFixture.date}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleJumpToFixture(nextFixture)}
                  className="px-2.5 py-1 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-semibold shrink-0 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span>Salta a match</span>
                </button>
              </div>
            )}

            {lastPlayedFixture && (
              <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase text-emerald-400 block tracking-wider">
                    Ultimo Risultato Registrato
                  </span>
                  <p className="text-xs font-semibold text-slate-200 truncate mt-0.5">
                    vs {lastPlayedFixture.opponent} • {lastPlayedFixture.score || 'Giocata'} ({lastPlayedFixture.date})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleJumpToFixture(lastPlayedFixture)}
                  className="px-2.5 py-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold shrink-0 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span>Vedi data</span>
                </button>
              </div>
            )}
          </div>

          {/* Real Calendar Selector Component */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-inner">
            {/* Calendar Controls: Month & Year Selector */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800/80">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-800 transition-colors cursor-pointer"
                  title="Mese precedente"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="text-sm font-bold text-white min-w-[130px] text-center">
                  {ITALIAN_MONTHS[selectedMonth]} {selectedYear}
                </div>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg border border-slate-800 transition-colors cursor-pointer"
                  title="Mese successivo"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Year Selector & Month Quick Select */}
              <div className="flex items-center space-x-2">
                <select
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(parseInt(e.target.value, 10));
                    setSelectedDay(1);
                  }}
                  aria-label="Seleziona Mese"
                  className="bg-slate-900 text-slate-200 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-800 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  {ITALIAN_MONTHS.map((m, idx) => (
                    <option key={idx} value={idx}>
                      {m}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedYear}
                  onChange={(e) => {
                    setSelectedYear(parseInt(e.target.value, 10));
                    setSelectedDay(1);
                  }}
                  aria-label="Seleziona Anno"
                  className="bg-slate-900 text-slate-200 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-800 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  {availableCalendarYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Weekday headers (Monday - Sunday) */}
            <div className="grid grid-cols-7 gap-1 mb-2 text-center">
              {ITALIAN_WEEKDAYS_SHORT.map((wd, i) => (
                <div
                  key={i}
                  className={`text-[11px] font-bold uppercase tracking-wider py-1 ${
                    i >= 5 ? 'text-amber-400/80' : 'text-slate-400'
                  }`}
                >
                  {wd}
                </div>
              ))}
            </div>

            {/* Calendar Days Grid */}
            <div className="grid grid-cols-7 gap-1">
              {monthGrid.map((cell, idx) => {
                const isSelected =
                  cell.year === selectedYear &&
                  cell.monthIndex === selectedMonth &&
                  cell.day === selectedDay;

                const isCurrentInApp =
                  cell.year === parsedCurrent.year &&
                  cell.monthIndex === parsedCurrent.month &&
                  cell.day === parsedCurrent.day;

                const dayKey = `${cell.year}-${cell.monthIndex}-${cell.day}`;
                const fixturesOnDay = fixturesByDate.get(dayKey) || [];
                const hasFixture = fixturesOnDay.length > 0;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectDay(cell.year, cell.monthIndex, cell.day)}
                    className={`h-11 sm:h-12 relative rounded-xl flex flex-col items-center justify-center p-1 text-xs transition-all cursor-pointer border ${
                      isSelected
                        ? 'bg-emerald-600 text-white font-black border-emerald-400 shadow-lg shadow-emerald-950/40 ring-2 ring-emerald-500/30'
                        : isCurrentInApp
                        ? 'bg-amber-500/15 text-amber-300 font-bold border-amber-500/40 hover:bg-amber-500/25'
                        : cell.isCurrentMonth
                        ? 'bg-slate-900/90 text-slate-200 border-slate-800/80 hover:bg-slate-800 hover:border-slate-700'
                        : 'bg-slate-950/40 text-slate-600 border-transparent hover:text-slate-400'
                    }`}
                  >
                    <span className="text-xs">{cell.day}</span>

                    {/* Fixture Indicator Dot or Badge */}
                    {hasFixture && (
                      <div className="flex items-center gap-0.5 mt-0.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isSelected
                              ? 'bg-white'
                              : fixturesOnDay[0].status === 'Giocata'
                              ? 'bg-emerald-400'
                              : 'bg-indigo-400 animate-pulse'
                          }`}
                          title={`Partita: vs ${fixturesOnDay[0].opponent}`}
                        />
                      </div>
                    )}

                    {/* Current In-App Badge */}
                    {isCurrentInApp && !isSelected && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 border border-slate-950" title="Data attuale in-game" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Date Details Card */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Data Effettiva Selezionata
                </span>
                <p className="text-sm sm:text-base font-bold text-white mt-0.5 flex items-center gap-2">
                  <span>{selectedDateFullWeekday}</span>
                  {daysDiffFromAppCurrent === 0 ? (
                    <span className="text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-semibold">
                      Oggi in-game
                    </span>
                  ) : daysDiffFromAppCurrent !== null ? (
                    <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full font-medium">
                      {formatRelativeDays(daysDiffFromAppCurrent)}
                    </span>
                  ) : null}
                </p>
              </div>

              {/* Fast Advance Buttons */}
              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={() => handleAdvanceDays(1)}
                  className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium rounded-lg border border-slate-800 transition-colors"
                  title="Avanza di 1 giorno"
                >
                  +1 Giorno
                </button>
                <button
                  type="button"
                  onClick={() => handleAdvanceDays(7)}
                  className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium rounded-lg border border-slate-800 transition-colors"
                  title="Avanza di 1 settimana"
                >
                  +1 Settimana
                </button>
                <button
                  type="button"
                  onClick={handleResetToCurrent}
                  className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-amber-400 text-xs font-medium rounded-lg border border-slate-800 transition-colors flex items-center gap-1"
                  title="Reimposta sulla data in-game attuale"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Oggi</span>
                </button>
              </div>
            </div>

            {/* Match or Market Context */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {/* Match Day Info */}
              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 flex items-center space-x-2.5">
                <Trophy className={`w-4 h-4 shrink-0 ${matchesOnSelectedDate.length > 0 ? 'text-amber-400' : 'text-slate-500'}`} />
                <div className="min-w-0">
                  {matchesOnSelectedDate.length > 0 ? (
                    <div>
                      <span className="font-bold text-amber-300 block">
                        ⚽ Partita in Calendario: vs {matchesOnSelectedDate[0].opponent}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {matchesOnSelectedDate[0].competition} • {matchesOnSelectedDate[0].venue}
                        {matchesOnSelectedDate[0].score ? ` • Risultato: ${matchesOnSelectedDate[0].score}` : ''}
                      </span>
                    </div>
                  ) : (
                    <span className="text-slate-400">Nessuna gara in programma (Giorno di riposo/allenamento)</span>
                  )}
                </div>
              </div>

              {/* Transfer Market Status */}
              <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 flex items-center space-x-2.5">
                <ShoppingBag className={`w-4 h-4 shrink-0 ${marketStatus.isOpen ? 'text-emerald-400' : 'text-slate-500'}`} />
                <div className="min-w-0">
                  <span className={`font-semibold block ${marketStatus.isOpen ? 'text-emerald-300' : 'text-slate-300'}`}>
                    {marketStatus.label}
                  </span>
                  {marketStatus.daysRemainingOrUntilNext !== undefined && (
                    <span className="text-[11px] text-slate-400">
                      {marketStatus.isOpen
                        ? `Mancano ${marketStatus.daysRemainingOrUntilNext} giorni alla chiusura`
                        : `Prossima finestra tra ${marketStatus.daysRemainingOrUntilNext} giorni`}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Season Milestones Shortcuts */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-2">
              Scorciatoie Tappe Stagionali (FM26)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {seasonMilestones.map((m, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectDay(m.year, m.month, m.day)}
                  className="text-left text-xs bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white px-3 py-2 rounded-xl border border-slate-800 transition-colors"
                >
                  <span className="block font-medium truncate">{m.label}</span>
                  <span className="text-[10px] font-bold text-emerald-400">
                    {formatItalianDate(m.year, m.month, m.day)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="bg-slate-950 px-5 py-3.5 border-t border-slate-800 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-400 hidden sm:block">
            Data valida: <strong className="text-emerald-400">{selectedDateStr}</strong>
          </div>
          <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl text-xs font-semibold border border-slate-800 transition-colors cursor-pointer"
            >
              Annulla
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-950 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Conferma e Sincronizza Data</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
