/**
 * Network monitoring via PerformanceObserver
 * Note: Detailed network monitoring (status codes, bodies) requires DevTools panel
 */

import type { NetworkEntry } from '../../types';

// Network buffer
const MAX_BUFFER_SIZE = 100;
const networkBuffer: NetworkEntry[] = [];

// Observer
let resourceObserver: PerformanceObserver | null = null;

// Whether monitoring is active
let isMonitoring = false;

/**
 * Send network event to background for recording
 */
function sendToRecording(entry: NetworkEntry): void {
  // Send the NetworkEntry directly - background expects this format
  chrome.runtime.sendMessage({
    type: 'NETWORK_EVENT',
    payload: entry
  }).catch(() => {
    // Background not available, ignore
  });
}

/**
 * Start network resource monitoring
 */
export function startNetworkMonitoring(): void {
  if (isMonitoring) return;
  if (!('PerformanceObserver' in window)) return;

  isMonitoring = true;

  // Intercept fetch for better network info
  interceptFetch();

  try {
    resourceObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const resource = entry as PerformanceResourceTiming;

        const networkEntry: NetworkEntry = {
          url: resource.name,
          method: 'GET', // PerformanceObserver doesn't provide method
          duration: Math.round(resource.duration),
          transferSize: resource.transferSize,
          initiatorType: resource.initiatorType,
          timestamp: Date.now(),
        };

        networkBuffer.push(networkEntry);

        // Enforce buffer size
        while (networkBuffer.length > MAX_BUFFER_SIZE) {
          networkBuffer.shift();
        }
      }
    });

    resourceObserver.observe({ entryTypes: ['resource'] });
    console.log('[AI DevTools] Network monitoring started');
  } catch (error) {
    console.warn('[AI DevTools] Network monitoring not supported:', error);
  }
}

// Store original fetch
const originalFetch = window.fetch.bind(window);
let fetchIntercepted = false;

/**
 * Intercept fetch to capture status codes
 */
function interceptFetch(): void {
  if (fetchIntercepted) return;
  fetchIntercepted = true;

  window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const startTime = Date.now();
    const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
    const method = args[1]?.method || (typeof args[0] === 'object' ? (args[0] as Request).method : 'GET') || 'GET';

    try {
      const response = await originalFetch(...args);
      const duration = Date.now() - startTime;

      const entry: NetworkEntry = {
        url,
        method: method.toUpperCase(),
        status: response.status,
        statusText: response.statusText,
        duration,
        timestamp: Date.now(),
      };

      // Send to recording
      sendToRecording(entry);

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;

      const entry: NetworkEntry = {
        url,
        method: method.toUpperCase(),
        status: 0,
        statusText: error instanceof Error ? error.message : 'Network Error',
        duration,
        timestamp: Date.now(),
      };

      sendToRecording(entry);
      throw error;
    }
  };
}

/**
 * Restore original fetch
 */
function restoreFetch(): void {
  if (fetchIntercepted) {
    window.fetch = originalFetch;
    fetchIntercepted = false;
  }
}

/**
 * Stop network monitoring
 */
export function stopNetworkMonitoring(): void {
  if (!isMonitoring) return;

  isMonitoring = false;
  resourceObserver?.disconnect();
  resourceObserver = null;
  restoreFetch();
}

/**
 * Get all network entries
 */
export function getNetworkBuffer(): NetworkEntry[] {
  return [...networkBuffer];
}

/**
 * Get network failures (status >= 400)
 * Note: This only works with entries added via addNetworkEntry (from DevTools panel)
 */
export function getNetworkFailures(): NetworkEntry[] {
  return networkBuffer.filter(entry => entry.status && entry.status >= 400);
}

/**
 * Clear network buffer
 */
export function clearNetworkBuffer(): void {
  networkBuffer.length = 0;
}

/**
 * Add network entry manually (used by DevTools panel for full details)
 */
export function addNetworkEntry(entry: NetworkEntry): void {
  // Check for duplicate (same URL within 100ms)
  const recent = networkBuffer.filter(
    e => e.url === entry.url && Math.abs(e.timestamp - entry.timestamp) < 100
  );

  if (recent.length > 0) {
    // Update existing entry with more details
    const existing = recent[0];
    Object.assign(existing, entry);
    return;
  }

  networkBuffer.push(entry);

  // Enforce buffer size
  while (networkBuffer.length > MAX_BUFFER_SIZE) {
    networkBuffer.shift();
  }
}

/**
 * Get requests by type
 */
export function getRequestsByType(type: string): NetworkEntry[] {
  return networkBuffer.filter(entry => entry.initiatorType === type);
}

/**
 * Get slow requests (> 1s)
 */
export function getSlowRequests(): NetworkEntry[] {
  return networkBuffer.filter(entry => entry.duration && entry.duration > 1000);
}

/**
 * Get network summary
 */
export function getNetworkSummary(): {
  total: number;
  failures: number;
  slowRequests: number;
  totalTransferSize: number;
} {
  const failures = getNetworkFailures();
  const slow = getSlowRequests();
  const totalSize = networkBuffer.reduce(
    (sum, entry) => sum + (entry.transferSize || 0),
    0
  );

  return {
    total: networkBuffer.length,
    failures: failures.length,
    slowRequests: slow.length,
    totalTransferSize: totalSize,
  };
}

/**
 * Check if there are network failures
 */
export function hasNetworkFailures(): boolean {
  return getNetworkFailures().length > 0;
}
