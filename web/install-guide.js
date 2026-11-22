/* Shared browser installation guide for BailaCue and LexStik. Illustrations are schematic, not screenshots. */
(() => {
  "use strict";
  const guides = [
    {id:"android",name:"Android phone/tablet",browser:"Chrome",help:"https://support.google.com/chrome/answer/9658361?hl=en",steps:[
      ["Open in Chrome","Open this site in Google Chrome, not a browser inside another app.","page","Chrome"],
      ["Open the menu","Tap the three-dot menu (⋮) beside the address bar.","menu","⋮ Menu"],
      ["Choose Install","Tap “Install app” (or “Add to Home screen”), then confirm.","selection","Install app"],
      ["Launch your app","Look for the new icon on your Home screen or in your app drawer.","home","App icon"]]},
    {id:"samsung",name:"Samsung Galaxy",browser:"Samsung Internet",help:"https://www.samsung.com/support/",steps:[
      ["Open in Samsung Internet","Visit this site in Samsung Internet.","page","Internet"],
      ["Open the menu","Tap the menu (☰), usually at the bottom of the screen.","menu","☰ Menu"],
      ["Add to Home screen","Choose “Add page to” then “Home screen”. Menu names can vary.","selection","Home screen"],
      ["Confirm","Tap “Add” and open the new icon on your Home screen.","home","App icon"]]},
    {id:"iphone",name:"iPhone",browser:"Safari",help:"https://support.apple.com/guide/iphone/iphea86e5236/ios",steps:[
      ["Open in Safari","Open this website in Safari. Leave any in-app browser first.","page","Safari"],
      ["Tap Share","Tap Share (square with up arrow). On some versions use the Page Menu first.","share","Share ↑"],
      ["Add to Home Screen","Find “Add to Home Screen” in the Share sheet. Enable “Open as Web App” when available.","selection","Add to Home Screen"],
      ["Tap Add","Confirm with “Add”. Launch the icon on your Home Screen.","home","App icon"]]},
    {id:"ipad",name:"iPad",browser:"Safari",help:"https://support.apple.com/guide/ipad/ipad8f1f7a29/ipados",steps:[
      ["Open in Safari","Visit this website in Safari on your iPad.","page","Safari"],
      ["Tap Share","Tap Share (square with up arrow) in Safari’s toolbar.","share","Share ↑"],
      ["Add to Home Screen","Select “Add to Home Screen”; enable “Open as Web App” if offered.","selection","Add to Home Screen"],
      ["Tap Add","Confirm and launch the new icon on your iPad Home Screen.","home","App icon"]]},
    {id:"chrome",name:"Windows / Chromebook",browser:"Google Chrome",help:"https://support.google.com/chrome/answer/9658361?hl=en",steps:[
      ["Open Chrome","Open the website in Google Chrome on your computer.","page","Chrome"],
      ["Find Install","Look for an install icon in the address bar, or open the three-dot menu (⋮).","menu","⋮ Menu"],
      ["Install page as app","Select “Cast, save and share” → “Install page as app” (wording varies).","selection","Install page as app"],
      ["Launch","Open the app from Start, the application launcher, or the desktop.","desktop","Installed app"]]},
    {id:"edge",name:"Windows / Mac",browser:"Microsoft Edge",help:"https://support.microsoft.com/microsoft-edge",steps:[
      ["Open Microsoft Edge","Open this website in Edge.","page","Edge"],
      ["Open the menu","Click the three-dot menu (⋯) at the upper right.","menu","⋯ Menu"],
      ["Install as an app","Choose “Apps” (possibly under “More tools”), then “Install this site as an app”.","selection","Install this site"],
      ["Launch","Find the installed app in your application launcher.","desktop","Installed app"]]},
    {id:"mac",name:"Mac",browser:"Safari (macOS 14+)",help:"https://support.apple.com/guide/safari/ibrw9e991864/mac",steps:[
      ["Open in Safari","Visit the site in Safari on macOS Sonoma or later.","page","Safari"],
      ["Open File menu","In the top menu bar, click File, or use the toolbar Share button.","menu","File"],
      ["Add to Dock","Choose “Add to Dock” and confirm the name.","selection","Add to Dock"],
      ["Launch the web app","Open the icon from your Dock, Applications, or Spotlight.","desktop","Dock icon"]]}
  ];
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function device() {
    const ua = navigator.userAgent;
    if (/iPad/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ipad";
    if (/iPhone|iPod/i.test(ua)) return "iphone";
    if (/Android/i.test(ua)) return /SamsungBrowser/i.test(ua) ? "samsung" : "android";
    if (/Edg\//i.test(ua)) return "edge";
    if (/Macintosh/i.test(ua) && /Safari/i.test(ua) && !/Chrome/i.test(ua)) return "mac";
    return "chrome";
  }
  function illustration(kind, caption, wide) {
    const x = wide ? 8 : 64, width = wide ? 260 : 148, mx = x + width - 112;
    const title = escapeHtml(caption.length > 17 ? caption.slice(0,16) + "…" : caption);
    let mark = "";
    if (kind === "page") mark =
      '<rect x="'+(x+17)+'" y="55" width="'+(width-34)+'" height="75" rx="9" fill="#e1eafb"/>' +
      '<circle cx="'+(x+45)+'" cy="79" r="11" fill="#91b6e7"/>' +
      '<path d="M'+(x+40)+' 79l4 5 9-11" fill="none" stroke="#fff" stroke-width="3"/>' +
      '<rect x="'+(x+65)+'" y="72" width="'+(width-92)+'" height="8" rx="4" fill="#a2bde0"/>' +
      '<rect x="'+(x+29)+'" y="102" width="'+(width-58)+'" height="6" rx="3" fill="#b0c6e2"/>';
    else if (kind === "home" || kind === "desktop") mark =
      '<rect x="'+(x+16)+'" y="55" width="'+(width-32)+'" height="72" rx="10" fill="#e1eafb"/>' +
      '<rect x="'+(x+width/2-21)+'" y="61" width="42" height="42" rx="12" fill="#2f64a4"/>' +
      '<path d="M'+(x+width/2-11)+' 83l7 7 17-19" fill="none" stroke="white" stroke-width="4" stroke-linecap="round"/>' +
      '<text x="'+(x+width/2)+'" y="117" text-anchor="middle" font-size="9" fill="#42628b">App icon</text>';
    else mark =
      '<rect x="'+mx+'" y="44" width="106" height="86" rx="7" fill="#fff" stroke="#9eafc8"/>' +
      '<text x="'+(mx+10)+'" y="62" font-size="9" fill="#536886">Browser options</text>' +
      '<path d="M'+(mx+8)+' 72h90" stroke="#d5e1f1"/>' +
      '<rect x="'+(mx+5)+'" y="79" width="96" height="33" rx="5" fill="#dbeafd" stroke="#3678c6" stroke-width="2"/>' +
      '<text x="'+(mx+10)+'" y="98" font-size="8.5" font-weight="700" fill="#234f88">'+title+'</text>' +
      '<circle cx="'+(x+width-18)+'" cy="27" r="10" fill="#dbeafd" stroke="#3678c6"/>' +
      '<text x="'+(x+width-22)+'" y="31" font-size="14" fill="#234f88">'+(kind === "share" ? "↑" : "⋮")+'</text>';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 276 155" role="img" aria-label="Illustration: '+escapeHtml(caption)+'" class="ig-image">' +
      '<rect x="'+x+'" y="7" width="'+width+'" height="142" rx="'+(wide?9:17)+'" fill="#f9fcff" stroke="#647d9c" stroke-width="3"/>' +
      '<rect x="'+(x+10)+'" y="16" width="'+(width-20)+'" height="24" rx="7" fill="#e4edf8"/>' +
      '<circle cx="'+(x+23)+'" cy="28" r="4" fill="#8db0de"/>' +
      '<text x="'+(x+34)+'" y="31" font-size="10" fill="#526b8d">website</text>' + mark + '</svg>';
  }
  const styles = [
    ".ig-dialog{border:0;padding:0;background:transparent;color:#17283d;max-width:min(920px,calc(100vw - 18px));width:920px;max-height:calc(100dvh - 18px);overflow:visible}",
    ".ig-dialog::backdrop{background:#091525bc}",
    ".ig-shell{font:15px/1.5 system-ui,-apple-system,sans-serif;background:#f6f9fe;border-radius:18px;overflow:hidden;box-shadow:0 24px 80px #09152580;max-height:calc(100dvh - 18px);display:flex;flex-direction:column}",
    ".ig-head{display:flex;justify-content:space-between;gap:14px;padding:20px 22px;background:white;border-bottom:1px solid #dce4f0}",
    ".ig-head h2{font:700 clamp(21px,3vw,27px)/1.2 system-ui,sans-serif;margin:3px 0;color:#17283d}",
    ".ig-head p{margin:4px 0 0;color:#4d627d;font-size:13px}",
    ".ig-eyebrow{font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#2663a5}",
    ".ig-close{width:44px;height:44px;flex:none;font-size:26px;border:1px solid #cfdaeb;background:#fff;color:#263e5e;border-radius:10px;cursor:pointer}",
    ".ig-scroll{padding:19px 22px 24px;overflow:auto;overscroll-behavior:contain}",
    ".ig-choices{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px}",
    ".ig-choice{flex:1 1 125px;min-height:48px;border:1px solid #cbd9e9;background:#fff;border-radius:11px;padding:8px 11px;color:#243b58;text-align:left;display:grid;gap:1px;cursor:pointer;font:inherit}",
    ".ig-choice strong{font-size:13px}.ig-choice small{font-size:11px;color:#566a83}",
    ".ig-choice[aria-pressed=true]{background:#e2efff;outline:2px solid #3978bf;outline-offset:-2px}",
    ".ig-intro{background:#e9f2fd;border:1px solid #d3e1f1;border-radius:12px;padding:12px 15px;margin-bottom:16px;color:#243b58}",
    ".ig-intro strong{display:block}.ig-intro p{font-size:13px;line-height:1.5;margin:3px 0}",
    ".ig-install-now{min-height:44px;border:0;border-radius:9px;background:#2868ae;color:#fff;padding:10px 15px;cursor:pointer;font-weight:700;margin-top:8px}",
    ".ig-steps{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}",
    ".ig-step{background:white;border:1px solid #dce4f0;border-radius:13px;padding:14px;min-width:0}",
    ".ig-step-head{display:flex;align-items:center;gap:9px}.ig-step-head span{width:28px;height:28px;display:grid;place-items:center;flex:none;border-radius:50%;background:#2868ae;color:white;font-size:13px;font-weight:800}",
    ".ig-step h3{font:700 15px/1.4 system-ui,sans-serif;color:#182a43;margin:0}",
    ".ig-art{border-radius:10px;background:#edf3fb;overflow:hidden;margin:10px 0;padding:3px}",
    ".ig-image{display:block;width:100%;max-width:300px;height:auto;margin:auto}",
    ".ig-step p{font-size:13px;line-height:1.55;color:#4b5c72;margin:0}",
    ".ig-note{font-size:12px;color:#4e617d;line-height:1.6;margin:15px 0 0}",
    ".ig-note a{color:#185ca3;text-decoration:underline}",
    ".ig-dialog button:focus-visible,.ig-dialog a:focus-visible,[data-install-guide-open]:focus-visible{outline:3px solid #4f9afd;outline-offset:3px}",
    ".ig-shortcut{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid #bed2e9;border-radius:9px;background:#e8f2ff;color:#19558d;font:700 13px system-ui,sans-serif;padding:9px 12px;min-height:44px;cursor:pointer}",
    ".ig-shortcut-mobile{border:1px solid #bed2e9;border-radius:9px;background:transparent;color:inherit;font:700 12px system-ui,sans-serif;padding:8px;min-height:44px;cursor:pointer}",
    "@media(max-width:600px){.ig-head{padding:15px}.ig-scroll{padding:13px}.ig-steps{grid-template-columns:1fr}.ig-choice{flex-basis:calc(50% - 6px)}}",
    "@media(prefers-reduced-motion:reduce){.ig-dialog *{scroll-behavior:auto!important}}"
  ].join("\n");

  function init() {
    if (document.getElementById("ig-dialog")) return;
    const style=document.createElement("style");style.textContent=styles;document.head.appendChild(style);
    const dlg=document.createElement("dialog");dlg.id="ig-dialog";dlg.className="ig-dialog";dlg.setAttribute("aria-labelledby","ig-title");
    dlg.innerHTML='<div class="ig-shell"><div class="ig-head"><div><div class="ig-eyebrow">Install as an app</div><h2 id="ig-title">Put this app on your device</h2><p>Choose a device to see illustrated steps.</p></div><button type="button" class="ig-close" aria-label="Close install guide" data-ig-close>×</button></div><div class="ig-scroll"><div class="ig-choices" role="group" aria-label="Choose device or browser"></div><div class="ig-content" aria-live="polite"></div></div></div>';
    document.body.appendChild(dlg);
    let selected=device(),installEvent=null,returnFocus=null;
    function draw() {
      const g=guides.find(x=>x.id===selected)||guides[0];
      dlg.querySelector(".ig-choices").innerHTML=guides.map(x=>'<button type="button" class="ig-choice" data-ig-choice="'+x.id+'" aria-pressed="'+(x.id===selected)+'"><strong>'+escapeHtml(x.name)+'</strong><small>'+escapeHtml(x.browser)+'</small></button>').join("");
      const installed=matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
      const intro='<div class="ig-intro"><strong>'+escapeHtml(g.name+' · '+g.browser)+'</strong><p>'+(installed?'You are already viewing an installed web app. You can still review the steps.':'No app-store download is required. This places the web version on your Home screen or app launcher; it may still require an internet connection.')+'</p>'+
        (installEvent&&!installed&&["android","chrome","edge"].includes(selected)?'<button type="button" class="ig-install-now" data-ig-prompt>Install now</button>':'')+'</div>';
      const wide=["chrome","edge","mac"].includes(g.id);
      dlg.querySelector(".ig-content").innerHTML=intro+'<ol class="ig-steps">'+g.steps.map((s,i)=>'<li class="ig-step"><div class="ig-step-head"><span>'+(i+1)+'</span><h3>'+escapeHtml(s[0])+'</h3></div><div class="ig-art">'+illustration(s[2],s[3],wide)+'</div><p>'+escapeHtml(s[1])+'</p></li>').join("")+'</ol>'+
      '<p class="ig-note">These are illustrations, not exact browser screenshots. Menus differ by browser version. If the option is missing, open the site in the recommended browser and update it. <a href="'+escapeHtml(g.help)+'" target="_blank" rel="noopener noreferrer">Official browser help</a>. This is the web version, not a native app-store download.</p>';
    }
    addEventListener("beforeinstallprompt", e=>{e.preventDefault();installEvent=e;if(dlg.open)draw();});
    addEventListener("appinstalled",()=>{installEvent=null;if(dlg.open)draw();});
    dlg.addEventListener("click",e=>{
      const el=e.target instanceof Element?e.target:null;
      if(!el)return;
      if(el.closest("[data-ig-close]")){dlg.close();return;}
      const choice=el.closest("[data-ig-choice]");
      if(choice){selected=choice.getAttribute("data-ig-choice");draw();dlg.querySelector('[data-ig-choice="'+selected+'"]')?.focus();return;}
      if(el.closest("[data-ig-prompt]")&&installEvent){const prompt=installEvent;installEvent=null;prompt.prompt();prompt.userChoice.finally(draw);}
      if(el===dlg)dlg.close();
    });
    dlg.addEventListener("close",()=>{if(returnFocus&&returnFocus.isConnected)returnFocus.focus();});
    document.addEventListener("click",e=>{
      const trigger=e.target instanceof Element?e.target.closest("[data-install-guide-open]"):null;
      if(!trigger)return;
      e.preventDefault();returnFocus=trigger;draw();if(!dlg.open)dlg.showModal();dlg.querySelector("[data-ig-close]")?.focus();
    });
    // The other app uses client-side rendering, so no static dependency on framework markup.
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();