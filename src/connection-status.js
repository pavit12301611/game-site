/**
 * Connection status logic, pure: describes the connection from setup + online flags.
 */

/**
 * @param {{ setup: { status: string, message: string }, online: boolean }} context
 * @returns {{ label: string, detail: string, onlineFeatures: boolean, setupNeeded: boolean, offline: boolean }}
 */
export function describeConnection({ setup, online }) {
  const setupNeeded = setup.status !== 'ok';
  const offline = !online;

  if (setupNeeded) {
    return {
      label: 'Local practice mode',
      detail: setup.message || 'Firebase is not configured.',
      onlineFeatures: false,
      setupNeeded: true,
      offline: false,
    };
  }

  if (offline) {
    return {
      label: 'Offline · local play',
      detail: 'You are offline. Reconnect to use online rooms.',
      onlineFeatures: false,
      setupNeeded: false,
      offline: true,
    };
  }

  return {
    label: 'Online rooms ready',
    detail: '',
    onlineFeatures: true,
    setupNeeded: false,
    offline: false,
  };
}