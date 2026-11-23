// Public client configuration. The publishable key is safe to ship to the browser:
// every table is protected by Row Level Security and a members allowlist.
export const SUPABASE_URL = 'https://kjfihzskaqcboeejnkak.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_COFa-LU5E_xbskpKMeQFnw_q0PUWq4u';

// Usernames are mapped to synthetic e-mail addresses for Supabase Auth.
export const USER_EMAIL_DOMAIN = 'users.dayflow.local';

// Several apps share the same GitHub Pages origin and Supabase project,
// so every browser storage key used by Dayflow is namespaced.
export const STORAGE_PREFIX = 'dayflow:';
export const AUTH_STORAGE_KEY = 'dayflow-auth';
