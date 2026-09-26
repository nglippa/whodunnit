"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, type TextareaHTMLAttributes } from "react";

/**
 * A chromeless textarea that grows with its content, so long documents scroll
 * with the page like a manuscript instead of inside a box.
 */
export const ProseField = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }>(
  function ProseField({ minRows = 12, className, value, onChange, ...props }, forwarded) {
    const ref = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(forwarded, () => ref.current as HTMLTextAreaElement);

    const fit = useCallback(() => {
      const el = ref.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }, []);

    useEffect(fit, [value, fit]);
    useEffect(() => {
      window.addEventListener("resize", fit);
      return () => window.removeEventListener("resize", fit);
    }, [fit]);

    return (
      <textarea
        ref={ref}
        rows={minRows}
        value={value}
        onChange={onChange}
        spellCheck
        className={`prose-field block overflow-hidden ${className ?? ""}`}
        {...props}
      />
    );
  },
);
