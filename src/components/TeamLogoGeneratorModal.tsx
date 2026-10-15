import React, { useState } from 'react';
import {
  Sparkles,
  Shield,
  Palette,
  Check,
  X,
  RefreshCw,
  Download,
  Trash2,
  AlertCircle,
  Eye,
  Wand2,
  Image as ImageIcon,
  Key,
  RotateCcw,
  CheckCircle2,
  Sliders
} from 'lucide-react';
import { getApiHeaders, hasCustomApiKey } from '../utils/apiKeyStorage';

interface TeamLogoGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamName: string;
  currentLogo: string | null;
  onSaveLogo: (logoUrl: string | null) => void;
  onOpenApiKeyModal?: () => void;
}

const PRESET_PALETTES = [
  { name: 'Northampton Claret & White', primary: '#721c24', secondary: '#ffffff', border: '#d4af37' },
  { name: 'Royal Blue & Gold', primary: '#0c2340', secondary: '#c59b27', border: '#ffffff' },
  { name: 'Rossonero Milano', primary: '#c8102e', secondary: '#111111', border: '#ffffff' },
  { name: 'Bianconero Classic', primary: '#111111', secondary: '#ffffff', border: '#d4af37' },
  { name: 'Verde & Oro Celtico', primary: '#006847', secondary: '#f7d117', border: '#ffffff' },
  { name: 'Azzurro Cielo & Navy', primary: '#6cabdd', secondary: '#1c2c5b', border: '#ffffff' },
  { name: 'Giallorosso Tradizionale', primary: '#8e1f2f', secondary: '#f0bc42', border: '#ffffff' },
  { name: 'Viola Nobile & Bianco', primary: '#4b2e83', secondary: '#ffffff', border: '#d4af37' },
];

const PRESET_SYMBOLS = [
  { label: '👞 Martello Calzolaio (Cobblers)', value: 'Martello e lesina da calzolaio tradizionale Northampton Cobblers con pallone da calcio retrò' },
  { label: '🦁 Leone Rampante', value: 'Leone rampante araldico britannico con corona nobiliare' },
  { label: '🦅 Aquila Imperiale', value: 'Aquila reale ad ali spiegate con scudo sul petto' },
  { label: '🐺 Lupo Feroce', value: 'Testa di lupo stilizzata geometrica con sguardo fiero' },
  { label: '🏰 Castello & Torri', value: 'Torre del castello medievale con merli e bandiera al vento' },
  { label: '⚔️ Spade Incrociate', value: 'Due spade incrociate con scudo crociato e pallone' },
  { label: '⚓ Ancora & Timone', value: 'Ancora marinaio con corda nautica e stelle' },
  { label: '⚽ Pallone Vintage', value: 'Classico pallone da calcio in cuoio cucito a mano anni 50 con rami di alloro' },
];

const STYLE_OPTIONS = [
  {
    id: 'classic',
    label: 'Classico Tradizionale',
    desc: 'Bordi dorati, nastri ricamati e araldica storica da prestigioso club britannico',
    badge: 'Consigliato'
  },
  {
    id: 'modern',
    label: 'Moderno Minimal',
    desc: 'Tratti puliti, forme geometriche essenziali e stile contemporaneo Premier League',
    badge: 'Trendy'
  },
  {
    id: 'dynamic',
    label: 'Dinamico Sportivo',
    desc: 'Linee aggressive, contrasti netti e forte impatto visivo ad alta energia',
    badge: 'Bold'
  },
  {
    id: 'vintage',
    label: 'Vintage Retrò 70s',
    desc: 'Stemma circolare d’epoca, monogrammi retrò e fascino nostalgico old-school',
    badge: 'Nostalgic'
  },
];

export const TeamLogoGeneratorModal: React.FC<TeamLogoGeneratorModalProps> = ({
  isOpen,
  onClose,
  teamName,
  currentLogo,
  onSaveLogo,
  onOpenApiKeyModal,
}) => {
  const [clubName, setClubName] = useState(teamName || 'Northampton Town FC');
  const [primaryColor, setPrimaryColor] = useState('#721c24');
  const [secondaryColor, setSecondaryColor] = useState('#ffffff');
  const [symbolText, setSymbolText] = useState('Martello e lesina da calzolaio Northampton Cobblers con pallone');
  const [selectedStyle, setSelectedStyle] = useState('classic');
  const [formatMode, setFormatMode] = useState<'auto' | 'image' | 'svg'>('auto');
  const [customDetails, setCustomDetails] = useState('Anno di fondazione 1897, rami di alloro ai lati');

  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<string>('');
  const [generatedLogo, setGeneratedLogo] = useState<string | null>(null);
  const [generatedFormat, setGeneratedFormat] = useState<string | null>(null);
  const [generatedModel, setGeneratedModel] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recentLogos, setRecentLogos] = useState<Array<{ url: string; format: string }>>([]);
  const [previewTab, setPreviewTab] = useState<'normal' | 'navbar'>('normal');
  const [saveSuccessToast, setSaveSuccessToast] = useState(false);

  if (!isOpen) return null;

  const hasKey = hasCustomApiKey();

  const handleGenerate = async () => {
    if (!hasKey) {
      if (onOpenApiKeyModal) onOpenApiKeyModal();
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);
    setSaveSuccessToast(false);
    setGenerationStep('Connessione al motore AI Gemini...');

    try {
      const response = await fetch('/api/gemini/generate-team-logo', {
        method: 'POST',
        headers: getApiHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          teamName: clubName.trim() || teamName,
          primaryColor,
          secondaryColor,
          mascotOrSymbol: symbolText.trim(),
          style: selectedStyle,
          formatPreference: formatMode,
          customDetails: customDetails.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Errore nella generazione del logo con AI');
      }

      if (data.imageUrl) {
        setGeneratedLogo(data.imageUrl);
        setGeneratedFormat(data.format || 'image');
        setGeneratedModel(data.model || 'Gemini');
        setRecentLogos((prev) => [
          { url: data.imageUrl, format: data.format || 'image' },
          ...prev.filter((item) => item.url !== data.imageUrl).slice(0, 5),
        ]);
      } else {
        throw new Error('Nessuna immagine valida generata dalla risposta.');
      }
    } catch (err: any) {
      console.error('Error generating logo:', err);
      setErrorMessage(err.message || 'Si è verificato un errore durante la generazione.');
    } finally {
      setIsGenerating(false);
      setGenerationStep('');
    }
  };

  const handleApplyLogo = (logoToApply?: string) => {
    const target = logoToApply || generatedLogo;
    if (target) {
      onSaveLogo(target);
      setSaveSuccessToast(true);
      setTimeout(() => {
        setSaveSuccessToast(false);
      }, 2500);
    }
  };

  const handleRemoveCurrentLogo = () => {
    onSaveLogo(null);
    setGeneratedLogo(null);
    setSaveSuccessToast(false);
  };

  const handleDownload = (logoUrl: string) => {
    const link = document.createElement('a');
    link.href = logoUrl;
    const isSvg = logoUrl.startsWith('data:image/svg+xml');
    const safeName = (clubName || 'team_logo').toLowerCase().replace(/[^a-z0-9]/g, '_');
    link.download = `${safeName}_logo.${isSvg ? 'svg' : 'png'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const activeDisplayLogo = generatedLogo || currentLogo;

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/90 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-600 flex items-center justify-center text-white shadow-lg shadow-rose-950/50">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>Generatore Logo Squadra AI</span>
                <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full font-semibold">
                  Gemini Creative
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Personalizza colori, simboli e stile per creare lo stemma ufficiale del club da mostrare nella barra di navigazione.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Chiudi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1">
          {/* Missing API Key Banner */}
          {!hasKey && (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between gap-3 text-xs text-amber-200">
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Per generare il logo con l'AI è necessaria una <strong>Google Gemini API Key</strong> personale configurata.
                </span>
              </div>
              {onOpenApiKeyModal && (
                <button
                  type="button"
                  onClick={onOpenApiKeyModal}
                  className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg shrink-0 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>Inserisci Chiave</span>
                </button>
              )}
            </div>
          )}

          {/* Success Banner */}
          {saveSuccessToast && (
            <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-xs font-semibold text-emerald-300 animate-in fade-in duration-150">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Logo applicato con successo alla tua squadra e salvato per la barra di navigazione!</span>
            </div>
          )}

          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-500/15 border border-rose-500/30 rounded-xl flex items-start gap-2.5 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold block">Errore durante la generazione:</span>
                <span className="block text-slate-300">{errorMessage}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Form Controls (7 cols) */}
            <div className="lg:col-span-7 space-y-5">
              {/* Club Name Input */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Nome del Club / Squadra</span>
                </label>
                <input
                  type="text"
                  value={clubName}
                  onChange={(e) => setClubName(e.target.value)}
                  placeholder="Es. Northampton Town FC"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-sm text-white placeholder-slate-600 focus:outline-none font-medium"
                />
              </div>

              {/* Color Palettes */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Colori Sociali del Club</span>
                  </label>
                  <span className="text-[11px] text-slate-400">Clicca un preset o personalizza</span>
                </div>

                {/* Preset Chips */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {PRESET_PALETTES.map((pal) => (
                    <button
                      key={pal.name}
                      type="button"
                      onClick={() => {
                        setPrimaryColor(pal.primary);
                        setSecondaryColor(pal.secondary);
                      }}
                      className="flex items-center gap-2 p-2 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl text-left transition-all cursor-pointer group"
                    >
                      <div className="flex -space-x-1 shrink-0">
                        <span className="w-4 h-4 rounded-full border border-slate-900 shadow" style={{ backgroundColor: pal.primary }} />
                        <span className="w-4 h-4 rounded-full border border-slate-900 shadow" style={{ backgroundColor: pal.secondary }} />
                      </div>
                      <span className="text-[10px] text-slate-300 font-medium truncate group-hover:text-white">
                        {pal.name.split(' ')[0]}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Color pickers */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="flex items-center gap-2.5 bg-slate-950 p-2 rounded-xl border border-slate-800">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-7 h-7 rounded-lg border-0 bg-transparent cursor-pointer"
                    />
                    <div className="text-xs">
                      <span className="text-[10px] text-slate-400 block font-semibold">Colore Primario</span>
                      <span className="font-mono text-slate-200 uppercase font-bold">{primaryColor}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 bg-slate-950 p-2 rounded-xl border border-slate-800">
                    <input
                      type="color"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="w-7 h-7 rounded-lg border-0 bg-transparent cursor-pointer"
                    />
                    <div className="text-xs">
                      <span className="text-[10px] text-slate-400 block font-semibold">Colore Secondario</span>
                      <span className="font-mono text-slate-200 uppercase font-bold">{secondaryColor}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Symbol / Mascot */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Wand2 className="w-3.5 h-3.5 text-rose-400" />
                    <span>Elemento Centrale / Mascotte</span>
                  </label>
                </div>

                {/* Preset Symbol Chips */}
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_SYMBOLS.map((sym) => (
                    <button
                      key={sym.label}
                      type="button"
                      onClick={() => setSymbolText(sym.value)}
                      className="text-[11px] px-2.5 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-lg transition-colors cursor-pointer"
                    >
                      {sym.label}
                    </button>
                  ))}
                </div>

                <input
                  type="text"
                  value={symbolText}
                  onChange={(e) => setSymbolText(e.target.value)}
                  placeholder="Descrivi l'icona centrale (es. Martello da calzolaio con pallone)"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-none"
                />
              </div>

              {/* Style Selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  <span>Stile Grafico dello Stemma</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {STYLE_OPTIONS.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setSelectedStyle(st.id)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        selectedStyle === st.id
                          ? 'bg-emerald-500/10 border-emerald-500/50 text-white shadow-md'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs">{st.label}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-semibold">
                          {st.badge}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">{st.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Additional Details & Format Options */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Dettagli Aggiuntivi (Motti, Anno, Stelle)</span>
                </label>
                <input
                  type="text"
                  value={customDetails}
                  onChange={(e) => setCustomDetails(e.target.value)}
                  placeholder="Es. Fondato nel 1897, stella dorata, motto latino..."
                  className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-600 focus:outline-none"
                />
              </div>

              {/* Format selection */}
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] text-slate-400 font-semibold">Motore Render:</span>
                <button
                  type="button"
                  onClick={() => setFormatMode('auto')}
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                    formatMode === 'auto'
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  ⚡ Auto (Flash Image + Vettoriale)
                </button>
                <button
                  type="button"
                  onClick={() => setFormatMode('svg')}
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                    formatMode === 'svg'
                      ? 'bg-emerald-600 text-white border-emerald-500'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                  }`}
                >
                  📐 SVG Vettoriale Puro
                </button>
              </div>

              {/* Action Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating || !hasKey}
                  className="w-full py-3 bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-600 hover:from-emerald-400 hover:to-indigo-500 disabled:opacity-50 disabled:pointer-events-none text-white font-extrabold rounded-xl shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition-all cursor-pointer text-sm"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>{generationStep || 'Generazione in corso...'}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Genera Stemma con Gemini AI</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Right Column: Live Preview & Management (5 cols) */}
            <div className="lg:col-span-5 flex flex-col space-y-4 bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 sm:p-5">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Anteprima Stemma</span>
                </span>
                {/* View toggles */}
                <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setPreviewTab('normal')}
                    className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                      previewTab === 'normal' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Stemma
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTab('navbar')}
                    className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                      previewTab === 'navbar' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Mockup Navbar
                  </button>
                </div>
              </div>

              {/* Main Preview Box */}
              <div className="flex-1 min-h-[260px] flex flex-col items-center justify-center p-4 bg-slate-900/90 rounded-xl border border-slate-800 relative overflow-hidden">
                {activeDisplayLogo ? (
                  previewTab === 'normal' ? (
                    <div className="flex flex-col items-center space-y-3">
                      <div className="w-40 h-40 rounded-2xl bg-slate-950 border border-slate-700/80 p-2 shadow-2xl flex items-center justify-center relative group">
                        <img
                          src={activeDisplayLogo}
                          alt={clubName}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain filter drop-shadow-md"
                        />
                      </div>
                      <div className="text-center space-y-0.5">
                        <div className="font-extrabold text-sm text-white tracking-wide">{clubName}</div>
                        <div className="text-[10px] text-slate-400">
                          {generatedFormat ? `Formato: ${generatedFormat.toUpperCase()}` : 'Stemma Attivo'}
                          {generatedModel && ` • ${generatedModel}`}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Navbar Mockup View */
                    <div className="w-full space-y-3">
                      <div className="text-[10px] text-slate-400 font-semibold text-center">
                        Come apparirà nella barra di navigazione:
                      </div>
                      <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-lg flex items-center space-x-3">
                        <div className="w-10 h-10 bg-slate-950 border border-slate-700 rounded-xl p-0.5 flex items-center justify-center shadow-md">
                          <img
                            src={activeDisplayLogo}
                            alt={clubName}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-contain"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-white truncate">{clubName}</div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <span>FM26 Assistant</span>
                            <span className="w-1 h-1 rounded-full bg-emerald-500"></span>
                            <span className="text-emerald-400 font-medium">Stagione Attiva</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="text-center p-6 space-y-2.5 text-slate-500">
                    <Shield className="w-14 h-14 mx-auto text-slate-700 stroke-[1.2]" />
                    <p className="text-xs font-medium">Nessun logo generato al momento.</p>
                    <p className="text-[10px] text-slate-500 max-w-[200px] mx-auto leading-relaxed">
                      Scegli colori, mascotte e stile, poi premi &quot;Genera Stemma con Gemini AI&quot;.
                    </p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              {activeDisplayLogo && (
                <div className="space-y-2 pt-1">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleApplyLogo()}
                      className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Applica a Navbar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownload(activeDisplayLogo)}
                      className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Scarica File</span>
                    </button>
                  </div>

                  {currentLogo && (
                    <button
                      type="button"
                      onClick={handleRemoveCurrentLogo}
                      className="w-full py-1.5 text-[11px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg border border-transparent hover:border-rose-500/30 flex items-center justify-center gap-1 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Rimuovi Logo e Ripristina Iniziali Monogramma</span>
                    </button>
                  )}
                </div>
              )}

              {/* Recent Generation Gallery */}
              {recentLogos.length > 1 && (
                <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                  <div className="text-[10px] font-bold text-slate-400 flex items-center justify-between">
                    <span>Variazioni Recenti:</span>
                    <span className="text-[9px] text-slate-500">Clicca per selezionare</span>
                  </div>
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    {recentLogos.map((item, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setGeneratedLogo(item.url);
                          setGeneratedFormat(item.format);
                        }}
                        className={`w-11 h-11 rounded-lg p-1 bg-slate-900 border shrink-0 transition-transform hover:scale-105 cursor-pointer ${
                          generatedLogo === item.url ? 'border-emerald-500 ring-2 ring-emerald-500/30' : 'border-slate-800'
                        }`}
                      >
                        <img
                          src={item.url}
                          alt={`Variazione ${idx + 1}`}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-contain"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>Il logo viene salvato localmente nel browser per persistenza continua.</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};
