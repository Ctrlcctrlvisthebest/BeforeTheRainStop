import test from "node:test";
import assert from "node:assert/strict";
import {
  NAME_REJECTED,
  NAME_TOO_LONG,
  reviewNameFormat,
} from "../src/player-name";
import {
  NamePolicyError,
  reviewPlayerName,
  requirePlayerName,
  publicPlayerName,
} from "../server/name-policy";
import { makeRoom, joinRoom, publicRoom } from "../src/room";
import { translate } from "../src/i18n";

test("nickname policy catches listed terms and common Unicode / separator evasions", () => {
  for (const name of [
    "习近平",
    "習近平",
    "小習近平台",
    "习 近 平",
    "习・近-平",
    "习\u200b近\u2060平",
    "习\u202e近\u202c平",
    "习\u3164近\uFE0F平",
    "习🕊近🌧平",
    "XÍ JÌNPÍNG",
    "ＸＩ＿ＪＩＮＰＩＮＧ",
    "xi<jin>ping",
    "法輪功",
    "臺灣獨立",
    "時代革命",
    "毛澤東",
    "ＣＣＰ",
    "六 四",
  ]) {
    assert.deepEqual(reviewPlayerName(name), {
      ok: false,
      error: NAME_REJECTED,
    });
    assert.throws(
      () => requirePlayerName(name),
      (error: unknown) =>
        error instanceof NamePolicyError &&
        error.status === 422 &&
        error.message === NAME_REJECTED,
    );
    assert.equal(publicPlayerName(name), "旅人");
  }
});

test("ordinary Chinese / English names and ambiguous short fragments remain usable", () => {
  for (const name of [
    "旅人",
    "雨中纸鹤",
    "自由的风",
    "中国结",
    "台湾雨声",
    "和平",
    "MaoMao",
    "Jin",
    "夏日64",
    "Nazira",
    "dpp小纸鹤",
    "风铃🕊️",
    "Zoë",
    "Rain Crane",
  ]) {
    const result = reviewPlayerName(name);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(publicPlayerName(name), result.name);
  }
  assert.equal(requirePlayerName(" <Rain>\u0000 "), "Rain");
  for (const value of ["", " \u200b\u3164 ", undefined, null, 12, {}])
    assert.equal(requirePlayerName(value), "旅人");
});

test("both raw and truncated display names are checked and work is bounded", () => {
  assert.equal(reviewPlayerName("a".repeat(16) + "习近平").ok, false);
  assert.equal(reviewPlayerName("8964" + " ".repeat(20) + "happy").ok, false);
  assert.equal(requirePlayerName("a".repeat(15) + "🕊"), "a".repeat(15));
  assert.equal(requirePlayerName("a".repeat(14) + "🕊"), "a".repeat(14) + "🕊");
  assert.equal(requirePlayerName("a".repeat(256)), "a".repeat(16));
  assert.deepEqual(reviewPlayerName("a".repeat(257)), {
    ok: false,
    error: NAME_TOO_LONG,
  });
  assert.equal(publicPlayerName("a".repeat(100000)), "旅人");
});

test("room rejection consumes no seat or revision; old public names are masked without changing scores", () => {
  assert.throws(
    () => makeRoom("ABCDEFGH", 2, 0, "習近平", "a", 0),
    NamePolicyError,
  );
  const room = makeRoom("ABCDEFGH", 2, 0, "雨声", "a", 0);
  const before = structuredClone(room);
  assert.throws(() => joinRoom(room, "习 近平", "b", 0), NamePolicyError);
  assert.deepEqual(room, before);
  assert.equal(joinRoom(room, "纸鹤", "b", 0), 1);
  room.players[0].name = "習近平"; // A snapshot stored before moderation existed.
  const masked = publicRoom(room);
  assert.deepEqual(
    masked.players.map((player) => player.name),
    ["旅人", "纸鹤"],
  );
  assert.equal(room.players[0].name, "習近平");
  assert.ok(masked.players.every((player) => !("token" in player)));
});

test("nickname validation and recovery messages have English translations", () => {
  for (const message of [
    NAME_REJECTED,
    NAME_TOO_LONG,
    "昵称会公开显示，请使用友善的名字。",
    "昵称未通过审核，本地成绩已保留。可使用「旅人」重新上传。",
    "使用「旅人」重新上传",
  ])
    assert.doesNotMatch(translate("en", message), /\p{Script=Han}/u);
});

test("shared name formatting bounds work, cleans input and preserves complete Unicode characters", () => {
  for (const [input, expected] of [
    [" <Ｒａｉｎ>\u0000 ", "Rain"],
    [" \u200b ", "旅人"],
    [null, "旅人"],
    ["a".repeat(15) + "🕊", "a".repeat(15)],
    ["a".repeat(14) + "🕊", "a".repeat(14) + "🕊"],
    ["a".repeat(256), "a".repeat(16)],
  ])
    assert.deepEqual(reviewNameFormat(input), { ok: true, name: expected });
  assert.deepEqual(reviewNameFormat("a".repeat(257)), {
    ok: false,
    error: NAME_TOO_LONG,
  });
});
