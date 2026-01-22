/**
 * Performance monitoring - CLS, LCP, Long Tasks
 */

import { getSelector } from '../utils/selector';
import type { CLSEntry, LCPEntry, LongTask } from '../../types';

// Performance buffers
const clsEntries: CLSEntry[] = [];
let lcpEntry: LCPEntry | null = null;
const longTasks: LongTask[] = [];

// Observers
let clsObserver: PerformanceObserver | null = null;
let lcpObserver: PerformanceObserver | null = null;
let longTaskObserver: PerformanceObserver | null = null;

// Whether monitoring is active
let isMonitoring = false;

/**
 * Start CLS (Cumulative Layout Shift) monitoring
 */
function startCLSMonitoring(): void {
  if (!('PerformanceObserver' in window)) return;

  try {
    clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // Type assertion for layout-shift entries
        const layoutShift = entry as PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
          sources?: Array<{
            node?: Node;
            previousRect: DOMRectReadOnly;
            currentRect: DOMRectReadOnly;
          }>;
        };

        // Ignore shifts caused by user input
        if (layoutShift.hadRecentInput) continue;

        const sources = layoutShift.sources?.map(source => ({
          selector: source.node ? getSelector(source.node as Element) : 'unknown',
          previousRect: source.previousRect,
          currentRect: source.currentRect,
        }));

        clsEntries.push({
          value: layoutShift.value,
          sources,
          timestamp: Date.now(),
        });

        // Keep only recent entries
        while (clsEntries.length > 50) {
          clsEntries.shift();
        }
      }
    });

    clsObserver.observe({ type: 'layout-shift', buffered: true });
  } catch (error) {
    console.warn('[AI DevTools] CLS monitoring not supported:', error);
  }
}

/**
 * Start LCP (Largest Contentful Paint) monitoring
 */
function startLCPMonitoring(): void {
  if (!('PerformanceObserver' in window)) return;

  try {
    lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1] as PerformanceEntry & {
        element?: Element;
        startTime: number;
      };

      if (lastEntry) {
        lcpEntry = {
          value: Math.round(lastEntry.startTime),
          element: lastEntry.element ? getSelector(lastEntry.element) : 'unknown',
        };
      }
    });

    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
  } catch (error) {
    console.warn('[AI DevTools] LCP monitoring not supported:', error);
  }
}

/**
 * Start Long Task monitoring
 */
function startLongTaskMonitoring(): void {
  if (!('PerformanceObserver' in window)) return;

  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        longTasks.push({
          duration: Math.round(entry.duration),
          startTime: Math.round(entry.startTime),
        });

        // Keep only recent entries
        while (longTasks.length > 20) {
          longTasks.shift();
        }
      }
    });

    longTaskObserver.observe({ type: 'longtask', buffered: true });
  } catch (error) {
    console.warn('[AI DevTools] Long Task monitoring not supported:', error);
  }
}

/**
 * Start all performance monitoring
 */
export function startPerformanceMonitoring(): void {
  if (isMonitoring) return;

  isMonitoring = true;
  startCLSMonitoring();
  startLCPMonitoring();
  startLongTaskMonitoring();

  console.log('[AI DevTools] Performance monitoring started');
}

/**
 * Stop all performance monitoring
 */
export function stopPerformanceMonitoring(): void {
  if (!isMonitoring) return;

  isMonitoring = false;

  clsObserver?.disconnect();
  lcpObserver?.disconnect();
  longTaskObserver?.disconnect();

  clsObserver = null;
  lcpObserver = null;
  longTaskObserver = null;
}

/**
 * Get all CLS entries
 */
export function getCLSEntries(): CLSEntry[] {
  return [...clsEntries];
}

/**
 * Get total CLS value
 */
export function getTotalCLS(): number {
  return clsEntries.reduce((sum, entry) => sum + entry.value, 0);
}

/**
 * Get CLS summary with affected elements
 */
export function getCLSSummary(): {
  value: number;
  shifts: Array<{ element: string; delta: number }>;
} {
  const shifts: Array<{ element: string; delta: number }> = [];

  for (const entry of clsEntries) {
    if (entry.sources) {
      for (const source of entry.sources) {
        shifts.push({
          element: source.selector,
          delta: entry.value,
        });
      }
    }
  }

  return {
    value: Math.round(getTotalCLS() * 1000) / 1000,
    shifts: shifts.slice(-5), // Last 5 shifts
  };
}

/**
 * Get LCP entry
 */
export function getLCPEntry(): LCPEntry | null {
  return lcpEntry;
}

/**
 * Get long tasks
 */
export function getLongTasks(): LongTask[] {
  return [...longTasks];
}

/**
 * Get performance summary
 */
export function getPerformanceSummary(): {
  lcp: LCPEntry | null;
  cls: { value: number; shifts: Array<{ element: string; delta: number }> };
  longTasks: LongTask[];
} {
  return {
    lcp: lcpEntry,
    cls: getCLSSummary(),
    longTasks: getLongTasks(),
  };
}

/**
 * Clear all performance data
 */
export function clearPerformanceData(): void {
  clsEntries.length = 0;
  lcpEntry = null;
  longTasks.length = 0;
}

/**
 * Check if CLS is problematic (> 0.1 is poor, > 0.25 is very poor)
 */
export function isCLSProblematic(): boolean {
  return getTotalCLS() > 0.1;
}

/**
 * Check if LCP is slow (> 2.5s is poor, > 4s is very poor)
 */
export function isLCPSlow(): boolean {
  return lcpEntry !== null && lcpEntry.value > 2500;
}
