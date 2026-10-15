import React, { useState, useEffect, useMemo } from 'react';
import { Shield, Users, Compass, Calendar, Search, Settings, Sparkles, AlertTriangle, FileSpreadsheet, Edit3, Zap, Check, X, BookOpen, Trophy, GraduationCap, History, Key, Globe, Bell, BellRing, Terminal, Radio } from 'lucide-react';
import { hasCustomApiKey } from '../utils/apiKeyStorage';
import { Fixture } from '../types';
import { getContextualFixtures, parseDateComponents, formatItalianDateWithWeekday } from '../utils/dateUtils';
import { useLanguage } from '../i18n/LanguageContext';


interface NavbarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  teamName?: string;
  onUpdateTeamName?: (name: string) => void;
  teamLogo?: string | null;
  onOpenLogoModal?: () => void;
  injuredCount: number;
  hasNewNote?: boolean;
  currentDate?: string;
  onOpenEditDateModal?: () => void;
  onOpenQuickSetup: () => void;
  onOpenCsvModal?: (type: 'squad' | 'scouting') => void;
  onOpenApiKeyModal?: () => void;
  onOpenPingModal?: () => void;
  fixtures?: Fixture[];
  duplicatesCount?: number;
  onOpenDuplicatesModal?: () => void;
  remindersCount?: number;
  onOpenRemindersModal?: () => void;
}



export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  teamName = 'Northampton Town FC',
  onUpdateTeamName,
  teamLogo,
  onOpenLogoModal,
  injuredCount,
  hasNewNote = false,
  currentDate = '28 Ottobre 2026',
  onOpenEditDateModal,
  onOpenQuickSetup,
  onOpenCsvModal,
  onOpenApiKeyModal,
  onOpenPingModal,
  fixtures = [],
  duplicatesCount = 0,
  onOpenDuplicatesModal,
  remindersCount = 0,
  onOpenRemindersModal,
}) => {
  const { language, setLanguage, t } = useLanguage();

  const [isEditingTeam, setIsEditingTeam] = useState(false);
  const [tempTeamName, setTempTeamName] = useState(teamName);
  const [teamToast, setTeamToast] = useState<string | null>(null);
  const [isCustomKeyActive, setIsCustomKeyActive] = useState<boolean>(() => hasCustomApiKey());

  const { nextFixture, daysToNext, isMatchDayToday } = useMemo(() => {
    return getContextualFixtures(fixtures, currentDate);
  }, [fixtures, currentDate]);

  const dateTooltip = useMemo(() => {
    const comp = parseDateComponents(currentDate);
    if (!comp) return `Data in-game: ${currentDate}`;
    const clickHint = language === 'it' ? 'Clicca per aprire il calendario annuo' : 'Click to open yearly calendar';
    return `${formatItalianDateWithWeekday(comp.year, comp.month, comp.day)} • ${clickHint}`;
  }, [currentDate, language]);

  useEffect(() => {
    const handleKeyChange = () => {
      setIsCustomKeyActive(hasCustomApiKey());
    };
    window.addEventListener('custom-api-key-changed', handleKeyChange);
    return () => window.removeEventListener('custom-api-key-changed', handleKeyChange);
  }, []);

  useEffect(() => {
    setTempTeamName(teamName);
  }, [teamName]);

  const handleSaveTeamName = () => {
    if (tempTeamName.trim() && onUpdateTeamName) {
      const newName = tempTeamName.trim();
      onUpdateTeamName(newName);
      const msg = language === 'it'
        ? `Nome squadra aggiornato a "${newName}"! Il Calendario e l'AI useranno questo nome.`
        : `Club name updated to "${newName}"! The Calendar and AI will use this name.`;
      setTeamToast(msg);
      setTimeout(() => setTeamToast(null), 4000);
    } else {
      setTempTeamName(teamName);
    }
    setIsEditingTeam(false);
  };

  const getInitials = (name: string) => {
    if (!name) return 'FC';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 3).toUpperCase();
    return parts.slice(0, 3).map(p => p[0]).join('').toUpperCase();
  };

  interface NavItem {
    id: string;
    label: string;
    icon: any;
    badge?: string;
    isLive?: boolean;
  }

  const navItems: NavItem[] = [
    { id: 'copilot', label: t('nav.copilot'), icon: Sparkles },
    { id: 'notes', label: t('nav.notes'), icon: BookOpen, badge: hasNewNote ? 'NEW' : undefined },
    { id: 'squad', label: t('nav.squad'), icon: Users, badge: injuredCount > 0 ? `${injuredCount} ${language === 'it' ? 'INF' : 'INJ'}` : undefined },
    { id: 'youth', label: t('nav.youth'), icon: GraduationCap },
    { id: 'tactics', label: t('nav.tactics'), icon: Compass },
    { id: 'gameplan', label: t('nav.gameplan'), icon: Zap, isLive: isMatchDayToday },
    { id: 'calendar', label: t('nav.calendar'), icon: Calendar },
    { id: 'competitions', label: t('nav.competitions'), icon: Trophy },
    { id: 'history', label: t('nav.history'), icon: History },
    { id: 'scouting', label: t('nav.scouting'), icon: Search },
  ];



  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40 shadow-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand & Editable Club Name */}
          <div className="flex items-center space-x-3">
            {teamLogo ? (
              <button
                type="button"
                onClick={onOpenLogoModal}
                className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-700/80 p-0.5 flex items-center justify-center shadow-lg shadow-black/50 hover:scale-105 hover:border-emerald-500 transition-all cursor-pointer group relative"
                title={language === 'it' ? 'Stemma Ufficiale Club - Clicca per personalizzare con AI' : 'Official Club Crest - Click to customize with AI'}
              >
                <img
                  src={teamLogo}
                  alt={teamName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain filter drop-shadow-sm rounded-lg"
                />
                <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 text-slate-950 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow text-[9px] font-bold">
                  <Sparkles className="w-2.5 h-2.5" />
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenLogoModal}
                className="w-10 h-10 bg-[#721c24] border border-red-500/40 rounded-xl flex items-center justify-center font-bold text-white shadow-lg shadow-red-950/40 tracking-wider text-xs hover:scale-105 hover:border-amber-400 transition-all cursor-pointer group relative"
                title={language === 'it' ? "Clicca per creare lo stemma della squadra con l'AI" : 'Click to generate your team crest with AI'}
              >
                <span>{getInitials(teamName)}</span>
                <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-gradient-to-tr from-amber-500 to-rose-500 text-white rounded-full flex items-center justify-center shadow border border-slate-900 group-hover:scale-110 transition-transform">
                  <Sparkles className="w-2.5 h-2.5" />
                </span>
              </button>
            )}
            <div>
              <div className="flex items-center space-x-2 relative">
                {isEditingTeam ? (
                  <div className="flex flex-col space-y-1 z-50">
                    <div className="flex items-center space-x-1.5">
                      <input
                        type="text"
                        value={tempTeamName}
                        onChange={(e) => setTempTeamName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveTeamName();
                          if (e.key === 'Escape') {
                            setTempTeamName(teamName);
                            setIsEditingTeam(false);
                          }
                        }}
                        autoFocus
                        placeholder={t('nav.teamNamePlaceholder')}
                        className="bg-slate-950 border border-emerald-500/80 rounded-lg px-2.5 py-1 text-sm font-bold text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                      <button
                        onClick={handleSaveTeamName}
                        className="p-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
                        title={t('nav.saveTeamName')}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setTempTeamName(teamName);
                          setIsEditingTeam(false);
                        }}
                        className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                        title={t('common.cancel')}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <span className="text-[10px] text-emerald-400 font-medium bg-slate-950/90 border border-emerald-500/30 px-2 py-0.5 rounded-md max-w-xs shadow-lg">
                      {language === 'it' 
                        ? '💡 Questo nome verrà usato per identificare la tua squadra nel Calendario e nelle sfide.'
                        : '💡 This name will be used to identify your team in the Calendar and fixtures.'}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setIsEditingTeam(true)}
                      className="group flex items-center space-x-1.5 hover:bg-slate-800/80 px-2 py-0.5 -ml-2 rounded-lg transition-colors text-left cursor-pointer"
                      title={language === 'it' ? 'Clicca per modificare il nome della tua squadra' : 'Click to edit your club name'}
                    >
                      <h1 className="font-bold text-base sm:text-lg text-white tracking-tight group-hover:text-emerald-300 transition-colors">
                        {teamName}
                      </h1>
                      <Edit3 className="w-3.5 h-3.5 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                    </button>

                    {onOpenLogoModal && (
                      <button
                        type="button"
                        onClick={onOpenLogoModal}
                        className="text-[10px] bg-slate-800/90 hover:bg-slate-700 text-amber-300 hover:text-amber-200 border border-amber-500/30 hover:border-amber-400/50 px-2 py-0.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                        title={language === 'it' ? "Genera o personalizza lo stemma con l'AI" : 'Generate or customize AI club crest'}
                      >
                        <Sparkles className="w-3 h-3 text-amber-400 animate-pulse" />
                        <span className="hidden sm:inline font-bold">Logo AI</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                <span>FM26 Assistant</span>
                <span className="w-1 h-1 rounded-full bg-slate-600"></span>
                <button
                  onClick={onOpenEditDateModal}
                  className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-lg flex items-center gap-1 transition-all font-semibold cursor-pointer"
                  title={dateTooltip}
                >
                  <Calendar className="w-3 h-3" />
                  <span>{currentDate}</span>
                  <Edit3 className="w-2.5 h-2.5 opacity-70" />
                </button>

                {nextFixture && (
                  <button
                    onClick={() => setActiveTab('calendar')}
                    className="hidden xl:flex items-center gap-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/25 px-2 py-0.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
                    title={`${language === 'it' ? 'Prossima partita' : 'Next match'}: vs ${nextFixture.opponent} (${nextFixture.date})`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isMatchDayToday ? 'bg-amber-400 animate-ping' : 'bg-indigo-400 animate-pulse'}`} />
                    <span className="truncate max-w-[130px]">
                      {isMatchDayToday ? t('nav.todayMatch') : t('nav.nextMatch')}
                      <strong>vs {nextFixture.opponent}</strong>
                    </span>
                    {daysToNext !== null && !isMatchDayToday && (
                      <span className="text-[10px] bg-indigo-500/20 px-1 rounded text-indigo-200 shrink-0">
                        {daysToNext === 1 ? t('nav.tomorrow') : t('nav.inDays', { days: daysToNext })}
                      </span>
                    )}
                  </button>
                )}

                {/* Mobile Language Switcher */}
                <button
                  onClick={() => setLanguage(language === 'it' ? 'en' : 'it')}
                  className="md:hidden px-1.5 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 transition-colors"
                  title={language === 'it' ? 'Switch to English' : 'Passa all\'Italiano'}
                >
                  <span>{language === 'it' ? '🇮🇹 IT' : '🇬🇧 EN'}</span>
                </button>

                {onOpenRemindersModal && (
                  <button
                    onClick={onOpenRemindersModal}
                    className={`md:hidden px-1.5 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 border transition-all cursor-pointer ${
                      remindersCount > 0
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                    title={
                      remindersCount > 0
                        ? `${remindersCount} ${language === 'it' ? 'Promemoria attivi' : 'Active reminders'}`
                        : (language === 'it' ? 'Gestisci Promemoria' : 'Manage Reminders')
                    }
                  >
                    {remindersCount > 0 ? (
                      <BellRing className="w-2.5 h-2.5 text-amber-400" />
                    ) : (
                      <Bell className="w-2.5 h-2.5 text-slate-400" />
                    )}
                    <span>{remindersCount > 0 ? remindersCount : 'REM'}</span>
                  </button>
                )}

                {duplicatesCount > 0 && onOpenDuplicatesModal && (
                  <button
                    onClick={onOpenDuplicatesModal}
                    className="md:hidden px-1.5 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse"
                    title={`${duplicatesCount} ${t('nav.duplicates')}`}
                  >
                    <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
                    <span>{duplicatesCount} {t('nav.duplicates')}</span>
                  </button>
                )}
                <button
                  id="mobile-byok-btn"
                  onClick={onOpenApiKeyModal}
                  className={`md:hidden px-1.5 py-0.5 rounded-lg text-[10px] font-semibold flex items-center gap-1 border transition-all ${
                    isCustomKeyActive
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                  title={isCustomKeyActive ? t('nav.keyActive') : t('nav.apiKeyByok')}
                >
                  <Key className={`w-2.5 h-2.5 ${isCustomKeyActive ? 'text-emerald-400' : 'text-amber-400'}`} />
                  <span>{isCustomKeyActive ? 'BYOK' : 'API'}</span>
                </button>
                {onOpenPingModal && (
                  <button
                    onClick={onOpenPingModal}
                    className="md:hidden px-1.5 py-0.5 rounded-lg text-[10px] font-semibold flex items-center gap-1 border border-slate-700 bg-slate-800 text-slate-300 font-mono transition-all"
                    title="Prompt CMD Ping Gemini"
                  >
                    <Terminal className="w-2.5 h-2.5 text-emerald-400" />
                    <span>Ping</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions & Setup */}
          <div className="hidden md:flex items-center space-x-2">
            {/* Language Selector Switcher */}
            <button
              onClick={() => setLanguage(language === 'it' ? 'en' : 'it')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer shadow-sm hover:border-slate-500"
              title={language === 'it' ? 'Passa alla lingua Inglese (Switch to English)' : 'Passa alla lingua Italiana (Switch to Italian)'}
            >
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-sm leading-none">{language === 'it' ? '🇮🇹' : '🇬🇧'}</span>
              <span className="font-bold">{language === 'it' ? 'IT' : 'EN'}</span>
            </button>

            {/* Reminders / Notifications Bell Button */}
            {onOpenRemindersModal && (
              <button
                id="open-reminders-modal-btn"
                onClick={onOpenRemindersModal}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border cursor-pointer ${
                  remindersCount > 0
                    ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-950 animate-pulse'
                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
                }`}
                title={
                  remindersCount > 0
                    ? `${remindersCount} ${language === 'it' ? 'Promemoria operativi attivi!' : 'Active operational reminders!'}`
                    : (language === 'it' ? 'Promemoria & Scadenze con data' : 'Date-linked Reminders')
                }
              >
                {remindersCount > 0 ? (
                  <BellRing className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Bell className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span className="font-bold">{t('nav.reminders')}</span>
                {remindersCount > 0 && (
                  <span className="bg-amber-500 text-slate-950 text-[10px] font-black px-1.5 py-0.2 rounded-full">
                    {remindersCount}
                  </span>
                )}
              </button>
            )}

            {/* BYOK / API Key Personal Settings button */}
            <button
              id="open-byok-modal-btn"
              onClick={onOpenApiKeyModal}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border cursor-pointer ${
                isCustomKeyActive
                  ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-950'
                  : 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-700'
              }`}
              title={
                isCustomKeyActive
                  ? (language === 'it' ? 'Chiave API personale attiva (BYOK)' : 'Personal API Key active (BYOK)')
                  : (language === 'it' ? 'Inserisci la tua API Key personale Google Gemini' : 'Enter your personal Google Gemini API Key')
              }
            >
              <Key className={`w-3.5 h-3.5 ${isCustomKeyActive ? 'text-emerald-400' : 'text-amber-400'}`} />
              <span>{isCustomKeyActive ? t('nav.personalKey') : t('nav.apiKeyByok')}</span>
              {isCustomKeyActive && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>}
            </button>

            {/* Windows CMD Ping Button */}
            {onOpenPingModal && (
              <button
                id="open-cmd-ping-btn"
                onClick={onOpenPingModal}
                className="px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700/80 hover:border-emerald-500/40 bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-emerald-300 cursor-pointer font-mono shadow-sm"
                title="Apri il prompt dei comandi in stile Windows per eseguire ping di rete e verificare la latenza verso Google Gemini"
              >
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden lg:inline">&gt;_ Ping CMD</span>
                <span className="lg:hidden">&gt;_ Ping</span>
              </button>
            )}

            {duplicatesCount > 0 && onOpenDuplicatesModal && (
              <button
                id="open-duplicates-modal-btn"
                onClick={onOpenDuplicatesModal}
                className="bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm shadow-amber-950 animate-pulse"
                title={`${duplicatesCount} ${t('nav.duplicates')}`}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>{duplicatesCount} {t('nav.duplicates')}</span>
              </button>
            )}

            {injuredCount > 0 && (
              <div className="bg-rose-500/10 border border-rose-500/30 px-2.5 py-1 rounded-lg flex items-center space-x-1.5 text-xs text-rose-300">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{injuredCount} {injuredCount === 1 ? t('nav.injured') : t('nav.injuredPlural')}</span>
              </div>
            )}

            <button
              onClick={() => onOpenCsvModal && onOpenCsvModal('squad')}
              className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>{t('nav.uploadCsv')}</span>
            </button>

            <button
              onClick={onOpenQuickSetup}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors flex items-center space-x-1 text-xs border border-slate-800 cursor-pointer"
              title={t('nav.quickSetup')}
            >
              <Settings className="w-4 h-4" />
              <span className="hidden lg:inline">{t('nav.quickSetup')}</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex space-x-1 overflow-x-auto no-scrollbar pt-1 pb-2 border-t border-slate-800/60">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : item.isLive ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`} />
                <span>{item.label}</span>
                {item.isLive && (
                  <span className="flex items-center gap-1 bg-rose-500/90 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm shadow-rose-950">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span>
                    LIVE
                  </span>
                )}
                {item.badge !== undefined && (
                  <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {teamToast && (
        <div className="bg-emerald-600 text-white text-xs font-bold py-2 px-4 text-center border-b border-emerald-500 flex items-center justify-center gap-2 shadow-xl animate-fade-in">
          <Shield className="w-4 h-4 text-emerald-200" />
          <span>{teamToast}</span>
        </div>
      )}
    </header>
  );
};
