import type { FirebaseOptions } from 'firebase/app';

/**
 * Sync configuration. Leave firebaseConfig as null to run local-only (data stays in the browser).
 *
 * To turn on sync and parent viewing:
 *  1. Create a Firebase project, add a Web app, and paste its config object below.
 *  2. Enable Firestore and Google sign-in (see README).
 *  3. List the Google account emails that are allowed to edit. Everyone else sees read-only.
 */
export const firebaseConfig: FirebaseOptions | null = null;

export const editorEmails: string[] = [];

/** All data is stored under teams/{teamId}. One deployment = one team. */
export const teamId = 'default';
