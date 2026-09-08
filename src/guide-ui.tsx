import { useState } from "react";
import { LEVELS, type Game } from "./game";
import { words, type Guidance, type Lesson, type Copy } from "./guide";
import type { Language } from "./i18n";
import { touchCopy } from "./mobile";
interface LessonData {
  name: Copy;
  title: Copy;
  steps: Copy[];
  note: Copy;
  keys: string[];
}
export const LESSONS: Record<Lesson, LessonData> = {
  basics: {
    name: ["走与跳", "Move & jump"],
    title: ["跑到边缘，再跳向对面", "Run to the edge, then jump across"],
    keys: ["← → / A D", "空格"],
    steps: [
      [
        "左右键或 A / D 移动。先看清平台边缘和落脚处。",
        "Move with arrows or A / D. Find the edge and your landing place.",
      ],
      [
        "按住方向键，再按空格起跳；下落时继续按住空格，可以滑翔得更远。",
        "Hold a direction, then press Space to jump. Keep holding Space while falling to glide farther.",
      ],
      [
        "落到平台上，才能再次起跳。金色空心路标标出当前目标。",
        "Land on a platform before jumping again. A hollow gold marker shows your current target.",
      ],
    ],
    note: [
      "手机用下方方向与「跳 / 滑翔」按钮，滑翔时不要松手。",
      "On touch screens, use the arrows and Jump / Glide buttons. Keep holding to glide.",
    ],
  },
  turn: {
    name: ["转动视角", "Turn view"],
    title: [
      "路在拐角后面，按 Q 才能走进去",
      "Press Q to follow a path around the corner",
    ],
    keys: ["Q / E", "← →"],
    steps: [
      [
        "走到拐角，让纸鹤与下一条走廊对齐。",
        "Reach the corner and line up with the next walkway.",
      ],
      [
        "按一次 Q / E，世界旋转 90°。纸鹤仍在原位置，没有传送。",
        "Press Q / E once. The world turns 90°; the crane stays in the same place.",
      ],
      [
        "左右键现在控制另一条方向。跟随提示中的左箭头或右箭头；到下个拐角再转。",
        "Left and right now control the other axis. Follow the guide’s arrow, and turn again at the next corner.",
      ],
    ],
    note: [
      "亮边平台与你在同一行进层，暗色平台在后方，淡化的平台在前方。联机转面前，先让队友站稳。",
      "Bright edges mark your current lane; darker platforms are behind it and faded platforms are in front. Let teammates land before turning.",
    ],
  },
  bridge: {
    name: ["搭桥接应", "Paper bridge"],
    title: [
      "一人借出纸面，一人放下木桥",
      "One lends the paper; another lowers the deck",
    ],
    keys: ["Shift", "→"],
    steps: [
      [
        "低檐断口跳不过。对齐金色桥钉，按住 Shift，整只纸鹤变成桥。",
        "Low eaves prevent jumping. Align with the gold pins and hold Shift to become a bridge.",
      ],
      [
        "同伴到达对岸后，在金色方板上站稳 2 秒可放下木桥。可以走纸桥，也可以用其他方式过去。",
        "Anyone who reaches the far bank can hold its gold plate for 2 seconds to lower the wooden deck. Use the paper bridge or find another route.",
      ],
      [
        "看到「木桥接通」后，搭桥者松开 Shift，跟上队友。提前松手会退回原岸。",
        "Once the wooden deck is ready, release Shift and follow. Releasing early returns you to the original bank.",
      ],
    ],
    note: [
      "单人还可以按住 Shift 满 2 秒自动接桥。木桥是方便通行的选择；如果能直接过去，就继续前进。每次折桥消耗耐折。",
      "Solo players can also hold Shift for 2 seconds to lower the deck. The wooden bridge is optional: if you can get across another way, keep going. Each fold uses durability.",
    ],
  },
  rain: {
    name: ["挡雨与火", "Rain & fire"],
    title: [
      "屋檐挡雨，小火烤干，旺火要跳过",
      "Roofs shelter, small fires dry, blazes burn",
    ],
    keys: ["S / ↓", "空格"],
    steps: [
      [
        "淋雨会增加湿度，达到 100% 就会失败。屋檐只停止淋湿；靠近小火光圈才会烤干。",
        "Rain increases wetness; at 100% you fail. Roofs stop rain. Stand in a small fire’s light ring to dry.",
      ],
      [
        "烤干就离开！烘烤程度 65 开始警告，100 会脆裂。旺火碰到就烧毁，必须提前起跳。",
        "Leave once dry! Heat warns at 65 and shatters paper at 100. Blazing fires burn on contact: jump early.",
      ],
      [
        "地面按住 S / ↓ 展成方纸，遮住附近队友。自己仍会慢慢淋湿；两人可互相挡雨。",
        "Hold S / Down on the ground to shelter nearby friends as a square sheet. You still get wet slowly; two sheets can shelter each other.",
      ],
    ],
    note: [
      "展纸不能移动或跳跃，也挡不住火。S 不是护盾或烘干键。",
      "While unfolded you cannot move or jump. S cannot block fire or dry paper.",
    ],
  },
  save: {
    name: ["收集与存档", "Items & saves"],
    title: [
      "拿到不等于存好，带到下一座许愿架",
      "Carry each pickup to the next wishing rack",
    ],
    keys: ["F", "R"],
    steps: [
      [
        "靠近钥匙或星星自动拾取。钥匙必须找齐，星星可以不拿。",
        "Touch keys or stars to collect them. All keys are required; stars are optional.",
      ],
      [
        "到下一个新许愿架自动存档，并补满耐折。死亡或按 R 返回，自己未存档的物品回到原处。",
        "A new rack saves items and restores folds automatically. Dying or pressing R returns your unsaved items to their original places.",
      ],
      [
        "纸有 6 格耐折；每次展纸或搭桥消耗 1 格，湿度 ≥ 60 时消耗 2 格。架旁按住 F 两秒可修补。",
        "Paper has 6 folds. A shelter or bridge costs 1, or 2 at 60% wetness. Hold F at a rack for 2 seconds to mend.",
      ],
    ],
    note: [
      "回旧架子或按 F 不会补存新物品。队友携带和已存物品不受你的死亡影响；灯门保存最后一段收集。",
      "Old racks and F do not save new pickups. Your death does not remove friends’ items or saved items. The exit saves your final collection.",
    ],
  },
  wind: {
    name: ["风柱与渡台", "Wind & ferries"],
    title: [
      "借风登高，借渡台过长断口",
      "Rise on the wind; ride across wide gaps",
    ],
    keys: ["← →", "空格"],
    steps: [
      [
        "站进发光风柱会自动上升。升到高台上方，再按方向键移到平台。",
        "Enter a glowing wind column to rise automatically. Move onto the ledge once you are above it.",
      ],
      [
        "等移动渡台靠近再跳上去，落稳后它会带你移动。",
        "Wait for the moving ferry to approach, then jump aboard. It carries you once you land.",
      ],
      [
        "等它接近对岸，再用方向键＋空格跳到岸上。途中钥匙也要带走。",
        "When near the far bank, press direction + Space to jump ashore. Collect keys along the way.",
      ],
    ],
    note: [
      "第六关的两段长断口不能直接跳过去，先寻找移动的落脚处。",
      "The two wide gaps in chapter 6 cannot be jumped directly. Find a moving landing first.",
    ],
  },
  gate: {
    name: ["机关与通关", "Pads & exit"],
    title: [
      "踩踏板移开路障，再一起走到终点",
      "Open the barrier, then bring everyone to the exit",
    ],
    keys: [],
    steps: [
      [
        "带齐钥匙，向终点前进。遇到挡路闸门，可以找门形标记的石踏板开门，也可以尝试绕过去。",
        "Collect every key and head to the exit. If a barrier blocks the path, use its doorway-marked stone plates or find a way around it.",
      ],
      [
        "单人站一块；联机任选两人，每人站一块不同的踏板。保持 4 秒，前方挡路闸门就会移开。提前离开会重新计时。",
        "Solo: stand on one plate. Multiplayer: any two players each hold a different plate for 4 seconds. This removes the barrier ahead. Leaving early resets the countdown.",
      ],
      [
        "闸门一旦打开就会保持打开，踩踏板的人也可以离开。无论走哪条路，只要钥匙齐、所有人到金色终点灯门，就能通关。",
        "An opened barrier stays open, so plate holders can leave. Any route is valid: collect all keys and bring everyone to the golden lantern exit to finish.",
      ],
    ],
    note: [
      "站在踏板上就能开门。S 仅用于挡雨，踩踏板的人也能按；无需第三人。断桥对岸的金色木踏板用于接桥，小火旁的光圈表示烘干范围。",
      "Standing on the plates activates them. S is optional rain shelter; plate holders can use it, so no third player is needed. Gold wooden plates lower bridges; fire rings mark drying areas.",
    ],
  },
};
export function GoalFlow({ language }: { language: Language }) {
  const w = (c: Copy) => words(c, language);
  return (
    <div className="goal-flow" aria-label={w(["通关目标", "How to finish"])}>
      <span>
        <b>1</b> {w(["找齐钥匙", "Collect all keys"])}
      </span>
      <i>→</i>
      <span>
        <b>2</b> {w(["许愿架存档", "Save at racks"])}
      </span>
      <i>→</i>
      <span>
        <b>3</b> {w(["全员到灯门", "Everyone home"])}
      </span>
    </div>
  );
}
export function GuideCard({
  g,
  guide,
  language,
  onLearn,
  compact = false,
}: {
  g: Game;
  guide: Guidance;
  language: Language;
  onLearn: (l: Lesson) => void;
  compact?: boolean;
}) {
  const w = (c: Copy) =>
      compact ? touchCopy(words(c, language), language) : words(c, language),
    l = LEVELS[g.level];
  return (
    <section
      className={`journey-guide ${guide.warning ? "has-warning" : ""}`}
      aria-label={w(["当前玩法引导", "Current gameplay guide"])}
    >
      <div className="guide-heading">
        <span>{w(["路线建议", "ROUTE HINT"])}</span>
        <button onClick={() => onLearn(guide.lesson)}>
          {w(compact ? ["图解", "Help"] : ["查看图解", "Show me how"])} ↗
        </button>
      </div>
      <div className="guide-action">
        <span className="guide-arrow" aria-hidden="true">
          {
            { left: "←", right: "→", turn: "↻", up: "↑", stay: "◎" }[
              guide.direction ?? "stay"
            ]
          }
        </span>
        <h2>{w(guide.title)}</h2>
      </div>
      <p>{w(guide.body)}</p>
      <div className="guide-keys">
        {guide.keys.length ? (
          guide.keys.map((k, i) => (
            <kbd key={i}>
              {compact
                ? touchCopy(k, language)
                : k === "空格"
                  ? w(["空格", "Space"])
                  : k}
            </kbd>
          ))
        ) : (
          <span>
            {w(["站稳，等待提示变化", "Stand still and watch the next cue"])}
          </span>
        )}
      </div>
      {guide.warning && (
        <p className="guide-warning">
          ! {w(guide.warning)}{" "}
          <button
            onClick={() =>
              onLearn(
                guide.warning && guide.warning[0].includes("耐折")
                  ? "save"
                  : "rain",
              )
            }
          >
            {w(["看说明", "Details"])}
          </button>
        </p>
      )}
      <div className="guide-goal">
        ⚿ {g.keys.length}/{l.keys.length} {w(["钥匙", "keys"])}
        <span>
          ↗ {g.players.filter((p) => p.arrived).length}/{g.mode}{" "}
          {w(["抵达灯门", "home"])}
        </span>
        <small>
          {w([
            "星星可选 · 金色空心圈是路标",
            "Stars optional · hollow gold rings are guide markers",
          ])}
        </small>
      </div>
    </section>
  );
}
function Crane({
  x,
  y,
  color = "#cd806e",
}: {
  x: number;
  y: number;
  color?: string;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-28 0 -5 8 17 -15 3 9 29 1 8 20 -10 16Z" fill={color} />
      <path d="M-5 8 -21 -18 3 9Z" fill="#e6b6a1" />
      <path d="M17 -15 29 -13 19 -9Z" fill={color} />
    </g>
  );
}
function LessonDiagram({
  lesson,
  language,
  compact = false,
}: {
  lesson: Lesson;
  language: Language;
  compact?: boolean;
}) {
  const w = (c: Copy) =>
    compact ? touchCopy(words(c, language), language) : words(c, language);
  return (
    <svg
      className="lesson-diagram"
      viewBox="0 0 480 136"
      role="img"
      aria-label={w(LESSONS[lesson].title)}
    >
      <defs>
        <marker
          id="lesson-arrow"
          markerWidth="6"
          markerHeight="6"
          refX="5"
          refY="3"
          orient="auto"
        >
          <path d="M0 0 6 3 0 6" fill="#b38b52" />
        </marker>
      </defs>
      {lesson === "basics" && (
        <>
          <path d="M28 108H174M295 108H450" stroke="#6d7d85" strokeWidth="10" />
          <Crane x={113} y={81} />
          <path
            d="M135 67 Q239 -9 336 76"
            fill="none"
            stroke="#b38b52"
            strokeWidth="3"
            strokeDasharray="6 5"
            markerEnd="url(#lesson-arrow)"
          />
          <text x="238" y="119">
            {w(["方向 + 空格", "Direction + Space"])}
          </text>
        </>
      )}
      {lesson === "turn" && (
        <>
          <path
            d="M45 103H173V37H270"
            fill="none"
            stroke="#adb8b9"
            strokeWidth="21"
          />
          <Crane x={99} y={79} />
          <path
            d="M109 102H171V40H256"
            fill="none"
            stroke="#b38b52"
            strokeWidth="3"
            strokeDasharray="6 5"
            markerEnd="url(#lesson-arrow)"
          />
          <text x="336" y="62">
            Q / E ↻
          </text>
          <text x="339" y="91">
            {w(["拐角 → 转面 → 继续", "Corner → turn → go"])}
          </text>
        </>
      )}
      {lesson === "bridge" && (
        <>
          <path
            d="M24 102H161M309 102H454M71 29H347"
            stroke="#6d7d85"
            strokeWidth="9"
          />
          <path d="M151 96H317" stroke="#c97f6c" strokeWidth="8" />
          <Crane x={286} y={59} color="#779eaf" />
          <rect x="329" y="94" width="31" height="7" fill="#bd955e" />
          <text x="222" y="126">
            Shift
          </text>
          <text x="362" y="67">
            2s
          </text>
          <path
            d="M176 65H258"
            stroke="#b38b52"
            strokeWidth="2"
            markerEnd="url(#lesson-arrow)"
          />
        </>
      )}
      {lesson === "rain" && (
        <>
          <path
            d="M22 38 87 18 151 38M180 38 245 18 309 38M338 38 399 18 459 38"
            stroke="#6d7d85"
            strokeWidth="8"
            fill="none"
          />
          <path
            d="M71 96Q44 80 72 49Q75 75 84 64Q106 89 86 98Z"
            fill="#d8a54b"
          />
          <path
            d="M367 96Q339 70 371 32Q377 70 390 42Q421 18 421 91Z"
            fill="#cd7050"
          />
          <Crane x={241} y={81} />
          <text x="81" y="122">
            {w(["小火：烤干就走", "Small: dry, then leave"])}
          </text>
          <text x="246" y="122">
            {w(["屋檐：只挡雨", "Roof: blocks rain"])}
          </text>
          <text x="400" y="122">
            {w(["旺火：跳过", "Blaze: jump over"])}
          </text>
        </>
      )}
      {lesson === "save" && (
        <>
          <text x="66" y="72" className="diagram-icon">
            ⚿ ✦
          </text>
          <path
            d="M136 66H201M320 66H387"
            stroke="#b38b52"
            strokeWidth="2"
            markerEnd="url(#lesson-arrow)"
          />
          <path
            d="M216 94V38H302V94M211 33H308"
            fill="none"
            stroke="#8b6c50"
            strokeWidth="7"
          />
          <rect x="234" y="45" width="20" height="29" fill="#d4b783" />
          <rect x="266" y="45" width="20" height="29" fill="#d4b783" />
          <text x="419" y="75" className="diagram-icon">
            ✓
          </text>
          <text x="64" y="119">
            {w(["随身携带", "Carried"])}
          </text>
          <text x="260" y="119">
            {w(["下一个新架子", "Next new rack"])}
          </text>
          <text x="419" y="119">
            {w(["正式保存", "Saved"])}
          </text>
        </>
      )}
      {lesson === "wind" && (
        <>
          <path
            d="M36 110H124M164 58H224M270 110H316M403 110H460"
            stroke="#6d7d85"
            strokeWidth="9"
          />
          <path
            d="M91 98V26"
            stroke="#7d9eaa"
            strokeWidth="3"
            strokeDasharray="5 4"
            markerEnd="url(#lesson-arrow)"
          />
          <Crane x={101} y={42} />
          <rect x="332" y="91" width="53" height="8" fill="#ad986c" />
          <path
            d="M311 118H407"
            stroke="#b38b52"
            strokeWidth="2"
            markerEnd="url(#lesson-arrow)"
          />
          <text x="355" y="49">
            {w(["等 → 上船 → 再跳", "Wait → board → jump"])}
          </text>
        </>
      )}
      {lesson === "gate" && (
        <>
          {[55, 145].map((x) => (
            <g key={x}>
              <rect
                x={x - 29}
                y="92"
                width="58"
                height="13"
                rx="2"
                fill="#697786"
              />
              <path
                d={`M${x - 9} 103V95H${x + 9}V103`}
                fill="none"
                stroke="#ffe0a0"
                strokeWidth="2"
              />
            </g>
          ))}
          <Crane x={55} y={69} />
          <Crane x={145} y={69} color="#779eaf" />
          <path
            d="M187 83H222"
            stroke="#b38b52"
            strokeWidth="2"
            markerEnd="url(#lesson-arrow)"
          />
          <rect
            x="248"
            y="49"
            width="29"
            height="55"
            fill="none"
            stroke="#b38b52"
            strokeDasharray="4 4"
          />
          <rect x="248" y="15" width="29" height="26" rx="2" fill="#d49b57" />
          <path
            d="M263 84V53"
            stroke="#b38b52"
            strokeWidth="2"
            markerEnd="url(#lesson-arrow)"
          />
          <path
            d="M295 83H351"
            stroke="#b38b52"
            strokeWidth="2"
            markerEnd="url(#lesson-arrow)"
          />
          <path
            d="M373 105V51H443V105M365 45H451"
            stroke="#b78d4f"
            strokeWidth="6"
            fill="none"
          />
          <text x="100" y="28">
            {w(["① 踩住 4 秒", "① Hold for 4s"])}
          </text>
          <text x="263" y="125">
            {w(["② 闸门移开", "② Barrier opens"])}
          </text>
          <text x="408" y="28">
            {w(["③ 一起到终点", "③ All reach exit"])}
          </text>
          <Crane x={408} y={76} />
        </>
      )}
    </svg>
  );
}
export function HowToPlay({
  language,
  initialLesson = "basics",
  playing = false,
  multiplayer = false,
  compact = false,
}: {
  language: Language;
  initialLesson?: Lesson;
  playing?: boolean;
  multiplayer?: boolean;
  compact?: boolean;
}) {
  const [lesson, setLesson] = useState<Lesson>(initialLesson),
    data = LESSONS[lesson],
    w = (c: Copy) =>
      compact ? touchCopy(words(c, language), language) : words(c, language);
  return (
    <div className="how-to-play">
      <span className="eyebrow">{w(["玩法图解", "PLAYING GUIDE"])}</span>
      <h2>
        {w(["先看目标，再学眼前这一步", "Know the goal. Learn the next step."])}
      </h2>
      <GoalFlow language={language} />
      {playing && (
        <p className="guide-pause-note">
          {w(
            multiplayer
              ? [
                  "联机仍在进行，请先在安全处站稳再看图解。",
                  "The multiplayer game continues. Find a safe place before reading.",
                ]
              : [
                  "单人游戏已暂停，可以慢慢看。",
                  "Solo play is paused. Take your time.",
                ],
          )}
        </p>
      )}
      <div
        className="lesson-tabs"
        role="tablist"
        aria-label={w(["玩法主题", "Gameplay topics"])}
      >
        {(Object.keys(LESSONS) as Lesson[]).map((id) => (
          <button
            key={id}
            role="tab"
            id={`lesson-${id}`}
            aria-controls="lesson-panel"
            aria-selected={id === lesson}
            onClick={() => setLesson(id)}
          >
            {w(LESSONS[id].name)}
          </button>
        ))}
      </div>
      <div
        id="lesson-panel"
        role="tabpanel"
        aria-labelledby={`lesson-${lesson}`}
      >
        <h3>{w(data.title)}</h3>
        <LessonDiagram lesson={lesson} language={language} compact={compact} />
        <ol>
          {data.steps.map((s, i) => (
            <li key={i}>{w(s)}</li>
          ))}
        </ol>
        <p className="lesson-note">{w(data.note)}</p>
      </div>
    </div>
  );
}
