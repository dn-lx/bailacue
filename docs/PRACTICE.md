# Continuous Practice

Choose focus/break lengths, dances, optional physical/playlist sources, labels with
Match any/all, minimum stars, and phone-only or online videos. Include YouTube
explicitly if wanted. No selected dance means all dances in Practice. A preview
shows the queue count and next lessons before Start.

The algorithm draws a rating-weighted permutation without replacement: a 5★ video
has five times the selection weight of a 1★ video; unrated counts5★. Dances take
balanced turns so a large library cannot dominate. The resulting queue stays fixed
for Next/Previous. At its end, Repeat creates a new eligible cycle or Finish saves.
It does not claim there are unseen videos. Broken/missing items can be skipped.

Start begins the first ready video and active-time timer. Controls include seek,
±5 seconds, speed with preserved pitch, Mirror, resize and full screen for native files. Saved A–B
sections loop until disabled or Next is chosen. YouTube uses its actual embedded
player capabilities and a visible Open in YouTube fallback; it cannot be mirrored
or edited. Autoplay restrictions may require tapping its Play control; waiting time
does not count.

Focus measures actual playing wall time, independent of playback speed. Manual
pause, loading, app backgrounding and interruptions stop active focus accrual.
Break time is separate. Expiry pauses media and offers Continue/Finish. Returning
or restoring never autoplays. Progress is persisted every 5 seconds and at pause;
a sudden process termination can lose up to that last persistence interval.

Edit remaining queue pauses the session and asks for an explicit Apply action.
Current video, already-traversed history and elapsed time are retained. Finish saves
actual active seconds and visited video IDs once; repeated saves replace the same
session ID, avoiding double-counted weekly minutes. Library recency changes from
actual playback, not merely from inclusion in a queue.

See [verification](VERIFICATION.md) for Android/browser evidence and remaining
physical-call, live-YouTube and iOS runtime acceptance limits.
