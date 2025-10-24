/**
 * Critical Fix #10: Network Timeout Handling - Frontend
 *
 * Wraps fetch API with timeout using AbortController
 * Provides clear timeout errors for better UX
 */

/**
 * Fetch with timeout using AbortController
 *
 * @param url - URL to fetch
 * @param options - Fetch options
 * @param timeoutMs - Timeout in milliseconds (default: 45000ms / 45s)
 * @returns Promise that resolves with Response or rejects with timeout error
 *
 * @example
 * const response = await fetchWithTimeout('/api/buy', {
 *   method: 'POST',
 *   body: JSON.stringify(data),
 * }, 45000);
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 45000  // 45 seconds for API calls (accounts for backend retries)
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response;

  } catch (error: any) {
    clearTimeout(timeoutId);

    // Check if error was due to abort (timeout)
    if (error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000} seconds`);
    }

    // Re-throw other errors
    throw error;
  }
}

/**
 * Check if an error is a timeout error
 *
 * @param error - Error to check
 * @returns true if error is timeout-related
 */
export function isTimeoutError(error: any): boolean {
  if (!error) return false;

  return (
    error.name === 'AbortError' ||
    error.name === 'TimeoutError' ||
    error.message?.toLowerCase().includes('timed out') ||
    error.message?.toLowerCase().includes('timeout')
  );
}

/**
 * Check if an error is a network error
 *
 * @param error - Error to check
 * @returns true if error is network-related
 */
export function isNetworkError(error: any): boolean {
  if (!error) return false;

  const errorMessage = error.message?.toLowerCase() || '';

  return (
    errorMessage.includes('network') ||
    errorMessage.includes('fetch failed') ||
    errorMessage.includes('failed to fetch') ||
    error.name === 'NetworkError' ||
    error.name === 'TypeError' && errorMessage.includes('fetch')
  );
}

/**
 * Parse error response from API
 *
 * @param response - Response object
 * @returns Parsed error object
 */
export async function parseErrorResponse(response: Response): Promise<{
  error: string;
  code?: string;
  message?: string;
  suggestions?: string[];
  details?: any;
}> {
  try {
    const data = await response.json();
    return data;
  } catch {
    // If response is not JSON, return generic error
    return {
      error: `Request failed with status ${response.status}`,
      message: response.statusText
    };
  }
}
