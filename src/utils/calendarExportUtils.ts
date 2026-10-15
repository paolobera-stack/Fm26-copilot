import { Fixture, ArchivedSeasonCalendar, SeasonCompetitionResult } from '../types';

/**
 * Resolves the accurate goals and outcome for any fixture.
 * 
 * In this application, fixture.score is ALWAYS stored from our team's perspective:
 * "[Nostri Gol] - [Gol Avversario]" (es. "2-1").
 * 
 * If a fixture was imported or logged with inverted numbers or explicit outcome:
 * - If fixture.outcome is set ('Vittoria' | 'Pareggio' | 'Sconfitta'), it is respected.
 * - If fixture.venue === 'Trasferta' AND fixture.outcome === 'Vittoria' AND g1 < g2
 *   (e.g. "1-2" where 1 was opponent and 2 was us), it automatically normalizes to teamGoals=g2, oppGoals=g1.
 * - If no explicit outcome is provided, teamGoals=g1 and oppGoals=g2.
 */
export function getFixtureResult(fixture: Fixture): {
  isPlayed: boolean;
  teamGoals: number;
  oppGoals: number;
  outcome: 'Vittoria' | 'Pareggio' | 'Sconfitta';
  isWin: boolean;
  isDraw: boolean;
  isLoss: boolean;
  displayScore: string;
} | null {
  if (fixture.status !== 'Giocata' && !fixture.score) return null;
  if (!fixture.score) return null;

  const scoreMatch = fixture.score.match(/(\d+)\s*[-:]\s*(\d+)/);
  if (!scoreMatch) return null;

  let g1 = parseInt(scoreMatch[1], 10);
  let g2 = parseInt(scoreMatch[2], 10);

  let outcome = fixture.outcome;

  // Detect and fix inverted away match scores (e.g. user or OCR logged 1-2 with 1 opponent and 2 our goals, or tagged as Vittoria)
  if (outcome === 'Vittoria' && g1 < g2) {
    const temp = g1;
    g1 = g2;
    g2 = temp;
  } else if (outcome === 'Sconfitta' && g1 > g2) {
    const temp = g1;
    g1 = g2;
    g2 = temp;
  } else if (!outcome) {
    outcome = g1 > g2 ? 'Vittoria' : g1 === g2 ? 'Pareggio' : 'Sconfitta';
  }

  const isWin = outcome === 'Vittoria' || g1 > g2;
  const isDraw = outcome === 'Pareggio' || (g1 === g2 && !isWin);
  const isLoss = outcome === 'Sconfitta' || (!isWin && !isDraw);

  return {
    isPlayed: true,
    teamGoals: g1,
    oppGoals: g2,
    outcome: isWin ? 'Vittoria' : isDraw ? 'Pareggio' : 'Sconfitta',
    isWin,
    isDraw,
    isLoss,
    displayScore: `${g1}-${g2}`,
  };
}

/**
 * Calculates win/draw/loss and goal stats from fixture scores
 */
export function calculateCalendarStats(fixtures: Fixture[]) {
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let played = 0;
  let goalsScored = 0;
  let goalsConceded = 0;

  fixtures.forEach((f) => {
    const res = getFixtureResult(f);
    if (res && res.isPlayed) {
      played++;
      goalsScored += res.teamGoals;
      goalsConceded += res.oppGoals;

      if (res.isWin) {
        wins++;
      } else if (res.isDraw) {
        draws++;
      } else {
        losses++;
      }
    }
  });

  return {
    totalFixtures: fixtures.length,
    played,
    wins,
    draws,
    losses,
    goalsScored,
    goalsConceded,
    winRate: played > 0 ? Math.round((wins / played) * 100) : 0,
  };
}

/**
 * Infers a clean season label (e.g. "2029/2030") and short code (e.g. "2930")
 * based on fixture dates or current app date
 */
export function inferSeasonFromFixtures(fixtures: Fixture[], currentDate?: string): { seasonLabel: string; seasonCode: string } {
  const years = new Set<number>();

  fixtures.forEach((f) => {
    const yrMatch = f.date?.match(/\b(20\d{2})\b/);
    if (yrMatch) {
      years.add(parseInt(yrMatch[1], 10));
    }
  });

  if (years.size === 0 && currentDate) {
    const yrMatch = currentDate.match(/\b(20\d{2})\b/);
    if (yrMatch) {
      years.add(parseInt(yrMatch[1], 10));
    }
  }

  const sortedYears = Array.from(years).sort((a, b) => a - b);

  if (sortedYears.length >= 2) {
    const startYr = sortedYears[0];
    const endYr = sortedYears[sortedYears.length - 1];
    const s1 = startYr.toString().slice(-2);
    const s2 = endYr.toString().slice(-2);
    return {
      seasonLabel: `${startYr}/${endYr}`,
      seasonCode: `${s1}${s2}`,
    };
  }

  if (sortedYears.length === 1) {
    const yr = sortedYears[0];
    const nextYr = yr + 1;
    const s1 = yr.toString().slice(-2);
    const s2 = nextYr.toString().slice(-2);
    return {
      seasonLabel: `${yr}/${nextYr}`,
      seasonCode: `${s1}${s2}`,
    };
  }

  // Default fallback
  return {
    seasonLabel: '2026/2027',
    seasonCode: '2627',
  };
}

/**
 * Creates export data and triggers browser download
 */
export function exportCalendarToFile(
  fixtures: Fixture[],
  seasonCodeInput?: string,
  teamName: string = 'Mia Squadra FC',
  seasonLabelInput?: string
): { fileName: string; payload: ArchivedSeasonCalendar; jsonContent: string } {
  const inferred = inferSeasonFromFixtures(fixtures);
  const cleanCode = (seasonCodeInput || inferred.seasonCode).trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'stagione';
  const cleanLabel = seasonLabelInput || inferred.seasonLabel;
  const fileName = `calendario-${cleanCode}.json`;
  const stats = calculateCalendarStats(fixtures);

  const payload: ArchivedSeasonCalendar = {
    id: `cal_${cleanCode}_${Date.now()}`,
    season: cleanLabel,
    seasonCode: cleanCode,
    fileName,
    teamName,
    exportedAt: new Date().toISOString(),
    displayDate: new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }),
    fixtures,
    stats,
  };

  const jsonStr = JSON.stringify(payload, null, 2);

  try {
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    link.style.display = 'none';
    document.body.appendChild(link);

    // Trigger download safely
    link.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window
      })
    );

    // Keep URL alive for 4 seconds so the browser's download manager can finish reading the stream
    setTimeout(() => {
      try {
        if (link.parentNode) {
          document.body.removeChild(link);
        }
        URL.revokeObjectURL(url);
      } catch (e) {
        console.warn('Error revoking export object URL:', e);
      }
    }, 4000);
  } catch (err) {
    console.error('Download via Blob failed, attempting data: URI fallback', err);
    try {
      const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(jsonStr)}`;
      const link = document.createElement('a');
      link.href = dataUri;
      link.setAttribute('download', fileName);
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (link.parentNode) document.body.removeChild(link);
      }, 2000);
    } catch (dataUriErr) {
      console.error('Data URI download failed:', dataUriErr);
    }
  }

  return { fileName, payload, jsonContent: jsonStr };
}

/**
 * Parses uploaded JSON content into ArchivedSeasonCalendar
 */
export function parseUploadedCalendarFile(content: string, originalFileName: string): ArchivedSeasonCalendar {
  const parsed = JSON.parse(content);

  // If it's already an ArchivedSeasonCalendar object
  if (parsed && Array.isArray(parsed.fixtures)) {
    const fixtures: Fixture[] = parsed.fixtures.map((f: any, idx: number) => ({
      id: f.id || `f_arch_${Date.now()}_${idx}`,
      date: f.date || 'Data sconosciuta',
      opponent: f.opponent || 'Avversario',
      venue: (['Casa', 'Trasferta', 'Campo Neutro'].includes(f.venue) ? f.venue : 'Casa') as any,
      competition: f.competition || 'Campionato',
      importance: (['Cruciale', 'Alta', 'Media'].includes(f.importance) ? f.importance : 'Media') as any,
      status: (['In Arrivo', 'Giocata'].includes(f.status) ? f.status : 'Giocata') as any,
      score: f.score || undefined,
      scorers: Array.isArray(f.scorers) ? f.scorers : undefined,
      tacticalNotes: f.tacticalNotes || undefined,
      predictedFatigueRisk: f.predictedFatigueRisk || 'Basso',
    }));

    const inferred = inferSeasonFromFixtures(fixtures);
    const codeFromFile = originalFileName.replace(/^calendario[-_]?/i, '').replace(/\.json$/i, '') || inferred.seasonCode;

    return {
      id: parsed.id || `arch_cal_${Date.now()}`,
      season: parsed.season || inferred.seasonLabel,
      seasonCode: parsed.seasonCode || codeFromFile || inferred.seasonCode,
      fileName: originalFileName || parsed.fileName || `calendario-${codeFromFile}.json`,
      teamName: parsed.teamName || 'Squadra Archiviata',
      exportedAt: parsed.exportedAt || new Date().toISOString(),
      displayDate: parsed.displayDate || new Date().toLocaleDateString('it-IT'),
      fixtures,
      notes: parsed.notes || '',
      stats: parsed.stats || calculateCalendarStats(fixtures),
    };
  }

  // If it's a direct array of Fixtures
  if (Array.isArray(parsed)) {
    const fixtures: Fixture[] = parsed.map((f: any, idx: number) => ({
      id: f.id || `f_arch_${Date.now()}_${idx}`,
      date: f.date || 'Data sconosciuta',
      opponent: f.opponent || 'Avversario',
      venue: (['Casa', 'Trasferta', 'Campo Neutro'].includes(f.venue) ? f.venue : 'Casa') as any,
      competition: f.competition || 'Campionato',
      importance: (['Cruciale', 'Alta', 'Media'].includes(f.importance) ? f.importance : 'Media') as any,
      status: (['In Arrivo', 'Giocata'].includes(f.status) ? f.status : 'Giocata') as any,
      score: f.score || undefined,
      scorers: Array.isArray(f.scorers) ? f.scorers : undefined,
      tacticalNotes: f.tacticalNotes || undefined,
      predictedFatigueRisk: f.predictedFatigueRisk || 'Basso',
    }));

    const inferred = inferSeasonFromFixtures(fixtures);
    const codeFromFile = originalFileName.replace(/^calendario[-_]?/i, '').replace(/\.json$/i, '') || inferred.seasonCode;

    return {
      id: `arch_cal_${Date.now()}`,
      season: inferred.seasonLabel,
      seasonCode: codeFromFile || inferred.seasonCode,
      fileName: originalFileName || `calendario-${codeFromFile}.json`,
      teamName: 'Squadra Archiviata',
      exportedAt: new Date().toISOString(),
      displayDate: new Date().toLocaleDateString('it-IT'),
      fixtures,
      notes: 'Importato da lista partite',
      stats: calculateCalendarStats(fixtures),
    };
  }

  throw new Error('Formato del file non riconosciuto. Assicurati che sia un file JSON di calendario valido (es. calendario-2930.json).');
}

export interface ExtractedSeasonData {
  seasonLabel: string;
  seasonCode: string;
  stats: {
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
    points: number;
  };
  competitionsSummary: SeasonCompetitionResult[];
  topScorer: string;
  notes: string;
}

/**
 * Extracts season awards/history information directly from a fixture list
 * (e.g. from the active calendar or an archived season calendar)
 */
export function extractSeasonDataFromFixtures(
  fixtures: Fixture[],
  currentDate?: string,
  existingSeasonLabels?: string[]
): ExtractedSeasonData {
  const stats = calculateCalendarStats(fixtures);
  const inferred = inferSeasonFromFixtures(fixtures, currentDate);
  let seasonLabel = inferred.seasonLabel;
  let seasonCode = inferred.seasonCode;

  // If the inferred season is already registered in existing seasons,
  // we check if we should increment or suggest the next season label
  if (existingSeasonLabels && existingSeasonLabels.includes(seasonLabel)) {
    const match = seasonLabel.match(/(\d{4})\s*[\/-]\s*(\d{4})/);
    if (match) {
      const y1 = parseInt(match[1], 10) + 1;
      const y2 = parseInt(match[2], 10) + 1;
      // Only bump if the fixture list seems to be empty or from previous season
      if (stats.played === 0) {
        seasonLabel = `${y1}/${y2}`;
        seasonCode = `${y1.toString().slice(-2)}${y2.toString().slice(-2)}`;
      }
    }
  }

  // Compute points: 3 * wins + draws
  const points = stats.wins * 3 + stats.draws;

  // Extract competitions summary from fixtures
  const compMap = new Map<
    string,
    { played: number; wins: number; draws: number; losses: number; scored: number; conceded: number }
  >();

  fixtures.forEach((f) => {
    const compName = (f.competition || 'Campionato').trim();
    if (!compMap.has(compName)) {
      compMap.set(compName, { played: 0, wins: 0, draws: 0, losses: 0, scored: 0, conceded: 0 });
    }
    const res = getFixtureResult(f);
    if (res && res.isPlayed) {
      const entry = compMap.get(compName)!;
      entry.played++;
      entry.scored += res.teamGoals;
      entry.conceded += res.oppGoals;
      if (res.isWin) entry.wins++;
      else if (res.isDraw) entry.draws++;
      else entry.losses++;
    }
  });

  const competitionsSummary: SeasonCompetitionResult[] = [];
  compMap.forEach((entry, compName) => {
    let result = '';
    if (entry.played > 0) {
      const compPts = entry.wins * 3 + entry.draws;
      result = `${entry.wins}V ${entry.draws}P ${entry.losses}S (${entry.played} gare, ${compPts} pt)`;
    } else {
      result = 'In programma';
    }
    competitionsSummary.push({
      competition: compName,
      result,
      isWinner: false,
    });
  });

  // If no competitions found in fixtures, provide default placeholder competitions
  if (competitionsSummary.length === 0) {
    competitionsSummary.push(
      { competition: 'Campionato', result: 'In programma', isWinner: false },
      { competition: 'Coppa Nazionale', result: 'In programma', isWinner: false }
    );
  }

  // Extract top scorer from fixture scorers
  const scorersMap = new Map<string, number>();
  fixtures.forEach((f) => {
    if (Array.isArray(f.scorers)) {
      f.scorers.forEach((s) => {
        if (!s || typeof s !== 'string') return;
        const match = s.match(/^(.*?)\s*\((\d+)\)$/);
        if (match) {
          const pName = match[1].trim();
          const goals = parseInt(match[2], 10) || 1;
          scorersMap.set(pName, (scorersMap.get(pName) || 0) + goals);
        } else {
          // Check for formats like "Player 34', 78'"
          const timeMatch = s.match(/^(.*?)\s+\d+['’]/);
          if (timeMatch) {
            const pName = timeMatch[1].trim();
            const occurrences = (s.match(/\d+['’]/g) || []).length || 1;
            scorersMap.set(pName, (scorersMap.get(pName) || 0) + occurrences);
          } else {
            const clean = s.trim();
            scorersMap.set(clean, (scorersMap.get(clean) || 0) + 1);
          }
        }
      });
    }
  });

  let topScorer = '';
  if (scorersMap.size > 0) {
    const sorted = Array.from(scorersMap.entries()).sort((a, b) => b[1] - a[1]);
    if (sorted[0] && sorted[0][1] > 0) {
      topScorer = `${sorted[0][0]} (${sorted[0][1]} gol)`;
    }
  }

  let notes = '';
  if (stats.played > 0) {
    const diff = stats.goalsScored - stats.goalsConceded;
    const diffStr = diff >= 0 ? `+${diff}` : `${diff}`;
    notes = `Rendimento calendario: ${stats.played} gare disputate (${stats.wins}V, ${stats.draws}P, ${stats.losses}S) • Gol fatti: ${stats.goalsScored}, subiti: ${stats.goalsConceded} (Diff: ${diffStr}) • Punti conquistati: ${points}.`;
  }

  return {
    seasonLabel,
    seasonCode,
    stats: {
      played: stats.played,
      won: stats.wins,
      drawn: stats.draws,
      lost: stats.losses,
      goalsFor: stats.goalsScored,
      goalsAgainst: stats.goalsConceded,
      points,
    },
    competitionsSummary,
    topScorer,
    notes,
  };
}

export interface CalendarTopScorer {
  player: string;
  goals: number;
}

export interface CalendarCompetitionStats {
  competition: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsScored: number;
  goalsConceded: number;
  goalDifference: number;
  points: number;
}

export interface CalendarPerformancePayload {
  totalFixtures: number;
  playedMatches: number;
  unplayedMatches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsScored: number;
  goalsConceded: number;
  goalDifference: number;
  virtualPoints: number;
  winRatePercentage: number;
  averageGoalsScoredPerMatch: string;
  averageGoalsConcededPerMatch: string;
  topScorersInCalendar: CalendarTopScorer[];
  competitionsBreakdown: CalendarCompetitionStats[];
  recentPlayedMatches: {
    date: string;
    opponent: string;
    venue: string;
    competition: string;
    score: string;
    outcome?: 'Vittoria' | 'Pareggio' | 'Sconfitta';
    scorers: string[];
    tacticalNotes?: string;
  }[];
  fixturesWithTacticalNotes: {
    date: string;
    opponent: string;
    venue: string;
    competition: string;
    status: 'In Arrivo' | 'Giocata';
    score?: string;
    outcome?: 'Vittoria' | 'Pareggio' | 'Sconfitta';
    scorers: string[];
    tacticalNotes: string;
  }[];
  notesCount: number;
}

/**
 * Parses match scorers list from fixtures into an aggregated ranking
 */
export function extractTopScorersFromFixtures(fixtures: Fixture[]): CalendarTopScorer[] {
  const scorersMap = new Map<string, number>();

  fixtures.forEach((f) => {
    if (Array.isArray(f.scorers)) {
      f.scorers.forEach((s) => {
        if (!s || typeof s !== 'string') return;
        const countMatch = s.match(/^(.*?)\s*\((\d+)\)$/);
        if (countMatch) {
          const pName = countMatch[1].trim();
          const goals = parseInt(countMatch[2], 10) || 1;
          scorersMap.set(pName, (scorersMap.get(pName) || 0) + goals);
        } else {
          // Check for minute timestamps like "Player 34', 78'"
          const timeMatch = s.match(/^(.*?)\s+\d+['’]/);
          if (timeMatch) {
            const pName = timeMatch[1].trim();
            const occurrences = (s.match(/\d+['’]/g) || []).length || 1;
            scorersMap.set(pName, (scorersMap.get(pName) || 0) + occurrences);
          } else {
            const clean = s.trim();
            if (clean) {
              scorersMap.set(clean, (scorersMap.get(clean) || 0) + 1);
            }
          }
        }
      });
    }
  });

  return Array.from(scorersMap.entries())
    .map(([player, goals]) => ({ player, goals }))
    .sort((a, b) => b.goals - a.goals);
}

/**
 * Builds the complete "Riepilogo Rendimento Calendario" and scorer stats
 * for the AI Copilot payload.
 */
export function getCalendarPerformancePayload(fixtures: Fixture[]): CalendarPerformancePayload {
  const stats = calculateCalendarStats(fixtures);
  const diff = stats.goalsScored - stats.goalsConceded;
  const points = stats.wins * 3 + stats.draws;
  const topScorers = extractTopScorersFromFixtures(fixtures);

  // Group by competition
  const compMap = new Map<
    string,
    { played: number; wins: number; draws: number; losses: number; scored: number; conceded: number }
  >();

  fixtures.forEach((f) => {
    const compName = (f.competition || 'Campionato').trim();
    if (!compMap.has(compName)) {
      compMap.set(compName, { played: 0, wins: 0, draws: 0, losses: 0, scored: 0, conceded: 0 });
    }
    const res = getFixtureResult(f);
    if (res && res.isPlayed) {
      const entry = compMap.get(compName)!;
      entry.played++;
      entry.scored += res.teamGoals;
      entry.conceded += res.oppGoals;
      if (res.isWin) entry.wins++;
      else if (res.isDraw) entry.draws++;
      else entry.losses++;
    }
  });

  const competitionsBreakdown: CalendarCompetitionStats[] = [];
  compMap.forEach((entry, competition) => {
    competitionsBreakdown.push({
      competition,
      played: entry.played,
      wins: entry.wins,
      draws: entry.draws,
      losses: entry.losses,
      goalsScored: entry.scored,
      goalsConceded: entry.conceded,
      goalDifference: entry.scored - entry.conceded,
      points: entry.wins * 3 + entry.draws,
    });
  });

  // Recent played matches (up to 8, with scorers)
  const playedFixtures = fixtures
    .filter((f) => f.status === 'Giocata' && Boolean(f.score))
    .slice(-8)
    .reverse();

  const recentPlayedMatches = playedFixtures.map((f) => {
    const res = getFixtureResult(f);
    return {
      date: f.date,
      opponent: f.opponent,
      venue: f.venue,
      competition: f.competition,
      score: f.score,
      outcome: res?.outcome || f.outcome,
      scorers: Array.isArray(f.scorers) ? f.scorers : [],
      tacticalNotes: f.tacticalNotes?.trim() || undefined,
    };
  });

  const fixturesWithTacticalNotes = fixtures
    .filter((f) => f.tacticalNotes && f.tacticalNotes.trim().length > 0)
    .map((f) => {
      const res = getFixtureResult(f);
      return {
        date: f.date,
        opponent: f.opponent,
        venue: f.venue,
        competition: f.competition,
        status: f.status,
        score: f.score,
        outcome: res?.outcome || f.outcome,
        scorers: Array.isArray(f.scorers) ? f.scorers : [],
        tacticalNotes: f.tacticalNotes!.trim(),
      };
    });

  return {
    totalFixtures: fixtures.length,
    playedMatches: stats.played,
    unplayedMatches: Math.max(0, fixtures.length - stats.played),
    wins: stats.wins,
    draws: stats.draws,
    losses: stats.losses,
    goalsScored: stats.goalsScored,
    goalsConceded: stats.goalsConceded,
    goalDifference: diff,
    virtualPoints: points,
    winRatePercentage: stats.winRate,
    averageGoalsScoredPerMatch: stats.played > 0 ? (stats.goalsScored / stats.played).toFixed(2) : '0.00',
    averageGoalsConcededPerMatch: stats.played > 0 ? (stats.goalsConceded / stats.played).toFixed(2) : '0.00',
    topScorersInCalendar: topScorers,
    competitionsBreakdown,
    recentPlayedMatches,
    fixturesWithTacticalNotes,
    notesCount: fixturesWithTacticalNotes.length,
  };
}

