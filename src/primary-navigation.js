import { icon } from "./icons.js";

/** Canonical Looply primary navigation. Do not reproduce this inside page content. */
export const primaryDestinations = Object.freeze([
  ["home","Início","home.html","home"],
  ["letters","Cartas","cartas.html","mail"],
  ["music","Músicas","musicas.html","music"],
  ["gallery","Galeria","galeria.html","camera"],
  ["chat","Chat","chat.html","chat"],
  ["notifications","Avisos","notificacoes.html","bell"]
]);

export function primaryNavigationMarkup(page, unreadCount=0) {
  const activePage=page==="conversation"?"chat":page;
  const links=primaryDestinations.map(([key,label,href,iconName])=>{
    const current=key===activePage?' aria-current="page"':"";
    const badge=key==="notifications"&&unreadCount>0
      ? '<span class="navigation-badge" aria-label="'+Math.min(9999,Math.trunc(unreadCount))+
        ' não lidas">'+(unreadCount>99?"99+":Math.trunc(unreadCount))+'</span>'
      :"";
    return '<a class="header-action" href="'+href+'" aria-label="'+label+'"'+current+
      '><span class="page-navigation-icon" aria-hidden="true">'+icon(iconName)+
      '</span><span class="page-navigation-label">'+label+'</span>'+badge+'</a>';
  }).join("");
  return '<nav class="header-actions page-navigation" aria-label="Navegação principal">'+links+'</nav>';
}
