import { MINITOOL } from "./build-target";

const soloHints: Record<string, string> = {
  "雨中按住 S · 替同伴挡雨": "屋檐挡雨 · 小火烤干",
  "低檐断口跳不过 · Shift 搭纸桥 · 同伴到对岸接通木桥":
    "低檐断口跳不过 · 按住 Shift 2 秒自动接桥",
  "桥钉旁按住 Shift · 搭桥让同伴过": "桥钉旁按住 Shift 2 秒 · 自动接桥",
  "踩台阶 / 叠高拿钥匙": "沿台阶跳上高处拿钥匙",
  "庭心分三路 · 队友可以分头找钥匙": "庭心分三路 · 带回各处钥匙",
  "檐下长按 Shift / B 接桥 · 多人由同伴踩住对岸圆板":
    "檐下按住 Shift / B 2 秒 · 自动接桥",
};
/** Display copy only: IDs, hints stored in map data and simulation stay shared. */
export function editionCopy(text: string) {
  return MINITOOL ? (soloHints[text] ?? text) : text;
}
