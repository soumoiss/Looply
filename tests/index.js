// Node 22 does not expand `node --test tests/` into directory entries.
// Import the same standalone test modules as `node --test tests/*.test.mjs`.
import {readdirSync} from "node:fs";
for (const name of readdirSync(new URL("./",import.meta.url)).filter(file=>file.endsWith(".test.mjs")).sort()) {
  await import("./"+name);
}
