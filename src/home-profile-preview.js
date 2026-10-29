// All member identity links lead to the shared, fully interactive profile page.
// The global runtime handles author buttons and the signed-in header avatar.
export function bindHomeProfilePreview({root,user}) {
  if(!root || root.__homeProfileBound)return;
  root.__homeProfileBound=true;
  root.addEventListener('click',event=>{
    const trigger=event.target.closest('[data-home-profile-peek]');
    if(!trigger)return;
    event.preventDefault();window.location.assign('perfil.html?usuario='+encodeURIComponent(user.id));
  });
}
