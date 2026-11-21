import { useLayoutEffect, useRef, type ReactNode } from "react";
import "./app-header.css";

export function AppHeader({ children }: { children: ReactNode }) {
  const header = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = header.current!;
    const parent = element.parentElement!;
    const measure = () => {
      parent.style.setProperty(
        "--app-header-bottom",
        `${Math.ceil(element.offsetTop + element.getBoundingClientRect().height)}px`,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
  return (
    <div className="app-header" ref={header}>
      {children}
    </div>
  );
}
