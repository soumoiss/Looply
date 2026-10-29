// Apple Music's public catalogue is used only to correct song/artist search
// terms. These metadata hits are NOT audio licences or playable Story sources.
export function foldStorySearch(value) {
  return String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLocaleLowerCase("pt-BR").replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
}

function withinTypos(a,b) {
  if(a===b)return true;
  if(a.length<3||b.length<3||Math.abs(a.length-b.length)>2)return false;
  // Damerau adjacent transpositions support common phone typing mistakes.
  if(a.length===b.length) for(let i=0;i<a.length-1;i++){
    if(a[i]===b[i+1]&&a[i+1]===b[i]&&
       a.slice(0,i)===b.slice(0,i)&&a.slice(i+2)===b.slice(i+2))return true;
  }
  const editsLimit=a.length>6&&b.length>6?2:1;
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const next=[i];
    for(let j=1;j<=b.length;j++){
      next[j]=Math.min(next[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    }
    if(Math.min(...next)>editsLimit)return false;
    prev=next;
  }
  return prev[b.length]<=editsLimit;
}

export function suggestStoryQueryFromApple(input,appleTracks) {
  const words=foldStorySearch(input).split(" ").filter(Boolean).slice(0,8);
  if(!words.length||!Array.isArray(appleTracks))return "";
  let top=null;
  for(const track of appleTracks.slice(0,12)) {
    if(track?.provider!=="apple"||!track.title||!track.artist)continue;
    const title=foldStorySearch(track.title);
    const artist=foldStorySearch(track.artist);
    const candidates=[...new Set((title+" "+artist).split(" ").filter(Boolean))];
    const matched=words.filter(word=>candidates.some(token=>withinTypos(word,token)));
    const score=matched.length/words.length;
    // The candidate must resemble the user's words. Don't replace an
    // unrelated query just because Apple returned a popular song.
    if(score<0.65||!matched.length)continue;
    const exactTitle=words.some(word=>title.split(" ").some(token=>withinTypos(word,token)));
    if(!exactTitle&&words.length>1)continue;
    if(!top||score>top.score)top={score,track};
  }
  if(!top)return "";
  const correction=(top.track.title+" "+top.track.artist).replace(/\s+/g," ").trim().slice(0,70);
  return foldStorySearch(correction)===foldStorySearch(input)?"":correction;
}
