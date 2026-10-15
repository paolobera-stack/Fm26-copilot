import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Sparkles, RefreshCw, User, Zap, MessageSquare, Compass, Shield, Users, BookmarkPlus, Check, X, BookOpen, GraduationCap, Activity, Trophy, Key, Calendar, FileText, TrendingUp, TrendingDown, UserCheck, Paperclip, Image as ImageIcon, Maximize2, Eye, UploadCloud, ExternalLink, Terminal } from 'lucide-react';
import { Player, TacticPreset, Fixture, ScoutingTarget, SeasonPhaseInfo, TacticalNote, TacticalNoteCategory, YouthSquad, GamePlanState, StandingsRow } from '../types';
import { getEffectiveAge } from '../utils/csvParser';
import { getCalendarPerformancePayload, getFixtureResult } from '../utils/calendarExportUtils';
import { getPlayerLastVariation, formatVariationDate } from '../utils/attributeDiffUtils';
import { MemoryDiagnosticsModal, TokenUsageStats, PayloadBreakdown, PayloadConfig } from './MemoryDiagnosticsModal';
import { getApiHeaders, hasCustomApiKey } from '../utils/apiKeyStorage';
import { extractPlayerNoteProposals, PlayerNoteProposal, isCopilotNote } from '../utils/copilotNoteProposals';
import { PlayerNoteProposalCard } from './PlayerNoteProposalCard';
import { ApplyToPlayerNoteModal } from './ApplyToPlayerNoteModal';
import { normalizeSearchText, matchesSearch } from '../utils/textUtils';
import { ChatAttachment, processFileToAttachment, formatFileSize } from '../utils/chatAttachmentUtils';
import { safeFetchJson } from '../utils/apiUtils';
import { detectQueryIntents, buildTargetedSquadContext, QueryIntentAnalysis } from '../utils/copilotContextFilter';
import { truncateSquadAndTactic } from '../utils/dataTruncator';
import { getContextualFixtures } from '../utils/dateUtils';
import { ScreenshotOcrProgressBar } from './ScreenshotOcrProgressBar';
import {
  parseStatsFromPlayerNote,
  enrichPlayerWithLoanStats,
  getAllLoanedPlayersEnriched,
  extractPlayerStats,
  isPlayerOnLoan
} from '../utils/loanStatsParser';

interface AiCopilotProps {
  players: Player[];
  youthSquads?: YouthSquad[];
  tactic: TacticPreset;
  fixtures: Fixture[];
  targets?: ScoutingTarget[];
  currentDate?: string;
  phaseInfo?: SeasonPhaseInfo;
  tacticalNotes?: TacticalNote[];
  teamName?: string;
  gamePlan?: GamePlanState;
  standings?: StandingsRow[];
  competitionGoals?: Record<string, string>;
  initialPrompt?: string;
  onClearInitialPrompt?: () => void;
  onSaveNoteToMemory?: (note: Omit<TacticalNote, 'id'>) => void;
  onNavigateToNotes?: () => void;
  onNavigateToGamePlan?: () => void;
  onNavigateToCompetitions?: () => void;
  onOpenApiKeyModal?: () => void;
  onOpenPingModal?: () => void;
  onUpdatePlayerNote?: (playerId: string, newNote: string) => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  attachments?: ChatAttachment[];
  usage?: TokenUsageStats;
  focusDomains?: string[];
  contextMode?: 'smart' | 'full';
  latencyReduction?: number;
  isStreaming?: boolean;
}


const FormattedText: React.FC<{ content: string; isUser: boolean }> = ({ content, isUser }) => {
  const lines = content.split('\n');

  const parseInlineStyles = (text: string) => {
    // Strip stray single asterisks
    const cleanedText = text.replace(/(^|\s)\*([^\*\s]+)\*(\s|$)/g, '$1$2$3');
    // Split by **bold** tags
    const parts = cleanedText.split(/(\*\*.*?\*\*)/g);

    return parts.map((part, pIdx) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        const innerText = part.slice(2, -2);
        return (
          <strong
            key={pIdx}
            className={
              isUser
                ? "font-bold text-white underline decoration-indigo-300/60"
                : "font-semibold text-emerald-300"
            }
          >
            {innerText}
          </strong>
        );
      }
      return <React.Fragment key={pIdx}>{part}</React.Fragment>;
    });
  };

  return (
    <div className="space-y-2 leading-relaxed text-sm">
      {lines.map((line, idx) => {
        if (!line.trim()) {
          return <div key={idx} className="h-1.5" />;
        }

        const isBullet = /^\s*[\-\*•]\s+/.test(line);
        if (isBullet) {
          const bulletText = line.replace(/^\s*[\-\*•]\s+/, '');
          return (
            <div key={idx} className="flex items-start space-x-2 my-1 pl-1">
              <span className={`inline-block w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${isUser ? 'bg-indigo-200' : 'bg-emerald-400'}`} />
              <div className="flex-1">{parseInlineStyles(bulletText)}</div>
            </div>
          );
        }

        const isHeader = /^\s*#{1,4}\s+/.test(line);
        if (isHeader) {
          const headerText = line.replace(/^\s*#{1,4}\s+/, '');
          return (
            <div key={idx} className={`font-bold text-base mt-3 mb-1.5 ${isUser ? 'text-white' : 'text-emerald-300'}`}>
              {parseInlineStyles(headerText)}
            </div>
          );
        }

        return <div key={idx}>{parseInlineStyles(line)}</div>;
      })}
    </div>
  );
};

export const AiCopilot: React.FC<AiCopilotProps> = ({
  players,
  youthSquads = [],
  tactic,
  fixtures,
  targets = [],
  currentDate = '28 Ottobre 2026',
  phaseInfo,
  tacticalNotes = [],
  teamName = 'La Tua Squadra FC',
  gamePlan,
  standings = [],
  competitionGoals,
  initialPrompt,
  onClearInitialPrompt,
  onSaveNoteToMemory,
  onNavigateToNotes,
  onNavigateToGamePlan,
  onNavigateToCompetitions,
  onOpenApiKeyModal,
  onOpenPingModal,
  onUpdatePlayerNote
}) => {
  const effectiveCompetitionGoals: Record<string, string> = useMemo(() => {
    if (competitionGoals && Object.keys(competitionGoals).length > 0) return competitionGoals;
    try {
      const saved = localStorage.getItem('fm26_competition_goals');
      return saved ? JSON.parse(saved) : {
        'Premier League': 'Piazzamento Top 4 (Qualificazione Champions)',
        'Champions League': 'Raggiungere la Fase a Eliminazione Diretta',
        'Carabao Cup': 'Semifinale o Finale',
        'FA Cup': 'Turno 5 / Quarti di Finale'
      };
    } catch {
      return {};
    }
  }, [competitionGoals]);

  const calendarCompetitions: string[] = useMemo(() => {
    return Array.from(new Set((fixtures || []).map(f => f.competition).filter((c): c is string => Boolean(c))));
  }, [fixtures]);

  const userTeamRow = useMemo(() => {
    return (standings || []).find(
      r => r.team.toLowerCase().includes(teamName.toLowerCase()) || teamName.toLowerCase().includes(r.team.toLowerCase())
    );
  }, [standings, teamName]);

  const effectiveGamePlan: GamePlanState | undefined = gamePlan || (() => {
    try {
      const raw = localStorage.getItem('fm26_active_gameplan');
      if (raw) {
        const parsed = JSON.parse(raw);
        const report = localStorage.getItem('fm26_gameplan_report') || parsed.aiMatchPlan || null;
        const notes = localStorage.getItem('fm26_gameplan_notes') || parsed.managerNotes || '';
        return { ...parsed, aiMatchPlan: report, managerNotes: notes };
      }
    } catch {}
    return undefined;
  })();

  const INITIAL_GREETING = `⚽ **Benvenuto nel tuo Copilota Tattico per Football Manager!**

Sono il tuo assistente personale per guidarti in tutte le decisioni tattiche, di mercato e di gestione della squadra per **${teamName}**.

**Come utilizzare al meglio l'applicazione:**
- 🛡️ **Nome Squadra**: Clicca sul nome del club nella barra in alto per personalizzare il nome della tua squadra.
- 📋 **Gestione Rosa e Tattica**: Configura la formazione nella **Lavagna Tattica**, carica i dati dei giocatori tramite CSV/JSON o gestiscili nello **Squad Manager**.
- 🎓 **Giovanili & Vivaio**: Monitora la crescita delle rose giovanili (Under 20, Under 18, Squadra B), i giovani talenti con alto potenziale (PA), i prestiti e i giocatori di prima squadra disponibili per le partite delle giovanili (fino a 90min).
- ⚡ **Piano Gara AI**: Analizza gli avversari, carica screenshot di formazioni e ricevi contromisure tattiche su misura.
- 📅 **Calendario & Screenshot**: Carica direttamente gli screenshot delle partite per popolare il calendario con OCR.
- 🏆 **Classifiche**: Sincronizza posizioni e statistiche scattando uno screenshot alla classifica.
- 💾 **Salvataggi JSON**: Esporta o ricarica l'intera carriera dal menu **Gestione Salvataggio**.

Chiedimi qualunque cosa: consigli sulla formazione, gestione infortuni e indisponibili, monitoraggio del vivaio e giovani talenti, suggerimenti sui ruoli o preparazione per la prossima sfida!`;

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'm_init',
      role: 'assistant',
      content: INITIAL_GREETING,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [savedMsgIds, setSavedMsgIds] = useState<Set<string>>(new Set());

  // Token and Payload Memory Diagnostic States
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<TokenUsageStats | null>(() => {
    const saved = localStorage.getItem('fm26_token_usage');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return null;
  });

  const [payloadConfig, setPayloadConfig] = useState<PayloadConfig>(() => {
    const saved = localStorage.getItem('fm26_payload_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          contextMode: parsed.contextMode || 'smart',
          scoutingDetailMode: parsed.scoutingDetailMode || 'full',
          includeYouth: parsed.includeYouth !== undefined ? parsed.includeYouth : true,
          includeGamePlan: parsed.includeGamePlan !== undefined ? parsed.includeGamePlan : false,
          historyLimit: parsed.historyLimit !== undefined ? parsed.historyLimit : 10,
          aiModel: parsed.aiModel || 'gemini-3.8-flash',
          thinkingSpeed: parsed.thinkingSpeed || 'turbo',
          enableStreaming: parsed.enableStreaming !== undefined ? parsed.enableStreaming : true,
        };
      } catch {}
    }
    return {
      contextMode: 'smart',
      scoutingDetailMode: 'full',
      includeYouth: true,
      includeGamePlan: false,
      historyLimit: 10,
      aiModel: 'gemini-3.8-flash',
      thinkingSpeed: 'turbo',
      enableStreaming: true,
    };
  });

  const handleUpdatePayloadConfig = (newConfig: PayloadConfig) => {
    setPayloadConfig(newConfig);
    localStorage.setItem('fm26_payload_config', JSON.stringify(newConfig));
    window.dispatchEvent(new CustomEvent('fm26_payload_config_updated', { detail: newConfig }));
  };

  useEffect(() => {
    const handleConfigEvent = () => {
      try {
        const saved = localStorage.getItem('fm26_payload_config');
        if (saved) {
          const parsed = JSON.parse(saved);
          setPayloadConfig(prev => ({
            ...prev,
            ...parsed,
            includeGamePlan: Boolean(parsed.includeGamePlan),
          }));
        }
      } catch {}
    };

    window.addEventListener('fm26_payload_config_updated', handleConfigEvent);
    window.addEventListener('storage', handleConfigEvent);
    return () => {
      window.removeEventListener('fm26_payload_config_updated', handleConfigEvent);
      window.removeEventListener('storage', handleConfigEvent);
    };
  }, []);

  const handleToggleContextMode = () => {
    const nextMode = payloadConfig.contextMode === 'full' ? 'smart' : 'full';
    handleUpdatePayloadConfig({
      ...payloadConfig,
      contextMode: nextMode,
    });
    setToastMessage(
      nextMode === 'smart'
        ? '⚡ Smart Focus attivato: latenza ridotta fino all\'85% con analisi mirata.'
        : '🌐 Full Memory attivato: analisi di tutto il database completo.'
    );
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleToggleThinkingSpeed = () => {
    const nextSpeed = payloadConfig.thinkingSpeed === 'deep' ? 'turbo' : 'deep';
    handleUpdatePayloadConfig({
      ...payloadConfig,
      thinkingSpeed: nextSpeed,
    });
    setToastMessage(
      nextSpeed === 'turbo'
        ? '⚡ Modalità Turbo attivata: ThinkingLevel.LOW (latenza minima, avvio risposta in 1-2s).'
        : '🧠 Modalità Ragionamento Profondo attivata: elaborazione riflessiva estesa.'
    );
    setTimeout(() => setToastMessage(null), 3500);
  };
  
  // Modal for saving chat message to tactical memory
  const [saveModalMsg, setSaveModalMsg] = useState<Message | null>(null);
  const [saveTitle, setSaveTitle] = useState('');
  const [saveCategory, setSaveCategory] = useState<TacticalNoteCategory>('tactics');
  const [saveContent, setSaveContent] = useState('');
  const [saveTags, setSaveTags] = useState('AI Copilot');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Note Proposals State & Confirmation Management
  const [proposalStatuses, setProposalStatuses] = useState<Record<string, 'pending' | 'approved' | 'rejected'>>(() => {
    try {
      const saved = localStorage.getItem('fm26_note_proposals_status');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Modal per applicare manualmente una nota a un giocatore
  const [applyModalData, setApplyModalData] = useState<{
    isOpen: boolean;
    initialText: string;
    defaultPlayerId?: string;
  }>({
    isOpen: false,
    initialText: '',
  });

  // Gestione Allegati & Screenshot Situazionali (One-Off per non appesantire la memory)
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; name: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    try {
      const newAttachments: ChatAttachment[] = [];
      for (const file of fileArray) {
        const att = await processFileToAttachment(file);
        newAttachments.push(att);
      }
      setAttachments(prev => [...prev, ...newAttachments]);
      triggerToast(`Caricato ${newAttachments.length === 1 ? '1 allegato' : `${newAttachments.length} allegati`} per l'analisi immediata.`);
    } catch (err) {
      console.error("Errore elaborazione file allegato:", err);
      triggerToast("Errore durante l'elaborazione del file allegato.");
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData || !clipboardData.items) return;

    const files: File[] = [];
    for (let i = 0; i < clipboardData.items.length; i++) {
      const item = clipboardData.items[i];
      if (item.type.indexOf('image') !== -1 || item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }

    if (files.length > 0) {
      e.preventDefault();
      await handleAddFiles(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleAddFiles(e.dataTransfer.files);
    }
  };

  // Elenco unificato di tutti i calciatori (Prima Squadra + formazioni Giovanili)
  const allPlayersWithSquad = useMemo(() => {
    const list: { player: Player; squadName: string }[] = [];
    players.forEach(p => {
      list.push({ player: p, squadName: teamName || 'Prima Squadra' });
    });
    (youthSquads || []).forEach(ys => {
      (ys.players || []).forEach(p => {
        list.push({ player: p, squadName: ys.name });
      });
    });
    return list;
  }, [players, youthSquads, teamName]);

  const triggerToast = (text: string) => {
    setToastMessage(text);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const resolvePlayerForProposal = (playerName: string): { player: Player; squadName: string } | null => {
    if (!playerName) return null;
    const clean = playerName.toLowerCase().trim();
    const normalizedClean = normalizeSearchText(clean);

    // 1. Match ID esatto
    const byId = allPlayersWithSquad.find(item => item.player.id === clean);
    if (byId) return byId;

    // 2. Match Nome esatto (o normalizzato senza accenti/diacritici)
    const byName = allPlayersWithSquad.find(item => {
      const normItem = normalizeSearchText(item.player.name);
      return item.player.name.toLowerCase().trim() === clean || normItem === normalizedClean;
    });
    if (byName) return byName;

    // 3. Match Parziale / Include (con supporto caratteri stranieri)
    const byIncludes = allPlayersWithSquad.find(item =>
      matchesSearch(item.player.name, clean) || matchesSearch(clean, item.player.name)
    );
    if (byIncludes) return byIncludes;

    // 4. Match Cognome
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      const lastName = parts[parts.length - 1];
      const byLastName = allPlayersWithSquad.find(item =>
        matchesSearch(item.player.name, lastName)
      );
      if (byLastName) return byLastName;
    }
    return null;
  };

  const handleApproveProposal = (proposalId: string, playerId: string, finalNote: string) => {
    if (onUpdatePlayerNote) {
      onUpdatePlayerNote(playerId, finalNote);
    }
    setProposalStatuses(prev => {
      const next = { ...prev, [proposalId]: 'approved' as const };
      try {
        localStorage.setItem('fm26_note_proposals_status', JSON.stringify(next));
      } catch {}
      return next;
    });
    const found = allPlayersWithSquad.find(i => i.player.id === playerId);
    triggerToast(`Nota aggiornata con successo per ${found ? found.player.name : 'il calciatore'}!`);
  };

  const handleRejectProposal = (proposalId: string) => {
    setProposalStatuses(prev => {
      const next = { ...prev, [proposalId]: 'rejected' as const };
      try {
        localStorage.setItem('fm26_note_proposals_status', JSON.stringify(next));
      } catch {}
      return next;
    });
    triggerToast("Proposta di nota scartata.");
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastHandledPromptRef = useRef<{ text: string; time: number } | null>(null);
  const isSendingRef = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Auto-resize textarea when input content changes
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, 180);
      textareaRef.current.style.height = `${Math.max(42, newHeight)}px`;
    }
  }, [input]);

  // Chiudi lightbox screenshot con tasto Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && lightboxImage) {
        setLightboxImage(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxImage]);

  const handleOpenSaveModal = (msg: Message) => {
    setSaveModalMsg(msg);
    // Auto generate a title based on content preview
    const firstLine = msg.content.trim().split('\n')[0].replace(/^#+\s*/, '').replace(/\*\*/g, '');
    const cleanTitle = firstLine.length > 50 ? `${firstLine.substring(0, 50)}...` : firstLine || 'Osservazione AI Copilot';
    setSaveTitle(cleanTitle);
    setSaveCategory('tactics');
    setSaveContent(msg.content);
    setSaveTags('AI Copilot, Analisi');
  };

  const handleConfirmSaveToMemory = () => {
    if (!saveModalMsg || !saveTitle.trim() || !saveContent.trim() || !onSaveNoteToMemory) return;

    onSaveNoteToMemory({
      title: saveTitle.trim(),
      category: saveCategory,
      content: saveContent.trim(),
      createdAt: currentDate,
      tags: saveTags.split(',').map(t => t.trim()).filter(Boolean),
      isAiGenerated: true
    });

    setSavedMsgIds(prev => new Set(prev).add(saveModalMsg.id));
    setSaveModalMsg(null);

    const catLabel = saveCategory === 'tactics' ? 'Analisi Tattica' : saveCategory === 'rotation' ? 'Rotazioni' : saveCategory === 'scouting' ? 'Calciomercato' : 'Varie';
    setToastMessage(`Nota salvata in "${catLabel}"! Disponibile nelle Note e per le prossime chat.`);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Player Growth and Attribute Variations calculation
  const growthStats = useMemo(() => {
    const firstTeamVariations = players.map(p => {
      const variation = getPlayerLastVariation(p);
      const effAge = getEffectiveAge(p, currentDate);
      return {
        player: p,
        effAge,
        squad: teamName || 'Prima Squadra',
        variation,
      };
    });

    const youthVariations = (youthSquads || []).flatMap(ys =>
      (ys.players || []).map(p => {
        const variation = getPlayerLastVariation(p);
        const effAge = getEffectiveAge(p, currentDate);
        return {
          player: p,
          effAge,
          squad: ys.name,
          variation,
        };
      })
    );

    const allMonitored = [...firstTeamVariations, ...youthVariations];
    const withVariations = allMonitored.filter(
      (item): item is typeof item & { variation: NonNullable<typeof item.variation> } =>
        Boolean(item.variation)
    );

    const improved = withVariations.filter(item => {
      const v = item.variation;
      return v.status === 'improved' || v.caDiff > 0 || v.improvedCount > v.declinedCount;
    });

    const declined = withVariations.filter(item => {
      const v = item.variation;
      return v.status === 'declined' || v.caDiff < 0 || v.declinedCount > v.improvedCount;
    });

    const stable = withVariations.filter(item => {
      const v = item.variation;
      return v.status === 'stable' && v.caDiff === 0 && v.improvedCount === 0 && v.declinedCount === 0;
    });

    return {
      totalMonitored: withVariations.length,
      totalImproved: improved.length,
      totalDeclined: declined.length,
      totalStable: stable.length,
      improvedList: improved,
      declinedList: declined,
      stableList: stable,
      allWithVariations: withVariations,
    };
  }, [players, youthSquads, teamName, currentDate]);

  // Build full context helper with options (Full Memory mode)
  const buildFullSquadContext = (cfg = payloadConfig) => {
    return {
      club: teamName || "La Tua Squadra FC",
      currentDate,
      phaseInfo: {
        phaseName: phaseInfo?.phaseName,
        currentMonth: phaseInfo?.currentMonth,
        leaguePosition: phaseInfo?.leaguePosition,
        clPoints: phaseInfo?.clPoints,
        objectives: phaseInfo?.objectives,
      },
      tacticalNotes: (tacticalNotes || []).map(n => ({
        category: n.category,
        title: n.title,
        content: n.content,
        createdAt: n.createdAt
      })),
      competitionsAndStandings: {
        leagueName: (fixtures || []).find(f => f.competition?.toLowerCase().includes('league') || f.competition?.toLowerCase().includes('serie') || f.competition?.toLowerCase().includes('liga'))?.competition || 'Premier League',
        totalTeamsInLeague: (standings || []).length,
        userTeamStanding: userTeamRow ? {
          position: userTeamRow.position,
          team: userTeamRow.team,
          played: userTeamRow.played,
          won: userTeamRow.won,
          drawn: userTeamRow.drawn,
          lost: userTeamRow.lost,
          goalsFor: userTeamRow.gf,
          goalsAgainst: userTeamRow.ga,
          goalDifference: userTeamRow.gd,
          points: userTeamRow.points,
          form: userTeamRow.form || undefined,
          pointsBehindLeader: (standings && standings[0] && standings[0].team.toLowerCase() !== userTeamRow.team.toLowerCase())
            ? Math.max(0, standings[0].points - userTeamRow.points)
            : 0,
          leaderTeam: standings && standings[0]
            ? `${standings[0].team} (${standings[0].points} pt, Diff Reti: ${standings[0].gd > 0 ? `+${standings[0].gd}` : standings[0].gd})`
            : undefined,
        } : null,
        standings: (standings || []).map(r => ({
          position: r.position,
          team: r.team,
          played: r.played,
          won: r.won,
          drawn: r.drawn,
          lost: r.lost,
          gf: r.gf,
          ga: r.ga,
          gd: r.gd,
          points: r.points,
          form: r.form || undefined,
          isUserTeam: Boolean(
            r.team.toLowerCase().includes(teamName.toLowerCase()) ||
            teamName.toLowerCase().includes(r.team.toLowerCase())
          )
        })),
        activeCompetitions: calendarCompetitions.map(compName => {
          const compFixtures = (fixtures || []).filter(f => f.competition === compName);
          const played = compFixtures.filter(f => f.status === 'Giocata');
          const upcoming = compFixtures.filter(f => f.status === 'In Arrivo');
          const nextMatch = upcoming[0];
          return {
            competition: compName,
            targetGoal: effectiveCompetitionGoals[compName] || undefined,
            totalFixturesInCalendar: compFixtures.length,
            playedCount: played.length,
            upcomingCount: upcoming.length,
            nextMatch: nextMatch ? {
              opponent: nextMatch.opponent,
              venue: nextMatch.venue,
              date: nextMatch.date,
              importance: nextMatch.importance,
            } : null
          };
        })
      },
      gamePlan: (effectiveGamePlan && payloadConfig.includeGamePlan) ? {
        opponent: effectiveGamePlan.opponent,
        venue: effectiveGamePlan.venue,
        competition: effectiveGamePlan.competition,
        opponentStyle: effectiveGamePlan.opponentStyle,
        strategicPriority: effectiveGamePlan.strategicPriority,
        opponentFormation: effectiveGamePlan.opponentFormation,
        opponentMentality: effectiveGamePlan.opponentMentality,
        opponentTacticalNotes: effectiveGamePlan.opponentTacticalNotes || undefined,
        totalOpponentPlayersLoaded: (effectiveGamePlan.opponentPlayers || []).length,
        opponentPlayers: (effectiveGamePlan.opponentPlayers || []).map(p => ({
          name: p.name,
          position: p.position,
          qualities: p.qualities || undefined,
          weaknesses: p.weaknesses || undefined,
          notes: p.notes || undefined,
        })),
        aiMatchPlanReport: effectiveGamePlan.aiMatchPlan || undefined,
        hasGeneratedReport: Boolean(effectiveGamePlan.aiMatchPlan),
        managerPersonalNotes: effectiveGamePlan.managerNotes || undefined,
        lastUpdated: effectiveGamePlan.lastUpdated || undefined,
      } : undefined,
      tactic: {
        name: tactic.name,
        formation: tactic.formation,
        mentality: tactic.mentality,
        pressing: tactic.pressing,
        lineOfEngagement: tactic.lineOfEngagement,
        defensiveLine: tactic.defensiveLine,
        width: tactic.width,
        tempo: tactic.tempo,
        focus: tactic.focus,
        keyRoles: tactic.keyRoles,
        positions: tactic.positions.map(p => ({
          position: p.position,
          role: p.role,
          duty: p.duty,
          assignedPlayerName: players.find(pl => pl.id === p.playerId)?.name || 'Non assegnato'
        }))
      },
      allPlayers: players.map(p => {
        const effAge = getEffectiveAge(p, currentDate);
        const variation = getPlayerLastVariation(p);
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
        const appearances = ext.appearances !== undefined ? ext.appearances : parsed.appearances;
        const goals = ext.goals !== undefined ? ext.goals : parsed.goals;
        const assists = ext.assists !== undefined ? ext.assists : parsed.assists;
        const avgRating = ext.avgRating !== undefined ? ext.avgRating : parsed.avgRating;
        const loanClub = p.loanClub || parsed.cleanClubMention || (onLoan ? "Club esterno non specificato" : undefined);
        const loanPerformanceStats = p.loanPerformanceStats || (onLoan ? {
          appearances: appearances ?? 0,
          subAppearances: parsed.subAppearances || ext.subAppearances || 0,
          goals: goals ?? 0,
          assists: assists ?? 0,
          avgRating: avgRating ?? 6.75,
          minutes: ext.minutesPlayed || parsed.minutesPlayed,
          summary: parsed.formattedStatsSummary || "In prestito",
          hasQuantitativeStats: true,
          noteText: (p.notes && p.notes.trim()) ? p.notes.trim() : undefined,
        } : (parsed.hasQuantitativeStats ? {
          appearances,
          subAppearances: parsed.subAppearances || ext.subAppearances || 0,
          goals,
          assists,
          avgRating,
          minutes: ext.minutesPlayed || parsed.minutesPlayed,
          summary: parsed.formattedStatsSummary,
          hasQuantitativeStats: true,
          noteText: (p.notes && p.notes.trim()) ? p.notes.trim() : undefined,
        } : undefined));

        return {
          name: p.name,
          number: p.number,
          position: p.position,
          secondaryPositions: p.secondaryPositions,
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
          injuryRisk: p.injuryRisk,
          status: p.status,
          homegrown: p.homegrown,
          appearances: appearances ?? (onLoan ? 0 : undefined),
          goals: goals ?? (onLoan ? 0 : undefined),
          assists: assists ?? (onLoan ? 0 : undefined),
          avgRating: avgRating ?? (onLoan ? 6.75 : undefined),
          loanPerformanceStats,
          technicalAttributes: p.technicalAttributes,
          mentalAttributes: p.mentalAttributes,
          physicalAttributes: p.physicalAttributes,
          goalkeepingAttributes: p.goalkeepingAttributes,
          personalityAttributes: p.personalityAttributes,
          positionsDetail: p.positionsDetail,
          notes: (p.notes && p.notes.trim().length > 0) ? p.notes.trim() : undefined,
          hasCopilotNote: (p.notes && isCopilotNote(p.notes)) ? true : undefined,
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
            // Dati temporali del confronto
            comparisonStartDate: variation.previousDate,
            comparisonEndDate: variation.date,
            daysElapsed: variation.daysElapsed,
            monthsElapsed: variation.monthsElapsed,
            timeSpanLabel: variation.timeSpanLabel,
            caPacePerMonth: variation.caPacePerMonth,
            paceAssessment: variation.paceAssessment,
            paceLabel: variation.paceLabel,
          } : undefined,
          attributeHistorySnapshotsCount: (p.attributeHistory || []).length,
          attributeHistoryTimeline: (p.attributeHistory && p.attributeHistory.length > 0) ? p.attributeHistory.map(h => ({
            date: h.date,
            ca: h.ca,
            pa: h.pa,
          })) : undefined,
        };
      }),
      playersAvailableForYouthMatches: players
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
          rule: "Calciatore della Prima Squadra autorizzato a giocare le partite delle formazioni giovanili",
          notes: (p.notes && p.notes.trim().length > 0) ? p.notes.trim() : undefined,
        })),
      playersCurrentlyOnLoan: getAllLoanedPlayersEnriched(players, youthSquads || []),
      officialLoanSummary: {
        totalPlayersCurrentlyOnLoan: getAllLoanedPlayersEnriched(players, youthSquads || []).length,
        activeLoanPlayerNames: getAllLoanedPlayersEnriched(players, youthSquads || []).map(p => p.name),
        playersWithRecordedLoanStats: getAllLoanedPlayersEnriched(players, youthSquads || []).map(p =>
          `${p.name} (${p.loanClub || 'Club esterno'} - ${p.position}): ${p.loanPerformanceStats?.summary || p.notes || 'In prestito'}`
        ),
        allLoanProfilesTable: getAllLoanedPlayersEnriched(players, youthSquads || []).map(p => ({
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
        officialNotice: "ATTENZIONE COPILOT: I dati quantitativi e qualitativi dei giocatori in prestito provengono sia dai campi sia dalle note salvate dal Manager (sintetizzati in loanPerformanceStats e nei campi numerici goals/assists/avgRating/appearances). Leggi TUTTI i profili senza escluderne alcuno e applica il modello a tutti i calciatori in prestito (inclusi Zedníček, Turull, Behiratche, Kern, Vera, Nisi, Piñón e ogni altro elemento).",
      },
      playersWithNotes: [
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
      ],
      playersWithNotesAndLoans: [
        ...players
          .filter(p => (p.notes && p.notes.trim().length > 0) || Boolean(p.isOnLoan) || Boolean(p.loanClub && p.loanClub.trim()))
          .map(p => ({
            ...enrichPlayerWithLoanStats(p),
            squad: 'Prima Squadra',
            hasCopilotNote: (p.notes && isCopilotNote(p.notes)) ? true : undefined,
          })),
        ...(youthSquads || []).flatMap(ys =>
          (ys.players || [])
            .filter(p => (p.notes && p.notes.trim().length > 0) || Boolean(p.isOnLoan) || Boolean(p.loanClub && p.loanClub.trim()))
            .map(p => ({
              ...enrichPlayerWithLoanStats(p),
              squad: ys.name,
              hasCopilotNote: (p.notes && isCopilotNote(p.notes)) ? true : undefined,
            }))
        ),
      ],
      playersWithCopilotAgreedNotes: [
        ...players
          .filter(p => p.notes && isCopilotNote(p.notes))
          .map(p => ({
            squad: 'Prima Squadra',
            name: p.name,
            position: p.position,
            age: getEffectiveAge(p, currentDate),
            ca: p.ca,
            pa: p.pa,
            copilotAgreedNote: p.notes!.trim(),
            context: "Nota concordata in discussione tra Manager e Co-Allenatore (contrassegnata con tag Copilot/AI)",
          })),
        ...(youthSquads || []).flatMap(ys =>
          (ys.players || [])
            .filter(p => p.notes && isCopilotNote(p.notes))
            .map(p => ({
              squad: ys.name,
              name: p.name,
              position: p.position,
              age: getEffectiveAge(p, currentDate),
              ca: p.ca,
              pa: p.pa,
              copilotAgreedNote: p.notes!.trim(),
              context: "Nota concordata in discussione tra Manager e Co-Allenatore (contrassegnata con tag Copilot/AI)",
            }))
        ),
      ],
      squadGrowthAndVariations: {
        description: "Tracciamento storico e incrementi/decrementi di crescita dei giocatori (CA, PA e singoli attributi FM tecnici, mentali e fisici) ricavati dai confronti temporali tra importazioni CSV / rilevazioni.",
        totalPlayersMonitored: growthStats.totalMonitored,
        totalImprovedPlayers: growthStats.totalImproved,
        totalDeclinedPlayers: growthStats.totalDeclined,
        totalStablePlayers: growthStats.totalStable,
        improvedPlayersList: growthStats.improvedList.map(item => {
          const v = item.variation!;
          return {
            name: item.player.name,
            squad: item.squad,
            position: item.player.position,
            age: item.effAge,
            ca: item.player.ca,
            caDiff: v.caDiff > 0 ? `+${v.caDiff}` : `${v.caDiff}`,
            paDiff: v.paDiff !== 0 ? (v.paDiff > 0 ? `+${v.paDiff}` : `${v.paDiff}`) : '0',
            improvedAttributesCount: v.improvedCount,
            improvedAttributesSummary: (v.improvedAttrs || []).map(a => `${a.name} (+${a.diff}) [da ${a.oldVal} a ${a.newVal}]`).join(', '),
            recordedDate: v.date,
            formattedDate: formatVariationDate(v.timestamp, v.date),
            // Dati temporali e ritmo di crescita
            comparisonStartDate: v.previousDate,
            comparisonEndDate: v.date,
            timeSpanLabel: v.timeSpanLabel,
            daysElapsed: v.daysElapsed,
            monthsElapsed: v.monthsElapsed,
            caPacePerMonth: v.caPacePerMonth,
            paceLabel: v.paceLabel,
            historySnapshotsCount: (item.player.attributeHistory || []).length,
          };
        }),
        declinedPlayersList: growthStats.declinedList.map(item => {
          const v = item.variation!;
          return {
            name: item.player.name,
            squad: item.squad,
            position: item.player.position,
            age: item.effAge,
            ca: item.player.ca,
            caDiff: `${v.caDiff}`,
            paDiff: v.paDiff !== 0 ? (v.paDiff > 0 ? `+${v.paDiff}` : `${v.paDiff}`) : '0',
            declinedAttributesCount: v.declinedCount,
            declinedAttributesSummary: (v.declinedAttrs || []).map(a => `${a.name} (${a.diff}) [da ${a.oldVal} a ${a.newVal}]`).join(', '),
            recordedDate: v.date,
            formattedDate: formatVariationDate(v.timestamp, v.date),
            // Dati temporali
            comparisonStartDate: v.previousDate,
            comparisonEndDate: v.date,
            timeSpanLabel: v.timeSpanLabel,
            daysElapsed: v.daysElapsed,
            monthsElapsed: v.monthsElapsed,
            caPacePerMonth: v.caPacePerMonth,
            paceLabel: v.paceLabel,
            historySnapshotsCount: (item.player.attributeHistory || []).length,
          };
        }),
        stablePlayersList: growthStats.stableList.map(item => {
          const v = item.variation!;
          return {
            name: item.player.name,
            squad: item.squad,
            position: item.player.position,
            age: item.effAge,
            ca: item.player.ca,
            recordedDate: v.date,
            formattedDate: formatVariationDate(v.timestamp, v.date),
            comparisonStartDate: v.previousDate,
            comparisonEndDate: v.date,
            timeSpanLabel: v.timeSpanLabel,
          };
        }),
      },
      calendarPerformanceSummary: getCalendarPerformancePayload(fixtures || []),
      calendarMatchNotes: (fixtures || [])
        .filter(f => f.tacticalNotes && f.tacticalNotes.trim().length > 0)
        .map(f => {
          const res = getFixtureResult(f);
          return {
            date: f.date,
            opponent: f.opponent,
            venue: f.venue,
            competition: f.competition,
            status: f.status,
            score: f.score || undefined,
            outcome: res?.outcome || f.outcome || undefined,
            scorers: (Array.isArray(f.scorers) && f.scorers.length > 0) ? f.scorers : undefined,
            notes: f.tacticalNotes!.trim(),
          };
        }),
      allFixtures: (fixtures || []).map(f => {
        const res = getFixtureResult(f);
        return {
          date: f.date,
          opponent: f.opponent,
          venue: f.venue,
          competition: f.competition,
          importance: f.importance,
          status: f.status,
          score: f.score,
          outcome: res?.outcome || f.outcome || undefined,
          scorers: (Array.isArray(f.scorers) && f.scorers.length > 0) ? f.scorers : undefined,
          tacticalNotes: (f.tacticalNotes && f.tacticalNotes.trim().length > 0) ? f.tacticalNotes.trim() : undefined,
        };
      }),
      scoutingTargets: (targets || []).map(t => {
        const effAge = getEffectiveAge(t, currentDate);
        const base = {
          id: t.id,
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
          height: t.height,
          prospectTag: effAge < 22 ? ((t.pa || 0) >= 170 ? 'Wonderkid' : (t.pa || 0) >= 150 ? 'Top Prospect' : (t.pa || 0) >= 130 ? 'Top Talent' : undefined) : undefined,
          homegrown: t.homegrown,
          recommendation: t.recommendation,
          notes: t.notes,
        };

        if (cfg.scoutingDetailMode === 'summary') {
          return base;
        }

        return {
          ...base,
          technicalAttributes: t.technicalAttributes,
          mentalAttributes: t.mentalAttributes,
          physicalAttributes: t.physicalAttributes,
          goalkeepingAttributes: t.goalkeepingAttributes,
          personalityAttributes: t.personalityAttributes,
          positionsDetail: t.positionsDetail,
        };
      }),
      youthSquads: !cfg.includeYouth
        ? (youthSquads || []).map(ys => ({
            squadId: ys.id,
            squadName: ys.name,
            totalPlayers: ys.players.length,
            isOmittedForPayloadOptimization: true,
          }))
        : (youthSquads || []).map(ys => ({
            squadId: ys.id,
            squadName: ys.name,
            category: ys.category || 'Giovanile',
            totalPlayers: ys.players.length,
            notes: ys.notes || undefined,
            players: ys.players.map(p => {
              const effAge = getEffectiveAge(p, currentDate);
              const variation = getPlayerLastVariation(p);
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
              const appearances = ext.appearances !== undefined ? ext.appearances : parsed.appearances;
              const goals = ext.goals !== undefined ? ext.goals : parsed.goals;
              const assists = ext.assists !== undefined ? ext.assists : parsed.assists;
              const avgRating = ext.avgRating !== undefined ? ext.avgRating : parsed.avgRating;
              const loanClub = p.loanClub || parsed.cleanClubMention || (onLoan ? "Club esterno non specificato" : undefined);
              const loanPerformanceStats = p.loanPerformanceStats || (onLoan ? {
                appearances: appearances ?? 0,
                subAppearances: parsed.subAppearances || ext.subAppearances || 0,
                goals: goals ?? 0,
                assists: assists ?? 0,
                avgRating: avgRating ?? 6.75,
                minutes: ext.minutesPlayed || parsed.minutesPlayed,
                summary: parsed.formattedStatsSummary || "In prestito",
                hasQuantitativeStats: true,
                noteText: (p.notes && p.notes.trim()) ? p.notes.trim() : undefined,
              } : (parsed.hasQuantitativeStats ? {
                appearances,
                subAppearances: parsed.subAppearances || ext.subAppearances || 0,
                goals,
                assists,
                avgRating,
                minutes: ext.minutesPlayed || parsed.minutesPlayed,
                summary: parsed.formattedStatsSummary,
                hasQuantitativeStats: true,
                noteText: (p.notes && p.notes.trim()) ? p.notes.trim() : undefined,
              } : undefined));

              return {
                name: p.name,
                number: p.number,
                position: p.position,
                age: effAge,
                ca: p.ca || 120,
                pa: p.pa || 155,
                prospectTag: effAge < 22 ? ((p.pa || 0) >= 170 ? 'Wonderkid' : (p.pa || 0) >= 150 ? 'Top Prospect' : (p.pa || 0) >= 130 ? 'Top Talent' : undefined) : undefined,
                growthPotential: Math.max(0, (p.pa || 155) - (p.ca || 120)),
                isInjured: Boolean(p.isInjured),
                injuryNote: p.injuryNote || undefined,
                isOnLoan: onLoan,
                loanStatus: onLoan ? `IN PRESTITO ATTIVO (${loanClub ? `presso ${loanClub}` : 'club esterno'})` : 'IN ROSA / NON IN PRESTITO',
                loanClub,
                appearances: appearances ?? (onLoan ? 0 : undefined),
                goals: goals ?? (onLoan ? 0 : undefined),
                assists: assists ?? (onLoan ? 0 : undefined),
                avgRating: avgRating ?? (onLoan ? 6.75 : undefined),
                loanPerformanceStats,
                homegrown: p.homegrown,
                isKeyPlayer: p.isKeyPlayer,
                technicalAttributes: p.technicalAttributes,
                mentalAttributes: p.mentalAttributes,
                physicalAttributes: p.physicalAttributes,
                goalkeepingAttributes: p.goalkeepingAttributes,
                personalityAttributes: p.personalityAttributes,
                positionsDetail: p.positionsDetail,
                notes: (p.notes && p.notes.trim().length > 0) ? p.notes.trim() : undefined,
                hasCopilotNote: (p.notes && isCopilotNote(p.notes)) ? true : undefined,
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
                  // Dati temporali del confronto
                  comparisonStartDate: variation.previousDate,
                  comparisonEndDate: variation.date,
                  daysElapsed: variation.daysElapsed,
                  monthsElapsed: variation.monthsElapsed,
                  timeSpanLabel: variation.timeSpanLabel,
                  caPacePerMonth: variation.caPacePerMonth,
                  paceAssessment: variation.paceAssessment,
                  paceLabel: variation.paceLabel,
                } : undefined,
                attributeHistorySnapshotsCount: (p.attributeHistory || []).length,
              };
            })
          }))
    };
  };

  // Dispatcher for building squad context (Targeted Smart Focus vs Full Memory)
  const buildSquadContext = (cfg = payloadConfig, customQuery = '') => {
    const mode = cfg.contextMode || 'smart';
    if (mode === 'smart') {
      const intents = detectQueryIntents(
        customQuery,
        messages.map(m => ({ role: m.role, content: m.content })),
        players,
        youthSquads || [],
        targets || [],
        fixtures || [],
        effectiveGamePlan,
        'smart',
        cfg,
        currentDate || "28 Ottobre 2026"
      );
      const targetedContext = buildTargetedSquadContext({
        teamName: teamName || "La Tua Squadra FC",
        currentDate: currentDate || "28 Ottobre 2026",
        phaseInfo,
        tactic,
        players,
        youthSquads: youthSquads || [],
        targets: targets || [],
        fixtures: fixtures || [],
        standings: standings || [],
        calendarCompetitions,
        effectiveCompetitionGoals,
        userTeamRow,
        effectiveGamePlan,
        tacticalNotes: tacticalNotes || [],
        growthStats,
        payloadConfig: cfg,
        intents,
      });

      const { truncatedContext } = truncateSquadAndTactic({
        prompt: customQuery,
        recentMessages: messages.map(m => ({ role: m.role, content: m.content })),
        squadContext: targetedContext,
        players,
        tactic,
        youthSquads: youthSquads || [],
        targets: targets || [],
        fixtures: fixtures || [],
        gamePlan: effectiveGamePlan,
        tacticalNotes: tacticalNotes || [],
        standings: standings || [],
        currentDate: currentDate || "28 Ottobre 2026",
        teamName: teamName || "La Tua Squadra FC",
      });

      return truncatedContext;
    }
    return buildFullSquadContext(cfg);
  };

  // Dynamic memory payload breakdown
  const payloadBreakdown: PayloadBreakdown = useMemo(() => {
    const fullCtx = buildSquadContext(payloadConfig);
    const playersBytes = JSON.stringify(fullCtx.allPlayers || []).length;
    const scoutingBytes = JSON.stringify(fullCtx.scoutingTargets || []).length;
    const youthBytes = JSON.stringify(fullCtx.youthSquads || []).length;
    const gamePlanBytes = payloadConfig.includeGamePlan ? JSON.stringify(fullCtx.gamePlan || {}).length : 0;
    const notesBytes = JSON.stringify(fullCtx.tacticalNotes || []).length;
    const availableForYouthBytes = JSON.stringify(fullCtx.playersAvailableForYouthMatches || []).length;
    const fixturesBytes = JSON.stringify(fullCtx.allFixtures || []).length + JSON.stringify(fullCtx.calendarPerformanceSummary || {}).length + JSON.stringify(fullCtx.calendarMatchNotes || []).length;
    const standingsBytes = JSON.stringify(fullCtx.competitionsAndStandings || {}).length;
    const growthBytes = JSON.stringify(fullCtx.squadGrowthAndVariations || {}).length;

    const msgsToSend = payloadConfig.historyLimit > 0
      ? messages.slice(-payloadConfig.historyLimit)
      : messages;
    const chatBytes = JSON.stringify(msgsToSend).length;

    const baseOverhead = 4000; // system instructions, prompts, formatting
    const totalBytes = playersBytes + scoutingBytes + youthBytes + gamePlanBytes + notesBytes + availableForYouthBytes + fixturesBytes + standingsBytes + growthBytes + chatBytes + baseOverhead;
    const estimatedTokens = Math.round(totalBytes / 3.7);
    const fixturesPlayedCount = (fixtures || []).filter(f => f.status === 'Giocata' && Boolean(f.score)).length;
    const calendarNotesCount = (fixtures || []).filter(f => f.tacticalNotes && f.tacticalNotes.trim().length > 0).length;

    const playerNotesCount = (players || []).filter(p => p.notes && p.notes.trim().length > 0).length +
      (youthSquads || []).reduce((acc, ys) => acc + (ys.players || []).filter(p => p.notes && p.notes.trim().length > 0).length, 0);
    const playersOnLoanCount = (players || []).filter(p => p.isOnLoan).length +
      (youthSquads || []).reduce((acc, ys) => acc + (ys.players || []).filter(p => p.isOnLoan).length, 0);

    return {
      playersCount: players.length,
      playersBytes,
      playerNotesCount,
      playersOnLoanCount,
      scoutingCount: (targets || []).length,
      scoutingBytes,
      youthCount: (youthSquads || []).reduce((acc, s) => acc + (s.players?.length || 0), 0),
      youthBytes,
      notesCount: (tacticalNotes || []).length,
      notesBytes,
      fixturesCount: (fixtures || []).length,
      fixturesPlayedCount,
      calendarNotesCount,
      fixturesBytes,
      standingsCount: (standings || []).length,
      standingsBytes,
      competitionsCount: calendarCompetitions.length,
      improvedPlayersCount: growthStats.totalImproved,
      declinedPlayersCount: growthStats.totalDeclined,
      growthBytes,
      hasGamePlan: Boolean(effectiveGamePlan),
      gamePlanBytes,
      chatMessagesCount: messages.length,
      chatBytes,
      totalBytes,
      estimatedTokens,
    };
  }, [players, targets, youthSquads, tacticalNotes, fixtures, standings, calendarCompetitions, effectiveCompetitionGoals, userTeamRow, effectiveGamePlan, messages, payloadConfig, currentDate, growthStats]);

  const handleRefreshLiveCount = async () => {
    if (!hasCustomApiKey()) {
      if (onOpenApiKeyModal) onOpenApiKeyModal();
      setToastMessage('Inserisci la tua API Key Gemini per calcolare i token in tempo reale.');
      setTimeout(() => setToastMessage(null), 3500);
      return;
    }

    setIsRecalculating(true);
    try {
      const currentCtx = buildSquadContext(payloadConfig);
      const msgsToSend = payloadConfig.historyLimit > 0
        ? messages.slice(-payloadConfig.historyLimit)
        : messages;

      const data = await safeFetchJson<{ totalTokens?: number }>('/api/gemini/count-tokens', {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          messages: msgsToSend.map(m => ({ role: m.role, content: m.content })),
          squadContext: currentCtx
        })
      });
      if (data.totalTokens) {
        const liveUsage: TokenUsageStats = {
          promptTokens: data.totalTokens,
          candidatesTokens: tokenUsage?.candidatesTokens || 0,
          totalTokens: data.totalTokens + (tokenUsage?.candidatesTokens || 0),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setTokenUsage(liveUsage);
        localStorage.setItem('fm26_token_usage', JSON.stringify(liveUsage));
        setToastMessage(`Conteggio aggiornato: ~${data.totalTokens.toLocaleString()} token.`);
        setTimeout(() => setToastMessage(null), 3000);
      }
    } catch (err) {
      console.error('Failed to recount tokens:', err);
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: 'm_init_' + Date.now(),
        role: 'assistant',
        content: INITIAL_GREETING,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setToastMessage('Cronologia chat azzerata! Memoria operativa liberata.');
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleSend = async (customPrompt?: string) => {
    const textToSend = customPrompt || input;
    const currentAttachments = [...attachments];
    if ((!textToSend.trim() && currentAttachments.length === 0) || loading || isSendingRef.current) return;
    isSendingRef.current = true;

    try {
      if (!hasCustomApiKey()) {
        if (onOpenApiKeyModal) {
          onOpenApiKeyModal();
        }
        setMessages(prev => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'user',
            content: textToSend.trim() || (currentAttachments.length > 0 ? "Analisi allegato/screenshot" : ""),
            attachments: currentAttachments.length > 0 ? currentAttachments : undefined,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          },
          {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: "⚠️ **Chiave API Google Gemini richiesta**\n\nQuesta applet richiede l'inserimento della tua **Google Gemini API Key personale gratuita** (modalità BYOK) per dialogare con il Co-Allenatore e analizzare la carriera o gli screenshot allegati.\n\nHo aperto per te la schermata di configurazione: inserisci la tua chiave e premi **'Verifica e Salva'** per iniziare subito.",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
        setAttachments([]);
        return;
      }

    const defaultAttachmentText = currentAttachments.some(a => a.type === 'image')
      ? "Analizza questo screenshot / allegato per fornirmi valutazioni e indicazioni immediate."
      : "Analizza questo file / allegato per la situazione contingente.";

    const finalContent = textToSend.trim() || defaultAttachmentText;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: finalContent,
      attachments: currentAttachments.length > 0 ? currentAttachments : undefined,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    setAttachments([]);
    if (!customPrompt) {
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = '42px';
      }
    }
    setLoading(true);

    const mode = payloadConfig.contextMode || 'smart';
    const intents = detectQueryIntents(
      finalContent,
      messages.map(m => ({ role: m.role, content: m.content })),
      players,
      youthSquads || [],
      targets || [],
      fixtures || [],
      effectiveGamePlan,
      mode,
      payloadConfig,
      currentDate || "28 Ottobre 2026"
    );

    const rawSquadContext = mode === 'smart'
      ? buildTargetedSquadContext({
          teamName: teamName || "La Tua Squadra FC",
          currentDate: currentDate || "28 Ottobre 2026",
          phaseInfo,
          tactic,
          players,
          youthSquads: youthSquads || [],
          targets: targets || [],
          fixtures: fixtures || [],
          standings: standings || [],
          calendarCompetitions,
          effectiveCompetitionGoals,
          userTeamRow,
          effectiveGamePlan,
          tacticalNotes: tacticalNotes || [],
          growthStats,
          payloadConfig,
          intents,
        })
      : buildFullSquadContext(payloadConfig);

    // Elaborazione e troncamento mirato con dataTruncator (Smart Slicing Architecture)
    const { truncatedContext: squadContext } = truncateSquadAndTactic({
      prompt: finalContent,
      recentMessages: messages.map(m => ({ role: m.role, content: m.content })),
      squadContext: rawSquadContext,
      players,
      tactic,
      youthSquads: youthSquads || [],
      targets: targets || [],
      fixtures: fixtures || [],
      gamePlan: effectiveGamePlan,
      tacticalNotes: tacticalNotes || [],
      standings: standings || [],
      currentDate: currentDate || "28 Ottobre 2026",
      teamName: teamName || "La Tua Squadra FC",
    });

    const allMsgs = [...messages, userMsg];
    const msgsToSend = payloadConfig.historyLimit > 0
      ? allMsgs.slice(-payloadConfig.historyLimit)
      : allMsgs;

    // Per NON appesantire la memory nei turni successivi:
    // i messaggi storici precedenti trasmettono solo un compatto riferimento testuale,
    // mentre i dati binari pesanti dell'immagine vengono inviati ESCLUSIVAMENTE per il turno corrente.
    const formattedMsgsToSend = msgsToSend.map(m => {
      let content = m.content;
      if (m.attachments && m.attachments.length > 0 && m.id !== userMsg.id) {
        const attSummary = m.attachments.map(a => `[Allegato analizzato in precedenza: ${a.name}]`).join(', ');
        content = `${content}\n${attSummary}`;
      }
      return { role: m.role, content };
    });

    const assistantMsgId = (Date.now() + 1).toString();
    const shouldStream = payloadConfig.enableStreaming !== false;

    if (shouldStream) {
      // Inizializza messaggio assistente in stato streaming per feedback visivo immediato
      const initialAssistantMsg: Message = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        focusDomains: mode === 'smart' ? intents.targetedDomains : undefined,
        contextMode: mode,
        latencyReduction: mode === 'smart' ? intents.estimatedReductionPercent : undefined,
        isStreaming: true,
      };
      setMessages(prev => [...prev, initialAssistantMsg]);

      let accumulatedReply = '';
      let finalUsageData: TokenUsageStats | undefined;

      try {
        const response = await fetch('/api/gemini/chat/stream', {
          method: 'POST',
          headers: getApiHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            messages: formattedMsgsToSend,
            squadContext,
            model: payloadConfig.aiModel || 'gemini-3.8-flash',
            thinkingSpeed: payloadConfig.thinkingSpeed || 'turbo',
            attachments: currentAttachments.map(a => ({
              name: a.name,
              type: a.type,
              mimeType: a.mimeType,
              data: a.data,
              textContent: a.textContent,
            }))
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || `Errore server (${response.status})`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("Stream non disponibile");

        const decoder = new TextDecoder();
        let streamDone = false;
        let buffer = '';

        while (!streamDone) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const dataStr = trimmed.slice(5).trim();
            if (!dataStr) continue;

            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.error) {
                throw new Error(parsed.error);
              }
              if (parsed.reset) {
                accumulatedReply = '';
                setMessages(prev =>
                  prev.map(m => m.id === assistantMsgId ? { ...m, content: '' } : m)
                );
                continue;
              }
              if (parsed.chunk) {
                accumulatedReply += parsed.chunk;
                setMessages(prev =>
                  prev.map(m => m.id === assistantMsgId ? { ...m, content: accumulatedReply } : m)
                );
              }
              if (parsed.done) {
                streamDone = true;
                if (parsed.usage) {
                  finalUsageData = {
                    promptTokens: parsed.usage.promptTokens,
                    candidatesTokens: parsed.usage.candidatesTokens,
                    totalTokens: parsed.usage.totalTokens,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  };
                }
              }
            } catch (err: any) {
              if (err?.message && !err.message.includes('JSON')) {
                throw err;
              }
            }
          }
        }

        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: accumulatedReply || 'Nessuna risposta ricevuta.',
                  isStreaming: false,
                  usage: finalUsageData,
                }
              : m
          )
        );

        if (finalUsageData) {
          setTokenUsage(finalUsageData);
          localStorage.setItem('fm26_token_usage', JSON.stringify(finalUsageData));
        }
      } catch (streamErr: any) {
        console.warn("Stream interruption / error:", streamErr);

        // Se durante lo streaming abbiamo già accumulato un'analisi significativa (> 30 caratteri),
        // NON azzeriamo e NON effettuiamo una seconda chiamata duplicata!
        // Chiudiamo il messaggio mantenendo l'analisi già ricevuta.
        if (accumulatedReply.trim().length > 30) {
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: accumulatedReply,
                    isStreaming: false,
                    usage: finalUsageData,
                  }
                : m
            )
          );
          return;
        }

        const rawErr = String(streamErr?.message || streamErr || "");
        const isQuotaOrDemand =
          rawErr.includes("Quota") ||
          rawErr.includes("picco elevato") ||
          rawErr.includes("traffico") ||
          rawErr.includes("429") ||
          rawErr.includes("503") ||
          rawErr.includes("RESOURCE_EXHAUSTED") ||
          rawErr.includes("UNAVAILABLE");

        // Se l'errore è dovuto a quota temporanea o picchi di traffico su Gemini,
        // NON dobbiamo chiamare /api/gemini/chat perché genererebbe una seconda richiesta
        // duplicata consumando quota. Mostriamo l'avviso trasparente direttamente nel messaggio.
        if (isQuotaOrDemand) {
          const formattedContent = rawErr.startsWith('⚠️') ? rawErr : `⚠️ ${rawErr}`;
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: formattedContent,
                    isStreaming: false,
                  }
                : m
            )
          );
          return;
        }

        // Tentativo di fallback standard SOLO per errori di trasporto generici quando nessun dato è stato ricevuto
        try {
          const data = await safeFetchJson<{ reply?: string; error?: string; usage?: any }>('/api/gemini/chat', {
            method: 'POST',
            headers: getApiHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              messages: formattedMsgsToSend,
              squadContext,
              model: payloadConfig.aiModel || 'gemini-3.8-flash',
              thinkingSpeed: payloadConfig.thinkingSpeed || 'turbo',
              attachments: currentAttachments.map(a => ({
                name: a.name,
                type: a.type,
                mimeType: a.mimeType,
                data: a.data,
                textContent: a.textContent,
              }))
            })
          });

          if (data.reply) {
            const usageData: TokenUsageStats | undefined = data.usage ? {
              promptTokens: data.usage.promptTokens,
              candidatesTokens: data.usage.candidatesTokens,
              totalTokens: data.usage.totalTokens,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            } : undefined;

            setMessages(prev =>
              prev.map(m =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: data.reply!,
                      isStreaming: false,
                      usage: usageData,
                    }
                  : m
              )
            );

            if (usageData) {
              setTokenUsage(usageData);
              localStorage.setItem('fm26_token_usage', JSON.stringify(usageData));
            }
          } else {
            throw new Error(data.error || streamErr.message || 'Errore nella ricezione della risposta.');
          }
        } catch (fallbackErr: any) {
          const errorMsg = fallbackErr?.message || streamErr?.message || "Impossibile completare la richiesta. Riprova tra poco.";
          const formattedContent = errorMsg.startsWith('⚠️') ? errorMsg : `⚠️ ${errorMsg}`;
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: formattedContent,
                    isStreaming: false,
                  }
                : m
            )
          );
        }
      }
    } else {
      try {
        const data = await safeFetchJson<{ reply?: string; error?: string; usage?: any }>('/api/gemini/chat', {
          method: 'POST',
          headers: getApiHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            messages: formattedMsgsToSend,
            squadContext,
            model: payloadConfig.aiModel || 'gemini-3.8-flash',
            thinkingSpeed: payloadConfig.thinkingSpeed || 'turbo',
            attachments: currentAttachments.map(a => ({
              name: a.name,
              type: a.type,
              mimeType: a.mimeType,
              data: a.data,
              textContent: a.textContent,
            }))
          })
        });
        if (data.reply) {
          const usageData: TokenUsageStats | undefined = data.usage ? {
            promptTokens: data.usage.promptTokens,
            candidatesTokens: data.usage.candidatesTokens,
            totalTokens: data.usage.totalTokens,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          } : undefined;

          const assistantMsg: Message = {
            id: assistantMsgId,
            role: 'assistant',
            content: data.reply,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            usage: usageData,
            focusDomains: mode === 'smart' ? intents.targetedDomains : undefined,
            contextMode: mode,
            latencyReduction: mode === 'smart' ? intents.estimatedReductionPercent : undefined,
          };
          setMessages(prev => [...prev, assistantMsg]);

          if (usageData) {
            setTokenUsage(usageData);
            localStorage.setItem('fm26_token_usage', JSON.stringify(usageData));
          }
        } else {
          throw new Error(data.error || 'Nessuna risposta ricevuta dall\'assistente.');
        }
      } catch (err: any) {
        const errorMsg = err?.message || "Impossibile completare la richiesta. Riprova tra poco.";
        const formattedContent = errorMsg.startsWith('⚠️') ? errorMsg : `⚠️ ${errorMsg}`;
        setMessages(prev => [
          ...prev,
          {
            id: assistantMsgId,
            role: 'assistant',
            content: formattedContent,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      }
    }
  } finally {
    setLoading(false);
    isSendingRef.current = false;
  }
  };

  useEffect(() => {
    if (!initialPrompt || !initialPrompt.trim()) {
      return;
    }
    const trimmed = initialPrompt.trim();
    if (
      lastHandledPromptRef.current &&
      lastHandledPromptRef.current.text === trimmed &&
      Date.now() - lastHandledPromptRef.current.time < 2000
    ) {
      if (onClearInitialPrompt) {
        onClearInitialPrompt();
      }
      return;
    }
    lastHandledPromptRef.current = { text: trimmed, time: Date.now() };

    // Assicura che lo stato di input e l'eventuale textarea siano puliti all'invio dell'initialPrompt
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '42px';
    }

    // Pulisce immediatamente l'initialPrompt nel componente padre (App) per evitare riesecuzioni da re-render
    if (onClearInitialPrompt) {
      onClearInitialPrompt();
    }

    handleSend(trimmed);
  }, [initialPrompt]);

  const contextualData = useMemo(() => {
    return getContextualFixtures(fixtures || [], currentDate || "28 Ottobre 2026");
  }, [fixtures, currentDate]);
  const nextFixture = contextualData.nextFixture;
  const injuredPlayers = players.filter(p => p.isInjured);

  const quickSuggestions = [
    ...(standings && standings.length > 0 ? [{
      icon: <Trophy className="w-4 h-4 text-amber-400" />,
      title: userTeamRow ? `Classifica: ${userTeamRow.position}° Posto (${userTeamRow.points} pt)` : `Classifica (${standings.length} squadre)`,
      subtitle: userTeamRow
        ? `Forma: ${userTeamRow.form || 'N/D'} • Diff. Reti: ${userTeamRow.gd > 0 ? `+${userTeamRow.gd}` : userTeamRow.gd} • ${calendarCompetitions.length} tornei`
        : `Analisi punti, corsa al titolo, zona coppe e obiettivi`,
      prompt: `Analizza nel dettaglio la nostra situazione in classifica e nelle competizioni: quanti punti abbiamo, la nostra posizione rispetto alle rivali dirette e alla vetta, la forma recente e gli obiettivi da centrare nei vari tornei.`
    }] : []),
    ...(fixtures && fixtures.filter(f => f.status === 'Giocata' && Boolean(f.score)).length > 0 ? [{
      icon: <Calendar className="w-4 h-4 text-emerald-400" />,
      title: `Rendimento Calendario, Note & Marcatori (${fixtures.filter(f => f.status === 'Giocata' && Boolean(f.score)).length} gare)`,
      subtitle: "Bilancio gare, marcatori, media reti e note post-partita",
      prompt: `Analizza nel dettaglio il nostro Rendimento da Calendario: bilancio complessivo di vittorie/pareggi/sconfitte, media gol fatti e subiti, chi ha segnato i gol (classifica marcatori registrati nelle partite), le note tattiche salvate sulle gare e il trend recente dei risultati.`
    }] : []),
    ...(growthStats.totalMonitored > 0 ? [{
      icon: <TrendingUp className="w-4 h-4 text-emerald-400" />,
      title: `Crescita & Sviluppo Rosa (${growthStats.totalImproved > 0 ? `+${growthStats.totalImproved} in crescita` : `${growthStats.totalMonitored} monitorati`})`,
      subtitle: `${growthStats.totalImproved} cresciuti, ${growthStats.totalDeclined} in calo, ${growthStats.totalStable} stabili`,
      prompt: `Analizza nel dettaglio la crescita e lo sviluppo dei giocatori della nostra rosa: quali calciatori hanno registrato incrementi di Current Ability (CA) o miglioramenti nei singoli attributi (tecnici, mentali, fisici)? Chi è in calo o fermo? Fornisci un resoconto chiaro sui progressi e consigli di allenamento personalizzati.`
    }] : []),
    ...(fixtures && fixtures.filter(f => f.tacticalNotes && f.tacticalNotes.trim().length > 0).length > 0 ? [{
      icon: <FileText className="w-4 h-4 text-amber-400" />,
      title: `Note Partite Calendario (${fixtures.filter(f => f.tacticalNotes && f.tacticalNotes.trim().length > 0).length} con note)`,
      subtitle: "Resoconti post-gara, considerazioni e prestazioni dei singoli",
      prompt: `Analizza e riassumi le note tattiche e le considerazioni scritte sulle partite in calendario: quali indicazioni chiave emergono dalle gare giocate, prestazioni dei singoli, difficoltà superate e cambi decisivi?`
    }] : []),
    ...(players.some(p => p.availableForYouth && !p.isOnLoan) ? [{
      icon: <GraduationCap className="w-4 h-4 text-teal-400" />,
      title: `Disp. Partite Giovanili (${players.filter(p => p.availableForYouth && !p.isOnLoan).length} giocatori)`,
      subtitle: "Giocatori di 1ª squadra disponibili per minutaggio nelle giovanili",
      prompt: `Quali giocatori della prima squadra hanno il flag "disponibile per le partite delle giovanili"? Spiegami per quale squadra giovanile sono autorizzati a giocare, il minutaggio consentito e come gestire la loro alternanza tra prima squadra e vivaio.`
    }] : []),
    ...(players.some(p => (p.notes && p.notes.trim().length > 0) || p.isOnLoan) || (youthSquads || []).some(ys => ys.players.some(p => (p.notes && p.notes.trim().length > 0) || p.isOnLoan)) ? [{
      icon: <FileText className="w-4 h-4 text-sky-400" />,
      title: "Rendimento Prestiti & Note Giocatori",
      subtitle: "Tabellini prestiti (gol, assist, media voto, clean sheet) e appunti rose",
      prompt: `Analizza le note dei giocatori nelle nostre rose e i tabellini di chi è in prestito: riassumi le loro prestazioni (gol segnati, assist, media voto, porte inviolate nel club di prestito) e gli appunti registrati dal manager.`
    }] : []),
    ...(players.length > 0 ? [{
      icon: <UserCheck className="w-4 h-4 text-teal-400" />,
      title: "Proponi Note & Strategie Calciatori",
      subtitle: "Il Co-Allenatore formula note e strategie con conferma prima di applicarle",
      prompt: `Valuta la situazione dei nostri calciatori (giovani ad alto potenziale, elementi in prestito o giocatori chiave con offerte di mercato): consiglia una strategia tecnica o di mercato specifica e proponimi una nota sintetica e chiara da applicare alle schede giocatore previa mia conferma e revisione.`
    }] : []),
    ...(targets && targets.length > 0 ? [{
      icon: <Compass className="w-4 h-4 text-emerald-400" />,
      title: `Confronto Numerico Scouting (${targets.length} target)`,
      subtitle: "Confronta schede e attributi FM (Tecnici, Mentali, Fisici e CA/PA)",
      prompt: `Effettua un confronto numerico dettagliato basato sulle schede complete dei giocatori tra gli obiettivi di scouting caricati (${targets.map(t => `${t.name} [${t.position}]`).slice(0, 4).join(', ')}${targets.length > 4 ? '...' : ''}) e i nostri titolari attuali nei rispettivi ruoli. Analizza le differenze numeriche sugli attributi tecnici, mentali e fisici (scala 1-20 FM), CA/PA e dimmi per ciascuno se rappresenta un upgrade immediato per l'XI iniziale.`
    }] : []),
    ...(effectiveGamePlan && payloadConfig.includeGamePlan ? [{
      icon: <Zap className="w-4 h-4 text-amber-400" />,
      title: `Piano Gara: vs ${effectiveGamePlan.opponent}`,
      subtitle: `${effectiveGamePlan.opponentFormation ? `Modulo: ${effectiveGamePlan.opponentFormation}` : 'Modulo da carpire via screenshot'} • ${effectiveGamePlan.aiMatchPlan ? 'Report AI Pronto' : 'Contromisure tattiche'}`,
      prompt: `Spiegami nel dettaglio il nostro Piano Gara AI per la partita contro ${effectiveGamePlan.opponent} (${effectiveGamePlan.venue}, ${effectiveGamePlan.competition}): quali sono i loro punti deboli, le contromisure tattiche da adottare${effectiveGamePlan.opponentFormation ? ` contro il modulo ${effectiveGamePlan.opponentFormation}` : ''}, i duelli individuali chiave e le note del manager.`
    }] : []),
    {
      icon: <Shield className="w-4 h-4 text-emerald-400" />,
      title: nextFixture ? `Partita contro ${nextFixture.opponent}` : "Prossimo Match",
      subtitle: "Consigli tattici e XI titolare consigliato",
      prompt: nextFixture
        ? `Analizza la nostra rosa (escludendo gli infortunati) e la tattica per la partita contro ${nextFixture.opponent} (${nextFixture.venue}, ${nextFixture.competition}). Chi dovrei schierare titolare?`
        : "Analizza la nostra tattica attuale e dimmi se ci sono punti deboli da correggere."
    },
    {
      icon: <Zap className="w-4 h-4 text-rose-400" />,
      title: "Infermeria & Infortuni",
      subtitle: injuredPlayers.length > 0 ? `${injuredPlayers.length} indisponibili in rosa` : "Tutti i giocatori arruolabili",
      prompt: injuredPlayers.length > 0
        ? `Abbiamo ${injuredPlayers.length} giocatori infortunati indisponibili (${injuredPlayers.map(p => `${p.name}${p.injuryNote ? ` - ${p.injuryNote}` : ''}`).join(', ')}). Come posso ridisegnare la formazione titolare e sostituirli al meglio?`
        : "Fai un'analisi sulla rosa e suggerisci come gestire le rotazioni per le prossime partite."
    },
    {
      icon: <Users className="w-4 h-4 text-indigo-400" />,
      title: "Analisi Rosa e Lacune",
      subtitle: `${players.length} giocatori caricati`,
      prompt: "Analizza l'organico attuale della mia rosa. Quali sono i reparti più forti e dove siamo scoperti?"
    },
    {
      icon: <Compass className="w-4 h-4 text-sky-400" />,
      title: "Consigli Scouting",
      subtitle: "Obiettivi e ruoli da rinforzare",
      prompt: "Confronta la rosa attuale con gli obiettivi di scouting caricati e suggerisci i migliori innesti da fare nel prossimo mercato."
    }
  ];

  const handleResetChat = () => {
    setMessages([
      {
        id: Date.now().toString(),
        role: 'assistant',
        content: INITIAL_GREETING,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  const isJustInitialState = messages.length === 1 && messages[0].role === 'assistant';

  return (
    <div className="flex flex-col h-[calc(100vh-8.5rem)] max-w-4xl mx-auto bg-slate-950 rounded-2xl border border-slate-800/80 shadow-2xl overflow-hidden relative">
      {/* Top Header */}
      <div className="bg-slate-900/90 backdrop-blur-md px-6 py-3.5 border-b border-slate-800/80 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 shadow-md shadow-emerald-500/10 font-black">
            <Sparkles className="w-5 h-5 fill-slate-950" />
          </div>
          <div>
            <h2 className="font-bold text-slate-100 text-sm flex items-center gap-2 tracking-tight">
              Gemini AI Copilot
            </h2>
            <p className="text-[11px] text-slate-400">
              Assistente personale FM26 • Risposte basate sui dati reali caricati
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Toggle Context Mode */}
          <button
            onClick={handleToggleContextMode}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm ${
              payloadConfig.contextMode !== 'full'
                ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/40 shadow-emerald-950/20'
                : 'bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border-indigo-500/40'
            }`}
            title={
              payloadConfig.contextMode !== 'full'
                ? 'Smart Focus ATTIVO: analizza solo i dati pertinenti per risposte veloci senza latenza. Clicca per passare a Full Memory.'
                : 'Full Memory ATTIVO: invia l\'intero database. Clicca per attivare Smart Focus (-85% latenza).'
            }
          >
            <Zap className={`w-3.5 h-3.5 ${payloadConfig.contextMode !== 'full' ? 'text-amber-400' : 'text-indigo-400'}`} />
            <span className="font-bold">
              {payloadConfig.contextMode !== 'full' ? 'Smart Focus' : 'Full Memory'}
            </span>
            <span className="text-[10px] hidden sm:inline px-1 py-0.2 rounded bg-slate-900 border border-slate-700/60 font-mono text-emerald-300 font-bold">
              {payloadConfig.contextMode !== 'full' ? '⚡ Rapido' : '🌐 Tutto'}
            </span>
          </button>

          {/* Quick Toggle Speed Mode (Turbo vs Deep Reasoning) */}
          <button
            onClick={handleToggleThinkingSpeed}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm ${
              payloadConfig.thinkingSpeed !== 'deep'
                ? 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/40 shadow-amber-950/20'
                : 'bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border-indigo-500/40'
            }`}
            title={
              payloadConfig.thinkingSpeed !== 'deep'
                ? 'Modalità TURBO attiva (ThinkingLevel.LOW): latenza minima in 1-2s. Clicca per attivare Ragionamento Profondo.'
                : 'Modalità PROFONDA attiva: riflessione estesa prima della risposta. Clicca per attivare Turbo (latenza minima).'
            }
          >
            <Zap className={`w-3.5 h-3.5 ${payloadConfig.thinkingSpeed !== 'deep' ? 'text-amber-400' : 'text-slate-400'}`} />
            <span className="font-bold">
              {payloadConfig.thinkingSpeed !== 'deep' ? 'Turbo' : 'Deep'}
            </span>
            <span className="text-[10px] hidden md:inline px-1 py-0.2 rounded bg-slate-900 border border-slate-700/60 font-mono text-amber-300 font-bold">
              {payloadConfig.thinkingSpeed !== 'deep' ? '1-2s' : '15-25s'}
            </span>
          </button>

          {/* Live Memory & Token Status Badge */}
          <button
            onClick={() => setIsMemoryModalOpen(true)}
            className={`px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 sm:gap-2 transition-all cursor-pointer shadow-sm ${
              payloadBreakdown.estimatedTokens > 55000
                ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30'
                : payloadBreakdown.estimatedTokens > 25000
                ? 'bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border-teal-500/30'
                : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
            }`}
            title="Apri controllo token e stato memoria payload"
          >
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Memoria:</span>
            <span className="font-mono font-bold">{(payloadBreakdown.totalBytes / 1024).toFixed(1)} KB</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-900 border border-slate-700/60 text-slate-300 font-mono hidden md:inline">
              ~{payloadBreakdown.estimatedTokens > 1000 ? `${(payloadBreakdown.estimatedTokens / 1000).toFixed(1)}k` : payloadBreakdown.estimatedTokens} tok
            </span>
          </button>

          {/* Windows CMD-Style Ping Tool */}
          {onOpenPingModal && (
            <button
              onClick={onOpenPingModal}
              className="px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-700/80 hover:border-emerald-500/40 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer font-mono shadow-sm"
              title="Apri il prompt dei comandi in stile Windows per verificare la latenza di rete e l'inferenza di Google Gemini"
            >
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">&gt;_ Ping CMD</span>
            </button>
          )}

          <button
            onClick={handleResetChat}
            className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-xl border border-slate-800 hover:bg-slate-800/80 flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            title="Riavvia la conversazione"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Nuova Chat</span>
          </button>
        </div>
      </div>

      {/* Synchronized Game Plan Banner with Default Deactivation Toggle */}
      {effectiveGamePlan && (
        <div className={`px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0 z-10 border-b transition-colors ${
          payloadConfig.includeGamePlan
            ? 'bg-slate-900/95 border-amber-500/40 shadow-sm'
            : 'bg-slate-950/90 border-slate-800'
        }`}>
          <div className="flex items-center gap-2 min-w-0">
            <span className={`flex items-center justify-center w-5 h-5 rounded-md font-bold shrink-0 ${
              payloadConfig.includeGamePlan
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-slate-800 text-slate-500'
            }`}>
              <Zap className="w-3.5 h-3.5" />
            </span>
            <div className="truncate">
              <span className="text-slate-400">Piano Gara & Avversario:</span>{' '}
              <strong className="text-white font-semibold">vs {effectiveGamePlan.opponent}</strong>{' '}
              <span className="text-slate-400">({effectiveGamePlan.venue}, {effectiveGamePlan.competition})</span> •{' '}
              {payloadConfig.includeGamePlan ? (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                  ⚡ Modalità Big Match ATTIVA nel Payload
                </span>
              ) : (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-slate-800/80 text-slate-400 border border-slate-700/80 font-medium" title="Disattivata di default per non appesantire la memoria del Copilot">
                  💤 Disattivata nel Payload (Default)
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => {
                const nextState = !payloadConfig.includeGamePlan;
                handleUpdatePayloadConfig({
                  ...payloadConfig,
                  includeGamePlan: nextState
                });
                setToastMessage(
                  nextState
                    ? '⚡ Modalità Big Match attivata: Piano Gara e profili avversari ora inclusi nel payload del Copilot.'
                    : '⚡ Modalità Big Match disattivata: il payload del Copilot è tornato leggero.'
                );
                setTimeout(() => setToastMessage(null), 3500);
              }}
              className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all flex items-center gap-1 cursor-pointer ${
                payloadConfig.includeGamePlan
                  ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              }`}
              title={payloadConfig.includeGamePlan ? "Disattiva per alleggerire il payload del Copilot" : "Attiva per questa partita speciale / finale"}
            >
              <Zap className="w-3 h-3" />
              <span>{payloadConfig.includeGamePlan ? 'Disattiva per alleggerire' : 'Attiva per Big Match'}</span>
            </button>

            {payloadConfig.includeGamePlan && (
              <button
                onClick={() => handleSend(`Spiegami nel dettaglio il nostro Piano Gara AI per la partita contro ${effectiveGamePlan.opponent}: quali sono i loro punti deboli, le contromisure da adottare${effectiveGamePlan.opponentFormation ? ` contro il loro modulo ${effectiveGamePlan.opponentFormation}` : ''}, e cosa abbiamo preparato?`)}
                disabled={loading}
                className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer"
                title="Chiedi al Copilot di analizzare il piano gara per questa sfida"
              >
                <Sparkles className="w-3 h-3" />
                <span>Analizza con AI</span>
              </button>
            )}

            {onNavigateToGamePlan && (
              <button
                onClick={onNavigateToGamePlan}
                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] transition-colors cursor-pointer"
                title="Apri la scheda Piano Gara AI"
              >
                Apri Scheda
              </button>
            )}
          </div>
        </div>
      )}

      {/* Synchronized Competitions & Standings Banner */}
      {userTeamRow && (
        <div className="bg-slate-900/95 border-b border-indigo-500/30 px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0 z-10">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-indigo-500/20 text-indigo-400 font-bold shrink-0">
              <Trophy className="w-3.5 h-3.5" />
            </span>
            <div className="truncate">
              <span className="text-slate-400">Classifica Sincronizzata:</span>{' '}
              <strong className="text-white font-semibold">{userTeamRow.position}° Posto</strong>{' '}
              <span className="text-slate-400">({userTeamRow.points} pt, {userTeamRow.played} gare)</span> •{' '}
              <span className="text-emerald-300 font-mono text-[11px]">Diff. Reti: {userTeamRow.gd > 0 ? `+${userTeamRow.gd}` : userTeamRow.gd}</span> •{' '}
              <span className="text-slate-300 text-[11px]">Forma: {userTeamRow.form || 'N/D'}</span>
              {standings[0] && standings[0].team.toLowerCase() !== userTeamRow.team.toLowerCase() && (
                <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-medium">
                  -{Math.max(0, standings[0].points - userTeamRow.points)} pt dalla vetta ({standings[0].team})
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => handleSend("Analizza nel dettaglio la nostra situazione in classifica e nelle competizioni: quanti punti abbiamo, la nostra posizione rispetto alle rivali dirette e alla vetta, la forma recente e gli obiettivi da centrare nei vari tornei.")}
              disabled={loading}
              className="px-2 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer"
              title="Chiedi al Copilot di commentare la nostra classifica e gli obiettivi"
            >
              <Sparkles className="w-3 h-3" />
              <span>Punto Classifica</span>
            </button>
            {onNavigateToCompetitions && (
              <button
                onClick={onNavigateToCompetitions}
                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] transition-colors cursor-pointer"
                title="Apri la schermata Competizioni e Classifica"
              >
                Competizioni
              </button>
            )}
          </div>
        </div>
      )}

      {/* Synchronized Player Growth & Variations Banner */}
      {growthStats.totalMonitored > 0 && (
        <div className="bg-slate-900/95 border-b border-emerald-500/30 px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0 z-10">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-emerald-500/20 text-emerald-400 font-bold shrink-0">
              <TrendingUp className="w-3.5 h-3.5" />
            </span>
            <div className="truncate">
              <span className="text-slate-400">Sviluppo Rosa & Variazioni:</span>{' '}
              <strong className="text-white font-semibold">{growthStats.totalMonitored} giocatori monitorati</strong>{' '}
              {growthStats.totalImproved > 0 && (
                <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                  +{growthStats.totalImproved} in crescita 📈
                </span>
              )}
              {growthStats.totalDeclined > 0 && (
                <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 font-medium">
                  {growthStats.totalDeclined} in calo 📉
                </span>
              )}
              {growthStats.totalStable > 0 && (
                <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700 font-medium">
                  {growthStats.totalStable} stabili
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => handleSend("Analizza nel dettaglio la crescita e lo sviluppo dei giocatori della nostra rosa: quali calciatori hanno registrato incrementi di Current Ability (CA) o miglioramenti nei singoli attributi (tecnici, mentali, fisici)? Chi è in calo o fermo? Fornisci un resoconto chiaro sui progressi e consigli di allenamento personalizzati.")}
              disabled={loading}
              className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-medium transition-colors flex items-center gap-1 cursor-pointer"
              title="Chiedi al Copilot un resoconto completo sullo sviluppo dei giocatori"
            >
              <Sparkles className="w-3 h-3" />
              <span>Report Sviluppo Rosa</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Chat Stream Container */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-6 relative"
      >
        {/* Drag & Drop Visual Overlay */}
        {isDraggingOver && (
          <div className="absolute inset-4 z-40 bg-slate-950/90 border-2 border-dashed border-emerald-400 rounded-2xl flex flex-col items-center justify-center p-6 backdrop-blur-xs transition-all pointer-events-none">
            <UploadCloud className="w-12 h-12 text-emerald-400 animate-bounce mb-3" />
            <div className="text-base font-bold text-white mb-1">Rilascia qui screenshot o file</div>
            <div className="text-xs text-emerald-300 font-medium">Analisi multimodale immediata: nessun appesantimento della memoria futura.</div>
          </div>
        )}

        {/* Gemini Welcome Card when conversation is fresh */}
        {isJustInitialState && (
          <div className="flex flex-col items-center justify-center text-center py-4 sm:py-6 space-y-5 animate-fadeIn max-w-2xl mx-auto">
            <div className="flex flex-col items-center space-y-2">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/20 via-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg">
                <Sparkles className="w-6 h-6 animate-pulse" />
              </div>

              <h1 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight">
                Benvenuto nel tuo Copilota Tattico
              </h1>
              <p className="text-xs text-slate-400 max-w-lg leading-relaxed">
                Assistente strategico e tattico per <strong className="text-emerald-400 font-semibold">{teamName}</strong>. 
                Ricevi analisi personalizzate, consigli sulla formazione e contromisure per ogni partita.
              </p>
            </div>

            {/* Feature overview guide */}
            <div className="w-full bg-slate-900/70 border border-slate-800/80 rounded-xl p-4 text-left shadow-md">
              <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <span>🚀</span> Come utilizzare al meglio l'applicazione:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300">
                <div className="flex items-start gap-2 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/50">
                  <span className="text-sm shrink-0">🛡️</span>
                  <div>
                    <strong className="text-slate-100 font-medium">Nome Squadra</strong>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">Clicca sul nome club nella barra in alto per rinominarlo.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/50">
                  <span className="text-sm shrink-0">📋</span>
                  <div>
                    <strong className="text-slate-100 font-medium">Rosa & Tattica</strong>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">Configura ruoli, importa dati FM via CSV e gestisci lo stato atletico.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/50">
                  <span className="text-sm shrink-0">⚡</span>
                  <div>
                    <strong className="text-slate-100 font-medium">Piano Gara AI</strong>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">Analizza formazioni e statistiche avversarie con contromisure su misura.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/50">
                  <span className="text-sm shrink-0">📅</span>
                  <div>
                    <strong className="text-slate-100 font-medium">Calendario & OCR</strong>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">Carica screenshot di calendario e classifica per sincronizzarli all'istante.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Suggestion Cards */}
            <div className="w-full space-y-2">
              <div className="text-[11px] font-semibold text-slate-400 text-left px-1 flex items-center justify-between">
                <span>💡 Suggerimenti rapidi di avvio:</span>
                <span className="text-[10px] text-slate-500">Clicca per chiedere</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left">
                {quickSuggestions.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(item.prompt)}
                    disabled={loading}
                    className="p-3 rounded-xl bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800/80 hover:border-emerald-500/40 transition-all text-left group flex items-start space-x-2.5 shadow-sm hover:shadow-emerald-950/20 cursor-pointer"
                  >
                    <div className="p-1.5 rounded-lg bg-slate-800/80 group-hover:bg-slate-700/80 shrink-0 transition-colors">
                      {item.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-xs text-slate-200 group-hover:text-emerald-300 transition-colors truncate">
                        {item.title}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {item.subtitle}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Messages Stream (If not only initial welcome or after user sends first message) */}
        {!isJustInitialState && messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex items-start space-x-3 sm:space-x-4 ${
              msg.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 shrink-0 text-xs font-bold shadow-md shadow-emerald-500/10">
                <Sparkles className="w-4 h-4 fill-slate-950" />
              </div>
            )}

            {(() => {
              const { cleanContent, proposals } = extractPlayerNoteProposals(msg.content);
              return (
                <div
                  className={`max-w-[85%] sm:max-w-[78%] rounded-2xl px-5 py-3.5 shadow-md ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-none'
                      : 'bg-slate-900/90 border border-slate-800/90 text-slate-100 rounded-tl-none'
                  }`}
                >
                  {/* Allegati e Screenshot Inviati */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mb-3 space-y-2">
                      <div className="flex items-center gap-1.5 text-[10px] text-indigo-100 font-semibold uppercase tracking-wider">
                        <Zap className="w-3 h-3 text-amber-300" />
                        <span>Analisi Situazione Immediata ({msg.attachments.length} {msg.attachments.length === 1 ? 'allegato' : 'allegati'}):</span>
                      </div>
                      <div className="flex flex-wrap gap-2.5">
                        {msg.attachments.map((att) => (
                          att.type === 'image' ? (
                            <div
                              key={att.id}
                              onClick={() => setLightboxImage({ url: att.previewUrl || att.data, name: att.name })}
                              className="group relative cursor-pointer overflow-hidden rounded-xl border border-indigo-400/40 bg-indigo-950/80 transition-all hover:border-white shadow-md"
                              title="Clicca per visualizzare a tutto schermo"
                            >
                              <img
                                src={att.previewUrl || att.data}
                                alt={att.name}
                                className="h-28 w-44 object-cover transition-transform group-hover:scale-105"
                              />
                              <div className="absolute inset-0 bg-slate-950/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-xs font-bold text-white">
                                <Maximize2 className="w-4 h-4" />
                                <span>Ingrandisci</span>
                              </div>
                              <div className="absolute bottom-0 inset-x-0 bg-slate-950/80 px-2 py-0.5 text-[10px] text-slate-200 truncate">
                                {att.name}
                              </div>
                            </div>
                          ) : (
                            <div
                              key={att.id}
                              className="flex items-center gap-2 bg-indigo-950/80 border border-indigo-400/40 rounded-xl px-3 py-2 text-xs text-white"
                            >
                              <FileText className="w-4 h-4 text-indigo-300 shrink-0" />
                              <div className="min-w-0">
                                <div className="font-semibold truncate max-w-[180px]">{att.name}</div>
                                <div className="text-[10px] text-indigo-300">{formatFileSize(att.size)}</div>
                              </div>
                            </div>
                          )
                        ))}
                      </div>
                    </div>
                  )}

                  {msg.isStreaming && !cleanContent.trim() && (
                    <div className="flex items-center space-x-2 text-slate-300 text-xs py-1">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
                      <span className="font-medium">Il Co-Allenatore sta elaborando...</span>
                    </div>
                  )}

                  {cleanContent.trim() && (
                    <div className="relative">
                      <FormattedText content={cleanContent} isUser={msg.role === 'user'} />
                      {msg.isStreaming && (
                        <span className="inline-block w-2 h-4 bg-emerald-400 animate-pulse ml-1 align-middle rounded-xs" />
                      )}
                    </div>
                  )}

                  {/* Note Proposals Cards emitted by AI Copilot */}
                  {msg.role === 'assistant' && proposals.length > 0 && (
                    <div className="mt-3 space-y-3">
                      {proposals.map(proposal => {
                        const targetMatch = resolvePlayerForProposal(proposal.playerName);
                        const currentStatus = proposalStatuses[proposal.id] || 'pending';
                        return (
                          <PlayerNoteProposalCard
                            key={proposal.id}
                            proposal={proposal}
                            targetPlayer={targetMatch ? targetMatch.player : null}
                            squadName={targetMatch ? targetMatch.squadName : undefined}
                            allPlayersList={allPlayersWithSquad}
                            currentDate={currentDate}
                            status={currentStatus}
                            onApprove={(playerId, finalNote) => handleApproveProposal(proposal.id, playerId, finalNote)}
                            onReject={(pId) => handleRejectProposal(pId)}
                          />
                        );
                      })}
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800/60 text-[10px]">
                    {msg.role === 'assistant' ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        {savedMsgIds.has(msg.id) ? (
                          <span className="text-emerald-400 font-bold flex items-center gap-1 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                            <Check className="w-3 h-3" /> Salvato in Memoria Tattica
                          </span>
                        ) : (
                          <button
                            onClick={() => handleOpenSaveModal(msg)}
                            className="text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 bg-emerald-950/40 hover:bg-emerald-900/60 px-2.5 py-1 rounded-lg border border-emerald-800/60 transition-all cursor-pointer shadow-sm"
                            title="Salva questa considerazione nelle Note Tattiche per la memoria a lungo termine dell'AI"
                          >
                            <BookmarkPlus className="w-3.5 h-3.5 text-emerald-400" />
                            <span>📌 Salva in Note & Memory</span>
                          </button>
                        )}

                        <button
                          onClick={() => setApplyModalData({ isOpen: true, initialText: cleanContent })}
                          className="text-indigo-300 hover:text-indigo-200 font-bold flex items-center gap-1 bg-indigo-950/40 hover:bg-indigo-900/60 px-2.5 py-1 rounded-lg border border-indigo-800/60 transition-all cursor-pointer shadow-sm"
                          title="Salva o applica queste considerazioni direttamente sulle note di un calciatore"
                        >
                          <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                          <span>👤 Scheda Giocatore</span>
                        </button>
                      </div>
                    ) : (
                      <div />
                    )}

                    <div className="flex items-center gap-2 text-[11px] flex-wrap justify-end">
                      {msg.role === 'assistant' && msg.focusDomains && msg.focusDomains.length > 0 && (
                        <span
                          className="text-[9px] text-emerald-300 font-semibold bg-emerald-950/60 border border-emerald-800/60 px-1.5 py-0.5 rounded flex items-center gap-1 shadow-xs"
                          title={`Smart Focus: ${msg.focusDomains.join(' • ')} (Latenza ridotta ~${msg.latencyReduction || 85}%)`}
                        >
                          <Zap className="w-2.5 h-2.5 text-amber-400" />
                          <span>Smart Focus ({msg.focusDomains.length})</span>
                        </span>
                      )}
                      {msg.role === 'assistant' && msg.usage && (
                        <button
                          onClick={() => setIsMemoryModalOpen(true)}
                          className="text-[10px] text-slate-400 hover:text-emerald-300 flex items-center gap-1 font-mono transition-colors bg-slate-950/60 px-1.5 py-0.5 rounded border border-slate-800 cursor-pointer"
                          title="Dettagli consumo token e memoria"
                        >
                          <Activity className="w-2.5 h-2.5 text-emerald-400" />
                          <span>{msg.usage.totalTokens.toLocaleString()} tok</span>
                        </button>
                      )}
                      <div className={msg.role === 'user' ? 'text-indigo-200' : 'text-slate-500'}>
                        {msg.timestamp}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}


            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shrink-0 text-xs font-bold shadow-md">
                <User className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}

        {/* Loading Indicator */}
        {loading && !messages.some(m => m.isStreaming) && (
          <div className="py-2 animate-fadeIn space-y-2">
            {messages.length > 0 &&
            messages[messages.length - 1].attachments &&
            messages[messages.length - 1].attachments!.length > 0 ? (
              <ScreenshotOcrProgressBar
                isLoading={loading}
                context="general"
                title="Analisi Allegati & Screenshot con Gemini Vision OCR"
              />
            ) : (
              <div className="flex items-center space-x-3 text-slate-400 text-xs">
                <div className="w-8 h-8 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-400 shrink-0">
                  <Sparkles className="w-4 h-4 animate-spin" />
                </div>
                <div className="flex items-center space-x-1.5 bg-slate-900/90 border border-slate-800 px-4 py-2.5 rounded-2xl">
                  <span className="text-slate-300 font-medium">Sto elaborando la risposta sui dati della tua carriera...</span>
                  <span className="animate-pulse text-emerald-400 font-bold">●</span>
                  <span className="animate-pulse delay-100 text-emerald-400 font-bold">●</span>
                  <span className="animate-pulse delay-200 text-emerald-400 font-bold">●</span>
                </div>
              </div>
            )}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Gemini Style Bottom Input Bar */}
      <div className="p-3 sm:p-4 bg-slate-900/90 border-t border-slate-800/80 shrink-0">
        {!hasCustomApiKey() && (
          <div className="mb-2.5 max-w-3xl mx-auto p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-amber-200">
              <Key className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Per inviare domande e ricevere consigli è richiesta la tua <strong>Google Gemini API Key personale</strong> (BYOK).</span>
            </div>
            {onOpenApiKeyModal && (
              <button
                type="button"
                onClick={onOpenApiKeyModal}
                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg shrink-0 transition-all text-[11px] flex items-center gap-1 cursor-pointer"
              >
                <Key className="w-3 h-3" />
                Imposta Chiave
              </button>
            )}
          </div>
        )}

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.csv,.json,.txt,.md,.pdf"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleAddFiles(e.target.files);
              e.target.value = '';
            }
          }}
          className="hidden"
        />

        {/* Anteprima Allegati & Screenshot pronti per l'invio immediato */}
        {attachments.length > 0 && (
          <div className="mb-3 max-w-3xl mx-auto bg-slate-950 border border-emerald-500/40 rounded-2xl p-3 shadow-xl animate-fadeIn">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Allegati per Analisi Situazione Immediata ({attachments.length})</span>
              </div>
              <div className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded-full border border-slate-800">
                ⚡ Nessun appesantimento della memoria dei turni futuri
              </div>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="relative group flex items-center gap-2 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-1.5 pr-2.5 text-xs text-slate-200 transition-all shadow-sm"
                >
                  {att.type === 'image' ? (
                    <div
                      onClick={() => setLightboxImage({ url: att.previewUrl || att.data, name: att.name })}
                      className="relative cursor-pointer overflow-hidden rounded-lg w-12 h-12 bg-slate-950 shrink-0 border border-slate-800"
                      title="Clicca per anteprima a schermo intero"
                    >
                      <img
                        src={att.previewUrl || att.data}
                        alt={att.name}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white">
                        <Eye className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-emerald-400 shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                  )}
                  <div className="min-w-0 max-w-[150px]">
                    <div className="font-semibold text-white text-xs truncate" title={att.name}>{att.name}</div>
                    <div className="text-[10px] text-slate-400">{formatFileSize(att.size)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(att.id)}
                    className="ml-1 p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    title="Rimuovi allegato"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="relative flex items-end max-w-3xl mx-auto bg-slate-950 border border-slate-800/90 rounded-2xl focus-within:border-emerald-500/80 focus-within:ring-1 focus-within:ring-emerald-500/50 shadow-inner transition-all p-1.5">
          {/* Pulsante Graffetta Allegati */}
          <div className="flex items-center pb-0.5 pl-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-slate-900 rounded-xl transition-colors cursor-pointer"
              title="Allega screenshot o file (Immagini, CSV, JSON, TXT, PDF)"
            >
              <Paperclip className="w-4 h-4" />
            </button>
          </div>

          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={attachments.length > 0 ? "Fai una domanda specifica sullo screenshot/allegato (oppure premi Invio per un'analisi completa)..." : "Scrivi un messaggio o incolla uno screenshot con Ctrl+V..."}
            className="w-full bg-transparent border-0 resize-none pl-2.5 pr-2.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-0 max-h-44 min-h-[40px] leading-relaxed overflow-y-auto"
          />
          <div className="flex items-center pb-0.5 pr-1">
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={(!input.trim() && attachments.length === 0) || loading}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-600 disabled:opacity-50 text-white font-medium p-2.5 rounded-xl transition-all shadow-md flex items-center justify-center shrink-0 cursor-pointer disabled:cursor-not-allowed"
              title="Invia messaggio (Invio)"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2 px-1 max-w-3xl mx-auto">
          <div className="flex items-center gap-2">
            <span>Gemini AI Copilot</span>
            <span className="text-slate-600">•</span>
            {payloadConfig.contextMode !== 'full' ? (
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <Zap className="w-3 h-3 text-amber-400" /> Smart Focus (Lettura mirata • Minima latenza)
              </span>
            ) : (
              <span className="text-indigo-400 font-semibold flex items-center gap-1">
                🌐 Full Memory (Tutto il database)
              </span>
            )}
            <span className="text-slate-600 hidden md:inline">•</span>
            <span className="text-slate-400 hidden md:flex items-center gap-1">
              <ImageIcon className="w-3 h-3 inline text-emerald-400" /> Screenshot & File (Ctrl+V)
            </span>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5">
            <span>Invia con</span>
            <kbd className="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded font-mono text-[9px] border border-slate-700 font-semibold shadow-xs">Invio ↵</kbd>
            <span className="text-slate-600">•</span>
            <span>A capo con</span>
            <kbd className="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded font-mono text-[9px] border border-slate-700 font-semibold shadow-xs">Shift + Invio ⇧↵</kbd>
          </span>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-2xl shadow-2xl border border-emerald-400 text-xs font-bold flex items-center gap-2 animate-bounce">
          <BookOpen className="w-4 h-4" />
          <span>{toastMessage}</span>
          {onNavigateToNotes && (
            <button
              onClick={onNavigateToNotes}
              className="ml-2 underline text-emerald-100 hover:text-white cursor-pointer"
            >
              Vedi Note
            </button>
          )}
        </div>
      )}

      {/* Save Message to Memory Modal */}
      {saveModalMsg && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <BookmarkPlus className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Salva in Note & Memoria Tattica</h3>
              </div>
              <button
                onClick={() => setSaveModalMsg(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Scegli in quale categoria salvare questa risposta dell'assistente. Sarà accessibile nella sezione <strong>Note & Memory</strong> e verrà ricordata da Gemini nelle prossime chat:
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-bold mb-1">Titolo Nota:</label>
                <input
                  type="text"
                  value={saveTitle}
                  onChange={(e) => setSaveTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-semibold focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Categoria Memoria:</label>
                <select
                  value={saveCategory}
                  onChange={(e) => setSaveCategory(e.target.value as TacticalNoteCategory)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-semibold focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="tactics">🎯 Analisi Tattica (Schemi, pressing, reazioni match)</option>
                  <option value="rotation">🔄 Rotazioni Previste (Gestione infortuni e calendario)</option>
                  <option value="scouting">🛒 Calciomercato & Scout (Lacune rosa, innesti e contratti)</option>
                  <option value="miscellaneous">📦 Varie (Appunti liberi, promemoria generali)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Contenuto (Puoi modificarlo o riassumerlo):</label>
                <textarea
                  value={saveContent}
                  onChange={(e) => setSaveContent(e.target.value)}
                  rows={6}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium focus:outline-none focus:border-emerald-500 leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Tag:</label>
                <input
                  type="text"
                  value={saveTags}
                  onChange={(e) => setSaveTags(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setSaveModalMsg(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-800 cursor-pointer"
              >
                Annulla
              </button>
              <button
                onClick={handleConfirmSaveToMemory}
                disabled={!saveTitle.trim() || !saveContent.trim()}
                className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 cursor-pointer transition-all shadow-md flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Salva in Memoria AI</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Apply to Player Note Modal */}
      <ApplyToPlayerNoteModal
        isOpen={applyModalData.isOpen}
        onClose={() => setApplyModalData({ isOpen: false, initialText: '' })}
        initialText={applyModalData.initialText}
        defaultPlayerId={applyModalData.defaultPlayerId}
        allPlayersList={allPlayersWithSquad}
        currentDate={currentDate}
        onSave={(playerId, finalNote) => {
          if (onUpdatePlayerNote) {
            onUpdatePlayerNote(playerId, finalNote);
          }
          const found = allPlayersWithSquad.find(i => i.player.id === playerId);
          triggerToast(`Nota aggiornata con successo per ${found ? found.player.name : 'il calciatore'}!`);
        }}
      />

      {/* Memory Diagnostics & Token Usage Modal */}
      <MemoryDiagnosticsModal
        isOpen={isMemoryModalOpen}
        onClose={() => setIsMemoryModalOpen(false)}
        tokenUsage={tokenUsage}
        breakdown={payloadBreakdown}
        config={payloadConfig}
        onChangeConfig={handleUpdatePayloadConfig}
        onClearHistory={handleClearHistory}
        onRefreshLiveCount={handleRefreshLiveCount}
        isRecalculating={isRecalculating}
        onOpenApiKeyModal={onOpenApiKeyModal}
      />

      {/* Lightbox Modal Ingrandimento Screenshot */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 sm:p-6 animate-fadeIn"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-w-5xl w-full max-h-[92vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex items-center justify-between mb-3 px-2 text-slate-300">
              <div className="flex items-center gap-2 min-w-0">
                <ImageIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-sm font-bold text-white truncate max-w-md">{lightboxImage.name}</span>
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-md hidden sm:inline-block">
                  Analisi Immediata
                </span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={lightboxImage.url}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Apri screenshot in nuova scheda del browser"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span className="hidden sm:inline">Nuova scheda</span>
                </a>
                <button
                  type="button"
                  onClick={() => setLightboxImage(null)}
                  className="p-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors cursor-pointer"
                  title="Chiudi visualizzatore (Esc)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="overflow-auto max-h-[82vh] w-full rounded-2xl border border-slate-800 shadow-2xl bg-slate-950 flex items-center justify-center p-2">
              <img
                src={lightboxImage.url}
                alt={lightboxImage.name}
                className="max-h-[78vh] w-auto max-w-full object-contain rounded-xl"
              />
            </div>
            <div className="mt-2 text-[11px] text-slate-400">
              Premi <kbd className="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded font-mono text-[9px] border border-slate-700 font-semibold shadow-xs">Esc</kbd> o clicca sullo sfondo per chiudere
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


