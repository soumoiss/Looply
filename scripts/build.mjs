import { cp, mkdir, rm, readFile, writeFile, readdir } from "node:fs/promises";
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
// Stamp local HTML entrypoints and module imports with one content-derived
// build id. This prevents the service worker and the browser module map from
// combining a newly deployed adapter with older page controllers.
async function collectAssetFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectAssetFiles(filename));
    else if (/\.(?:html|js|css)$/i.test(entry.name)) files.push(filename);
  }
  return files;
}
const assetFiles = (await collectAssetFiles(outputDirectory)).sort();
const buildHasher = createHash("sha256");
for (const filename of assetFiles) {
  buildHasher.update(path.relative(outputDirectory, filename).replaceAll(path.sep, "/"));
  buildHasher.update("\0");
  buildHasher.update(await readFile(filename));
}
const buildId = buildHasher.digest("hex").slice(0, 16);
const htmlReference = /((?:src|href)\s*=\s*["'])(?![a-z]+:|\/\/|#)([^"']+?\.(?:js|css))(?:\?[^"']*)?(["'])/gi;
const moduleReference = /((?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)["'])(\.{1,2}\/[^"']+?\.js)(?:\?[^"']*)?(["'])/g;
for (const filename of assetFiles.filter(value => /\.(?:html|js)$/i.test(value))) {
  const source = await readFile(filename, "utf8");
  const versioned = source
    .replace(htmlReference, `$1$2?build=${buildId}$3`)
    .replace(moduleReference, `$1$2?build=${buildId}$3`);
  if (versioned !== source) await writeFile(filename, versioned, "utf8");
}

// A unique cache name makes the new service worker evict the previous shell.
const swPath = path.join(outputDirectory, "sw.js");
const sw = (await readFile(swPath, "utf8")).replace('looply-shell-v7', `looply-pages-${buildId}`);
await writeFile(swPath, sw, "utf8");
console.log(`Original Looply page controllers retained; local assets use build ${buildId}.`);
