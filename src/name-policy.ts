import { BLOCKED_EXACT_NAMES, BLOCKED_NAME_FRAGMENTS } from "./name-terms";

export const NAME_REJECTED = "昵称含有不允许的内容，请换一个名字。";
export const NAME_TOO_LONG = "昵称过长，请控制在 16 个字符以内。";
export const NAME_LIMIT = 16;
const MAX_RAW_LENGTH = 256;
const traditional: Record<string, string> = {
  習: "习",
  東: "东",
  澤: "泽",
  鄧: "邓",
  錦: "锦",
  濤: "涛",
  來: "来",
  強: "强",
  趙: "赵",
  陽: "阳",
  蔣: "蒋",
  經: "经",
  國: "国",
  賴: "赖",
  產: "产",
  黨: "党",
  進: "进",
  輪: "轮",
  門: "门",
  殺: "杀",
  臺: "台",
  灣: "湾",
  獨: "独",
  復: "复",
  時: "时",
  納: "纳",
};

// Matching only: keep the player's spelling for display. Limit raw input before
// normalization so direct HTTP submissions cannot force unbounded Unicode work.
function matchingText(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/\p{Default_Ignorable_Code_Point}/gu, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .replace(/./gu, (character) => traditional[character] ?? character);
}
const fragments = [
  ...new Set(BLOCKED_NAME_FRAGMENTS.map(matchingText).filter(Boolean)),
];
const exact = new Set(BLOCKED_EXACT_NAMES.map(matchingText).filter(Boolean));
function blocked(value: string): boolean {
  const key = matchingText(value);
  return exact.has(key) || fragments.some((term) => key.includes(term));
}

type NameReview = { ok: true; name: string } | { ok: false; error: string };
export function reviewPlayerName(value: unknown): NameReview {
  if (typeof value !== "string") return { ok: true, name: "旅人" };
  if (value.length > MAX_RAW_LENGTH) return { ok: false, error: NAME_TOO_LONG };
  const name =
    value
      .normalize("NFKC")
      .replace(/[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}<>]/gu, "")
      .trim()
      .slice(0, NAME_LIMIT)
      .replace(/\p{Cs}/gu, "")
      .trim() || "旅人";
  // Check both the complete input and the displayed name. Truncation must not
  // conceal a forbidden suffix or turn an allowed name into a forbidden one.
  if (blocked(value) || blocked(name))
    return { ok: false, error: NAME_REJECTED };
  return { ok: true, name };
}

export class NamePolicyError extends Error {
  readonly status = 422;
}
export function requirePlayerName(value: unknown): string {
  const review = reviewPlayerName(value);
  if (!review.ok) throw new NamePolicyError(review.error);
  return review.name;
}
// Recheck public output against the current policy, including old room snapshots
// and old / queued scores. Preserve the achievement, hide the rejected nickname.
export function publicPlayerName(value: unknown): string {
  const review = reviewPlayerName(value);
  return review.ok ? review.name : "旅人";
}
