import { cp, mkdir, rm } from "node:fs/promises";
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

for (const file of ["index.html", "login.html", "home.html", "galeria.html", "musicas.html", "chat.html", "perfil.html", "admin.html", "styles.css", "config.js"]) {
  await cp(path.join(projectRoot, file), path.join(outputDirectory, file));
}

await cp(path.join(projectRoot, "src"), path.join(outputDirectory, "src"), { recursive: true });
await cp(path.join(projectRoot, "assets"), path.join(outputDirectory, "assets"), { recursive: true });
console.log("Looply built with separate login, home, gallery, music, chat, profile, and admin pages.");
