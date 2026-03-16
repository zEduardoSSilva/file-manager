
/**
 * Generates a cache key for the Visão Analítica page.
 * @param year The filter year.
 * @param month The filter month.
 * @returns A unique string key.
 */
export function getAnaliticaCacheKey(year: number, month: number): string {
  return `analitica-entregas-${year}-${month}`;
}

/**
 * Generates a cache key for the Visão Acumulada page.
 * @param year The filter year.
 * @param month The filter month.
 * @returns A unique string key.
 */
export function getAcumuladaCacheKey(year: number, month: number): string {
    return `acumulada-entregas-${year}-${month}`;
}


/**
 * Retrieves data from localStorage.
 * @param key The cache key.
 * @returns The cached data or undefined if not found or on error.
 */
export function getFromCache<T>(key: string): T | undefined {
  try {
    const item = window.localStorage.getItem(key);
    return item ? JSON.parse(item) as T : undefined;
  } catch (error) {
    console.error(`Error reading from localStorage for key "${key}":`, error);
    return undefined;
  }
}

/**
 * Stores data in localStorage.
 * @param key The cache key.
 * @param data The data to store.
 */
export function setInCache<T>(key: string, data: T): void {
  try {
    const item = JSON.stringify(data);
    window.localStorage.setItem(key, item);
  } catch (error) {
    console.error(`Error writing to localStorage for key "${key}":`, error);
  }
}

/**
 * Clears a specific entry from localStorage.
 * @param key The cache key to clear.
 */
export function clearCacheEntry(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.error(`Error removing from localStorage for key "${key}":`, error);
  }
}
