export type MoraleLevel = 'Superbo' | 'Eccellente' | 'Buono' | 'Neutro' | 'Scarsa' | 'Inquieto';
export type MatchLoadLevel = 'Extremamente Elevato' | 'Elevato' | 'Medio' | 'Basso' | 'Fresco';
export type HomegrownStatus = 'HG Club (3 anni in club)' | 'HG Nazione (3 anni in UK)' | 'Straniero / Non-HG';
export type Duty = 'Difesa' | 'Supporto' | 'Attacco' | 'Automats';

export interface PlayerAttributeSnapshot {
  date: string;
  timestamp?: number;
  ca?: number;
  pa?: number;
  value?: string;
  technicalAttributes?: Record<string, number>;
  mentalAttributes?: Record<string, number>;
  physicalAttributes?: Record<string, number>;
  goalkeepingAttributes?: Record<string, number>;
  notes?: string;
}

export interface PlayerVariationAttribute {
  name: string;
  category?: 'Tecnico' | 'Mentale' | 'Fisico' | 'Portiere' | 'Abilità';
  oldVal: number;
  newVal: number;
  diff: number;
}

export interface PlayerVariationInfo {
  status: 'improved' | 'declined' | 'stable';
  caDiff: number;
  paDiff: number;
  improvedCount: number;
  declinedCount: number;
  improvedAttrs: PlayerVariationAttribute[];
  declinedAttrs: PlayerVariationAttribute[];
  timestamp: number;
  date: string; // Data di rilevazione corrente (es. "28 Ottobre 2026")
  previousDate?: string; // Data di riferimento/baseline iniziale del confronto (es. "1 Luglio 2026")
  currentDate?: string;
  updatedTimestamp?: number;
  changedAttributes?: PlayerVariationAttribute[];
  // Dati Temporali del Confronto (Temporality & Growth Pace)
  daysElapsed?: number; // Giorni effettivi tra le due date (es. 119)
  monthsElapsed?: number; // Mesi stimati trascorsi (es. 3.9 o 4)
  timeSpanLabel?: string; // Etichetta testuale (es. "ca. 4 mesi (dal 1 Luglio 2026 al 28 Ottobre 2026)")
  caPacePerMonth?: number; // Velocità di crescita: punti CA al mese (es. +0.67 CA/mese)
  paceAssessment?: 'rapida' | 'regolare' | 'lenta' | 'stabile' | 'calo_rapido' | 'calo_graduale';
  paceLabel?: string; // Etichetta descrittiva (es. "Crescita Rapida (+0.67 CA/mese)")
}

export interface Player {
  id: string;
  name: string;
  number: number;
  position: string; // e.g. "DC", "Cen / M/CC", "P/AD", "PC"
  bestRoles: string[]; // e.g. ["Difensore che Imposta", "Incontrista"]
  age: number;
  birthYear?: number;
  birthDate?: string;
  nationality: string;
  fatigue?: number; // (deprecato)
  isInjured?: boolean; // true se infortunato / indisponibile
  injuryNote?: string; // Dettagli infortunio (es. Distorsione caviglia, 3 settimane)
  isOnLoan?: boolean; // true se ceduto in prestito ad altra squadra
  loanClub?: string; // Club di destinazione del prestito (es. Monza, Girona, Spezia)
  isPlayerStaff?: boolean; // true se contrassegnato come "Giocatore/Staff" (investimento quadri tecnici della società, non è un esubero)
  staffRole?: string; // Ruolo o mansione prevista nello staff (es. "Collaboratore Tecnico", "Preparatore Portieri", "Mentore")
  availableForYouth?: boolean; // true se si allena con la rosa titolare ma è disponibile a giocare nelle squadre giovanili
  youthSquadDesignation?: string; // Categoria o squadra giovanile designata (es. "U21", "U18", o nome della rosa giovanile)
  youthMatchMinutes?: string; // Minutaggio previsto nelle giovanili (es. "Fino a 90 min", "Fino a 60 min", "Fino a 45 min")
  morale: MoraleLevel;
  matchLoad: MatchLoadLevel;
  homegrown: HomegrownStatus;
  championsLeagueRegistered: boolean;
  notes?: string;
  isKeyPlayer?: boolean;
  // Football Manager Detailed Scout Attributes
  ca?: number; // Current Ability 1-200
  pa?: number; // Potential Ability 1-200
  height?: number; // cm
  value?: string; // Formatted value e.g. €63.5M
  goalkeepingAttributes?: Record<string, number>;
  technicalAttributes?: Record<string, number>;
  mentalAttributes?: Record<string, number>;
  physicalAttributes?: Record<string, number>;
  personalityAttributes?: Record<string, number>;
  positionsDetail?: Record<string, number>;
  // Storico Rilevazioni e progressione attributi (CSV diff)
  attributeHistory?: PlayerAttributeSnapshot[];
  lastUpdatedDate?: string;
  lastUpdatedTimestamp?: number;
  lastVariation?: PlayerVariationInfo;
  goals?: number;
  assists?: number;
  avgRating?: number;
  appearances?: number;
  loanPerformanceStats?: any;
}

export interface TacticalPosition {
  id: string;
  label: string; // e.g. "POR", "TD", "DC-I", "DC-D", "TS", "CC-C", "MEZ", "TRQ", "AD", "AS", "PC"
  role: string; // e.g. "Portiere Libero", "Terzino Invertito"
  duty: Duty;
  playerId?: string;
  coords: { x: number; y: number }; // percentage coords on field 0-100
}

export interface InPossessionInstructions {
  tempo: 'Molto Alto' | 'Alto' | 'Standard' | 'Basso' | 'Molto Basso';
  passingStyle: 'Molto Corto' | 'Corto' | 'Misto' | 'Diretto' | 'Molto Diretto';
  width: 'Molto Ampio' | 'Ampio' | 'Standard' | 'Stretto' | 'Molto Stretto';
  playOutOfBack: boolean;
  workBallIntoBox: boolean;
  focusChannels: 'Misto' | 'Sulle Fasce' | 'Per Vie Centrali' | 'Cerca i Sovrapposizioni';
}

export interface OutOfPossessionInstructions {
  defensiveLine: 'Molto Alta' | 'Alta' | 'Standard' | 'Bassa' | 'Molto Bassa';
  lineOfEngagement: 'Molto Alta' | 'Alta' | 'Standard' | 'Bassa';
  pressingTrigger: 'Estremo' | 'Molto Spesso' | 'Standard' | 'Lieve' | 'Mai';
  pressingTrap: 'Nessuna' | 'Verso l\'Esterno' | 'Verso l\'Interno';
  useOffsideTrap: boolean;
  tackling: 'Aggressivi' | 'Standard' | 'Rimanere in Piedi';
}

export interface InTransitionInstructions {
  whenLost: 'Contropressing' | 'Riorganizzati';
  whenWon: 'Contropiede' | 'Mantieni Possesso';
  goalkeeperDistribution: 'Rinvio Rapido' | 'Rallenta il Gioco' | 'Distribuisci ai Terzini';
}

export type TacticalStyle =
  | 'Controllo del possesso'
  | 'Gegenpress'
  | 'Tiki-taka'
  | 'Tiki-taka verticale'
  | 'Gioco sulle fasce'
  | 'Palla lunga'
  | 'Contropiede fluido'
  | 'Contropiede diretto'
  | 'Catenaccio'
  | 'Parcheggia l\'autobus'
  | 'Tabula rasa';

export interface TacticPreset {
  id: string;
  name: string;
  formation: string; // e.g., "4-3-3 Gegenpress", "4-2-3-1 Controllo Possesso", "3-5-2 Solido"
  mentality: 'Molto Offensiva' | 'Offensiva' | 'Positiva' | 'Equilibrata' | 'Prudente' | 'Difensiva';
  tacticalStyle?: TacticalStyle;
  tempo: 'Molto Alto' | 'Alto' | 'Standard' | 'Basso';
  passingStyle: 'Molto Corto' | 'Corto' | 'Misto' | 'Diretto';
  defensiveLine: 'Molto Alta' | 'Alta' | 'Standard' | 'Bassa';
  pressingTrigger: 'Estremo' | 'Molto Spesso' | 'Standard' | 'Lieve';
  width: 'Molto Ampio' | 'Ampio' | 'Standard' | 'Stretto';
  positions: TacticalPosition[];
  inPossessionPositions?: TacticalPosition[];
  outOfPossessionPositions?: TacticalPosition[];
  combinedPositions?: TacticalPosition[];
  // Differentiated Screenshots & Instructions
  inPossessionScreenshot?: string;
  outOfPossessionScreenshot?: string;
  combinedScreenshot?: string;
  inPossessionInstructions?: InPossessionInstructions;
  outOfPossessionInstructions?: OutOfPossessionInstructions;
  inTransitionInstructions?: InTransitionInstructions;
}

export interface Fixture {
  id: string;
  date: string; // e.g., "18 Ottobre 2026"
  opponent: string;
  venue: 'Casa' | 'Trasferta' | 'Campo Neutro';
  competition: string;
  importance: 'Cruciale' | 'Alta' | 'Media';
  status: 'In Arrivo' | 'Giocata';
  score?: string; // Formato standard: "NostriGol - GolAvversario" (es. "2-1")
  outcome?: 'Vittoria' | 'Pareggio' | 'Sconfitta'; // Esito della partita
  scorers?: string[]; // Marcatori della partita (es. ["Ferguson (2)", "Saka"])
  tacticalNotes?: string;
  predictedFatigueRisk: 'Alto' | 'Medio' | 'Basso';
}

export interface ScoutingTarget {
  id: string;
  name: string;
  currentClub: string;
  age: number;
  birthYear?: number;
  birthDate?: string;
  position: string;
  roles: string[];
  estimatedValue: string;
  weeklyWage: string;
  homegrown: HomegrownStatus;
  rating: number; // 1 to 5 stars
  priority: 'Priorità Alta (Gennaio)' | 'Monitorare' | 'Piano B';
  notes: string;
  // Football Manager Detailed Scout Attributes
  ca?: number; // Current Ability 1-200
  pa?: number; // Potential Ability 1-200
  height?: number; // cm
  goalkeepingAttributes?: Record<string, number>;
  technicalAttributes?: Record<string, number>;
  mentalAttributes?: Record<string, number>;
  physicalAttributes?: Record<string, number>;
  personalityAttributes?: Record<string, number>;
  positionsDetail?: Record<string, number>;
}

export interface OpponentPlayerCSV {
  id: string;
  name: string;
  position: string;
  qualities?: string;
  weaknesses?: string;
  notes?: string;
  age?: number;
  birthYear?: number;
  birthDate?: string;
  nationality?: string;
  height?: number;
  value?: string;
  ca?: number;
  pa?: number;
  goalkeepingAttributes?: Record<string, number>;
  technicalAttributes?: Record<string, number>;
  mentalAttributes?: Record<string, number>;
  physicalAttributes?: Record<string, number>;
  personalityAttributes?: Record<string, number>;
  positionsDetail?: Record<string, number>;
}

export interface OpponentTacticalProfile {
  formation: string;
  mentality?: string;
  pressingStyle?: string;
  keyStrengths?: string;
  vulnerabilities?: string;
  notes?: string;
  screenshotBase64?: string;
}

export interface GamePlanState {
  opponent: string;
  venue: 'Casa' | 'Trasferta' | 'Campo Neutro';
  competition: string;
  opponentStyle: string;
  strategicPriority: string;
  opponentFormation: string;
  opponentMentality: string;
  opponentTacticalNotes: string;
  opponentScreenshotBase64?: string | null;
  opponentPlayers: OpponentPlayerCSV[];
  aiMatchPlan?: string | null;
  managerNotes?: string;
  lastUpdated?: string;
}

export interface SeasonPhaseInfo {
  phaseName: string; // e.g., "Fase d'Autunno: Crunch Premier & Champions League"
  currentMonth: string; // "Ottobre 2026"
  currentDate?: string; // e.g., "28 Ottobre 2026"
  leaguePosition: number; // 2
  clPoints: number; // 6
  objectives: string[];
  warnings: string[];
}

export type TacticalNoteCategory = 'tactics' | 'rotation' | 'scouting' | 'miscellaneous';

export type ReminderCategory = 'operativo' | 'scadenza' | 'calciomercato' | 'giocatori' | 'tattica' | 'varie';

export interface DateReminder {
  id: string;
  title: string;
  description?: string;
  targetDate: string; // e.g. "1 Gennaio 2027" o "28 Ottobre 2026"
  category: ReminderCategory;
  isDismissed: boolean; // se true, la notifica è stata disattivata
  dismissedAt?: string; // data in cui è stata disattivata
  isCompleted?: boolean;
  completedAt?: string;
  createdAt: string; // data di creazione del promemoria
  relatedNoteId?: string; // ID facoltativo della nota tattica collegata
  relatedPlayerName?: string; // Nome facoltativo del giocatore da valutare o seguire
  priority?: 'alta' | 'media' | 'bassa';
}

export interface TacticalNote {
  id: string;
  category: TacticalNoteCategory; // 'tactics' | 'rotation' | 'scouting' | 'miscellaneous'
  title: string;
  content: string;
  createdAt: string; // e.g. "28 Ottobre 2026"
  updatedAt?: string;
  tags?: string[];
  isAiGenerated?: boolean;
  // Promemoria & Inizio Operativo
  operationalDate?: string; // e.g. "1 Gennaio 2027": data di inizio operativo o scadenza promemoria
  isReminderActive?: boolean; // true se il promemoria per questa nota è attivo
  isReminderDismissed?: boolean; // true se la notifica è stata disattivata dall'utente
  reminderDismissedAt?: string; // data in cui è stata disattivata la notifica
}

export interface StandingsRow {
  position: number;
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  form?: string;
}

export interface CompetitionInfo {
  id: string;
  name: string;
  type?: 'Campionato' | 'Coppa Continentale' | 'Coppa Nazionale' | 'Amichevole';
  targetGoal?: string;
  notes?: string;
}

export interface YouthSquad {
  id: string;
  name: string; // e.g., "Northampton Town FC B", "Northampton Town FC U20", "Northampton Town FC U18"
  category?: string; // 'B' | 'U20' | 'U18' | 'U23' | 'U21' | 'U19' | 'U17' | 'Altro'
  players: Player[];
  notes?: string;
}

export interface SeasonCompetitionResult {
  competition: string;
  result: string; // e.g. "1° Campione 🏆", "Vincitore 🏆", "Finalista 🥈", "Semifinale", "Quarti"
  isWinner?: boolean;
}

export interface SeasonHistoryEntry {
  id: string;
  season: string; // e.g. "2025/2026", "2028/2029", "29/30"
  seasonCode?: string; // e.g. "2526", "2829", "2930"
  trophiesWon: string[]; // e.g. ["Premier League", "UEFA Champions League"]
  competitionsSummary: SeasonCompetitionResult[];
  individualAwards?: string[]; // e.g. ["Haaland: Capocannoniere (35 gol)", "Manager dell'Anno"]
  topScorer?: string; // e.g. "Evan Ferguson (28 gol)"
  bestPlayer?: string; // e.g. "Luka Romero (Media Voto: 7.42)"
  stats?: {
    played?: number;
    won?: number;
    drawn?: number;
    lost?: number;
    goalsFor?: number;
    goalsAgainst?: number;
    points?: number;
  };
  notes?: string; // Appunti & memorie storiche del manager sulla stagione
  updatedAt?: string;
}

export interface ArchivedSeasonCalendar {
  id: string;
  season: string; // e.g. "2029/2030" o "2930"
  seasonCode: string; // e.g. "2930"
  fileName: string; // e.g. "calendario-2930.json"
  teamName: string;
  exportedAt: string; // e.g. "2026-08-20T13:30:00.000Z"
  displayDate?: string;
  fixtures: Fixture[];
  notes?: string;
  stats?: {
    totalFixtures: number;
    played: number;
    wins: number;
    draws: number;
    losses: number;
    goalsScored?: number;
    goalsConceded?: number;
  };
}

export type MatchMomentum = 'dominant' | 'balanced' | 'struggling' | 'counter';
export type MatchMentality = 'Molto Difensiva' | 'Prudente' | 'Equilibrata' | 'Positiva' | 'Offensiva' | 'Molto Offensiva';
export type PressingIntensity = 'Molto Bassa' | 'Bassa' | 'Standard' | 'Alta' | 'Molto Alta (A tutto campo)';

export interface LiveMatchEvent {
  id: string;
  minute: number;
  type: 'goal_us' | 'goal_them' | 'yellow_card' | 'red_card' | 'sub' | 'injury' | 'chance_conceded' | 'chance_created' | 'tactical_change' | 'note';
  player?: string;
  playerOut?: string;
  playerIn?: string;
  description: string;
  timestamp: number;
}

export interface LiveMatchStats {
  shotsUs: number;
  shotsThem: number;
  shotsOnTargetUs: number;
  shotsOnTargetThem: number;
  xgUs?: number;
  xgThem?: number;
  possessionUs: number; // percentage, e.g. 54
  possessionThem: number; // percentage, e.g. 46
  foulsUs?: number;
  foulsThem?: number;
  yellowCardsUs?: number;
  yellowCardsThem?: number;
  cornersUs?: number;
  cornersThem?: number;
  passCompletionUs?: number; // percentage
  passCompletionThem?: number;
  tacklesWonUs?: number; // percentage
}

export interface LiveMatchStarter {
  playerId: string;
  name: string;
  number?: number;
  position: string;
  role?: string;
  condition?: number; // 0-100%
  rating?: number; // e.g. 6.8
  hasYellowCard?: boolean;
  isInjured?: boolean;
}

export interface LiveMatchVisibleModules {
  scoreboard: boolean;
  quickBar: boolean;
  tactics: boolean;
  stats: boolean;
  events: boolean;
  copilot: boolean;
}

export interface LiveMatchState {
  matchId: string;
  isActive: boolean;
  fixtureId?: string;
  opponent: string;
  opponentFormation: string;
  opponentMentality?: string;
  homeOrAway: 'home' | 'away' | 'neutral';
  competition: string;
  minute: number;
  period: 'pre' | '1h' | 'ht' | '2h' | 'et' | 'ft';
  scoreUs: number;
  scoreThem: number;
  momentum: MatchMomentum;
  mentality: MatchMentality;
  pressing: PressingIntensity;
  tempo: 'Molto Lento' | 'Lento' | 'Standard' | 'Alto' | 'Molto Alto';
  starters: LiveMatchStarter[];
  benchPlayerIds?: string[];
  userFormation?: string;
  events: LiveMatchEvent[];
  stats: LiveMatchStats;
  notes: string;
  densityMode: 'full' | 'compact' | 'minimal';
  visibleModules: LiveMatchVisibleModules;
}



