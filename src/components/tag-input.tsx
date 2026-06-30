"use client";

import { useState } from "react";
import { btnOutline, inputClass } from "@/components/desk";

export function TagInput({
  label,
  values,
  onChange,
  placeholder,
  suggestions,
}: {
  label?: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
}) {
  const [input, setInput] = useState("");

  const add = (value?: string) => {
    const trimmed = (value ?? input).trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
      setInput("");
    }
  };

  const unusedSuggestions = (suggestions ?? []).filter((s) => !values.includes(s));

  return (
    <div>
      {label && (
        <label className="block font-sans text-[13px] font-semibold text-ink-2 mb-2">
          {label}
        </label>
      )}
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1.5 font-mono text-[12px] font-medium text-ink-2 bg-surface border border-hairline-2 rounded-chip px-2.5 py-1.5"
            >
              {v}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="text-oxblood hover:opacity-70 leading-none"
                aria-label={`Remove ${v}`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={placeholder}
          className={inputClass + " flex-1"}
        />
        <button type="button" onClick={() => add()} className={btnOutline}>
          Add
        </button>
      </div>
      {unusedSuggestions.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {unusedSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="font-mono text-[12px] text-ink-4 border border-hairline-2 rounded-chip px-2.5 py-1.5 hover:bg-surface hover:text-ink-2 transition"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
