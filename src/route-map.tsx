import { useMemo } from "react";
import { LEVELS, COLORS, NAMES, type Game } from "./game";
import { CROSSINGS } from "./bridges";
import { CAMPFIRES } from "./weather";
import { GUIDE_ROUTES, words, type Guidance } from "./guide";
import { editionCopy } from "./edition-copy";
import { translate, type Language } from "./i18n";

interface RouteMapProps {
  game: Game;
  slot: number;
  language: Language;
  compact: boolean;
  guide?: Guidance;
  onClose: () => void;
}

export function RouteMap({
  game,
  slot,
  language,
  compact,
  guide,
  onClose,
}: RouteMapProps) {
  const t = (text: string) => translate(language, editionCopy(text));
  const l = LEVELS[game.level],
    local = game.players[slot] ?? game.players[0];
  const { platforms, minX, maxX, minZ, maxZ } = useMemo(() => {
    const mapPlatforms = LEVELS[game.level].platforms.filter(
      (p) => p.kind !== "wall" && p.kind !== "low-roof" && p.kind !== "railing",
    );
    const minX =
      Math.min(
        ...mapPlatforms.map(
          (p) => p.x - p.w / 2 - (p.motion?.axis === "x" ? p.motion.range : 0),
        ),
      ) - 1.5;
    const maxX =
      Math.max(
        ...mapPlatforms.map(
          (p) => p.x + p.w / 2 + (p.motion?.axis === "x" ? p.motion.range : 0),
        ),
      ) + 1.5;
    const minZ =
      Math.min(
        ...mapPlatforms.map(
          (p) => p.z - p.d / 2 - (p.motion?.axis === "z" ? p.motion.range : 0),
        ),
      ) - 1.5;
    const maxZ =
      Math.max(
        ...mapPlatforms.map(
          (p) => p.z + p.d / 2 + (p.motion?.axis === "z" ? p.motion.range : 0),
        ),
      ) + 1.5;
    return { platforms: mapPlatforms, minX, maxX, minZ, maxZ };
  }, [game.level]);
  return (
    <aside className="compass" id="route-map">
      <div>
        <b>{t(game.view === 0 ? "正面 · 左右" : "侧面 · 前后")}</b>
        {compact ? (
          <button onClick={onClose} aria-label={t("关闭路线图")}>
            ×
          </button>
        ) : (
          <kbd>Q</kbd>
        )}
      </div>
      <svg
        viewBox={`${minX} ${minZ} ${maxX - minX} ${maxZ - minZ}`}
        aria-label={t("俯视路线图")}
      >
        {platforms.map((p, i) => (
          <rect
            key={i}
            x={p.x - p.w / 2}
            y={p.z - p.d / 2}
            width={p.w}
            height={p.d}
            rx=".2"
            fill="#61758a"
          />
        ))}
        {CROSSINGS[game.level] && (
          <rect
            x={
              CROSSINGS[game.level].x -
              (CROSSINGS[game.level].axis === "x" ? 1.3 : 0.5)
            }
            y={
              CROSSINGS[game.level].z -
              (CROSSINGS[game.level].axis === "z" ? 1.3 : 0.5)
            }
            width={CROSSINGS[game.level].axis === "x" ? 2.6 : 1}
            height={CROSSINGS[game.level].axis === "z" ? 2.6 : 1}
            fill={game.bridgeLatched ? "#d9b66b" : "none"}
            stroke="#d9b66b"
            strokeWidth=".25"
            strokeDasharray={game.bridgeLatched ? undefined : ".4 .3"}
          />
        )}
        {guide && (
          <>
            <polyline
              points={GUIDE_ROUTES[game.level]
                .map((s) => `${s.target.x},${s.target.z}`)
                .join(" ")}
              fill="none"
              stroke="#e8d0a1"
              strokeWidth=".12"
              strokeDasharray=".35 .35"
              opacity=".45"
            />
            {l.keys.map(
              (k, i) =>
                !game.keys.includes(i) && (
                  <text
                    key={`key-${i}`}
                    x={k.x}
                    y={k.z + 0.35}
                    textAnchor="middle"
                    fontSize="1.7"
                    fill="#ffe5a8"
                  >
                    ⚿
                  </text>
                ),
            )}
            {l.checkpoints.map((c, i) => (
              <rect
                key={`rack-${i}`}
                x={c.x - 0.35}
                y={c.z - 0.35}
                width=".7"
                height=".7"
                fill={local.checkpoint >= i ? "#b3dbbc" : "none"}
                stroke="#b3dbbc"
                strokeWidth=".15"
              />
            ))}
            {CAMPFIRES[game.level].map((c, i) => (
              <circle
                key={`fire-${i}`}
                cx={c.x}
                cy={c.z}
                r=".22"
                fill="#ef9a63"
              />
            ))}
            {guide.target && (
              <circle
                className="map-guide-target"
                cx={guide.target.x}
                cy={guide.target.z}
                r=".9"
                fill="none"
                stroke="#ffe5a8"
                strokeWidth=".2"
              />
            )}
          </>
        )}
        <circle cx={l.exit.x} cy={l.exit.z} r=".8" fill="#d9b66b" />
        {game.players.map((p) => (
          <circle
            key={p.id}
            cx={p.x}
            cy={p.z}
            r={p.id === local.id ? 0.75 : 0.55}
            fill={COLORS[p.id]}
            stroke="white"
            strokeWidth=".2"
          />
        ))}
      </svg>
      {guide && (
        <div className="map-legend">{t("◎ 目标 · □ 存档 · 橙点小火")}</div>
      )}
      <div className="depth-legend">
        <i aria-hidden="true" />
        {words(["亮边：当前行进层", "Bright edges: current lane"], language)}
      </div>
      <small>
        {t("你是")} <i style={{ background: COLORS[local.id] }} />
        {t(NAMES[local.id])} ·{" "}
        {t(local.checkpoint >= 0 ? "已记录许愿架" : "起点")}
      </small>
    </aside>
  );
}
