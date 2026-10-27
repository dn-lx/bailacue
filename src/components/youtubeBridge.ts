export type YouTubeObservation = {
  phase: "ready" | "playing" | "paused" | "buffering" | "ended" | "error";
  position: number;
  duration: number;
  error?: string;
  code?: number;
};
export type YouTubeEmbedProps = {
  videoId?: string;
  playlistId?: string;
  playing?: boolean;
  enforcePause?: boolean;
  rate?: number;
  seekRequest?: { seconds: number; key: number };
  onState?: (state: YouTubeObservation) => void;
  onEnd?: () => void;
  onPlaylist?: (ids: string[]) => void;
  onRates?: (rates: number[]) => void;
  onRate?: (rate: number) => void;
  fill?: boolean;
};
export function youtubeHtml(
  token: string,
  videoId?: string,
  playlistId?: string,
  origin = "https://app.bailacue.mobile",
  enforcePause = false,
) {
  if (videoId && !/^[\w-]{11}$/.test(videoId))
    throw new Error("Invalid YouTube video ID");
  if (playlistId && !/^[\w-]{10,120}$/.test(playlistId))
    throw new Error("Invalid YouTube playlist ID");
  const config = JSON.stringify({
    token,
    videoId,
    playlistId,
    origin,
    enforcePause,
  });
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="strict-origin-when-cross-origin"><style>html,body,#player{margin:0;width:100%;height:100%;min-height:200px;background:#080D18;overflow:hidden}</style></head><body><div id="player"></div><script>
  const config=${config};let player,ready=false,latest={},lastPlaylist='',lastSeek;
  function send(data){const msg={...data,token:config.token};if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(msg));else parent.postMessage(msg,'*')}
  function observe(phase,error,code){send({kind:'state',phase,code,position:ready?player.getCurrentTime()||0:0,duration:ready?player.getDuration()||0:0,error})}
  function playlist(){if(!ready||!player.getPlaylist)return;const ids=player.getPlaylist()||[];const key=ids.join(',');if(ids.length&&key!==lastPlaylist){lastPlaylist=key;send({kind:'playlist',ids})}}
  window.bailacueCommand=function(command){latest=command;if(!ready)return;try{if(typeof command.playing==='boolean'){if(command.playing)player.playVideo();else if(config.enforcePause||[1,3].includes(player.getPlayerState()))player.pauseVideo()}if(command.rate&&(player.getAvailablePlaybackRates()||[]).includes(command.rate))player.setPlaybackRate(command.rate);if(command.seek&&command.seek.key!==lastSeek){lastSeek=command.seek.key;player.seekTo(Math.max(0,command.seek.seconds),true)}}catch(e){observe('error','Playback controls could not be applied. Use the YouTube player controls.')}};
  window.addEventListener('message',event=>{if(event.source===parent&&event.data&&event.data.token===config.token&&event.data.kind==='command')window.bailacueCommand(event.data.command)});
  window.onYouTubeIframeAPIReady=function(){player=new YT.Player('player',{host:'https://www.youtube-nocookie.com',videoId:config.videoId,playerVars:{playsinline:1,controls:1,rel:0,origin:config.origin,...(config.playlistId?{listType:'playlist',list:config.playlistId}:{})},events:{onReady:function(){ready=true;if(config.playlistId&&player.cuePlaylist)player.cuePlaylist({listType:'playlist',list:config.playlistId,index:0,startSeconds:0});observe('ready');send({kind:'rates',rates:player.getAvailablePlaybackRates()});playlist();window.bailacueCommand(latest)},onStateChange:function(event){if(event.data===1&&config.enforcePause&&latest.playing===false){player.pauseVideo();return}const phase=({0:'ended',1:'playing',2:'paused',3:'buffering',5:'ready'})[event.data];if(phase)observe(phase);playlist();if(event.data===0)send({kind:'end'})},onPlaybackRateChange:function(event){send({kind:'rate',rate:event.data})},onError:function(event){const errors={2:'Invalid video link.',5:'The embedded player cannot play this video.',100:'This video is private or no longer available.',101:'The creator disabled embedded playback.',150:'The creator disabled embedded playback.',153:'YouTube could not verify this embedded player. Open the video in YouTube.'};observe('error',errors[event.data]||'YouTube playback is unavailable. Open in YouTube.',event.data)}}})};
  const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.referrerPolicy='strict-origin-when-cross-origin';script.onerror=()=>observe('error','YouTube is unreachable. Check your connection.');document.head.appendChild(script);
  const timeout=setTimeout(()=>{if(!ready)observe('error','YouTube is taking too long to load. Retry online or open in YouTube.')},20000);
  const timer=setInterval(()=>{if(ready){const s=player.getPlayerState();if(s===1)observe('playing');playlist()}},500);window.addEventListener('pagehide',()=>{clearInterval(timer);clearTimeout(timeout);if(player&&player.destroy)player.destroy()});
  </script></body></html>`;
}
export function handleYouTubeMessage(
  value: unknown,
  token: string,
  props: YouTubeEmbedProps,
) {
  const data = typeof value === "string" ? JSON.parse(value) : value;
  if (!data || typeof data !== "object" || data.token !== token) return;
  if (data.kind === "playlist" && Array.isArray(data.ids)) {
    const ids = [
      ...new Set<string>(
        data.ids.filter(
          (id: unknown) => typeof id === "string" && /^[\w-]{11}$/.test(id),
        ),
      ),
    ];
    if (ids.length <= 5000) props.onPlaylist?.(ids);
  }
  if (data.kind === "end") props.onEnd?.();
  if (data.kind === "rates" && Array.isArray(data.rates))
    props.onRates?.(
      data.rates.filter(
        (rate: unknown) => typeof rate === "number" && rate > 0 && rate <= 2,
      ),
    );
  if (
    data.kind === "rate" &&
    typeof data.rate === "number" &&
    data.rate > 0 &&
    data.rate <= 2
  )
    props.onRate?.(data.rate);
  if (
    data.kind === "state" &&
    ["ready", "playing", "paused", "buffering", "ended", "error"].includes(
      data.phase,
    )
  )
    props.onState?.({
      phase: data.phase,
      position: Number.isFinite(data.position) ? Math.max(0, data.position) : 0,
      duration: Number.isFinite(data.duration) ? Math.max(0, data.duration) : 0,
      code: typeof data.code === "number" ? data.code : undefined,
      error: typeof data.error === "string" ? data.error : undefined,
    });
}
