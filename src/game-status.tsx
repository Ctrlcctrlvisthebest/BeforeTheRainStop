import { useEffect, useRef } from "react";
import {
  LEVELS,
  MAX_FOLDS,
  REPAIR_SECONDS,
  atRepairRack,
  COLORS,
  NAMES,
  type Game,
} from "./game";
import { editionCopy } from "./edition-copy";
import { translate, type Language } from "./i18n";
import { FIRE_WARNING } from "./weather";
import { formatTime } from "./records";
import { GuideCard } from "./guide-ui";
import type { Guidance, Lesson } from "./guide";
import { TeamSignal } from "./team-controls";
import type { PublicRoom } from "./room";

interface GameStatusProps {
  game: Game;
  slot: number;
  language: Language;
  compact: boolean;
  guide?: Guidance;
  onLearn: (lesson: Lesson) => void;
  paused: boolean;
  multiplayer: boolean;
  connected: boolean;
  room: PublicRoom | null;
}

export function GameStatus({
  game,
  slot,
  language,
  compact,
  guide,
  onLearn,
  paused,
  multiplayer,
  connected,
  room,
}: GameStatusProps) {
  const t = (text: string) => translate(language, editionCopy(text));
  const l = LEVELS[game.level],
    local = game.players[slot] ?? game.players[0];
  const statusSidebar = useRef<HTMLDivElement>(null);
  const carriedKeys = local.carriedKeys.length,
    carriedStars = local.carriedStars.length;
  useEffect(() => {
    const sidebar = statusSidebar.current;
    if (!sidebar) return;
    const observer = new ResizeObserver(() => {
      sidebar.parentElement?.style.setProperty(
        "--sidebar-height",
        `${Math.ceil(sidebar.getBoundingClientRect().height)}px`,
      );
    });
    observer.observe(sidebar);
    return () => observer.disconnect();
  }, [compact]);
  return (
    <>
      <section className="hud">
        <div className="stage">
          <b>{String(game.level + 1).padStart(2, "0")}</b>
          <div>
            {t(l.name)}
            <small>{t(l.sub)}</small>
          </div>
        </div>
        <div className="stats">
          <span>
            ⚿ {game.keys.length}/{l.keys.length}
          </span>
          <span>
            ✦ {game.stars.length}/{l.stars.length}
          </span>
          <span className="elapsed-time">
            ◷ {formatTime(Math.round(game.time * 1000))}
          </span>
          {multiplayer && (
            <span className={connected ? "online" : "offline"}>
              {t(connected ? "● 联机" : "● 重连中")}
            </span>
          )}
        </div>
      </section>
      {multiplayer && room && <TeamSignal room={room} language={language} />}
      <div className="status-sidebar" ref={statusSidebar}>
        <section
          className={`rain-hud ${local.wetness > 70 ? "soaked" : ""}`}
          aria-label={t("纸鹤状态")}
        >
          <div className="wet-condition">
            <div className="meter-heading">
              <span>{t(compact ? "湿度" : "纸的湿度")}</span>
              <strong>
                {Math.round(local.wetness)}
                <small>%</small>
              </strong>
            </div>
            <div
              className="wet-track"
              role="progressbar"
              aria-label={t("淋湿程度")}
              aria-valuenow={Math.round(local.wetness)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i style={{ width: `${local.wetness}%` }} />
            </div>
            <p>
              {t(
                local.nearFire
                  ? "小火旁 · 正在烤干"
                  : local.rainCover === "roof"
                    ? "檐下只挡雨 · 靠近小火才能烤干"
                    : local.rainCover === "ally"
                      ? "同伴挡雨 · 湿度保持不变"
                      : local.sheltering
                        ? "展成方纸 · 自己仍会缓慢淋湿"
                        : local.rainCover === "rain"
                          ? "正在淋雨 · S 展纸 / 寻找屋檐"
                          : "无雨处 · 湿度保持不变",
              )}
            </p>
          </div>
          <div
            className={`heat-condition ${local.heat >= FIRE_WARNING ? "too-hot" : ""}`}
          >
            <div className="meter-heading">
              <span>{t(compact ? "热度" : "烘烤程度")}</span>
              <b>{Math.round(local.heat)} / 100</b>
            </div>
            <div
              className="heat-track"
              role="progressbar"
              aria-label={t("烘烤程度")}
              aria-valuenow={Math.round(local.heat)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <i style={{ width: `${local.heat}%` }} />
            </div>
            <p>
              {t(
                local.heat >= FIRE_WARNING
                  ? "纸边正在变脆！快离开火堆"
                  : local.nearFire
                    ? local.wetness < 1
                      ? "纸已经烤干，离开火边"
                      : "烤干就走 · 烘烤到 100 会碎裂"
                    : local.heat > 0
                      ? "远离火堆 · 正在降温"
                      : "火光圈内可烤干 · 旺火不可接近",
              )}
            </p>
          </div>
          <div
            className={`fold-condition ${local.foldsLeft <= 2 ? "fragile" : ""}`}
          >
            <div className="meter-heading">
              <span>{t(compact ? "耐折" : "剩余耐折")}</span>
              <b>
                {local.foldsLeft} / {MAX_FOLDS}
              </b>
            </div>
            <div
              className="fold-pips"
              role="meter"
              aria-label={t("耐折次数")}
              aria-valuenow={local.foldsLeft}
              aria-valuemin={0}
              aria-valuemax={MAX_FOLDS}
            >
              {Array.from({ length: MAX_FOLDS }, (_, i) => (
                <i
                  key={i}
                  className={i < local.foldsLeft ? "intact" : "spent"}
                />
              ))}
            </div>
            <p>
              {t(
                local.foldBlocked
                  ? local.foldsLeft === 0
                    ? "纸已破损，先去许愿架修补"
                    : "湿纸太脆，先晾干或修补"
                  : local.wetness >= 60
                    ? "湿度 ≥ 60%：每次消耗 2 格"
                    : "每次展纸或折桥消耗 1 格",
              )}
            </p>
          </div>
          {atRepairRack(game, local) ? (
            <div className="repair-hint">
              <span>
                {t(
                  local.repairProgress >= REPAIR_SECONDS
                    ? "修补完成"
                    : local.repairProgress > 0
                      ? "修补中"
                      : "按住 F · 修补纸张",
                )}
              </span>
            </div>
          ) : (
            <p className="repair-away">{t("许愿架可修补 · R 返回存档处")}</p>
          )}
          {game.mode > 1 && (
            <div className="team-wet">
              {game.players.map((p) => (
                <span
                  key={p.id}
                  title={`${t(NAMES[p.id])}: ${Math.round(p.wetness)}% · ${p.foldsLeft} ${t("折")}`}
                >
                  <i style={{ background: COLORS[p.id] }} />
                  {p.arrived
                    ? t("已到家")
                    : `${Math.round(p.wetness)}% / ${p.foldsLeft}${t("折")}`}
                  {p.heat >= FIRE_WARNING ? ` · ♨ ${Math.round(p.heat)}` : ""}
                  {p.sheltering ? t(" · 挡雨") : ""}
                </span>
              ))}
            </div>
          )}
        </section>
        {guide && (
          <GuideCard
            g={game}
            guide={guide}
            language={language}
            onLearn={onLearn}
            compact={compact}
          />
        )}
      </div>
      {compact && (
        <div
          className={`mobile-condition-note ${local.heat >= FIRE_WARNING || local.foldBlocked ? "urgent" : ""}`}
          role="status"
        >
          {paused
            ? t(
                multiplayer
                  ? "联机仍在进行，请在安全处查看"
                  : "已暂停 · 关闭面板继续",
              )
            : local.heat >= FIRE_WARNING
              ? t("纸边正在变脆！快离开火堆")
              : local.foldBlocked
                ? t(
                    local.foldsLeft === 0
                      ? "纸已破损，先去许愿架修补"
                      : "湿纸太脆，先晾干或修补",
                  )
                : local.nearFire
                  ? t(
                      local.wetness < 1
                        ? "纸已经烤干，离开火边"
                        : "小火旁 · 正在烤干",
                    )
                  : atRepairRack(game, local)
                    ? t(
                        local.repairProgress >= REPAIR_SECONDS
                          ? "修补完成"
                          : local.repairProgress > 0
                            ? "修补中"
                            : "架旁按住「修补」恢复耐折",
                      )
                    : t("按住左右移动 · 按住跳跃滑翔")}
        </div>
      )}
      <div
        className={`carry-hud ${carriedKeys + carriedStars ? "pending" : ""}`}
        role="status"
      >
        {carriedKeys + carriedStars > 0 ? (
          <>
            <b>
              {t("未存档")} · ⚿ {carriedKeys} · ✦ {carriedStars}
            </b>
            <span>
              {t(
                LEVELS[game.level].freeCheckpoints
                  ? "带回任意许愿架 · 死亡后需重新拾取"
                  : "带到下一个许愿架 · 死亡后需重新拾取",
              )}
            </span>
          </>
        ) : local.bankedUntil > game.time ? (
          <>
            <b>
              ⚑ {t("已存入许愿架")} · {local.lastBanked} {t("件物品")}
            </b>
            <span>{t("这部分收集，死亡后会保留")}</span>
          </>
        ) : (
          <span>
            ⚑ {t("已存档")} · ⚿ {game.savedKeys.length} · ✦{" "}
            {game.savedStars.length}
          </span>
        )}
      </div>
      {local.failureUntil > game.time &&
        (local.lastDropped > 0 ||
          (local.lastFailure && local.lastFailure !== "fall")) && (
          <div className="failure-notice" role="alert">
            {t(
              local.lastFailure === "scorched"
                ? "碰到旺火，纸鹤烧毁了 · 已返回许愿架"
                : local.lastFailure === "brittle"
                  ? "烤得太久，纸鹤脆裂了 · 已返回许愿架"
                  : local.lastFailure === "soaked"
                    ? "纸鹤湿透了 · 已返回许愿架"
                    : "已返回最近的许愿架",
            )}
            {local.lastDropped > 0 && (
              <small>
                {local.lastDropped} {t("件未存档物品已复位 · 请重新拾取")}
              </small>
            )}
          </div>
        )}
    </>
  );
}
