import { useEffect, useRef, useState, useCallback } from "react";
import { LEVELS, type Mode } from "./game";
import { rankingRequest, RankingError, type SoloScore } from "./ranking-client";
import type { RankingEntry } from "./leaderboard";
import { formatTime } from "./records";
import { translate, type Language } from "./i18n";

export function useScoreSubmission() {
  const latest = useRef<{ id: string; score: SoloScore } | null>(null);
  const active = useRef(new Set<string>());
  const [result, setResult] = useState<{
    id: string;
    status:
      | "pending"
      | "saved"
      | "retry"
      | "unavailable"
      | "outdated"
      | "rejected"
      | "name-rejected";
  } | null>(null);
  const submit = useCallback(async (id: string, score: SoloScore | null) => {
    if (active.current.has(id)) return;
    if (!score) {
      latest.current = null;
      setResult({ id, status: "unavailable" });
      return;
    }
    latest.current = { id, score };
    active.current.add(id);
    setResult({ id, status: "pending" });
    try {
      await rankingRequest("", score);
      if (latest.current?.id === id) setResult({ id, status: "saved" });
    } catch (error) {
      const status =
        error instanceof RankingError && error.status === 409
          ? "outdated"
          : error instanceof RankingError && error.status === 422
            ? "name-rejected"
            : error instanceof RankingError &&
                (error.status === 400 || error.status === 413)
              ? "rejected"
              : "retry";
      if (latest.current?.id === id) setResult({ id, status });
    } finally {
      active.current.delete(id);
    }
  }, []);
  return {
    result,
    submit,
    retry: () => {
      if (latest.current) void submit(latest.current.id, latest.current.score);
    },
    retryAsTraveler: () => {
      if (latest.current)
        void submit(latest.current.id, {
          ...latest.current.score,
          name: "旅人",
        });
    },
  };
}

export function Leaderboard({
  level,
  mode,
  language,
  refresh = "",
}: {
  level: number;
  mode: Mode;
  language: Language;
  refresh?: string;
}) {
  const t = (text: string) => translate(language, text);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<{
    key: string;
    entries: RankingEntry[];
  } | null>(null);
  const [status, setStatus] = useState("loading");
  const key = `${level}:${mode}`;
  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    void rankingRequest(
      `?level=${level}&mode=${mode}`,
      undefined,
      controller.signal,
    )
      .then((result) => {
        if (controller.signal.aborted) return;
        setData({ key, entries: result.entries });
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [key, level, mode, reload, refresh]);
  const entries = data?.key === key ? data.entries : [];
  return (
    <section className="leaderboard" aria-label={t("全球前三名")}>
      <div className="ranking-heading">
        <strong>{t("全球前三名")}</strong>
        <button
          type="button"
          onClick={() => setReload((v) => v + 1)}
          disabled={status === "loading"}
          aria-label={t("刷新排行榜")}
        >
          {t("刷新")}
        </button>
      </div>
      <p className="ranking-chapter">
        {t(LEVELS[level].name)} · {mode} {t("人")} ·{" "}
        {t("全星通关 · 用时越短，排名越高")}
      </p>
      {entries.length > 0 && (
        <ol>
          {entries.map((entry, i) => (
            <li key={entry.id}>
              <span className="ranking-place">{i + 1}</span>
              <span className="ranking-name">
                {entry.names.map((n) => (n === "旅人" ? t(n) : n)).join(" · ")}
              </span>
              <strong>{formatTime(entry.timeMs)}</strong>
            </li>
          ))}
        </ol>
      )}
      <p className="ranking-state" role="status">
        {t(
          status === "loading"
            ? "正在读取排行榜…"
            : status === "error"
              ? "排行榜暂时不可用，点击刷新重试。"
              : entries.length
                ? "同一玩家或队伍只保留最快成绩"
                : "还没有通关成绩，来留下第一张祈愿签。",
        )}
      </p>
    </section>
  );
}
