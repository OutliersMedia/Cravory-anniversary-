import FingerprintJS from '@fingerprintjs/fingerprintjs';
import { getIdbToken, setIdbToken } from './idb.js';

const LOCAL_STORAGE_KEY = 'crv_token';

/**
 * Reads any saved device tokens from localStorage and IndexedDB
 */
export async function getClientStoredTokens(): Promise<string[]> {
  const tokens: string[] = [];
  try {
    const lsToken = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (lsToken) tokens.push(lsToken);
  } catch {
    // LocalStorage might be disabled in strict privacy modes
  }

  try {
    const idbToken = await getIdbToken();
    if (idbToken && !tokens.includes(idbToken)) {
      tokens.push(idbToken);
    }
  } catch {
    // IndexedDB might fail
  }

  return tokens;
}

/**
 * Saves/syncs the server-issued device token across localStorage and IndexedDB
 */
export async function syncClientToken(token: string): Promise<void> {
  if (!token) return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, token);
  } catch {
    // Ignore localStorage errors
  }

  try {
    await setIdbToken(token);
  } catch {
    // Ignore IndexedDB errors
  }
}

/**
 * Collects a composite client-side device fingerprint
 */
export async function collectDeviceFingerprint(): Promise<Record<string, any>> {
  const fp: Record<string, any> = {};

  // 1. Open-source FingerprintJS
  try {
    const fpAgent = await FingerprintJS.load();
    const result = await fpAgent.get();
    fp.visitorId = result.visitorId;
    fp.components = result.components;
  } catch (err) {
    fp.fpjsError = String(err);
  }

  // 2. Canvas fingerprint snippet
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('Cravery1stAnniv,📱', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('Cravery1stAnniv,📱', 4, 17);
      fp.canvas = canvas.toDataURL();
    }
  } catch {
    fp.canvas = null;
  }

  // 3. WebGL vendor & renderer
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (gl) {
      const dbgRenderInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbgRenderInfo) {
        fp.webglVendor = gl.getParameter(dbgRenderInfo.UNMASKED_VENDOR_WEBGL);
        fp.webglRenderer = gl.getParameter(dbgRenderInfo.UNMASKED_RENDERER_WEBGL);
      }
    }
  } catch {
    fp.webglVendor = null;
    fp.webglRenderer = null;
  }

  // 4. Screen and Hardware signals
  try {
    fp.screen = {
      width: window.screen.width,
      height: window.screen.height,
      availWidth: window.screen.availWidth,
      availHeight: window.screen.availHeight,
      colorDepth: window.screen.colorDepth,
      pixelDepth: window.screen.pixelDepth,
    };
    fp.devicePixelRatio = window.devicePixelRatio || 1;
    fp.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    fp.timezoneOffset = new Date().getTimezoneOffset();
    fp.languages = navigator.languages ? Array.from(navigator.languages) : [navigator.language];
    fp.platform = navigator.platform;
    fp.hardwareConcurrency = navigator.hardwareConcurrency || 0;
    fp.maxTouchPoints = navigator.maxTouchPoints || 0;
    fp.deviceMemory = (navigator as any).deviceMemory || 0;
  } catch {
    // Ignore property read errors
  }

  // 5. UserAgentData High Entropy Values (modern Chromium mobile / WebView)
  try {
    const uaData = (navigator as any).userAgentData;
    if (uaData && typeof uaData.getHighEntropyValues === 'function') {
      const highEntropy = await uaData.getHighEntropyValues(['model', 'platformVersion']);
      fp.uaHighEntropy = highEntropy;
    }
  } catch {
    // Not supported in Safari/Firefox
  }

  return fp;
}
