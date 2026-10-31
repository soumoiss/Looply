// Login identifiers are public aliases, not the user's private contact email.
// Neon Auth still stores the technical alias internally, but sign-in needs only
// an @username and password. Historical accounts retain their original aliases.
export const accounts=Object.freeze({
  patati:"patati@loooply.app",gaberinjela:"gaberinjela@loooply.app",
  misol:"misol@loooply.app",yara:"yara@loooply.app",
  peixinho:"peixinho@loooply.app",eukeiliane:"keilageo@loooply.app",
  // Confirmed existing technical Neon Auth login; the profile username differs
  // from the auth alias. Preserve the user and password, do not create duplicates.
  angel0v:"angeloeng@loooply.app",angelo:"angeloeng@loooply.app"
});
export function emailOf(value){
  const identity=String(value??"").trim().toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").replace(/^@/,"");
  if(accounts[identity])return accounts[identity];
  if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity))return identity;
  return /^[a-z0-9_]{3,30}$/.test(identity)?identity+"@loooply.app":null;
}
