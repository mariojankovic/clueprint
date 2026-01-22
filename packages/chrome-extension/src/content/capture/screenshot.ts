/**
 * Screenshot capture utilities using native APIs
 */

import type { ElementRect } from '../../types';

/**
 * Request screenshot from background script
 */
export async function captureVisibleTab(): Promise<string | null> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'CAPTURE_SCREENSHOT',
    });
    return response?.dataUrl || null;
  } catch (error) {
    console.error('[AI DevTools] Screenshot capture failed:', error);
    return null;
  }
}

/**
 * Crop image data URL to specified region
 */
export async function cropScreenshot(
  dataUrl: string,
  rect: ElementRect,
  padding = 20,
  maxWidth = 800,
  quality = 0.7
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Calculate device pixel ratio for accurate cropping
      const dpr = window.devicePixelRatio || 1;

      // Calculate crop region with padding
      const cropX = Math.max(0, (rect.left - padding) * dpr);
      const cropY = Math.max(0, (rect.top - padding) * dpr);
      const cropWidth = Math.min(
        img.width - cropX,
        (rect.width + padding * 2) * dpr
      );
      const cropHeight = Math.min(
        img.height - cropY,
        (rect.height + padding * 2) * dpr
      );

      // Calculate output dimensions (respect maxWidth)
      let outputWidth = cropWidth / dpr;
      let outputHeight = cropHeight / dpr;

      if (outputWidth > maxWidth) {
        const scale = maxWidth / outputWidth;
        outputWidth = maxWidth;
        outputHeight *= scale;
      }

      // Create canvas and crop
      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(
        img,
        cropX, cropY, cropWidth, cropHeight,
        0, 0, outputWidth, outputHeight
      );

      // Convert to JPEG for smaller size
      const croppedDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(croppedDataUrl);
    };

    img.onerror = () => reject(new Error('Failed to load screenshot'));
    img.src = dataUrl;
  });
}

/**
 * Capture and crop screenshot for an element
 */
export async function captureElementScreenshot(
  element: Element,
  quality = 0.7,
  maxWidth = 800
): Promise<string | null> {
  try {
    // Get element position
    const rect = element.getBoundingClientRect();
    const elementRect: ElementRect = {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      top: Math.round(rect.top + window.scrollY),
      left: Math.round(rect.left + window.scrollX),
    };

    // Capture visible tab
    const fullScreenshot = await captureVisibleTab();
    if (!fullScreenshot) return null;

    // Adjust rect for current scroll position
    const viewportRect: ElementRect = {
      width: rect.width,
      height: rect.height,
      top: rect.top,
      left: rect.left,
    };

    // Crop to element
    const cropped = await cropScreenshot(
      fullScreenshot,
      viewportRect,
      20,
      maxWidth,
      quality
    );

    return cropped;
  } catch (error) {
    console.error('[AI DevTools] Element screenshot failed:', error);
    return null;
  }
}

/**
 * Capture screenshot of a region
 */
export async function captureRegionScreenshot(
  rect: ElementRect,
  quality = 0.7,
  maxWidth = 800
): Promise<string | null> {
  try {
    const fullScreenshot = await captureVisibleTab();
    if (!fullScreenshot) return null;

    const cropped = await cropScreenshot(
      fullScreenshot,
      rect,
      0, // No padding for region
      maxWidth,
      quality
    );

    return cropped;
  } catch (error) {
    console.error('[AI DevTools] Region screenshot failed:', error);
    return null;
  }
}

/**
 * Get base64 data from data URL (strip prefix)
 */
export function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
}

/**
 * Estimate base64 string size in KB
 */
export function estimateBase64Size(base64: string): number {
  // Base64 is roughly 4/3 the size of the original binary
  const bytes = (base64.length * 3) / 4;
  return Math.round(bytes / 1024);
}
