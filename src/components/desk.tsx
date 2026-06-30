/*
 * The Desk — presentational primitives shared across screens.
 * No hooks: these render in both server and client components.
 */
import type { ReactNode } from "react";

/** Reusable button class strings (see README component library). */
export const btnInk =
  "inline-flex items-center justify-center bg-ink text-paper font-sans text-[13.5px] font-semibold px-5 py-2.5 rounded-btn hover:bg-ink-2 transition disabled:opacity-50 disabled:pointer-events-none";

export const btnOxblood =
  "inline-flex items-center justify-center bg-oxblood text-white font-sans text-[13.5px] font-semibold px-4 py-2.5 rounded-btn hover:opacity-90 transition disabled:opacity-50 disabled:pointer-events-none";

export const btnGhost =
  "inline-flex items-center justify-center bg-transparent text-ink-3 font-sans text-[13.5px] font-semibold px-4 py-2.5 rounded-btn border border-hairline-2 hover:bg-surface transition disabled:opacity-50 disabled:pointer-events-none";

export const btnInkOutline =
  "inline-flex items-center justify-center bg-transparent text-ink font-sans text-[13.5px] font-semibold px-4 py-2.5 rounded-btn border border-ink hover:bg-surface transition disabled:opacity-50 disabled:pointer-events-none";

export const btnOutline =
  "inline-flex items-center justify-center bg-transparent text-ink font-sans text-[13px] font-semibold px-4 py-2.5 rounded-input border border-ink hover:bg-surface transition disabled:opacity-50 disabled:pointer-events-none";

/** Form text input — warm surface fill, hairline border. */
export const inputClass =
  "w-full box-border px-3.5 py-2.5 border border-hairline-2 rounded-input bg-surface font-sans text-[15px] text-ink placeholder:text-ink-4 focus:outline-none focus:border-ink";

/** Newspaper rule: a short oxblood segment, then a full-width hairline. */
export function NewspaperRule() {
  return (
    <div className="flex items-center">
      <div className="w-[46px] h-0.5 bg-oxblood" />
      <div className="flex-1 h-px bg-rule" />
    </div>
  );
}

const DATELINE_FMT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** "TUE · JUN 28 2026 · STANDING BRIEFS" — computed from `date`, uppercased. */
export function Dateline({ date, label }: { date: Date; label: string }) {
  const parts = DATELINE_FMT.formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const text = `${get("weekday")} · ${get("month")} ${get("day")} ${get("year")} · ${label}`;
  return (
    <div className="font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-ink-4">
      {text}
    </div>
  );
}

/** Editorial tag (replaces blue pill chips). `muted` is the "+N" overflow style. */
export function EditorialTag({
  children,
  muted = false,
}: {
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center font-mono text-[11px] font-medium rounded-chip border border-hairline-2 px-2 py-1 ${
        muted ? "text-ink-4 bg-transparent" : "text-ink-2 bg-surface"
      }`}
    >
      {children}
    </span>
  );
}

/** Form section heading — Newsreader, oxblood, with a hairline underline. */
export function FormSectionHeading({ children }: { children: ReactNode }) {
  return (
    <div className="font-serif text-[15px] font-semibold text-oxblood border-b border-hairline-3 pb-2 mb-4">
      {children}
    </div>
  );
}

/** Labeled form field wrapper — Libre Franklin 13px / 600 label over its control. */
export function Field({
  label,
  children,
  className = "",
}: {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block font-sans text-[13px] font-semibold text-ink-2 mb-2">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Shared style for footnote / helper text — plain mono, no box. */
export const helperText = "font-mono text-[12px] text-ink-4 leading-relaxed";

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Hex color input with a live swatch; shows the email default when left blank. */
export function ColorField({
  label,
  value,
  onChange,
  fallback,
}: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  fallback: string;
}) {
  const trimmed = value.trim();
  const swatch = HEX_RE.test(trimmed) ? trimmed : fallback;
  return (
    <Field label={label}>
      <div className="flex items-center gap-2.5">
        <span
          className="w-9 h-9 rounded-input border border-hairline-2 shrink-0"
          style={{ background: swatch }}
          aria-hidden
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
          placeholder={fallback}
        />
      </div>
      {!trimmed && (
        <p className={`${helperText} mt-1.5`}>
          Blank uses the default {fallback} in the email.
        </p>
      )}
    </Field>
  );
}

/** Logo URL input with a live image preview (or a note when blank). */
export function LogoField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const url = value.trim();
  return (
    <Field label="Logo URL · optional">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputClass}
        placeholder="https://…"
      />
      {url ? (
        <div className="mt-2.5 flex items-center gap-2.5">
          {/* User-supplied arbitrary URL — next/image's remote allowlist doesn't fit. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Logo preview"
            className="max-h-10 max-w-[140px] object-contain border border-hairline rounded-input bg-white p-1"
          />
          <span className={helperText}>Shown in the email header.</span>
        </div>
      ) : (
        <p className={`${helperText} mt-1.5`}>
          Blank uses a text wordmark of the company name.
        </p>
      )}
    </Field>
  );
}

/** Quiet footnote listing the six research lanes (never says "AI"). */
export function SourcesCallout({ copy }: { copy: string }) {
  return <p className={helperText}>{copy}</p>;
}
