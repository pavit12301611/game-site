/**
 * Private view document shape: the per-player hidden information for a room.
 *
 * The backend writes each player's view as `rooms/{roomId}/views/{uid}`. The browser
 * can only read its own view; Firestore rules enforce this.
 */