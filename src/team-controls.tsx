import { useEffect, useState } from "react";
import type { PublicRoom } from "./room";
import type { Language } from "./i18n";

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
  const voted = room.regroupVotes?.includes(slot);
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
            ? "Regroup after everyone online agrees. Disconnected seats are released after a 15-second reconnection window."
            : "在线同伴一致同意后回候场。掉线同伴有 15 秒重连时间，之后可释放座位邀请替补。"}
        </p>
        <p>
          {en
            ? "Keep your chapter. The unfinished run starts over; completed chapters and records stay saved."
            : "保留当前关卡；未完成的本关从头开始，已经完成的关卡和成绩保留。"}
        </p>
        <span role="status">
          {room.regroupVotes?.length ?? 0} /{" "}
          {room.players.filter((p) => p.online).length}{" "}
          {en ? "agree" : "人同意"}
        </span>
        {voted ? (
          <button
            disabled={!connected}
            onClick={() => send({ type: "cancel-regroup" })}
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
