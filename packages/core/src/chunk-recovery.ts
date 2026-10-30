/**
 * Version-skew recovery for the site and the Mini App: an inline <head> script that reloads the
 * page once when a JS chunk of a different build fails to load or to run.
 *
 * After every release some phones still hold the previous build's HTML / webpack runtime (Safari
 * and Telegram's webviews cache pages heuristically) and then pull chunks of the new build: the
 * runtime asks for a module id that is not there and the page dies with
 * "undefined is not an object (evaluating 'e[n].call')" (Safari) /
 * "Cannot read properties of undefined (reading 'call')" (Chrome) or a ChunkLoadError — ~300 such
 * errors a week on prod in October 2026. A reload fetches the current HTML and everything matches.
 *
 * Inline and ES5 on purpose: it has to work when the app bundles themselves cannot. At most one
 * reload per 30 s per tab (sessionStorage), so a genuinely broken chunk cannot loop.
 */
export const CHUNK_RECOVERY_SCRIPT = [
  "(function(){",
  "var K='cs-chunk-reload';",
  "var RE=/ChunkLoadError|Loading (CSS )?chunk|evaluating '[\\w$]+\\[[\\w$]+\\]\\.call'|reading 'call'|dynamically imported module|Importing a module script failed/;",
  "function go(m){if(!m||!RE.test(String(m)))return;",
  "try{var t=+sessionStorage.getItem(K)||0;if(Date.now()-t<30000)return;sessionStorage.setItem(K,String(Date.now()));}catch(e){return;}",
  "location.reload();}",
  "addEventListener('error',function(e){go(e&&(e.message||(e.error&&e.error.message)));},true);",
  "addEventListener('unhandledrejection',function(e){var r=e&&e.reason;go(r&&(r.name==='ChunkLoadError'?'ChunkLoadError':(r.message||r)));});",
  "})();",
].join("");
