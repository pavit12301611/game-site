/**
 * Optimistic move replay with bounded idempotency.
 */

const appliedActions = new Set();
const MAX_HISTORY = 100;

/**
 * Records an action as applied (for idempotency).
 * @param {string} clientActionId
 */
export function recordAction(clientActionId) {
  appliedActions.add(clientActionId);
  if (appliedActions.size > MAX_HISTORY) {
    const first = appliedActions.values().next().value;
    appliedActions.delete(first);
  }
}

/**
 * Checks if an action was already applied.
 * @param {string} clientActionId
 * @returns {boolean}
 */
export function isActionApplied(clientActionId) {
  return appliedActions.has(clientActionId);
}

/**
 * Generates a unique action ID.
 * @returns {string}
 */
export function generateActionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}