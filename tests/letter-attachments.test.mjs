import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createLetterAttachmentComposer, encodeAttachment, decodeAttachment, encryptAttachment, decryptAttachment } from "../src/letter-attachments.js";

const actor="11111111-1111-4111-8111-111111111111";
const salt = Buffer.from(new Uint8Array(16).fill(7)).toString("base64url");
class Element {
  constructor(tag = "div") { this.tagName=tag.toUpperCase();this.children=[];this.listeners=new Map();this.hidden=false;this.disabled=false;this.files=[];this.value="";this.textContent=""; }
  addEventListener(event,fn) { const entries=this.listeners.get(event)||[];entries.push(fn);this.listeners.set(event,entries); }
  async trigger(event) { for(const fn of this.listeners.get(event)||[]) await fn({target:this}); }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children=items; }
  setAttribute(name,value) { this[name]=value; }
  click() { return this.trigger("click"); }
}
function withFakeDom(fn) {
  const originalDocument=globalThis.document, originalWindow=globalThis.window;
  globalThis.document={createElement:tag=>new Element(tag)};
  globalThis.window={addEventListener:()=>{}};
  return Promise.resolve().then(fn).finally(()=>{globalThis.document=originalDocument;globalThis.window=originalWindow;});
}
function createDom() {
  const ids=["#letterFileInput","#letterImport","#letterRecord","#letterStopRecord","#letterFileList","#letterFileStatus"];
  const nodes=new Map(ids.map(id=>[id,new Element(id)]));
  const root={querySelector:key=>nodes.get(key)};
  return {nodes,root};
}

test("letter files: system picker accepts images and documents, wraps arbitrary formats safely, uploads and clears",async()=>{
  await withFakeDom(async()=>{
    const {nodes,root}=createDom();
    const picker=createLetterAttachmentComposer(root,()=>{});
    const input=nodes.get("#letterFileInput");
    input.files=[new File(["photo"],"foto.png",{type:"image/png"}),
      new File(["%PDF-1.7"],"arquivo.pdf",{type:"application/pdf"}),
      new File(["<script>"],"ataque.html",{type:"text/html"})];
    await input.trigger("change");
    assert.equal(picker.count,3);
    assert.equal(input.value,"");
    assert.equal(nodes.get("#letterFileList").children.length,3);
    const uploads=[];
    const client={storage:{from:bucket=>{
      assert.equal(bucket,"looply-letters");
      return {upload:async(path,file,options)=>{ uploads.push({path,file,options});return {error:null,data:{path}}; }};
    }}};
    const result=await picker.upload(actor,{client});
    assert.equal(result.metadata.length,3);
    assert.equal(uploads.length,3);
    assert.ok(result.metadata.every(item=>item.path.startsWith(actor+"/")));
    assert.deepEqual(result.metadata.map(item=>item.type),["image/png","application/pdf","text/html"]);
    assert.equal(result.metadata[2].encoded,true);
    assert.equal(uploads[2].options.contentType,"text/plain");
    assert.ok(!(await uploads[2].file.text()).includes("<script>"));
    const roundtrip=await decodeAttachment(uploads[2].file,result.metadata[2]);
    assert.equal(await roundtrip.text(),"<script>");
    assert.equal(roundtrip.type,"application/octet-stream");
    assert.ok(uploads.every(item=>item.options.upsert===false));
    picker.clear();
    assert.equal(picker.count,0);
  });
});

test("password protected attachments: only ciphertext leaves browser; correct password decrypts",async()=>{
  const content="Uma gravação reservada para carta privada.";
  const file=new File([content],"nota.txt",{type:"text/plain"});
  const sealed=await encryptAttachment(file,actor,"senha-forte-2026",salt);
  assert.equal(sealed.blob.type,"text/plain");
  const envelope=await sealed.blob.text();
  assert.match(envelope,/^LOOPLY-LETTER-ENC-V1\n/);
  assert.ok(!envelope.includes(content));
  const metadata={name:file.name,type:file.type,iv:sealed.iv,encrypted:true};
  const letter={id:actor,password_salt:salt};
  const opened=await decryptAttachment(sealed.blob,metadata,letter,"senha-forte-2026");
  assert.equal(await opened.text(),content);
  await assert.rejects(()=>decryptAttachment(sealed.blob,metadata,letter,"senha-errada"));
});

test("visible card editor binds native file chooser, voice recorder and secure upload before send",async()=>{
  const page=await readFile(new URL("../assets/js/letters.js",import.meta.url),"utf8");
  const style=await readFile(new URL("../assets/css/pages/letters.css",import.meta.url),"utf8");
  assert.match(page,/id="letterFileInput" type="file" multiple/);
  assert.match(page,/createLetterAttachmentComposer\(root, notify\)/);
  assert.match(page,/createLetterAttachmentReader\(root, client\)/);
  assert.match(page,/composerAttachments\.upload\(createdId/);
  assert.match(page,/await client\.from\("community_letters"\)\.delete\(\)\.eq\("id",createdId\)/);
  assert.match(page,/readerAttachments\.render\(letter,\$\("#senhaLeituraNova"\)\.value\)/);
  assert.match(style,/#modalEscrever \.letter-compose-files/);
  assert.match(style,/#modalLeituraNova \.letter-read-attachments/);
});
