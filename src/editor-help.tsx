import React, { useEffect, useRef, useState } from "react";
import { platformAt, type Platform } from "./game";
import type { Tool } from "./editor-model";

export type HelpTopic =
  "start" | "bridge" | "platform" | "motion" | "weather" | "route";
export const PLATFORM_HELP: Record<string, [string, string]> = {
  normal: [
    "普通平台",
    "基础落脚长方体，默认固定；下方可开启往返运动。用宽度、深度和顶面高度搭出道路。",
  ],
  step: [
    "台阶",
    "一块用作台阶的平台。不会自动生成楼梯：复制几块，再逐块抬高 Y。",
  ],
  wall: [
    "墙体",
    "用来挡路的实体长方体。高度与厚度决定挡住哪里；只改种类不会自动把它变高。",
  ],
  moving: [
    "渡台（移动平台）",
    "载着纸鹤往返的平台。选择此项会自动开启下方的往返运动。",
  ],
  "low-roof": [
    "纸桥低檐",
    "限制跳跃的桥顶。由纸桥组件生成；游戏用半透明剖面显示，实体顶面 Y 不是通道净高。",
  ],
  railing: [
    "纸桥侧栏",
    "挡住断口两侧，防止绕开纸桥。由组件生成；游戏会淡化显示，实际碰撞仍按尺寸计算。",
  ],
};
export const TOOL_HELP: Partial<
  Record<Tool, { title: string; body: string; topic: HelpTopic }>
> = {
  platforms: {
    title: "先搭出能站稳的路",
    body: "平台提供落脚面，也会阻挡纸鹤。宽度 W 沿 X，深度 D 沿 Z；高度 Y 是顶面。",
    topic: "platform",
  },
  moving: {
    title: "渡台 = 开启往返运动的平台",
    body: "游戏开始就自动来回移动，纸鹤站上去会被带走。放置后可预览轨迹和速度。",
    topic: "motion",
  },
  wall: {
    title: "墙要从地面向上挡路",
    body: "墙体按钮会生成高 4 格的墙。已有平台只改种类不会改变尺寸。",
    topic: "platform",
  },
  crossing: {
    title: "纸桥只需放置一次",
    body: "两岸、低檐和侧栏一起生成。桥钉与接桥踏板由游戏自动补齐，单人无需另加。",
    topic: "bridge",
  },
  keys: {
    title: "放在玩家拿得到的位置",
    body: "钥匙必须全部收齐。创建时自动抬高 0.7 格，并添加拾取引导；已有钥匙的位置在右侧调整。",
    topic: "route",
  },
  stars: {
    title: "给愿意冒险的玩家",
    body: "星星是额外挑战，不影响开门通关。可以放在较难到达的支路。",
    topic: "route",
  },
  checkpoints: {
    title: "路中间的存档与修补站",
    body: "先放支撑平台，再放许愿架。死亡会丢失上次存档后拾取的物品；按 F 可修补耐折。",
    topic: "route",
  },
  awnings: {
    title: "挡雨和烤干是两件事",
    body: "篷子挡雨，自动附带的小火烤干。需要在下面铺平台；久烤会使纸鹤脆裂。",
    topic: "weather",
  },
  hazards: {
    title: "这是碰到就失败的旺火",
    body: "自带篷子，不能拿来烤干。可开启间歇熄火，留出通过的时间。",
    topic: "weather",
  },
  winds: {
    title: "风柱会把纸鹤托高",
    body: "Y 是风柱底部。把落脚平台放在风柱能送达的高度，并留好上升空间。",
    topic: "platform",
  },
  zones: {
    title: "框出会下雨的区域",
    body: "俯视图调整覆盖范围和雨量。重叠雨区取较大雨量；在路线中安排小火补给。",
    topic: "weather",
  },
  pads: {
    title: "开门踏板，不负责搭桥",
    body: "单人踩第一块，多人同时踩最多两块，保持 4 秒。还需要放机关门和支撑平台。",
    topic: "bridge",
  },
  gate: {
    title: "踏板控制的实体门",
    body: "地图没有踏板时会自动补两块。门和踏板都需要支撑平台；有纸桥时先接通纸桥再开门。",
    topic: "bridge",
  },
  signs: {
    title: "写给玩家看的场景提示",
    body: "例如「Q 转面，沿后方走廊前进」。可限定正面或侧面显示，减少重叠。",
    topic: "route",
  },
  route: {
    title: "控制“下一步”路标",
    body: "引导点只提示路线，不会生成地形或机关。按实际走路、跳跃、转弯的顺序排列。",
    topic: "route",
  },
  spawn: {
    title: "起点必须落在平台上",
    body: "每张图只有一个起点。六人会沿 +X 每隔 0.75 格站开，要留足安全空间。",
    topic: "start",
  },
  exit: {
    title: "路线的最后一站",
    body: "全部钥匙收齐、所有玩家到达才通关。终点需要支撑平台，出口引导会跟着移动。",
    topic: "route",
  },
};

export function BridgeDiagram() {
  return (
    <svg
      className="help-diagram"
      viewBox="0 0 520 180"
      role="img"
      aria-label="纸桥组件示意：两岸之间有断口，上方低檐限制跳跃，两岸桥钉与对岸接桥踏板自动生成"
    >
      <rect x="20" y="112" width="195" height="30" fill="#738996" />
      <rect x="305" y="112" width="195" height="30" fill="#738996" />
      <rect x="105" y="42" width="310" height="12" fill="#aa8e6a" />
      <path d="M 185 108 L 260 88 L 335 108 Z" fill="#c47e68" opacity=".7" />
      <circle
        cx="185"
        cy="110"
        r="10"
        fill="none"
        stroke="#e1b965"
        strokeWidth="3"
      />
      <circle
        cx="335"
        cy="110"
        r="10"
        fill="none"
        stroke="#e1b965"
        strokeWidth="3"
      />
      <rect x="327" y="107" width="16" height="7" fill="#d8ae6e" />
      <text x="260" y="29" textAnchor="middle">
        低檐：限制起跳，让纸桥有用
      </text>
      <text x="110" y="90" textAnchor="middle">
        起始岸
      </text>
      <text x="410" y="90" textAnchor="middle">
        接应岸
      </text>
      <text x="185" y="164" textAnchor="middle">
        桥钉 · 自动生成
      </text>
      <text x="370" y="164" textAnchor="middle">
        接桥踏板 · 自动生成
      </text>
      <text x="260" y="133" textAnchor="middle" fill="#eacb93">
        断口
      </text>
    </svg>
  );
}

export function MotionPreview({ platform }: { platform: Platform }) {
  const motion = platform.motion!;
  const [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false);
  const valid = motion.period >= 1 && motion.range > 0;
  useEffect(() => {
    setTime(0);
    setPlaying(false);
  }, [motion.axis, motion.range, motion.period]);
  useEffect(() => {
    if (!playing || !valid) return;
    let frame = 0,
      previous = performance.now();
    const tick = (now: number) => {
      const delta = Math.min((now - previous) / 1000, 0.1);
      previous = now;
      setTime((t) => (t + delta) % motion.period);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, motion.period, valid]);
  if (!valid)
    return <p className="field-help">先填写有效距离和周期，再预览运动。</p>;
  const axis = motion.axis.toUpperCase(),
    center = platform[motion.axis];
  const position = platformAt(platform, time)[motion.axis];
  const f = (n: number) => +n.toFixed(2);
  return (
    <section className="motion-preview" aria-label="往返运动示意">
      <div className="section-title">
        <span>运动预览 · 不改变地图</span>
        <button onClick={() => setPlaying((p) => !p)}>
          {playing ? "暂停预览" : "播放运动"}
        </button>
      </div>
      <svg
        viewBox="0 0 260 95"
        role="img"
        aria-label={`${axis} 轴中心从 ${f(center - motion.range)} 到 ${f(center + motion.range)}，${motion.period} 秒循环一次`}
      >
        <path
          d="M 35 35 H 225 M 35 28 V 42 M 130 24 V 46 M 225 28 V 42"
          fill="none"
          stroke="#8497a3"
          strokeWidth="2"
        />
        <rect
          x={118 + ((position - center) / motion.range) * 95}
          y="26"
          width="24"
          height="18"
          rx="2"
          fill="#b3765b"
        />
        <text x="35" y="68" textAnchor="middle">
          {f(center - motion.range)}
        </text>
        <text x="130" y="68" textAnchor="middle">
          {f(center)}
        </text>
        <text x="225" y="68" textAnchor="middle">
          {f(center + motion.range)}
        </text>
        <text x="130" y="88" textAnchor="middle">
          平台中心的 {axis} 坐标
        </text>
      </svg>
      <label>
        拖动时间看位置 · {time.toFixed(1)} / {motion.period} 秒
        <input
          aria-label="移动预览时间"
          type="range"
          min={0}
          max={motion.period}
          step={0.05}
          value={time}
          onChange={(e) => {
            setPlaying(false);
            setTime(+e.target.value);
          }}
        />
      </label>
      <p>
        中心 {f(center)}，向两边各走 {motion.range} 格，两端相距{" "}
        {f(motion.range * 2)} 格。{motion.period} 秒完成一整轮；高度 Y 保持{" "}
        {platform.y}。
      </p>
    </section>
  );
}

const topics: [HelpTopic, string][] = [
  ["start", "开始制作"],
  ["bridge", "纸桥与桥钉"],
  ["platform", "平台种类"],
  ["motion", "渡台与移动"],
  ["weather", "雨与火"],
  ["route", "引导与导出"],
];

export function EditorHelp({
  topic,
  onTopic,
  onClose,
}: {
  topic: HelpTopic;
  onTopic: (t: HelpTopic) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const d = dialog.current!;
    d.showModal();
    return () => d.close();
  }, []);
  useEffect(() => {
    body.current?.scrollTo(0, 0);
  }, [topic]);
  return (
    <dialog
      ref={dialog}
      className="editor-help-dialog"
      aria-label="编辑器组件说明"
      onCancel={onClose}
    >
      <header>
        <div>
          <small>MAP MAKING NOTES</small>
          <h2>边搭边看，弄清每个部件。</h2>
        </div>
        <button onClick={onClose} aria-label="关闭组件说明">
          关闭 ×
        </button>
      </header>
      <nav aria-label="说明分类">
        {topics.map(([key, label]) => (
          <button
            key={key}
            aria-pressed={topic === key}
            className={topic === key ? "active" : ""}
            onClick={() => onTopic(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="help-content" ref={body}>
        {topic === "start" && (
          <>
            <h3>第一张图，先做一条能走完的路</h3>
            <ol>
              <li>
                用现有直路起步，或在左侧选关卡模板后点「载入模板」。载入会替换当前草稿，可撤销；重要草稿先导出。
              </li>
              <li>
                点「平台」，再点画布放一块。放完自动回到「选择 /
                拖动」；拖动选中的物件，右侧改大小与高度。
              </li>
              <li>
                俯视图排路线和转弯；正面图看左右跳跃；侧面图看前后方向的跳跃。
              </li>
              <li>
                先放稳起点、终点，再加一把钥匙和一个存档架。先试玩走通，再逐渐加雨、火和机关。
              </li>
              <li>
                结构检查通过后点「试玩地图」。Esc
                回到编辑继续改；最后导出文件留存。
              </li>
            </ol>
            <div className="help-note">
              <strong>选不到、看不到时</strong>
              <p>
                用右侧「选中对象」列表找物件；点「看全图」找回地图。正面重叠的物件可能在不同
                Z 深度，切到俯视图确认。删除 / 复制在右侧，撤销支持 Ctrl / ⌘ Z。
              </p>
            </div>
            <h3>三个坐标，两个游戏视角</h3>
            <table>
              <thead>
                <tr>
                  <th>坐标</th>
                  <th>表示什么</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>X</td>
                  <td>左右位置。游戏正面按右键沿 +X。</td>
                </tr>
                <tr>
                  <td>Y</td>
                  <td>高度。平台的 Y 是顶面，不是中心。</td>
                </tr>
                <tr>
                  <td>Z</td>
                  <td>前后位置。游戏转到侧面后，按右键沿 −Z。</td>
                </tr>
              </tbody>
            </table>
            <p>
              「吸附 0.5」表示每次移动对齐半格。「放置高度
              Y」决定俯视图中新物件的高度；修改已放物件要用右侧属性。
            </p>
          </>
        )}
        {topic === "bridge" && (
          <>
            <h3>单人不需要另外放桥钉</h3>
            <p>
              选「纸桥组件」，在空地上点一次。编辑器生成两岸平台、低檐、两条侧栏和断口；游戏根据断口自动画出两岸金色桥钉、对岸接桥踏板和可接通的木桥。同一张图适用于单人、双人、三人和六人。
            </p>
            <BridgeDiagram />
            <table>
              <thead>
                <tr>
                  <th>人数</th>
                  <th>玩家怎么过</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>单人</td>
                  <td>
                    站到起始岸金色圈中央，按住 Shift 2
                    秒；木桥接通后松开，走过去。
                  </td>
                </tr>
                <tr>
                  <td>多人</td>
                  <td>
                    一人持续按住 Shift；队友从纸面走到对岸，再在金色木踏板上站稳
                    2 秒，放下木桥接应搭桥者。
                  </td>
                </tr>
              </tbody>
            </table>
            <h3>做这类关卡，检查这四件事</h3>
            <ol>
              <li>
                把组件放在空的断口处，再把自己的道路接到两岸。不要用一整块平台把断口底下铺满，否则能直接走过去。
              </li>
              <li>
                保留低檐和两条侧栏，避免玩家直接跳过或绕过。断口默认 2.6
                格，最多 2.8 格。
              </li>
              <li>
                桥方向 X 表示沿左右跨过，需正面视角；Z
                表示沿前后跨过，需侧面视角。起始岸是玩家先到的那一岸。
              </li>
              <li>
                移动断口或更改方向、长度、高度后，两岸、低檐、侧栏仍是独立平台，需要一起调整；「搭桥过岸」引导也要指向新的对岸。
              </li>
            </ol>
            <div className="help-note">
              <strong>三个标记，各管一件事</strong>
              <p>
                金色桥钉圈定位搭桥位置；对岸金色木踏板负责接桥；带门形图案的石踏板负责开门（4
                秒）。不要为了单人模式再添加开门踏板来代替桥钉。
              </p>
            </div>
            <p>
              每张图最多 1 处纸桥、1 道机关门和 2
              块开门踏板。纸桥不需要搭配机关门才能工作。
            </p>
          </>
        )}
        {topic === "platform" && (
          <>
            <h3>种类说明用途；尺寸决定实体形状</h3>
            <p>
              平台都是有碰撞的长方体。切换种类不会自动生成楼梯、改变宽度或抬高墙体；「渡台」会额外开启往返运动。普通平台和台阶的碰撞规则相同。
            </p>
            <table>
              <thead>
                <tr>
                  <th>种类</th>
                  <th>用途与操作</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(PLATFORM_HELP).map(([k, [label, text]]) => (
                  <tr key={k}>
                    <td>{label}</td>
                    <td>{text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3>高度 Y 与厚度 H，最容易填反</h3>
            <div className="dimension-example">
              <span>顶面 Y = 2 · 纸鹤站在这里</span>
              <div>厚度 H = 1 ↓</div>
              <span>底面 = Y − H = 1</span>
            </div>
            <p>
              例如想做一块高 2 格的落脚台，设 Y = 2；H = 1 表示它从顶面向下厚 1
              格。宽度 W 沿 X，深度 D 沿 Z，都是完整尺寸。
            </p>
            <p>
              楼梯要放多块平台，逐块调整 X 或 Z，并逐步增加
              Y。低檐与侧栏请优先使用完整纸桥组件生成，单独改种类不会自动得到合适的通道。
            </p>
          </>
        )}
        {topic === "motion" && (
          <>
            <h3>渡台与往返移动，是同一个功能</h3>
            <p>
              左侧「渡台（移动平台）」是快捷创建：放下一块已开启往返运动的平台。右侧「开启往返移动（渡台）」让已有平台执行相同运动。无需两者各放一个。
            </p>
            <p>
              游戏开始后，平台自动连续往返，不需要纸鹤踩上去才启动。站稳在平台上的纸鹤会跟着走；起跳离开后按自己的跳跃轨迹运动。
            </p>
            <table>
              <thead>
                <tr>
                  <th>参数</th>
                  <th>意思</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>移动方向</td>
                  <td>X：左右；Z：前后。当前不支持上下升降。</td>
                </tr>
                <tr>
                  <td>中心位置</td>
                  <td>上方 X / Z 坐标是轨迹中心，也是开局位置。</td>
                </tr>
                <tr>
                  <td>单侧移动距离</td>
                  <td>
                    从中心到任一端的距离。填 2 表示左右各 2，两端相距 4 格。
                  </td>
                </tr>
                <tr>
                  <td>完整往返 / 秒</td>
                  <td>
                    中心 → 正向端 → 中心 → 反向端 →
                    中心，完成一整轮。越小越快；在两端会自然减速。
                  </td>
                </tr>
              </tbody>
            </table>
            <MotionPreview
              platform={{
                x: 10,
                y: 0,
                z: 0,
                w: 2.4,
                d: 3,
                h: 1,
                motion: { axis: "x", range: 2, period: 6 },
              }}
            />
            <div className="help-note">
              <strong>两岸要能接得上</strong>
              <p>
                在最靠岸的位置，检查纸鹤能否跳上 /
                跳下。画布虚线表示中心轨迹，真正的平台还有宽度；轨迹也不要穿过墙和火堆。仅改颜色或名字不能代替开启运动。
              </p>
            </div>
          </>
        )}
        {topic === "weather" && (
          <>
            <h3>先把路走通，再加入天气压力</h3>
            <table>
              <thead>
                <tr>
                  <th>组件</th>
                  <th>规则与搭建要点</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>雨区</td>
                  <td>
                    设置 X/Z
                    覆盖范围和每秒湿度。雨势周期会增强或减弱雨量；重叠区域取较大雨量。
                  </td>
                </tr>
                <tr>
                  <td>篷子 + 小火</td>
                  <td>
                    篷子只挡雨，小火才烤干。Y
                    是篷顶高度，「小火地面高度」要与脚下平台一致。组件不自动铺地板。
                  </td>
                </tr>
                <tr>
                  <td>旺火</td>
                  <td>
                    碰到就烧毁。自带篷子，但不会变成安全的小火。间歇模式每轮前
                    48% 燃烧，后 52% 熄灭。
                  </td>
                </tr>
                <tr>
                  <td>许愿架</td>
                  <td>
                    保存进度、按 F
                    修补折叠次数。许愿架本身不会烤干，补给区还要安排小火。
                  </td>
                </tr>
              </tbody>
            </table>
            <p>
              小火附近要留出离火降温的位置。纸鹤烤干后继续停留会脆裂；别把起点、踏板或必须久等的位置压在小火范围内。
            </p>
          </>
        )}
        {topic === "route" && (
          <>
            <h3>引导点是“下一步”提示，不是机关</h3>
            <p>
              先搭地形和物件，再按实际行进顺序添加引导点。每一步的「所需视角」决定玩家应在正面还是侧面走。
            </p>
            <table>
              <thead>
                <tr>
                  <th>动作</th>
                  <th>目标放在哪里</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>走 / 跳到目标</td>
                  <td>落脚位置或拐角。改变所需视角会提示玩家转面。</td>
                </tr>
                <tr>
                  <td>钥匙 / 许愿架</td>
                  <td>
                    创建物件时自动加入。目标跟随物件移动，仍需检查步骤顺序。
                  </td>
                </tr>
                <tr>
                  <td>搭桥过岸</td>
                  <td>
                    纸桥组件自动加入。目标在对岸，所需视角应与桥方向一致。
                  </td>
                </tr>
                <tr>
                  <td>乘坐渡台</td>
                  <td>
                    关联实际有运动的平台，目标放在下船的岸上。可要求先拿到一把钥匙。
                  </td>
                </tr>
                <tr>
                  <td>乘风上升</td>
                  <td>填风柱起点与上方落脚位置。</td>
                </tr>
                <tr>
                  <td>踏板开门 / 终点</td>
                  <td>
                    开门动作放在出口前。终点必须是最后一步，且随终点物件移动。
                  </td>
                </tr>
              </tbody>
            </table>
            <h3>试玩、保存、导出</h3>
            <ol>
              <li>
                右侧「检查」中的错误要修好，才能试玩与导出；提醒也值得逐条检查。
              </li>
              <li>
                试玩是单人，使用正式游戏的物理、雨水、存档与折叠规则。Esc
                返回编辑，试玩不改草稿。
              </li>
              <li>
                结构通过只说明文件合法，不代表每段跳跃都能过。务必实际走到终点；多人配合和六人出生空间需要额外检查。
              </li>
              <li>
                草稿自动保存在当前浏览器；下载的 .rain-map.json
                才是可留存、分享、重新导入的地图文件。
              </li>
            </ol>
            <p>
              导出不会自动发布成公共关卡，也不会创建联机房间。导出的格式与正式新关卡相同，可以接入游戏。
            </p>
          </>
        )}
      </div>
      <footer>
        <span>说明随时可打开；编辑中的草稿会保留。</span>
        <button className="primary" onClick={onClose}>
          回到搭建
        </button>
      </footer>
    </dialog>
  );
}

const steps = [
  {
    title: "摆出路线",
    body: "先沿现有直路加一块平台。点左侧组件，再点画布；放完会自动回到选择模式，拖动物件即可改位置。",
    action: "选择平台，开始放置",
    tool: "platforms",
  },
  {
    title: "调好高度",
    body: "选中平台，看右侧的顶面 Y、宽度 W、深度 D。切到正面图检查跳跃高度；台阶要由多块不同高度的平台组成。",
    action: "切到正面看高度",
    tool: "front",
  },
  {
    title: "加入机关",
    body: "每次先加一种机制。纸桥自带两岸与自动桥钉；渡台就是开启了往返移动的平台。先弄清规则，再提高难度。",
    action: "看纸桥与桥钉说明",
    tool: "bridge-help",
  },
  {
    title: "安排下一步",
    body: "先放钥匙、许愿架和终点，再补走路、跳跃、转弯的引导点。引导只提示路线，不会替你生成地形。",
    action: "选择引导点",
    tool: "route",
  },
  {
    title: "试玩并导出",
    body: "检查右侧错误，完整走到终点。Esc 回来调整；满意后点顶部「导出地图」。浏览器草稿和下载的地图文件是两份保存。",
    action: "开始单人试玩",
    tool: "preview",
  },
] as const;
export type WalkthroughAction = (typeof steps)[number]["tool"];
export function EditorWalkthrough({
  open,
  onToggle,
  onAction,
  canPreview,
}: {
  open: boolean;
  onToggle: () => void;
  onAction: (action: WalkthroughAction) => void;
  canPreview: boolean;
}) {
  const [step, setStep] = useState(0),
    current = steps[step];
  return (
    <section
      className={`editor-walkthrough ${open ? "" : "collapsed"}`}
      aria-label="地图制作引导"
    >
      <div className="walkthrough-title">
        <strong>从一段路开始</strong>
        <span>
          制作引导 · {step + 1} / {steps.length}
        </span>
        <button onClick={onToggle} aria-expanded={open}>
          {open ? "收起引导" : "展开引导"}
        </button>
      </div>
      {open && (
        <>
          <nav aria-label="制作步骤">
            {steps.map((s, i) => (
              <button
                key={s.title}
                aria-current={i === step ? "step" : undefined}
                onClick={() => setStep(i)}
              >
                <b>{i + 1}</b>
                {s.title}
              </button>
            ))}
          </nav>
          <div className="walkthrough-body">
            <p>{current.body}</p>
            <button
              onClick={() => onAction(current.tool)}
              disabled={current.tool === "preview" && !canPreview}
            >
              {current.action} ↗
            </button>
          </div>
        </>
      )}
    </section>
  );
}
