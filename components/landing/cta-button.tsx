import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

type CtaVariant = "primary" | "secondary" | "ghost" | "inverse";

const base =
  "inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold transition-all duration-200 whitespace-nowrap cursor-pointer";

const variants: Record<CtaVariant, string> = {
  primary:
    "bg-brand-primary text-white shadow-lg shadow-brand-primary/25 hover:bg-brand-secondary hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand-primary/30",
  secondary:
    "bg-white text-brand-primary border border-brand-primary/20 hover:border-brand-primary/40 hover:bg-brand-mint",
  ghost: "text-brand-primary hover:bg-brand-mint",
  inverse:
    "bg-white text-brand-primary hover:-translate-y-0.5 hover:bg-brand-lime shadow-lg shadow-black/10",
};

export function CtaButton({
  href,
  children,
  variant = "primary",
  className = "",
  showArrow = false,
  onClick,
}: {
  href: string;
  children: ReactNode;
  variant?: CtaVariant;
  className?: string;
  showArrow?: boolean;
  onClick?: () => void;
}) {
  return (
    <Link href={href} onClick={onClick} className={`${base} ${variants[variant]} ${className}`}>
      {children}
      {showArrow && <ArrowRight className="h-4 w-4" />}
    </Link>
  );
}
