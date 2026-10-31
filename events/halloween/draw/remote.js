// The remote: index.html?remote=1 is this same panel without the visual, for a laptop or a phone.
// Rolls go to the server as before; the server pushes them to the OBS scene (stage.html, show.js),
// and the remote waits until the scene says the winner is on screen. The settings the scene follows
// (pool, rehearsal, visual, avatars, sound, blackout) are sent from here.
const WAIT_REVEAL_MS = 4 * 60_000; // longer than the slowest visual (royale ~80 s)

export async function startRemote({ api, settings, render }) {
  const info = await api("/show");
  const stageUrl = `${location.origin}/hw/draw/stage.html?k=${info.key}`;
  let current = info;
  const waiters = new Set();
  const es = new EventSource(`/hw/api/stage/events?k=${encodeURIComponent(info.key)}&as=remote`);
  es.onmessage = (e) => {
    current = JSON.parse(e.data);
    render(current);
    for (const w of [...waiters]) w(current);
  };
  es.onerror = () => render(null);
  const set = (patch) => api("/show", { method: "POST", body: JSON.stringify(patch) });
  await set(settings);
  return {
    stageUrl,
    set,
    state: () => current,
    /** Id of the last roll: rolls after it are the ones to wait for (rehearsal rounds start from 1 again). */
    lastRollId: () => current?.roll?.id ?? 0,
    /** Resolves when the scene has shown this round's winner — at once if no scene is connected. */
    waitReveal(round, attempt, sinceId) {
      return new Promise((resolve) => {
        const done = (s) => {
          waiters.delete(check);
          clearTimeout(timer);
          resolve(s);
        };
        const check = (s) => {
          const r = s?.roll;
          if (!s?.stages || (r && r.id > sinceId && r.round === round && r.attempt === attempt && r.revealedAt)) done(s);
        };
        const timer = setTimeout(() => done(null), WAIT_REVEAL_MS);
        waiters.add(check);
        check(current);
      });
    },
  };
}
