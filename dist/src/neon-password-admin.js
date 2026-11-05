import {createClient,SupabaseAuthAdapter} from "https://esm.sh/@neondatabase/neon-js@0.7.0-beta?bundle";
const auth=createClient({auth:{url:"https://ep-fancy-smoke-b7d6t1s6.neonauth.c-13.us-east-1.aws.neon.tech/neondb/auth",adapter:SupabaseAuthAdapter()},dataApi:{url:"https://ep-fancy-smoke-b7d6t1s6.apirest.c-13.us-east-1.aws.neon.tech/neondb/rest/v1"}}).auth;
const $=id=>document.getElementById(id);
const accounts=new Map([["peixinho","peixinho@loooply.app"],["patati","patati@loooply.app"],["misol","misol@loooply.app"],["yara","yara@loooply.app"],["gaberinjela","gaberinjela@loooply.app"],["eukeiliane","keilageo@loooply.app"]]);
const say=msg=>{$("status").textContent=msg};
async function init(){
 const session=await auth.getSession();
 if(session.error||!session.data?.session){say("Entre como peixinho no login Neon primeiro, e depois abra esta página.");return}
 const me=await auth.getUser();
 if(me.error||me.data?.user?.role!=="admin"){say("A conta conectada não possui permissão de administrador Neon Auth.");return}
 const result=await auth.admin.listUsers({query:{limit:100}});
 if(result.error)throw Error(result.error.message);
 const users=result.data?.users||[];
 for(const [name,email] of accounts){
  const matches=users.filter(u=>u.email?.toLowerCase()===email);
  if(matches.length!==1)throw Error("Conta não encontrada ou duplicada: "+name);
  const option=document.createElement("option");option.value=matches[0].id;option.textContent=name;$("account").append(option);
 }
 $("panel").hidden=false;say("Administrador verificado. Selecione a conta e digite a nova senha duas vezes.");
}
$("save").onclick=async()=>{
 const password=$("password").value,confirmed=$("confirm").value;
 if(password.length<12||password.length>128||password!==confirmed){say("As duas senhas devem coincidir e ter de 12 a 128 caracteres.");return}
 const account=$("account").selectedOptions[0].text;
 if(!confirm("Redefinir a senha da conta "+account+"?"))return;
 $("save").disabled=true;
 try{const result=await auth.admin.setUserPassword({userId:$("account").value,newPassword:password});if(result.error)throw Error(result.error.message);say("Senha da conta "+account+" redefinida. Teste um novo login.");}
 catch(e){say("Erro: "+e.message)}
 finally{$("password").value="";$("confirm").value="";$("save").disabled=false}
};
init().catch(e=>say("Falha na verificação administrativa: "+e.message));