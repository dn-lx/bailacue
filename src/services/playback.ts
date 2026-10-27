import type { VideoPlayer } from "expo-video";
// Expo VideoPlayer is a mutable native handle; mutations are its documented API.
export function seek(player: VideoPlayer, seconds: number) {
  player.currentTime = seconds;
}
export function setRate(player: VideoPlayer, rate: number) {
  player.playbackRate = rate;
}
export function mute(player: VideoPlayer, muted: boolean) {
  player.muted = muted;
}
