/** Fragment shaders of the WebGL backgrounds (SceneFx <Shader>). Uniforms: r — canvas size in px,
 *  t — seconds, m — eased pointer in 0..1 (y up; it orbits by itself when there is no mouse). */

const HEAD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 r; uniform float t; uniform vec2 m;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
const vec3 BG=vec3(.055,.055,.063);
/* 0 under the hero copy, 1 at the edges */
float vig(){vec2 s=gl_FragCoord.xy/r-vec2(.5,.55);return smoothstep(.1,.75,length(s*vec2(1.25,1.)));}
`;

/** Domain-warped smoke, orange on graphite. */
export const SMOKE = `${HEAD}
void main(){
  vec2 uv=gl_FragCoord.xy/r.y;
  vec2 q=vec2(fbm(uv*1.3+vec2(0.,t*.035)),fbm(uv*1.3+vec2(5.2,1.3)-t*.028));
  vec2 w=vec2(fbm(uv*1.5+2.2*q+vec2(1.7,9.2)+t*.02),fbm(uv*1.5+2.2*q+vec2(8.3,2.8)));
  float f=fbm(uv*1.4+2.4*w+(m-.5)*.25);
  vec3 c=mix(BG,vec3(.20,.07,.01),smoothstep(.35,.75,f));
  c=mix(c,vec3(.75,.28,.02),smoothstep(.62,.95,f)*clamp(length(q)*.9,0.,1.));
  c+=vec3(1.,.45,.1)*pow(smoothstep(.78,1.02,f),3.)*.35;
  gl_FragColor=vec4(mix(BG,c,.3+.7*vig()),1.);
}`;

/** Topographic map: contour lines of a slowly shifting height field, a hill follows the pointer.
 *  Line width is kept even in px by dividing by the numeric gradient. */
export const TOPO = `${HEAD}
float H(vec2 p){
  float v=fbm(p*1.1+vec2(t*.012,-t*.009));
  vec2 d=p-m*vec2(r.x/r.y,1.);
  return v+.28*exp(-dot(d,d)*5.);
}
void main(){
  vec2 uv=gl_FragCoord.xy/r.y;
  float e=1./r.y;
  float v=H(uv);
  vec2 g=vec2(H(uv+vec2(e,0.))-v,H(uv+vec2(0.,e))-v)/e;
  const float L=22.;
  float f=v*L;
  float px=abs(fract(f+.5)-.5)/max(length(g)*L,1e-3)*r.y;
  float major=1.-step(.5,mod(floor(f+.5),5.));
  float line=1.-smoothstep(.35,1.25,px);
  vec3 minorC=vec3(.32,.16,.08), majorC=vec3(1.,.42,.05);
  vec3 c=BG+line*mix(minorC*.55,majorC*.8,major);
  // faint elevation tint: valleys darker, peaks warmer
  c+=vec3(.06,.025,0.)*smoothstep(.45,.8,v);
  gl_FragColor=vec4(mix(BG,c,.35+.65*vig()),1.);
}`;

/** Chladni figures: «sand» gathers on the nodal lines of a vibrating plate; the plate switches
 *  modes every ~14 s and the pointer adds its own ripple. */
export const CHLADNI = `${HEAD}
const float PI=3.14159265;
float ch(vec2 p,float a,float b){return cos(a*PI*p.x)*cos(b*PI*p.y)-cos(b*PI*p.x)*cos(a*PI*p.y);}
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*r)/r.y;
  vec2 p=uv*1.5;
  float k=floor(t/14.), fr=smoothstep(.65,1.,fract(t/14.));
  float a1=2.+mod(k,5.), b1=a1+1.+mod(k*3.,4.);
  float a2=2.+mod(k+1.,5.), b2=a2+1.+mod((k+1.)*3.,4.);
  float v=mix(ch(p,a1,b1),ch(p,a2,b2),fr);
  vec2 mp=(m-.5)*vec2(r.x/r.y,1.)*1.5;
  float d=length(p-mp);
  v+=.45*sin(d*16.-t*2.5)*exp(-d*2.2);
  float sand=exp(-abs(v)*20.)*.75;
  float grain=h(floor(gl_FragCoord.xy));
  sand*=.45+.55*step(.35,grain);
  vec3 c=BG+sand*mix(vec3(.55,.2,.02),vec3(1.,.55,.18),sand*sand);
  gl_FragColor=vec4(mix(BG,c,.12+.88*vig()),1.);
}`;

/** Mousepad cloth close-up: a woven texture lit by the glow under a «mouse» that glides over it
 *  (the pointer, or a flick path by itself). */
export const PAD = `${HEAD}
uniform float act;
void main(){
  vec2 px=gl_FragCoord.xy;
  vec2 g=px/5.;
  vec2 c=floor(g), f=fract(g);
  float over=mod(c.x+c.y,2.);
  // two thread directions: the one on top is lit across its width, the one below sinks into shade
  float thread=mix(sin(f.y*3.14159),sin(f.x*3.14159),over);
  float gap=smoothstep(.0,.15,min(f.x,f.y))*smoothstep(.0,.15,min(1.-f.x,1.-f.y));
  float lum=thread*gap*(.88+.12*h(floor(px*.5)));
  // the glow under the «mouse»: a fixed-size soft pool (in px), dimmer when it moves by itself
  float d=length(px-m*r)/340.;
  float light=exp(-d*d*2.6)*act;
  float amb=.5+.5*smoothstep(.25,.85,fbm(px/r.y*2.5+t*.015));
  // gaps between threads sink into shade, the threads themselves catch a cool sheen + the warm glow
  vec3 c3=BG*(.4+.6*gap)+lum*(vec3(.17,.16,.18)*amb+vec3(.6,.24,.06)*light*.75);
  gl_FragColor=vec4(c3,1.);
}`;

/** Honeycomb shell of an ultralight mouse: hex holes with the orange RGB glowing through from below. */
export const HONEY = `${HEAD}
vec4 hex(vec2 p){
  const vec2 s=vec2(1.,1.7320508);
  vec2 a=mod(p,s)-s*.5, b=mod(p-s*.5,s)-s*.5;
  vec2 gv=dot(a,a)<dot(b,b)?a:b;
  return vec4(gv,p-gv);
}
float hexd(vec2 p){p=abs(p);return max(dot(p,normalize(vec2(1.,1.7320508))),p.x);}
void main(){
  vec2 uv=gl_FragCoord.xy/r.y;
  vec4 hx=hex(uv*18.);
  float d=hexd(hx.xy);
  vec2 id=hx.zw/18.;
  // the light under the shell: a slow glow field plus a hot spot at the pointer
  float glow=smoothstep(.45,.85,fbm(id*2.2+vec2(t*.05,-t*.04)));
  vec2 mp=m*vec2(r.x/r.y,1.);
  glow+=exp(-dot(id-mp,id-mp)*14.)*1.1;
  float hole=1.-smoothstep(.34,.36,d);
  float rim=smoothstep(.36,.38,d)*(1.-smoothstep(.40,.46,d));
  vec3 lit=vec3(1.,.4,.05)*glow*(1.-d*1.6)+vec3(1.,.8,.6)*pow(glow,4.)*.3;
  vec3 shell=BG*1.25+vec3(.03)*rim;
  vec3 c=mix(shell,BG+lit*.6,hole);
  gl_FragColor=vec4(mix(BG,c,.08+.92*vig()),1.);
}`;

/** A CS2 smoke grenade: blooms, hangs, thins out; every ~1.7 s a «bullet» punches a tunnel through
 *  it that closes again, and the pointer pushes the smoke aside. Cycles every 20 s at a new spot. */
export const CSSMOKE = `${HEAD}
float segd(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;return length(pa-ba*clamp(dot(pa,ba)/dot(ba,ba),0.,1.));}
void main(){
  float asp=r.x/r.y;
  vec2 uv=gl_FragCoord.xy/r.y;
  float k=floor(t/20.), age=mod(t,20.);
  vec2 c=vec2((.12+.76*h(vec2(k,1.)))*asp,.25+.45*h(vec2(k,2.)));
  float R=.5*(1.-exp(-age*1.1));
  float life=smoothstep(0.,.6,age)*(1.-smoothstep(15.,20.,age));
  vec2 q=uv-c;
  float dist=length(q*vec2(1.,1.25));
  float dens=fbm(uv*3.2+vec2(t*.03,-t*.05))*.7+fbm(uv*7.+t*.08)*.3;
  float body=1.-smoothstep(R*.55,R,dist+ (dens-.5)*.18);
  float smoke=body*smoothstep(.2,.55,dens)*life;
  // bullet tunnels
  float bk=floor(t/1.7), ba=mod(t,1.7);
  float ang=h(vec2(bk,7.))*6.2831;
  vec2 dir=vec2(cos(ang),sin(ang));
  vec2 o=c+vec2(-dir.y,dir.x)*(h(vec2(bk,9.))-.5)*R;
  float hr=.045*(1.-smoothstep(0.,1.6,ba));
  smoke*=smoothstep(hr*.4,hr,segd(uv,o-dir*2.,o+dir*2.));
  // the pointer pushes it aside
  vec2 mp=m*vec2(asp,1.);
  smoke*=smoothstep(.0,.16,length(uv-mp));
  // grey CS2 smoke, lit warm from the scene's orange haze
  vec3 col=mix(vec3(.30,.30,.32),vec3(.62,.36,.2),smoothstep(.3,.9,dens)*.6);
  col*=.55+.45*smoothstep(.0,1.,uv.y-c.y+R);
  vec3 cc=mix(BG,col,smoke*.75);
  gl_FragColor=vec4(mix(BG,cc,.4+.6*vig()),1.);
}`;
