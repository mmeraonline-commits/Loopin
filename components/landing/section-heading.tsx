import type { ReactNode } from "react";

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  tone = "light",
  className = "",
}: {
  eyebrow: string;
  title: ReactNode;
  description?: string;
  align?: "center" | "left";
  tone?: "light" | "dark";
  className?: string;
}) {
  const isCenter = align === "center";
  return (
    <div className={`${isCenter ? "mx-auto text-center" : "text-left"} max-w-2xl ${className}`}>
      <span
        className={`inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] ${
          tone === "dark" ? "text-brand-lime" : "text-brand-accent"
        }`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {eyebrow}
      </span>
      <h2
        className={`font-display mt-4 text-3xl leading-tight font-bold sm:text-4xl md:text-[2.75rem] ${
          tone === "dark" ? "text-white" : "text-brand-ink"
        }`}
      >
        {title}
      </h2>
      {description && (
        <p
          className={`mt-4 text-base leading-relaxed sm:text-lg ${
            tone === "dark" ? "text-white/70" : "text-slate-600"
          } ${isCenter ? "mx-auto" : ""}`}
        >
          {description}
        </p>
      )}
    </div>
  );
}
