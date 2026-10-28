import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fetchFullLetterForEdit, saveFullLetterEdit, unlockFullLetterForEdit } from "../src/letter-edit-service.js";
import { sealLetter, openProtectedLetter } from "../src/letters-community.js";

const read = file => readFile(new URL("../" + file, import.meta.url), "utf8");

function localDatabase(rows, actor = "sender", admin = false) {
  const storage = {
    archived_cards: structuredClone(rows.archived_cards || []),
    community_letters: structuredClone(rows.community_letters || [])
  };
  const calls = [];
  return {
    calls, storage,
    client: {
      from(table) {
        const filters = [], operation = {changes:null};
        const query = {
          select(columns) { operation.columns = columns; return query; },
          eq(key,value) { filters.push([key,value]); return query; },
          update(changes) { operation.changes = changes; return query; },
          single() {
            const row = storage[table]?.find(item => filters.every(([key,value]) => item[key] === value));
            const allowed = table === "archived_cards" ? admin :
              Boolean(row && (admin || row.sender_id === actor || (operation.changes === null && row.recipient_id === actor)));
            calls.push({table,filters:[...filters],changes:operation.changes,allowed});
            if (!row || !allowed) return Promise.resolve({data:null,error:{message:"row_count_mismatch"}});
            if (operation.changes) Object.assign(row, operation.changes);
            return Promise.resolve({data:structuredClone(row),error:null});
          }
        };
        return query;
      }
    }
  };
}

test("full-letter reader does not use the short title or partial list value", async () => {
  const message = "Início.\n\n" + "Um parágrafo extenso com acentos e 😀.\n".repeat(215) + "\nFIM.";
  assert.ok(message.length > 5000);
  const original = {id:"a",recipient_id:"recipient",original_file:"teste",is_private:false,is_protected:false,body:message};
  const db = localDatabase({archived_cards:[original]}, "admin", true);
  const fetched = await fetchFullLetterForEdit(db.client,"archive","a","admin",true);
  assert.equal(fetched.body,message);
  const updated = message.replace("FIM.", "CONCLUÍDO.");
  const saved = await saveFullLetterEdit(db.client,{
    kind:"archive",letter:fetched,userId:"admin",isAdmin:true,body:updated,isPrivate:false,passwordHint:""
  });
  assert.equal(saved.body,updated);
  assert.equal((await fetchFullLetterForEdit(db.client,"archive","a","admin",true)).body,updated);
  assert.equal(db.calls.filter(call => call.changes !== null).length,1);
  assert.equal(db.calls.filter(call => call.changes === null).length,3);
});

test("short and multi-paragraph ordinary correspondence remains exact after write and reread", async () => {
  for (const body of ["Olá, tudo bem? 😀","  Primeiro parágrafo.\n\nSegundo parágrafo com ação e café ☕.\n"]) {
    const db = localDatabase({community_letters:[{id:"b",sender_id:"sender",recipient_id:"recipient",subject:"Assunto",body:"Mensagem antiga",is_protected:false}]});
    const fetched = await fetchFullLetterForEdit(db.client,"community","b","sender",false);
    const saved = await saveFullLetterEdit(db.client,{kind:"community",letter:fetched,userId:"sender",body,subject:"Título atualizado"});
    assert.equal(saved.body,body);
    assert.equal(saved.subject,"Título atualizado");
    assert.ok(db.calls.find(call => call.changes)?.filters.some(([key,value]) => key === "sender_id" && value === "sender"));
  }
});

test("recipient and unrelated user cannot load or save another sender's letter", async () => {
  const row = {id:"c",sender_id:"sender",recipient_id:"recipient",subject:"Privado",body:"Só o remetente edita",is_protected:false};
  const db = localDatabase({community_letters:[row]}, "recipient");
  await assert.rejects(fetchFullLetterForEdit(db.client,"community","c","recipient",false),/não foi possível carregar/i);
  await assert.rejects(saveFullLetterEdit(db.client,{kind:"community",letter:row,userId:"recipient",subject:"Troca",body:"Hack"}),/Somente o remetente/);
  await assert.rejects(fetchFullLetterForEdit(db.client,"archive","a","recipient",false),/Somente a administração/);
  assert.equal(db.calls.some(call => call.changes),false);
});

test("protected correspondence unlocks with the current password and preserves formatting after resealing", async () => {
  const password = "SenhaMuitoForte";
  const plaintext = "\nAção e café. ☕\n\nFim da carta. 😀\n";
  const protectedFields = await sealLetter("Texto antigo",password,"Assunto");
  const db = localDatabase({community_letters:[{
    id:"p",sender_id:"sender",recipient_id:"recipient",subject:"Assunto",is_protected:true,...protectedFields
  }]});
  const fetched = await fetchFullLetterForEdit(db.client,"community","p","sender",false);
  await assert.rejects(unlockFullLetterForEdit(fetched,"senha-errada"),/Senha incorreta/);
  assert.equal(await unlockFullLetterForEdit(fetched,password),"Texto antigo");
  const saved = await saveFullLetterEdit(db.client,{kind:"community",letter:fetched,userId:"sender",body:plaintext,subject:"Assunto novo",password});
  assert.equal(saved.body,null);
  assert.equal(await openProtectedLetter(saved,password),plaintext);
});

test("original protected card never treats its null body as an editable empty letter", async () => {
  const card = {id:"x",recipient_id:"recipient",is_protected:true,is_private:true,body:null,password_hint:"Dica"};
  const db = localDatabase({archived_cards:[card]}, "admin", true);
  const fetched = await fetchFullLetterForEdit(db.client,"archive","x","admin",true);
  await assert.rejects(unlockFullLetterForEdit(fetched,"password"),/não está disponível/);
  await assert.rejects(saveFullLetterEdit(db.client,{kind:"archive",letter:fetched,userId:"admin",isAdmin:true,body:"texto inventado"}),/Não é possível alterar/);
  assert.equal(db.storage.archived_cards[0].body,null);
});

test("failed persistence does not modify original correspondence in the mock store", async () => {
  const row = {id:"d",sender_id:"sender",recipient_id:"other",subject:"Original",body:"Não mudar",is_protected:false};
  const db = localDatabase({community_letters:[row]},"intruder");
  await assert.rejects(saveFullLetterEdit(db.client,{kind:"community",letter:row,userId:"sender",body:"alteração",subject:"Novo"}),/row_count_mismatch|não confirmou/i);
  assert.equal(db.storage.community_letters[0].body,"Não mudar");
});

test("visible editor renders complete-content field, password unlock, cancel and owner edit affordances", async () => {
  const [page, archive, module] = await Promise.all([
    read("assets/js/letters.js"),read("src/archived-cards.js"),read("src/letter-edit-service.js")
  ]);
  assert.doesNotMatch(page,/Envie mensagens e memórias para pessoas do Looply/);
  assert.match(page,/fetchFullLetterForEdit\(client, kind, id, user\.id, isAdmin\)/);
  assert.match(page,/form\.elements\.body\.value = unlockedText !== null \? unlockedText : full\.is_protected \? "" : full\.body/);
  assert.match(page,/form\.elements\.body\.removeAttribute\("maxlength"\)/);
  assert.match(page,/data-edit-kind/);
  assert.match(page,/c\.raw\.sender_id===user\.id/);
  assert.match(page,/desbloquearEdicaoCarta/);
  assert.match(page,/editorAdminCarta/);
  assert.match(page,/if \(generation !== editLoadGeneration/);
  assert.match(page,/form\.dataset\.saving === "true"/);
  assert.doesNotMatch(archive,/window\.prompt\("Editar conteúdo da carta original/);
  assert.match(module,/\.eq\("sender_id", userId\)/);
});
