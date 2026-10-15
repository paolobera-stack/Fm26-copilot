/**
 * Utility functions for text normalization and search.
 * Enables diacritics-insensitive and accent-insensitive matching (e.g., 'Güler' matches 'Guler', 'Modrić' matches 'Modric', 'Højlund' matches 'Hojlund').
 */

/**
 * Normalizes text for search comparisons:
 * - lowercase
 * - replaces common European ligatures and non-combining diacritic letters (ø, æ, œ, ß, ł, đ, etc.)
 * - decomposes unicode diacritics via NFD and strips combining marks
 * - trims extra spaces
 */
export function normalizeSearchText(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/ø/g, 'o')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ß/g, 'ss')
    .replace(/ð/g, 'd')
    .replace(/þ/g, 'th')
    .replace(/ł/g, 'l')
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Checks if targetText contains queryText regardless of accents, umlauts, or case.
 * Example: matchesSearch('Arda Güler', 'guler') => true
 */
export function matchesSearch(
  targetText: string | null | undefined,
  queryText: string | null | undefined
): boolean {
  if (!queryText || !queryText.trim()) return true;
  if (!targetText) return false;
  return normalizeSearchText(targetText).includes(normalizeSearchText(queryText));
}
