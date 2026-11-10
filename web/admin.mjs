// Public reading/metadata editing and owner-only source management.
// Only a Supabase publishable key is used in the browser; Postgres RLS owns authorization.
const SESSION_KEY = 'bailacue:web:admin-session:v1';

export class BailaCueAdmin {
  constructor() { this.url = ''; this.key = ''; this.session = null; this.isAdmin = false; }

  configure(config = {}) {
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.supabaseUrl || '')) return false;
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.supabasePublishableKey || '')) return false;
    this.url = config.supabaseUrl;
    this.key = config.supabasePublishableKey;
    return true;
  }

  get ready() { return !!(this.url && this.key); }

  /** @param {string} path @param {{method?:string,payload?:any,auth?:boolean,retry?:boolean,headers?:Record<string,string>}} [options] */
  async call(path, { method = 'GET', payload, auth = false, retry = true, headers = {} } = {}) {
    if (!this.ready) throw new Error('BailaCue admin authentication has not been configured.');
    if (auth) await this.ensureSession();
    const response = await fetch(this.url + path, {
      method, cache: 'no-store',
      headers: {
        apikey: this.key,
        ...(auth ? { Authorization: `Bearer ${this.session.access_token}` } : {}),
        ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    if (response.status === 401 && auth && retry) {
      await this.refresh();
      return this.call(path, { method, payload, auth, headers, retry: false });
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(String(data.msg || data.error_description || data.message || data.error || `Request failed (${response.status}).`).slice(0, 240));
    }
    return response.status === 204 || response.headers.get('content-length') === '0' ? null : response.json().catch(() => null);
  }

  store(session) {
    if (!session?.access_token || !session?.refresh_token) throw new Error('Invalid authentication response.');
    this.session = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + (Number(session.expires_in) || 3600),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
  }

  async refresh() {
    if (!this.session?.refresh_token) throw new Error('Please sign in as the BailaCue administrator.');
    const response = await this.call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', payload: { refresh_token: this.session.refresh_token } });
    this.store(response);
  }

  async ensureSession() {
    if (!this.session) throw new Error('Administrator sign-in is required.');
    if (this.session.expires_at <= Math.floor(Date.now() / 1000) + 60) await this.refresh();
  }

  async checkAdmin() {
    const user = await this.call('/auth/v1/user', { auth: true });
    const rows = await this.call(`/rest/v1/bailacue_web_admins?select=user_id&user_id=eq.${encodeURIComponent(user.id)}`, { auth: true });
    this.isAdmin = Array.isArray(rows) && rows.some(row => row.user_id === user.id);
    return this.isAdmin;
  }

  async restore() {
    if (!this.ready) return false;
    try {
      const value = localStorage.getItem(SESSION_KEY);
      if (!value) return false;
      this.session = JSON.parse(value);
      if (!await this.checkAdmin()) this.clear();
    } catch { this.clear(); }
    return this.isAdmin;
  }

  async signIn(email, password) {
    const session = await this.call('/auth/v1/token?grant_type=password', { method: 'POST', payload: { email, password } });
    this.store(session);
    try {
      if (!await this.checkAdmin()) throw new Error('This account is not authorized to edit BailaCue.');
    } catch (error) { this.clear(); throw error; }
    return true;
  }

  clear() { this.session = null; this.isAdmin = false; localStorage.removeItem(SESSION_KEY); }

  async signOut() {
    if (this.session) await this.call('/auth/v1/logout', { method: 'POST', auth: true }).catch(() => {});
    this.clear();
  }

  async readContent(key = '') {
    if (!this.ready) return [];
    const query = new URLSearchParams({ select: 'key,payload', order: 'key.asc' });
    if (key) query.set('key', 'eq.' + key);
    const rows = await this.call('/rest/v1/bailacue_web_content?' + query);
    return Array.isArray(rows) ? rows : [];
  }

  async put(key, payload) {
    if (!this.isAdmin) throw new Error('Only the BailaCue administrator can publish changes.');
    await this.call('/rest/v1/bailacue_web_content?on_conflict=key', {
      method: 'POST', auth: true, payload: [{ key, payload }],
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
  }

  /** Public, bounded metadata edits. No account or session is needed. */
  async patchMetadata(videoId, patch) {
    return this.call('/rest/v1/rpc/bailacue_patch_web_metadata', {
      method: 'POST', payload: { p_video_id: videoId, p_patch: patch },
    });
  }

  async addSharedLabel(name, type, dance) {
    return this.call('/rest/v1/rpc/bailacue_add_web_label', {
      method: 'POST', payload: { p_name: name, p_type: type, p_dance: dance },
    });
  }

  async remove(key) {
    if (!this.isAdmin) throw new Error('Only the BailaCue administrator can remove content.');
    await this.call(`/rest/v1/bailacue_web_content?key=eq.${encodeURIComponent(key)}`, { method: 'DELETE', auth: true, headers: { Prefer: 'return=minimal' } });
  }
}
