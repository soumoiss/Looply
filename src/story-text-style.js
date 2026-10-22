const marker = "[[looply-story-v1|";
const fonts = new Set(["system", "serif", "rounded", "mono", "handwritten"]);

const fontFamilies = Object.freeze({
  system: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  rounded: "'Trebuchet MS', 'Arial Rounded MT Bold', sans-serif",
  mono: "'Courier New', ui-monospace, monospace",
  handwritten: "'Comic Sans MS', 'Segoe Print', cursive"
});

export function encodeStoryBody(text, font = "system", size = 20) {
  const value = String(text ?? "").trim();
  const family = fonts.has(font) ? font : "system";
  const pointSize = Math.min(20, Math.max(6, Number.parseInt(size, 10) || 20));
  return `${marker}${family}|${pointSize}]]${value}`;
}

export function decodeStoryBody(value) {
  const body = String(value ?? "");
  if (!body.startsWith(marker)) return { text: body, font: "system", size: 20, styled: false };
  const match = body.match(/^\[\[looply-story-v1\|([a-z]+)\|(\d{1,2})\]\]/);
  if (!match || !fonts.has(match[1])) return { text: body, font: "system", size: 20, styled: false };
  const size = Number(match[2]);
  if (!Number.isInteger(size) || size < 6 || size > 20) return { text: body, font: "system", size: 20, styled: false };
  return {
    text: body.slice(match[0].length), font: match[1], size, styled: true,
    fontFamily: fontFamilies[match[1]]
  };
}
