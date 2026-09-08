// Safe to share with the browser: formatting and generic feedback only.
// Public names must also pass the server's content policy before publication.
export const NAME_REJECTED = "昵称含有不允许的内容，请换一个名字。";
export const NAME_TOO_LONG = "昵称过长，请控制在 16 个字符以内。";
export const NAME_LIMIT = 16;
const MAX_RAW_LENGTH = 256;

export type NameReview =
  { ok: true; name: string } | { ok: false; error: string };
export function reviewNameFormat(value: unknown): NameReview {
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
  return { ok: true, name };
}
