export type Language = 'it' | 'en';

export interface TranslationDictionary {
  common: {
    save: string;
    cancel: string;
    delete: string;
    edit: string;
    close: string;
    back: string;
    search: string;
    filter: string;
    all: string;
    none: string;
    yes: string;
    no: string;
    confirm: string;
    loading: string;
    actions: string;
    name: string;
    role: string;
    age: string;
    nationality: string;
    value: string;
    status: string;
    notes: string;
    date: string;
    upload: string;
    export: string;
    download: string;
    details: string;
    remove: string;
    add: string;
    reset: string;
    success: string;
    error: string;
    warning: string;
    info: string;
    clear: string;
    copy: string;
    copied: string;
  };
  nav: {
    copilot: string;
    liveMatch: string;
    notes: string;
    squad: string;
    youth: string;
    tactics: string;
    gameplan: string;
    calendar: string;
    competitions: string;
    history: string;
    scouting: string;
    uploadCsv: string;
    quickSetup: string;
    personalKey: string;
    apiKeyByok: string;
    keyActive: string;
    duplicates: string;
    reminders: string;
    activeAlerts: string;
    injured: string;
    injuredPlural: string;
    todayMatch: string;
    nextMatch: string;
    vs: string;
    tomorrow: string;
    inDays: string;
    teamNamePlaceholder: string;
    saveTeamName: string;
    language: string;
    switchLanguage: string;
  };
  squad: {
    title: string;
    subtitle: string;
    totalPlayers: string;
    avgAge: string;
    injuredPlayers: string;
    searchPlaceholder: string;
    filterPosition: string;
    filterStatus: string;
    filterMorale: string;
    allPositions: string;
    allStatuses: string;
    exportCsv: string;
    importCsv: string;
    clearSquad: string;
    addPlayer: string;
    duplicatesWarningTitle: string;
    duplicatesWarningDesc: string;
    manageDuplicates: string;
    playerStaff: string;
    onLoan: string;
    availableForYouth: string;
    ca: string;
    pa: string;
    matchLoad: string;
    morale: string;
    bestRoles: string;
    homegrown: string;
    attributes: string;
    historyProgression: string;
    demoteToYouth: string;
    viewAttributes: string;
    improved: string;
    declined: string;
    stable: string;
  };
  youth: {
    title: string;
    subtitle: string;
    promoteToFirstTeam: string;
    demoteToYouth: string;
    squads: string;
    under18: string;
    under20: string;
    under21: string;
    allievi: string;
    movePlayer: string;
    createSquad: string;
    duplicatesFound: string;
    duplicatesDesc: string;
    checkDuplicates: string;
  };
  tactics: {
    title: string;
    formation: string;
    style: string;
    mentality: string;
    slotPrimary: string;
    slotSecondary: string;
    slotTertiary: string;
    inPossession: string;
    inTransition: string;
    outOfPossession: string;
    rolesAndDuties: string;
    copyTactic: string;
    resetTactic: string;
    uploadScreenshot: string;
    tacticalInstructions: string;
  };
  gameplan: {
    title: string;
    subtitle: string;
    opponent: string;
    nextMatch: string;
    generateAiPlan: string;
    generating: string;
    weaknesses: string;
    strengths: string;
    tacticalAdvice: string;
    keyThreats: string;
    uploadOpponentScreenshot: string;
    formationMatchup: string;
  };
  copilot: {
    title: string;
    subtitle: string;
    inputPlaceholder: string;
    ask: string;
    clearChat: string;
    tokenCount: string;
    byokNotice: string;
    suggestedPrompts: string;
    suggestedSquadPrompt: string;
    suggestedTacticsPrompt: string;
    suggestedYouthPrompt: string;
    suggestedInjuriesPrompt: string;
    thinking: string;
  };
  calendar: {
    title: string;
    subtitle: string;
    addMatch: string;
    uploadCalendarScreenshot: string;
    home: string;
    away: string;
    win: string;
    draw: string;
    loss: string;
    upcoming: string;
    played: string;
    competition: string;
    score: string;
  };
  competitions: {
    title: string;
    subtitle: string;
    leagueTable: string;
    points: string;
    played: string;
    won: string;
    drawn: string;
    lost: string;
    goalsFor: string;
    goalsAgainst: string;
    goalDiff: string;
    uploadStandings: string;
  };
  history: {
    title: string;
    subtitle: string;
    trophies: string;
    pastSeasons: string;
    hallOfFame: string;
    managerRecord: string;
    addTrophy: string;
  };
  scouting: {
    title: string;
    subtitle: string;
    addTarget: string;
    shortlist: string;
    recommendation: string;
    transferValue: string;
    wage: string;
    scoutStatus: string;
  };
  notes: {
    title: string;
    subtitle: string;
    newNote: string;
    searchNotes: string;
    memoryDiagnostics: string;
    copilotNotes: string;
    tacticalNotes: string;
  };
  duplicatesModal: {
    title: string;
    subtitle: string;
    keepInThisSquad: string;
    removeThisCopy: string;
    mergeNotesAndKeep: string;
    autoResolveAll: string;
    noDuplicatesTitle: string;
    noDuplicatesDesc: string;
    detectedInSquads: string;
  };
  byokModal: {
    title: string;
    subtitle: string;
    keyInputLabel: string;
    keyInputPlaceholder: string;
    saveKey: string;
    removeKey: string;
    freeKeyHint: string;
    getKeyLink: string;
  };
  reminders: {
    title: string;
    subtitle: string;
    activeTab: string;
    upcomingTab: string;
    dismissedTab: string;
    newReminder: string;
    editReminder: string;
    dueToday: string;
    overdue: string;
    upcoming: string;
    dismissNotification: string;
    reactivateNotification: string;
    markCompleted: string;
    operationalStartDate: string;
    category: string;
    targetDate: string;
    linkedNote: string;
    linkedPlayer: string;
    priority: string;
    noActiveReminders: string;
    noUpcomingReminders: string;
    bannerTitle: string;
    viewAll: string;
  };
}

export const translations: Record<Language, TranslationDictionary> = {
  it: {
    common: {
      save: 'Salva',
      cancel: 'Annulla',
      delete: 'Elimina',
      edit: 'Modifica',
      close: 'Chiudi',
      back: 'Indietro',
      search: 'Cerca...',
      filter: 'Filtra',
      all: 'Tutti',
      none: 'Nessuno',
      yes: 'Sì',
      no: 'No',
      confirm: 'Conferma',
      loading: 'Caricamento in corso...',
      actions: 'Azioni',
      name: 'Nome',
      role: 'Ruolo',
      age: 'Età',
      nationality: 'Nazionalità',
      value: 'Valore',
      status: 'Stato',
      notes: 'Note',
      date: 'Data',
      upload: 'Carica',
      export: 'Esporta',
      download: 'Scarica',
      details: 'Dettagli',
      remove: 'Rimuovi',
      add: 'Aggiungi',
      reset: 'Reimposta',
      success: 'Operazione completata con successo',
      error: 'Si è verificato un errore',
      warning: 'Attenzione',
      info: 'Informazione',
      clear: 'Pulisci',
      copy: 'Copia',
      copied: 'Copiato!',
    },
    nav: {
      copilot: 'AI Copilot FM26',
      liveMatch: 'Live Match & Panchina',
      notes: 'Note & Memory',
      squad: 'Rosa',
      youth: 'Giovanili',
      tactics: 'Lavagna Tattica',
      gameplan: 'Piano Gara AI',
      calendar: 'Calendario',
      competitions: 'Competizioni',
      history: 'History & Palmarès',
      scouting: 'Scouting',
      uploadCsv: 'Carica CSV',
      quickSetup: 'Setup Dati',
      personalKey: 'Chiave Personale',
      apiKeyByok: 'Chiave API (BYOK)',
      keyActive: 'Attiva',
      duplicates: 'Doppioni',
      reminders: 'Promemoria',
      activeAlerts: 'Avvisi Attivi',
      injured: 'infortunato',
      injuredPlural: 'infortunati',
      todayMatch: 'Match Day Oggi: ',
      nextMatch: 'Prossima: ',
      vs: 'vs',
      tomorrow: 'domani',
      inDays: 'tra {days}gg',
      teamNamePlaceholder: 'Nome della tua squadra',
      saveTeamName: 'Salva nome squadra',
      language: 'Lingua',
      switchLanguage: 'Cambia Lingua',
    },
    squad: {
      title: 'Gestione Rosa Prima Squadra',
      subtitle: 'Monitoraggio giocatori, carichi fisici, progressione e conformità campionati',
      totalPlayers: 'Giocatori in Rosa',
      avgAge: 'Età Media',
      injuredPlayers: 'Infortunati',
      searchPlaceholder: 'Cerca per nome, ruolo, nazionalità...',
      filterPosition: 'Filtra Posizione',
      filterStatus: 'Filtra Stato',
      filterMorale: 'Filtra Morale',
      allPositions: 'Tutti i Ruoli',
      allStatuses: 'Tutti gli Stati',
      exportCsv: 'Esporta CSV',
      importCsv: 'Importa CSV Rosa',
      clearSquad: 'Svuota Rosa',
      addPlayer: 'Nuovo Giocatore',
      duplicatesWarningTitle: 'Attenzione: Rilevati Giocatori Duplicati nelle Rose',
      duplicatesWarningDesc: 'Ci sono giocatori registrati contemporaneamente sia in prima squadra che nelle squadre giovanili.',
      manageDuplicates: 'Risolvi Doppioni',
      playerStaff: 'Giocatore / Staff',
      onLoan: 'In Prestito',
      availableForYouth: 'Disp. Giovanili',
      ca: 'CA (Abilità)',
      pa: 'PA (Potenziale)',
      matchLoad: 'Carico Partita',
      morale: 'Morale',
      bestRoles: 'Migliori Ruoli',
      homegrown: 'Vivaio (HG)',
      attributes: 'Attributi',
      historyProgression: 'Storico Crescita',
      demoteToYouth: 'Aggrega alle Giovanili',
      viewAttributes: 'Visualizza Scheda',
      improved: 'In Crescita',
      declined: 'In Calo',
      stable: 'Stabile',
    },
    youth: {
      title: 'Settore Giovanile & Cantera',
      subtitle: 'Gestione talenti, under 21, under 18 e passaggi di categoria',
      promoteToFirstTeam: 'Promuovi in Prima Squadra',
      demoteToYouth: 'Aggrega a questa squadra',
      squads: 'Squadre Giovanili',
      under18: 'Under 18',
      under20: 'Under 20',
      under21: 'Under 21',
      allievi: 'Allievi',
      movePlayer: 'Sposta Squadra',
      createSquad: 'Crea Nuova Squadra Giovanile',
      duplicatesFound: 'Doppioni Rilevati nel Settore Giovanile',
      duplicatesDesc: 'Alcuni giocatori sono presenti sia qui che in prima squadra.',
      checkDuplicates: 'Verifica Doppioni',
    },
    tactics: {
      title: 'Lavagna Tattica FM26',
      formation: 'Modulo',
      style: 'Stile di Gioco',
      mentality: 'Mentalità',
      slotPrimary: 'Slot 1 (Tattica Primaria)',
      slotSecondary: 'Slot 2 (Alternativa)',
      slotTertiary: 'Slot 3 (Emergenza)',
      inPossession: 'In Possesso',
      inTransition: 'In Transizione',
      outOfPossession: 'Non Possesso',
      rolesAndDuties: 'Ruoli & Compiti',
      copyTactic: 'Copia Tattica',
      resetTactic: 'Reimposta Modulo',
      uploadScreenshot: 'Analizza Screenshot Tattica',
      tacticalInstructions: 'Istruzioni di Squadra',
    },
    gameplan: {
      title: 'Piano Gara & Analisi Avversario',
      subtitle: 'Strategie personalizzate AI contro la prossima squadra da affrontare',
      opponent: 'Avversario',
      nextMatch: 'Prossima Partita',
      generateAiPlan: 'Genera Piano Tattico con AI',
      generating: 'Generazione strategia in corso...',
      weaknesses: 'Punti Deboli Avversario',
      strengths: 'Punti di Forza Avversario',
      tacticalAdvice: 'Consigli Tattici Chiave',
      keyThreats: 'Pericoli Principali',
      uploadOpponentScreenshot: 'Screenshot Rosa o Tattica Avversaria',
      formationMatchup: 'Confronto Moduli',
    },
    copilot: {
      title: 'FM26 AI Tactical Copilot',
      subtitle: 'Assistente intelligente avanzato per tattiche, rotazioni, calciomercato e dinamiche di spogliatoio',
      inputPlaceholder: 'Chiedi al Copilot (es. "Chi dovrei far riposare?", "Come contrastare il 4-3-3?", "Consigli su ruoli")...',
      ask: 'Invia',
      clearChat: 'Pulisci Chat',
      tokenCount: 'Token utilizzati',
      byokNotice: 'Funziona con la tua chiave Google Gemini API personale (BYOK gratuita).',
      suggestedPrompts: 'Domande Rapide',
      suggestedSquadPrompt: 'Analizza la rosa e dimmi i ruoli scoperti',
      suggestedTacticsPrompt: 'Come ottimizzare le istruzioni per il mio modulo?',
      suggestedYouthPrompt: 'Quali giovani hanno il potenziale più alto da promuovere?',
      suggestedInjuriesPrompt: 'Come gestire le rotazioni visti gli infortuni attuali?',
      thinking: 'Il Copilot sta analizzando i dati...',
    },
    calendar: {
      title: 'Calendario & Fasi Stagionali',
      subtitle: 'Pianificazione impegni, risultati storici e gestione picchi atletici',
      addMatch: 'Aggiungi Partita',
      uploadCalendarScreenshot: 'OCR Screenshot Calendario',
      home: 'Casa',
      away: 'Trasferta',
      win: 'Vittoria',
      draw: 'Pareggio',
      loss: 'Sconfitta',
      upcoming: 'In Programma',
      played: 'Disputata',
      competition: 'Competizione',
      score: 'Risultato',
    },
    competitions: {
      title: 'Competizioni & Classifiche',
      subtitle: 'Monitoraggio campionati, coppe nazionali ed europee',
      leagueTable: 'Classifica',
      points: 'Pt',
      played: 'G',
      won: 'V',
      drawn: 'N',
      lost: 'P',
      goalsFor: 'GF',
      goalsAgainst: 'GS',
      goalDiff: 'DR',
      uploadStandings: 'OCR Screenshot Classifica',
    },
    history: {
      title: 'Palmarès & Storico Carriera',
      subtitle: 'Trofei conquistati, record stagionali ed evoluzione del club',
      trophies: 'Bacheca Trofei',
      pastSeasons: 'Stagioni Precedenti',
      hallOfFame: 'Migliori Marcatori & Record',
      managerRecord: 'Statistiche Allenatore',
      addTrophy: 'Registra Nuovo Trofeo',
    },
    scouting: {
      title: 'Scouting & Calciomercato',
      subtitle: 'Lista obiettivi, report osservatori e pianificazione acquisti',
      addTarget: 'Aggiungi Obiettivo',
      shortlist: 'Lista Preferiti',
      recommendation: 'Valutazione Scout',
      transferValue: 'Valore Cartellino',
      wage: 'Ingaggio',
      scoutStatus: 'Priorità Acquisto',
    },
    notes: {
      title: 'Quaderno Tattico & Memoria Copilot',
      subtitle: 'Appunti di spogliatoio, direttive tecniche e contesto a lungo termine salvato per l\'AI',
      newNote: 'Nuova Nota Tattica',
      searchNotes: 'Cerca nelle note...',
      memoryDiagnostics: 'Diagnostica Memoria AI',
      copilotNotes: 'Note generate da Copilot',
      tacticalNotes: 'Note Tecniche & Tattiche',
    },
    duplicatesModal: {
      title: 'Controllo & Risoluzione Doppioni Rose',
      subtitle: 'Gestisci i giocatori duplicati tra prima squadra e formazioni giovanili per evitare discrepanze',
      keepInThisSquad: 'Mantieni in questa rosa (rimuovi dalle altre)',
      removeThisCopy: 'Rimuovi solo questa copia',
      mergeNotesAndKeep: 'Fondi Note e Mantieni qui',
      autoResolveAll: 'Risolvi Tutti Automaticamente (Consigliato)',
      noDuplicatesTitle: 'Nessun Doppione Rilevato',
      noDuplicatesDesc: 'Tutte le rose (prima squadra e giovanili) sono perfettamente sincronizzate e senza giocatori duplicati.',
      detectedInSquads: 'Presente in {count} rose',
    },
    byokModal: {
      title: 'Configura Chiave API Personale (BYOK)',
      subtitle: 'Inserisci la tua chiave Google Gemini API gratuita per abilitare l\'Intelligenza Artificiale',
      keyInputLabel: 'La tua Google Gemini API Key',
      keyInputPlaceholder: 'Incolla la chiave API (es. AIzaSy...)',
      saveKey: 'Salva & Attiva Chiave',
      removeKey: 'Rimuovi Chiave Personale',
      freeKeyHint: 'Puoi generare una chiave gratuita in pochi secondi su Google AI Studio.',
      getKeyLink: 'Ottieni chiave gratuita su Google AI Studio',
    },
    reminders: {
      title: 'Promemoria & Scadenze Operative',
      subtitle: 'Attività pianificate con avviso automatico al raggiungimento della data in-game',
      activeTab: 'Notifiche Attive',
      upcomingTab: 'In Programma',
      dismissedTab: 'Archiviati / Disattivati',
      newReminder: 'Nuovo Promemoria',
      editReminder: 'Modifica Promemoria',
      dueToday: 'Scatta Oggi',
      overdue: 'Data Raggiunta / Superata',
      upcoming: 'In arrivo',
      dismissNotification: 'Disattiva Notifica',
      reactivateNotification: 'Riattiva Notifica',
      markCompleted: 'Segna Completato',
      operationalStartDate: 'Inizio Operativo / Data Target',
      category: 'Ambito / Categoria',
      targetDate: 'Data Scadenza / Attivazione',
      linkedNote: 'Nota Tattica Collegata',
      linkedPlayer: 'Giocatore Coinvolto',
      priority: 'Priorità',
      noActiveReminders: 'Nessun promemoria attivo per la data corrente.',
      noUpcomingReminders: 'Nessun promemoria futuro in programma.',
      bannerTitle: 'Promemoria Operativo Raggiunto',
      viewAll: 'Gestisci Tutti',
    },
  },

  en: {
    common: {
      save: 'Save',
      cancel: 'Cancel',
      delete: 'Delete',
      edit: 'Edit',
      close: 'Close',
      back: 'Back',
      search: 'Search...',
      filter: 'Filter',
      all: 'All',
      none: 'None',
      yes: 'Yes',
      no: 'No',
      confirm: 'Confirm',
      loading: 'Loading...',
      actions: 'Actions',
      name: 'Name',
      role: 'Role',
      age: 'Age',
      nationality: 'Nationality',
      value: 'Value',
      status: 'Status',
      notes: 'Notes',
      date: 'Date',
      upload: 'Upload',
      export: 'Export',
      download: 'Download',
      details: 'Details',
      remove: 'Remove',
      add: 'Add',
      reset: 'Reset',
      success: 'Operation completed successfully',
      error: 'An error occurred',
      warning: 'Warning',
      info: 'Information',
      clear: 'Clear',
      copy: 'Copy',
      copied: 'Copied!',
    },
    nav: {
      copilot: 'AI Copilot FM26',
      liveMatch: 'Live Match & Bench',
      notes: 'Notes & Memory',
      squad: 'Squad',
      youth: 'Youth Squads',
      tactics: 'Tactics Board',
      gameplan: 'AI Match Plan',
      calendar: 'Calendar',
      competitions: 'Competitions',
      history: 'History & Honours',
      scouting: 'Scouting',
      uploadCsv: 'Upload CSV',
      quickSetup: 'Data Setup',
      personalKey: 'Personal Key',
      apiKeyByok: 'API Key (BYOK)',
      keyActive: 'Active',
      duplicates: 'Duplicates',
      reminders: 'Reminders',
      activeAlerts: 'Active Alerts',
      injured: 'injured',
      injuredPlural: 'injured',
      todayMatch: 'Match Day Today: ',
      nextMatch: 'Next: ',
      vs: 'vs',
      tomorrow: 'tomorrow',
      inDays: 'in {days}d',
      teamNamePlaceholder: 'Your club name',
      saveTeamName: 'Save club name',
      language: 'Language',
      switchLanguage: 'Switch Language',
    },
    squad: {
      title: 'First Team Squad Management',
      subtitle: 'Monitor players, match workload, attribute development and league registration',
      totalPlayers: 'Squad Size',
      avgAge: 'Average Age',
      injuredPlayers: 'Injuries',
      searchPlaceholder: 'Search by name, position, nationality...',
      filterPosition: 'Filter Position',
      filterStatus: 'Filter Status',
      filterMorale: 'Filter Morale',
      allPositions: 'All Positions',
      allStatuses: 'All Statuses',
      exportCsv: 'Export CSV',
      importCsv: 'Import Squad CSV',
      clearSquad: 'Clear Squad',
      addPlayer: 'New Player',
      duplicatesWarningTitle: 'Warning: Duplicate Players Detected Across Squads',
      duplicatesWarningDesc: 'Some players are registered in both the first team and youth squads.',
      manageDuplicates: 'Resolve Duplicates',
      playerStaff: 'Player / Staff',
      onLoan: 'On Loan',
      availableForYouth: 'Avail. for Youth',
      ca: 'CA (Current Ability)',
      pa: 'PA (Potential Ability)',
      matchLoad: 'Match Load',
      morale: 'Morale',
      bestRoles: 'Best Roles',
      homegrown: 'Homegrown (HG)',
      attributes: 'Attributes',
      historyProgression: 'Growth History',
      demoteToYouth: 'Move to Youth Squad',
      viewAttributes: 'View Profile',
      improved: 'Improving',
      declined: 'Declining',
      stable: 'Stable',
    },
    youth: {
      title: 'Youth Academy & Development',
      subtitle: 'Manage prospects, U21, U18 and squad promotions',
      promoteToFirstTeam: 'Promote to First Team',
      demoteToYouth: 'Assign to this squad',
      squads: 'Youth Squads',
      under18: 'Under 18',
      under20: 'Under 20',
      under21: 'Under 21',
      allievi: 'Youth Academy',
      movePlayer: 'Move Squad',
      createSquad: 'Create New Youth Squad',
      duplicatesFound: 'Duplicates Found in Youth Squads',
      duplicatesDesc: 'Some youth players are also present in the first team.',
      checkDuplicates: 'Inspect Duplicates',
    },
    tactics: {
      title: 'FM26 Tactics Board',
      formation: 'Formation',
      style: 'Playing Style',
      mentality: 'Mentality',
      slotPrimary: 'Slot 1 (Primary Tactic)',
      slotSecondary: 'Slot 2 (Alternative)',
      slotTertiary: 'Slot 3 (Emergency)',
      inPossession: 'In Possession',
      inTransition: 'In Transition',
      outOfPossession: 'Out of Possession',
      rolesAndDuties: 'Roles & Duties',
      copyTactic: 'Copy Tactic',
      resetTactic: 'Reset Formation',
      uploadScreenshot: 'Analyze Tactic Screenshot',
      tacticalInstructions: 'Team Instructions',
    },
    gameplan: {
      title: 'Match Plan & Opposition Analysis',
      subtitle: 'AI-tailored gameplans and tactical counters against your next opponent',
      opponent: 'Opponent',
      nextMatch: 'Upcoming Match',
      generateAiPlan: 'Generate AI Game Plan',
      generating: 'Generating strategy...',
      weaknesses: 'Opponent Weaknesses',
      strengths: 'Opponent Strengths',
      tacticalAdvice: 'Key Tactical Advice',
      keyThreats: 'Primary Threats',
      uploadOpponentScreenshot: 'Opponent Squad/Tactic Screenshot',
      formationMatchup: 'Formation Matchup',
    },
    copilot: {
      title: 'FM26 AI Tactical Copilot',
      subtitle: 'Advanced AI assistant for tactics, squad rotations, transfer market and dressing room dynamics',
      inputPlaceholder: 'Ask the Copilot (e.g. "Who should I rest?", "How to counter a 4-3-3?", "Role advice")...',
      ask: 'Send',
      clearChat: 'Clear Chat',
      tokenCount: 'Tokens used',
      byokNotice: 'Powered by your personal Google Gemini API key (Free BYOK).',
      suggestedPrompts: 'Quick Prompts',
      suggestedSquadPrompt: 'Analyze my squad and highlight depth issues',
      suggestedTacticsPrompt: 'How can I optimize instructions for this tactic?',
      suggestedYouthPrompt: 'Which youth prospects have the highest potential to promote?',
      suggestedInjuriesPrompt: 'How should I rotate given the current injury list?',
      thinking: 'Copilot is analyzing your data...',
    },
    calendar: {
      title: 'Calendar & Season Schedule',
      subtitle: 'Fixture management, match results and fitness peak planning',
      addMatch: 'Add Fixture',
      uploadCalendarScreenshot: 'OCR Calendar Screenshot',
      home: 'Home',
      away: 'Away',
      win: 'Win',
      draw: 'Draw',
      loss: 'Loss',
      upcoming: 'Upcoming',
      played: 'Played',
      competition: 'Competition',
      score: 'Score',
    },
    competitions: {
      title: 'Competitions & Standings',
      subtitle: 'Track league tables, domestic cups and European tournaments',
      leagueTable: 'League Table',
      points: 'Pts',
      played: 'P',
      won: 'W',
      drawn: 'D',
      lost: 'L',
      goalsFor: 'GF',
      goalsAgainst: 'GA',
      goalDiff: 'GD',
      uploadStandings: 'OCR Standings Screenshot',
    },
    history: {
      title: 'Honours & Career History',
      subtitle: 'Trophies won, seasonal records and club evolution',
      trophies: 'Trophy Cabinet',
      pastSeasons: 'Past Seasons',
      hallOfFame: 'Top Scorers & Records',
      managerRecord: 'Manager Statistics',
      addTrophy: 'Add New Trophy',
    },
    scouting: {
      title: 'Scouting & Transfers',
      subtitle: 'Shortlist targets, scout reports and recruitment planning',
      addTarget: 'Add Target',
      shortlist: 'Shortlist',
      recommendation: 'Scout Recommendation',
      transferValue: 'Market Value',
      wage: 'Wage',
      scoutStatus: 'Transfer Priority',
    },
    notes: {
      title: 'Tactical Notebook & Copilot Memory',
      subtitle: 'Dressing room notes, tactical directives and persistent memory for the AI',
      newNote: 'New Tactical Note',
      searchNotes: 'Search notes...',
      memoryDiagnostics: 'AI Memory Diagnostics',
      copilotNotes: 'Copilot Generated Notes',
      tacticalNotes: 'Tactical Directives',
    },
    duplicatesModal: {
      title: 'Squad Duplicates Inspection & Resolution',
      subtitle: 'Manage duplicate players across first team and youth squads to prevent discrepancies',
      keepInThisSquad: 'Keep in this squad (remove from others)',
      removeThisCopy: 'Remove only this copy',
      mergeNotesAndKeep: 'Merge Notes & Keep Here',
      autoResolveAll: 'Auto-Resolve All (Recommended)',
      noDuplicatesTitle: 'No Duplicates Found',
      noDuplicatesDesc: 'All squads (first team and youth) are in sync with no duplicate registrations.',
      detectedInSquads: 'Present in {count} squads',
    },
    byokModal: {
      title: 'Configure Personal API Key (BYOK)',
      subtitle: 'Enter your free Google Gemini API key to enable AI features',
      keyInputLabel: 'Your Google Gemini API Key',
      keyInputPlaceholder: 'Paste your API key (e.g. AIzaSy...)',
      saveKey: 'Save & Activate Key',
      removeKey: 'Remove Personal Key',
      freeKeyHint: 'You can generate a free key in seconds on Google AI Studio.',
      getKeyLink: 'Get free key on Google AI Studio',
    },
    reminders: {
      title: 'Date-Linked Reminders & Operational Tasks',
      subtitle: 'Scheduled actions triggered automatically when reaching or passing in-game date',
      activeTab: 'Active Notifications',
      upcomingTab: 'Upcoming',
      dismissedTab: 'Dismissed / Archive',
      newReminder: 'New Reminder',
      editReminder: 'Edit Reminder',
      dueToday: 'Due Today',
      overdue: 'Target Date Reached',
      upcoming: 'Upcoming',
      dismissNotification: 'Dismiss Alert',
      reactivateNotification: 'Reactivate Alert',
      markCompleted: 'Mark as Completed',
      operationalStartDate: 'Operational Start / Target Date',
      category: 'Category',
      targetDate: 'Trigger / Due Date',
      linkedNote: 'Linked Tactical Note',
      linkedPlayer: 'Linked Player',
      priority: 'Priority',
      noActiveReminders: 'No active reminders for current in-game date.',
      noUpcomingReminders: 'No future reminders scheduled.',
      bannerTitle: 'Operational Reminder Triggered',
      viewAll: 'Manage All',
    },
  },
};
