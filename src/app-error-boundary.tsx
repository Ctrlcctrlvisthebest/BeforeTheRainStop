import { Component, type ErrorInfo, type ReactNode } from "react";

// React commit errors (including text nodes replaced by browser translation)
// otherwise unmount the root, leaving only the blue page background.
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "[BeforeTheRainStop] Interface error",
      error,
      info.componentStack,
    );
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="scene-loading notranslate" translate="no" role="alert">
        <p lang="zh-CN">游戏界面遇到问题，请重新加载。</p>
        <p lang="en">The game interface ran into a problem. Please reload.</p>
        <p lang="zh-CN">请关闭网页翻译，使用游戏内的「中文 / EN」切换语言。</p>
        <p lang="en">
          Turn off page translation and use the game's 中文 / EN button.
        </p>
        <button onClick={() => location.reload()}>重新加载 / Reload</button>
      </div>
    );
  }
}
