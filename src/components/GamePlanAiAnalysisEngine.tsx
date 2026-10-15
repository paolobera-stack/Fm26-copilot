import React, { useState } from 'react';
import { Player, TacticPreset, OpponentPlayerCSV } from '../types';
import { parseCsvText, getEffectiveAge } from '../utils/csvParser';
import { getApiHeaders, hasCustomApiKey } from '../utils/apiKeyStorage';
import { safeFetchJson } from '../utils/apiUtils';
import { ScreenshotOcrProgressBar } from './ScreenshotOcrProgressBar';
import {
  Sparkles,
  Upload,
  Image as ImageIcon,
  FileSpreadsheet,
  Trash2,
  Plus,
  X,
  UserCheck,
  Eye,
  RefreshCw,
  Copy,
  CheckCircle,
  AlertTriangle
} from 'lucide-react';

export interface GamePlanAiAnalysisEngineProps {
  selectedOpponent: string;
  venue: 'Casa' | 'Trasferta' | 'Campo Neutro';
  competition: string;
  opponentStyle: string;
  setOpponentStyle: (style: string) => void;
  strategicPriority: string;
  setStrategicPriority: (priority: string) => void;
  opponentFormation: string;
  setOpponentFormation: (formation: string) => void;
  opponentMentality: string;
  setOpponentMentality: (mentality: string) => void;
  opponentTacticalNotes: string;
  setOpponentTacticalNotes: (notes: string) => void;
  opponentScreenshotBase64: string | null;
  setOpponentScreenshotBase64: (base64: string | null) => void;
  opponentPlayers: OpponentPlayerCSV[];
  setOpponentPlayers: React.Dispatch<React.SetStateAction<OpponentPlayerCSV[]>>;
  aiMatchPlan: string | null;
  setAiMatchPlan: (plan: string | null) => void;
  players: Player[];
  tactic: TacticPreset;
  currentDate: string;
  teamName: string;
  onActionFeedback: (msg: string) => void;
}

export const GamePlanAiAnalysisEngine: React.FC<GamePlanAiAnalysisEngineProps> = ({
  selectedOpponent,
  venue,
  competition,
  opponentStyle,
  setOpponentStyle,
  strategicPriority,
  setStrategicPriority,
  opponentFormation,
  setOpponentFormation,
  opponentMentality,
  setOpponentMentality,
  opponentTacticalNotes,
  setOpponentTacticalNotes,
  opponentScreenshotBase64,
  setOpponentScreenshotBase64,
  opponentPlayers,
  setOpponentPlayers,
  aiMatchPlan,
  setAiMatchPlan,
  players,
  tactic,
  currentDate,
  teamName,
  onActionFeedback
}) => {
  // Vision screenshot parsing states
  const [parsingScreenshot, setParsingScreenshot] = useState(false);
  const [screenshotSuccessNotice, setScreenshotSuccessNotice] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);

  // CSV Modal and single player quick-add states
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvRawText, setCsvRawText] = useState('');
  const [csvError, setCsvError] = useState<string | null>(null);
  const [newOppName, setNewOppName] = useState('');
  const [newOppPos, setNewOppPos] = useState('');
  const [selectedPlayerDetail, setSelectedPlayerDetail] = useState<OpponentPlayerCSV | null>(null);

  // AI Match plan generation states
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Helper to parse opponent screenshot with specialized Gemini endpoint
  const parseOpponentImage = async (base64Str: string, mimeType: string = 'image/png') => {
    if (!hasCustomApiKey()) {
      setScreenshotSuccessNotice("⚠️ Chiave API personale richiesta: inserisci prima la tua Google Gemini API Key gratuita (BYOK) nella barra in alto per analizzare lo screenshot avversario.");
      return;
    }

    setParsingScreenshot(true);
    setScreenshotSuccessNotice(null);

    try {
      const data = await safeFetchJson<{ parsed?: any; error?: string }>('/api/gemini/parse-opponent-tactic-screenshot', {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          imageBase64: base64Str,
          mimeType,
          opponentName: selectedOpponent
        })
      });

      if (data.parsed) {
        if (data.parsed.formation) {
          setOpponentFormation(data.parsed.formation);
        }
        if (data.parsed.mentality) {
          setOpponentMentality(data.parsed.mentality);
        }
        if (data.parsed.tacticalStyle) {
          setOpponentStyle(data.parsed.tacticalStyle);
        }
        if (data.parsed.summary) {
          setOpponentTacticalNotes(data.parsed.summary);
        }
        // If opponent players were recognized from the image and current opponentPlayers is empty
        if (data.parsed.recognizedPlayers && Array.isArray(data.parsed.recognizedPlayers) && data.parsed.recognizedPlayers.length > 0) {
          setOpponentPlayers(prev => {
            if (prev.length === 0) {
              return data.parsed.recognizedPlayers.map((p: any, idx: number) => ({
                id: `opp_scan_${Date.now()}_${idx}`,
                name: p.name,
                position: p.position || 'Giocatore',
                qualities: p.qualities || '',
                weaknesses: p.weaknesses || ''
              }));
            }
            return prev;
          });
        }
        setScreenshotSuccessNotice(
          `✨ Modulo avversario carpito dallo screenshot: ${data.parsed.formation || 'Rilevato'}!` +
          (data.parsed.tacticalStyle ? ` • Stile: ${data.parsed.tacticalStyle}` : '')
        );
      } else {
        setScreenshotSuccessNotice('Screenshot caricato. Verrà impiegato per l\'analisi visiva nel Piano Gara.');
      }
    } catch (err: any) {
      console.error("Error parsing opponent screenshot:", err);
      setScreenshotSuccessNotice('Screenshot acquisito con successo.');
    } finally {
      setParsingScreenshot(false);
    }
  };

  // Upload and parse opponent tactic screenshot
  const processScreenshotFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Str = event.target?.result as string;
      setOpponentScreenshotBase64(base64Str);
      await parseOpponentImage(base64Str, file.type || 'image/png');
    };
    reader.readAsDataURL(file);
  };

  const handleScreenshotUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processScreenshotFile(file);
  };

  const handleScreenshotDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      processScreenshotFile(file);
    }
  };

  // Non-player terms and section titles to filter out from FM exports
  const FM_NON_PLAYER_TITLES = new Set([
    'personal information', 'ability', 'ca', 'pa', 'reputation', 'home', 'world',
    'gk attributes', 'goalkeeping', 'mental attributes', 'physical attributes',
    'technical attributes', 'contract', 'transfer information', 'overview',
    'attributes', 'hidden attributes', 'report', 'medical', 'selection',
    'tactics', 'staff', 'scouting', 'squad', 'information', 'name', 'nome',
    'player', 'giocatore', 'id', 'uid', 'pos', 'ruolo', 'position', 'nationality',
    'club', 'age', 'eta', 'value', 'valore', 'wage', 'stipendio', 'nat', 'inf',
    'transfer status', 'squad status', 'condition', 'condizione', 'fitness',
    'sharpness', 'morale', 'overall', 'pk', 'no.', 'number', 'num', 'sec pos',
    'height', 'weight', 'foot', 'preferred foot', 'division', 'league',
    'general', 'contract details', 'personality', 'media description',
    'goals', 'assists', 'apps', 'av rat', 'min', 'yellow', 'red', 'wnt', 'unh',
    'strength', 'weakness', 'scout rating', 'recommendation', 'loan status'
  ]);

  const FM_INVALID_NAME_PATTERNS = [
    /information/i, /attributes/i, /reputation/i, /contract/i, /transfer/i,
    /selection/i, /overview/i, /medical/i, /scouting/i, /statistics/i,
    /ability/i, /general/i, /personality/i, /description/i, /details/i,
    /report/i, /tactics/i, /squad/i, /fitness/i, /sharpness/i, /morale/i,
    /overall/i, /national/i, /international/i, /search/i, /filter/i
  ];

  const cleanCsvField = (raw: string): string => {
    if (!raw) return '';
    let val = raw
      .replace(/&#0*39;/g, "'")
      .replace(/&apos;/gi, "'")
      .replace(/&rsquo;/gi, "'")
      .replace(/&lsquo;/gi, "'")
      .replace(/[\u2018\u2019\u201A\u201B\u00B4`]/g, "'")
      .replace(/\\'/g, "'")
      .replace(/<[^>]*>/g, '')
      .trim();
    if (val.startsWith('"') && val.endsWith('"') && val.length >= 2) {
      val = val.slice(1, -1);
    } else if (val.startsWith("'") && val.endsWith("'") && val.length >= 2) {
      val = val.slice(1, -1);
    }
    return val.trim();
  };

  const isPureNumberOrId = (val: string): boolean => {
    if (!val) return false;
    const clean = val.replace(/[%\s,.-]/g, '');
    return /^\d+$/.test(clean);
  };

  const isValidPlayerName = (name: string): boolean => {
    if (!name || typeof name !== 'string') return false;
    const trimmed = name.trim();
    if (trimmed.length < 2) return false;
    if (isPureNumberOrId(trimmed)) return false;
    if (/^\d+%$/.test(trimmed)) return false;

    const lower = trimmed.toLowerCase();
    if (FM_NON_PLAYER_TITLES.has(lower)) return false;
    for (const pat of FM_INVALID_NAME_PATTERNS) {
      if (pat.test(lower)) return false;
    }
    if (!/[a-zA-ZàèéìòùáéíóúäöüñÁÉÍÓÚÄÖÜÑžšđćčŽŠĐĆČ]/i.test(trimmed)) return false;

    return true;
  };

  const parseCSV = (text: string): OpponentPlayerCSV[] => {
    if (!text || !text.trim()) return [];

    const fmResult = parseCsvText(text, currentDate);
    if (fmResult && fmResult.parsedPlayers && fmResult.parsedPlayers.length > 0) {
      return fmResult.parsedPlayers.map((p, idx) => ({
        id: `opp_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
        name: p.name,
        position: p.position || 'NC',
        qualities: p.notes || '',
        weaknesses: '',
        notes: p.notes || '',
        age: p.age,
        birthYear: p.birthYear,
        birthDate: p.birthDate,
        nationality: p.nationality,
        height: p.height,
        value: p.value,
        ca: p.ca,
        pa: p.pa,
        technicalAttributes: p.technicalAttributes,
        mentalAttributes: p.mentalAttributes,
        physicalAttributes: p.physicalAttributes,
        personalityAttributes: p.personalityAttributes,
        positionsDetail: p.positionsDetail
      }));
    }

    let processedText = text;
    if (processedText.includes('<table') || processedText.includes('<tr')) {
      processedText = processedText
        .replace(/<\/tr>/gi, '\n')
        .replace(/<\/td>|<\/th>/gi, '\t')
        .replace(/<[^>]*>/g, '');
    }

    const rawLines = processedText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (rawLines.length === 0) return [];

    const sample = rawLines.slice(0, 15).join('\n');
    let delimiter = ',';
    if ((sample.match(/\t/g) || []).length > (sample.match(/,/g) || []).length) {
      delimiter = '\t';
    } else if ((sample.match(/;/g) || []).length > (sample.match(/,/g) || []).length) {
      delimiter = ';';
    } else if ((sample.match(/\|/g) || []).length > (sample.match(/,/g) || []).length) {
      delimiter = '|';
    }

    const headerPosMap: Record<string, string> = {
      defendercentral: 'DC', defender_central: 'DC', difensorecentrale: 'DC', dc: 'DC', cd: 'DC',
      defenderright: 'DD', defender_right: 'DD', difensoredestro: 'DD', dr: 'DD', dd: 'DD',
      defenderleft: 'DL', defender_left: 'DL', difensoresinistro: 'DL', dl: 'DL', ds: 'DL',
      wingbackright: 'WBR', wingback_right: 'WBR', wbr: 'WBR',
      wingbackleft: 'WBL', wingback_left: 'WBL', wbl: 'WBL',
      defensivemidfielder: 'MED', defensive_midfielder: 'MED', dm: 'MED', mediano: 'MED', cdm: 'MED',
      midfieldercentral: 'CC', midfielder_central: 'CC', mc: 'CC', cm: 'CC', centrocampistacentrale: 'CC',
      midfielderright: 'MD', midfielder_right: 'MD', mr: 'MD', rm: 'MD', centrocampistadestro: 'MD',
      midfielderleft: 'MS', midfielder_left: 'MS', ml: 'MS', lm: 'MS', centrocampistasinistro: 'MS',
      attackingmidcentral: 'TRQ', attackingmidfieldercentral: 'TRQ', amc: 'TRQ', cam: 'TRQ', trequartista: 'TRQ',
      attackingmidright: 'AD', attackingmidfielderright: 'AD', amr: 'AD', rw: 'AD', aladestra: 'AD',
      attackingmidleft: 'AS', attackingmidfielderleft: 'AS', aml: 'AS', lw: 'AS', alasinistra: 'AS',
      striker: 'PC', st: 'PC', fc: 'PC', cf: 'PC', punta: 'PC', attaccante: 'PC',
      goalkeeper: 'POR', gk: 'POR', portiere: 'POR'
    };

    let nameColIdx = -1;
    let posColIdx = -1;
    let headerRowIndex = -1;
    const pos20ColIndices: { colIdx: number; code: string }[] = [];

    for (let i = 0; i < Math.min(rawLines.length, 15); i++) {
      const fields = rawLines[i].split(delimiter).map(cleanCsvField);
      const lineLower = fields.map(f => f.toLowerCase().replace(/[^a-z0-9]/g, ''));

      const foundNameIndex = lineLower.findIndex(f => f === 'name' || f === 'nome' || f === 'player' || f === 'giocatore');
      if (foundNameIndex !== -1) {
        headerRowIndex = i;
        nameColIdx = foundNameIndex;
        posColIdx = lineLower.findIndex(f => f.includes('position') || f.includes('pos') || f.includes('ruolo') || f.includes('role'));

        lineLower.forEach((h, colIdx) => {
          if (headerPosMap[h]) {
            pos20ColIndices.push({ colIdx, code: headerPosMap[h] });
          }
        });
        break;
      }
    }

    const POSITION_REGEX = /\b(GK|POR|PT|DR|DL|DC|WBR|WBL|DM|MC|MR|ML|AMC|AMR|AML|ST|FC|P|CD|CB|LB|RB|LWB|RWB|CM|CAM|CDM|LM|RM|LW|RW|CF|SS|TS|TD|MED|TRQ|ATT|CC|MEZ|REG|D\s*\([CRLC\s/]+\)|WB\s*\([RL\s/]+\)|M\s*\([CRLC\s/]+\)|AM\s*\([CRLC\s/]+\)|ST\s*\([C\s/]+\))\b/i;

    const dataLines = headerRowIndex !== -1 ? rawLines.slice(headerRowIndex + 1) : rawLines;
    const results: OpponentPlayerCSV[] = [];
    const seenNames = new Set<string>();

    dataLines.forEach((line, idx) => {
      const fields = line.split(delimiter).map(cleanCsvField);
      if (fields.length === 0 || !fields.some(f => f.length > 0)) return;

      let name = '';
      let position = 'NC';

      if (nameColIdx !== -1 && fields[nameColIdx]) {
        name = fields[nameColIdx];
        if (posColIdx !== -1 && fields[posColIdx]) {
          position = fields[posColIdx];
        }
      } else {
        const potentialNameIdx = fields.findIndex(f => isValidPlayerName(f));
        if (potentialNameIdx !== -1) {
          name = fields[potentialNameIdx];
          const remainingFields = fields.filter((_, fIdx) => fIdx !== potentialNameIdx);
          const posCandidate = remainingFields.find(f => POSITION_REGEX.test(f));
          if (posCandidate) position = posCandidate;
        }
      }

      if (isValidPlayerName(name)) {
        const lowerName = name.toLowerCase().trim();
        if (!seenNames.has(lowerName)) {
          seenNames.add(lowerName);
          results.push({
            id: `opp_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 5)}`,
            name: name.trim(),
            position: position.trim() || 'NC',
            qualities: '',
            weaknesses: '',
            notes: ''
          });
        }
      }
    });

    return results;
  };

  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setCsvError(null);
    let allNewPlayers: OpponentPlayerCSV[] = [];
    let filesProcessed = 0;
    const totalFiles = files.length;

    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) {
          try {
            const parsed = parseCSV(text);
            allNewPlayers = [...allNewPlayers, ...parsed];
          } catch (err) {
            console.error("Error parsing file:", file.name, err);
          }
        }
        filesProcessed++;
        if (filesProcessed === totalFiles) {
          if (allNewPlayers.length === 0) {
            setCsvError("Nessun giocatore riconosciuto nei file caricati.");
          } else {
            setOpponentPlayers(prev => {
              const existingNames = new Set(prev.map(p => p.name.toLowerCase().trim()));
              const deduplicated = allNewPlayers.filter(p => !existingNames.has(p.name.toLowerCase().trim()));
              return [...prev, ...deduplicated];
            });
            onActionFeedback(`Importati ${allNewPlayers.length} giocatori avversari per ${selectedOpponent}.`);
          }
        }
      };
      reader.readAsText(file);
    });
    e.target.value = '';
  };

  const handleImportCsvText = () => {
    setCsvError(null);
    if (!csvRawText.trim()) {
      setCsvError("Incolla del testo o carica un file CSV.");
      return;
    }
    const parsed = parseCSV(csvRawText);
    if (parsed.length === 0) {
      setCsvError("Nessun giocatore trovato nel testo inserito. Verifica che contenga nomi validi.");
      return;
    }

    setOpponentPlayers(prev => {
      const existingNames = new Set(prev.map(p => p.name.toLowerCase().trim()));
      const deduplicated = parsed.filter(p => !existingNames.has(p.name.toLowerCase().trim()));
      return [...prev, ...deduplicated];
    });

    setShowCsvModal(false);
    setCsvRawText('');
    onActionFeedback(`Aggiunti ${parsed.length} giocatori all'organico di ${selectedOpponent}.`);
  };

  const handleAddSinglePlayer = () => {
    if (!newOppName.trim()) return;
    const newPlayer: OpponentPlayerCSV = {
      id: `opp_${Date.now()}_single_${Math.random().toString(36).substring(2, 5)}`,
      name: newOppName.trim(),
      position: newOppPos.trim() || 'NC',
      qualities: '',
      weaknesses: '',
      notes: ''
    };
    setOpponentPlayers(prev => [newPlayer, ...prev]);
    setNewOppName('');
    setNewOppPos('');
    onActionFeedback(`Giocatore ${newPlayer.name} inserito con successo.`);
  };

  const handleRemoveOpponentPlayer = (id: string) => {
    setOpponentPlayers(prev => prev.filter(p => p.id !== id));
  };

  const handleClearAllOpponentPlayers = () => {
    if (window.confirm(`Svuotare l'intera lista dei giocatori avversari per ${selectedOpponent}?`)) {
      setOpponentPlayers([]);
      onActionFeedback(`Lista giocatori avversari per ${selectedOpponent} svuotata.`);
    }
  };

  const handleLoadSampleCsv = () => {
    const sample = `Nome,Ruolo,Qualità,Punti Deboli
Carlos Rodriguez,DC,Forza fisica e Colpo di Testa,Lento sui tagli brevi e rientri
Marco Verratti,MED,Passaggi e Visione di gioco,Poco aggressivo sui contrasti aerei
Julian Alvarez,PC,Dribbling e Conclusione,Soffre il pressing fisico dei difensori
Lucas Hernandez,TS,Velocità e Cross,Scarso nell'uno contro uno difensivo`;
    setCsvRawText(sample);
  };

  // Generate AI Match Plan
  const handleGenerateAiMatchPlan = async () => {
    if (!hasCustomApiKey()) {
      setAiMatchPlan("⚠️ **Chiave API personale Google Gemini richiesta**\n\nPer elaborare la tattica e generare il Piano Gara con l'IA è obbligatorio configurare la tua Google Gemini API Key personale gratuita (BYOK). Clicca sul pulsante **'Chiave API (BYOK)'** nella barra superiore per configurarla.");
      return;
    }

    setGenerating(true);
    setAiMatchPlan(null);
    try {
      const data = await safeFetchJson<{ plan?: string; error?: string }>('/api/gemini/match-plan', {
        method: 'POST',
        headers: getApiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          opponentName: selectedOpponent,
          venue,
          competition,
          opponentStyle,
          strategicPriority,
          squadData: players.map(p => ({
            name: p.name,
            pos: p.position,
            isInjured: p.isInjured,
            injuryNote: p.injuryNote,
            isOnLoan: p.isOnLoan,
            loanClub: p.loanClub
          })),
          currentTactic: tactic,
          currentDate,
          opponentTactic: {
            formation: opponentFormation,
            mentality: opponentMentality,
            notes: opponentTacticalNotes
          },
          opponentPlayers,
          opponentScreenshotBase64
        })
      });

      if (data.plan) {
        setAiMatchPlan(data.plan);
      } else {
        throw new Error(data.error || 'Impossibile generare il piano di gara');
      }
    } catch (err: any) {
      setAiMatchPlan(`⚠️ Errore durante la generazione del Piano di Gara: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyReport = () => {
    if (aiMatchPlan) {
      navigator.clipboard.writeText(aiMatchPlan);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  return (
    <div className="space-y-6">
      {/* SECTION 1: Acquisizione Tattica Squadra Avversaria tramite Screenshot */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <ImageIcon className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-extrabold text-white tracking-tight">
              1. Acquisizione Tattica Avversaria tramite Screenshot ({selectedOpponent})
            </h3>
          </div>
          <span className="bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold px-2.5 py-1 rounded-lg self-start sm:self-auto">
            Acquisizione Tattica AI
          </span>
        </div>

        {/* Screenshot Upload Box / Drag & Drop Card */}
        <div className="bg-slate-950 border border-indigo-500/30 rounded-2xl p-4 shadow-inner space-y-4">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
                <ImageIcon className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Screenshot Tattica Avversaria (FM26)
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Carica uno screenshot della lavagna o della formazione avversaria: Gemini ne estrarrà modulo, stile e note tattiche.
                </p>
              </div>
            </div>

            {/* Action Buttons / Drag Drop Input */}
            <div className="flex items-center space-x-2 w-full md:w-auto">
              <label className="cursor-pointer flex-1 md:flex-initial bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2">
                {parsingScreenshot ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Scansione Vision in corso...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 text-white" />
                    <span>{opponentScreenshotBase64 ? 'Sostituisci Screenshot' : 'Carica Screenshot Tattica'}</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleScreenshotUpload}
                  disabled={parsingScreenshot}
                  className="hidden"
                />
              </label>

              {opponentScreenshotBase64 && (
                <button
                  onClick={() => setOpponentScreenshotBase64(null)}
                  className="bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-500/30 text-xs px-3 py-2.5 rounded-xl transition-colors flex items-center gap-1.5"
                  title="Rimuovi screenshot"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Rimuovi</span>
                </button>
              )}
            </div>
          </div>

          {/* Drag & Drop Dropzone / Preview */}
          {!opponentScreenshotBase64 ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleScreenshotDrop}
              className="border-2 border-dashed border-slate-800 hover:border-indigo-500/50 rounded-xl p-6 text-center transition-colors bg-slate-900/40 space-y-2 cursor-pointer"
            >
              <Upload className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-xs text-slate-300 font-medium">
                Trascina qui lo screenshot della tattica di <strong>{selectedOpponent}</strong> oppure fai clic su "Carica Screenshot"
              </p>
              <p className="text-[10px] text-slate-500">Formati supportati: PNG, JPG, WebP</p>
            </div>
          ) : (
            <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <img
                  src={opponentScreenshotBase64}
                  alt="Anteprima screenshot avversario"
                  className="w-16 h-12 object-cover rounded-lg border border-slate-700 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setPreviewImage({ url: opponentScreenshotBase64, title: `Tattica Avversaria: ${selectedOpponent}` })}
                />
                <div>
                  <span className="text-xs font-bold text-white block">Screenshot Tattica Salvato</span>
                  <span className="text-[10px] text-slate-400">Pronto per l'inclusione nel report AI</span>
                </div>
              </div>

              <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setPreviewImage({ url: opponentScreenshotBase64, title: `Tattica Avversaria: ${selectedOpponent}` })}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Ingrandisci</span>
                </button>
                <button
                  type="button"
                  onClick={() => parseOpponentImage(opponentScreenshotBase64)}
                  disabled={parsingScreenshot}
                  className="bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-semibold transition-all"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${parsingScreenshot ? 'animate-spin' : ''}`} />
                  <span>Riscansiona con Vision</span>
                </button>
              </div>
            </div>
          )}

          {/* Real-time OCR Progress Bar & Latency Diagnostics */}
          {parsingScreenshot && (
            <ScreenshotOcrProgressBar
              isLoading={parsingScreenshot}
              context="opponent"
              title={`Analisi Tattica Avversaria con AI (${selectedOpponent || 'Avversario'})`}
              error={screenshotSuccessNotice && screenshotSuccessNotice.includes('⚠️') ? screenshotSuccessNotice : null}
            />
          )}

          {screenshotSuccessNotice && !parsingScreenshot && (
            <div className="bg-slate-900 border border-indigo-500/40 rounded-xl p-3 text-xs text-indigo-200 flex items-center justify-between">
              <span>{screenshotSuccessNotice}</span>
              <button onClick={() => setScreenshotSuccessNotice(null)} className="text-slate-400 hover:text-white ml-2">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Tactical Parameters Extracted from Screenshot or Manual */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-1">
          <div>
            <label className="text-slate-400 font-semibold block mb-1">
              Modulo / Formazione Avversaria (Rilevato o Manuale)
            </label>
            <input
              type="text"
              value={opponentFormation}
              onChange={(e) => setOpponentFormation(e.target.value)}
              placeholder="Es. 4-3-3, 3-5-2, 4-2-3-1"
              className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500 font-bold"
            />
          </div>
          <div>
            <label className="text-slate-400 font-semibold block mb-1">
              Mentalità / Atteggiamento Tattico
            </label>
            <input
              type="text"
              value={opponentMentality}
              onChange={(e) => setOpponentMentality(e.target.value)}
              placeholder="Es. Offensiva / Gegenpress, Prudente / Riorganizzati"
              className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl px-3 py-2.5 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-slate-400 font-semibold block mb-1">
              Note ed Istruzioni Tattiche Avversario Estratte
            </label>
            <textarea
              value={opponentTacticalNotes}
              onChange={(e) => setOpponentTacticalNotes(e.target.value)}
              placeholder="Es. Pressing alto feroce ma concedono spazio alle spalle dei terzini; marcatura a uomo sui trequartisti..."
              rows={2}
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl p-3 focus:outline-none focus:border-indigo-500 text-xs"
            />
          </div>
        </div>
      </div>

      {/* SECTION 2: Dati Giocatori Avversari via CSV / Scouting */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-extrabold text-white tracking-tight">
              2. Giocatori Avversari (Import CSV / Scouting)
            </h3>
            <span className="bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-md">
              {opponentPlayers.length} Giocatori Caricati
            </span>
          </div>

          <div className="flex items-center space-x-2 flex-wrap gap-y-2">
            <label className="cursor-pointer bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-md flex items-center gap-1.5">
              <Upload className="w-4 h-4" />
              <span>Carica File CSV (Multipli)</span>
              <input
                type="file"
                accept=".csv,.txt,.html,.tsv,.rtf,*"
                multiple
                onChange={handleCsvFileUpload}
                className="hidden"
              />
            </label>

            <button
              onClick={() => setShowCsvModal(true)}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold px-3.5 py-2 rounded-xl border border-slate-700 transition-all flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>Incolla / Editor CSV</span>
            </button>

            {opponentPlayers.length > 0 && (
              <button
                onClick={handleClearAllOpponentPlayers}
                className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold px-3 py-2 rounded-xl transition-colors flex items-center gap-1"
                title="Svuota giocatori avversari"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Svuota</span>
              </button>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          Puoi caricare un file CSV oppure inserire i dati dei giocatori avversari (Giocatore e Ruolo/Posizione).
        </p>

        {/* Quick Add Single Opponent Player form */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
          <span className="text-xs font-bold text-slate-300 block uppercase tracking-wider">Aggiungi Giocatore Avversario</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Giocatore</label>
              <input
                type="text"
                value={newOppName}
                onChange={(e) => setNewOppName(e.target.value)}
                placeholder="Es. Lionel Messi"
                className="w-full bg-slate-900 border border-slate-800 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Ruolo / Posizione</label>
              <input
                type="text"
                value={newOppPos}
                onChange={(e) => setNewOppPos(e.target.value)}
                placeholder="Es. POR, DC, TS, MED, CC, PC"
                className="w-full bg-slate-900 border border-slate-800 text-white rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
          <div className="flex justify-end pt-1">
            <button
              onClick={handleAddSinglePlayer}
              disabled={!newOppName.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all shadow-md"
            >
              <Plus className="w-4 h-4" /> Aggiungi Giocatore
            </button>
          </div>
        </div>

        {/* Table of Imported Opponent Players */}
        {opponentPlayers.length > 0 ? (
          <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-950">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/90 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Giocatore</th>
                  <th className="px-4 py-3">Ruolo / Posizione</th>
                  <th className="px-4 py-3 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {opponentPlayers.map((opp) => (
                  <tr
                    key={opp.id}
                    className="hover:bg-slate-800/60 transition-colors group"
                  >
                    <td className="px-4 py-3 font-bold text-white flex items-center space-x-2.5">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 group-hover:bg-emerald-500/20 transition-colors">
                        <UserCheck className="w-4 h-4" />
                      </div>
                      <span className="group-hover:text-emerald-300 transition-colors">{opp.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="bg-slate-800 text-slate-200 text-xs font-bold px-2.5 py-1 rounded-lg border border-slate-700">
                        {opp.position || 'NC'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => setSelectedPlayerDetail(opp)}
                          className="bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 text-xs font-semibold px-2.5 py-1 rounded-lg transition-all flex items-center gap-1"
                          title="Vedi Scheda"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Vedi scheda</span>
                        </button>
                        <button
                          onClick={() => handleRemoveOpponentPlayer(opp.id)}
                          className="text-slate-400 hover:text-rose-400 p-1.5 hover:bg-rose-950/40 rounded-lg transition-colors border border-transparent hover:border-rose-500/30"
                          title="Elimina record"
                        >
                          <Trash2 className="w-4 h-4 text-rose-400" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 text-center space-y-2">
            <FileSpreadsheet className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-xs text-slate-400">
              Nessun giocatore avversario inserito per <strong>{selectedOpponent}</strong>.
            </p>
            <button
              onClick={() => setShowCsvModal(true)}
              className="text-xs text-indigo-400 font-bold hover:underline"
            >
              Clicca qui per importare un CSV con la rosa dell'avversario
            </button>
          </div>
        )}
      </div>

      {/* SECTION 3: Generatore Piano Gara AI */}
      <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-extrabold text-white tracking-tight">
              3. Genera Report Piano di Gara Personalizzato
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Tattica Avversario: {opponentFormation} | CSV: {opponentPlayers.length} Giocatori
          </span>
        </div>

        <button
          onClick={handleGenerateAiMatchPlan}
          disabled={generating}
          className="w-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-emerald-600 hover:opacity-95 disabled:opacity-50 text-white font-extrabold py-4 rounded-xl shadow-2xl transition-all flex items-center justify-center gap-2.5 text-sm uppercase tracking-wider"
        >
          {generating ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" /> Elaborazione Analisi Tattica & Duelli 1v1 in corso...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5" /> Genera Report Pre-Partita Completo per {selectedOpponent}
            </>
          )}
        </button>
      </div>

      {/* SECTION 4: Output Report Generato */}
      {aiMatchPlan && (
        <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl p-6 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              <h3 className="font-bold text-slate-100 text-base">
                Report Tattico Ufficiale: {teamName} vs {selectedOpponent} ({venue})
              </h3>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleCopyReport}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-1.5 rounded-xl border border-slate-700 flex items-center gap-1.5 transition-all font-semibold"
              >
                {copied ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copiato!' : 'Copia Report'}</span>
              </button>
            </div>
          </div>

          <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap font-sans bg-slate-950 p-6 rounded-xl border border-slate-800/80 shadow-inner">
            {aiMatchPlan}
          </div>
        </div>
      )}

      {/* CSV IMPORT MODAL */}
      {showCsvModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-2xl w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-white text-base">Importa Giocatori Avversari da CSV / Testo</h3>
              </div>
              <button
                onClick={() => setShowCsvModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Puoi caricare un file <code>.csv</code> oppure incollare il testo contenente la lista dei giocatori dell'avversario <strong>{selectedOpponent}</strong>.
            </p>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs gap-3">
              <div>
                <span className="text-white font-bold block">Carica uno o più File CSV / FM Export</span>
                <span className="text-slate-400 text-[11px]">Seleziona uno o più file (.csv, .txt, .html export da Football Manager)</span>
              </div>
              <label className="cursor-pointer bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl transition-colors flex items-center gap-2 shrink-0">
                <Upload className="w-4 h-4" />
                <span>Seleziona File (Multipli)</span>
                <input
                  type="file"
                  accept=".csv,.txt,.html,.tsv,.rtf,*"
                  multiple
                  onChange={handleCsvFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-semibold">Oppure Incolla Testo CSV sotto:</span>
              <button
                onClick={handleLoadSampleCsv}
                className="text-indigo-400 hover:underline font-bold"
              >
                Carica Esempio CSV
              </button>
            </div>

            <textarea
              value={csvRawText}
              onChange={(e) => setCsvRawText(e.target.value)}
              placeholder={`Nome,Ruolo,Qualità,Punti Deboli\nCarlos Rodriguez,DC,Fisico e Colpo di Testa,Lento nei rientri\nMarco Verratti,MED,Passaggi e Visione,Poco aggressivo sui contrasti`}
              rows={7}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-200 placeholder-slate-600 font-mono focus:outline-none focus:border-emerald-500"
            />

            {csvError && (
              <div className="bg-rose-950/40 border border-rose-500/40 p-3 rounded-xl text-xs text-rose-300 font-medium">
                {csvError}
              </div>
            )}

            <div className="flex justify-end space-x-3 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowCsvModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl"
              >
                Annulla
              </button>
              <button
                onClick={handleImportCsvText}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg transition-colors flex items-center gap-1.5"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Importa Giocatori</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Zoom Preview Modal */}
      {previewImage && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="relative max-w-5xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800">
              <h4 className="text-xs font-bold text-white flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-indigo-400" />
                {previewImage.title}
              </h4>
              <button
                onClick={() => setPreviewImage(null)}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-2 overflow-auto flex items-center justify-center bg-black/50">
              <img
                src={previewImage.url}
                alt={previewImage.title}
                className="max-h-[80vh] w-auto object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* Player Detail Modal */}
      {selectedPlayerDetail && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="relative max-w-2xl w-full bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-start justify-between border-b border-slate-800 p-5 bg-slate-950/60 shrink-0">
              <div className="flex items-center space-x-3.5">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0 shadow-inner">
                  <UserCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
                    {selectedPlayerDetail.name}
                    {selectedPlayerDetail.value && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        {selectedPlayerDetail.value}
                      </span>
                    )}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                    <span className="bg-indigo-600/30 text-indigo-200 border border-indigo-500/40 font-bold px-2.5 py-0.5 rounded-md">
                      Ruolo / Posizione: {selectedPlayerDetail.position || 'NC'}
                    </span>
                    {selectedPlayerDetail.age && (
                      <span className="bg-slate-800 text-slate-300 border border-slate-700 font-semibold px-2 py-0.5 rounded-md">
                        {getEffectiveAge(selectedPlayerDetail, currentDate)} anni
                      </span>
                    )}
                    {selectedPlayerDetail.nationality && (
                      <span className="bg-slate-800 text-slate-300 border border-slate-700 font-semibold px-2 py-0.5 rounded-md">
                        {selectedPlayerDetail.nationality}
                      </span>
                    )}
                    {selectedPlayerDetail.height && (
                      <span className="bg-slate-800 text-slate-300 border border-slate-700 font-semibold px-2 py-0.5 rounded-md">
                        {selectedPlayerDetail.height} cm
                      </span>
                    )}
                    {selectedPlayerDetail.ca !== undefined && (
                      <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold px-2 py-0.5 rounded-md">
                        CA: {selectedPlayerDetail.ca} {selectedPlayerDetail.pa ? `/ PA: ${selectedPlayerDetail.pa}` : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedPlayerDetail(null)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {selectedPlayerDetail.goalkeepingAttributes && Object.keys(selectedPlayerDetail.goalkeepingAttributes).length > 0 && (
                <div className="bg-slate-950 p-4 rounded-xl border border-amber-500/30 space-y-2">
                  <span className="text-amber-400 font-bold uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    🧤 Attributi Portiere / Porta
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(selectedPlayerDetail.goalkeepingAttributes).map(([attrKey, val]) => (
                      <div key={attrKey} className="flex items-center justify-between bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800/80">
                        <span className="text-slate-300 font-medium truncate mr-2">{attrKey}</span>
                        <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${
                          Number(val) >= 15 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                          Number(val) >= 11 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                          'bg-slate-800 text-slate-400'
                        }`}>
                          {String(val)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedPlayerDetail.technicalAttributes && Object.keys(selectedPlayerDetail.technicalAttributes).length > 0 && (
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <span className="text-emerald-400 font-bold uppercase tracking-wider text-[11px] block">
                    Attributi Tecnici
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(selectedPlayerDetail.technicalAttributes).map(([attrKey, val]) => (
                      <div key={attrKey} className="flex items-center justify-between bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800/80">
                        <span className="text-slate-300 font-medium truncate mr-2">{attrKey}</span>
                        <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${
                          Number(val) >= 15 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
                          Number(val) >= 11 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                          'bg-slate-800 text-slate-400'
                        }`}>
                          {String(val)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedPlayerDetail.mentalAttributes && Object.keys(selectedPlayerDetail.mentalAttributes).length > 0 && (
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <span className="text-cyan-400 font-bold uppercase tracking-wider text-[11px] block">
                    Attributi Mentali
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(selectedPlayerDetail.mentalAttributes).map(([attrKey, val]) => (
                      <div key={attrKey} className="flex items-center justify-between bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800/80">
                        <span className="text-slate-300 font-medium truncate mr-2">{attrKey}</span>
                        <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${
                          Number(val) >= 15 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
                          Number(val) >= 11 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                          'bg-slate-800 text-slate-400'
                        }`}>
                          {String(val)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedPlayerDetail.physicalAttributes && Object.keys(selectedPlayerDetail.physicalAttributes).length > 0 && (
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                  <span className="text-purple-400 font-bold uppercase tracking-wider text-[11px] block">
                    Attributi Fisici
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(selectedPlayerDetail.physicalAttributes).map(([attrKey, val]) => (
                      <div key={attrKey} className="flex items-center justify-between bg-slate-900/80 px-2.5 py-1.5 rounded-lg border border-slate-800/80">
                        <span className="text-slate-300 font-medium truncate mr-2">{attrKey}</span>
                        <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${
                          Number(val) >= 15 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
                          Number(val) >= 11 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                          'bg-slate-800 text-slate-400'
                        }`}>
                          {String(val)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedPlayerDetail.qualities && (
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1.5">
                  <span className="text-indigo-400 font-bold uppercase tracking-wider text-[11px] block">
                    Caratteristiche & Note di Scouting
                  </span>
                  <p className="text-slate-200 leading-relaxed font-medium whitespace-pre-line">
                    {selectedPlayerDetail.qualities}
                  </p>
                </div>
              )}

              {selectedPlayerDetail.notes && selectedPlayerDetail.notes !== selectedPlayerDetail.qualities && (
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1">
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[11px] block">
                    Dettagli Aggiuntivi
                  </span>
                  <p className="text-slate-300 leading-relaxed font-mono text-[11px] whitespace-pre-line">
                    {selectedPlayerDetail.notes}
                  </p>
                </div>
              )}

              {(!selectedPlayerDetail.technicalAttributes || Object.keys(selectedPlayerDetail.technicalAttributes).length === 0) &&
               (!selectedPlayerDetail.mentalAttributes || Object.keys(selectedPlayerDetail.mentalAttributes).length === 0) &&
               (!selectedPlayerDetail.physicalAttributes || Object.keys(selectedPlayerDetail.physicalAttributes).length === 0) &&
               !selectedPlayerDetail.qualities && !selectedPlayerDetail.notes && (
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-center text-slate-400 py-6">
                  Nessuna caratteristica avanzata o nota aggiuntiva disponibile per questo giocatore.
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-800 p-4 bg-slate-950/60 shrink-0">
              <button
                onClick={() => {
                  handleRemoveOpponentPlayer(selectedPlayerDetail.id);
                  setSelectedPlayerDetail(null);
                }}
                className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold px-3.5 py-2 rounded-xl transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Rimuovi Giocatore</span>
              </button>

              <button
                onClick={() => setSelectedPlayerDetail(null)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-5 py-2 rounded-xl shadow-lg transition-colors"
              >
                Chiudi Scheda
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
