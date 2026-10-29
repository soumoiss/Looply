import test from "node:test";
import assert from "node:assert/strict";
import { feedMediaDisplayHeight } from "../src/social.js";

const cases = [
  ["16:9", 16, 9, 180], ["4:3", 4, 3, 240], ["1:1", 1, 1, 320],
  ["3:4", 3, 4, 427], ["9:16", 9, 16, 569], ["3:2", 3, 2, 213],
  ["2:3", 2, 3, 480], ["panorâmica", 3, 1, 107], ["alta resolução", 12000, 8000, 213]
];

for (const [name, width, height, expected] of cases) {
  test(`Feed calcula a altura natural de mídia ${name}`, () => {
    assert.equal(feedMediaDisplayHeight(320, width, height, 600), expected);
  });
}

test("mídia vertical respeita o teto responsivo sem alterar sua razão de origem", () => {
  assert.equal(feedMediaDisplayHeight(428, 9, 16, 600), 600);
});

test("cada slide do carrossel usa suas próprias dimensões, em ambas as ordens", () => {
  const wide = feedMediaDisplayHeight(390, 16, 9, 650);
  const portrait = feedMediaDisplayHeight(390, 9, 16, 650);
  assert.deepEqual([wide, portrait], [219, 650]);
  assert.deepEqual([portrait, wide], [650, 219]);
  assert.notEqual(wide, portrait);
});

test("fallback provisório é compacto e desaparece quando os metadados chegam", () => {
  assert.equal(feedMediaDisplayHeight(390, 0, 0, 650), 293);
  assert.equal(feedMediaDisplayHeight(390, 16, 9, 650), 219);
});
