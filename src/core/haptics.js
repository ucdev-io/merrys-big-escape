import { getSettings } from './settings.js';

// A little buzz on phones that support it (Android). iPhones don't allow vibration from web pages,
// so this quietly does nothing there.
export function buzz(pattern) {
  try {
    if (navigator.vibrate && getSettings().haptics) navigator.vibrate(pattern);
  } catch { /* not supported */ }
}
