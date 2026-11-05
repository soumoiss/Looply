// A conservative cross-provider recording identity. Never merge different
// artists or live/acoustic/remaster/studio versions by title alone.
const keyText=value=>String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
  .toLocaleLowerCase("pt-BR").replace(/\b(feat\.?|featuring|ft\.?)\b/g,"feat")
  .replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");
const versionWords=/\b(live|ao vivo|acoustic|acustic[ao]|unplugged|remaster(?:ed)?|radio edit|extended|instrumental|demo|cover|remix|sped up|slowed|karaoke)\b/i;
export function songRecordingIdentity(song) {
  const title=keyText(song?.title);
  const artist=keyText(song?.artist);
  const version=keyText(song?.version || (String(song?.title||"").match(/\(([^)]*)\)|\[([^\]]*)\]/g)||[])
    .filter(x=>versionWords.test(x)).join(" "));
  const album=keyText(song?.album);
  const duration=Number(song?.durationSec);
  const isrc=/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(String(song?.isrc||"").toUpperCase())
    ? String(song.isrc).toUpperCase():"";
  return {title,artist,version,album,isrc,
    duration:Number.isFinite(duration)&&duration>0?duration:0};
}
export function sameStoryRecording(a,b) {
  if(a?.kind!==b?.kind && (a?.kind!=="catalog" || b?.kind!=="catalog"))return false;
  if(a?.provider===b?.provider &&
    a?.id && b?.id && String(a.id)===String(b.id))return true;
  const x=songRecordingIdentity(a),y=songRecordingIdentity(b);
  if(x.isrc && y.isrc)return x.isrc===y.isrc;
  if(!x.title||!x.artist||x.title!==y.title||x.artist!==y.artist||x.version!==y.version)
    return false;
  // Different named albums with no timings are not proof of identical audio.
  if(x.duration && y.duration)return Math.abs(x.duration-y.duration)<=2;
  return Boolean(x.album&&y.album&&x.album===y.album);
}
const rank=song=>song.provider==="audius"?3:song.provider==="apple"?2:1;
export function dedupeStorySongRecordings(songs) {
  const output=[];
  for(const song of songs||[]){
    if(!song)continue;
    const index=output.findIndex(existing=>sameStoryRecording(existing,song));
    if(index<0){output.push(song);continue;}
    // Keep an Audius stream over a provider-only promotional preview when
    // metadata provides high-confidence evidence of the same recording.
    if(rank(song)>rank(output[index]))output[index]=song;
  }
  return output;
}
