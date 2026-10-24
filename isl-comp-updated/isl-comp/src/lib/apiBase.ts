/**
 * Base URL of the Samvaad backend (the Express server in /server). The
 * signaling server and the Daily Translator API run in the same process, so
 * by default this is the same URL; set VITE_API_BASE_URL to split them.
 */
export const API_BASE: string = (
  import.meta.env?.VITE_API_BASE_URL ||
  import.meta.env?.VITE_SIGNALING_SERVER_URL ||
  'http://localhost:4000'
).replace(/\/+$/, '');
