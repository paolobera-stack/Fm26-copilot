import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  Edit3,
  Trash2,
  Tag,
  Sparkles,
  Calendar,
  Check,
  X,
  Compass,
  RefreshCw,
  ShoppingBag,
  Info,
  Copy,
  Maximize2,
  ChevronRight,
  FileText,
  Layers,
  FolderInput,
  ArrowRight,
  Bell,
  BellRing,
  BellOff,
  Clock,
  RotateCcw
} from 'lucide-react';
import { TacticalNote, TacticalNoteCategory } from '../types';
import { ConfirmDialogModal } from './ConfirmDialogModal';
import { matchesSearch } from '../utils/textUtils';
import { isReminderDue, getCommonReminderDatePresets, getAvailableReminderYears } from '../utils/reminderUtils';
import { parseDateComponents, formatItalianDate, ITALIAN_MONTHS } from '../utils/dateUtils';

interface TacticalNotesBoardProps {
  notes: TacticalNote[];
  onUpdateNotes: (notes: TacticalNote[]) => void;
  currentDate?: string;
}

export const TacticalNotesBoard: React.FC<TacticalNotesBoardProps> = ({
  notes,
  onUpdateNotes,
  currentDate = '28 Ottobre 2026'
}) => {
  const [activeCategory, setActiveCategory] = useState<TacticalNoteCategory>('tactics');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<TacticalNote | null>(null);
  const [selectedDetailNote, setSelectedDetailNote] = useState<TacticalNote | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [noteToDeleteId, setNoteToDeleteId] = useState<string | null>(null);
  const [toastNotification, setToastNotification] = useState<{ message: string; targetCatId?: TacticalNoteCategory } | null>(null);

  // Form states
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState<TacticalNoteCategory>('tactics');
  const [formContent, setFormContent] = useState('');
  const [formTags, setFormTags] = useState('');
  const [formHasOperationalDate, setFormHasOperationalDate] = useState(false);
  const [formOperationalDate, setFormOperationalDate] = useState(currentDate);
  const [isFilterOnlyReminders, setIsFilterOnlyReminders] = useState(false);

  const datePresets = useMemo(() => getCommonReminderDatePresets(currentDate), [currentDate]);

  const parsedFormDate = useMemo(() => {
    return parseDateComponents(formOperationalDate) || parseDateComponents(currentDate) || { year: 2026, month: 9, day: 28 };
  }, [formOperationalDate, currentDate]);

  const availableYears = useMemo(() => {
    return getAvailableReminderYears(currentDate, parsedFormDate.year);
  }, [currentDate, parsedFormDate.year]);

  const handleOperationalDateChange = (newYear: number, newMonth: number, newDay: number) => {
    const formatted = formatItalianDate(newYear, newMonth, newDay);
    setFormOperationalDate(formatted);
  };

  const dueNotesCount = useMemo(() => {
    return notes.filter(n => n.operationalDate && isReminderDue(n.operationalDate, currentDate) && !n.isReminderDismissed).length;
  }, [notes, currentDate]);

  const allRemindersNotesCount = useMemo(() => {
    return notes.filter(n => Boolean(n.operationalDate)).length;
  }, [notes]);

  const categories: { id: TacticalNoteCategory; label: string; icon: any; color: string; desc: string }[] = [
    {
      id: 'tactics',
      label: 'Analisi Tattica',
      icon: Compass,
      color: 'sky',
      desc: 'Considerazioni sugli assetti, pressing, ruoli e reazioni alle partite giocati.'
    },
    {
      id: 'rotation',
      label: 'Rotazioni Previste',
      icon: RefreshCw,
      color: 'emerald',
      desc: 'Pianificazione dei cambi in rosa in base a calendario, stanchezza e difficoltà impegni.'
    },
    {
      id: 'scouting',
      label: 'Calciomercato & Scout',
      icon: ShoppingBag,
      color: 'amber',
      desc: 'Raccolta idee sulle lacune della rosa, ruoli scoperte e profili da acquistare/cedere.'
    },
    {
      id: 'miscellaneous',
      label: 'Varie',
      icon: Layers,
      color: 'purple',
      desc: 'Appunti generali, regole di spogliatoio, promemoria liberi e note non catalogate nelle altre categorie.'
    }
  ];

  const handleMoveCategory = (noteId: string, targetCategory: TacticalNoteCategory) => {
    const targetCat = categories.find(c => c.id === targetCategory);
    const updated = notes.map(n =>
      n.id === noteId ? { ...n, category: targetCategory, updatedAt: currentDate } : n
    );
    onUpdateNotes(updated);

    if (selectedDetailNote && selectedDetailNote.id === noteId) {
      setSelectedDetailNote({ ...selectedDetailNote, category: targetCategory, updatedAt: currentDate });
    }

    setToastNotification({
      message: `Nota spostata in "${targetCat?.label || targetCategory}"!`,
      targetCatId: targetCategory
    });
    setTimeout(() => setToastNotification(null), 4000);
  };

  const filteredNotes = notes.filter(n => {
    const matchesCategory = isFilterOnlyReminders ? Boolean(n.operationalDate) : n.category === activeCategory;
    const matchesSearchFilter =
      matchesSearch(n.title, searchTerm) ||
      matchesSearch(n.content, searchTerm) ||
      (n.tags && n.tags.some(t => matchesSearch(t, searchTerm))) ||
      (n.operationalDate && matchesSearch(n.operationalDate, searchTerm));
    return matchesCategory && matchesSearchFilter;
  });

  const handleOpenCreateModal = () => {
    setEditingNote(null);
    setFormTitle('');
    setFormCategory(activeCategory);
    setFormContent('');
    setFormTags('');
    setFormHasOperationalDate(false);
    setFormOperationalDate(currentDate);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (note: TacticalNote) => {
    setEditingNote(note);
    setFormTitle(note.title);
    setFormCategory(note.category);
    setFormContent(note.content);
    setFormTags(note.tags ? note.tags.join(', ') : '');
    setFormHasOperationalDate(Boolean(note.operationalDate));
    setFormOperationalDate(note.operationalDate || currentDate);
    setIsModalOpen(true);
  };

  const handleToggleDismissNoteReminder = (noteId: string) => {
    const updated = notes.map(n =>
      n.id === noteId
        ? {
            ...n,
            isReminderDismissed: !n.isReminderDismissed,
            reminderDismissedAt: !n.isReminderDismissed ? currentDate : undefined
          }
        : n
    );
    onUpdateNotes(updated);

    if (selectedDetailNote && selectedDetailNote.id === noteId) {
      setSelectedDetailNote({
        ...selectedDetailNote,
        isReminderDismissed: !selectedDetailNote.isReminderDismissed,
        reminderDismissedAt: !selectedDetailNote.isReminderDismissed ? currentDate : undefined
      });
    }
  };

  const handleSaveNote = () => {
    if (!formTitle.trim() || !formContent.trim()) return;

    const parsedTags = formTags
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    const operationalDateVal = formHasOperationalDate && formOperationalDate.trim()
      ? formOperationalDate.trim()
      : undefined;

    if (editingNote) {
      // Update existing
      const updated = notes.map(n =>
        n.id === editingNote.id
          ? {
              ...n,
              title: formTitle.trim(),
              category: formCategory,
              content: formContent.trim(),
              tags: parsedTags,
              operationalDate: operationalDateVal,
              isReminderActive: formHasOperationalDate ? true : false,
              isReminderDismissed: formHasOperationalDate ? editingNote.isReminderDismissed : undefined,
              updatedAt: currentDate
            }
          : n
      );
      onUpdateNotes(updated);
    } else {
      // Create new
      const newNote: TacticalNote = {
        id: `n_${Date.now()}`,
        title: formTitle.trim(),
        category: formCategory,
        content: formContent.trim(),
        createdAt: currentDate,
        tags: parsedTags,
        operationalDate: operationalDateVal,
        isReminderActive: formHasOperationalDate ? true : false,
        isReminderDismissed: false,
        isAiGenerated: false
      };
      onUpdateNotes([newNote, ...notes]);
    }

    setIsModalOpen(false);
  };

  const handleDeleteNote = (id: string) => {
    setNoteToDeleteId(id);
  };

  const confirmDeleteNote = () => {
    if (noteToDeleteId) {
      onUpdateNotes(notes.filter(n => n.id !== noteToDeleteId));
      if (selectedDetailNote?.id === noteToDeleteId) {
        setSelectedDetailNote(null);
      }
      setNoteToDeleteId(null);
    }
  };

  const handleCopyNote = (note: TacticalNote) => {
    navigator.clipboard.writeText(`${note.title}\n\n${note.content}`);
    setCopiedId(note.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const currentCategoryInfo = categories.find(c => c.id === activeCategory);

  return (
    <div className="space-y-6">
      {/* Top Memory System Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/80 border border-slate-800 rounded-2xl p-5 shadow-xl relative overflow-hidden">
        <div className="absolute -right-6 -top-6 w-36 h-36 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-start space-x-3.5">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 shrink-0">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white tracking-tight">Studio Note & Memoria Tattica AI</h2>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Memoria Gemini Inclusa
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-3xl">
                Tutte le note registrate in queste 3 sezioni vengono lette e integrate istantaneamente dal tuo Co-Allenatore AI in ogni nuova chat. In questo modo preservi le idee chiave senza sovraccaricare le conversazioni.
              </p>
            </div>
          </div>

          <button
            onClick={handleOpenCreateModal}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-950/40 shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nuova Nota Manuale</span>
          </button>
        </div>
      </div>

      {/* Category Tabs & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 p-3 rounded-2xl">
        <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const count = notes.filter(n => n.category === cat.id).length;
            const isActive = !isFilterOnlyReminders && activeCategory === cat.id;

            return (
              <button
                key={cat.id}
                onClick={() => {
                  setIsFilterOnlyReminders(false);
                  setActiveCategory(cat.id);
                }}
                className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40'
                    : 'bg-slate-950 text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{cat.label}</span>
                <span className={`px-1.5 py-0.2 text-[10px] font-extrabold rounded-full ${isActive ? 'bg-emerald-950 text-emerald-200' : 'bg-slate-800 text-slate-400'}`}>
                  {count}
                </span>
              </button>
            );
          })}

          {/* Special Promemoria & Inizio Operativo filter button */}
          <button
            onClick={() => setIsFilterOnlyReminders(!isFilterOnlyReminders)}
            className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
              isFilterOnlyReminders
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-md shadow-amber-950/40'
                : 'bg-slate-950 text-slate-400 hover:text-amber-300 hover:bg-slate-800 border border-slate-800'
            }`}
            title="Mostra solo le note di lavoro che hanno una data di inizio operativo o promemoria"
          >
            <BellRing className={`w-4 h-4 ${dueNotesCount > 0 ? 'text-amber-400 animate-pulse' : 'text-slate-400'}`} />
            <span>Promemoria & Inizio Operativo</span>
            {dueNotesCount > 0 ? (
              <span className="bg-amber-500 text-slate-950 px-1.5 py-0.2 text-[10px] font-black rounded-full animate-pulse">
                {dueNotesCount} ATTIVI
              </span>
            ) : (
              <span className="px-1.5 py-0.2 text-[10px] font-extrabold rounded-full bg-slate-800 text-slate-400">
                {allRemindersNotesCount}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-64">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cerca nelle note..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Category Description Bar & Toast */}
      {currentCategoryInfo && (
        <div className="flex items-center space-x-2 text-xs text-slate-400 px-1">
          <Info className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{currentCategoryInfo.desc}</span>
        </div>
      )}

      {toastNotification && (
        <div className="bg-emerald-950/90 border border-emerald-500/50 text-emerald-200 px-4 py-2.5 rounded-xl text-xs flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold">{toastNotification.message}</span>
          </div>
          {toastNotification.targetCatId && toastNotification.targetCatId !== activeCategory && (
            <button
              onClick={() => {
                setActiveCategory(toastNotification.targetCatId!);
                setToastNotification(null);
              }}
              className="inline-flex items-center gap-1 font-bold text-white bg-emerald-700 hover:bg-emerald-600 px-2.5 py-1 rounded-lg transition-colors cursor-pointer text-[11px]"
            >
              <span>Visualizza scheda</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* Notes Grid */}
      {filteredNotes.length === 0 ? (
        <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-800/80 text-slate-500 flex items-center justify-center mx-auto">
            <BookOpen className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-300">Nessuna nota trovata in questa categoria</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Crea la tua prima nota manuale oppure usa il pulsante "📌 Salva in Note & Memory" presente nelle risposte dell'assistente AI nella chat.
          </p>
          <button
            onClick={handleOpenCreateModal}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-950/60 border border-emerald-800/80 px-3.5 py-2 rounded-xl transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Aggiungi Nota
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredNotes.map((note) => {
            // Summary: first 3 lines or line-clamp
            const lines = note.content.split('\n').filter(l => l.trim() !== '');
            const previewText = lines.slice(0, 3).join('\n');
            const hasMoreLines = lines.length > 3 || note.content.length > 180;

            return (
              <div
                key={note.id}
                onClick={() => setSelectedDetailNote(note)}
                className="bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-5 shadow-lg transition-all flex flex-col justify-between group space-y-3 cursor-pointer hover:shadow-emerald-950/20"
              >
                <div>
                  {/* Note Header */}
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                      <h3 className="font-bold text-white text-sm leading-snug group-hover:text-emerald-300 transition-colors">
                        {note.title}
                      </h3>
                    </div>
                    <div className="flex items-center space-x-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {note.isAiGenerated && (
                        <span className="bg-indigo-950 text-indigo-300 border border-indigo-800/80 text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5" title="Salvato dall'assistente AI">
                          <Sparkles className="w-2.5 h-2.5" /> AI
                        </span>
                      )}
                      <button
                        onClick={() => handleCopyNote(note)}
                        className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                        title="Copia testo"
                      >
                        {copiedId === note.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => handleOpenEditModal(note)}
                        className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                        title="Modifica / Sovrascrivi"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteNote(note.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors"
                        title="Elimina"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Operational Start Date & Reminder Badge */}
                  {note.operationalDate && (
                    <div
                      className="mt-2.5 p-2 rounded-xl bg-slate-950/80 border border-slate-800/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="text-slate-400 text-[11px] font-medium">Inizio Operativo:</span>
                        <span className="font-bold text-white text-[11px]">{note.operationalDate}</span>
                        {isReminderDue(note.operationalDate, currentDate) ? (
                          !note.isReminderDismissed ? (
                            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                              <BellRing className="w-3 h-3 text-amber-400" />
                              <span>ATTIVA</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px] bg-slate-800/80 px-2 py-0.5 rounded flex items-center gap-1">
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span>Notifica disattivata</span>
                            </span>
                          )
                        ) : (
                          <span className="text-indigo-300 text-[10px] bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/40">
                            In programma
                          </span>
                        )}
                      </div>

                      {isReminderDue(note.operationalDate, currentDate) && (
                        <button
                          onClick={() => handleToggleDismissNoteReminder(note.id)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                            !note.isReminderDismissed
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                          }`}
                          title={!note.isReminderDismissed ? 'Disattiva la notifica di questo promemoria' : 'Riattiva la notifica'}
                        >
                          {!note.isReminderDismissed ? (
                            <>
                              <BellOff className="w-3 h-3" />
                              <span>Disattiva Notifica</span>
                            </>
                          ) : (
                            <>
                              <RotateCcw className="w-3 h-3 text-emerald-400" />
                              <span>Riattiva</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Summary Content (max 3 lines) */}
                  <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-3 text-xs text-slate-300 leading-relaxed font-sans relative group-hover:border-slate-700/80 transition-colors">
                    <p className="line-clamp-3 whitespace-pre-wrap">
                      {previewText}
                    </p>
                    {hasMoreLines && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 mt-2 hover:underline">
                        <span>Leggi nota completa</span>
                        <ChevronRight className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                </div>

                {/* Note Tags */}
                {note.tags && note.tags.length > 0 && (
                  <div className="flex items-center space-x-1.5 flex-wrap gap-1">
                    {note.tags.map((tag, tIdx) => (
                      <span
                        key={tIdx}
                        className="bg-slate-950 text-slate-400 border border-slate-800 px-2 py-0.5 rounded-md flex items-center gap-1 text-[10px]"
                      >
                        <Tag className="w-2.5 h-2.5" /> {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Note Footer: Move Category & Date */}
                <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[11px]" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1.5 bg-slate-950/90 border border-slate-800 hover:border-slate-700 rounded-lg px-2 py-1 transition-colors">
                    <FolderInput className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-[10px] text-slate-400 font-medium">Sposta:</span>
                    <select
                      value={note.category}
                      onChange={(e) => handleMoveCategory(note.id, e.target.value as TacticalNoteCategory)}
                      className="bg-transparent text-emerald-300 hover:text-emerald-200 font-bold text-[11px] focus:outline-none cursor-pointer pr-1"
                      title="Sposta questa nota in un'altra categoria"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                          {c.label} {c.id === note.category ? '(qui)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 font-medium text-[10px] text-slate-500">
                    <Calendar className="w-3 h-3 text-slate-600" />
                    <span>{note.createdAt}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full Note Detail View Modal */}
      {selectedDetailNote && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-5 border-b border-slate-800 bg-slate-950/80 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 shrink-0 mt-0.5">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-lg px-2 py-0.5 text-[11px]">
                      <FolderInput className="w-3 h-3 text-emerald-400 shrink-0" />
                      <span className="text-slate-400 text-[10px]">Categoria:</span>
                      <select
                        value={selectedDetailNote.category}
                        onChange={(e) => handleMoveCategory(selectedDetailNote.id, e.target.value as TacticalNoteCategory)}
                        className="bg-transparent text-emerald-300 font-bold text-[11px] focus:outline-none cursor-pointer"
                        title="Modifica la categoria di questa nota"
                      >
                        {categories.map(c => (
                          <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                            {c.label} {c.id === selectedDetailNote.category ? '(attuale)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    {selectedDetailNote.isAiGenerated && (
                      <span className="bg-indigo-950 text-indigo-300 border border-indigo-800 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> Generata da AI
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-bold text-white mt-1.5 leading-snug">
                    {selectedDetailNote.title}
                  </h2>
                </div>
              </div>

              <button
                onClick={() => setSelectedDetailNote(null)}
                className="p-2 text-slate-400 hover:text-white rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Note Full Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-slate-200 text-sm leading-relaxed font-sans bg-slate-900/90 whitespace-pre-wrap">
              {selectedDetailNote.content}
            </div>

            {/* Tags & Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                {selectedDetailNote.tags && selectedDetailNote.tags.length > 0 ? (
                  selectedDetailNote.tags.map((tag, idx) => (
                    <span key={idx} className="bg-slate-900 text-slate-300 border border-slate-800 px-2.5 py-1 rounded-lg text-xs flex items-center gap-1 font-medium">
                      <Tag className="w-3 h-3 text-slate-500" /> {tag}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-500 text-xs">Nessun tag</span>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleCopyNote(selectedDetailNote)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedId === selectedDetailNote.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedId === selectedDetailNote.id ? 'Copiato!' : 'Copia'}</span>
                </button>
                <button
                  onClick={() => {
                    const noteToEdit = selectedDetailNote;
                    setSelectedDetailNote(null);
                    handleOpenEditModal(noteToEdit);
                  }}
                  className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Modifica</span>
                </button>
                <button
                  onClick={() => handleDeleteNote(selectedDetailNote.id)}
                  className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Elimina</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog Modal for Deletion */}
      <ConfirmDialogModal
        isOpen={!!noteToDeleteId}
        title="Elimina Nota Tattica"
        message="Sei sicuro di voler eliminare questa nota dalla memoria? L'operazione non può essere annullata."
        confirmLabel="Elimina Nota"
        cancelLabel="Annulla"
        isDangerous={true}
        onConfirm={confirmDeleteNote}
        onCancel={() => setNoteToDeleteId(null)}
      />

      {/* Modal create / edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">
                  {editingNote ? 'Modifica / Sovrascrivi Nota' : 'Crea Nuova Nota Tattica'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-bold mb-1">Titolo Nota:</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Es. Principi Pressione & Gegenpress"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-semibold focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Categoria:</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as TacticalNoteCategory)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-semibold focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="tactics">🎯 Analisi Tattica</option>
                  <option value="rotation">🔄 Rotazioni Previste</option>
                  <option value="scouting">🛒 Calciomercato & Scout</option>
                  <option value="miscellaneous">📦 Varie</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Contenuto / Osservazione:</label>
                <textarea
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  rows={5}
                  placeholder="Inserisci la nota o le considerazioni tattiche dettagliate..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-white font-medium focus:outline-none focus:border-emerald-500 leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Tag (separati da virgola):</label>
                <input
                  type="text"
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="Es. Gegenpress, Turnover, Terzino HG"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Inizio Operativo / Promemoria con Data */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-bold flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formHasOperationalDate}
                      onChange={(e) => setFormHasOperationalDate(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 bg-slate-900 border-slate-700 focus:ring-emerald-500 cursor-pointer"
                    />
                    <Bell className="w-4 h-4 text-amber-400" />
                    <span>Collega Promemoria / Inizio Operativo a una Data</span>
                  </label>
                  {formHasOperationalDate && (
                    <span className="text-amber-400 font-bold text-[11px] font-mono">
                      {formOperationalDate}
                    </span>
                  )}
                </div>

                {formHasOperationalDate && (
                  <div className="space-y-2 pt-2 border-t border-slate-800/80">
                    <p className="text-[11px] text-slate-400">
                      Quando nel gioco si arriva o si supera questa data, scatterà una notifica persistente fino a quando non la disattivi.
                    </p>
                    {/* Day, Month, Year select */}
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-400 block mb-1">Giorno</span>
                        <select
                          value={parsedFormDate.day}
                          onChange={(e) => handleOperationalDateChange(parsedFormDate.year, parsedFormDate.month, parseInt(e.target.value, 10))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-white text-xs"
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
                          value={parsedFormDate.month}
                          onChange={(e) => handleOperationalDateChange(parsedFormDate.year, parseInt(e.target.value, 10), parsedFormDate.day)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-white text-xs"
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
                          value={parsedFormDate.year}
                          onChange={(e) => handleOperationalDateChange(parseInt(e.target.value, 10), parsedFormDate.month, parsedFormDate.day)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-white text-xs"
                        >
                          {availableYears.map((y) => (
                            <option key={y} value={y}>
                              {y}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Quick presets */}
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <span className="text-[10px] text-slate-500 self-center">Scorciatoie:</span>
                      {datePresets.slice(0, 5).map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => setFormOperationalDate(p.date)}
                          className="px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-[10px] text-slate-300 hover:text-white border border-slate-800 rounded-md transition-colors"
                        >
                          {p.label.split('(')[0].trim()}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-800 cursor-pointer"
              >
                Annulla
              </button>
              <button
                onClick={handleSaveNote}
                disabled={!formTitle.trim() || !formContent.trim()}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 cursor-pointer transition-all shadow-md"
              >
                Salva in Memoria
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
