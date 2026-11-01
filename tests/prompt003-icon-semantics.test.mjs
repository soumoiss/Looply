import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { icon, iconNames } from "../src/icons.js";
import { storyStudioMarkup } from "../src/story-studio.js";
import { primaryNavigationMarkup, primaryDestinations } from "../src/primary-navigation.js";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("all new icon names use local SVG and preserve accessibility modes", () => {
  assert.equal(new Set(iconNames).size, iconNames.length);
  for (const name of ["logout", "clock", "chevronDown"]) {
    assert.ok(iconNames.includes(name), name);
    assert.match(icon(name), /^<svg class="looply-icon"/);
    assert.match(icon(name), /viewBox="0 0 24 24"/);
    assert.match(icon(name), /aria-hidden="true"/);
    assert.match(read("docs/icon-inventory.md"), new RegExp("`" + name + "`"));
  }
  assert.match(icon("logout", { label: "Sair" }), /role="img" aria-label="Sair"/);
  assert.match(icon("clock"), /stroke-width="1.8"/);
});

test("real Story Studio controls use SVG without losing their labels or data hooks", () => {
  const html = storyStudioMarkup("");
  const map = {
    "studio-close":"close", "studio-settings":"settings", "studio-grid-toggle":"grid",
    "studio-camera-more":"chevronDown", "studio-timer":"clock",
    "studio-flip":"cameraSwitch", "studio-back":"back",
    "studio-edit-selected":"pencil", "studio-music-open":"music",
    "studio-editor-more":"chevronDown", "studio-send":"forward",
    "studio-modal-close":"close"
  };
  for (const [hook,name] of Object.entries(map)) {
    const selector = new RegExp("<button[^>]*data-" + hook + "[^>]*>[\\s\\S]*?<\\/button>");
    const button = html.match(selector)?.[0] || "";
    assert.ok(button, "missing button " + hook);
    assert.match(button, /aria-label="[^"]+"/, "no accessible name: " + hook);
    assert.match(button, /<svg class="looply-icon"/, "no SVG: " + hook);
    assert.match(button, /aria-hidden="true"/, "decorative SVG must stay hidden: " + hook);
    assert.ok(button.includes('viewBox="0 0 24 24"'));
    assert.ok(button.includes(name === "chevronDown" ? '<path d="m6 9 6 6 6-6"/>' : '<svg'), "icon present");
  }
  assert.match(html, /data-studio-thumb aria-hidden="true"><svg/);
  for (const untouched of ["data-studio-flash", "data-studio-boomerang", "data-studio-shutter",
    "data-studio-ratio", "data-studio-file", "data-studio-people", "data-studio-visibility"]) {
    assert.ok(html.includes(untouched), untouched);
  }
  assert.match(html, /data-studio-text-mode[^>]*>Aa/);
  assert.match(html, /data-studio-flash[^>]*>ϟ/);
  assert.match(html, /data-studio-boomerang[^>]*>∞/);
  assert.match(html, /data-studio-friends[^>]*>.*★/);
});

test("original navigation still has six routes and visible icon markup", () => {
  assert.equal(primaryDestinations.length,6);
  const markup = primaryNavigationMarkup("home", 7);
  assert.equal((markup.match(/<svg class="looply-icon/g)||[]).length, 6);
  assert.equal((markup.match(/<a class="header-action"/g)||[]).length, 6);
  assert.match(markup,/aria-label="Navegação principal"/);
  assert.match(markup,/aria-label="7 não lidas"/);
  assert.match(read("assets/css/pages/shared.css"), /Prompt 003/);
});

test("shell and gallery reuse the SVG registry without altering functional hooks", () => {
  const runtime=read("src/page-runtime.js");
  const gallery=read("assets/js/gallery.js");
  assert.match(runtime,/data-sign-out>\$\{icon\("logout"\)\}Sair/);
  assert.match(runtime,/iconNode\.innerHTML = icon\("settings"\)/);
  assert.match(gallery,/data-main="recentes"[^\n]*icon\("image"\)/);
  assert.match(read("src/story-studio.js"), /thumb\.innerHTML = icon\(normalized\.type\.startsWith/);
  assert.match(read("assets/css/pages/story-studio.css"), /Prompt 003/);
  assert.match(read("assets/css/app.css"), /looply-maintenance-icon > \.looply-icon/);
});
