import React, { useState } from 'react';
import { Fixture } from '../types';
import { Upload, Camera, FileImage, Sparkles, Loader2, Check, X, Trash2, Plus, Calendar, AlertCircle, Key, Zap, Layers, ArrowRight } from 'lucide-react';
import { getApiHeaders, hasCustomApiKey } from '../utils/apiKeyStorage';
import { safeFetchJson } from '../utils/apiUtils';
import { ScreenshotOcrProgressBar } from './ScreenshotOcrProgressBar';
import { useBackgroundOcr } from '../context/BackgroundOcrContext';
import { optimizeScreenshot, formatBytes } from '../utils/screenshotOptimizer';

async function optimizeCalendarScreenshot(file: File): Promise<{
  dataUrl: string;
  mimeType: string;
  originalSize: number;
  optimizedSize: number;
  reducedPercent: number;
}> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const rawDataUrl = reader.result as string;
      const originalSize = file.size || Math.round(rawDataUrl.length * 0.75);
      const img = new Image();
      img.onload = () => {
        // 1920px max dimension guarantees 100% crisp legibility for FM26 dates, teams, scores & badges
        const maxDim = 1920;
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({
            dataUrl: rawDataUrl,
            mimeType: file.type || 'image/png',
            originalSize,
            optimizedSize: originalSize,
            reducedPercent: 0,
          });
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // Compress to high-quality JPEG (0.90) for massive 85-95% bandwidth and token savings
        const targetMime = 'image/jpeg';
        const optimizedDataUrl = canvas.toDataURL(targetMime, 0.90);
        const optimizedSize = Math.round(optimizedDataUrl.length * 0.75);
        const reducedPercent = Math.max(0, Math.round(((originalSize - optimizedSize) / originalSize) * 100));

        resolve({
          dataUrl: optimizedDataUrl,
          mimeType: targetMime,
          originalSize,
          optimizedSize,
          reducedPercent,
        });
      };
      img.onerror = () => {
        resolve({
          dataUrl: rawDataUrl,
          mimeType: file.type || 'image/png',
          originalSize,
          optimizedSize: originalSize,
          reducedPercent: 0,
        });
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
}

interface CalendarScreenshotUploaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportFixtures: (newFixtures: Fixture[], replaceExisting: boolean) => void;
  teamName?: string;
}

export const CalendarScreenshotUploaderModal: React.FC<CalendarScreenshotUploaderModalProps> = ({
  isOpen,
  onClose,
  onImportFixtures,
  teamName = 'La Tua Squadra FC',
}) => {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [optimizedMime, setOptimizedMime] = useState<string>('image/jpeg');
  const [imageStats, setImageStats] = useState<{ originalSize: number; optimizedSize: number; reducedPercent: number } | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [parsedFixtures, setParsedFixtures] = useState<Fixture[]>([]);
  const [replaceExisting, setReplaceExisting] = useState(false);

  const { startCalendarTask, completedTasks } = useBackgroundOcr();

  const latestCompletedCalendarTask = completedTasks.find(
    t => t.type === 'calendar' && t.calendarFixtures && t.calendarFixtures.length > 0
  );

  const handleStartBackgroundOcr = () => {
    if (!imagePreview) return;
    if (!hasCustomApiKey()) {
      setErrorMessage("Chiave API personale richiesta: per analizzare gli screenshot con l'IA, inserisci prima la tua Google Gemini API Key gratuita cliccando su 'Chiave API (BYOK)' nella barra in alto.");
      return;
    }
    startCalendarTask(imagePreview, imageFile?.name || 'Screenshot Calendario');
    onClose();
  };

  const handleSendToBackground = () => {
    if (imagePreview) {
      startCalendarTask(imagePreview, imageFile?.name || 'Screenshot Calendario');
    }
    setIsAnalyzing(false);
    onClose();
  };

  const handleSafeClose = () => {
    if (isAnalyzing && imagePreview) {
      startCalendarTask(imagePreview, imageFile?.name || 'Screenshot Calendario');
    }
    onClose();
  };

  if (!isOpen) return null;

  const handleFileChange = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Seleziona un file immagine valido (PNG, JPG, WEBP).');
      return;
    }
    setErrorMessage(null);
    setImageFile(file);
    setIsOptimizing(true);
    try {
      const optimized = await optimizeCalendarScreenshot(file);
      setImagePreview(optimized.dataUrl);
      setOptimizedMime(optimized.mimeType);
      setImageStats({
        originalSize: optimized.originalSize,
        optimizedSize: optimized.optimizedSize,
        reducedPercent: optimized.reducedPercent,
      });
    } catch {
      const reader = new FileReader();
      reader.onload = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.items) {
      const items = Array.from(e.clipboardData.items) as DataTransferItem[];
      for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile();
          if (blob) handleFileChange(blob);
          break;
        }
      }
    }
  };

  const handleAnalyzeScreenshot = async () => {
    if (!imagePreview) return;

    if (!hasCustomApiKey()) {
      setErrorMessage("Chiave API personale richiesta: per analizzare gli screenshot con l'IA, inserisci prima la tua Google Gemini API Key gratuita cliccando su 'Chiave API (BYOK)' nella barra in alto.");
      return;
    }

    setIsAnalyzing(true);
    setErrorMessage(null);

    try {
      const data = await safeFetchJson<{ fixtures?: Fixture[] }>('/api/gemini/parse-calendar-screenshot', {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          imageBase64: imagePreview,
          mimeType: optimizedMime || imageFile?.type || 'image/jpeg',
          userTeamName: teamName,
        }),
      });

      const rawList = data.fixtures || [];

      if (!Array.isArray(rawList) || rawList.length === 0) {
        throw new Error('Nessuna partita rilevata nello screenshot. Assicurati che l\'immagine mostri la schermata "Calendario / Partite" di FM26.');
      }

      const formatted: Fixture[] = rawList.map((item: any, idx: number) => {
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

      setParsedFixtures(formatted);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Errore nella scansione dello screenshot.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAddManualRow = () => {
    setParsedFixtures((prev) => [
      ...prev,
      {
        id: `manual_f_${Date.now()}`,
        date: '28 Ottobre 2026',
        opponent: 'Nuova Squadra',
        venue: 'Casa',
        competition: 'Premier League',
        importance: 'Alta',
        status: 'In Arrivo',
        predictedFatigueRisk: 'Medio',
      },
    ]);
  };

  const handleRemoveRow = (id: string) => {
    setParsedFixtures((prev) => prev.filter((f) => f.id !== id));
  };

  const handleSwapScore = (id: string) => {
    setParsedFixtures((prev) =>
      prev.map((f) => {
        if (f.id !== id || !f.score) return f;
        const match = f.score.match(/(\d+)\s*[-:]\s*(\d+)/);
        if (!match) return f;
        const g1 = parseInt(match[1], 10);
        const g2 = parseInt(match[2], 10);
        const newScore = `${g2}-${g1}`;
        const newOutcome = g2 > g1 ? 'Vittoria' : g2 === g1 ? 'Pareggio' : 'Sconfitta';
        return {
          ...f,
          score: newScore,
          outcome: newOutcome,
        };
      })
    );
  };

  const handleScoreChange = (id: string, newScore: string) => {
    setParsedFixtures((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const clean = newScore.trim();
        if (!clean) {
          return { ...f, score: undefined, outcome: undefined, status: 'In Arrivo' };
        }
        const match = clean.match(/(\d+)\s*[-:]\s*(\d+)/);
        let outcome = f.outcome;
        if (match) {
          const g1 = parseInt(match[1], 10);
          const g2 = parseInt(match[2], 10);
          outcome = g1 > g2 ? 'Vittoria' : g1 === g2 ? 'Pareggio' : 'Sconfitta';
        }
        return {
          ...f,
          score: clean,
          outcome,
          status: 'Giocata',
        };
      })
    );
  };

  const handleFieldChange = (id: string, field: keyof Fixture, value: any) => {
    setParsedFixtures((prev) =>
      prev.map((f) => (f.id === id ? { ...f, [field]: value } : f))
    );
  };

  const handleConfirmImport = () => {
    if (parsedFixtures.length === 0) return;
    onImportFixtures(parsedFixtures, replaceExisting);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto"
      onPaste={handlePaste}
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden my-6 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Importa Calendario da Screenshot
                <span className="bg-indigo-500/20 text-indigo-300 text-[10px] font-semibold px-2 py-0.5 rounded border border-indigo-500/30 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-indigo-400" /> AI OCR Vision
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Fai uno screenshot alla schermata Partite di Football Manager 2026 per estrarre automaticamente il calendario.
              </p>
            </div>
          </div>
          <button
            onClick={handleSafeClose}
            title={isAnalyzing ? "Riduci e continua l'elaborazione in background" : "Chiudi"}
            className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Banner for completed background task if present */}
          {parsedFixtures.length === 0 && latestCompletedCalendarTask && latestCompletedCalendarTask.calendarFixtures && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-emerald-300 animate-fade-in">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Trovata un'analisi completata in background: <strong>{latestCompletedCalendarTask.calendarFixtures.length} partite</strong> ({latestCompletedCalendarTask.fileName})
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (latestCompletedCalendarTask.calendarFixtures) {
                    setParsedFixtures(latestCompletedCalendarTask.calendarFixtures);
                  }
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs cursor-pointer shadow-sm transition-colors self-start sm:self-auto"
              >
                Carica in questa tabella
              </button>
            </div>
          )}

          {/* Upload Drop Zone / Image Selector */}
          {parsedFixtures.length === 0 ? (
            <div className="space-y-4">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all flex flex-col items-center justify-center min-h-[220px] ${
                  imagePreview
                    ? 'border-indigo-500/50 bg-indigo-950/20'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-950/50'
                }`}
              >
                {imagePreview ? (
                  <div className="space-y-3 w-full">
                    <div className="max-h-[260px] overflow-hidden rounded-xl border border-slate-800 mx-auto relative group">
                      <img
                        src={imagePreview}
                        alt="Screenshot Preview"
                        className="w-full object-contain max-h-[240px]"
                      />
                      <button
                        onClick={() => {
                          setImageFile(null);
                          setImagePreview(null);
                          setImageStats(null);
                        }}
                        className="absolute top-2 right-2 bg-slate-950/80 hover:bg-rose-900/90 text-slate-200 hover:text-white p-1.5 rounded-lg border border-slate-700 text-xs flex items-center gap-1 backdrop-blur-sm transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Cambia Immagine
                      </button>
                    </div>
                    {imageStats && imageStats.reducedPercent > 0 && (
                      <div className="flex items-center justify-center gap-1.5 text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 py-1 px-3 rounded-full mx-auto w-fit">
                        <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>
                          Ottimizzato per velocità: <strong>{formatBytes(imageStats.optimizedSize)}</strong> (da {formatBytes(imageStats.originalSize)}, -{imageStats.reducedPercent}% upload)
                        </span>
                      </div>
                    )}
                    <p className="text-xs text-emerald-400 font-medium flex items-center justify-center gap-1">
                      <Check className="w-4 h-4" /> Screenshot pronto per l'analisi rapida!
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center mx-auto">
                      {isOptimizing ? <Loader2 className="w-6 h-6 animate-spin text-indigo-400" /> : <Upload className="w-6 h-6" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-200">
                        {isOptimizing ? 'Ottimizzazione immagine in corso...' : (
                          <>Trascina lo screenshot qui o <label className="text-indigo-400 hover:underline cursor-pointer">sfoglia i file<input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])} /></label></>
                        )}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Puoi anche semplicemente **Incollare dall'appunti** (<kbd className="bg-slate-800 text-slate-300 px-1 rounded text-[10px]">Ctrl+V</kbd> o <kbd className="bg-slate-800 text-slate-300 px-1 rounded text-[10px]">Cmd+V</kbd>)
                      </p>
                    </div>
                    <div className="pt-2 text-[11px] text-slate-400 bg-slate-900/80 px-3 py-1.5 rounded-xl inline-block border border-slate-800 text-left">
                      💡 <strong>Consiglio FM26:</strong> Vai su Partite → Calendario/Incontri e incolla lo screenshot. L'IA rileva automaticamente data, avversario, competizione e il luogo (<strong>C = Casa</strong>, <strong>T = Trasferta</strong>, <strong>N = Campo Neutro</strong>).
                    </div>
                  </div>
                )}
              </div>

              {/* Real-time OCR Progress Bar & Latency Diagnostics */}
              {isAnalyzing && (
                <div className="space-y-2">
                  <ScreenshotOcrProgressBar
                    isLoading={isAnalyzing}
                    context="calendar"
                    title="Analisi & Scansione Calendario FM26"
                    error={errorMessage}
                  />
                  <button
                    type="button"
                    onClick={handleSendToBackground}
                    className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white font-semibold text-xs rounded-xl border border-indigo-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <Layers className="w-4 h-4 text-indigo-400" />
                    <span>⚡ Riduci ed elabora in Background (continua a usare l'applet)</span>
                  </button>
                </div>
              )}

              {errorMessage && !isAnalyzing && (
                <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 p-3 rounded-xl text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Analyze CTAs */}
              {imagePreview && !isAnalyzing && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={handleStartBackgroundOcr}
                    disabled={isAnalyzing || isOptimizing}
                    className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white border border-indigo-500/40 rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Layers className="w-4 h-4 text-indigo-400" />
                    <span>🚀 Analizza in Background (usa l'applet)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAnalyzeScreenshot}
                    disabled={isAnalyzing || isOptimizing}
                    className="py-3 px-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>Analizza in Primo Piano</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Results Review & Manual Tuning Table */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-emerald-400" />
                    Partite Rilevate ({parsedFixtures.length})
                  </h4>
                  <p className="text-xs text-slate-400">
                    Verifica o modifica i dati estratti prima di confermare l'importazione nel tuo assistente.
                  </p>
                </div>
                <button
                  onClick={handleAddManualRow}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 text-xs font-semibold rounded-xl border border-slate-700 flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Aggiungi Partita
                </button>
              </div>

              <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Data</th>
                      <th className="py-2.5 px-3">Avversario</th>
                      <th className="py-2.5 px-3">Luogo</th>
                      <th className="py-2.5 px-3">Competizione</th>
                      <th className="py-2.5 px-3 text-center">Risultato (Nostri-Loro)</th>
                      <th className="py-2.5 px-3 text-center">Esito</th>
                      <th className="py-2.5 px-3">Importanza</th>
                      <th className="py-2.5 px-3 text-right">Azione</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {parsedFixtures.map((f) => (
                      <tr key={f.id} className="hover:bg-slate-900/40">
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={f.date}
                            onChange={(e) => handleFieldChange(f.id, 'date', e.target.value)}
                            className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200 w-28 focus:border-emerald-500 focus:outline-none"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={f.opponent}
                            onChange={(e) => handleFieldChange(f.id, 'opponent', e.target.value)}
                            className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-100 font-bold w-32 focus:border-emerald-500 focus:outline-none"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <select
                            value={f.venue}
                            onChange={(e) => handleFieldChange(f.id, 'venue', e.target.value as 'Casa' | 'Trasferta' | 'Campo Neutro')}
                            className={`border rounded-lg px-2 py-1 text-xs font-semibold focus:border-emerald-500 focus:outline-none ${
                              f.venue === 'Casa'
                                ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                                : f.venue === 'Trasferta'
                                ? 'bg-sky-950/40 border-sky-500/30 text-sky-300'
                                : 'bg-slate-900 border-slate-800 text-slate-300'
                            }`}
                          >
                            <option value="Casa">C - Casa</option>
                            <option value="Trasferta">T - Trasferta</option>
                            <option value="Campo Neutro">N - Neutro</option>
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            list="screenshot-comp-list"
                            value={f.competition}
                            onChange={(e) => handleFieldChange(f.id, 'competition', e.target.value)}
                            placeholder="Competizione"
                            className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none w-32"
                          />
                          <datalist id="screenshot-comp-list">
                            <option value="Premier League" />
                            <option value="Champions League" />
                            <option value="Carabao Cup" />
                            <option value="FA Cup" />
                            <option value="Europa League" />
                            <option value="Conference League" />
                            <option value="Coppa Intercontinentale" />
                            <option value="FIFA Club World Cup" />
                            <option value="Supercoppa UEFA" />
                            <option value="Amichevole" />
                          </datalist>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="text"
                              value={f.score || ''}
                              placeholder="es. 2-1"
                              onChange={(e) => handleScoreChange(f.id, e.target.value)}
                              className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-center font-bold text-emerald-300 w-16 focus:border-emerald-500 focus:outline-none"
                            />
                            {f.score && (
                              <button
                                type="button"
                                onClick={() => handleSwapScore(f.id)}
                                className="p-1 hover:bg-slate-800 text-slate-400 hover:text-amber-300 rounded border border-slate-800 transition-colors cursor-pointer"
                                title="Inverti gol (es. 1-2 ⇄ 2-1)"
                              >
                                ⇄
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-center">
                          {f.score ? (
                            (() => {
                              const match = f.score.match(/(\d+)\s*[-:]\s*(\d+)/);
                              if (match) {
                                const g1 = parseInt(match[1], 10);
                                const g2 = parseInt(match[2], 10);
                                if (g1 > g2) {
                                  return (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                      Vittoria (V)
                                    </span>
                                  );
                                } else if (g1 === g2) {
                                  return (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                      Pareggio (P)
                                    </span>
                                  );
                                } else {
                                  return (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                      Sconfitta (S)
                                    </span>
                                  );
                                }
                              }
                              return <span className="text-slate-500 text-[10px]">-</span>;
                            })()
                          ) : (
                            <span className="text-slate-500 text-[10px]">In Arrivo</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <select
                            value={f.importance}
                            onChange={(e) => handleFieldChange(f.id, 'importance', e.target.value as 'Cruciale' | 'Alta' | 'Media')}
                            className="bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-300 focus:border-emerald-500 focus:outline-none"
                          >
                            <option value="Cruciale">Cruciale</option>
                            <option value="Alta">Alta</option>
                            <option value="Media">Media</option>
                          </select>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <button
                            onClick={() => handleRemoveRow(f.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
                            title="Rimuovi partita"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mode toggle */}
              <div className="flex flex-wrap items-center gap-4 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs">
                <span className="text-slate-400 font-medium">Modalità Importazione:</span>
                <label className="flex items-center space-x-1.5 cursor-pointer text-slate-200 font-semibold">
                  <input
                    type="radio"
                    name="importMode"
                    checked={!replaceExisting}
                    onChange={() => setReplaceExisting(false)}
                    className="accent-emerald-500"
                  />
                  <span>Aggiungi alle partite esistenti (Predefinito)</span>
                </label>
                <label className="flex items-center space-x-1.5 cursor-pointer text-slate-400 hover:text-slate-200">
                  <input
                    type="radio"
                    name="importMode"
                    checked={replaceExisting}
                    onChange={() => setReplaceExisting(true)}
                    className="accent-emerald-500"
                  />
                  <span>Sostituisci interamente il calendario</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-950 px-6 py-4 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={() => {
              if (parsedFixtures.length > 0) {
                setParsedFixtures([]);
              } else {
                onClose();
              }
            }}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-medium border border-slate-800 transition-colors"
          >
            {parsedFixtures.length > 0 ? 'Ricomincia / Carica Altro Screenshot' : 'Annulla'}
          </button>

          {parsedFixtures.length > 0 && (
            <button
              onClick={handleConfirmImport}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-lg transition-all flex items-center space-x-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Conferma e Salva {parsedFixtures.length} Partite</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
