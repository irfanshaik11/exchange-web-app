import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Chunk load error recovery — ONLY active during initial page load.
             Once the app renders successfully, this script disables itself.
             SPA navigation errors are handled by _app.tsx routeChangeError instead. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function(){
  var KEY='__chunk_retry',MAX=2,DELAYS=[1000,2000],handled=false,count=0;
  try{count=parseInt(sessionStorage.getItem(KEY)||'0',10)}catch(e){}

  // Once the app has rendered, disable this script entirely.
  // SPA navigation chunk errors are handled by _app.tsx routeChangeError.
  window.addEventListener('load',function(){
    var root=document.getElementById('__next');
    if(root&&root.children.length>0){
      handled=true;
    }
    if(count>0)try{sessionStorage.removeItem(KEY)}catch(e){}
  });

  function showFallback(){
    try{sessionStorage.removeItem(KEY)}catch(e){}
    var d=document;
    d.body.innerHTML='';
    var c=d.createElement('div');
    c.style.cssText='position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#101114;color:#E6E7EA;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;z-index:99999';
    c.innerHTML='<div style="text-align:center;max-width:420px;padding:32px"><h2 style="font-size:20px;font-weight:600;margin:0 0 12px;color:#fff">Something went wrong</h2><p style="font-size:14px;color:#9CA3AF;margin:0 0 24px;line-height:1.5">A new version may have been deployed. Please refresh to load the latest version.</p><button id="__cr_btn" style="background:#3B82F6;color:#fff;border:none;border-radius:8px;padding:12px 32px;font-size:14px;font-weight:500;cursor:pointer">Refresh</button></div>';
    d.body.appendChild(c);
    d.getElementById('__cr_btn').onclick=function(){
      try{sessionStorage.removeItem(KEY)}catch(e){}
      if(navigator.serviceWorker){navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(s){s.unregister()})}).catch(function(){});}
      if(typeof caches!=='undefined'){caches.keys().then(function(k){k.forEach(function(n){caches.delete(n)})}).catch(function(){});}
      window.location.reload();
    };
  }

  function doRecovery(source){
    if(handled)return;
    handled=true;
    if(count<MAX){
      try{sessionStorage.setItem(KEY,String(count+1))}catch(e){}
      if(navigator.serviceWorker){navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(s){s.unregister()})}).catch(function(){});}
      setTimeout(function(){window.location.reload()},DELAYS[count]||2000);
    }else{
      showFallback();
    }
  }

  // Catch resource load errors (script/link 404s) during initial page load only
  window.addEventListener('error',function(e){
    var t=e.target;
    if(t&&(t.tagName==='SCRIPT'||t.tagName==='LINK')){
      doRecovery('resource-error');
    }
  },true);
})();
            `,
          }}
        />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
