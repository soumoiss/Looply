import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
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
// The service worker may retain a previous copy of this stable URL. Give the
// shared client a content-addressed URL so a deployment cannot mix a new page
// runtime with an older Neon client module.
const neonClientPath = path.join(outputDirectory, "src", "neon-production-client.js");
const neonClient = await readFile(neonClientPath, "utf8");
const neonClientVersion = createHash("sha256").update(neonClient).digest("hex").slice(0, 16);
const pageRuntimePath = path.join(outputDirectory, "src", "page-runtime.js");
const pageRuntime = await readFile(pageRuntimePath, "utf8");
const clientImport = /from (["'])\.\/neon-production-client\.js\1;/g;
if ([...pageRuntime.matchAll(clientImport)].length !== 1) throw new Error("Expected one Neon client import in src/page-runtime.js");
await writeFile(pageRuntimePath, pageRuntime.replace(clientImport, `from "./neon-production-client.js?v=${neonClientVersion}";`), "utf8");
console.log("Looply built with separate pages for login, home, music, conversations, letters, notifications, users, settings, profile, and administration, and gallery.");


// Keep the original application controllers and presentation. The shared
// runtime supplies the Neon identity adapter; each page keeps its own UI.
for (const file of ["index.html","login.html"]) {
  const filename = path.join(outputDirectory,file);
  let html = await readFile(filename,"utf8");
  const script = file === "index.html" ? "src/neon-production-splash.js" : "src/neon-production-login.js";
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
console.log("Original Looply page controllers retained; login and splash use Neon Auth.");
