"use client";

import type { CSSProperties, ReactNode } from "react";

/** CSS fade/rise-in — avoids framer whileInView getting stuck at opacity 0. */
export function Reveal({
  children,
  className,
  delay = 0,
  direction = "up",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "none";
}) {
  const style = {
    animationDelay: `${delay}s`,
  } as CSSProperties;

  return (
    <div
      className={[
        direction === "none" ? "animate-landing-fade" : "animate-landing-reveal",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      {children}
    </div>
  );
}

/** Staggered group — children should be `RevealItem`s. */
export function RevealGroup({
  children,
  className,
  stagger = 0.09,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
}) {
  return (
    <div
      className={className}
      style={{ "--reveal-stagger": `${stagger}s` } as CSSProperties}
    >
      {children}
    </div>
  );
}

export function RevealItem({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={["animate-landing-reveal", className].filter(Boolean).join(" ")}>{children}</div>;
}
