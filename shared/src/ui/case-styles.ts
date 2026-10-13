/**
 * Styles of the gift case UI, shipped with the components (a React 19 `<style href precedence>`
 * is hoisted to <head> and de-duplicated), so the Mini App and the website render it identically
 * without either app's Tailwind having to scan this package. Prefix `gc-`.
 *
 * Performance contract (iPhone WebKit): every loop animates `transform`/`opacity` only; glows are
 * pre-drawn gradients whose opacity pulses, never an animated `filter`/`box-shadow`.
 */
export const CASE_CSS = `
.gc-root{position:fixed;inset:0;z-index:1000;overflow:hidden;background:#0b0b0c;color:#fff;
  font-family:var(--font-body),"Inter",system-ui,sans-serif;-webkit-tap-highlight-color:transparent;
  overscroll-behavior:contain;touch-action:manipulation;isolation:isolate}
.gc-root *{box-sizing:border-box}
.gc-disp{font-family:var(--font-display),"Exo 2",system-ui,sans-serif}
.gc-scene{position:absolute;inset:0;z-index:0;pointer-events:none}
.gc-scene img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 70%}
.gc-scene::after{content:"";position:absolute;inset:0;
  background:radial-gradient(120% 70% at 50% 45%,transparent 0,rgba(8,8,9,.25) 55%,rgba(8,8,9,.86) 100%),
  linear-gradient(180deg,rgba(8,8,9,.55) 0,transparent 22%,transparent 70%,rgba(8,8,9,.75) 100%)}
.gc-rays{position:absolute;left:50%;top:38%;width:170vmax;height:170vmax;margin:-85vmax 0 0 -85vmax;z-index:0;pointer-events:none;
  background:repeating-conic-gradient(from 0deg,rgba(255,106,0,.10) 0 6deg,transparent 6deg 18deg);
  -webkit-mask-image:radial-gradient(closest-side,#000 0,rgba(0,0,0,.6) 35%,transparent 70%);mask-image:radial-gradient(closest-side,#000 0,rgba(0,0,0,.6) 35%,transparent 70%);
  animation:gc-spin 60s linear infinite;opacity:.55;will-change:transform}
@keyframes gc-spin{to{transform:rotate(360deg)}}
.gc-shake{will-change:transform}

.gc-top{position:absolute;left:0;right:0;top:0;z-index:5;display:flex;justify-content:space-between;align-items:center;
  padding:calc(var(--safe-top, env(safe-area-inset-top, 0px)) + 12px) 16px 0}
.gc-icon{display:grid;place-items:center;width:44px;height:44px;border:1px solid rgba(255,255,255,.14);
  background:rgba(20,20,20,.62);color:#fff;cursor:pointer;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);
  clip-path:polygon(9px 0,100% 0,100% calc(100% - 9px),calc(100% - 9px) 100%,0 100%,0 9px);transition:opacity .25s,background .2s}
.gc-icon:hover{background:rgba(40,40,40,.8)}
.gc-icon:focus-visible{outline:2px solid #ff6a00;outline-offset:2px}
.gc-icon[disabled]{opacity:0;pointer-events:none}
.gc-icon svg{width:20px;height:20px}

.gc-body{position:absolute;inset:0;z-index:2;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;
  display:flex;flex-direction:column;align-items:center;
  padding:calc(var(--safe-top, env(safe-area-inset-top, 0px)) + 64px) 16px calc(var(--safe-bottom, env(safe-area-inset-bottom, 0px)) + 20px)}
.gc-eyebrow{font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#ff8533;font-weight:700;text-align:center}
.gc-title{margin:6px 0 0;font-size:clamp(22px,6vw,34px);line-height:1.05;font-weight:800;text-transform:uppercase;letter-spacing:.02em;text-align:center;
  text-shadow:0 2px 24px rgba(0,0,0,.6)}

.gc-stage{position:relative;width:min(86vw,460px);aspect-ratio:3/2;margin:8px auto 0;flex:none}
.gc-floor{position:absolute;left:8%;right:8%;bottom:-4%;height:26%;border-radius:50%;
  background:radial-gradient(closest-side,rgba(255,106,0,.55),rgba(255,106,0,.16) 55%,transparent);animation:gc-floor 2.6s ease-in-out infinite;will-change:transform,opacity}
@keyframes gc-floor{50%{transform:scale(.86);opacity:.65}}
.gc-glow{position:absolute;inset:-12%;border-radius:50%;background:radial-gradient(closest-side,rgba(255,106,0,.42),rgba(255,106,0,.12) 50%,transparent 72%);
  animation:gc-glow 2.6s ease-in-out infinite;will-change:transform,opacity}
@keyframes gc-glow{50%{opacity:.55;transform:scale(.92)}}
.gc-case{position:absolute;inset:0;animation:gc-bob 2.6s ease-in-out infinite;will-change:transform}
.gc-case img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;-webkit-user-drag:none;user-select:none}
@keyframes gc-bob{50%{transform:translateY(-4.5%) rotate(-1.2deg)}}
.gc-spark{position:absolute;bottom:22%;width:4px;height:4px;border-radius:50%;background:#ffb070;opacity:0;
  box-shadow:0 0 6px 1px rgba(255,120,30,.9);animation:gc-rise var(--d,3.2s) linear var(--delay,0s) infinite;will-change:transform,opacity}
@keyframes gc-rise{0%{opacity:0;transform:translate(0,0) scale(1)}12%{opacity:1}100%{opacity:0;transform:translate(var(--dx,0px),-190px) scale(.3)}}

.gc-stage.is-opening .gc-case{animation:gc-shake .7s cubic-bezier(.36,.07,.19,.97) both}
.gc-stage.is-opening .gc-glow{animation:gc-charge .9s ease-in forwards}
@keyframes gc-shake{
  10%,90%{transform:translate3d(-1%,0,0) rotate(-1deg)}20%,80%{transform:translate3d(2%,-1%,0) rotate(2deg)}
  30%,50%,70%{transform:translate3d(-3%,1%,0) rotate(-3deg) scale(1.02)}40%,60%{transform:translate3d(3%,-1%,0) rotate(3deg) scale(1.03)}100%{transform:scale(1.06)}}
@keyframes gc-charge{to{transform:scale(1.5);opacity:1}}
.gc-stage.is-open .gc-case{animation:gc-pop .5s cubic-bezier(.2,1.6,.4,1) both}
@keyframes gc-pop{0%{transform:scale(1.1)}100%{transform:scale(1)}}
.gc-burst{position:absolute;left:50%;top:44%;width:180%;aspect-ratio:1;transform:translate(-50%,-50%) scale(.2);opacity:0;pointer-events:none;
  background:repeating-conic-gradient(from 0deg,rgba(255,170,80,.55) 0 4deg,transparent 4deg 14deg);
  -webkit-mask-image:radial-gradient(closest-side,#000 0,rgba(0,0,0,.5) 30%,transparent 68%);mask-image:radial-gradient(closest-side,#000 0,rgba(0,0,0,.5) 30%,transparent 68%)}
.gc-stage.is-open .gc-burst{animation:gc-burst 1.4s cubic-bezier(.1,.8,.3,1) forwards}
@keyframes gc-burst{0%{opacity:1;transform:translate(-50%,-50%) scale(.2) rotate(0)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.3) rotate(40deg)}}
.gc-flash{position:absolute;inset:0;z-index:8;pointer-events:none;opacity:0;
  background:radial-gradient(circle at 50% 40%,#fff 0,#ffd2a8 25%,rgba(255,106,0,.85) 55%,rgba(255,106,0,0) 85%)}
.gc-flash.on{animation:gc-flash .75s ease-out forwards}
@keyframes gc-flash{0%{opacity:0}18%{opacity:1}100%{opacity:0}}

.gc-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:56px;padding:0 34px;border:0;cursor:pointer;
  background:linear-gradient(180deg,#ff8a33,#ff6a00 55%,#e65c00);color:#0e0e10;font-weight:800;font-size:17px;letter-spacing:.08em;text-transform:uppercase;
  clip-path:polygon(12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px);transition:transform .15s,filter .2s}
.gc-btn:hover{filter:brightness(1.08)}
.gc-btn:active{transform:scale(.97)}
.gc-btn:focus-visible{outline:2px solid #fff;outline-offset:3px}
.gc-btn::after{content:"";position:absolute;inset:0;background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,.55) 48%,transparent 62%);
  transform:translateX(-120%);animation:gc-sheen 2.8s ease-in-out 1s infinite;pointer-events:none}
@keyframes gc-sheen{0%,55%{transform:translateX(-120%)}100%{transform:translateX(120%)}}
.gc-btn-wrap{position:relative;margin-top:18px;filter:drop-shadow(0 0 18px rgba(255,106,0,.55))}
.gc-btn.ghost{background:rgba(255,255,255,.06);color:#fff;border:1px solid rgba(255,255,255,.2);font-size:14px;min-height:48px;padding:0 20px}
.gc-btn.ghost::after{display:none}
.gc-btn.ghost:hover{background:rgba(255,255,255,.12)}
.gc-err{margin-top:12px;color:#ff8a7a;font-size:13px;font-weight:600;text-align:center}

.gc-drops{width:min(100%,640px);margin-top:26px}
.gc-drops h3{margin:0 0 10px;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:rgba(255,255,255,.62);font-weight:700;text-align:center}
.gc-drops ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px}
.gc-drop{position:relative;padding:6px 6px 9px;background:linear-gradient(180deg,rgba(40,40,40,.86),rgba(20,20,20,.9));
  clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px)}
.gc-drop::before{content:"";position:absolute;inset:0;background:radial-gradient(110% 60% at 50% 100%,color-mix(in srgb,var(--rc) 38%,transparent),transparent 70%)}
.gc-drop::after{content:"";position:absolute;left:0;right:8px;bottom:0;height:3px;background:var(--rc)}
.gc-drop img,.gc-drop .gc-noimg{position:relative;display:block;width:100%;aspect-ratio:1;object-fit:contain}
.gc-drop p{position:relative;margin:4px 0 0;font-size:10.5px;line-height:1.25;color:rgba(255,255,255,.86);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.5em;overflow-wrap:anywhere}
.gc-drop b{position:relative;display:block;margin-top:2px;font-size:11px;color:var(--rc);font-weight:800}
.gc-noimg{display:grid !important;place-items:center;font-size:28px;opacity:.5}

.gc-spinwrap{width:100%;display:flex;flex-direction:column;align-items:center;margin:auto 0}
.gc-mini{position:relative;width:min(56vw,300px);aspect-ratio:3/2;margin-bottom:-6px}
.gc-mini img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.gc-reel{position:relative;width:calc(100% + 32px);margin:0 -16px;padding:18px 0;flex:none}
.gc-reel-vp{position:relative;overflow:hidden;
  -webkit-mask-image:linear-gradient(90deg,transparent 0,#000 16%,#000 84%,transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 16%,#000 84%,transparent 100%)}
.gc-reel-bg{position:absolute;left:0;right:0;top:10px;bottom:10px;background:linear-gradient(180deg,rgba(14,14,15,.2),rgba(14,14,15,.78) 20%,rgba(14,14,15,.78) 80%,rgba(14,14,15,.2));
  border-top:1px solid rgba(255,106,0,.25);border-bottom:1px solid rgba(255,106,0,.25)}
.gc-strip{display:flex;gap:var(--gap);padding:8px 0;will-change:transform;transform:translate3d(0,0,0)}
.gc-tile{position:relative;flex:none;width:var(--tw);height:calc(var(--tw) * 1.34);padding:8px 8px 12px;
  background:linear-gradient(180deg,#262626,#151515);transition:opacity .45s,transform .5s cubic-bezier(.2,1.4,.4,1);
  clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)}
.gc-tile::before{content:"";position:absolute;inset:0;background:radial-gradient(120% 70% at 50% 105%,color-mix(in srgb,var(--rc) 50%,transparent),transparent 72%)}
.gc-tile::after{content:"";position:absolute;left:0;right:10px;bottom:0;height:4px;background:var(--rc);box-shadow:0 0 12px var(--rc)}
.gc-tile img,.gc-tile .gc-noimg{position:relative;display:block;width:100%;aspect-ratio:1;object-fit:contain;-webkit-user-drag:none;user-select:none}
.gc-tile p{position:relative;margin:5px 0 0;font-size:10.5px;line-height:1.2;color:rgba(255,255,255,.9);font-weight:600;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.gc-strip.is-done .gc-tile{opacity:.28}
.gc-strip.is-done .gc-tile.is-win{opacity:1;transform:scale(1.12);z-index:2}
.gc-marker{position:absolute;top:0;bottom:0;left:50%;width:3px;margin-left:-1.5px;z-index:3;pointer-events:none;
  background:linear-gradient(180deg,#ff6a00,#fff 50%,#ff6a00);box-shadow:0 0 10px 2px rgba(255,106,0,.85),0 0 26px 6px rgba(255,106,0,.35)}
.gc-marker::before,.gc-marker::after{content:"";position:absolute;left:50%;width:0;height:0;border:9px solid transparent;margin-left:-9px}
.gc-marker::before{top:-2px;border-top:12px solid #ff6a00;border-bottom:0}
.gc-marker::after{bottom:-2px;border-bottom:12px solid #ff6a00;border-top:0}
.gc-speed{position:absolute;inset:0;z-index:2;pointer-events:none;opacity:0;
  background:repeating-linear-gradient(90deg,transparent 0 46px,rgba(255,255,255,.07) 46px 48px,transparent 48px 120px)}
.gc-hint{margin-top:16px;font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.55);font-weight:700}

.gc-reveal{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto;
  background:radial-gradient(circle at 50% 45%,rgba(10,10,10,.35),rgba(6,6,7,.86) 70%)}
.gc-card{position:relative;width:min(100%,400px);margin:auto;padding:22px 20px 20px;text-align:center;
  background:linear-gradient(180deg,rgba(32,32,32,.94),rgba(18,18,18,.96));
  clip-path:polygon(16px 0,100% 0,100% calc(100% - 16px),calc(100% - 16px) 100%,0 100%,0 16px)}
.gc-card::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(100% 55% at 50% 0,color-mix(in srgb,var(--rc) 30%,transparent),transparent 70%)}
.gc-card-edge{position:absolute;left:0;right:0;top:0;height:3px;background:var(--rc);box-shadow:0 0 18px var(--rc)}
.gc-card-rays{position:absolute;left:50%;top:150px;width:520px;height:520px;margin:-260px 0 0 -260px;pointer-events:none;
  background:repeating-conic-gradient(from 0deg,color-mix(in srgb,var(--rc) 45%,transparent) 0 7deg,transparent 7deg 20deg);
  -webkit-mask-image:radial-gradient(closest-side,#000 0,rgba(0,0,0,.4) 40%,transparent 70%);mask-image:radial-gradient(closest-side,#000 0,rgba(0,0,0,.4) 40%,transparent 70%);
  animation:gc-spin 18s linear infinite;will-change:transform}
.gc-prize{position:relative;width:min(62vw,220px);aspect-ratio:1;margin:4px auto 0}
.gc-prize img,.gc-prize .gc-noimg{width:100%;height:100%;object-fit:contain;display:block}
.gc-rarity{position:relative;display:inline-block;margin-top:12px;padding:4px 12px;font-size:12px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;
  color:var(--rc);background:color-mix(in srgb,var(--rc) 14%,transparent);border:1px solid color-mix(in srgb,var(--rc) 55%,transparent)}
.gc-prize-title{position:relative;margin:10px 0 0;font-size:19px;line-height:1.2;font-weight:800;overflow-wrap:anywhere}
.gc-free{position:relative;margin:8px 0 0;font-size:13px;color:#7ee2a0;font-weight:600}
.gc-actions{position:relative;display:flex;flex-direction:column;gap:10px;margin-top:18px}
.gc-actions .gc-btn{width:100%}
.gc-shimmer{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.gc-shimmer::after{content:"";position:absolute;top:-20%;bottom:-20%;width:45%;left:0;
  background:linear-gradient(100deg,transparent,rgba(255,230,150,.0) 20%,rgba(255,230,150,.45) 50%,rgba(255,230,150,0) 80%,transparent);
  transform:translateX(-120%) skewX(-12deg);animation:gc-shine 2.4s ease-in-out .3s infinite}
@keyframes gc-shine{0%{transform:translateX(-120%) skewX(-12deg)}60%,100%{transform:translateX(330%) skewX(-12deg)}}
.gc-canvas{position:absolute;inset:0;width:100%;height:100%;z-index:5;pointer-events:none}

@media (min-width:768px){
  .gc-body{padding-top:calc(var(--safe-top, env(safe-area-inset-top, 0px)) + 72px)}
  .gc-drops ul{grid-template-columns:repeat(auto-fill,minmax(110px,1fr))}
  .gc-drop p{font-size:11.5px}
  .gc-tile p{font-size:12px}
  .gc-mini{width:min(30vw,320px)}
}
@media (max-height:640px){.gc-stage{width:min(70vw,360px)}.gc-mini{width:min(40vw,220px)}}
@media (prefers-reduced-motion:reduce){
  .gc-rays,.gc-floor,.gc-glow,.gc-case,.gc-spark,.gc-btn::after,.gc-card-rays,.gc-shimmer::after{animation:none !important}
  .gc-spark{display:none}
}

/* ---- the order page card and the cart prize list ---- */
.gc-sealed{position:relative;display:flex;align-items:center;gap:14px;padding:14px;overflow:hidden;color:#fff;
  background:radial-gradient(120% 140% at 0 50%,rgba(255,106,0,.22),transparent 60%),linear-gradient(180deg,#1f1f1f,#151515);
  border:1px solid rgba(255,106,0,.45);border-radius:12px}
.gc-sealed-art{position:relative;flex:none;width:112px;aspect-ratio:3/2}
.gc-sealed-art img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;animation:gc-bob 2.6s ease-in-out infinite;will-change:transform}
.gc-sealed-art::before{content:"";position:absolute;inset:-18%;border-radius:50%;background:radial-gradient(closest-side,rgba(255,106,0,.55),transparent 70%);animation:gc-glow 2.6s ease-in-out infinite}
.gc-sealed-text{min-width:0;flex:1}
.gc-sealed-text b{display:block;font-size:15px;line-height:1.25;font-weight:800}
.gc-sealed-text span{display:block;margin-top:3px;font-size:12px;line-height:1.35;color:rgba(255,255,255,.66)}
.gc-sealed .gc-btn{min-height:44px;padding:0 18px;font-size:14px;margin-top:10px}
@media (min-width:520px){.gc-sealed-art{width:150px}.gc-sealed-text b{font-size:17px}}
.gc-rows{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}
.gc-row{display:flex;align-items:center;gap:8px;min-height:30px;font-size:12px;line-height:1.25}
.gc-row i{flex:none;width:4px;align-self:stretch;min-height:22px;border-radius:2px;background:var(--rc)}
.gc-row img,.gc-row .gc-noimg{flex:none;width:30px;height:30px;object-fit:contain;border-radius:4px;background:#1a1a1a;font-size:14px}
.gc-row span{min-width:0;flex:1;overflow-wrap:anywhere}
.gc-row em{font-style:normal;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--rc);flex:none}
.gc-row b{flex:none;font-weight:800;font-variant-numeric:tabular-nums;min-width:42px;text-align:right}
.gc-chip{display:inline-flex;align-items:center;gap:5px;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;vertical-align:middle;
  color:var(--rc);background:color-mix(in srgb,var(--rc) 16%,transparent);border:1px solid color-mix(in srgb,var(--rc) 50%,transparent)}
.gc-chip::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--rc);box-shadow:0 0 6px var(--rc)}
`;
