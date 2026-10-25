import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(projectRoot, "dist");
const outputRelative = path.relative(projectRoot, outputDirectory);
if (!outputRelative || outputRelative.startsWith("..") || path.isAbsolute(outputRelative)) {
  throw new Error("Build output must stay inside the project directory.");
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const file of ["index.html", "login.html", "login-teste.html", "login-neon.html", "realtime-neon.html", "home.html", "musicas.html", "chat.html", "conversa.html", "cartas.html", "notificacoes.html", "usuarios.html", "configuracoes.html", "perfil.html", "admin.html", "galeria.html", "styles.css"]) {
  await cp(path.join(projectRoot, file), path.join(outputDirectory, file));
}

await cp(path.join(projectRoot, "config.js"), path.join(outputDirectory, "config.js"));
await cp(path.join(projectRoot, "sw.js"), path.join(outputDirectory, "sw.js"));

await cp(path.join(projectRoot, "src"), path.join(outputDirectory, "src"), { recursive: true });
await cp(path.join(projectRoot, "assets"), path.join(outputDirectory, "assets"), { recursive: true });
console.log("Looply built with separate pages for login, home, music, conversations, letters, notifications, users, settings, profile, and administration, and gallery.");


// GitHub Pages now boots with Neon Auth. Keep the original HTML/CSS design while
// swapping the un-migrated Supabase controllers for the isolated Neon shell.
const appPages = new Set(["home.html","musicas.html","chat.html","conversa.html","cartas.html","notificacoes.html","usuarios.html","configuracoes.html","perfil.html","admin.html","galeria.html"]);
for (const file of ["index.html","login.html",...appPages]) {
  const filename = path.join(outputDirectory,file);
  let html = await readFile(filename,"utf8");
  const script = file === "index.html" ? "src/neon-production-splash.js" :
    file === "login.html" ? "src/neon-production-login.js" : "src/neon-production-pages.js";
  // Pages were built with one entrypoint at the bottom; reject unexpected layouts.
  const oldModule = /<script\s+type="module"\s+src="[^"]+"\s*><\/script>/g;
  const existing = [...html.matchAll(oldModule)];
  if (existing.length !== 1) throw new Error("Expected one module entrypoint in "+file+"; found "+existing.length);
  html = html.replace(oldModule,'<script type="module" src="'+script+'"></script>');
  await writeFile(filename,html,"utf8");
}
// Invalidate the old Supabase shell cache when GitHub Pages publishes Neon.
const swPath=path.join(outputDirectory,"sw.js");
let sw=await readFile(swPath,"utf8");
sw=sw.replace('looply-shell-v7','looply-neon-shell-20261025');
await writeFile(swPath,sw,"utf8");
console.log("GitHub Pages entries routed to Neon Auth; original CSS and HTML preserved.");
