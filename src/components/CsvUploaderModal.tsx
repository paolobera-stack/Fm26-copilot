import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Player, ScoutingTarget, YouthSquad } from '../types';
import { parseCsvText, generateSampleCsv, ParsedCsvResult, getEffectiveAge } from '../utils/csvParser';
import {
  computeSquadDiffReport,
  mergePlayerWithHistory,
  normalizePlayerName,
  SquadDiffSummary
} from '../utils/attributeDiffUtils';
import {
  Upload,
  FileSpreadsheet,
  Download,
  X,
  CheckCircle2,
  AlertCircle,
  Users,
  Search,
  RefreshCw,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Trash2,
  GraduationCap,
  TrendingUp,
  TrendingDown,
  History,
  ArrowUpRight,
  ArrowDownRight,
  MoveRight,
  AlertTriangle
} from 'lucide-react';

interface CsvUploaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlayers: Player[];
  currentTargets: ScoutingTarget[];
  youthSquads?: YouthSquad[];
  onUpdatePlayers: (players: Player[]) => void;
  onUpdateTargets: (targets: ScoutingTarget[]) => void;
  onUpdateYouthSquads?: (squads: YouthSquad[]) => void;
  defaultDestination?: 'squad' | 'scouting' | string;
  currentDate?: string;
}

export const CsvUploaderModal: React.FC<CsvUploaderModalProps> = ({
  isOpen,
  onClose,
  currentPlayers,
  currentTargets,
  youthSquads = [],
  onUpdatePlayers,
  onUpdateTargets,
  onUpdateYouthSquads,
  defaultDestination = 'squad',
  currentDate,
}) => {
  const [destination, setDestination] = useState<string>(defaultDestination);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [parsedData, setParsedData] = useState<ParsedCsvResult | null>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [previewTab, setPreviewTab] = useState<'diff' | 'records'>('diff');
  const [autoRemoveOtherSquadDuplicates, setAutoRemoveOtherSquadDuplicates] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Reset all uploaded and parsed state whenever the modal opens or default destination changes
  useEffect(() => {
    if (isOpen) {
      setDestination(defaultDestination);
      setParsedData(null);
      setFileNames([]);
      setImportMode('merge');
      setIsDragging(false);
      setPreviewTab('diff');
      setAutoRemoveOtherSquadDuplicates(true);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [isOpen, defaultDestination]);

  // Calcolo dei conflitti: controlla se i giocatori importati sono già presenti in altre rose del club
  const otherSquadConflicts = useMemo(() => {
    if (!parsedData || parsedData.parsedPlayers.length === 0 || destination === 'scouting') {
      return [];
    }
    const conflicts: { playerName: string; otherSquadNames: string[] }[] = [];
    const incomingNames = new Set(parsedData.parsedPlayers.map((p) => normalizePlayerName(p.name)));

    if (destination === 'squad') {
      // Controlla squadre giovanili
      youthSquads.forEach((sq) => {
        (sq.players || []).forEach((p) => {
          const norm = normalizePlayerName(p.name);
          if (incomingNames.has(norm)) {
            const existing = conflicts.find((c) => normalizePlayerName(c.playerName) === norm);
            if (existing) {
              if (!existing.otherSquadNames.includes(sq.name)) {
                existing.otherSquadNames.push(sq.name);
              }
            } else {
              conflicts.push({ playerName: p.name, otherSquadNames: [sq.name] });
            }
          }
        });
      });
    } else if (destination.startsWith('youth_') || youthSquads.some((s) => s.id === destination)) {
      const targetSquadId = destination.replace(/^youth_/, '');
      // Controlla Prima Squadra
      currentPlayers.forEach((p) => {
        const norm = normalizePlayerName(p.name);
        if (incomingNames.has(norm)) {
          conflicts.push({ playerName: p.name, otherSquadNames: ['Prima Squadra'] });
        }
      });
      // Controlla altre giovanili
      youthSquads
        .filter((s) => s.id !== targetSquadId)
        .forEach((sq) => {
          (sq.players || []).forEach((p) => {
            const norm = normalizePlayerName(p.name);
            if (incomingNames.has(norm)) {
              const existing = conflicts.find((c) => normalizePlayerName(c.playerName) === norm);
              if (existing) {
                if (!existing.otherSquadNames.includes(sq.name)) {
                  existing.otherSquadNames.push(sq.name);
                }
              } else {
                conflicts.push({ playerName: p.name, otherSquadNames: [sq.name] });
              }
            }
          });
        });
    }

    return conflicts;
  }, [parsedData, destination, currentPlayers, youthSquads]);

  // Calcolo del report di confronto (Diff) tra il CSV nuovo e i giocatori attuali
  const squadDiffReport = useMemo<SquadDiffSummary | null>(() => {
    if (!parsedData || parsedData.parsedPlayers.length === 0) return null;
    if (destination === 'squad') {
      return computeSquadDiffReport(currentPlayers, parsedData.parsedPlayers);
    }
    if (destination.startsWith('youth_') || youthSquads.some((s) => s.id === destination)) {
      const targetSquadId = destination.replace(/^youth_/, '');
      const targetSquad = youthSquads.find((s) => s.id === targetSquadId);
      if (targetSquad) {
        return computeSquadDiffReport(targetSquad.players, parsedData.parsedPlayers);
      }
    }
    return null;
  }, [parsedData, destination, currentPlayers, youthSquads]);

  if (!isOpen) return null;

  const handleClose = () => {
    setParsedData(null);
    setFileNames([]);
    setIsDragging(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  const handleClearFiles = (e: React.MouseEvent) => {
    e.stopPropagation();
    setParsedData(null);
    setFileNames([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFilesChange = (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    setFileNames(fileArray.map((f) => f.name));

    const readPromises = fileArray.map(
      (file) =>
        new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve((e.target?.result as string) || '');
          reader.onerror = () => resolve('');
          reader.readAsText(file);
        })
    );

    const currentDest = destination || defaultDestination || 'squad';

    Promise.all(readPromises).then((contents) => {
      let combinedPlayers: Player[] = [];
      let combinedTargets: ScoutingTarget[] = [];

      contents.forEach((content) => {
        if (content.trim()) {
          const res = parseCsvText(content, currentDate);
          if (res.parsedPlayers && res.parsedPlayers.length > 0) {
            combinedPlayers = [...combinedPlayers, ...res.parsedPlayers];
          }
          if (res.parsedTargets && res.parsedTargets.length > 0) {
            combinedTargets = [...combinedTargets, ...res.parsedTargets];
          }
        }
      });

      // Deduplicate combined players by name
      const playerMap = new Map<string, Player>();
      combinedPlayers.forEach((p) => {
        const key = p.name.toLowerCase().trim();
        if (!playerMap.has(key)) {
          playerMap.set(key, p);
        } else {
          // Merge details if available
          const existing = playerMap.get(key)!;
          playerMap.set(key, { ...existing, ...p });
        }
      });

      // Deduplicate combined targets by name
      const targetMap = new Map<string, ScoutingTarget>();
      combinedTargets.forEach((t) => {
        const key = t.name.toLowerCase().trim();
        if (!targetMap.has(key)) {
          targetMap.set(key, t);
        } else {
          const existing = targetMap.get(key)!;
          targetMap.set(key, { ...existing, ...t });
        }
      });

      const finalPlayers = Array.from(playerMap.values());
      const finalTargets = Array.from(targetMap.values());

      setParsedData({
        headers: ['Name', 'Nation', 'Born', 'CA', 'PA', 'Positions'],
        rawRows: [],
        detectedType: currentDest === 'scouting' ? 'scouting' : 'squad',
        parsedPlayers: finalPlayers,
        parsedTargets: finalTargets,
      });

      setDestination(currentDest);
    });
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesChange(e.dataTransfer.files);
    }
  };

  const handleDownloadTemplate = (type: 'squad' | 'scouting') => {
    const csvContent = generateSampleCsv(type);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = type === 'squad' ? 'FM26_Template_Rosa.csv' : 'FM26_Template_Acquisti_Scouting.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleApplyImport = () => {
    if (!parsedData) return;

    const importTimestamp = Date.now();

    if (destination === 'squad') {
      const newPlayers = parsedData.parsedPlayers;
      const existingMap = new Map<string, Player>(
        currentPlayers.map((p) => [normalizePlayerName(p.name), p])
      );

      if (importMode === 'replace') {
        // Preserva comunque lo storico delle rilevazioni e le note per i giocatori già censiti
        const finalPlayers = newPlayers.map((np) => {
          const key = normalizePlayerName(np.name);
          if (existingMap.has(key)) {
            return mergePlayerWithHistory(existingMap.get(key)!, np, currentDate, importTimestamp);
          }
          return {
            ...np,
            attributeHistory: [],
            lastUpdatedDate: currentDate || new Date().toISOString().split('T')[0],
            lastUpdatedTimestamp: importTimestamp,
          };
        });
        onUpdatePlayers(finalPlayers);
      } else {
        // Merge: aggiorna i giocatori esistenti archiviando la rilevazione precedente o aggiunge i nuovi
        newPlayers.forEach((np) => {
          const key = normalizePlayerName(np.name);
          if (existingMap.has(key)) {
            const existing = existingMap.get(key)!;
            existingMap.set(key, mergePlayerWithHistory(existing, np, currentDate, importTimestamp));
          } else {
            existingMap.set(key, {
              ...np,
              attributeHistory: [],
              lastUpdatedDate: currentDate || new Date().toISOString().split('T')[0],
              lastUpdatedTimestamp: importTimestamp,
            });
          }
        });
        onUpdatePlayers(Array.from(existingMap.values()));
      }

      // Prevenzione Doppioni: se richiesto, rimuovi i giocatori importati dalle squadre giovanili
      if (autoRemoveOtherSquadDuplicates && onUpdateYouthSquads && youthSquads.length > 0) {
        const incomingNorms = new Set(newPlayers.map((p) => normalizePlayerName(p.name)));
        const cleanedYouth = youthSquads.map((sq) => ({
          ...sq,
          players: (sq.players || []).filter((p) => !incomingNorms.has(normalizePlayerName(p.name))),
        }));
        onUpdateYouthSquads(cleanedYouth);
      }
    } else if (destination === 'scouting') {
      const newTargets = parsedData.parsedTargets;
      if (importMode === 'replace') {
        onUpdateTargets(newTargets);
      } else {
        const existingMap = new Map<string, ScoutingTarget>(
          currentTargets.map((t) => [t.name.toLowerCase().trim(), t])
        );
        newTargets.forEach((nt) => {
          const key = nt.name.toLowerCase().trim();
          if (existingMap.has(key)) {
            const existing = existingMap.get(key)!;
            existingMap.set(key, {
              ...existing,
              ...nt,
              id: existing.id,
              technicalAttributes: { ...(existing.technicalAttributes || {}), ...(nt.technicalAttributes || {}) },
              mentalAttributes: { ...(existing.mentalAttributes || {}), ...(nt.mentalAttributes || {}) },
              physicalAttributes: { ...(existing.physicalAttributes || {}), ...(nt.physicalAttributes || {}) },
              goalkeepingAttributes: { ...(existing.goalkeepingAttributes || {}), ...(nt.goalkeepingAttributes || {}) },
              personalityAttributes: { ...(existing.personalityAttributes || {}), ...(nt.personalityAttributes || {}) },
              positionsDetail: { ...(existing.positionsDetail || {}), ...(nt.positionsDetail || {}) },
            });
          } else {
            existingMap.set(key, nt);
          }
        });
        onUpdateTargets(Array.from(existingMap.values()));
      }
    } else if (destination.startsWith('youth_') || youthSquads.some((s) => s.id === destination)) {
      // Import into specific youth squad
      const targetSquadId = destination.replace(/^youth_/, '');
      const targetSquad = youthSquads.find((s) => s.id === targetSquadId);
      if (targetSquad && onUpdateYouthSquads) {
        const newPlayers = parsedData.parsedPlayers;
        let finalSquadPlayers: Player[];

        const existingMap = new Map<string, Player>(
          targetSquad.players.map((p) => [normalizePlayerName(p.name), p])
        );

        if (importMode === 'replace') {
          finalSquadPlayers = newPlayers.map((np) => {
            const key = normalizePlayerName(np.name);
            if (existingMap.has(key)) {
              return mergePlayerWithHistory(existingMap.get(key)!, np, currentDate, importTimestamp);
            }
            return {
              ...np,
              attributeHistory: [],
              lastUpdatedDate: currentDate || new Date().toISOString().split('T')[0],
              lastUpdatedTimestamp: importTimestamp,
            };
          });
        } else {
          newPlayers.forEach((np) => {
            const key = normalizePlayerName(np.name);
            if (existingMap.has(key)) {
              const existing = existingMap.get(key)!;
              existingMap.set(key, mergePlayerWithHistory(existing, np, currentDate, importTimestamp));
            } else {
              existingMap.set(key, {
                ...np,
                attributeHistory: [],
                lastUpdatedDate: currentDate || new Date().toISOString().split('T')[0],
                lastUpdatedTimestamp: importTimestamp,
              });
            }
          });
          finalSquadPlayers = Array.from(existingMap.values());
        }

        const incomingNorms = new Set(newPlayers.map((p) => normalizePlayerName(p.name)));

        // Prevenzione Doppioni: rimuovi dalle altre squadre giovanili se attivo
        const updatedSquads = youthSquads.map((s) => {
          if (s.id === targetSquadId) {
            return { ...s, players: finalSquadPlayers };
          }
          if (autoRemoveOtherSquadDuplicates) {
            return {
              ...s,
              players: (s.players || []).filter((p) => !incomingNorms.has(normalizePlayerName(p.name))),
            };
          }
          return s;
        });
        onUpdateYouthSquads(updatedSquads);

        // Prevenzione Doppioni: rimuovi anche dalla Prima Squadra se attivo
        if (autoRemoveOtherSquadDuplicates && currentPlayers.length > 0) {
          const cleanedFirstTeam = currentPlayers.filter(
            (p) => !incomingNorms.has(normalizePlayerName(p.name))
          );
          if (cleanedFirstTeam.length !== currentPlayers.length) {
            onUpdatePlayers(cleanedFirstTeam);
          }
        }
      }
    }

    handleClose();
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden my-8">
        {/* Bento Header */}
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-[#721c24] rounded-xl flex items-center justify-center text-white shadow-md">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Carica Profili Giocatori via CSV
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono">
                  FM26 Ready
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Importa ed analizza le liste rosa (Prima Squadra o Giovanili) o i report scouting
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Destination Selector & Template Downloads */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl space-y-2">
              <label className="text-xs font-bold text-slate-300 block uppercase tracking-wider">
                1. Destinazione Importazione
              </label>
              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDestination('squad')}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      destination === 'squad'
                        ? 'bg-[#721c24] text-white shadow-lg border border-red-500/40'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" /> Prima Squadra
                  </button>
                  <button
                    type="button"
                    onClick={() => setDestination('scouting')}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      destination === 'scouting'
                        ? 'bg-emerald-600 text-white shadow-lg border border-emerald-400/40'
                        : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                    }`}
                  >
                    <Search className="w-3.5 h-3.5" /> Scouting
                  </button>
                </div>

                {youthSquads && youthSquads.length > 0 && (
                  <div className="pt-1">
                    <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">
                      Oppure carica in una Giovanile:
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {youthSquads.map((ys) => {
                        const isSelected = destination === `youth_${ys.id}` || destination === ys.id;
                        return (
                          <button
                            key={ys.id}
                            type="button"
                            onClick={() => setDestination(`youth_${ys.id}`)}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-all truncate ${
                              isSelected
                                ? 'bg-blue-600 text-white border border-blue-400 shadow-md'
                                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                            }`}
                            title={ys.name}
                          >
                            <GraduationCap className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{ys.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl space-y-2">
              <label className="text-xs font-bold text-slate-300 block uppercase tracking-wider">
                2. Scarica Modelli CSV d'Esempio
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadTemplate('squad')}
                  className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl text-[11px] font-medium flex items-center justify-center gap-1 transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-amber-400" /> Template Rosa
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadTemplate('scouting')}
                  className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl text-[11px] font-medium flex items-center justify-center gap-1 transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" /> Template Acquisti
                </button>
              </div>
            </div>
          </div>

          {/* Drag and Drop Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-emerald-500 bg-emerald-950/20'
                : fileNames.length > 0
                ? 'border-emerald-500/60 bg-slate-950'
                : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-950'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv,.tsv,.txt"
              multiple
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleFilesChange(e.target.files);
                }
              }}
              className="hidden"
            />

            <div className="flex flex-col items-center justify-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-400 shadow-md">
                <Upload className="w-6 h-6" />
              </div>

              {fileNames.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-emerald-400 flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> {fileNames.length}{' '}
                    {fileNames.length === 1 ? 'File Caricato' : 'File Caricati (Multipli)'}
                  </p>
                  <div className="flex flex-wrap justify-center gap-1 max-w-lg mx-auto max-h-36 overflow-y-auto p-1">
                    {fileNames.map((name, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] bg-slate-900 text-slate-300 px-2 py-0.5 rounded border border-slate-800 font-mono"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center justify-center gap-3 pt-1">
                    <button
                      type="button"
                      onClick={handleClearFiles}
                      className="px-3 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Pulisci selezione file
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Clicca o trascina altri file per sostituire la selezione corrente
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-bold text-slate-200">
                    Trascina uno o più file CSV/TXT qui oppure{' '}
                    <span className="text-emerald-400 underline">sfoglia file multipli</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Puoi selezionare ed importare contemporaneamente più file esportati da Football Manager o Excel
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Import Mode Selection */}
          {parsedData && (
            <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  3. Modalità d'Importazione
                </span>
                <span className="text-xs text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                  {destination === 'squad'
                    ? `${parsedData.parsedPlayers.length} Giocatori per Rosa`
                    : `${parsedData.parsedTargets.length} Profili per Scouting`}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label
                  onClick={() => setImportMode('merge')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                    importMode === 'merge'
                      ? 'bg-emerald-950/40 border-emerald-500 text-white'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <RefreshCw className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-100 block">Aggiungi / Aggiorna (Merge)</span>
                    <span className="text-[11px] text-slate-400">
                      Conserva i giocatori esistenti ed aggiunge i nuovi o aggiorna i valori di quelli con lo stesso nome.
                    </span>
                  </div>
                </label>

                <label
                  onClick={() => setImportMode('replace')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                    importMode === 'replace'
                      ? 'bg-rose-950/40 border-rose-500 text-white'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-100 block">Sostituisci Rosa Completa</span>
                    <span className="text-[11px] text-slate-400">
                      Allinea la squadra al nuovo file CSV, archiviando e preservando lo storico dei valori dei giocatori già presenti.
                    </span>
                  </div>
                </label>
              </div>

              {/* Prevenzione Doppioni Cross-Rosa */}
              {otherSquadConflicts.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/35 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="text-xs font-bold text-amber-300">
                      Rilevati {otherSquadConflicts.length} giocatori già presenti in altre rose del club
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    I seguenti atleti risultano già registrati in altre rose del club: <strong className="text-white">{otherSquadConflicts.slice(0, 5).map(c => c.playerName).join(', ')}{otherSquadConflicts.length > 5 ? ` (+altri ${otherSquadConflicts.length - 5})` : ''}</strong> ({Array.from(new Set(otherSquadConflicts.flatMap(c => c.otherSquadNames))).join(', ')}).
                  </p>
                  <label className="flex items-center gap-2 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoRemoveOtherSquadDuplicates}
                      onChange={(e) => setAutoRemoveOtherSquadDuplicates(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 bg-slate-900 border-slate-700 cursor-pointer"
                    />
                    <span className="text-xs font-medium text-slate-200">
                      Rimuovi automaticamente questi giocatori dalle altre rose per evitare doppioni (consigliato)
                    </span>
                  </label>
                </div>
              )}

              {/* Preview and Diff Tabs */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div className="flex items-center gap-2">
                    {squadDiffReport && (
                      <button
                        type="button"
                        onClick={() => setPreviewTab('diff')}
                        className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer ${
                          previewTab === 'diff'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : 'text-slate-400 hover:text-white bg-slate-900 border border-slate-800'
                        }`}
                      >
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Report Variazioni & Crescita ({squadDiffReport.totalImprovedCount + squadDiffReport.totalDeclinedCount})</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setPreviewTab('records')}
                      className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer ${
                        previewTab === 'records' || !squadDiffReport
                          ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                          : 'text-slate-400 hover:text-white bg-slate-900 border border-slate-800'
                      }`}
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-sky-400" />
                      <span>Anteprima Record CSV ({destination === 'squad' ? parsedData.parsedPlayers.length : parsedData.parsedTargets.length})</span>
                    </button>
                  </div>

                  <span className="text-[11px] text-slate-400 hidden sm:inline">
                    Confronto automatico con i dati attuali
                  </span>
                </div>

                {/* Diff Report View */}
                {previewTab === 'diff' && squadDiffReport && (
                  <div className="space-y-3">
                    {/* Summary Counters */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="bg-emerald-950/20 border border-emerald-500/30 p-2.5 rounded-xl">
                        <span className="text-[10px] uppercase font-bold text-emerald-400 block flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" /> In Crescita
                        </span>
                        <span className="text-lg font-mono font-bold text-emerald-300">
                          {squadDiffReport.totalImprovedCount}
                        </span>
                        <span className="text-[10px] text-slate-400 block">CA o attributi in aumento</span>
                      </div>

                      <div className="bg-rose-950/20 border border-rose-500/30 p-2.5 rounded-xl">
                        <span className="text-[10px] uppercase font-bold text-rose-400 block flex items-center gap-1">
                          <TrendingDown className="w-3 h-3" /> In Calo
                        </span>
                        <span className="text-lg font-mono font-bold text-rose-300">
                          {squadDiffReport.totalDeclinedCount}
                        </span>
                        <span className="text-[10px] text-slate-400 block">CA o attributi in ribasso</span>
                      </div>

                      <div className="bg-sky-950/20 border border-sky-500/30 p-2.5 rounded-xl">
                        <span className="text-[10px] uppercase font-bold text-sky-400 block flex items-center gap-1">
                          <Users className="w-3 h-3" /> Nuovi Profili
                        </span>
                        <span className="text-lg font-mono font-bold text-sky-300">
                          {squadDiffReport.totalNewCount}
                        </span>
                        <span className="text-[10px] text-slate-400 block">Non presenti nella lista</span>
                      </div>

                      <div className="bg-slate-900 border border-slate-700/80 p-2.5 rounded-xl">
                        <span className="text-[10px] uppercase font-bold text-slate-200 block flex items-center gap-1">
                          <MoveRight className="w-3 h-3 text-slate-300" /> Stabili (0)
                        </span>
                        <span className="text-lg font-mono font-bold text-white">
                          {squadDiffReport.totalUnchangedCount}
                        </span>
                        <span className="text-[10px] text-slate-400 block">Nessuna variazione</span>
                      </div>
                    </div>

                    {/* Historical Preservation Notice */}
                    <div className="bg-slate-900/90 border border-emerald-500/20 p-2.5 rounded-xl text-xs text-slate-300 flex items-start gap-2">
                      <History className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-emerald-300 block">Archiviazione Storico Automatica</span>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Applicando l'importazione, i valori precedenti di ciascun giocatore verranno salvati nello <strong>Storico Rilevazioni</strong>. Potrai consultare la progressione nella scheda dettagliata del giocatore e l'AI Copilot monitorerà aumenti e cali nel tempo.
                        </p>
                      </div>
                    </div>

                    {/* Detailed List of Changes */}
                    <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                      {squadDiffReport.improvedPlayers.length === 0 && squadDiffReport.declinedPlayers.length === 0 && squadDiffReport.newPlayers.length === 0 && (
                        <div className="text-center py-6 text-slate-400 text-xs bg-slate-900/50 rounded-xl border border-slate-800">
                          Tutti i giocatori nel file CSV hanno valori e CA identici a quelli attualmente registrati.
                        </div>
                      )}

                      {/* Improved Players */}
                      {squadDiffReport.improvedPlayers.map((item) => (
                        <div key={`imp_${item.name}`} className="bg-emerald-950/20 border border-emerald-500/30 p-2.5 rounded-xl text-xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white">{item.name}</span>
                              <span className="text-emerald-400 font-semibold">{item.position}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {item.oldCa !== undefined && item.newCa !== undefined && (
                                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                                  CA: {item.oldCa} → {item.newCa} ({item.caDiff >= 0 ? `+${item.caDiff}` : item.caDiff})
                                </span>
                              )}
                            </div>
                          </div>

                          {item.improved.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {item.improved.slice(0, 8).map((att) => (
                                <span key={att.attribute} className="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                  <ArrowUpRight className="w-2.5 h-2.5" /> {att.attribute} ({att.oldVal} → {att.newVal})
                                </span>
                              ))}
                              {item.improved.length > 8 && (
                                <span className="text-[10px] text-slate-400 self-center">
                                  +{item.improved.length - 8} altri...
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Declined Players */}
                      {squadDiffReport.declinedPlayers.map((item) => (
                        <div key={`dec_${item.name}`} className="bg-rose-950/20 border border-rose-500/30 p-2.5 rounded-xl text-xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white">{item.name}</span>
                              <span className="text-rose-400 font-semibold">{item.position}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {item.oldCa !== undefined && item.newCa !== undefined && (
                                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30">
                                  CA: {item.oldCa} → {item.newCa} ({item.caDiff})
                                </span>
                              )}
                            </div>
                          </div>

                          {item.declined.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {item.declined.slice(0, 8).map((att) => (
                                <span key={att.attribute} className="text-[10px] bg-rose-500/10 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                  <ArrowDownRight className="w-2.5 h-2.5" /> {att.attribute} ({att.oldVal} → {att.newVal})
                                </span>
                              ))}
                              {item.declined.length > 8 && (
                                <span className="text-[10px] text-slate-400 self-center">
                                  +{item.declined.length - 8} altri...
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}

                      {/* New Players */}
                      {squadDiffReport.newPlayers.map((item) => (
                        <div key={`new_${item.name}`} className="bg-sky-950/20 border border-sky-500/30 p-2 rounded-xl text-xs flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">{item.name}</span>
                            <span className="text-sky-400">{item.position}</span>
                            <span className="text-[10px] bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded border border-sky-500/30">
                              Nuovo Profilo
                            </span>
                          </div>
                          {item.newCa && (
                            <span className="text-[11px] font-mono text-slate-300">
                              CA: {item.newCa} / PA: {item.newPa}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Raw Records Table */}
                {(previewTab === 'records' || !squadDiffReport) && (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800 text-[10px] uppercase">
                        <tr>
                          <th className="p-2">Nome</th>
                          <th className="p-2">
                            {destination === 'squad' ? 'Ruolo' : 'Squadra / Ruolo'}
                          </th>
                          <th className="p-2">Età</th>
                          <th className="p-2">
                            {destination === 'squad' ? 'Valore / Abilità' : 'Valore / Ingaggio'}
                          </th>
                          <th className="p-2">Status HG</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-[11px] text-slate-300">
                        {destination === 'squad'
                          ? parsedData.parsedPlayers.slice(0, 8).map((p, i) => (
                              <tr
                                key={`prev_p_${p.id}_${i}`}
                                className={`hover:bg-slate-800/50 ${
                                  p.isInjured ? 'bg-rose-950/20 text-rose-300' : p.isOnLoan ? 'bg-blue-950/20 text-blue-300' : ''
                                }`}
                              >
                                <td className="p-2 font-bold">
                                  <span className={p.isInjured ? 'text-rose-400' : p.isOnLoan ? 'text-blue-400' : 'text-white'}>
                                    {p.name}
                                  </span>
                                  {p.isInjured && (
                                    <span className="ml-1 text-[9px] text-rose-400 font-bold bg-rose-500/20 px-1 py-0.5 rounded border border-rose-500/40">
                                      [INF]
                                    </span>
                                  )}
                                  {p.isOnLoan && (
                                    <span className="ml-1 text-[9px] text-blue-400 font-bold bg-blue-500/20 px-1 py-0.5 rounded border border-blue-500/40">
                                      [PRESTITO]
                                    </span>
                                  )}
                                  {p.isPlayerStaff && (
                                    <span className="ml-1 text-[9px] text-purple-400 font-bold bg-purple-500/20 px-1 py-0.5 rounded border border-purple-500/40">
                                      [STAFF]
                                    </span>
                                  )}
                                  {p.ca && (
                                    <span className="block text-[9px] text-emerald-400 font-mono">
                                      CA: {p.ca} / PA: {p.pa}
                                    </span>
                                  )}
                                </td>
                                <td className="p-2 text-emerald-400">{p.position}</td>
                                <td className="p-2">{getEffectiveAge(p, currentDate)} anni</td>
                                <td className="p-2">
                                  {p.value ? p.value : (p.ca ? `CA ${p.ca}` : '-')}
                                </td>
                                <td className="p-2 text-slate-400">{p.homegrown}</td>
                              </tr>
                            ))
                          : parsedData.parsedTargets.slice(0, 8).map((t, i) => (
                              <tr key={`prev_t_${t.id}_${i}`} className="hover:bg-slate-800/50">
                                <td className="p-2 font-bold text-white">
                                  {t.name}
                                  {t.ca && (
                                    <span className="block text-[9px] text-emerald-400 font-mono">
                                      CA: {t.ca} / PA: {t.pa}
                                    </span>
                                  )}
                                </td>
                                <td className="p-2 text-emerald-400">
                                  {t.currentClub} ({t.position})
                                </td>
                                <td className="p-2">{getEffectiveAge(t, currentDate)} anni</td>
                                <td className="p-2 text-amber-300">
                                  {t.estimatedValue} • {t.weeklyWage}
                                </td>
                                <td className="p-2 text-slate-400">{t.homegrown}</td>
                              </tr>
                            ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-950 px-6 py-4 border-t border-slate-800 flex items-center justify-between">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            Annulla
          </button>

          <button
            type="button"
            onClick={handleApplyImport}
            disabled={!parsedData}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-950/40 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" /> Applica Importazione CSV
          </button>
        </div>
      </div>
    </div>
  );
};
