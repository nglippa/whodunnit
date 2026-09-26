import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "quiet" | "link";

const styles: Record<Variant, string> = {
  primary:
    "inline-flex items-center gap-2 rounded-[3px] bg-ink px-4 h-9 text-[0.875rem] font-medium text-paper transition-[opacity,transform] hover:opacity-90 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40",
  quiet:
    "inline-flex items-center gap-1.5 rounded-[3px] px-2.5 h-8 text-[0.8125rem] text-ink-soft transition-colors hover:bg-accent-wash hover:text-ink disabled:cursor-not-allowed disabled:opacity-40",
  link: "inline-flex items-center gap-1 text-[0.8125rem] text-ink-soft underline decoration-rule-strong underline-offset-4 transition-colors hover:text-ink hover:decoration-ink disabled:opacity-40",
};

export function Button({ variant = "quiet", className, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type={type} className={`${styles[variant]} ${className ?? ""}`} {...props} />;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="font-mono text-[0.6875rem] tracking-wide opacity-70">{children}</kbd>;
}
