import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

for (const file of ["index.html", "login.html", "home.html", "galeria.html", "musicas.html", "chat.html", "conversa.html", "cartas.html", "notificacoes.html", "usuarios.html", "configuracoes.html", "perfil.html", "admin.html", "styles.css"]) {
  await cp(path.join(projectRoot, file), path.join(outputDirectory, file));
}

const publicConfig = await readFile(path.join(projectRoot, "config.js"), "utf8");
const youtubeApiKey = JSON.stringify(process.env.LOOPLY_YOUTUBE_API_KEY || "");
const injectedConfig = publicConfig.replace('youtubeApiKey: ""', `youtubeApiKey: ${youtubeApiKey}`);
if (injectedConfig === publicConfig && !publicConfig.includes(`youtubeApiKey: ${youtubeApiKey}`)) {
  throw new Error("Could not prepare the YouTube playlist API configuration.");
}
await writeFile(path.join(outputDirectory, "config.js"), injectedConfig, "utf8");

await cp(path.join(projectRoot, "src"), path.join(outputDirectory, "src"), { recursive: true });
await cp(path.join(projectRoot, "assets"), path.join(outputDirectory, "assets"), { recursive: true });
console.log("Looply built with separate pages for login, home, gallery, music, conversations, letters, notifications, users, settings, profile, and administration.");
