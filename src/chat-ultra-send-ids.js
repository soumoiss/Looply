// Stable client-side message IDs across retries in one app session.
// A lost HTTP acknowledgement must not create a second chat message when the
// user taps "Tentar novamente". The server still validates permission.
export function createUltraSendIds({createId=()=>globalThis.crypto.randomUUID(),max=40}={}){
  const pending=new Map();
  const key=(conversationId,body,replyTo)=>JSON.stringify([conversationId,replyTo||"",body]);
  return {
    get(conversationId,body,replyTo){
      const identity=key(conversationId,body,replyTo);
      if(pending.has(identity))return pending.get(identity);
      if(pending.size>=max)pending.delete(pending.keys().next().value);
      const id=createId();
      if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(id)))throw Error("Identificador de mensagem indisponível.");
      pending.set(identity,id);
      return id;
    },
    confirm(conversationId,body,replyTo){
      pending.delete(key(conversationId,body,replyTo));
    },
    clear(){pending.clear();},
    count(){return pending.size;}
  };
}
