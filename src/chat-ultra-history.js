// Pure reconciliation helpers for the visible Chat Ultra timeline.
export const CHAT_HISTORY_PAGE_SIZE=100;
export const CHAT_HISTORY_MAX_RENDER=1500;
const time=m=>Date.parse(m?.created_at||"")||0;
export function mergeChatHistory(previous,latest,limit=CHAT_HISTORY_MAX_RENDER){
  const map=new Map();
  for(const m of [...(previous||[]),...(latest||[])]){
    if(m&&typeof m.id==="string"&&m.id)map.set(m.id,m);
  }
  return [...map.values()]
    .sort((a,b)=>time(a)-time(b)||(a.id<b.id?-1:a.id>b.id?1:0))
    .slice(-Math.max(1,limit));
}
export function oldestChatTimestamp(messages){
  const finite=(messages||[]).map(time).filter(x=>Number.isFinite(x)&&x>0);
  return finite.length?new Date(Math.min(...finite)).toISOString():null;
}
export function hasChatHistoryPage(result,pageSize=CHAT_HISTORY_PAGE_SIZE){
  return Array.isArray(result)&&result.length>=pageSize;
}
