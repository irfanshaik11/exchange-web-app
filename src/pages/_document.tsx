import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Preconnect for token-image origins we hit directly from the client.
             Warms TLS so the first image fetch on Pulse / New Pairs / Trending
             skips DNS + handshake (~150-300 ms savings on cold tabs). Browsers
             cap useful preconnects at ~6 — keep this list to the highest-hit
             origins only. crossOrigin only on origins that actually serve CORS
             headers (cdn.interstate.so) — for IPFS/Arweave gateways without
             CORS, the anonymous-credential socket would be discarded. Other
             origins go through /api/img on the server side, so dns-prefetch
             alone is enough on the client. */}
        <link
          rel="preconnect"
          href="https://cdn.interstate.so"
          crossOrigin="anonymous"
        />
        <link rel="dns-prefetch" href="https://cdn.interstate.so" />
        <link rel="dns-prefetch" href="https://arweave.net" />
        <link rel="dns-prefetch" href="https://gateway.irys.xyz" />
        <link rel="dns-prefetch" href="https://pump.mypinata.cloud" />
        <link rel="dns-prefetch" href="https://cloudflare-ipfs.com" />
        <link rel="dns-prefetch" href="https://ipfs.io" />
        <link rel="dns-prefetch" href="https://dweb.link" />
        {/* Chunk load error recovery — production only.
             In dev mode, Turbopack handles its own HMR error recovery.
             SPA navigation errors are handled by _app.tsx routeChangeError instead. */}
        {process.env.NODE_ENV === "production" && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
(function(){
  var KEY='__chunk_retry',MAX=3,DELAYS=[500,2000,5000],handled=false,recovering=false,count=0;
  var STALE_MS=30000;
  var failedUrl='';
  try{
    var raw=sessionStorage.getItem(KEY)||'';
    var parts=raw.split('|');
    count=parseInt(parts[0]||'0',10);
    var ts=parseInt(parts[1]||'0',10);
    if(ts&&(Date.now()-ts>STALE_MS)){count=0;}
  }catch(e){}

  function buildCacheBustUrl(){
    var u=new URL(window.location.href);
    u.searchParams.delete('_cr');
    u.searchParams.set('_cr',String(Date.now()));
    return u.pathname+u.search+u.hash;
  }

  function stripCacheBustParam(){
    try{
      var u=new URL(window.location.href);
      if(u.searchParams.has('_cr')){
        u.searchParams.delete('_cr');
        var clean=u.pathname+(u.search||'')+u.hash;
        window.history.replaceState({},'',clean);
      }
    }catch(e){}
  }

  // Once the app has rendered, disable this script entirely.
  // SPA navigation chunk errors are handled by _app.tsx routeChangeError.
  window.addEventListener('load',function(){
    var root=document.getElementById('__next');
    if(root&&root.children.length>0){
      handled=true;
      stripCacheBustParam();
    }
    if(!recovering&&count>0)try{sessionStorage.removeItem(KEY)}catch(e){}
    var bar=document.getElementById('__cr_bar');
    if(bar)bar.parentNode.removeChild(bar);
  });

  function clearAllCaches(cb){
    var done=0,total=1;
    function check(){if(++done>=total&&cb)cb();}
    if(typeof caches!=='undefined'){caches.keys().then(function(k){
      var toDelete=k.filter(function(n){return n.indexOf('pulse-image-cache')===-1;});
      return Promise.all(toDelete.map(function(n){return caches.delete(n)}));
    }).then(check).catch(check);}else{check();}
  }

  function showRecoveryBar(){
    if(document.getElementById('__cr_bar'))return;
    var bar=document.createElement('div');
    bar.id='__cr_bar';
    bar.style.cssText='position:fixed;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#3B82F6,#60A5FA,#3B82F6);background-size:200% 100%;animation:__cr_slide 1.5s ease-in-out infinite;z-index:100000';
    var style=document.createElement('style');
    style.textContent='@keyframes __cr_slide{0%{background-position:200% 0}100%{background-position:-200% 0}}';
    document.head.appendChild(style);
    document.body.appendChild(bar);
  }

  function showFallback(){
    try{sessionStorage.removeItem(KEY)}catch(e){}
    var d=document;
    d.body.innerHTML='';
    var c=d.createElement('div');
    c.style.cssText='position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#101114;color:#E6E7EA;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;z-index:99999';
    var urlInfo=failedUrl?'<p style="font-size:11px;color:#6B7280;margin:16px 0 0;font-family:monospace;word-break:break-all;max-width:360px">'+failedUrl+'</p>':'';
    c.innerHTML='<div style="text-align:center;max-width:420px;padding:32px"><h2 style="font-size:20px;font-weight:600;margin:0 0 12px;color:#fff">Something went wrong</h2><p style="font-size:14px;color:#9CA3AF;margin:0 0 24px;line-height:1.5">A new version may have been deployed. Please refresh to load the latest version.</p><button id="__cr_btn" style="background:#3B82F6;color:#fff;border:none;border-radius:8px;padding:12px 32px;font-size:14px;font-weight:500;cursor:pointer">Refresh</button>'+urlInfo+'</div>';
    d.body.appendChild(c);
    d.getElementById('__cr_btn').onclick=function(){
      try{sessionStorage.removeItem(KEY)}catch(e){}
      clearAllCaches(function(){window.location.href=buildCacheBustUrl();});
    };
  }

  function showOffline(){
    handled=true;
    var d=document;
    d.body.innerHTML='';
    var c=d.createElement('div');
    c.style.cssText='position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#101114;color:#E6E7EA;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;z-index:99999';
    c.innerHTML='<div style="text-align:center;max-width:420px;padding:32px"><h2 style="font-size:20px;font-weight:600;margin:0 0 12px;color:#fff">No internet connection</h2><p style="font-size:14px;color:#9CA3AF;margin:0 0 24px;line-height:1.5">Please check your connection and try again.</p><button id="__cr_btn" style="background:#3B82F6;color:#fff;border:none;border-radius:8px;padding:12px 32px;font-size:14px;font-weight:500;cursor:pointer">Retry</button></div>';
    d.body.appendChild(c);
    d.getElementById('__cr_btn').onclick=function(){window.location.href=buildCacheBustUrl();};
  }

  function doRecovery(chunkUrl){
    if(handled)return;
    handled=true;
    recovering=true;
    failedUrl=chunkUrl||'';
    console.error('[ChunkRecovery] Chunk load failed:',chunkUrl,'attempt:',(count+1)+'/'+MAX);

    if(!navigator.onLine){showOffline();return;}

    if(count<MAX){
      try{sessionStorage.setItem(KEY,(count+1)+'|'+Date.now())}catch(e){}
      showRecoveryBar();
      clearAllCaches(function(){
        setTimeout(function(){window.location.href=buildCacheBustUrl();},DELAYS[count]||3000);
      });
    }else{
      showFallback();
    }
  }

  // Only recover from Next.js chunk errors (/_next/ URLs).
  // Ignore third-party script/link failures — they are not fatal.
  window.addEventListener('error',function(e){
    var t=e.target;
    if(t&&(t.tagName==='SCRIPT'||t.tagName==='LINK')){
      var url=t.src||t.href||'';
      if(url.indexOf('/_next/')!==-1){
        doRecovery(url);
      }
    }
  },true);
})();
            `,
            }}
          />
        )}
        {/* Crisp Chatbot */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
window.$crisp=[];window.CRISP_WEBSITE_ID="c1ec6637-ab80-42d4-b17e-f6a8288faf14";(function(){d=document;s=d.createElement("script");s.src="https://client.crisp.chat/l.js";s.async=1;d.getElementsByTagName("head")[0].appendChild(s);})();
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
