import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Fixture, StandingsRow } from '../types';
import { optimizeScreenshot, formatBytes } from '../utils/screenshotOptimizer';
import { safeFetchJson } from '../utils/apiUtils';
import { getApiHeaders, hasCustomApiKey } from '../utils/apiKeyStorage';
import { sortFixturesByDate } from '../utils/dateUtils';

export interface BackgroundOcrTask {
  id: string;
  type: 'calendar' | 'standings';
  title: string;
  fileName: string;
  imagePreview: string;
  status: 'optimizing' | 'analyzing' | 'completed' | 'error';
  phaseLabel: string;
  progressPercent: number;
  elapsedSeconds: number;
  startedAt: number;
  completedAt?: number;
  error?: string;
  isDismissed?: boolean;
  // Results
  calendarFixtures?: Fixture[];
  standingsRows?: StandingsRow[];
  optimizedStats?: {
    originalSize: number;
    optimizedSize: number;
    reducedPercent: number;
  };
}

export interface BackgroundOcrNotification {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  taskId: string;
  timestamp: number;
}

interface BackgroundOcrContextType {
  tasks: BackgroundOcrTask[];
  activeTasks: BackgroundOcrTask[];
  completedTasks: BackgroundOcrTask[];
  latestNotification: BackgroundOcrNotification | null;
  activeReviewTask: BackgroundOcrTask | null;
  startCalendarTask: (fileOrDataUrl: File | string, fileName?: string) => Promise<string>;
  startStandingsTask: (fileOrDataUrl: File | string, fileName?: string) => Promise<string>;
  cancelTask: (taskId: string) => void;
  dismissTask: (taskId: string) => void;
  clearAllCompleted: () => void;
  applyCalendarFixtures: (taskId: string, replaceExisting: boolean) => void;
  applyStandings: (taskId: string) => void;
  openReviewModal: (taskId: string) => void;
  closeReviewModal: () => void;
  dismissNotification: () => void;
  getTaskById: (taskId: string) => BackgroundOcrTask | undefined;
}

const BackgroundOcrContext = createContext<BackgroundOcrContextType | null>(null);

interface BackgroundOcrProviderProps {
  children: React.ReactNode;
  fixtures: Fixture[];
  onUpdateFixtures: (fixtures: Fixture[]) => void;
  standings: StandingsRow[];
  onUpdateStandings: (standings: StandingsRow[]) => void;
  teamName: string;
  currentDate?: string;
  onUpdateCurrentDate?: (date: string) => void;
}

export function normalizeCalendarFixtures(rawList: any[]): Fixture[] {
  return rawList.map((item: any, idx: number) => {
    let venue: 'Casa' | 'Trasferta' | 'Campo Neutro' = 'Casa';
    const rawVenue = String(item.venue || '').trim().toUpperCase();
    if (
      rawVenue === 'N' ||
      rawVenue === 'NEUTRO' ||
      rawVenue === 'CAMPO NEUTRO' ||
      rawVenue === 'NEUTRAL' ||
      rawVenue.includes('NEUTR')
    ) {
      venue = 'Campo Neutro';
    } else if (
      rawVenue === 'T' ||
      rawVenue === 'TRASFERTA' ||
      rawVenue === 'A' ||
      rawVenue === 'AWAY' ||
      rawVenue.includes('TRASF')
    ) {
      venue = 'Trasferta';
    } else {
      venue = 'Casa';
    }

    let score = item.score;
    let outcome = item.outcome;
    if (score) {
      const match = score.match(/(\d+)\s*[-:]\s*(\d+)/);
      if (match) {
        let g1 = parseInt(match[1], 10);
        let g2 = parseInt(match[2], 10);
        if (outcome === 'Vittoria' && g1 < g2) {
          score = `${g2}-${g1}`;
        } else if (outcome === 'Sconfitta' && g1 > g2) {
          score = `${g2}-${g1}`;
        } else if (!outcome) {
          outcome = g1 > g2 ? 'Vittoria' : g1 === g2 ? 'Pareggio' : 'Sconfitta';
        }
      }
    }

    return {
      id: `ocr_f_${Date.now()}_${idx}`,
      date: item.date || `Partita ${idx + 1}`,
      opponent: item.opponent || 'Avversario',
      venue,
      competition: item.competition || 'Premier League',
      importance: (item.importance || (item.competition?.includes('Champions') ? 'Cruciale' : 'Alta')) as 'Cruciale' | 'Alta' | 'Media',
      status: (item.status === 'Giocata' || score ? 'Giocata' : 'In Arrivo') as 'Giocata' | 'In Arrivo',
      score: score || undefined,
      outcome: outcome || undefined,
      predictedFatigueRisk: (item.predictedFatigueRisk || 'Medio') as 'Alto' | 'Medio' | 'Basso',
    };
  });
}

export function normalizeStandingsRows(rawList: any[]): StandingsRow[] {
  return rawList.map((row: any, idx: number) => ({
    position: Number(row.position) || idx + 1,
    team: String(row.team || `Squadra ${idx + 1}`),
    played: Number(row.played) || 0,
    won: Number(row.won) || 0,
    drawn: Number(row.drawn) || 0,
    lost: Number(row.lost) || 0,
    gf: Number(row.gf) || 0,
    ga: Number(row.ga) || 0,
    gd: Number(row.gd ?? (Number(row.gf || 0) - Number(row.ga || 0))),
    points: Number(row.points) || 0,
    form: typeof row.form === 'string' ? row.form : undefined,
  }));
}

export const BackgroundOcrProvider: React.FC<BackgroundOcrProviderProps> = ({
  children,
  fixtures,
  onUpdateFixtures,
  standings,
  onUpdateStandings,
  teamName,
  currentDate,
  onUpdateCurrentDate,
}) => {
  const [tasks, setTasks] = useState<BackgroundOcrTask[]>([]);
  const [activeReviewTask, setActiveReviewTask] = useState<BackgroundOcrTask | null>(null);
  const [latestNotification, setLatestNotification] = useState<BackgroundOcrNotification | null>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // Elapsed time updater for active tasks
  useEffect(() => {
    const hasActive = tasks.some(t => (t.status === 'optimizing' || t.status === 'analyzing') && !t.isDismissed);
    if (!hasActive) return;

    const interval = setInterval(() => {
      setTasks(prev =>
        prev.map(t => {
          if (t.status === 'optimizing' || t.status === 'analyzing') {
            const elapsed = Math.floor((Date.now() - t.startedAt) / 1000);
            return { ...t, elapsedSeconds: elapsed };
          }
          return t;
        })
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [tasks]);

  // Start Calendar OCR Task
  const startCalendarTask = useCallback(
    async (fileOrDataUrl: File | string, fileName?: string): Promise<string> => {
      const taskId = `task_cal_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const controller = new AbortController();
      abortControllersRef.current.set(taskId, controller);

      const name = fileName || (typeof fileOrDataUrl === 'string' ? 'Screenshot Calendario' : fileOrDataUrl.name);

      // Extract initial preview
      let initialPreview = '';
      if (typeof fileOrDataUrl === 'string') {
        initialPreview = fileOrDataUrl;
      }

      const newTask: BackgroundOcrTask = {
        id: taskId,
        type: 'calendar',
        title: 'Screenshot Calendario FM26',
        fileName: name,
        imagePreview: initialPreview,
        status: 'optimizing',
        phaseLabel: 'Ottimizzazione screenshot in corso...',
        progressPercent: 20,
        elapsedSeconds: 0,
        startedAt: Date.now(),
      };

      setTasks(prev => [newTask, ...prev]);

      // Execute asynchronously in background
      (async () => {
        try {
          if (!hasCustomApiKey()) {
            throw new Error(
              "Chiave API personale richiesta: per analizzare gli screenshot con l'IA, inserisci la tua Google Gemini API Key gratuita (BYOK) nella barra in alto."
            );
          }

          // Step 1: Optimize
          const optimized = await optimizeScreenshot(fileOrDataUrl);
          if (controller.signal.aborted) return;

          setTasks(prev =>
            prev.map(t =>
              t.id === taskId
                ? {
                    ...t,
                    imagePreview: optimized.dataUrl,
                    status: 'analyzing',
                    phaseLabel: 'Analisi Gemini Vision in background...',
                    progressPercent: 55,
                    optimizedStats: {
                      originalSize: optimized.originalSize,
                      optimizedSize: optimized.optimizedSize,
                      reducedPercent: optimized.reducedPercent,
                    },
                  }
                : t
            )
          );

          // Step 2: Gemini API Call
          const data = await safeFetchJson<{ fixtures?: any[]; error?: string }>(
            '/api/gemini/parse-calendar-screenshot',
            {
              method: 'POST',
              headers: getApiHeaders({ 'Content-Type': 'application/json' }),
              signal: controller.signal,
              body: JSON.stringify({
                imageBase64: optimized.dataUrl,
                mimeType: optimized.mimeType,
                userTeamName: teamName || 'La Tua Squadra',
              }),
            }
          );

          if (controller.signal.aborted) return;

          const rawList = data.fixtures || [];
          if (!Array.isArray(rawList) || rawList.length === 0) {
            throw new Error(
              data.error ||
                'Nessuna partita rilevata nello screenshot. Assicurati che l\'immagine mostri la schermata "Calendario / Partite" di FM26.'
            );
          }

          const formatted = normalizeCalendarFixtures(rawList);

          setTasks(prev =>
            prev.map(t =>
              t.id === taskId
                ? {
                    ...t,
                    status: 'completed',
                    phaseLabel: `Completato: ${formatted.length} partite estratte!`,
                    progressPercent: 100,
                    completedAt: Date.now(),
                    calendarFixtures: formatted,
                  }
                : t
            )
          );

          setLatestNotification({
            id: `notif_${Date.now()}`,
            type: 'success',
            message: `Calendario analizzato: ${formatted.length} partite pronte da applicare!`,
            taskId,
            timestamp: Date.now(),
          });
        } catch (err: any) {
          if (controller.signal.aborted) return;
          console.error('Error in background calendar OCR:', err);
          const errorMessage = err?.message || 'Errore durante la scansione dello screenshot del calendario.';
          setTasks(prev =>
            prev.map(t =>
              t.id === taskId
                ? {
                    ...t,
                    status: 'error',
                    error: errorMessage,
                    phaseLabel: 'Errore durante la scansione',
                    progressPercent: 100,
                  }
                : t
            )
          );

          setLatestNotification({
            id: `notif_${Date.now()}`,
            type: 'error',
            message: errorMessage,
            taskId,
            timestamp: Date.now(),
          });
        } finally {
          abortControllersRef.current.delete(taskId);
        }
      })();

      return taskId;
    },
    [teamName]
  );

  // Start Standings OCR Task
  const startStandingsTask = useCallback(
    async (fileOrDataUrl: File | string, fileName?: string): Promise<string> => {
      const taskId = `task_std_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const controller = new AbortController();
      abortControllersRef.current.set(taskId, controller);

      const name = fileName || (typeof fileOrDataUrl === 'string' ? 'Screenshot Classifica' : fileOrDataUrl.name);

      let initialPreview = '';
      if (typeof fileOrDataUrl === 'string') {
        initialPreview = fileOrDataUrl;
      }

      const newTask: BackgroundOcrTask = {
        id: taskId,
        type: 'standings',
        title: 'Screenshot Classifica FM26',
        fileName: name,
        imagePreview: initialPreview,
        status: 'optimizing',
        phaseLabel: 'Ottimizzazione screenshot classifica...',
        progressPercent: 20,
        elapsedSeconds: 0,
        startedAt: Date.now(),
      };

      setTasks(prev => [newTask, ...prev]);

      (async () => {
        try {
          if (!hasCustomApiKey()) {
            throw new Error(
              "Chiave API personale richiesta: per analizzare lo screenshot della classifica con l'IA, inserisci prima la tua Google Gemini API Key gratuita (BYOK) nella barra in alto."
            );
          }

          // Step 1: Optimize
          const optimized = await optimizeScreenshot(fileOrDataUrl);
          if (controller.signal.aborted) return;

          setTasks(prev =>
            prev.map(t =>
              t.id === taskId
                ? {
                    ...t,
                    imagePreview: optimized.dataUrl,
                    status: 'analyzing',
                    phaseLabel: 'Analisi Gemini Vision in background...',
                    progressPercent: 60,
                    optimizedStats: {
                      originalSize: optimized.originalSize,
                      optimizedSize: optimized.optimizedSize,
                      reducedPercent: optimized.reducedPercent,
                    },
                  }
                : t
            )
          );

          // Step 2: Gemini API Call
          const data = await safeFetchJson<{ standings?: any[]; error?: string }>(
            '/api/gemini/parse-standings-screenshot',
            {
              method: 'POST',
              headers: getApiHeaders({ 'Content-Type': 'application/json' }),
              signal: controller.signal,
              body: JSON.stringify({
                imageBase64: optimized.dataUrl,
                mimeType: optimized.mimeType,
                userTeamName: teamName || '',
              }),
            }
          );

          if (controller.signal.aborted) return;

          const rawList = data.standings || [];
          if (!Array.isArray(rawList) || rawList.length === 0) {
            throw new Error(
              data.error || 'Nessuna riga di classifica valida riconosciuta nello screenshot della classifica.'
            );
          }

          const formatted = normalizeStandingsRows(rawList);

          setTasks(prev =>
            prev.map(t =>
              t.id === taskId
                ? {
                    ...t,
                    status: 'completed',
                    phaseLabel: `Completato: ${formatted.length} squadre riconosciute!`,
                    progressPercent: 100,
                    completedAt: Date.now(),
                    standingsRows: formatted,
                  }
                : t
            )
          );

          setLatestNotification({
            id: `notif_${Date.now()}`,
            type: 'success',
            message: `Classifica analizzata: ${formatted.length} squadre pronte da applicare!`,
            taskId,
            timestamp: Date.now(),
          });
        } catch (err: any) {
          if (controller.signal.aborted) return;
          console.error('Error in background standings OCR:', err);
          const errorMessage = err?.message || 'Impossibile analizzare lo screenshot della classifica.';
          setTasks(prev =>
            prev.map(t =>
              t.id === taskId
                ? {
                    ...t,
                    status: 'error',
                    error: errorMessage,
                    phaseLabel: 'Errore durante la scansione',
                    progressPercent: 100,
                  }
                : t
            )
          );

          setLatestNotification({
            id: `notif_${Date.now()}`,
            type: 'error',
            message: errorMessage,
            taskId,
            timestamp: Date.now(),
          });
        } finally {
          abortControllersRef.current.delete(taskId);
        }
      })();

      return taskId;
    },
    [teamName]
  );

  const cancelTask = useCallback((taskId: string) => {
    const controller = abortControllersRef.current.get(taskId);
    if (controller) {
      controller.abort();
      abortControllersRef.current.delete(taskId);
    }
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }, []);

  const dismissTask = useCallback((taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    setActiveReviewTask(prev => (prev?.id === taskId ? null : prev));
  }, []);

  const clearAllCompleted = useCallback(() => {
    setTasks(prev => prev.filter(t => t.status !== 'completed' && t.status !== 'error'));
  }, []);

  const applyCalendarFixtures = useCallback(
    (taskId: string, replaceExisting: boolean) => {
      const task = tasks.find(t => t.id === taskId);
      if (!task || !task.calendarFixtures || task.calendarFixtures.length === 0) return;

      const incoming = task.calendarFixtures;
      const combined = replaceExisting ? incoming : [...fixtures, ...incoming];
      const sorted = sortFixturesByDate(combined);
      onUpdateFixtures(sorted);

      // Update in-game date to latest played match if present
      const playedMatches = sorted.filter(f => f.status === 'Giocata' && Boolean(f.score));
      if (playedMatches.length > 0 && onUpdateCurrentDate) {
        const latestPlayed = playedMatches[playedMatches.length - 1];
        if (latestPlayed && latestPlayed.date) {
          onUpdateCurrentDate(latestPlayed.date);
        }
      }

      setTasks(prev => prev.filter(t => t.id !== taskId));
      setActiveReviewTask(null);

      setLatestNotification({
        id: `applied_${Date.now()}`,
        type: 'info',
        message: `Calendario aggiornato con successo (${sorted.length} partite totali)!`,
        taskId,
        timestamp: Date.now(),
      });
    },
    [tasks, fixtures, onUpdateFixtures, onUpdateCurrentDate]
  );

  const applyStandings = useCallback(
    (taskId: string) => {
      const task = tasks.find(t => t.id === taskId);
      if (!task || !task.standingsRows || task.standingsRows.length === 0) return;

      onUpdateStandings(task.standingsRows);
      setTasks(prev => prev.filter(t => t.id !== taskId));
      setActiveReviewTask(null);

      setLatestNotification({
        id: `applied_std_${Date.now()}`,
        type: 'info',
        message: `Classifica aggiornata con successo (${task.standingsRows.length} squadre sincronizzate)!`,
        taskId,
        timestamp: Date.now(),
      });
    },
    [tasks, onUpdateStandings]
  );

  const openReviewModal = useCallback(
    (taskId: string) => {
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        setActiveReviewTask(task);
      }
    },
    [tasks]
  );

  const closeReviewModal = useCallback(() => {
    setActiveReviewTask(null);
  }, []);

  const dismissNotification = useCallback(() => {
    setLatestNotification(null);
  }, []);

  const getTaskById = useCallback(
    (taskId: string) => {
      return tasks.find(t => t.id === taskId);
    },
    [tasks]
  );

  const activeTasks = tasks.filter(t => (t.status === 'optimizing' || t.status === 'analyzing') && !t.isDismissed);
  const completedTasks = tasks.filter(t => (t.status === 'completed' || t.status === 'error') && !t.isDismissed);

  return (
    <BackgroundOcrContext.Provider
      value={{
        tasks,
        activeTasks,
        completedTasks,
        latestNotification,
        activeReviewTask,
        startCalendarTask,
        startStandingsTask,
        cancelTask,
        dismissTask,
        clearAllCompleted,
        applyCalendarFixtures,
        applyStandings,
        openReviewModal,
        closeReviewModal,
        dismissNotification,
        getTaskById,
      }}
    >
      {children}
    </BackgroundOcrContext.Provider>
  );
};

export function useBackgroundOcr() {
  const ctx = useContext(BackgroundOcrContext);
  if (!ctx) {
    throw new Error('useBackgroundOcr must be used within a BackgroundOcrProvider');
  }
  return ctx;
}
