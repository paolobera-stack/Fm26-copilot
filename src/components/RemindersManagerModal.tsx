import React, { useState, useMemo, useEffect } from 'react';
import {
  Bell,
  BellRing,
  BellOff,
  Plus,
  Calendar,
  Check,
  X,
  Clock,
  AlertTriangle,
  Edit3,
  Trash2,
  Tag,
  BookOpen,
  Users,
  Search,
  RotateCcw,
  Sparkles,
  ChevronRight,
  Filter
} from 'lucide-react';
import { DateReminder, TacticalNote, Player, ReminderCategory } from '../types';
import {
  getActiveReminders,
  getUpcomingReminders,
  formatReminderRelativeLabel,
  getCommonReminderDatePresets,
  getAvailableReminderYears,
  ActiveReminderItem
} from '../utils/reminderUtils';
import {
  parseDateComponents,
  formatItalianDate,
  formatItalianDateWithWeekday,
  ITALIAN_MONTHS
} from '../utils/dateUtils';
import { useLanguage } from '../i18n/LanguageContext';

interface RemindersManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentDate: string;
  reminders: DateReminder[];
  onUpdateReminders: (reminders: DateReminder[]) => void;
  notes: TacticalNote[];
  onUpdateNotes: (notes: TacticalNote[]) => void;
  players?: Player[];
  onGoToNotes?: () => void;
  initialTab?: 'active' | 'upcoming' | 'dismissed';
}

export const RemindersManagerModal: React.FC<RemindersManagerModalProps> = ({
  isOpen,
  onClose,
  currentDate,
  reminders,
  onUpdateReminders,
  notes,
  onUpdateNotes,
  players = [],
  onGoToNotes,
  initialTab = 'active'
}) => {
  const { language, t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'active' | 'upcoming' | 'dismissed'>(initialTab);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [editingReminder, setEditingReminder] = useState<DateReminder | null>(null);

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formTargetDate, setFormTargetDate] = useState(currentDate);
  const [formCategory, setFormCategory] = useState<ReminderCategory>('operativo');
  const [formPriority, setFormPriority] = useState<'alta' | 'media' | 'bassa'>('alta');
  const [formRelatedNoteId, setFormRelatedNoteId] = useState<string>('');
  const [formRelatedPlayerName, setFormRelatedPlayerName] = useState<string>('');

  // Date picker internal state for form
  const parsedCurrentForm = useMemo(() => {
    return parseDateComponents(formTargetDate) || parseDateComponents(currentDate) || { year: 2026, month: 9, day: 28 };
  }, [formTargetDate, currentDate]);

  const [formYear, setFormYear] = useState<number>(parsedCurrentForm.year);
  const [formMonth, setFormMonth] = useState<number>(parsedCurrentForm.month);
  const [formDay, setFormDay] = useState<number>(parsedCurrentForm.day);

  // Quick date presets
  const datePresets = useMemo(() => getCommonReminderDatePresets(currentDate), [currentDate]);

  // Dynamic available years based on in-game date (current year to current year + 5)
  const availableYears = useMemo(() => getAvailableReminderYears(currentDate, formYear), [currentDate, formYear]);

  // Active & Upcoming lists
  const activeItems = useMemo(() => {
    return getActiveReminders(reminders, notes, currentDate);
  }, [reminders, notes, currentDate]);

  const upcomingItems = useMemo(() => {
    return getUpcomingReminders(reminders, notes, currentDate);
  }, [reminders, notes, currentDate]);

  // Dismissed items
  const dismissedReminders = useMemo(() => {
    return reminders.filter((r) => r.isDismissed || r.isCompleted);
  }, [reminders]);

  const dismissedNotes = useMemo(() => {
    return notes.filter((n) => n.operationalDate && n.isReminderDismissed);
  }, [notes]);

  useEffect(() => {
    if (isOpen && !editingReminder && !isCreatingNew) {
      setFormTargetDate(currentDate);
      const parsed = parseDateComponents(currentDate) || { year: 2026, month: 9, day: 28 };
      setFormYear(parsed.year);
      setFormMonth(parsed.month);
      setFormDay(parsed.day);
    }
  }, [isOpen, currentDate, editingReminder, isCreatingNew]);

  if (!isOpen) return null;

  const handleOpenCreateForm = () => {
    setEditingReminder(null);
    setFormTitle('');
    setFormDescription('');
    setFormTargetDate(currentDate);
    const parsed = parseDateComponents(currentDate) || { year: 2026, month: 9, day: 28 };
    setFormYear(parsed.year);
    setFormMonth(parsed.month);
    setFormDay(parsed.day);
    setFormCategory('operativo');
    setFormPriority('alta');
    setFormRelatedNoteId('');
    setFormRelatedPlayerName('');
    setIsCreatingNew(true);
  };

  const handleOpenEditForm = (reminder: DateReminder) => {
    setEditingReminder(reminder);
    setFormTitle(reminder.title);
    setFormDescription(reminder.description || '');
    setFormTargetDate(reminder.targetDate);
    const parsed = parseDateComponents(reminder.targetDate) || { year: 2026, month: 9, day: 28 };
    setFormYear(parsed.year);
    setFormMonth(parsed.month);
    setFormDay(parsed.day);
    setFormCategory(reminder.category);
    setFormPriority(reminder.priority || 'media');
    setFormRelatedNoteId(reminder.relatedNoteId || '');
    setFormRelatedPlayerName(reminder.relatedPlayerName || '');
    setIsCreatingNew(true);
  };

  const handleDateComponentChange = (newYear: number, newMonth: number, newDay: number) => {
    setFormYear(newYear);
    setFormMonth(newMonth);
    setFormDay(newDay);
    const formatted = formatItalianDate(newYear, newMonth, newDay);
    setFormTargetDate(formatted);
  };

  const handleSelectPreset = (presetDate: string) => {
    setFormTargetDate(presetDate);
    const parsed = parseDateComponents(presetDate);
    if (parsed) {
      setFormYear(parsed.year);
      setFormMonth(parsed.month);
      setFormDay(parsed.day);
    }
  };

  const handleSaveReminder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    const formattedTarget = formatItalianDate(formYear, formMonth, formDay);

    if (editingReminder) {
      const updated = reminders.map((r) =>
        r.id === editingReminder.id
          ? {
              ...r,
              title: formTitle.trim(),
              description: formDescription.trim() || undefined,
              targetDate: formattedTarget,
              category: formCategory,
              priority: formPriority,
              relatedNoteId: formRelatedNoteId || undefined,
              relatedPlayerName: formRelatedPlayerName || undefined,
            }
          : r
      );
      onUpdateReminders(updated);
    } else {
      const newReminder: DateReminder = {
        id: `rem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        targetDate: formattedTarget,
        category: formCategory,
        priority: formPriority,
        isDismissed: false,
        createdAt: currentDate,
        relatedNoteId: formRelatedNoteId || undefined,
        relatedPlayerName: formRelatedPlayerName || undefined,
      };
      onUpdateReminders([newReminder, ...reminders]);
    }

    setIsCreatingNew(false);
    setEditingReminder(null);
  };

  const handleDismissItem = (id: string, sourceType: 'reminder' | 'note') => {
    if (sourceType === 'reminder') {
      const updated = reminders.map((r) =>
        r.id === id ? { ...r, isDismissed: true, dismissedAt: currentDate } : r
      );
      onUpdateReminders(updated);
    } else if (sourceType === 'note') {
      const noteId = id.replace('note_rem_', '');
      const updated = notes.map((n) =>
        n.id === noteId ? { ...n, isReminderDismissed: true, reminderDismissedAt: currentDate } : n
      );
      onUpdateNotes(updated);
    }
  };

  const handleReactivateItem = (id: string, sourceType: 'reminder' | 'note') => {
    if (sourceType === 'reminder') {
      const updated = reminders.map((r) =>
        r.id === id ? { ...r, isDismissed: false, isCompleted: false, dismissedAt: undefined } : r
      );
      onUpdateReminders(updated);
    } else if (sourceType === 'note') {
      const noteId = id.replace('note_rem_', '');
      const updated = notes.map((n) =>
        n.id === noteId ? { ...n, isReminderDismissed: false, reminderDismissedAt: undefined } : n
      );
      onUpdateNotes(updated);
    }
  };

  const handleDeleteReminder = (id: string) => {
    onUpdateReminders(reminders.filter((r) => r.id !== id));
  };

  const categoryLabels: Record<ReminderCategory, { label: string; color: string }> = {
    operativo: { label: language === 'it' ? 'Operativo' : 'Operational', color: 'indigo' },
    scadenza: { label: language === 'it' ? 'Scadenza' : 'Deadline', color: 'rose' },
    calciomercato: { label: language === 'it' ? 'Calciomercato' : 'Transfers', color: 'amber' },
    giocatori: { label: language === 'it' ? 'Gestione Rosa' : 'Squad Management', color: 'emerald' },
    tattica: { label: language === 'it' ? 'Tattica' : 'Tactics', color: 'sky' },
    varie: { label: language === 'it' ? 'Varie' : 'General', color: 'purple' },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  {t('reminders.title')}
                </h2>
                {activeItems.length > 0 && (
                  <span className="bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs px-2 py-0.5 rounded-full font-bold animate-pulse">
                    {activeItems.length} {language === 'it' ? 'ATTIVI' : 'ACTIVE'}
                  </span>
                )}
              </div>
              <p className="text-slate-400 text-xs mt-0.5">
                {t('reminders.subtitle')} •{' '}
                <span className="text-emerald-400 font-semibold">{currentDate}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isCreatingNew && (
              <button
                onClick={handleOpenCreateForm}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{t('reminders.newReminder')}</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Create / Edit Form Modal Screen */}
        {isCreatingNew ? (
          <div className="p-5 overflow-y-auto flex-1 bg-slate-900/90">
            <div className="max-w-2xl mx-auto space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <span>{editingReminder ? t('reminders.editReminder') : t('reminders.newReminder')}</span>
                </h3>
                <button
                  onClick={() => setIsCreatingNew(false)}
                  className="text-slate-400 hover:text-white text-xs"
                >
                  {language === 'it' ? 'Annulla' : 'Cancel'}
                </button>
              </div>

              <form onSubmit={handleSaveReminder} className="space-y-4 text-xs">
                {/* Title */}
                <div>
                  <label className="text-slate-300 font-bold block mb-1">
                    {language === 'it' ? 'Cosa devi fare o monitorare? (Titolo Attività) *' : 'Task / Reminder Title *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder={
                      language === 'it'
                        ? 'Es. A inizio gennaio aggiornare i valori dei giocatori / Valutare talento in prima squadra'
                        : 'E.g. Early January update player attributes / Evaluate youth talent for first team'
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 text-xs"
                  />
                </div>

                {/* Target Date Section with Presets */}
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-300 font-bold flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-amber-400" />
                      <span>{t('reminders.targetDate')}</span>
                    </label>
                    <span className="text-emerald-400 font-bold font-mono text-xs">
                      {formatItalianDate(formYear, formMonth, formDay)}
                    </span>
                  </div>

                  {/* Day, Month, Year select */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-400 block mb-1">Giorno</span>
                      <select
                        value={formDay}
                        onChange={(e) => handleDateComponentChange(formYear, formMonth, parseInt(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block mb-1">Mese</span>
                      <select
                        value={formMonth}
                        onChange={(e) => handleDateComponentChange(formYear, parseInt(e.target.value), formDay)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
                      >
                        {ITALIAN_MONTHS.map((m, idx) => (
                          <option key={m} value={idx}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 block mb-1">Anno</span>
                      <select
                        value={formYear}
                        onChange={(e) => handleDateComponentChange(parseInt(e.target.value), formMonth, formDay)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-white"
                      >
                        {availableYears.map((y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Quick Season Presets */}
                  <div>
                    <span className="text-[11px] text-slate-400 font-semibold block mb-1.5">
                      {language === 'it' ? 'Scorciatoie Rapide Data di Gioco:' : 'Quick In-Game Date Presets:'}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {datePresets.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => handleSelectPreset(preset.date)}
                          className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded-lg text-[11px] transition-colors"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Category & Priority */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-300 font-bold block mb-1">
                      {t('reminders.category')}
                    </label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value as ReminderCategory)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    >
                      <option value="operativo">{language === 'it' ? 'Inizio Operativo / Lavoro' : 'Operational Start'}</option>
                      <option value="giocatori">{language === 'it' ? 'Gestione Rosa & Giovani' : 'Squad & Youth'}</option>
                      <option value="calciomercato">{language === 'it' ? 'Calciomercato & Scout' : 'Transfers & Scouting'}</option>
                      <option value="scadenza">{language === 'it' ? 'Scadenza Tassativa' : 'Deadline'}</option>
                      <option value="tattica">{language === 'it' ? 'Tattica & Match' : 'Tactics & Matches'}</option>
                      <option value="varie">{language === 'it' ? 'Varie' : 'General'}</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-300 font-bold block mb-1">
                      {t('reminders.priority')}
                    </label>
                    <select
                      value={formPriority}
                      onChange={(e) => setFormPriority(e.target.value as 'alta' | 'media' | 'bassa')}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    >
                      <option value="alta">{language === 'it' ? 'Alta (Notifica Prioritaria)' : 'High (Urgent)'}</option>
                      <option value="media">{language === 'it' ? 'Media' : 'Medium'}</option>
                      <option value="bassa">{language === 'it' ? 'Bassa' : 'Low'}</option>
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="text-slate-300 font-bold block mb-1">
                    {language === 'it' ? 'Dettagli o Istruzioni Operative' : 'Description / Instructions'}
                  </label>
                  <textarea
                    rows={3}
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder={
                      language === 'it'
                        ? 'Dettagli su cosa verificare, quali statistiche o giocatori controllare...'
                        : 'Details about what to check, which players to evaluate...'
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Optional Links: Note & Player */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-slate-400 block mb-1">
                      {language === 'it' ? 'Collega a Nota di Lavoro (Opzionale)' : 'Link to Tactical Note (Optional)'}
                    </label>
                    <select
                      value={formRelatedNoteId}
                      onChange={(e) => setFormRelatedNoteId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    >
                      <option value="">{language === 'it' ? '-- Nessuna Nota --' : '-- No Note --'}</option>
                      {notes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">
                      {language === 'it' ? 'Giocatore Coinvolto (Opzionale)' : 'Linked Player (Optional)'}
                    </label>
                    <input
                      type="text"
                      value={formRelatedPlayerName}
                      onChange={(e) => setFormRelatedPlayerName(e.target.value)}
                      placeholder={language === 'it' ? 'Es. Jack Moore / Archie Gray' : 'E.g. Jack Moore'}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600"
                    />
                  </div>
                </div>

                {/* Form Buttons */}
                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsCreatingNew(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold"
                  >
                    {language === 'it' ? 'Annulla' : 'Cancel'}
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>{language === 'it' ? 'Salva Promemoria' : 'Save Reminder'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          /* Normal Tab Views */
          <>
            {/* Tabs Bar */}
            <div className="px-5 py-2.5 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setActiveTab('active')}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                    activeTab === 'active'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <BellRing className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t('reminders.activeTab')}</span>
                  {activeItems.length > 0 && (
                    <span className="bg-amber-500 text-slate-950 text-[10px] font-black px-1.5 py-0.2 rounded-full">
                      {activeItems.length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab('upcoming')}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                    activeTab === 'upcoming'
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{t('reminders.upcomingTab')}</span>
                  {upcomingItems.length > 0 && (
                    <span className="bg-indigo-500/20 text-indigo-300 text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                      {upcomingItems.length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setActiveTab('dismissed')}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                    activeTab === 'dismissed'
                      ? 'bg-slate-800 text-slate-200 border border-slate-700 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <BellOff className="w-3.5 h-3.5 text-slate-400" />
                  <span>{t('reminders.dismissedTab')}</span>
                  <span className="text-slate-500 text-[10px]">
                    ({dismissedReminders.length + dismissedNotes.length})
                  </span>
                </button>
              </div>

              {/* Search input */}
              <div className="relative min-w-[180px]">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={language === 'it' ? 'Cerca promemoria...' : 'Search reminders...'}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-700"
                />
              </div>
            </div>

            {/* List Body */}
            <div className="p-5 overflow-y-auto flex-1 space-y-3">
              {/* TAB 1: ACTIVE NOTIFICATIONS */}
              {activeTab === 'active' && (
                <>
                  {activeItems.length === 0 ? (
                    <div className="py-12 text-center bg-slate-950/40 border border-slate-800 rounded-2xl p-6">
                      <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-3">
                        <Check className="w-6 h-6" />
                      </div>
                      <h4 className="text-sm font-bold text-white mb-1">
                        {t('reminders.noActiveReminders')}
                      </h4>
                      <p className="text-slate-400 text-xs max-w-md mx-auto">
                        {language === 'it'
                          ? `Alla data in-game (${currentDate}) non ci sono attività scadute o in attesa di disattivazione. Puoi programmare nuovi promemoria futuri con il pulsante in alto.`
                          : `As of current in-game date (${currentDate}), there are no due or overdue reminders. Use the button above to schedule upcoming tasks.`}
                      </p>
                    </div>
                  ) : (
                    activeItems
                      .filter((item) =>
                        item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase()))
                      )
                      .map((item) => {
                        const rel = formatReminderRelativeLabel(item.targetDate, currentDate, language);
                        const isNoteSource = item.sourceType === 'note';

                        return (
                          <div
                            key={item.id}
                            className={`p-4 rounded-xl border transition-all ${
                              item.status === 'due_today'
                                ? 'bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border-emerald-500/40 shadow-lg'
                                : 'bg-gradient-to-r from-amber-950/30 via-slate-900 to-slate-900 border-amber-500/40 shadow-lg'
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                              <div className="space-y-1.5 flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {/* Status badge */}
                                  <span
                                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${
                                      item.status === 'due_today'
                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse'
                                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                    }`}
                                  >
                                    <Clock className="w-3 h-3" />
                                    <span>{rel.label}</span>
                                  </span>

                                  {/* Date */}
                                  <span className="text-xs text-slate-300 font-semibold flex items-center gap-1">
                                    <Calendar className="w-3 h-3 text-slate-400" />
                                    <span>{item.targetDate}</span>
                                  </span>

                                  {/* Category tag */}
                                  <span className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded uppercase font-semibold">
                                    {item.category}
                                  </span>

                                  {isNoteSource && (
                                    <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-2 py-0.5 rounded font-semibold flex items-center gap-1">
                                      <BookOpen className="w-2.5 h-2.5" />
                                      <span>Nota di Lavoro</span>
                                    </span>
                                  )}
                                </div>

                                <h4 className="text-sm font-bold text-white tracking-wide">
                                  {item.title}
                                </h4>

                                {item.description && (
                                  <p className="text-slate-300 text-xs leading-relaxed">
                                    {item.description}
                                  </p>
                                )}

                                {item.relatedPlayerName && (
                                  <div className="text-[11px] text-teal-300 flex items-center gap-1 pt-1 font-semibold">
                                    <Users className="w-3 h-3" />
                                    <span>{language === 'it' ? `Giocatore: ${item.relatedPlayerName}` : `Player: ${item.relatedPlayerName}`}</span>
                                  </div>
                                )}
                              </div>

                              {/* Action Buttons */}
                              <div className="flex items-center gap-2 shrink-0 self-end sm:self-start">
                                {/* Dismiss button */}
                                <button
                                  onClick={() => handleDismissItem(item.id, item.sourceType)}
                                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                                  title={language === 'it' ? 'Disattiva notifica (non comparirà più tra gli avvisi)' : 'Dismiss notification'}
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>{t('reminders.dismissNotification')}</span>
                                </button>

                                {isNoteSource && onGoToNotes && (
                                  <button
                                    onClick={() => {
                                      onClose();
                                      onGoToNotes();
                                    }}
                                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-2.5 py-1.5 rounded-xl border border-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
                                    title="Vai alla scheda Note"
                                  >
                                    <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
                                    <span>Apri Note</span>
                                  </button>
                                )}

                                {!isNoteSource && (
                                  <button
                                    onClick={() => {
                                      const rem = reminders.find((r) => r.id === item.id);
                                      if (rem) handleOpenEditForm(rem);
                                    }}
                                    className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                                    title="Modifica"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                  )}
                </>
              )}

              {/* TAB 2: UPCOMING REMINDERS */}
              {activeTab === 'upcoming' && (
                <>
                  {upcomingItems.length === 0 ? (
                    <div className="py-12 text-center bg-slate-950/40 border border-slate-800 rounded-2xl p-6">
                      <Calendar className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                      <h4 className="text-sm font-bold text-white mb-1">
                        {t('reminders.noUpcomingReminders')}
                      </h4>
                      <p className="text-slate-400 text-xs max-w-md mx-auto">
                        {language === 'it'
                          ? 'Non ci sono promemoria futuri in programma. Clicca su "+ Nuovo Promemoria" per programmarne uno.'
                          : 'No upcoming reminders scheduled. Click "+ New Reminder" to schedule one.'}
                      </p>
                    </div>
                  ) : (
                    upcomingItems
                      .filter((item) =>
                        item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase()))
                      )
                      .map((item) => {
                        const rel = formatReminderRelativeLabel(item.targetDate, currentDate, language);
                        const isNoteSource = item.sourceType === 'note';

                        return (
                          <div
                            key={item.id}
                            className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                          >
                            <div className="space-y-1 flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                  {rel.label}
                                </span>
                                <span className="text-xs text-slate-300 font-semibold flex items-center gap-1">
                                  <Calendar className="w-3 h-3 text-slate-400" />
                                  <span>{item.targetDate}</span>
                                </span>
                                <span className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded font-semibold">
                                  {item.category}
                                </span>
                                {isNoteSource && (
                                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-2 py-0.5 rounded font-semibold">
                                    Nota di Lavoro
                                  </span>
                                )}
                              </div>

                              <h4 className="text-sm font-bold text-white">
                                {item.title}
                              </h4>

                              {item.description && (
                                <p className="text-slate-400 text-xs">
                                  {item.description}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-start">
                              {!isNoteSource ? (
                                <>
                                  <button
                                    onClick={() => {
                                      const rem = reminders.find((r) => r.id === item.id);
                                      if (rem) handleOpenEditForm(rem);
                                    }}
                                    className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                                    title="Modifica"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteReminder(item.id)}
                                    className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
                                    title="Elimina"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              ) : (
                                onGoToNotes && (
                                  <button
                                    onClick={() => {
                                      onClose();
                                      onGoToNotes();
                                    }}
                                    className="text-xs text-indigo-400 hover:underline flex items-center gap-1 font-semibold"
                                  >
                                    <span>Vedi Nota</span>
                                    <ChevronRight className="w-3 h-3" />
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        );
                      })
                  )}
                </>
              )}

              {/* TAB 3: DISMISSED / ARCHIVED */}
              {activeTab === 'dismissed' && (
                <>
                  {dismissedReminders.length === 0 && dismissedNotes.length === 0 ? (
                    <div className="py-12 text-center bg-slate-950/40 border border-slate-800 rounded-2xl p-6">
                      <BellOff className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                      <h4 className="text-sm font-bold text-white mb-1">
                        {language === 'it' ? 'Nessun promemoria archiviato' : 'No dismissed reminders'}
                      </h4>
                      <p className="text-slate-400 text-xs">
                        {language === 'it'
                          ? 'I promemoria le cui notifiche sono state disattivate compariranno qui, con possibilità di riattivarli in qualsiasi momento.'
                          : 'Dismissed notifications will appear here, and you can reactivate them anytime.'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {dismissedReminders.map((rem) => (
                        <div
                          key={rem.id}
                          className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800/80 opacity-75 hover:opacity-100 transition-opacity flex items-center justify-between gap-3 text-xs"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded font-semibold">
                                {language === 'it' ? 'Disattivato' : 'Dismissed'}
                              </span>
                              <span className="text-slate-400">{rem.targetDate}</span>
                            </div>
                            <h5 className="font-bold text-slate-200 mt-0.5 line-through decoration-slate-500">
                              {rem.title}
                            </h5>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => handleReactivateItem(rem.id, 'reminder')}
                              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                              title="Riattiva notifica"
                            >
                              <RotateCcw className="w-3 h-3 text-emerald-400" />
                              <span>{t('reminders.reactivateNotification')}</span>
                            </button>
                            <button
                              onClick={() => handleDeleteReminder(rem.id)}
                              className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
                              title="Elimina definitivamente"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}

                      {dismissedNotes.map((n) => (
                        <div
                          key={n.id}
                          className="p-3.5 rounded-xl bg-slate-950/40 border border-slate-800/80 opacity-75 hover:opacity-100 transition-opacity flex items-center justify-between gap-3 text-xs"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded font-semibold">
                                Nota di Lavoro
                              </span>
                              <span className="text-slate-400">{n.operationalDate}</span>
                            </div>
                            <h5 className="font-bold text-slate-200 mt-0.5">
                              {n.title}
                            </h5>
                          </div>

                          <button
                            onClick={() => handleReactivateItem(`note_rem_${n.id}`, 'note')}
                            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2.5 py-1 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                            title="Riattiva notifica per questa nota"
                          >
                            <RotateCcw className="w-3 h-3 text-emerald-400" />
                            <span>{t('reminders.reactivateNotification')}</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>
              {language === 'it'
                ? `Data di gioco attiva: ${currentDate}`
                : `Active in-game date: ${currentDate}`}
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-semibold transition-colors cursor-pointer"
          >
            {language === 'it' ? 'Chiudi' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
