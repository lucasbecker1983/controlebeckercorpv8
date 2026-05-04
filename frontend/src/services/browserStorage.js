export function storageGet(key, fallback = '') {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Captive portal browsers can block storage; keep rendering without persistence.
  }
}

export function storageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}
