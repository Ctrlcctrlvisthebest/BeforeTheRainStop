import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { LEVELS, MODES } from "../src/game";
import { CHALLENGE_MAPS } from "../src/challenge-maps";
import { WEATHER } from "../src/weather";
import { CROSSINGS } from "../src/bridges";
import { GUIDE_ROUTES } from "../src/guide";
import { CHAPTER_STORAGE_SUFFIXES } from "../src/chapter-storage";
import { boardName } from "../src/leaderboard";
import { CAMPAIGN_LENGTH } from "../src/campaign-version";
import { interactiveModules, oversizedGroundRuns } from "../src/map-rules";
import type { MapFile } from "../src/map-format";
import historical from "./fixtures/campaign-40-v9.sha256.json";

test("100 chapters are registered in order with all required metadata", () => {
  assert.equal(CAMPAIGN_LENGTH, 100);
  assert.equal(LEVELS.length, 100);
  for (const items of [WEATHER, GUIDE_ROUTES, CHAPTER_STORAGE_SUFFIXES])
    assert.equal(items.length, LEVELS.length);
  assert.equal(CHALLENGE_MAPS.length, 92);
  CHALLENGE_MAPS.forEach((map, index) => {
    assert.equal(map.chapter, index + 9);
    assert.deepEqual(CROSSINGS[index + 8], map.crossing);
  });
});

test("the original 40 map layouts, weather, routes and mechanisms remain exact", () => {
  LEVELS.slice(0, 40).forEach((level, index) => {
    const hash = createHash("sha256")
      .update(
        JSON.stringify({
          level,
          weather: WEATHER[index],
          route: GUIDE_ROUTES[index],
          crossing: CROSSINGS[index],
        }),
      )
      .digest("hex");
    assert.equal(hash, historical[index], `original chapter ${index + 1}`);
  });
});

test("every additional chapter has bounded ground and two used mechanisms", () => {
  for (const map of CHALLENGE_MAPS.slice(32)) {
    assert.deepEqual(
      oversizedGroundRuns(map.level.platforms),
      [],
      String(map.chapter),
    );
    assert.ok(interactiveModules(map).length >= 2, String(map.chapter));
    assert.ok(
      map.route.some((step) => step.kind === "jump" || step.kind === "wind"),
    );
    assert.ok(map.level.keys.length > 0);
    assert.ok(map.level.checkpoints.length > 0);
    assert.equal(map.route.at(-1)?.kind, "exit");
  }
});

test("new record identities are numeric, unique and independent of display titles", () => {
  const names = LEVELS.map((level) => level.name);
  const before = MODES.flatMap((mode) =>
    LEVELS.map((_, index) => boardName(index, mode)),
  );
  assert.equal(new Set(before).size, LEVELS.length * MODES.length);
  for (let index = 40; index < LEVELS.length; index++)
    assert.equal(CHAPTER_STORAGE_SUFFIXES[index], `chapter-${index + 1}`);
  try {
    LEVELS.forEach((level) => {
      level.name = "仅显示文案";
    });
    assert.deepEqual(
      MODES.flatMap((mode) => LEVELS.map((_, index) => boardName(index, mode))),
      before,
    );
  } finally {
    LEVELS.forEach((level, index) => {
      level.name = names[index];
    });
  }
});

// Ignore cosmetic distances, titles, walking markers and collection labels.
// Mirroring a route or swapping its two movement axes must not make it unique.
function actionSignature(map: MapFile) {
  const variants: string[] = [];
  const direction = (value: number) =>
    Math.abs(value) < 0.4 ? 0 : Math.sign(value);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      let previous = map.level.spawn;
      const actions = [];
      for (const step of map.route) {
        if (["walk", "rack", "key", "exit"].includes(step.kind)) continue;
        const x = direction(step.target.x - previous.x) * sx;
        const z = direction(step.target.z - previous.z) * sz;
        const firstView = map.route[0].view;
        actions.push([
          step.kind,
          step.view ^ firstView,
          firstView ? z : x,
          firstView ? x : z,
          direction(step.target.y - previous.y),
          Boolean(step.via),
          step.landingId !== undefined,
          step.requiredKey !== undefined,
        ]);
        previous = step.target;
      }
      variants.push(JSON.stringify(actions));
    }
  return variants.sort()[0];
}

test("new action routes differ beyond coordinates, reflections and collection text", () => {
  const seen = new Map<string, number>();
  for (const map of CHALLENGE_MAPS) {
    const signature = actionSignature(map);
    if (map.chapter! > 40)
      assert.ok(
        !seen.has(signature),
        `${map.chapter} repeats ${seen.get(signature)}`,
      );
    seen.set(signature, map.chapter!);
  }
});
