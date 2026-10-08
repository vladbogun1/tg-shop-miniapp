/**
 * First-load preloader for the website and the Mini App (same art, same behaviour).
 *
 * It is plain server-rendered HTML + inline CSS + an inline script, rendered at the very top of
 * <body> by each app's root layout, so it is on screen from the first paint — before webfonts,
 * images or React. The logo is vector paths (LOGO_GEOMETRY), so nothing waits for a font.
 *
 * Lifecycle (state lives in `html[data-pl]`, an attribute React never manages):
 *   (none) / "on"  overlay visible, page scroll locked
 *   "out"          bar at 100%, overlay fading (300ms), clicks pass through
 *   "done"         display:none — and it stays so on every client-side navigation, because the
 *                  inline script only ever runs on a real page load.
 * A client navigation that REMOUNTS the root layout (the site's language switch changes the [locale]
 * segment) re-inserts the overlay markup and React resets <html>'s attributes, while the inline script
 * does not run again — the overlay hung over the page with scrolling locked. The apps' <PreloaderReady>
 * mounts with the layout and settles that case before paint (see settlePreloader).
 * Progress is real: milestones DOMContentLoaded, document.fonts.ready, React hydration
 * (`window.__csPreloader.hydrated()`, called from a client effect), window "load", then the
 * images in the first viewport. Never longer than MAX_MS.
 *
 * Per-app tuning, as attributes on `<div id="cs-preloader">` (absent = the Mini App's behaviour):
 *   data-grace="300"  the overlay starts INVISIBLE and only appears if the page is still not usable
 *                     (DOM + fonts + hydration) after that many ms; a fast load never shows it. The
 *                     website uses this: an overlay over the first paint pushed the LCP (the H1) back
 *                     by ~1 s on a phone. Once shown it fades in and stays until the page is fully
 *                     ready, as before. Without the attribute the overlay is on screen from the first
 *                     paint — inside Telegram there is no LCP to protect, and a page appearing and
 *                     then being covered would read as a flicker.
 *   data-min="500"    minimum time on screen (default MIN_MS). The website sets 0: no holding a page
 *                     that is already there. The Mini App keeps 500 so a quick load does not blink
 *                     the logo for a few frames.
 *   data-once="session"  at most one overlay per browser tab session (sessionStorage): once a visitor
 *                     has seen it, later full loads (refresh, a link opened in the same tab, back from
 *                     the payment page) paint the page straight away. The website sets it — on phones
 *                     hydration rarely beats the grace, so the logo was covering almost every load.
 *   data-until="usable"  once shown, leave as soon as the page is usable (DOM + fonts + hydration)
 *                     instead of also waiting for window "load" and the first-viewport images: the
 *                     page is interactive by then, and the hero's art can finish loading in place.
 * Crawlers and audit tools (Googlebot, Lighthouse/PageSpeed, other bots) never get it.
 * No JS → a <noscript> style hides it (SEO / no-JS users never see it).
 */
import { BRAND_ORANGE_STOPS, BRAND_WHITE_STOPS, LOGO_GEOMETRY as G } from "./logo";

const MIN_MS = 500;
const MAX_MS = 4000;
/** User agents that get no overlay: search crawlers, link previews, audit tools (Lighthouse, PSI). */
const BOT_UA = "bot|crawl|spider|slurp|lighthouse|pagespeed|google-inspectiontool|googleother|storebot|adsbot|mediapartners|facebookexternalhit|bingpreview|gtmetrix|ptst";

const stops = (s: typeof BRAND_WHITE_STOPS) =>
  s.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("");

const LOGO_SVG =
  `<svg class="cspl-logo" viewBox="${G.fullViewBox}" role="img" aria-label="ChiSetup — Gaming Gear &amp; Setup">` +
  `<defs>` +
  `<linearGradient id="cspl-w" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${G.whiteGradient.y1}" y2="${G.whiteGradient.y2}">${stops(BRAND_WHITE_STOPS)}</linearGradient>` +
  `<linearGradient id="cspl-o" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${G.orangeGradient.y1}" y2="${G.orangeGradient.y2}">${stops(BRAND_ORANGE_STOPS)}</linearGradient>` +
  `</defs>` +
  `<path fill="url(#cspl-w)" d="${G.white}"/>` +
  `<path fill="url(#cspl-o)" fill-rule="evenodd" d="${G.orange}"/>` +
  `<path fill="${G.taglineColor}" d="${G.tagline}"/>` +
  `<path fill="#FFFFFF" d="${G.bracketsWhite}"/>` +
  `<path class="cspl-or" fill="#FF6600" d="${G.bracketsOrange}"/>` +
  `</svg>`;

/** Markup of the overlay (goes inside `<div id="cs-preloader">`). */
export const PRELOADER_HTML =
  `<div class="cspl-in">${LOGO_SVG}` +
  `<div class="cspl-bar" role="progressbar" aria-label="Loading" aria-valuemin="0" aria-valuemax="100"><i class="cspl-fill"></i></div>` +
  `</div>`;

export const PRELOADER_CSS = `
#cs-preloader{position:fixed;inset:0 auto 0 0;width:100vw;z-index:2147483000;display:grid;place-items:center;
 padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);
 background-color:#0E0E10;
 background-image:
  radial-gradient(ellipse 46% 34% at 50% 50%,rgba(255,102,0,.10),transparent 70%),
  linear-gradient(135deg,transparent calc(14% - 1px),rgba(255,102,0,.32) 14%,transparent calc(14% + 2px)),
  linear-gradient(135deg,transparent calc(18% - 1px),rgba(255,102,0,.16) 18%,transparent calc(18% + 1px)),
  linear-gradient(135deg,transparent calc(86% - 2px),rgba(255,102,0,.32) 86%,transparent calc(86% + 1px)),
  linear-gradient(135deg,transparent calc(82% - 1px),rgba(255,102,0,.16) 82%,transparent calc(82% + 1px)),
  linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),
  linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);
 background-size:auto,auto,auto,auto,auto,48px 48px,48px 48px;
 opacity:1;transition:opacity .3s ease;-webkit-user-select:none;user-select:none}
#cs-preloader .cspl-in{display:flex;flex-direction:column;align-items:center;gap:clamp(22px,4vh,34px);width:min(440px,80vw)}
#cs-preloader .cspl-logo{display:block;width:100%;height:auto;overflow:visible}
#cs-preloader .cspl-or{filter:drop-shadow(0 0 6px rgba(255,102,0,.55))}
#cs-preloader .cspl-bar{position:relative;width:62%;height:3px;border-radius:2px;background:rgba(255,255,255,.18);overflow:hidden}
#cs-preloader .cspl-fill{position:absolute;inset:0 auto 0 0;display:block;width:calc(var(--cspl-p,.06) * 100%);
 border-radius:inherit;background:linear-gradient(90deg,#FF6600,#FF8533);box-shadow:0 0 10px rgba(255,102,0,.8),0 0 2px rgba(255,133,51,.9);
 transition:width .45s cubic-bezier(.2,.7,.2,1)}
#cs-preloader .cspl-fill::after{content:"";position:absolute;top:0;bottom:0;left:0;width:38%;
 background:linear-gradient(90deg,transparent,rgba(255,230,200,.85),transparent);animation:cspl-crawl 1.1s linear infinite}
@keyframes cspl-crawl{from{transform:translateX(-100%)}to{transform:translateX(270%)}}
#cs-preloader[data-grace]{opacity:0;visibility:hidden}
html[data-pl=on] #cs-preloader[data-grace]{opacity:1;visibility:visible}
html[data-pl=out] #cs-preloader[data-grace]{visibility:visible}
html[data-pl=out] #cs-preloader{opacity:0;pointer-events:none}
html[data-pl=done] #cs-preloader{display:none}
html:not([data-pl=out]):not([data-pl=done]){overflow:hidden;scrollbar-gutter:stable}
@media (prefers-reduced-motion:reduce){
 #cs-preloader{transition-duration:.12s}
 #cs-preloader .cspl-fill{transition-duration:.1s}
 #cs-preloader .cspl-fill::after{animation:none;display:none}
}`;

/** Put inside <noscript>: without JS the overlay would never go away. */
export const PRELOADER_NOSCRIPT_CSS = `#cs-preloader{display:none!important}html{overflow:visible!important;scrollbar-gutter:auto!important}`;

/** Inline script placed right after the overlay. Runs once, on the real page load only. */
export const PRELOADER_SCRIPT = `(function(){
var d=document,h=d.documentElement,el=d.getElementById("cs-preloader");
if(!el||h.getAttribute("data-pl"))return;
if(new RegExp("${BOT_UA}","i").test(navigator.userAgent||"")){h.setAttribute("data-pl","done");return;}
var num=function(a,def){var v=parseInt(el.getAttribute(a)||"",10);return isNaN(v)?def:Math.max(0,v)};
var grace=num("data-grace",0),min=num("data-min",${MIN_MS}),shown=!grace,shownAt=0,early=el.getAttribute("data-until")==="usable";
if(el.getAttribute("data-once")==="session"){var seen=false;try{seen=sessionStorage.getItem("cs-pl")==="1";sessionStorage.setItem("cs-pl","1");}catch(e){}
 if(seen){h.setAttribute("data-pl","done");window.__csPreloader={hydrated:function(){},finish:function(){},finished:function(){return true}};return;}}
h.setAttribute("data-pl",grace?"wait":"on");
var t0=(window.performance&&performance.now)?performance.now():0,now=function(){return window.performance?performance.now():Date.now()};
var W={dom:.2,fonts:.25,hyd:.25,load:.15,img:.15},got={},p=.06,fin=false;
var bar=el.querySelector(".cspl-bar");
function set(v){p=Math.max(p,v);h.style.setProperty("--cspl-p",String(p));if(bar)bar.setAttribute("aria-valuenow",String(Math.round(p*100)));}
function usable(){return got.dom&&got.fonts&&got.hyd}
function mark(k){if(got[k]||fin)return;got[k]=1;var s=.06;for(var x in got)s+=W[x]*.94;set(Math.min(s,.97));
 if(!shown&&usable()){fin=true;h.setAttribute("data-pl","done");h.style.removeProperty("--cspl-p");return;}
 if(early&&usable()){done();return;}
 if(got.dom&&got.fonts&&got.hyd&&got.load&&!got.img){imgs();}
 if(got.img)done();}
function imgs(){setTimeout(function(){var L=[],vh=innerHeight,a=d.images;
 for(var i=0;i<a.length;i++){var im=a[i];if(im.complete)continue;var r=im.getBoundingClientRect();if(r.bottom>0&&r.top<vh&&r.width>0)L.push(im);}
 var n=L.length;if(!n){mark("img");return;}
 var one=function(){if(--n<=0)mark("img");else set(p+.15/(L.length+1));};
 L.forEach(function(im){im.addEventListener("load",one,{once:true});im.addEventListener("error",one,{once:true});});
},120);}
function done(){if(fin)return;fin=true;
 if(!shown){h.setAttribute("data-pl","done");h.style.removeProperty("--cspl-p");return;}
 var wait=Math.max(0,min-(now()-shownAt));
 setTimeout(function(){set(1);setTimeout(function(){h.setAttribute("data-pl","out");
  setTimeout(function(){h.setAttribute("data-pl","done");h.style.removeProperty("--cspl-p");},320);},220);},wait);}
if(grace)setTimeout(function(){if(fin||usable())return;shown=true;shownAt=now();h.setAttribute("data-pl","on");},grace);
else shownAt=t0;
window.__csPreloader={hydrated:function(){mark("hyd")},finish:done,finished:function(){return fin}};
if(d.readyState!=="loading")mark("dom");else d.addEventListener("DOMContentLoaded",function(){mark("dom")});
if(d.fonts&&d.fonts.ready)d.fonts.ready.then(function(){mark("fonts")},function(){mark("fonts")});else mark("fonts");
if(d.readyState==="complete")mark("load");else window.addEventListener("load",function(){mark("load")});
setTimeout(done,${MAX_MS});
})();`;

/**
 * Called from each app's <PreloaderReady> in a layout effect, i.e. on every mount of the root layout:
 * on the real first load it reports hydration; on a remount (the script already finished, or never
 * ran for this markup) it hides the overlay at once instead of leaving it stuck.
 */
export function settlePreloader(): void {
  if (typeof window === "undefined") return;
  const pl = (window as unknown as { __csPreloader?: { hydrated: () => void; finished: () => boolean } }).__csPreloader;
  if (pl && !pl.finished()) {
    pl.hydrated();
    return;
  }
  const h = document.documentElement;
  h.setAttribute("data-pl", "done");
  h.style.removeProperty("--cspl-p");
}
