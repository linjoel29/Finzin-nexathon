// client.js - Centralized API client for communicating with the Finzin Express backend.
// SECURITY RULES:
// 1. Token storage tradeoff: Token is held in memory and sessionStorage. This prevents cross-tab XSS attacks
//    and persistent disk leakage (unlike localStorage), while surviving tab refreshes; tradeoff is accessibility
//    to malicious scripts executing in the same browser tab context.
// 2. Authorization header: Automatically attaches "Bearer <token>" to every authenticated request.
// 3. Auto-logout: Any 401 Unauthorized automatically wipes the session and triggers auth state reset.
// 4. Safe error handling: Never displays raw backend stack traces or internal database errors.

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

// In-memory token cache (synchronized with sessionStorage)
let inMemoryToken = null;
let unauthorizedCallbacks = [];

// Initialize memory token from sessionStorage on bundle load
try {
  inMemoryToken = sessionStorage.getItem('finzin_token');
} catch (e) {
  inMemoryToken = null;
}

/**
 * Updates the active token in memory and sessionStorage.
 * @param {string|null} token
 */
export function setToken(token) {
  inMemoryToken = token;
  try {
    if (token) {
      sessionStorage.setItem('finzin_token', token);
    } else {
      sessionStorage.removeItem('finzin_token');
    }
  } catch (e) {
    // SessionStorage may be disabled in restricted environments
  }
}

/**
 * Retrieves the current session token.
 * @returns {string|null}
 */
export function getToken() {
  if (inMemoryToken) return inMemoryToken;
  try {
    inMemoryToken = sessionStorage.getItem('finzin_token');
  } catch (e) {
    inMemoryToken = null;
  }
  return inMemoryToken;
}

/**
 * Stores the authenticated user profile in sessionStorage for offline/refresh hydration.
 * @param {object|null} user
 */
export function setStoredUser(user) {
  try {
    if (user) {
      sessionStorage.setItem('finzin_user', JSON.stringify(user));
    } else {
      sessionStorage.removeItem('finzin_user');
    }
  } catch (e) {}
}

/**
 * Retrieves the stored user profile.
 * @returns {object|null}
 */
export function getStoredUser() {
  try {
    const raw = sessionStorage.getItem('finzin_user');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/**
 * Clears all authentication credentials from memory and storage.
 */
export function clearAuth() {
  setToken(null);
  setStoredUser(null);
}

/**
 * Subscribes a listener to 401 Unauthorized events (used by AuthContext for automatic logout).
 * @param {Function} cb
 * @returns {Function} Unsubscribe function
 */
export function onUnauthorized(cb) {
  unauthorizedCallbacks.push(cb);
  return () => {
    unauthorizedCallbacks = unauthorizedCallbacks.filter((fn) => fn !== cb);
  };
}

/**
 * Main fetch wrapper that handles JSON serialization, headers, status codes, and error parsing.
 * @param {string} endpoint - API route (e.g. "/auth/send-otp" or "http://...")
 * @param {object} [options] - Fetch options (method, body, headers, etc.)
 */
export async function apiRequest(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
  const token = getToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const config = {
    ...options,
    headers,
  };

  if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
    config.body = JSON.stringify(config.body);
  }

  let response;
  try {
    response = await fetch(url, config);
  } catch (netErr) {
    // Network drops, CORS preflight rejections, server down
    throw new Error('Unable to connect to Finzin server. Please check your internet or backend connection.');
  }

  // Handle auto-logout on expired or revoked token (401)
  if (response.status === 401) {
    clearAuth();
    unauthorizedCallbacks.forEach((cb) => {
      try {
        cb();
      } catch (e) {}
    });
  }

  // Handle empty responses (like 204 No Content)
  if (response.status === 204) {
    return null;
  }

  let data;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch (parseErr) {
      data = null;
    }
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    // Extract friendly error message from backend AppError structure
    const errorMessage =
      (data && typeof data === 'object' && data.error) ||
      (typeof data === 'string' && data) ||
      `Request failed with status ${response.status}`;
    const error = new Error(errorMessage);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

// REST shorthand utilities
export const api = {
  get: (endpoint, query) => {
    let url = endpoint;
    if (query && Object.keys(query).length > 0) {
      const sp = new URLSearchParams();
      Object.entries(query).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') sp.append(k, v);
      });
      const qs = sp.toString();
      if (qs) url += (url.includes('?') ? '&' : '?') + qs;
    }
    return apiRequest(url, { method: 'GET' });
  },
  post: (endpoint, body) => apiRequest(endpoint, { method: 'POST', body }),
  patch: (endpoint, body) => apiRequest(endpoint, { method: 'PATCH', body }),
  delete: (endpoint) => apiRequest(endpoint, { method: 'DELETE' }),
};
