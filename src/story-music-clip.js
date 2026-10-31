// Story soundtrack clipping is limited to recordings the author may publish.
// These offsets are applied to the real encoded soundtrack, never to a
// commercial catalogue preview or a third-party streaming-player proxy.
export function storyMusicStartSeconds(value, durationSeconds = Infinity) {
  const input = Number(value);
  if (!Number.isFinite(input) || input <= 0) return 0;
  const duration = Number(durationSeconds);
  const maximum = Number.isFinite(duration) && duration > 0
    ? Math.max(0, duration - 0.05)
    : Number.isFinite(duration) ? 0 : 3600;
  return Math.round(Math.min(input, maximum) * 10) / 10;
}

export function withStoryMusicStart(track, startSeconds = 0) {
  if (!track || (track.kind !== "file" && track.kind !== "openverse")) return track;
  return {...track, startSeconds: storyMusicStartSeconds(startSeconds)};
}
