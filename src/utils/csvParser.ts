import { Player, ScoutingTarget, MoraleLevel, MatchLoadLevel, HomegrownStatus } from '../types';

export interface ParsedCsvResult {
  headers: string[];
  rawRows: Record<string, string>[];
  detectedType: 'squad' | 'scouting';
  parsedPlayers: Player[];
  parsedTargets: ScoutingTarget[];
  error?: string;
}

/**
 * Normalizes input text before any parsing:
 * - Strips UTF-8 BOM (\uFEFF)
 * - Decodes HTML entities (&#39;, &#039;, &apos;, &rsquo;, &lsquo;, &quot;, &amp;, &nbsp;)
 * - Unifies curly / typographic apostrophes (’ ‘ ´ `) to standard single quotes (')
 * - Unescapes backslashes in front of apostrophes (\' -> ')
 * - Converts HTML table exports from Football Manager into tab-delimited text
 */
export function normalizeCsvInput(text: string): string {
  if (!text) return '';
  let clean = text;

  // 1. Remove UTF-8 BOM and zero-width markers
  if (clean.charCodeAt(0) === 0xfeff) {
    clean = clean.slice(1);
  }
  clean = clean.replace(/^\uFEFF/, '');

  // 2. Normalize HTML entities for apostrophes, quotes and spaces
  clean = clean
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&#0*34;/g, '"')
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ');

  // 3. Normalize typographic apostrophes & backticks
  clean = clean.replace(/[\u2018\u2019\u201A\u201B\u00B4`]/g, "'");

  // 4. Remove escaped backslashes in front of quotes or apostrophes
  clean = clean.replace(/\\'/g, "'").replace(/\\"/g, '"');

  // 5. If it contains HTML table tags (FM "Web page" or "Text HTML" export), convert to TSV
  if (clean.includes('<table') || clean.includes('<tr')) {
    clean = clean
      .replace(/<\/tr>/gi, '\n')
      .replace(/<\/td>|<\/th>/gi, '\t')
      .replace(/<[^>]*>/g, '');
  }

  return clean;
}

/**
 * Sanitizes a player name: preserves interior apostrophes (e.g. O'Riley, N'Diaye, Eto'o, D'Amico)
 * while stripping exterior wrapping quotes, leftover HTML tags, or excessive whitespace.
 */
export function sanitizePlayerName(name: string): string {
  if (!name) return '';
  let clean = name.trim();
  // Strip any lingering HTML tags
  clean = clean.replace(/<[^>]*>/g, '');
  // Normalize internal entities / apostrophes
  clean = clean
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&#0*34;/g, '"')
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/[\u2018\u2019\u201A\u201B\u00B4`]/g, "'")
    .replace(/\\'/g, "'");

  // Strip wrapping double quotes or single quotes only if they surround the entire name
  if (clean.startsWith('"') && clean.endsWith('"') && clean.length >= 2) {
    clean = clean.slice(1, -1);
  } else if (clean.startsWith("'") && clean.endsWith("'") && clean.length >= 2) {
    clean = clean.slice(1, -1);
  }
  return clean.trim();
}

function cleanCell(val: string): string {
  let clean = val.trim();
  if (clean.startsWith('"') && clean.endsWith('"') && clean.length >= 2) {
    clean = clean.slice(1, -1);
  } else if (clean.startsWith("'") && clean.endsWith("'") && clean.length >= 2) {
    clean = clean.slice(1, -1);
  }
  return clean.trim();
}

/**
 * Helper to split a CSV line with quotes and delimiter.
 * Handles both RFC 4180 double quotes (") and single quotes (') enclosure,
 * while preserving internal apostrophes (e.g. N'Diaye, O'Connor, D'Angelo, Eto'o)
 * without breaking columns.
 */
function splitRow(rowStr: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inDoubleQuotes = false;
  let inSingleQuotes = false;

  for (let i = 0; i < rowStr.length; i++) {
    const char = rowStr[i];

    if (char === '"' && !inSingleQuotes) {
      // Handle escaped double quote: ""
      if (inDoubleQuotes && i + 1 < rowStr.length && rowStr[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inDoubleQuotes = !inDoubleQuotes;
      }
    } else if (char === "'" && !inDoubleQuotes) {
      // Check if this single quote is an enclosure quote or an internal apostrophe
      if (!inSingleQuotes && current.trim().length === 0) {
        inSingleQuotes = true;
      } else if (inSingleQuotes && (i + 1 === rowStr.length || rowStr[i + 1] === delimiter || rowStr[i + 1] === '\r' || rowStr[i + 1] === '\n')) {
        inSingleQuotes = false;
      } else {
        // Internal apostrophe (e.g. O'Connor, N'Diaye, Eto'o, D'Amico) -> preserve as normal character!
        current += char;
      }
    } else if (char === delimiter && !inDoubleQuotes && !inSingleQuotes) {
      result.push(cleanCell(current));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(cleanCell(current));
  return result;
}

/**
 * Format raw currency numbers like 63568120€ or 63568120 to €63.5M
 */
function formatCurrency(valStr: string): string {
  if (!valStr) return '€15M';
  if (valStr.startsWith('€') || valStr.startsWith('$') || valStr.startsWith('£')) return valStr;

  const rawNum = parseInt(valStr.replace(/[^0-9]/g, ''), 10);
  if (isNaN(rawNum) || rawNum <= 0) return '€15M';

  if (rawNum >= 1_000_000) {
    const inMillions = (rawNum / 1_000_000).toFixed(1).replace(/\.0$/, '');
    return `€${inMillions}M`;
  }
  if (rawNum >= 1_000) {
    const inThousands = Math.round(rawNum / 1_000);
    return `€${inThousands}k`;
  }
  return `€${rawNum}`;
}

/**
 * Extract 4-digit year from date string (e.g. "28 Ottobre 2026" => 2026)
 */
export function extractCurrentYear(dateStr?: string): number {
  if (!dateStr) return 2026;
  const match = dateStr.match(/\b(20\d{2}|19\d{2})\b/);
  if (match) {
    const y = parseInt(match[1], 10);
    if (y >= 1990 && y <= 2100) return y;
  }
  return 2026;
}

/**
 * Extract 4-digit birth year from any date string or year expression
 * Supports:
 * - 4-digit year directly ("2004", "1998", "2020")
 * - Formats with separators: 27/06/2004, 27.06.2004, 27-06-2004, 2004-06-27, 01/08/2020
 * - 2-digit years: 27/06/04, 27.06.04, 27-06-04, 15/08/98
 * - Italian/English text months: 27 giu 2004, 14 Ottobre 2005, 12 Jun 2003
 */
export function parseBirthYear(bornStr?: string, currentYear = 2026): number | null {
  if (!bornStr) return null;
  const clean = bornStr.trim();
  if (!clean) return null;

  // Max realistic birth year accounts for future FM game saves (up to 2065)
  const maxYear = Math.max(currentYear + 35, 2065);

  // 1. Look for explicit 4-digit year between 1950 and maxYear
  const fourDigitMatches = clean.match(/\b(19\d{2}|20\d{2})\b/g);
  if (fourDigitMatches && fourDigitMatches.length > 0) {
    for (const match of fourDigitMatches) {
      const y = parseInt(match, 10);
      if (y >= 1950 && y <= maxYear) {
        return y;
      }
    }
  }

  // 2. Look for date patterns with 2-digit years: DD/MM/YY or DD.MM.YY or DD-MM-YY
  const twoDigitDateMatch = clean.match(/(?:^|\D)(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})(?:\D|$)/);
  if (twoDigitDateMatch) {
    const yy = parseInt(twoDigitDateMatch[3], 10);
    const fullYear = yy <= 50 ? 2000 + yy : 1900 + yy;
    if (fullYear >= 1950 && fullYear <= maxYear) {
      return fullYear;
    }
  }

  return null;
}

/**
 * Calculate age from born date string (e.g., "27/06/2004", "27.06.2004"), year ("2004"), or age string ("21", "21 anni")
 */
export function parseAge(
  bornStr: string,
  fallbackAge = 22,
  currentDateOrYear?: string | number
): number {
  if (!bornStr) return fallbackAge;
  const currentYear =
    typeof currentDateOrYear === 'number'
      ? currentDateOrYear
      : extractCurrentYear(currentDateOrYear);

  const cleanStr = bornStr.trim();

  // 1. Check if string is already a direct age number (e.g. "21", "21 anni", "21a", "21 yr", "21 y/o", "Age: 21")
  const directAgeMatch = cleanStr.match(/^\s*(?:age|età|eta|anni)?\s*[:#-]?\s*(\d{2})\s*(?:anni|a|yr|yrs|years|y\/o)?\s*$/i);
  if (directAgeMatch) {
    const num = parseInt(directAgeMatch[1], 10);
    if (num >= 14 && num <= 50) return num;
  }

  // 2. Check if string has explicit age in parenthesis or label: e.g. "27/06/2004 (22)" or "22 (27/06/2004)"
  const parenthesizedAgeMatch = cleanStr.match(/\((\d{2})\)|\b(\d{2})\s*anni\b/i);
  if (parenthesizedAgeMatch) {
    const num = parseInt(parenthesizedAgeMatch[1] || parenthesizedAgeMatch[2], 10);
    if (num >= 14 && num <= 50) return num;
  }

  // 3. Try to extract birth year from date of birth format
  const birthYear = parseBirthYear(cleanStr, currentYear);
  if (birthYear) {
    const computedAge = currentYear - birthYear;
    if (computedAge >= 14 && computedAge <= 50) return computedAge;
    // If computed age is < 14 (e.g. regen born in 2020 imported into default 2026 calendar before user advanced season),
    // estimate prospect age as a realistic youth intake talent (17)
    if (computedAge < 14) return 17;
  }

  // 4. Check if there is any standalone 2-digit number representing age (15 - 48)
  const standaloneDigits = cleanStr.match(/\b(1[5-9]|[2-4]\d)\b/);
  if (standaloneDigits) {
    const num = parseInt(standaloneDigits[1], 10);
    if (num >= 15 && num <= 48) return num;
  }

  return fallbackAge;
}

/**
 * Calculate age based on the current app date string (e.g. "28 Ottobre 2026" or "15/08/2027")
 */
export function getEffectiveAge(
  entity?: { age?: number; birthYear?: number; birthDate?: string } | null,
  currentDate?: string
): number {
  if (!entity) return 22;
  const currentYear = extractCurrentYear(currentDate);

  // 1. If explicit birthYear is known, compute exact age
  if (entity.birthYear && entity.birthYear >= 1950 && entity.birthYear <= currentYear) {
    const diff = currentYear - entity.birthYear;
    if (diff >= 14 && diff <= 50) return diff;
    if (diff < 14 && entity.age) return entity.age;
    if (diff < 14) return 17;
  }

  // 2. If birthDate string is provided and contains date patterns, parse it
  if (entity.birthDate && (/[/.-]|\b(19\d{2}|20\d{2})\b/.test(entity.birthDate))) {
    const parsed = parseAge(entity.birthDate, entity.age || 22, currentYear);
    if (parsed >= 14 && parsed <= 50) return parsed;
  }

  // 3. If direct age property is valid, return it directly
  if (typeof entity.age === 'number' && entity.age >= 14 && entity.age <= 50) {
    return entity.age;
  }

  return 22;
}

/**
 * Derive positions string & best roles from FM positions map
 */
function derivePositionAndRoles(posMap: Record<string, number>, defaultPos = 'CC'): { position: string; roles: string[] } {
  const pos20List: string[] = [];
  const naturalOrAcc: string[] = [];
  let maxPos = defaultPos;
  let maxVal = -1;

  const posNameMap: Record<string, string> = {
    Goalkeeper: 'POR',
    DefenderCentral: 'DC',
    DefenderRight: 'DD',
    DefenderLeft: 'DL',
    WingBackRight: 'WBR',
    WingBackLeft: 'WBL',
    DefensiveMidfielder: 'MED',
    MidfielderCentral: 'CC',
    MidfielderRight: 'MD',
    MidfielderLeft: 'MS',
    AttackingMidCentral: 'TRQ',
    AttackingMidRight: 'AD',
    AttackingMidLeft: 'AS',
    Striker: 'PC',
  };

  for (const [key, val] of Object.entries(posMap)) {
    const pCode = posNameMap[key] || key;
    if (val > maxVal) {
      maxVal = val;
      maxPos = pCode;
    }
    if (val >= 20) {
      if (pCode && !pos20List.includes(pCode)) {
        pos20List.push(pCode);
      }
    } else if (val >= 15) {
      if (pCode && !naturalOrAcc.includes(pCode)) {
        naturalOrAcc.push(pCode);
      }
    }
  }

  const finalPos = pos20List.length > 0 
    ? pos20List.join('/') 
    : (naturalOrAcc.length > 0 ? naturalOrAcc.join('/') : maxPos);

  // Best roles generator
  const roles: string[] = [];
  if (finalPos.includes('DC')) roles.push('Difensore Centrale', 'Difensore che Imposta');
  else if (finalPos.includes('POR')) roles.push('Portiere Libero', 'Portiere Difensore');
  else if (finalPos.includes('CC') || finalPos.includes('MED')) roles.push('Centrocampista di Quantità', 'Regista Avanzato', 'Incontrista');
  else if (finalPos.includes('PC')) roles.push('Attaccante Avanzato', 'Uomo d\'Area', 'Falso 9');
  else if (finalPos.includes('TS') || finalPos.includes('TD')) roles.push('Terzino Fluidificante', 'Terzino Completo');
  else if (finalPos.includes('TRQ') || finalPos.includes('AD') || finalPos.includes('AS')) roles.push('Ala Invertita', 'Trequartista Creativo');
  else roles.push('Giocatore Polivalente');

  return { position: finalPos, roles };
}

/**
 * Helper to check if a string is a valid player name (and not a CSV header or section title)
 */
const HEADER_KEYWORDS = new Set([
  'name', 'nome', 'player', 'giocatore', 'target', 'id', 'personal information',
  'informazioni personali', 'ability', 'abilità', 'abilita', 'reputation', 'reputazione',
  'gk attributes', 'attributi portiere', 'technical attributes', 'attributi tecnici',
  'mental attributes', 'attributi mentali', 'physical attributes', 'attributi fisici',
  'hidden attributes', 'attributi nascosti', 'personality attributes', 'posizioni',
  'positions', 'ca', 'pa', 'difference', 'differenza', 'height', 'altezza', 'value', 'valore',
  'price', 'prezzo', 'nation', 'nazione', 'born', 'nascita', 'age', 'eta', 'età'
]);

export function isValidPlayerName(name: string): boolean {
  if (!name) return false;
  const sanitized = sanitizePlayerName(name);
  if (sanitized.length === 0) return false;
  const clean = sanitized.toLowerCase().trim();
  if (HEADER_KEYWORDS.has(clean)) return false;
  if (clean.startsWith('giocatore #') || clean.startsWith('obiettivi #') || clean.startsWith('target #')) return false;
  if (/^[0-9\s;,.-]+$/.test(clean)) return false; // purely numbers or symbols
  return true;
}

/**
 * Parser for section-based Football Manager export files (Genie Scout / FM Scout export format)
 */
function parseSectionedFmExport(text: string, currentDate?: string): ParsedCsvResult | null {
  const normalizedText = normalizeCsvInput(text);
  const lowerText = normalizedText.toLowerCase();
  const currentYear = extractCurrentYear(currentDate);

  const isSecTitle = (str: string): string | null => {
    const clean = str.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
    if (!clean) return null;
    if (clean.startsWith('personal') || clean.startsWith('informazion')) return 'personal information';
    if (clean.startsWith('ability') || clean.startsWith('abilita')) return 'ability';
    if (clean.startsWith('reputation') || clean.startsWith('reputazion')) return 'reputation';
    if (clean.startsWith('gk') || clean.startsWith('goalkeep') || clean.startsWith('portiere')) return 'gk attributes';
    if (clean.startsWith('technical') || clean.startsWith('tecnic')) return 'technical attributes';
    if (clean.startsWith('mental')) return 'mental attributes';
    if (clean.startsWith('physical') || clean.startsWith('fisic')) return 'physical attributes';
    if (clean.startsWith('hidden') || clean.startsWith('nascost')) return 'hidden attributes';
    if (clean.startsWith('personality') || clean.startsWith('personalita')) return 'personality attributes';
    if (clean.startsWith('position') || clean.startsWith('posizion') || clean.startsWith('ruol')) return 'positions';
    return null;
  };

  const lines = normalizedText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  let hasKnownSection = false;
  for (const line of lines) {
    if (isSecTitle(line)) {
      hasKnownSection = true;
      break;
    }
  }

  if (!hasKnownSection) return null;

  // Detect delimiter (semicolon, comma, tab)
  let delimiter = ';';
  for (const line of lines) {
    if (line.includes(';') || line.includes(',') || line.includes('\t')) {
      const semicolonCount = (line.match(/;/g) || []).length;
      const commaCount = (line.match(/,/g) || []).length;
      const tabCount = (line.match(/\t/g) || []).length;

      if (semicolonCount >= commaCount && semicolonCount >= tabCount) delimiter = ';';
      else if (tabCount >= commaCount) delimiter = '\t';
      else delimiter = ',';
      break;
    }
  }

  // Parse into section blocks
  interface SectionBlock {
    sectionName: string;
    headers: string[];
    rows: Record<string, string>[];
  }

  const sections: SectionBlock[] = [];
  let currentSection: SectionBlock | null = null;
  let isHeaderLine = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const matchedSec = isSecTitle(line);

    if (matchedSec) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        sectionName: matchedSec,
        headers: [],
        rows: [],
      };
      isHeaderLine = true;
      continue;
    }

    if (currentSection && isHeaderLine) {
      currentSection.headers = splitRow(line, delimiter).map((h) => h.trim());
      isHeaderLine = false;
      continue;
    }

    if (currentSection && !isHeaderLine) {
      const cells = splitRow(line, delimiter);
      if (cells.length > 0 && cells.some((c) => c !== '')) {
        const rowObj: Record<string, string> = {};
        currentSection.headers.forEach((h, idx) => {
          rowObj[h] = cells[idx] || '';
        });
        currentSection.rows.push(rowObj);
      }
    }
  }
  if (currentSection) {
    sections.push(currentSection);
  }

  // Find section containing player names
  const personalSec = sections.find((s) => s.sectionName.includes('personal')) || sections[0];
  if (!personalSec || personalSec.rows.length === 0) return null;

  // Helper to get field across sections for a specific player row index
  const getSecRowField = (secNameKey: string, rowIndex: number, fieldKeys: string[], fallback = ''): string => {
    const sec = sections.find((s) => s.sectionName.includes(secNameKey));
    if (!sec || !sec.rows[rowIndex]) return fallback;
    const row = sec.rows[rowIndex];
    for (const key of Object.keys(row)) {
      if (fieldKeys.some((fk) => key.toLowerCase().includes(fk))) {
        return row[key] || fallback;
      }
    }
    return fallback;
  };

  const getSecRowNumericMap = (secNameKeys: string | string[], rowIndex: number): Record<string, number> => {
    const keys = Array.isArray(secNameKeys) ? secNameKeys : [secNameKeys];
    const sec = sections.find((s) => keys.some((k) => s.sectionName.toLowerCase().includes(k.toLowerCase())));
    if (!sec || !sec.rows[rowIndex]) return {};
    const row = sec.rows[rowIndex];
    const res: Record<string, number> = {};
    for (const [k, v] of Object.entries(row)) {
      if (k.toLowerCase() === 'id') continue;
      const num = parseInt(v.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(num)) {
        res[k] = num;
      }
    }
    return res;
  };

  const parsedPlayers: Player[] = [];
  const parsedTargets: ScoutingTarget[] = [];

  for (let idx = 0; idx < personalSec.rows.length; idx++) {
    const rawName = getSecRowField('personal', idx, ['name', 'nome', 'giocatore', 'player'], '');
    if (!isValidPlayerName(rawName)) continue; // Skip non-player or header rows

    const name = sanitizePlayerName(rawName);
    const nation = getSecRowField('personal', idx, ['nation', 'nat', 'nazionalita'], 'Inghilterra');
    const born = getSecRowField('personal', idx, ['born', 'nascita', 'data di nascita', 'data nascita', 'dob'], '');
    const directAgeStr = getSecRowField('personal', idx, ['age', 'eta', 'età', 'anni'], '');
    const age = directAgeStr
      ? parseAge(directAgeStr, 22, currentYear)
      : born
      ? parseAge(born, 22, currentYear)
      : 22;
    const birthYear = parseBirthYear(born, currentYear) || (currentYear - age);
    const birthDate = born || undefined;
    const height = parseInt(getSecRowField('personal', idx, ['height', 'altezza'], '185').replace(/[^0-9]/g, ''), 10) || 185;
    const rawVal = getSecRowField('personal', idx, ['value', 'valore', 'prezzo'], '15000000');
    const value = formatCurrency(rawVal);

    const ca = parseInt(getSecRowField('ability', idx, ['ca', 'current'], '140').replace(/[^0-9]/g, ''), 10) || 140;
    const pa = parseInt(getSecRowField('ability', idx, ['pa', 'potential'], '165').replace(/[^0-9]/g, ''), 10) || 165;

    const goalkeeping = getSecRowNumericMap(['gk', 'goalkeep', 'portier', 'porta'], idx);
    const technical = getSecRowNumericMap(['technical', 'tecnic'], idx);
    const mental = getSecRowNumericMap(['mental'], idx);
    const physical = getSecRowNumericMap(['physical', 'fisic'], idx);
    const personality = getSecRowNumericMap(['personality', 'personalit'], idx);
    const positionsDetail = getSecRowNumericMap(['positions', 'posizion'], idx);

    const { position, roles } = derivePositionAndRoles(positionsDetail, 'CC');

    // Homegrown status detection
    let homegrown: HomegrownStatus = 'HG Nazione (3 anni in UK)';
    if (nation.toLowerCase().includes('inghilterra') || nation.toLowerCase().includes('england')) {
      homegrown = 'HG Nazione (3 anni in UK)';
    } else if (age <= 21) {
      homegrown = 'HG Club (3 anni in club)';
    } else {
      homegrown = 'Straniero / Non-HG';
    }

    // Build Player
    parsedPlayers.push({
      id: `fm_p_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${idx}`,
      name,
      number: idx + 1,
      position,
      bestRoles: roles,
      age,
      birthYear,
      birthDate: born,
      nationality: nation,
      morale: ca > 150 ? 'Superbo' : 'Eccellente',
      matchLoad: 'Medio',
      homegrown,
      championsLeagueRegistered: true,
      isInjured: false,
      notes: `Importato da FM Scout (CA: ${ca} / PA: ${pa} • Altezza: ${height}cm)`,
      isKeyPlayer: idx < 11,
      ca,
      pa,
      height,
      value,
      goalkeepingAttributes: Object.keys(goalkeeping).length > 0 ? goalkeeping : undefined,
      technicalAttributes: Object.keys(technical).length > 0 ? technical : undefined,
      mentalAttributes: Object.keys(mental).length > 0 ? mental : undefined,
      physicalAttributes: Object.keys(physical).length > 0 ? physical : undefined,
      personalityAttributes: Object.keys(personality).length > 0 ? personality : undefined,
      positionsDetail,
    });

    // Build Scouting Target
    let priority: 'Priorità Alta (Gennaio)' | 'Monitorare' | 'Piano B' = 'Priorità Alta (Gennaio)';
    if (ca >= 150 || pa >= 165) priority = 'Priorità Alta (Gennaio)';
    else if (pa >= 150) priority = 'Monitorare';
    else priority = 'Piano B';

    const starRating = Math.min(5, Math.max(1, Math.round((pa / 200) * 5)));

    parsedTargets.push({
      id: `fm_t_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${idx}`,
      name,
      currentClub: 'Club Attuale',
      age,
      birthYear,
      birthDate: born || undefined,
      position,
      roles,
      estimatedValue: value,
      weeklyWage: `${Math.round((ca * 400) / 1000)}k/sett`,
      homegrown,
      rating: starRating,
      priority,
      notes: `Report FM (CA: ${ca} / PA: ${pa} • Valutazione Potenziale ${starRating} Stelle)`,
      ca,
      pa,
      height,
      goalkeepingAttributes: Object.keys(goalkeeping).length > 0 ? goalkeeping : undefined,
      technicalAttributes: Object.keys(technical).length > 0 ? technical : undefined,
      mentalAttributes: Object.keys(mental).length > 0 ? mental : undefined,
      physicalAttributes: Object.keys(physical).length > 0 ? physical : undefined,
      personalityAttributes: Object.keys(personality).length > 0 ? personality : undefined,
      positionsDetail,
    });
  }

  if (parsedPlayers.length === 0) return null;

  return {
    headers: ['Name', 'Nation', 'Born', 'CA', 'PA', 'Positions', 'Attributes'],
    rawRows: [],
    detectedType: 'squad',
    parsedPlayers,
    parsedTargets,
  };
}

// Comprehensive Football Manager attribute definitions (English, Italian, and common abbreviations)
export const TECHNICAL_DEFINITIONS: Record<string, string[]> = {
  Corners: ['corners', 'corner', 'calcidangolo', 'calcidangoli', 'angoli', 'cor'],
  Crossing: ['crossing', 'cross', 'cro'],
  Dribbling: ['dribbling', 'dribble', 'dri'],
  Finishing: ['finishing', 'finalizzazione', 'fin'],
  FirstTouch: ['firsttouch', 'first touch', 'primo tocco', 'primotocco', 'controllo', 'fir'],
  FreeKicks: ['freekicks', 'free kick', 'free kicks', 'calci piazzati', 'calcipiazzati', 'punizioni', 'fre', 'fk'],
  Heading: ['heading', 'colpo di testa', 'colpoditesta', 'testa', 'hea'],
  LongShots: ['longshots', 'long shots', 'tiri da fuori', 'tiridafuori', 'tiri da lontano', 'tiridalontano', 'lon', 'ls'],
  LongThrows: ['longthrows', 'long throws', 'rimesse lunghe', 'rimesselunghe', 'lth'],
  Marking: ['marking', 'marcatura', 'mar'],
  Passing: ['passing', 'passaggi', 'pas'],
  PenaltyTaking: ['penaltytaking', 'penalties', 'rigori', 'pen'],
  Tackling: ['tackling', 'contrasti', 'tac'],
  Technique: ['technique', 'tecnica', 'tec'],
};

export const MENTAL_DEFINITIONS: Record<string, string[]> = {
  Aggression: ['aggression', 'aggressività', 'aggressivita', 'agg'],
  Anticipation: ['anticipation', 'anticipazione', 'anticipo', 'ant'],
  Bravery: ['bravery', 'coraggio', 'bra'],
  Composure: ['composure', 'freddezza', 'compostezza', 'cmp', 'com'],
  Concentration: ['concentration', 'concentrazione', 'cnt', 'con'],
  Decisions: ['decisions', 'decisioni', 'dec'],
  Determination: ['determination', 'determinazione', 'det'],
  Flair: ['flair', 'fantasia', 'estro', 'fla'],
  Leadership: ['leadership', 'carisma', 'ldr', 'lea'],
  OffTheBall: ['offtheball', 'off the ball', 'senza palla', 'senzapalla', 'movimento', 'otb'],
  Positioning: ['positioning', 'posizionamento', 'posizione', 'pos'],
  Teamwork: ['teamwork', 'gioco di squadra', 'giocodisquadra', 'tea'],
  Vision: ['vision', 'visione di gioco', 'visionedigioco', 'visione', 'vis'],
  WorkRate: ['workrate', 'work rate', 'impegno', 'wor'],
};

export const PHYSICAL_DEFINITIONS: Record<string, string[]> = {
  Acceleration: ['acceleration', 'accelerazione', 'acc'],
  Agility: ['agility', 'agilità', 'agilita', 'agi'],
  Balance: ['balance', 'equilibrio', 'bal'],
  JumpingReach: ['jumpingreach', 'jumping reach', 'jumping', 'elevazione', 'salto', 'jum', 'jr'],
  NaturalFitness: ['naturalfitness', 'natural fitness', 'integrità fisica', 'integritafisica', 'forma', 'nat', 'fit'],
  Pace: ['pace', 'velocità', 'velocita', 'pac'],
  Stamina: ['stamina', 'resistenza', 'sta'],
  Strength: ['strength', 'forza', 'str'],
};

export const GOALKEEPING_DEFINITIONS: Record<string, string[]> = {
  AerialReach: ['aerialreach', 'aerial reach', 'aerialability', 'aerial ability', 'presa alta', 'presaalta', 'aer'],
  CommandOfArea: ['commandofarea', 'command of area', "comando dell'area", 'comandoarea', 'com'],
  Communication: ['communication', 'comunicazione', 'cmn'],
  Eccentricity: ['eccentricity', 'eccentricità', 'eccentricita', 'ecc'],
  Handling: ['handling', 'presa', 'prese', 'han'],
  Kicking: ['kicking', 'rinvii', 'calci', 'kic'],
  OneOnOnes: ['oneonones', 'one on ones', '1v1', 'uno contro uno', 'unocontrouno', 'one'],
  Reflexes: ['reflexes', 'riflessi', 'ref'],
  RushingOut: ['rushingout', 'rushing out', 'uscite', 'rus'],
  TendencyToPunch: ['tendencytopunch', 'tendency to punch', 'tendenza alla respinta', 'tendenza al pugno', 'tendenzapugno', 'pun'],
  Throwing: ['throwing', 'rimesse con le mani', 'rimesse', 'thr'],
};

export const PERSONALITY_DEFINITIONS: Record<string, string[]> = {
  Ambition: ['ambition', 'ambizione', 'amb'],
  Loyalty: ['loyalty', 'fedeltà', 'fedelta', 'loy'],
  Pressure: ['pressure', 'pressione', 'pres'],
  Professionalism: ['professionalism', 'professionalità', 'professionalita', 'professional', 'prof'],
  Sportsmanship: ['sportsmanship', 'sportività', 'sportivita', 'spo'],
  Temperament: ['temperament', 'temperamento', 'temp'],
  Consistency: ['consistency', 'costanza', 'con'],
  Dirtiness: ['dirtiness', 'sporcizia', 'cattiveria'],
  ImportantMatches: ['importantmatches', 'important matches', 'partite importanti', 'partiteimportanti', 'imp'],
  InjuryProneness: ['injuryproneness', 'injury proneness', 'propensione infortuni', 'infortuni', 'inj'],
  Versatility: ['versatility', 'versatilità', 'versatilita', 'ver'],
  Adaptability: ['adaptability', 'adattabilità', 'adattabilita', 'ada'],
};

export const POSITIONS_DEFINITIONS: Record<string, string[]> = {
  GK: ['gk', 'por', 'portiere', 'goalkeeper'],
  DR: ['dr', 'td', 'terzinodestro', 'defenderright'],
  DL: ['dl', 'ts', 'terzinosinistro', 'defenderleft'],
  DC: ['dc', 'difensorecentrale', 'defendercentral'],
  WBR: ['wbr', 'cdd', 'fluidificantedestro', 'wingbackright'],
  WBL: ['wbl', 'cds', 'fluidificantesinistro', 'wingbackleft'],
  DM: ['dm', 'med', 'mediano', 'defensivemidfielder'],
  MC: ['mc', 'cc', 'centrocampistacentrale', 'midfieldercentral'],
  MR: ['mr', 'cd', 'centrocampistadestro', 'midfielderright'],
  ML: ['ml', 'cs', 'centrocampistasinistro', 'midfielderleft'],
  AMR: ['amr', 'ad', 'aladestra', 'attackingmidright'],
  AML: ['aml', 'as', 'alasinistra', 'attackingmidleft'],
  AMC: ['amc', 'trq', 'trequartista', 'attackingmidcentral'],
  ST: ['st', 'pc', 'puntacentrale', 'striker', 'punta'],
};

/**
 * Robust main parser for CSV / TSV / Sectioned FM text files
 */
export function parseCsvText(text: string, currentDate?: string): ParsedCsvResult {
  if (!text || text.trim().length === 0) {
    return {
      headers: [],
      rawRows: [],
      detectedType: 'squad',
      parsedPlayers: [],
      parsedTargets: [],
      error: 'Il file appare vuoto o non leggibile.',
    };
  }

  // Pre-normalize input (BOM, HTML entities, curly apostrophes, escaped backslashes, HTML tables)
  const normalizedText = normalizeCsvInput(text);

  // 1. First try parsing as Sectioned Football Manager Export (Genie Scout / FM Scout)
  const sectionedResult = parseSectionedFmExport(normalizedText, currentDate);
  if (sectionedResult && sectionedResult.parsedPlayers.length > 0) {
    return sectionedResult;
  }

  // 2. Otherwise parse as standard Tabular CSV / TSV
  const lines = normalizedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return {
      headers: [],
      rawRows: [],
      detectedType: 'squad',
      parsedPlayers: [],
      parsedTargets: [],
    };
  }

  // Robust delimiter detection by sampling up to first 15 lines
  let semicolonCount = 0;
  let tabCount = 0;
  let commaCount = 0;
  let pipeCount = 0;
  const sampleLines = lines.slice(0, Math.min(15, lines.length));
  for (const line of sampleLines) {
    semicolonCount += (line.match(/;/g) || []).length;
    tabCount += (line.match(/\t/g) || []).length;
    commaCount += (line.match(/,/g) || []).length;
    pipeCount += (line.match(/\|/g) || []).length;
  }

  let delimiter = ',';
  if (semicolonCount >= commaCount && semicolonCount >= tabCount && semicolonCount >= pipeCount && semicolonCount > 0) {
    delimiter = ';';
  } else if (tabCount >= commaCount && tabCount >= semicolonCount && tabCount >= pipeCount && tabCount > 0) {
    delimiter = '\t';
  } else if (pipeCount >= commaCount && pipeCount >= semicolonCount && pipeCount > 0) {
    delimiter = '|';
  } else {
    delimiter = ',';
  }

  // Find header row index (first row containing standard header indicators)
  let headerRowIndex = 0;
  const HEADER_IDENTIFIERS = ['name', 'nome', 'player', 'giocatore', 'pos', 'ruolo', 'age', 'eta', 'id', 'club', 'team'];
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const tokens = splitRow(lines[i], delimiter).map((t) => t.toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (tokens.some((t) => HEADER_IDENTIFIERS.includes(t))) {
      headerRowIndex = i;
      break;
    }
  }

  const headers = splitRow(lines[headerRowIndex], delimiter).map((h) => h.toLowerCase().trim());
  const rawHeadersOriginal = splitRow(lines[headerRowIndex], delimiter);

  const rawRows: Record<string, string>[] = [];
  for (let i = headerRowIndex + 1; i < lines.length; i++) {
    const cells = splitRow(lines[i], delimiter);
    if (cells.length === 0 || (cells.length === 1 && cells[0] === '')) continue;

    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = cells[idx] || '';
    });
    rawRows.push(rowObj);
  }

  // Detect type: Scouting if headers contain club/squadra/valore/prezzo/weekly/ingaggio/rating/stelle or priority
  const headerKeysStr = headers.join(' ');
  const isScouting =
    headerKeysStr.includes('club') ||
    headerKeysStr.includes('squadra') ||
    headerKeysStr.includes('stima') ||
    headerKeysStr.includes('valore') ||
    headerKeysStr.includes('ingaggio') ||
    headerKeysStr.includes('stelle') ||
    headerKeysStr.includes('priority') ||
    headerKeysStr.includes('priorita');

  const detectedType: 'squad' | 'scouting' = isScouting ? 'scouting' : 'squad';

  // Helper getters for row fields
  const getField = (row: Record<string, string>, keywords: string[], fallback = ''): string => {
    for (const key of Object.keys(row)) {
      if (keywords.some((kw) => key.includes(kw))) {
        return row[key] || fallback;
      }
    }
    return fallback;
  };

  const getNumField = (row: Record<string, string>, keywords: string[], fallback: number): number => {
    const val = getField(row, keywords, '');
    const cleanVal = val.replace(/[^0-9]/g, '');
    if (!cleanVal) return fallback;
    const num = parseInt(cleanVal, 10);
    return isNaN(num) ? fallback : num;
  };

  // Extract individual FM attributes if present in standard tabular format
  const extractAttributeMap = (row: Record<string, string>, defs: Record<string, string[]>): Record<string, number> => {
    const res: Record<string, number> = {};
    const rowKeys = Object.keys(row);
    
    for (const [attrName, aliases] of Object.entries(defs)) {
      for (const rk of rowKeys) {
        const cleanRk = rk.toLowerCase().replace(/[^a-z0-9]/g, '');
        const matched = aliases.some((alias) => {
          const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (cleanRk === cleanAlias) return true;
          if (cleanAlias.length >= 4 && (cleanRk.startsWith(cleanAlias) || cleanRk.includes(cleanAlias))) return true;
          return false;
        });

        if (matched) {
          const rawVal = row[rk];
          if (rawVal !== undefined && rawVal !== '') {
            const cleanNum = rawVal.replace(/[^0-9]/g, '');
            if (cleanNum) {
              const num = parseInt(cleanNum, 10);
              if (!isNaN(num) && num >= 1 && num <= 20) {
                res[attrName] = num;
                break;
              }
            }
          }
        }
      }
    }
    return res;
  };

  // Build Parsed Players
  const parsedPlayers: Player[] = [];
  rawRows.forEach((row, idx) => {
    const rawName = getField(row, ['name', 'nome', 'giocatore', 'player'], '');
    if (!isValidPlayerName(rawName)) return;

    const name = sanitizePlayerName(rawName);
    const number = getNumField(row, ['number', 'numero', 'maglia', '#'], idx + 1);
    const position = getField(row, ['position', 'pos', 'ruolo'], 'CC');
    const directAgeRaw = getField(row, ['eta', 'età', 'age', 'anni'], '');
    const dobRaw = getField(row, ['data_nascita', 'data di nascita', 'data nascita', 'nascita', 'born', 'dob', 'birth'], '');
    const currentYear = extractCurrentYear(currentDate);

    let age = 24;
    let birthYear: number | undefined;
    const birthDate: string | undefined = dobRaw || (directAgeRaw ? undefined : undefined);

    if (directAgeRaw) {
      age = parseAge(directAgeRaw, 24, currentYear);
      birthYear = currentYear - age;
    }
    if (dobRaw) {
      const parsedBy = parseBirthYear(dobRaw, currentYear);
      if (parsedBy) {
        birthYear = parsedBy;
        if (!directAgeRaw) {
          age = Math.max(14, currentYear - birthYear);
        }
      }
    }
    if (!birthYear) {
      birthYear = currentYear - age;
    }
    const nationality = getField(row, ['nation', 'nat', 'nazionalita', 'nazionalitá'], 'Inghilterra');
    const injuredRaw = getField(row, ['infortun', 'injur', 'indisponibil', 'inf'], '');
    const isInjured = /true|si|sì|yes|1|inf|infortunato|rotto/i.test(injuredRaw);
    const injuryNote = isInjured ? getField(row, ['noteinfortun', 'injurynote', 'infortunio'], '') : undefined;
    const loanRaw = getField(row, ['loan', 'prestito', 'inprestito', 'onloan', 'prestitoclub', 'clubprestito'], '');
    const isOnLoan = /true|si|sì|yes|1|prestito|loan|in prestito|on loan/i.test(loanRaw);
    const loanClub = isOnLoan
      ? getField(row, ['clubprestito', 'loanclub', 'prestito_a', 'destinazioneprestito', 'club_prestito'], '') ||
        (!['true', 'si', 'sì', 'yes', '1', 'prestito', 'loan'].includes(loanRaw.toLowerCase()) ? loanRaw : undefined)
      : undefined;
    const staffRaw = getField(row, ['staff', 'giocatorestaff', 'playerstaff', 'quadri', 'collaboratore'], '');
    const isPlayerStaff = /true|si|sì|yes|1|staff|collaboratore|mentore/i.test(staffRaw);
    const staffRole = isPlayerStaff ? getField(row, ['ruolostaff', 'staffrole', 'mansione', 'ruolosocietario'], 'Collaboratore Tecnico') : undefined;
    const moraleRaw = getField(row, ['morale', 'status'], 'Buono');
    const homegrownRaw = getField(row, ['homegrown', 'hg', 'vivaio'], 'HG Nazione (3 anni in UK)');
    const notes = getField(row, ['note', 'notes', 'appunti', 'commento'], '');
    const rolesRaw = getField(row, ['role', 'ruoli', 'bestrole', 'mansion'], '');

    const ca = getNumField(row, ['ca', 'currentability', 'ability'], 140);
    const pa = getNumField(row, ['pa', 'potentialability', 'potenziale'], 165);
    const height = getNumField(row, ['height', 'altezza'], 185);
    const rawVal = getField(row, ['value', 'valore', 'prezzo'], '€15M');
    const value = formatCurrency(rawVal);

    const gk = extractAttributeMap(row, GOALKEEPING_DEFINITIONS);
    const tech = extractAttributeMap(row, TECHNICAL_DEFINITIONS);
    const mental = extractAttributeMap(row, MENTAL_DEFINITIONS);
    const phys = extractAttributeMap(row, PHYSICAL_DEFINITIONS);
    const personality = extractAttributeMap(row, PERSONALITY_DEFINITIONS);
    const positionsDetail = extractAttributeMap(row, POSITIONS_DEFINITIONS);

    let morale: MoraleLevel = 'Buono';
    if (/superb|superbo/i.test(moraleRaw)) morale = 'Superbo';
    else if (/excel|eccell/i.test(moraleRaw)) morale = 'Eccellente';
    else if (/good|buon/i.test(moraleRaw)) morale = 'Buono';
    else if (/neutr/i.test(moraleRaw)) morale = 'Neutro';
    else if (/poor|inquiet|scars/i.test(moraleRaw)) morale = 'Inquieto';

    let matchLoad: MatchLoadLevel = 'Medio';

    let homegrown: HomegrownStatus = 'HG Nazione (3 anni in UK)';
    if (/club/i.test(homegrownRaw)) homegrown = 'HG Club (3 anni in club)';
    else if (/non-hg|stranier|foreign/i.test(homegrownRaw)) homegrown = 'Straniero / Non-HG';

    const rolesArr = rolesRaw ? rolesRaw.split(/[,/|]/).map((r) => r.trim()) : [position];

    parsedPlayers.push({
      id: `csv_p_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${idx}`,
      name,
      number,
      position,
      bestRoles: rolesArr,
      age,
      birthYear,
      birthDate,
      nationality,
      isInjured,
      injuryNote,
      isOnLoan,
      loanClub,
      isPlayerStaff,
      staffRole,
      morale,
      matchLoad,
      homegrown,
      championsLeagueRegistered: true,
      notes,
      isKeyPlayer: idx < 11,
      ca,
      pa,
      height,
      value,
      goalkeepingAttributes: Object.keys(gk).length > 0 ? gk : undefined,
      technicalAttributes: Object.keys(tech).length > 0 ? tech : undefined,
      mentalAttributes: Object.keys(mental).length > 0 ? mental : undefined,
      physicalAttributes: Object.keys(phys).length > 0 ? phys : undefined,
      personalityAttributes: Object.keys(personality).length > 0 ? personality : undefined,
      positionsDetail: Object.keys(positionsDetail).length > 0 ? positionsDetail : undefined,
    });
  });

  // Build Parsed Targets
  const parsedTargets: ScoutingTarget[] = [];
  rawRows.forEach((row, idx) => {
    const rawName = getField(row, ['name', 'nome', 'giocatore', 'target'], '');
    if (!isValidPlayerName(rawName)) return;

    const name = sanitizePlayerName(rawName);
    const currentClub = getField(row, ['club', 'squadra', 'currentclub', 'team'], 'Svincolato / Club');
    const directAgeRaw = getField(row, ['eta', 'età', 'age', 'anni'], '');
    const dobRaw = getField(row, ['data_nascita', 'data di nascita', 'data nascita', 'nascita', 'born', 'dob', 'birth'], '');
    const currentYear = extractCurrentYear(currentDate);

    let age = 21;
    let birthYear: number | undefined;
    const birthDate: string | undefined = dobRaw || (directAgeRaw ? undefined : undefined);

    if (directAgeRaw) {
      age = parseAge(directAgeRaw, 21, currentYear);
      birthYear = currentYear - age;
    }
    if (dobRaw) {
      const parsedBy = parseBirthYear(dobRaw, currentYear);
      if (parsedBy) {
        birthYear = parsedBy;
        if (!directAgeRaw) {
          age = Math.max(14, currentYear - birthYear);
        }
      }
    }
    if (!birthYear) {
      birthYear = currentYear - age;
    }
    const position = getField(row, ['position', 'pos', 'ruolo'], 'CC');
    const rolesRaw = getField(row, ['role', 'ruoli', 'bestrole'], 'Centrocampista');
    const estimatedValue = formatCurrency(getField(row, ['value', 'valore', 'prezzo', 'costo'], '€15M'));
    const weeklyWage = getField(row, ['wage', 'ingaggio', 'stipendio'], '€30k/sett');
    const ratingNum = getNumField(row, ['rating', 'stelle', 'valutazione', 'star'], 4);
    const priorityRaw = getField(row, ['priority', 'priorita', 'priorità'], 'Priorità Alta (Gennaio)');
    const homegrownRaw = getField(row, ['homegrown', 'hg', 'vivaio'], 'HG Nazione (3 anni in UK)');
    const notes = getField(row, ['note', 'notes', 'appunti', 'report'], '');

    const ca = getNumField(row, ['ca', 'currentability', 'ability'], 140);
    const pa = getNumField(row, ['pa', 'potentialability', 'potenziale'], 165);
    const height = getNumField(row, ['height', 'altezza'], 185);

    const gk = extractAttributeMap(row, GOALKEEPING_DEFINITIONS);
    const tech = extractAttributeMap(row, TECHNICAL_DEFINITIONS);
    const mental = extractAttributeMap(row, MENTAL_DEFINITIONS);
    const phys = extractAttributeMap(row, PHYSICAL_DEFINITIONS);
    const personality = extractAttributeMap(row, PERSONALITY_DEFINITIONS);
    const positionsDetail = extractAttributeMap(row, POSITIONS_DEFINITIONS);

    let priority: 'Priorità Alta (Gennaio)' | 'Monitorare' | 'Piano B' = 'Priorità Alta (Gennaio)';
    if (/monit/i.test(priorityRaw)) priority = 'Monitorare';
    else if (/b/i.test(priorityRaw) || /second/i.test(priorityRaw)) priority = 'Piano B';

    let homegrown: HomegrownStatus = 'HG Nazione (3 anni in UK)';
    if (/club/i.test(homegrownRaw)) homegrown = 'HG Club (3 anni in club)';
    else if (/stranier|non-hg|foreign/i.test(homegrownRaw)) homegrown = 'Straniero / Non-HG';

    parsedTargets.push({
      id: `csv_t_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${idx}`,
      name,
      currentClub,
      age,
      birthYear,
      birthDate,
      position,
      roles: rolesRaw.split(/[,/|]/).map((r) => r.trim()),
      estimatedValue,
      weeklyWage,
      homegrown,
      rating: Math.min(5, Math.max(1, ratingNum)),
      priority,
      notes,
      ca,
      pa,
      height,
      goalkeepingAttributes: Object.keys(gk).length > 0 ? gk : undefined,
      technicalAttributes: Object.keys(tech).length > 0 ? tech : undefined,
      mentalAttributes: Object.keys(mental).length > 0 ? mental : undefined,
      physicalAttributes: Object.keys(phys).length > 0 ? phys : undefined,
      personalityAttributes: Object.keys(personality).length > 0 ? personality : undefined,
      positionsDetail: Object.keys(positionsDetail).length > 0 ? positionsDetail : undefined,
    });
  });

  // Deduplicate players by name
  const playerMap = new Map<string, Player>();
  parsedPlayers.forEach((p) => {
    const key = p.name.toLowerCase().trim();
    if (!playerMap.has(key)) {
      playerMap.set(key, p);
    } else {
      const existing = playerMap.get(key)!;
      playerMap.set(key, {
        ...existing,
        ...p,
        technicalAttributes: { ...(existing.technicalAttributes || {}), ...(p.technicalAttributes || {}) },
        mentalAttributes: { ...(existing.mentalAttributes || {}), ...(p.mentalAttributes || {}) },
        physicalAttributes: { ...(existing.physicalAttributes || {}), ...(p.physicalAttributes || {}) },
        goalkeepingAttributes: { ...(existing.goalkeepingAttributes || {}), ...(p.goalkeepingAttributes || {}) },
        personalityAttributes: { ...(existing.personalityAttributes || {}), ...(p.personalityAttributes || {}) },
        positionsDetail: { ...(existing.positionsDetail || {}), ...(p.positionsDetail || {}) },
      });
    }
  });

  // Deduplicate targets by name
  const targetMap = new Map<string, ScoutingTarget>();
  parsedTargets.forEach((t) => {
    const key = t.name.toLowerCase().trim();
    if (!targetMap.has(key)) {
      targetMap.set(key, t);
    } else {
      const existing = targetMap.get(key)!;
      targetMap.set(key, {
        ...existing,
        ...t,
        technicalAttributes: { ...(existing.technicalAttributes || {}), ...(t.technicalAttributes || {}) },
        mentalAttributes: { ...(existing.mentalAttributes || {}), ...(t.mentalAttributes || {}) },
        physicalAttributes: { ...(existing.physicalAttributes || {}), ...(t.physicalAttributes || {}) },
        goalkeepingAttributes: { ...(existing.goalkeepingAttributes || {}), ...(t.goalkeepingAttributes || {}) },
        personalityAttributes: { ...(existing.personalityAttributes || {}), ...(t.personalityAttributes || {}) },
        positionsDetail: { ...(existing.positionsDetail || {}), ...(t.positionsDetail || {}) },
      });
    }
  });

  return {
    headers: rawHeadersOriginal,
    rawRows,
    detectedType,
    parsedPlayers: Array.from(playerMap.values()),
    parsedTargets: Array.from(targetMap.values()),
  };
}

/**
 * Generate sample CSV download files matching FM multi-section export format
 */
export function generateSampleCsv(type: 'squad' | 'scouting'): string {
  if (type === 'squad') {
    return `Personal Information
Name;Id;Nation;Born;Height;Value;Price;Int Caps;Int Goals;Sub Caps;Sub Goals
Cristhian Mosquera;2000030816;Inghilterra;27/06/2004;191;63568120€;0;0;16;0
Sandro Tonali;2000010991;Italia;08/05/2000;182;75000000€;0;0;32;2
Wilfried Gnonto;2000021482;Italia;05/11/2003;172;45000000€;0;0;18;5
Evan Ferguson;2000041288;Irlanda;19/10/2004;188;55000000€;0;0;14;6

Ability
CA;PA;Difference
153;169;16
158;172;14
148;166;18
151;175;24

Reputation
Home;World;Current
7043;6682;7868
7800;7500;8200
7100;6800;7600
7300;7100;7900

GK Attributes
Id;Throwing;TendencyToPunch;RushingOut;Reflexes;OneOnOnes;Kicking;Handling;Eccentricity;Communication;CommandOfArea;AerialAbility;
-1;1;2;1;3;2;2;4;3;1;3;2;
-1;1;2;1;3;2;2;4;3;1;3;2;
-1;1;2;1;3;2;2;4;3;1;3;2;
-1;1;2;1;3;2;2;4;3;1;3;2;

Technical Attributes
Id;Technique;Tackling;PenaltyTaking;Passing;Marking;Longthrows;LongShots;Heading;Freekicks;FirstTouch;Finishing;Dribbling;Crossing;Corners;
-1;12;17;8;13;15;11;8;14;6;13;7;12;10;4;
-1;16;16;12;17;15;8;15;11;14;16;11;14;13;15;
-1;15;7;11;13;6;5;12;10;8;15;14;16;14;6;
-1;14;6;14;12;6;5;11;16;7;14;16;13;9;5;

Mental Attributes
Id;Workrate;Teamwork;Positioning;OffTheBall;Leadership;Flair;Determination;Decisions;Vision;Concentration;Composure;Bravery;Anticipation;Aggression;
-1;15;14;13;8;11;11;13;13;14;15;14;13;16;15;
-1;18;17;15;14;16;14;17;16;17;16;16;16;17;16;
-1;16;14;9;16;10;17;15;13;14;13;14;14;15;13;
-1;15;14;8;16;11;13;16;14;13;14;15;15;16;12;

Physical Attributes
Id;Strength;Stamina;RightFoot;Pace;NaturalFitness;LeftFoot;Jumping;Balance;Agility;Acceleration;
-1;15;15;20;17;16;8;16;14;13;14;
-1;16;18;20;15;17;15;13;15;15;15;
-1;11;16;20;18;17;12;10;16;17;18;
-1;16;15;20;15;16;14;16;16;14;15;

Hidden Attributes
Id;Versatility;InjuryProness;ImportantMatches;Dirtiness;Consistency;
-1;12;9;13;9;15;
-1;15;7;16;10;17;
-1;14;8;14;8;15;
-1;13;9;15;7;16;

Personality Attributes
Id;Controversy;Temperament;Sportsmanship;Professional;Pressure;Loyalty;Ambition;Adaptability;
-1;8;11;13;15;15;13;16;14;
-1;6;14;15;17;16;15;17;15;
-1;9;12;14;15;14;13;16;14;
-1;5;15;15;16;15;14;16;15;

Positions
Id;WingBackRight;WingBackLeft;MidfielderRight;MidfielderLeft;MidfielderCentral;DefensiveMidfielder;DefenderRight;DefenderLeft;DefenderCentral;AttackingMidRight;AttackingMidLeft;AttackingMidCentral;Striker;Goalkeeper;
-1;12;10;1;1;1;1;16;12;20;1;1;1;1;1;
-1;1;1;5;5;20;18;1;1;8;10;10;12;1;1;
-1;1;1;12;14;5;1;1;1;1;18;20;14;15;1;
-1;1;1;1;1;1;1;1;1;1;1;1;10;20;1;`;
  } else {
    return `Personal Information
Name;Id;Nation;Born;Height;Value;Price;Int Caps;Int Goals;Sub Caps;Sub Goals
Jobe Bellingham;2000044101;Inghilterra;23/09/2005;191;35000000€;0;0;10;2
Archie Gray;2000045210;Inghilterra;12/03/2006;187;28000000€;0;0;12;1

Ability
CA;PA;Difference
142;178;36
138;175;37

Technical Attributes
Id;Technique;Tackling;PenaltyTaking;Passing;Marking;LongThrows;LongShots;Heading;FreeKicks;FirstTouch;Finishing;Dribbling;Crossing;Corners;
-1;15;11;12;15;10;7;14;14;11;15;14;15;12;11;
-1;14;15;11;16;14;6;12;11;12;15;10;14;13;12;

Mental Attributes
Id;Workrate;Teamwork;Positioning;OffTheBall;Leadership;Flair;Determination;Decisions;Vision;Concentration;Composure;Bravery;Anticipation;Aggression;
-1;16;15;11;15;13;15;16;14;15;13;14;14;14;13;
-1;17;16;15;13;14;13;17;16;15;15;15;16;16;14;

Physical Attributes
Id;Strength;Stamina;RightFoot;Pace;NaturalFitness;LeftFoot;Jumping;Balance;Agility;Acceleration;
-1;14;15;20;14;16;12;15;14;13;14;
-1;13;17;20;15;17;14;12;15;15;15;

Positions
Id;WingBackRight;WingBackLeft;MidfielderRight;MidfielderLeft;MidfielderCentral;DefensiveMidfielder;DefenderRight;DefenderLeft;DefenderCentral;AttackingMidRight;AttackingMidLeft;AttackingMidCentral;Striker;Goalkeeper;
-1;1;1;5;5;20;15;1;1;10;5;5;16;10;1;
-1;14;10;12;10;18;16;20;10;12;8;8;10;1;1;`;
  }
}
