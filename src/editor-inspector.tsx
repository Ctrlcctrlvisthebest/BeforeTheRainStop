import type { Point } from "./game";
import type { RouteStep } from "./guide";
import type { MapFile, MapReport } from "./map-format";
import { interactiveModules } from "./map-rules";
import {
  MotionPreview,
  PLATFORM_HELP,
  TOOL_HELP,
  type HelpTopic,
} from "./editor-help";
import {
  duplicateEntity,
  editEntity,
  moveEntity,
  pointOf,
  removeEntity,
  syncRoute,
  platformStylePatch,
  platformMotionPatch,
  entityNames,
  type EditorEntity,
  type EntityKind,
  type Selection,
  type EntityPatch,
  type PlatformStyle,
} from "./editor-model";

export const numberField = (
  label: string,
  value: number,
  onChange: (value: number) => void,
  step = 0.1,
) => (
  <label key={label}>
    {label}
    <input
      type="number"
      step={step}
      value={Number.isFinite(value) ? +value.toFixed(3) : ""}
      onChange={(event) => {
        if (
          event.target.value !== "" &&
          Number.isFinite(event.target.valueAsNumber)
        )
          onChange(event.target.valueAsNumber);
      }}
    />
  </label>
);
const routeLabels: Record<RouteStep["kind"], string> = {
  walk: "走到目标",
  jump: "跳到目标",
  rack: "前往许愿架",
  key: "拾取钥匙",
  bridge: "搭桥过岸",
  wind: "乘风上升",
  ferry: "乘坐渡台",
  pads: "踏板开门",
  exit: "抵达终点",
};
type Patch = <K extends EntityKind>(
  selected: Selection<K>,
  values: EntityPatch<NoInfer<K>>,
) => void;
function entityDetail(entity: EditorEntity) {
  if (
    (entity.kind === "platforms" || entity.kind === "gate") &&
    entity.data.kind
  )
    return ` · ${PLATFORM_HELP[entity.data.kind][0]}`;
  return entity.kind === "route" ? ` · ${entity.data.kind}` : "";
}
function dimensionFields(entity: EditorEntity, patch: Patch) {
  switch (entity.kind) {
    case "platforms":
    case "gate":
      return (
        <>
          {numberField("宽度 W", entity.data.w, (w) => patch(entity, { w }))}
          {numberField("深度 D", entity.data.d, (d) => patch(entity, { d }))}
          {numberField("厚度 H", entity.data.h, (h) => patch(entity, { h }))}
        </>
      );
    case "winds":
      return (
        <>
          {numberField("宽度 W", entity.data.w, (w) => patch(entity, { w }))}
          {numberField("深度 D", entity.data.d, (d) => patch(entity, { d }))}
          {numberField("风柱高度", entity.data.height, (height) =>
            patch(entity, { height }),
          )}
        </>
      );
    case "hazards":
      return (
        <>
          {numberField("宽度 W", entity.data.w, (w) => patch(entity, { w }))}
          {numberField("深度 D", entity.data.d, (d) => patch(entity, { d }))}
        </>
      );
    case "awnings":
      return (
        <>
          {numberField("宽度 W", entity.data.w, (w) => patch(entity, { w }))}
          {numberField("深度 D", entity.data.d, (d) => patch(entity, { d }))}
          {entity.data.floor !== undefined &&
            numberField("小火地面高度", entity.data.floor, (floor) =>
              patch(entity, { floor }),
            )}
        </>
      );
    case "zones":
      return (
        <>
          {numberField("宽度 W", entity.data.w, (w) => patch(entity, { w }))}
          {numberField("深度 D", entity.data.d, (d) => patch(entity, { d }))}
          {numberField("雨量 / 秒", entity.data.rate, (rate) =>
            patch(entity, { rate }),
          )}
        </>
      );
    case "crossing":
      return (
        <>
          {numberField("断口长度", entity.data.span, (span) =>
            patch(entity, { span }),
          )}
          {numberField("桥面深度", entity.data.depth, (depth) =>
            patch(entity, { depth }),
          )}
        </>
      );
  }
}
function MotionFields({
  selected,
  patch,
}: {
  selected: Extract<EditorEntity, { kind: "platforms" | "gate" }>;
  patch: Patch;
}) {
  const platform = selected.data,
    motion = platform.motion;
  if (!motion) return null;
  return (
    <>
      <label>
        移动方向
        <select
          value={motion.axis}
          onChange={(event) =>
            patch(selected, {
              motion: { ...motion, axis: event.target.value as "x" | "z" },
            })
          }
        >
          <option value="x">X · 左右往返</option>
          <option value="z">Z · 前后往返</option>
        </select>
      </label>
      <div className="field-grid">
        {numberField("单侧移动距离", motion.range, (range) =>
          patch(selected, { motion: { ...motion, range } }),
        )}
        {numberField("完整往返 / 秒", motion.period, (period) =>
          patch(selected, { motion: { ...motion, period } }),
        )}
      </div>
      <MotionPreview
        key={`${selected.kind}:${selected.index}`}
        platform={platform}
      />
    </>
  );
}
function RoutePointFields({
  selected,
  patch,
}: {
  selected: Extract<EditorEntity, { kind: "route" }>;
  patch: Patch;
}) {
  const step = selected.data;
  if (step.kind === "jump" && step.via) {
    const via = step.via;
    return (
      <div className="field-grid">
        {(["x", "y", "z"] as const).map((key) =>
          numberField(`空中转弯点 ${key}`, via[key], (value) =>
            patch(selected, { via: { ...via, [key]: value } }),
          ),
        )}
      </div>
    );
  }
  if (step.kind === "wind" && step.from) {
    const from = step.from;
    return (
      <div className="field-grid">
        {(["x", "y", "z"] as const).map((key) =>
          numberField(`风柱起点 ${key}`, from[key], (value) =>
            patch(selected, { from: { ...from, [key]: value } }),
          ),
        )}
      </div>
    );
  }
  return null;
}
export function EditorInspector({
  map,
  report,
  all,
  selected,
  commit,
  setSelection,
  onHelp,
  onNotice,
}: {
  map: MapFile;
  report: MapReport;
  all: EditorEntity[];
  selected: EditorEntity | undefined;
  commit: (map: MapFile) => void;
  setSelection: (selection: Selection | null) => void;
  onHelp: (topic: HelpTopic) => void;
  onNotice: (notice: string) => void;
}) {
  const patch: Patch = (entity, values) =>
    commit(editEntity(map, entity, values));
  const coordinateField = (
    entity: EditorEntity,
    label: string,
    key: keyof Point,
  ) => {
    const point = pointOf(entity.data);
    return numberField(label, point[key], (value) =>
      commit(moveEntity(map, entity, { ...point, [key]: value })),
    );
  };
  const changeMap = (change: (map: MapFile) => void) => {
    const next = structuredClone(map);
    change(next);
    syncRoute(next);
    commit(next);
  };
  return (
    <aside className="inspector-panel">
      <div className="section-title">
        <span>02 / 属性</span>
        <span className="count-label">{map.level.platforms.length} 平台</span>
      </div>
      <label>
        地图名称
        <input
          value={map.level.name}
          maxLength={80}
          onChange={(e) =>
            changeMap((m) => {
              m.level.name = e.target.value;
            })
          }
        />
      </label>
      <label>
        本关提示
        <textarea
          value={map.level.hint}
          maxLength={180}
          onChange={(e) =>
            changeMap((m) => {
              m.level.hint = e.target.value;
            })
          }
        />
      </label>
      <label>
        许愿架存档方式
        <select
          value={map.level.freeCheckpoints ? "revisit" : "ordered"}
          onChange={(e) =>
            changeMap((m) => {
              if (e.target.value === "revisit") m.level.freeCheckpoints = true;
              else delete m.level.freeCheckpoints;
            })
          }
        >
          <option value="ordered">依次前往新架子</option>
          <option value="revisit">允许回访任意架子</option>
        </select>
      </label>
      {numberField(
        "目标关卡",
        map.chapter ?? 1,
        (n) =>
          changeMap((m) => {
            m.chapter = n;
          }),
        1,
      )}
      <p className="hint">
        平台宽、深和连续直路均不得超过 9。第 11
        关起至少需要两个路线中使用的独立互动模块；同类型可重复。当前{" "}
        {interactiveModules(map).length} 个。
      </p>
      <details>
        <summary>背景与雨势</summary>
        <label>
          副标题
          <input
            value={map.level.sub}
            maxLength={180}
            onChange={(e) =>
              changeMap((m) => {
                m.level.sub = e.target.value;
              })
            }
          />
        </label>
        <div className="field-grid">
          <label>
            天空
            <input
              type="color"
              value={map.level.sky}
              onChange={(e) =>
                changeMap((m) => {
                  m.level.sky = e.target.value;
                })
              }
            />
          </label>
          <label>
            平台色
            <input
              type="color"
              value={map.level.color}
              onChange={(e) =>
                changeMap((m) => {
                  m.level.color = e.target.value;
                })
              }
            />
          </label>
          {numberField(
            "雨势周期 / 秒",
            map.weather.period,
            (n) =>
              changeMap((m) => {
                m.weather.period = n;
              }),
            1,
          )}
        </div>
      </details>
      <label>
        选中对象
        <select
          aria-label="选中对象"
          value={selected ? `${selected.kind}:${selected.index}` : ""}
          onChange={(e) => {
            const entry = all.find(
              (entry) => `${entry.kind}:${entry.index}` === e.target.value,
            );
            setSelection(
              entry ? { kind: entry.kind, index: entry.index } : null,
            );
          }}
        >
          <option value="">点击画布选中</option>
          {all.map((e) => (
            <option key={`${e.kind}:${e.index}`} value={`${e.kind}:${e.index}`}>
              {entityNames[e.kind]} {e.index + 1}
              {entityDetail(e)}
            </option>
          ))}
        </select>
      </label>
      {selected ? (
        <div className="object-inspector">
          <h3>
            {entityNames[selected.kind]} {selected.index + 1}
          </h3>
          {TOOL_HELP[selected.kind] && (
            <div className="object-help">
              <p>{TOOL_HELP[selected.kind]!.body}</p>
              <button onClick={() => onHelp(TOOL_HELP[selected.kind]!.topic)}>
                这个组件怎么用？
              </button>
            </div>
          )}
          <div className="field-grid">
            {coordinateField(selected, "X", "x")}
            {selected.kind !== "zones" &&
              coordinateField(selected, "高度 Y", "y")}
            {coordinateField(selected, "深度 Z", "z")}
            {dimensionFields(selected, patch)}
          </div>
          {(selected.kind === "platforms" || selected.kind === "gate") && (
            <p className="field-help">
              Y 是顶面；厚度 H 向下延伸，底面为 Y − H。W 沿 X，D 沿
              Z。改“种类”不会自动改变这些尺寸。
            </p>
          )}
          {selected.kind === "platforms" && (
            <>
              <label>
                平台种类
                <select
                  value={selected.data.kind ?? "normal"}
                  onChange={(e) =>
                    commit(
                      editEntity(
                        map,
                        selected,
                        platformStylePatch(
                          selected.data,
                          e.target.value as PlatformStyle,
                        ),
                      ),
                    )
                  }
                >
                  <optgroup label="常用平台">
                    {["normal", "step", "wall", "moving"].map((k) => (
                      <option key={k} value={k}>
                        {PLATFORM_HELP[k][0]}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="纸桥专用 · 建议由组件生成">
                    {["low-roof", "railing"].map((k) => (
                      <option key={k} value={k}>
                        {PLATFORM_HELP[k][0]}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </label>
              <p className="field-help">
                {PLATFORM_HELP[selected.data.kind ?? "normal"]?.[1]}{" "}
                <button
                  className="text-link"
                  onClick={() => onHelp("platform")}
                >
                  种类对照表 ↗
                </button>
              </p>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={!!selected.data.motion}
                  onChange={(e) =>
                    commit(
                      editEntity(
                        map,
                        selected,
                        platformMotionPatch(selected.data, e.target.checked),
                      ),
                    )
                  }
                />
                开启往返移动（渡台）
              </label>
              <p className="field-help">
                {selected.data.motion
                  ? "开局就自动往返，站稳的纸鹤会随平台移动。下方可以播放或拖动时间预览。"
                  : "当前平台固定不动。勾选后，它与左侧“渡台”使用同一套运动规则。"}{" "}
                <button className="text-link" onClick={() => onHelp("motion")}>
                  参数怎么填？
                </button>
              </p>
            </>
          )}
          {(selected.kind === "platforms" || selected.kind === "gate") && (
            <MotionFields selected={selected} patch={patch} />
          )}
          {selected.kind === "hazards" && (
            <>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={selected.data.period !== undefined}
                  onChange={(e) =>
                    patch(selected, {
                      period: e.target.checked ? 5 : undefined,
                    })
                  }
                />
                间歇熄火
              </label>
              {selected.data.period !== undefined &&
                numberField("火焰周期 / 秒", selected.data.period, (period) =>
                  patch(selected, { period }),
                )}
              <p className="muted">
                周期前 48% 为旺火，之后熄灭。旺火自带篷子；篷子不能挡火。
              </p>
            </>
          )}
          {selected.kind === "crossing" && (
            <>
              <label>
                桥方向
                <select
                  value={selected.data.axis}
                  onChange={(e) =>
                    patch(selected, { axis: e.target.value as "x" | "z" })
                  }
                >
                  <option value="x">X · 左右跨过（正面）</option>
                  <option value="z">Z · 前后跨过（侧面）</option>
                </select>
              </label>
              <label>
                起始岸
                <select
                  value={selected.data.near}
                  onChange={(e) =>
                    patch(selected, { near: +e.target.value as -1 | 1 })
                  }
                >
                  <option value={-1}>
                    {selected.data.axis === "x"
                      ? "左岸 · X 较小"
                      : "Z 较小的一岸"}
                  </option>
                  <option value={1}>
                    {selected.data.axis === "x"
                      ? "右岸 · X 较大"
                      : "Z 较大的一岸"}
                  </option>
                </select>
              </label>
              <div className="help-note compact">
                <strong>桥钉不用另加，单人也一样</strong>
                <p>
                  单人：岸边按住 Shift 2 秒自动接桥。任何人到对岸木踏板站住 2
                  秒也能接桥，走哪条路都可以。
                </p>
                <button onClick={() => onHelp("bridge")}>
                  看完整纸桥示意 ↗
                </button>
              </div>
              <p className="muted">
                组件已经生成两岸、低檐和侧栏。改变断口方向、位置或高度后，请一并调整这些平台。
              </p>
            </>
          )}
          {selected.kind === "awnings" && (
            <p className="muted">
              Y
              是篷子高度，小火地面高度决定烤干位置。第一座篷子的小火靠左放置，给起点留出安全空间。
            </p>
          )}
          {(selected.kind === "signs" || selected.kind === "checkpoints") &&
            selected.data.text !== undefined && (
              <label>
                路牌文字
                <textarea
                  value={selected.data.text}
                  maxLength={100}
                  onChange={(e) => patch(selected, { text: e.target.value })}
                />
              </label>
            )}
          {selected.kind === "signs" && (
            <label>
              显示视角
              <select
                value={selected.data.view ?? "both"}
                onChange={(e) =>
                  patch(selected, {
                    view:
                      e.target.value === "both"
                        ? undefined
                        : (+e.target.value as 0 | 1),
                  })
                }
              >
                <option value="both">两面可见</option>
                <option value={0}>正面</option>
                <option value={1}>侧面</option>
              </select>
            </label>
          )}
          {selected.kind === "route" && (
            <>
              <label>
                引导动作
                <select
                  value={selected.data.kind}
                  disabled={selected.data.kind === "exit"}
                  onChange={(e) => {
                    const kind = e.target.value as RouteStep["kind"];
                    const references =
                      kind === "key"
                        ? map.level.keys
                        : kind === "rack"
                          ? map.level.checkpoints
                          : kind === "ferry"
                            ? map.level.platforms
                            : null;
                    const id =
                      kind === "ferry"
                        ? map.level.platforms.findIndex((p) => p.motion)
                        : 0;
                    commit(
                      editEntity(map, selected, {
                        kind,
                        ...(references
                          ? { id: references[id] ? id : undefined }
                          : {}),
                        ...(kind === "wind"
                          ? { from: { ...selected.data.target } }
                          : {}),
                      }),
                    );
                  }}
                >
                  {Object.entries(routeLabels).map(([kind, label]) => (
                    <option key={kind} value={kind}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                所需视角
                <select
                  value={selected.data.view}
                  onChange={(e) =>
                    patch(selected, { view: +e.target.value as 0 | 1 })
                  }
                >
                  <option value={0}>正面 X</option>
                  <option value={1}>侧面 Z</option>
                </select>
              </label>
              {["key", "rack", "ferry"].includes(selected.data.kind) && (
                <label>
                  关联对象
                  <select
                    value={selected.data.id ?? ""}
                    onChange={(e) => patch(selected, { id: +e.target.value })}
                  >
                    <option value="" disabled>
                      选择要引导的对象
                    </option>
                    {(selected.data.kind === "key"
                      ? map.level.keys
                      : selected.data.kind === "rack"
                        ? map.level.checkpoints
                        : map.level.platforms
                    ).map(
                      (p, i) =>
                        (selected.data.kind !== "ferry" ||
                          ("motion" in p && Boolean(p.motion))) && (
                          <option key={i} value={i}>
                            {selected.data.kind === "key"
                              ? "钥匙"
                              : selected.data.kind === "rack"
                                ? "许愿架"
                                : "渡台"}{" "}
                            {i + 1}
                          </option>
                        ),
                    )}
                  </select>
                </label>
              )}
              {selected.data.kind === "jump" && (
                <label>
                  空中转面
                  <input
                    type="checkbox"
                    checked={!!selected.data.via}
                    onChange={(e) =>
                      patch(selected, {
                        via: e.target.checked
                          ? { ...selected.data.target }
                          : undefined,
                      })
                    }
                  />
                </label>
              )}
              <RoutePointFields selected={selected} patch={patch} />
              {selected.data.kind === "ferry" && (
                <label>
                  换乘目标
                  <select
                    value={selected.data.landingId ?? ""}
                    onChange={(e) =>
                      patch(selected, {
                        landingId:
                          e.target.value === "" ? undefined : +e.target.value,
                      })
                    }
                  >
                    <option value="">固定对岸（目标坐标）</option>
                    {map.level.platforms.map(
                      (p, i) =>
                        p.motion &&
                        i !== selected.data.id && (
                          <option key={i} value={i}>
                            换到渡台 {i + 1}
                          </option>
                        ),
                    )}
                  </select>
                </label>
              )}
              {selected.data.kind === "ferry" && (
                <label>
                  渡台携带钥匙
                  <select
                    value={selected.data.requiredKey ?? ""}
                    onChange={(e) =>
                      patch(selected, {
                        requiredKey:
                          e.target.value === "" ? undefined : +e.target.value,
                      })
                    }
                  >
                    <option value="">不需要</option>
                    {map.level.keys.map((_, i) => (
                      <option key={i} value={i}>
                        钥匙 {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="button-row">
                <button
                  disabled={
                    selected.index === 0 || selected.data.kind === "exit"
                  }
                  onClick={() => {
                    const i = selected.index;
                    changeMap((m) => {
                      [m.route[i - 1], m.route[i]] = [
                        m.route[i],
                        m.route[i - 1],
                      ];
                    });
                    setSelection({ kind: selected.kind, index: i - 1 });
                  }}
                >
                  步骤前移
                </button>
                <button
                  disabled={
                    selected.index >= map.route.length - 2 ||
                    selected.data.kind === "exit"
                  }
                  onClick={() => {
                    const i = selected.index;
                    changeMap((m) => {
                      [m.route[i + 1], m.route[i]] = [
                        m.route[i],
                        m.route[i + 1],
                      ];
                    });
                    setSelection({ kind: selected.kind, index: i + 1 });
                  }}
                >
                  步骤后移
                </button>
              </div>
              <p className="muted">
                钥匙、许愿架、纸桥、踏板和终点引导会跟随原对象坐标。路线顺序请按实际行走顺序排列。
              </p>
            </>
          )}
          <div className="button-row object-actions">
            <button
              disabled={["spawn", "exit", "gate", "crossing", "route"].includes(
                selected.kind,
              )}
              onClick={() => {
                try {
                  const r = duplicateEntity(map, selected);
                  commit(r.map);
                  setSelection(r.selection);
                } catch (e) {
                  onNotice(e instanceof Error ? e.message : "无法复制物件");
                }
              }}
            >
              复制
            </button>
            <button
              className="danger"
              disabled={
                ["spawn", "exit"].includes(selected.kind) ||
                (selected.kind === "route" && selected.data.kind === "exit")
              }
              onClick={() => {
                commit(removeEntity(map, selected));
                setSelection(null);
              }}
            >
              删除
            </button>
          </div>
        </div>
      ) : (
        <div className="empty-inspector">
          选择一个物件来调整坐标、大小与玩法。
          <br />
          看不到的对象也可以从上方列表选中。
        </div>
      )}
      <details className="validation" open>
        <summary>
          03 / 检查 ·{" "}
          {report.errors.length
            ? `${report.errors.length} 项待修复`
            : "结构通过"}
          {report.warnings.length ? ` · ${report.warnings.length} 条提醒` : ""}
        </summary>
        {report.errors.map((x, i) => (
          <p className="error" key={`e${i}`}>
            {x}
          </p>
        ))}
        {report.warnings.map((x, i) => (
          <p key={`w${i}`}>{x}</p>
        ))}
        <p className="muted">
          结构校验不会判断所有跳跃是否可达。导出前请试玩，检查钥匙、存档顺序、火堆和终点。
        </p>
      </details>
    </aside>
  );
}
