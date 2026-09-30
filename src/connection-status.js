/**
 * Single source of truth for the connection status shown in the sidebar, top bar, hero,
 * friends page and modals. The status is derived only from two real facts:
 *
 *   1. did the Firebase config parse, validate and initialize? (`setup`, from src/firebase.js)
 *   2. does the browser currently report that it is online?    (`online`, from navigator.onLine)
 *
 * Nothing here is hard-coded to "online". Precedence:
 *
 *   config missing / invalid / failed to initialize -> "Local practice mode"   (online play cannot work)
 *   config fine, but the browser is offline         -> "Offline · local play"
 *   config fine and the browser is online           -> "Online rooms ready"
 *
 * "Online rooms ready" means "Firebase is initialized and the browser is online". It does not
 * prove the Firebase project has its sign-in providers enabled or its rules published; those
 * problems are reported with specific messages (see src/firebase-errors.js) when they are hit,
 * and the setup dialog has an explicit live check.
 */

export const CONNECTION_LABELS = Object.freeze({
  online: 'Online rooms ready',
  offline: 'Offline · local play',
  local: 'Local practice mode',
});

const FALLBACK_SETUP_MESSAGE = 'Firebase config is missing from this deployment. Add the VITE_FIREBASE_* variables (VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_APP_ID …) in Vercel and redeploy.';

/**
 * @param {{ setup?: { status?: string, message?: string, hint?: string }, online?: boolean }} input
 * @returns {{
 *   kind: 'online' | 'offline' | 'local',
 *   label: string,
 *   shortLabel: string,
 *   tone: 'ok' | 'warn' | 'setup',
 *   detail: string,
 *   hint: string,
 *   title: string,
 *   onlineFeatures: boolean,
 *   setupNeeded: boolean,
 * }}
 */
export function describeConnection({ setup, online = true } = {}) {
  const configured = setup?.status === 'ok';

  if (!configured) {
    const detail = setup?.message || FALLBACK_SETUP_MESSAGE;
    return {
      kind: 'local',
      label: CONNECTION_LABELS.local,
      shortLabel: 'LOCAL',
      tone: 'setup',
      detail,
      hint: setup?.hint || '',
      title: `${CONNECTION_LABELS.local}. ${detail}`,
      onlineFeatures: false,
      setupNeeded: true,
    };
  }

  if (!online) {
    const detail = 'Firebase is configured, but this browser is offline. Online rooms come back when you reconnect; local practice still works.';
    return {
      kind: 'offline',
      label: CONNECTION_LABELS.offline,
      shortLabel: 'OFFLINE',
      tone: 'warn',
      detail,
      hint: '',
      title: detail,
      onlineFeatures: false,
      setupNeeded: false,
    };
  }

  const detail = 'Firebase is initialized and this browser is online.';
  return {
    kind: 'online',
    label: CONNECTION_LABELS.online,
    shortLabel: 'ONLINE',
    tone: 'ok',
    detail,
    hint: '',
    title: detail,
    onlineFeatures: true,
    setupNeeded: false,
  };
}
