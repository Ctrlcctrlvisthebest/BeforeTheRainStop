import { useEffect, useState } from "react";
import type { PublicRoom } from "./room";
import type { Language } from "./i18n";
import { regroupStatus } from "./regroup";

export function TeamControls({
  room,
  slot,
  connected,
  language,
  send,
}: {
  room: PublicRoom;
  slot: number;
  connected: boolean;
  language: Language;
  send: (command: Record<string, unknown>) => void;
}) {
  const en = language === "en";
  const [confirm, setConfirm] = useState(false);
  const [now, setNow] = useState(room.serverTime ?? Date.now());
  useEffect(() => {
    const serverNow = room.serverTime ?? Date.now();
    const receivedAt = performance.now();
    setNow(serverNow);
    if (room.phase !== "game" || room.players.every((p) => p.online)) return;
    const timer = setInterval(
      () => setNow(serverNow + performance.now() - receivedAt),
      250,
    );
    return () => clearInterval(timer);
  }, [room.serverTime, room.phase, room.players]);
  const status = regroupStatus(room, now);
  const voted = status.votes.includes(slot);
  const seconds = Math.ceil(status.remainingMs / 1000);
  useEffect(() => setConfirm(false), [room.game?.id, room.phase]);
  if (room.phase !== "game" || !room.game) return null;
  return (
    <details className="team-controls">
      <summary>{en ? "Team" : "同伴"}</summary>
      <div className="team-controls-panel">
        <button
          disabled={!connected}
          onClick={() => send({ type: "turn-signal", gameId: room.game!.id })}
        >
          {en ? "Signal a turn" : "提醒同伴：准备转面"}
        </button>
        <p>
          {en
            ? "Everyone online must agree. You can vote during the 15-second reconnection window; regrouping happens automatically when it ends."
            : "在线同伴需要一致同意。掉线后会等待 15 秒重连；等待期间可以投票，时间结束后自动回候场重组。"}
        </p>
        <p>
          {en
            ? "Keep your chapter. The unfinished run starts over; completed chapters and records stay saved."
            : "保留当前关卡；未完成的本关从头开始，已经完成的关卡和成绩保留。"}
        </p>
        <span role="status">
          {status.votes.length} / {status.onlineCount} {en ? "agree" : "人同意"}
        </span>
        {seconds > 0 ? (
          <p role="status">
            {en
              ? `Reconnection window: ${seconds}s${status.unanimous ? "; regrouping follows automatically." : "."}`
              : `等待同伴重连：${seconds} 秒${status.unanimous ? "；结束后自动回候场。" : "。"}`}
          </p>
        ) : (
          status.unanimous && (
            <p role="status">
              {en
                ? "Everyone agrees. Returning to lobby…"
                : "同伴已同意，正在回候场…"}
            </p>
          )
        )}
        {voted ? (
          <button
            disabled={!connected}
            onClick={() =>
              send({ type: "cancel-regroup", gameId: room.game!.id })
            }
          >
            {en ? "Cancel my vote" : "撤回我的同意"}
          </button>
        ) : (
          <button
            disabled={!connected}
            onClick={() => {
              if (!confirm) {
                setConfirm(true);
                return;
              }
              send({ type: "regroup", gameId: room.game!.id });
              setConfirm(false);
            }}
          >
            {confirm
              ? en
                ? "Confirm regroup"
                : "确认回候场重组"
              : en
                ? "Regroup"
                : "重新组队"}
          </button>
        )}
        {confirm && (
          <button onClick={() => setConfirm(false)}>
            {en ? "Cancel" : "取消"}
          </button>
        )}
      </div>
    </details>
  );
}

export function TeamSignal({
  room,
  language,
}: {
  room: PublicRoom;
  language: Language;
}) {
  const [visible, setVisible] = useState(false);
  const notice = room.turnNotice;
  useEffect(() => {
    if (!notice || notice.gameId !== room.game?.id) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 3500);
    return () => clearTimeout(timer);
  }, [notice?.at, notice?.gameId, room.game?.id]);
  if (!visible || !notice || notice.gameId !== room.game?.id) return null;
  const name =
    room.players.find((p) => p.slot === notice.slot)?.name ??
    (language === "en" ? "Teammate" : "同伴");
  return (
    <div className="team-signal" role="status">
      {name} ·{" "}
      {language === "en"
        ? "Ready to turn? Find a safe landing."
        : "准备转面，请先落稳"}
    </div>
  );
}
