import { Player } from '../types';

export interface RoleAttributeConfig {
  key: string;
  label: string;
  weight: number; // 1.5 for primary/essential, 1.0 for secondary/supporting
  category: 'Tecnico' | 'Mentale' | 'Fisico' | 'Portiere';
}

export interface RoleComparisonDefinition {
  id: string;
  name: string;
  shortCode: string;
  category: 'Portieri' | 'Difensori' | 'Centrocampisti' | 'Ali ed Esterni' | 'Attaccanti' | 'Generali';
  description: string;
  suggestedPositions: string[];
  attributes: RoleAttributeConfig[];
}

// Normalized lookup dictionary mapping any attribute name to its possible keys
const ATTRIBUTE_ALIASES: Record<string, string[]> = {
  // Portiere
  riflessi: ['riflessi', 'reflexes'],
  presa: ['presa', 'prese', 'handling'],
  uscite: ['uscite', 'rushingout'],
  unocontrouno: ['unocontrouno', 'oneonones'],
  presaalta: ['presaalta', 'aerialreach', 'aerialability'],
  comandoarea: ['comandoarea', 'commandofarea'],
  comunicazione: ['comunicazione', 'communication'],
  rinvii: ['rinvii', 'kicking'],
  rimesse: ['rimesse', 'throwing'],
  eccentricita: ['eccentricita', 'eccentricity'],

  // Tecnici
  contrasti: ['contrasti', 'tackling'],
  marcatura: ['marcatura', 'marking'],
  passaggi: ['passaggi', 'passing'],
  tecnica: ['tecnica', 'technique'],
  controllopalla: ['controllopalla', 'firsttouch'],
  dribbling: ['dribbling'],
  cross: ['cross', 'crossing'],
  colpoditesta: ['colpoditesta', 'heading'],
  finalizzazione: ['finalizzazione', 'finishing'],
  tiridafuori: ['tiridafuori', 'longshots'],
  calcipiazzati: ['calcipiazzati', 'freekicks'],
  calcidangolo: ['calcidangolo', 'corners'],
  rigori: ['rigori', 'penaltytaking'],

  // Mentali
  posizionamento: ['posizionamento', 'positioning'],
  decisioni: ['decisioni', 'decisions'],
  visionedigioco: ['visionedigioco', 'vision'],
  compostezza: ['compostezza', 'composure', 'freddezza'],
  senzapalla: ['senzapalla', 'offtheball'],
  concentrazione: ['concentrazione', 'concentration'],
  anticipazione: ['anticipazione', 'anticipation'],
  coraggio: ['coraggio', 'bravery'],
  determinazione: ['determinazione', 'determination'],
  impegno: ['impegno', 'workrate'],
  giocodisquadra: ['giocodisquadra', 'teamwork'],
  leadership: ['leadership'],
  fantasia: ['fantasia', 'flair'],
  aggressivita: ['aggressivita', 'aggression'],

  // Fisici
  velocita: ['velocita', 'pace'],
  accelerazione: ['accelerazione', 'acceleration'],
  resistenza: ['resistenza', 'stamina'],
  forza: ['forza', 'strength'],
  elevazione: ['elevazione', 'jumping'],
  agilita: ['agilita', 'agility'],
  equilibrio: ['equilibrio', 'balance'],
  integritafisica: ['integritafisica', 'naturalfitness']
};

/**
 * Robustly extracts a numeric attribute value (1-20) from any player record
 */
export function getPlayerAttribute(player: Player, attributeKey: string): number {
  if (!player) return 10;

  const targetNorm = attributeKey.toLowerCase().replace(/[^a-z0-9]/g, '');
  const aliasList = ATTRIBUTE_ALIASES[targetNorm] || [targetNorm];

  const pools = [
    player.technicalAttributes,
    player.mentalAttributes,
    player.physicalAttributes,
    player.goalkeepingAttributes,
    player.personalityAttributes
  ];

  for (const pool of pools) {
    if (!pool) continue;
    for (const alias of aliasList) {
      for (const [k, v] of Object.entries(pool)) {
        const kNorm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (kNorm === alias) {
          const num = Number(v);
          if (!isNaN(num) && num > 0) return num;
        }
      }
    }
  }

  // Fallback estimation based on CA if attribute is unrecorded in simplified saves
  if (player.ca) {
    const baseVal = Math.round(player.ca / 10);
    return Math.max(8, Math.min(18, baseVal));
  }

  return 10;
}

/**
 * Standard FM Tactical Roles with core attribute sets (6 to 8 attributes per role for radar clarity)
 */
export const FM_ROLE_COMPARISON_PRESETS: RoleComparisonDefinition[] = [
  {
    id: 'dc_central',
    name: 'Difensore Centrale (DC Difesa/Copertura)',
    shortCode: 'DC',
    category: 'Difensori',
    description: 'Solido nei duelli aerei e palla a terra, posizionamento impeccabile e forza fisica.',
    suggestedPositions: ['DC', 'CB', 'D C'],
    attributes: [
      { key: 'marcatura', label: 'Marcatura', weight: 1.5, category: 'Tecnico' },
      { key: 'contrasti', label: 'Contrasti', weight: 1.5, category: 'Tecnico' },
      { key: 'colpoditesta', label: 'Colpo di Testa', weight: 1.5, category: 'Tecnico' },
      { key: 'posizionamento', label: 'Posizionamento', weight: 1.5, category: 'Mentale' },
      { key: 'decisioni', label: 'Decisioni', weight: 1.2, category: 'Mentale' },
      { key: 'forza', label: 'Forza', weight: 1.4, category: 'Fisico' },
      { key: 'elevazione', label: 'Elevazione', weight: 1.4, category: 'Fisico' },
      { key: 'concentrazione', label: 'Concentrazione', weight: 1.1, category: 'Mentale' },
    ]
  },
  {
    id: 'dc_bpd',
    name: 'Difensore che Imposta (BPD - Costruzione)',
    shortCode: 'BPD',
    category: 'Difensori',
    description: 'Imposta l\'azione dal basso con passaggi millimetrici, visione e compostezza.',
    suggestedPositions: ['DC', 'CB', 'D C'],
    attributes: [
      { key: 'passaggi', label: 'Passaggi', weight: 1.5, category: 'Tecnico' },
      { key: 'visionedigioco', label: 'Visione di Gioco', weight: 1.4, category: 'Mentale' },
      { key: 'compostezza', label: 'Compostezza', weight: 1.4, category: 'Mentale' },
      { key: 'tecnica', label: 'Tecnica', weight: 1.3, category: 'Tecnico' },
      { key: 'contrasti', label: 'Contrasti', weight: 1.3, category: 'Tecnico' },
      { key: 'marcatura', label: 'Marcatura', weight: 1.3, category: 'Tecnico' },
      { key: 'posizionamento', label: 'Posizionamento', weight: 1.3, category: 'Mentale' },
      { key: 'decisioni', label: 'Decisioni', weight: 1.3, category: 'Mentale' },
    ]
  },
  {
    id: 'terzino_fluidificante',
    name: 'Terzino Fluidificante / Completo (TD / TS / WB)',
    shortCode: 'WB',
    category: 'Difensori',
    description: 'Garantisce spinta costante sulla fascia, cross precisi e tenuta atletica nei rientri.',
    suggestedPositions: ['TD', 'TS', 'DD', 'DS', 'RB', 'LB', 'WBR', 'WBL'],
    attributes: [
      { key: 'cross', label: 'Cross', weight: 1.5, category: 'Tecnico' },
      { key: 'velocita', label: 'Velocità', weight: 1.4, category: 'Fisico' },
      { key: 'accelerazione', label: 'Accelerazione', weight: 1.4, category: 'Fisico' },
      { key: 'resistenza', label: 'Resistenza', weight: 1.5, category: 'Fisico' },
      { key: 'contrasti', label: 'Contrasti', weight: 1.3, category: 'Tecnico' },
      { key: 'posizionamento', label: 'Posizionamento', weight: 1.3, category: 'Mentale' },
      { key: 'impegno', label: 'Impegno', weight: 1.2, category: 'Mentale' },
      { key: 'dribbling', label: 'Dribbling', weight: 1.1, category: 'Tecnico' },
    ]
  },
  {
    id: 'terzino_invertito',
    name: 'Terzino Invertito (IWB - Centrocampista aggiunto)',
    shortCode: 'IWB',
    category: 'Difensori',
    description: 'Taglia verso il centro del campo in fase di possesso per creare superiorità numerica in mediana.',
    suggestedPositions: ['TD', 'TS', 'DD', 'DS', 'RB', 'LB'],
    attributes: [
      { key: 'passaggi', label: 'Passaggi', weight: 1.5, category: 'Tecnico' },
      { key: 'contrasti', label: 'Contrasti', weight: 1.4, category: 'Tecnico' },
      { key: 'posizionamento', label: 'Posizionamento', weight: 1.4, category: 'Mentale' },
      { key: 'visionedigioco', label: 'Visione di Gioco', weight: 1.3, category: 'Mentale' },
      { key: 'compostezza', label: 'Compostezza', weight: 1.3, category: 'Mentale' },
      { key: 'decisioni', label: 'Decisioni', weight: 1.3, category: 'Mentale' },
      { key: 'resistenza', label: 'Resistenza', weight: 1.3, category: 'Fisico' },
      { key: 'tecnica', label: 'Tecnica', weight: 1.2, category: 'Tecnico' },
    ]
  },
  {
    id: 'mediano_incontrista',
    name: 'Incontrista / Mediano Recupera Palloni (BWM / MED)',
    shortCode: 'MED',
    category: 'Centrocampisti',
    description: 'Scudo davanti alla difesa, aggressività sui contrasti, intercettazioni e intensità.',
    suggestedPositions: ['MED', 'DM', 'M', 'CDM'],
    attributes: [
      { key: 'contrasti', label: 'Contrasti', weight: 1.5, category: 'Tecnico' },
      { key: 'marcatura', label: 'Marcatura', weight: 1.4, category: 'Tecnico' },
      { key: 'posizionamento', label: 'Posizionamento', weight: 1.4, category: 'Mentale' },
      { key: 'forza', label: 'Forza', weight: 1.3, category: 'Fisico' },
      { key: 'resistenza', label: 'Resistenza', weight: 1.4, category: 'Fisico' },
      { key: 'impegno', label: 'Impegno', weight: 1.3, category: 'Mentale' },
      { key: 'aggressivita', label: 'Aggressività', weight: 1.2, category: 'Mentale' },
      { key: 'decisioni', label: 'Decisioni', weight: 1.2, category: 'Mentale' },
    ]
  },
  {
    id: 'regista_arretrato',
    name: 'Regista Arretrato (DLP - Geometrie e Lanci)',
    shortCode: 'DLP',
    category: 'Centrocampisti',
    description: 'Il metronomo della squadra che detta i ritmi con passaggi corti e sventagliate millimetriche.',
    suggestedPositions: ['MED', 'CC', 'DM', 'CM', 'M'],
    attributes: [
      { key: 'passaggi', label: 'Passaggi', weight: 1.5, category: 'Tecnico' },
      { key: 'visionedigioco', label: 'Visione di Gioco', weight: 1.5, category: 'Mentale' },
      { key: 'tecnica', label: 'Tecnica', weight: 1.4, category: 'Tecnico' },
      { key: 'compostezza', label: 'Compostezza', weight: 1.4, category: 'Mentale' },
      { key: 'decisioni', label: 'Decisioni', weight: 1.4, category: 'Mentale' },
      { key: 'controllopalla', label: 'Controllo Palla', weight: 1.3, category: 'Tecnico' },
      { key: 'posizionamento', label: 'Posizionamento', weight: 1.2, category: 'Mentale' },
      { key: 'giocodisquadra', label: 'Gioco di Squadra', weight: 1.2, category: 'Mentale' },
    ]
  },
  {
    id: 'centrocampista_box_to_box',
    name: 'Centrocampista Box-to-Box (BBM - Tuttofare)',
    shortCode: 'BBM',
    category: 'Centrocampisti',
    description: 'Motore inesauribile tra le due aree di rigore, inserimenti letali e sostegno alla difesa.',
    suggestedPositions: ['CC', 'CM', 'MC'],
    attributes: [
      { key: 'resistenza', label: 'Resistenza', weight: 1.5, category: 'Fisico' },
      { key: 'impegno', label: 'Impegno', weight: 1.5, category: 'Mentale' },
      { key: 'passaggi', label: 'Passaggi', weight: 1.3, category: 'Tecnico' },
      { key: 'contrasti', label: 'Contrasti', weight: 1.3, category: 'Tecnico' },
      { key: 'senzapalla', label: 'Inserimento Senza Palla', weight: 1.4, category: 'Mentale' },
      { key: 'decisioni', label: 'Decisioni', weight: 1.3, category: 'Mentale' },
      { key: 'forza', label: 'Forza', weight: 1.2, category: 'Fisico' },
      { key: 'tiridafuori', label: 'Tiro da Fuori', weight: 1.2, category: 'Tecnico' },
    ]
  },
  {
    id: 'mezzala',
    name: 'Mezzala d\'Attacco (MEZ - Spazio e Fantasia)',
    shortCode: 'MEZ',
    category: 'Centrocampisti',
    description: 'Centrocampista di qualità che si allarga sul mezzo-spazio per dialogare con terzino e ala.',
    suggestedPositions: ['CC', 'CM', 'MC', 'TRQ'],
    attributes: [
      { key: 'passaggi', label: 'Passaggi', weight: 1.4, category: 'Tecnico' },
      { key: 'tecnica', label: 'Tecnica', weight: 1.5, category: 'Tecnico' },
      { key: 'dribbling', label: 'Dribbling', weight: 1.3, category: 'Tecnico' },
      { key: 'visionedigioco', label: 'Visione di Gioco', weight: 1.4, category: 'Mentale' },
      { key: 'senzapalla', label: 'Senza Palla', weight: 1.4, category: 'Mentale' },
      { key: 'accelerazione', label: 'Accelerazione', weight: 1.2, category: 'Fisico' },
      { key: 'decisioni', label: 'Decisioni', weight: 1.3, category: 'Mentale' },
      { key: 'tiridafuori', label: 'Tiro da Fuori', weight: 1.2, category: 'Tecnico' },
    ]
  },
  {
    id: 'trequartista_rifinitore',
    name: 'Trequartista / Regista Avanzato (TRQ / AP - Rifinitura)',
    shortCode: 'TRQ',
    category: 'Centrocampisti',
    description: 'Imprevedibilità pura tra le linee, assist filtranti e controllo nello stretto.',
    suggestedPositions: ['TRQ', 'AM', 'CAM', 'AMC'],
    attributes: [
      { key: 'fantasia', label: 'Fantasia', weight: 1.5, category: 'Mentale' },
      { key: 'visionedigioco', label: 'Visione di Gioco', weight: 1.5, category: 'Mentale' },
      { key: 'passaggi', label: 'Passaggi', weight: 1.5, category: 'Tecnico' },
      { key: 'tecnica', label: 'Tecnica', weight: 1.4, category: 'Tecnico' },
      { key: 'dribbling', label: 'Dribbling', weight: 1.4, category: 'Tecnico' },
      { key: 'compostezza', label: 'Compostezza', weight: 1.3, category: 'Mentale' },
      { key: 'agilita', label: 'Agilità', weight: 1.3, category: 'Fisico' },
      { key: 'decisioni', label: 'Decisioni', weight: 1.3, category: 'Mentale' },
    ]
  },
  {
    id: 'ala_esterna',
    name: 'Ala Pura / Inverted Winger (AD / AS / IF - 1v1)',
    shortCode: 'ALA',
    category: 'Ali ed Esterni',
    description: 'Velocità nello scatto, dribbling secco per superare l\'uomo, cross tesi o rientro al tiro.',
    suggestedPositions: ['AD', 'AS', 'ED', 'ES', 'AMR', 'AML', 'RW', 'LW', 'W'],
    attributes: [
      { key: 'velocita', label: 'Velocità', weight: 1.5, category: 'Fisico' },
      { key: 'accelerazione', label: 'Accelerazione', weight: 1.5, category: 'Fisico' },
      { key: 'dribbling', label: 'Dribbling', weight: 1.5, category: 'Tecnico' },
      { key: 'cross', label: 'Cross', weight: 1.3, category: 'Tecnico' },
      { key: 'tecnica', label: 'Tecnica', weight: 1.3, category: 'Tecnico' },
      { key: 'agilita', label: 'Agilità', weight: 1.3, category: 'Fisico' },
      { key: 'senzapalla', label: 'Senza Palla', weight: 1.3, category: 'Mentale' },
      { key: 'finalizzazione', label: 'Finalizzazione', weight: 1.2, category: 'Tecnico' },
    ]
  },
  {
    id: 'punta_avanzata',
    name: 'Punta Avanzata / Attaccante Completo (AF / CF)',
    shortCode: 'PC',
    category: 'Attaccanti',
    description: 'Guida l\'attacco con tagli in profondità, cinismo chirurgico davanti al portiere e rapidità.',
    suggestedPositions: ['PC', 'ATT', 'P', 'ST', 'CF', 'AF'],
    attributes: [
      { key: 'finalizzazione', label: 'Finalizzazione', weight: 1.5, category: 'Tecnico' },
      { key: 'compostezza', label: 'Freddezza', weight: 1.5, category: 'Mentale' },
      { key: 'senzapalla', label: 'Senza Palla', weight: 1.5, category: 'Mentale' },
      { key: 'accelerazione', label: 'Accelerazione', weight: 1.4, category: 'Fisico' },
      { key: 'velocita', label: 'Velocità', weight: 1.3, category: 'Fisico' },
      { key: 'dribbling', label: 'Dribbling', weight: 1.3, category: 'Tecnico' },
      { key: 'tecnica', label: 'Tecnica', weight: 1.3, category: 'Tecnico' },
      { key: 'decisioni', label: 'Decisioni', weight: 1.2, category: 'Mentale' },
    ]
  },
  {
    id: 'centravanti_boa',
    name: 'Centravanti Fisico / Fulcro di Gioco (TM - Target Man)',
    shortCode: 'TM',
    category: 'Attaccanti',
    description: 'Gigante d\'area, vince duelli aerei, protegge palla spalle alla porta e favorisce i compagni.',
    suggestedPositions: ['PC', 'ATT', 'P', 'ST', 'CF'],
    attributes: [
      { key: 'forza', label: 'Forza', weight: 1.5, category: 'Fisico' },
      { key: 'elevazione', label: 'Elevazione', weight: 1.5, category: 'Fisico' },
      { key: 'colpoditesta', label: 'Colpo di Testa', weight: 1.5, category: 'Tecnico' },
      { key: 'finalizzazione', label: 'Finalizzazione', weight: 1.4, category: 'Tecnico' },
      { key: 'equilibrio', label: 'Equilibrio', weight: 1.3, category: 'Fisico' },
      { key: 'compostezza', label: 'Freddezza', weight: 1.3, category: 'Mentale' },
      { key: 'coraggio', label: 'Coraggio', weight: 1.3, category: 'Mentale' },
      { key: 'senzapalla', label: 'Senza Palla', weight: 1.2, category: 'Mentale' },
    ]
  },
  {
    id: 'portiere_moderno',
    name: 'Portiere / Portiere Libero (POR / SK - Tra i Pali e Uscite)',
    shortCode: 'POR',
    category: 'Portieri',
    description: 'Reattività fulminea tra i pali, presa solida, uscite tempestive e sicurezza nell\'1 contro 1.',
    suggestedPositions: ['POR', 'GK', 'PT'],
    attributes: [
      { key: 'riflessi', label: 'Riflessi', weight: 1.5, category: 'Portiere' },
      { key: 'presa', label: 'Presa', weight: 1.5, category: 'Portiere' },
      { key: 'uscite', label: 'Uscite', weight: 1.4, category: 'Portiere' },
      { key: 'unocontrouno', label: 'Uno Contro Uno', weight: 1.4, category: 'Portiere' },
      { key: 'presaalta', label: 'Presa Alta', weight: 1.3, category: 'Portiere' },
      { key: 'posizionamento', label: 'Posizionamento', weight: 1.4, category: 'Mentale' },
      { key: 'compostezza', label: 'Freddezza', weight: 1.3, category: 'Mentale' },
      { key: 'rinvii', label: 'Rinvii e Piedi', weight: 1.2, category: 'Portiere' },
    ]
  },
  {
    id: 'panoramica_generale',
    name: 'Panoramica Macro-Aree Generali FM (6 Pilastri)',
    shortCode: 'ALL',
    category: 'Generali',
    description: 'Valutazione a 360° sui sei pilastri del modello di gioco di Football Manager.',
    suggestedPositions: ['ALL'],
    attributes: [
      { key: 'contrasti', label: 'Difesa (Contrasti/Marcatura)', weight: 1.0, category: 'Tecnico' },
      { key: 'passaggi', label: 'Costruzione (Passaggi/Visione)', weight: 1.0, category: 'Tecnico' },
      { key: 'finalizzazione', label: 'Attacco (Finalizzazione/Senza palla)', weight: 1.0, category: 'Tecnico' },
      { key: 'velocita', label: 'Rapidità (Velocità/Accelerazione)', weight: 1.0, category: 'Fisico' },
      { key: 'forza', label: 'Fisicità (Forza/Elevazione)', weight: 1.0, category: 'Fisico' },
      { key: 'decisioni', label: 'Cervello (Decisioni/Compostezza)', weight: 1.0, category: 'Mentale' },
    ]
  }
];

/**
 * Finds the most fitting default role preset based on two players' positions
 */
export function getDefaultRoleForPlayers(playerA: Player, playerB: Player): RoleComparisonDefinition {
  const posA = (playerA?.position || '').toUpperCase();
  const posB = (playerB?.position || '').toUpperCase();
  const combined = `${posA} ${posB}`;

  if (combined.includes('POR') || combined.includes('GK')) {
    return FM_ROLE_COMPARISON_PRESETS.find(r => r.id === 'portiere_moderno') || FM_ROLE_COMPARISON_PRESETS[0];
  }
  if (combined.includes('PC') || combined.includes('ATT') || combined.includes('ST') || combined.includes('CF')) {
    return FM_ROLE_COMPARISON_PRESETS.find(r => r.id === 'punta_avanzata') || FM_ROLE_COMPARISON_PRESETS[0];
  }
  if (combined.includes('AD') || combined.includes('AS') || combined.includes('AMR') || combined.includes('AML') || combined.includes('W')) {
    return FM_ROLE_COMPARISON_PRESETS.find(r => r.id === 'ala_esterna') || FM_ROLE_COMPARISON_PRESETS[0];
  }
  if (combined.includes('TRQ') || combined.includes('CAM') || combined.includes('AMC')) {
    return FM_ROLE_COMPARISON_PRESETS.find(r => r.id === 'trequartista_rifinitore') || FM_ROLE_COMPARISON_PRESETS[0];
  }
  if (combined.includes('MED') || combined.includes('DM') || combined.includes('CDM')) {
    return FM_ROLE_COMPARISON_PRESETS.find(r => r.id === 'mediano_incontrista') || FM_ROLE_COMPARISON_PRESETS[0];
  }
  if (combined.includes('CC') || combined.includes('CM') || combined.includes('MC')) {
    return FM_ROLE_COMPARISON_PRESETS.find(r => r.id === 'centrocampista_box_to_box') || FM_ROLE_COMPARISON_PRESETS[0];
  }
  if (combined.includes('TD') || combined.includes('TS') || combined.includes('DD') || combined.includes('DS') || combined.includes('RB') || combined.includes('LB')) {
    return FM_ROLE_COMPARISON_PRESETS.find(r => r.id === 'terzino_fluidificante') || FM_ROLE_COMPARISON_PRESETS[0];
  }
  if (combined.includes('DC') || combined.includes('CB')) {
    return FM_ROLE_COMPARISON_PRESETS.find(r => r.id === 'dc_central') || FM_ROLE_COMPARISON_PRESETS[0];
  }

  return FM_ROLE_COMPARISON_PRESETS[0];
}

/**
 * Calculates a weighted Role Fit percentage (0-100%) for a player in a specific role
 */
export function calculateRoleSuitability(player: Player, role: RoleComparisonDefinition): number {
  if (!player || !role || role.attributes.length === 0) return 50;

  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const attr of role.attributes) {
    const val = getPlayerAttribute(player, attr.key);
    totalWeightedScore += val * attr.weight;
    totalWeight += attr.weight;
  }

  const rawAvg = totalWeight > 0 ? totalWeightedScore / totalWeight : 10;
  // Map 1-20 FM scale to percentage (e.g. 10 -> 50%, 15 -> 75%, 20 -> 100%)
  const percentage = Math.round((rawAvg / 20) * 100);
  return Math.min(99, Math.max(25, percentage));
}
