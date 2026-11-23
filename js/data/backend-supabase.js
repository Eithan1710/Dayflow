// Supabase implementation of the data backend.
// @ts-ignore — resolved by the browser from the CDN (cached by the service worker).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { AUTH_STORAGE_KEY, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, USER_EMAIL_DOMAIN } from '../config.js';
import {
  ACTIVITY_COLUMNS, AppError, CATEGORY_COLUMNS, OVERRIDE_COLUMNS, TASK_COLUMNS,
  normalizeActivity, pick, usernameToEmail,
} from './schema.js';

export function createSupabaseBackend() {
  const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: AUTH_STORAGE_KEY, // isolated from other apps on the same origin
    },
  });

  /** Throws a typed AppError for any Supabase/network failure. */
  function check(res) {
    if (res.error) {
      const e = res.error;
      const msg = String(e.message || '');
      if (/fetch|network|Failed to fetch|Load failed/i.test(msg)) throw new AppError('offline', msg);
      if (e.code === '23505') throw new AppError('duplicate', msg);
      if (e.code === '42501' || e.status === 401 || e.status === 403) throw new AppError('forbidden', msg);
      throw new AppError('server', msg);
    }
    return res.data;
  }

  async function run(promise) {
    try {
      return check(await promise);
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError('offline', String(e && e.message));
    }
  }

  async function membership(userId) {
    const rows = await run(sb.from('df_members').select('username').eq('user_id', userId).limit(1));
    return rows && rows[0] ? rows[0].username : null;
  }

  return {
    kind: 'supabase',

    async getSession() {
      const { data } = await sb.auth.getSession();
      const user = data.session && data.session.user;
      if (!user) return null;
      const username = user.user_metadata && user.user_metadata.username;
      return { userId: user.id, username: username || '' };
    },

    async signIn(username, password) {
      const email = usernameToEmail(username, USER_EMAIL_DOMAIN);
      let res;
      try {
        res = await sb.auth.signInWithPassword({ email, password });
      } catch (e) {
        throw new AppError('offline', String(e && e.message));
      }
      if (res.error) {
        const msg = String(res.error.message || '');
        if (/invalid login credentials|invalid_credentials/i.test(msg) || res.error.status === 400) {
          throw new AppError('bad_credentials', msg);
        }
        if (/fetch|network/i.test(msg)) throw new AppError('offline', msg);
        throw new AppError('server', msg);
      }
      const user = res.data.user;
      const name = await membership(user.id);
      if (!name) {
        await sb.auth.signOut();
        throw new AppError('not_member');
      }
      return { userId: user.id, username: name };
    },

    async signOut() {
      await sb.auth.signOut();
    },

    /** @param {(signedIn: boolean) => void} cb */
    onAuthChange(cb) {
      sb.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') cb(false);
        else if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') cb(!!session);
      });
    },

    async changePassword(password) {
      const res = await sb.auth.updateUser({ password });
      if (res.error) {
        const msg = String(res.error.message || '');
        if (/should be different|same/i.test(msg)) throw new AppError('same_password', msg);
        if (/weak|at least|characters/i.test(msg)) throw new AppError('weak_password', msg);
        throw new AppError('server', msg);
      }
    },

    async bootstrap() {
      await run(sb.rpc('df_bootstrap'));
    },

    async loadProfile() {
      const rows = await run(sb.from('df_profiles').select('id, display_name, theme').limit(1));
      return rows[0] || null;
    },

    async updateProfile(userId, patch) {
      await run(sb.from('df_profiles').update(patch).eq('id', userId));
    },

    async loadCategories() {
      return run(sb.from('df_categories').select('id, name, color, sort_order').order('sort_order').order('name'));
    },

    /** Non-recurring activities overlapping [from, to] plus overrides in that range. */
    async loadRange(from, to) {
      const [acts, ovs] = await Promise.all([
        run(sb.from('df_activities').select('*').is('repeat_freq', null)
          .lte('start_date', to)
          .or(`end_date.gte.${from},and(end_date.is.null,start_date.gte.${from})`)
          .limit(2000)),
        run(sb.from('df_occurrence_overrides').select('activity_id, occurrence_date, completed, cancelled')
          .gte('occurrence_date', from).lte('occurrence_date', to).limit(5000)),
      ]);
      return { activities: acts.map(normalizeActivity), overrides: ovs };
    },

    async loadRecurring() {
      const acts = await run(sb.from('df_activities').select('*').not('repeat_freq', 'is', null).limit(1000));
      return acts.map(normalizeActivity);
    },

    async loadTasks() {
      const [open, done] = await Promise.all([
        run(sb.from('df_tasks').select('*').eq('completed', false).order('created_at').limit(2000)),
        run(sb.from('df_tasks').select('*').eq('completed', true).order('completed_at', { ascending: false }).limit(200)),
      ]);
      return [...open, ...done];
    },

    // Upserts keyed by client-generated ids: retries can never create duplicates.
    async saveActivity(a) {
      await run(sb.from('df_activities').upsert(pick(a, ACTIVITY_COLUMNS), { onConflict: 'id' }));
    },
    async deleteActivity(id) {
      await run(sb.from('df_activities').delete().eq('id', id));
    },
    async saveOverride(o) {
      await run(sb.from('df_occurrence_overrides').upsert(pick(o, OVERRIDE_COLUMNS), { onConflict: 'activity_id,occurrence_date' }));
    },
    async saveTask(t) {
      await run(sb.from('df_tasks').upsert(pick(t, TASK_COLUMNS), { onConflict: 'id' }));
    },
    async deleteTask(id) {
      await run(sb.from('df_tasks').delete().eq('id', id));
    },
    async saveCategory(c) {
      await run(sb.from('df_categories').upsert(pick(c, CATEGORY_COLUMNS), { onConflict: 'id' }));
    },
    async deleteCategory(id) {
      await run(sb.from('df_categories').delete().eq('id', id));
    },
  };
}
