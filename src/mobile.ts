import { useEffect, useState } from "react";
import type { Language } from "./i18n";

export function useCompactControls() {
  const query = "(pointer: coarse), (max-width: 900px)";
  const [compact, setCompact] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const media = matchMedia(query);
    const update = () => setCompact(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return compact;
}

// Use the visible touch-button names in guides, lessons, and world signs.
export function touchCopy(text: string, language: Language) {
  if (language === "zh")
    return text
      .replace(/← → \/ A D/g, "左右按钮")
      .replace(/左右键或 A \/ D/g, "下方左右按钮")
      .replace(/Q \/ E|Q\/E|Q/g, "「转面」")
      .replace(/S \/ ↓|S \/ Down|\bS\b/g, "「挡雨」")
      .replace(/Shift/g, "「纸桥」")
      .replace(/Space|SPACE|空格/g, "「跳跃」")
      .replace(/\bF\b/g, "「修补」")
      .replace(/\bR\b/g, "「回存档」")
      .replace(/方向键|左右键/g, "左右按钮")
      .replace(/跳 \/ 滑翔/g, "跳跃")
      .replace(/→ \/ D/g, "→")
      .replace(/← \/ A/g, "←");
  return text
    .replace(/← → \/ A D/g, "← →")
    .replace(/Jump \/ Glide/g, "Jump")
    .replace(/Arrows \/ A D|arrows or A \/ D/gi, "arrow buttons")
    .replace(/Q \/ E|Q\/E|\bQ\b/g, "Turn")
    .replace(/S \/ Down|S \/ ↓|\bS\b/g, "Shelter")
    .replace(/Shift/g, "Bridge")
    .replace(/Space|SPACE|空格/g, "Jump")
    .replace(/\bF\b/g, "Mend")
    .replace(/\bR\b/g, "Return")
    .replace(/→ \/ D/g, "→")
    .replace(/← \/ A/g, "←");
}
