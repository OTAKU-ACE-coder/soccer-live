const fields = { following: 150, saved: 100 };
const identifier = (field, value) => field === "saved" ? value?.id : value;

function cleanSnapshot(value) {
  return {
    following: (Array.isArray(value?.following) ? value.following : [])
      .filter(item => typeof item === "string" && item.length <= 150).slice(0, fields.following),
    saved: (Array.isArray(value?.saved) ? value.saved : [])
      .filter(item => typeof item?.id === "string" && typeof item.title === "string" &&
        Array.isArray(item.paragraphs) && (!item.teams || Array.isArray(item.teams) && item.teams.every(team => team && typeof team.name === "string")))
      .slice(0, fields.saved),
  };
}

export function preferenceChanges(field, previous, next) {
  const before = new Set(previous.map(item => identifier(field, item)));
  const after = new Set(next.map(item => identifier(field, item)));
  return [
    ...[...before].filter(id => !after.has(id)).map(id => ({ field, id })),
    ...next.filter(item => !before.has(identifier(field, item))).reverse()
      .map(value => ({ field, id: identifier(field, value), value })),
  ];
}

export function applyPreferenceChanges(value, changes) {
  const result = cleanSnapshot(value);
  for (const change of changes) {
    if (!Object.hasOwn(fields, change?.field) || typeof change.id !== "string") continue;
    const { field, id, value } = change;
    result[field] = result[field].filter(item => identifier(field, item) !== id);
    if (value !== undefined && identifier(field, value) === id) result[field].unshift(value);
  }
  return cleanSnapshot(result);
}

export function createPreferenceSync({ storage, apply, status }) {
  let active;

  const save = (account) => {
    try {
      storage().setItem(account.key, JSON.stringify({ base: account.base, pending: account.pending }));
    } catch { /* Changes are still queued in memory. */ }
  };

  function publish(account) {
    apply(applyPreferenceChanges(account.base, account.pending));
  }

  async function reconcile(account) {
    const select = "follows,saved,revision";
    const table = () => account.client.from("soccer_preferences");
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await table().select(select).eq("user_id", account.id).maybeSingle();
      if (active !== account) return;
      if (error) throw error;
      const sent = account.pending.slice();
      const remote = data ? { following: data.follows, saved: data.saved } : account.base;
      const next = applyPreferenceChanges(remote, sent);
      if (!data || sent.length) {
        const row = { follows: next.following, saved: next.saved };
        if (data) {
          const result = await table().update({ ...row, revision: data.revision + 1 })
            .eq("user_id", account.id).eq("revision", data.revision).select("revision").maybeSingle();
          if (active !== account) return;
          if (result.error) throw result.error;
          if (!result.data) continue;
        } else {
          const result = await table().insert({ ...row, user_id: account.id });
          if (active !== account) return;
          if (result.error?.code === "23505") continue;
          if (result.error) throw result.error;
        }
      }
      account.base = next;
      account.pending = account.pending.filter(change => !sent.includes(change));
      save(account);
      publish(account);
      status(account.pending.length ? "Syncing your follows and saved stories…" : "Follows and saved stories synced.");
      return;
    }
    throw new Error("Preferences changed on another device.");
  }

  async function refresh() {
    const account = active;
    if (!account || account.running || account.unavailable) return;
    account.running = true;
    let synced = false;
    try {
      await reconcile(account);
      synced = true;
    } catch (error) {
      if (active !== account) return;
      account.unavailable = ["PGRST205", "42P01"].includes(error?.code);
      status("Sync is unavailable. Your changes are saved on this device.");
    } finally {
      account.running = false;
      if (active === account && synced && account.pending.length) void refresh();
    }
  }

  function connect(client, id, guest) {
    if (id === active?.id) return;
    const key = "soccer-live-account:" + id;
    let cache;
    try { cache = JSON.parse(storage().getItem(key) || "null"); } catch { /* No readable cache. */ }
    active = { client, id, key, base: cleanSnapshot(cache?.base ?? guest),
      pending: Array.isArray(cache?.pending) ? cache.pending : [] };
    publish(active);
    status("Syncing your follows and saved stories…");
    void refresh();
  }

  function disconnect() {
    active = undefined;
    status("Sign in to sync follows and saved stories.");
  }

  function record(field, previous, next) {
    if (!active) return;
    const changes = preferenceChanges(field, previous, next);
    if (!changes.length) return;
    active.pending.push(...changes);
    save(active);
    void refresh();
  }

  return { connect, disconnect, refresh, record, isConnected: () => Boolean(active) };
}
