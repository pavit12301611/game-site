/**
 * Room document shape, shared between browser and backend.
 */

/** @typedef {'waiting'|'playing'|'finished'} RoomStatus */

/**
 * A room is created in 'waiting' state, transitions to 'playing' when started, and 'finished'
 * when a winner is declared or all players leave.
 */

export const MAX_PLAYERS = 3;
export const MIN_PLAYERS = 2;
export const ROOM_CODE_LENGTH = 7;