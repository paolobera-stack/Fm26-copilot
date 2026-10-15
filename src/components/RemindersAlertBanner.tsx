import React, { useState } from 'react';
import { BellRing, Check, ChevronRight, X, Calendar, Clock, AlertTriangle } from 'lucide-react';
import { ActiveReminderItem } from '../utils/reminderUtils';
import { useLanguage } from '../i18n/LanguageContext';

interface RemindersAlertBannerProps {
  activeReminders: ActiveReminderItem[];
  currentDate: string;
  onDismissReminder: (id: string, sourceType: 'reminder' | 'note') => void;
  onOpenRemindersModal: () => void;
}

export const RemindersAlertBanner: React.FC<RemindersAlertBannerProps> = ({
  activeReminders,
  currentDate,
  onDismissReminder,
  onOpenRemindersModal,
}) => {
  const { language, t } = useLanguage();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  if (activeReminders.length === 0 || isCollapsed) return null;

  const currentItem = activeReminders[Math.min(currentIndex, activeReminders.length - 1)] || activeReminders[0];

  return (
    <div className="bg-gradient-to-r from-amber-950/90 via-slate-900 to-indigo-950/90 border-b border-amber-500/40 px-4 py-2.5 shadow-lg backdrop-blur-md relative z-20 animate-in slide-in-from-top-2 duration-300">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        {/* Left Side: Icon & Summary */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400 shrink-0 shadow-inner animate-pulse">
            <BellRing className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-amber-300 uppercase tracking-wider text-[10px] bg-amber-500/20 px-2 py-0.5 rounded-md border border-amber-500/30">
                {language === 'it' ? 'Promemoria Operativo Raggiunto' : 'Operational Reminder Due'}
              </span>
              <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-amber-400" />
                <span>{currentItem.targetDate}</span>
                <span className="text-slate-500">•</span>
                <span className="text-amber-400 font-bold">
                  {currentItem.status === 'due_today'
                    ? (language === 'it' ? 'Scatta OGGI' : 'Due TODAY')
                    : (language === 'it' ? `Superata da ${currentItem.daysDifference}gg` : `${currentItem.daysDifference}d overdue`)}
                </span>
              </span>
            </div>
            <p className="text-white font-semibold text-xs truncate max-w-xl mt-0.5" title={currentItem.title}>
              {currentItem.title}
              {currentItem.description && (
                <span className="text-slate-400 font-normal ml-1 hidden md:inline">
                  — {currentItem.description}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Right Side: Quick Action & Counter */}
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
          {activeReminders.length > 1 && (
            <div className="flex items-center gap-1 bg-slate-950/60 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-300">
              <button
                onClick={() => setCurrentIndex((prev) => (prev > 0 ? prev - 1 : activeReminders.length - 1))}
                className="hover:text-amber-400 font-bold px-1"
                title="Precedente"
              >
                ‹
              </button>
              <span>
                {currentIndex + 1} / {activeReminders.length}
              </span>
              <button
                onClick={() => setCurrentIndex((prev) => (prev < activeReminders.length - 1 ? prev + 1 : 0))}
                className="hover:text-amber-400 font-bold px-1"
                title="Successivo"
              >
                ›
              </button>
            </div>
          )}

          {/* Quick Dismiss Button */}
          <button
            onClick={() => onDismissReminder(currentItem.id, currentItem.sourceType)}
            className="bg-emerald-600/90 hover:bg-emerald-500 text-white font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm transition-all cursor-pointer text-xs"
            title={language === 'it' ? 'Disattiva questa notifica' : 'Dismiss this notification'}
          >
            <Check className="w-3.5 h-3.5" />
            <span>{language === 'it' ? 'Disattiva Notifica' : 'Dismiss Alert'}</span>
          </button>

          {/* Open full modal */}
          <button
            onClick={onOpenRemindersModal}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-2.5 py-1.5 rounded-lg flex items-center gap-1 text-xs transition-colors cursor-pointer"
            title={language === 'it' ? 'Vedi tutti i promemoria' : 'View all reminders'}
          >
            <span>{language === 'it' ? `Tutti (${activeReminders.length})` : `All (${activeReminders.length})`}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          {/* Close Banner for this view session */}
          <button
            onClick={() => setIsCollapsed(true)}
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors ml-1"
            title={language === 'it' ? 'Nascondi barra temporaneamente' : 'Hide banner temporarily'}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
