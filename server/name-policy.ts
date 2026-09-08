import { BLOCKED_EXACT_NAMES, BLOCKED_NAME_FRAGMENTS } from "./name-terms";
import {
  NAME_REJECTED,
  reviewNameFormat,
  type NameReview,
} from "../src/player-name";
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

export function reviewPlayerName(value: unknown): NameReview {
  const format = reviewNameFormat(value);
  if (!format.ok || typeof value !== "string") return format;
  // Check both the complete input and the displayed name. Truncation must not
  // conceal a forbidden suffix or turn an allowed name into a forbidden one.
  if (blocked(value) || blocked(format.name))
    return { ok: false, error: NAME_REJECTED };
  return format;
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
