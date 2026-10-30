/** The window.Telegram.WebApp stub as page source — see lib/tg-stub.ts. Plain JS so scripts can import it too. */
export function telegramStubScript(telegramUserId, languageCode) {
  // A plain string, not a function's toString(): the test transpiler may add helpers to a function body.
  return `(function(){
  var u={id:${telegramUserId},first_name:'Dev',last_name:'Tester',username:'dev_tester',language_code:${JSON.stringify(languageCode)}};
  var d='user='+encodeURIComponent(JSON.stringify(u))+'&auth_date='+Math.floor(Date.now()/1000)+'&hash=devstub';
  var n=function(){},i={top:0,bottom:0,left:0,right:0};
  var w={initData:d,initDataUnsafe:{user:u},version:'8.0',platform:'web',colorScheme:'light',
    themeParams:{},safeAreaInset:i,contentSafeAreaInset:i,isExpanded:true,viewportHeight:innerHeight,
    viewportStableHeight:innerHeight,ready:n,expand:n,close:n,onEvent:n,offEvent:n,
    requestFullscreen:n,exitFullscreen:n,isVersionAtLeast:function(){return true},
    setHeaderColor:n,setBackgroundColor:n,enableClosingConfirmation:n,disableClosingConfirmation:n,
    HapticFeedback:{impactOccurred:n,notificationOccurred:n,selectionChanged:n},
    MainButton:{setText:n,show:n,hide:n,enable:n,disable:n,showProgress:n,hideProgress:n,onClick:n,offClick:n,setParams:n},
    BackButton:{show:n,hide:n,onClick:n,offClick:n}};
  var t={};
  var lock=function(o,k,v){Object.defineProperty(o,k,{get:function(){return v;},set:function(){},configurable:false});};
  lock(t,'WebApp',w);lock(window,'Telegram',t);
})();`;
}
