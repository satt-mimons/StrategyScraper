"use client";

import { useRef, useEffect, type HTMLAttributes } from "react";

export interface SpotlightConfig {
  /** Radius of the halo in CSS pixels. */
  radius?: number;
  /** Peak alpha of the halo at its center (0–1). Kept low for an editorial, ambient feel. */
  brightness?: number;
  /** Hex color of the halo. Defaults to the house oxblood accent. */
  color?: string;
  /** 0–1 easing factor per frame; lower = a longer, lazier trail. */
  smoothing?: number;
}

// Palette-matched defaults. The upstream component assumed a white halo on a black page; The
// Desk is warm cream (--color-paper #f3efe5) with a single oxblood accent, so a bright white
// spotlight would be invisible and off-brand. A faint oxblood glow reads as "the one accent"
// following the cursor. See globals.css @theme tokens.
const DEFAULTS: Required<SpotlightConfig> = {
  radius: 280,
  brightness: 0.08,
  color: "#8c2f23", // --color-oxblood
  smoothing: 0.12,
};

const hexToRgb = (hex: string): string => {
  const bigint = parseInt(hex.slice(1), 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `${r},${g},${b}`;
};

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const useSpotlightEffect = (config: Required<SpotlightConfig>) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Respect the OS "reduce motion" setting — a cursor-tracking animation is exactly the kind
    // of ambient motion that setting is meant to suppress.
    if (prefersReducedMotion()) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    const OFFSCREEN = -1000;
    // `target` is where the mouse is; `current` chases it so the halo trails smoothly rather
    // than snapping. `smoothing` is the per-frame easing factor (0–1).
    let targetX = OFFSCREEN;
    let targetY = OFFSCREEN;
    let currentX = OFFSCREEN;
    let currentY = OFFSCREEN;
    const rgbColor = hexToRgb(config.color);

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const handleMouseMove = (event: MouseEvent) => {
      targetX = event.clientX;
      targetY = event.clientY;
    };

    const handleMouseLeave = () => {
      targetX = OFFSCREEN;
      targetY = OFFSCREEN;
    };

    const draw = () => {
      currentX += (targetX - currentX) * config.smoothing;
      currentY += (targetY - currentY) * config.smoothing;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (targetX !== OFFSCREEN && targetY !== OFFSCREEN) {
        const gradient = ctx.createRadialGradient(
          currentX,
          currentY,
          0,
          currentX,
          currentY,
          config.radius
        );
        gradient.addColorStop(0, `rgba(${rgbColor}, ${config.brightness})`);
        gradient.addColorStop(1, "rgba(0,0,0,0)");

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseleave", handleMouseLeave);
    animationFrameId = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseleave", handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, [config.radius, config.brightness, config.color, config.smoothing]);

  return canvasRef;
};

export interface SpotlightCursorProps extends HTMLAttributes<HTMLCanvasElement> {
  config?: SpotlightConfig;
}

export const SpotlightCursor = ({
  config = {},
  className = "",
  ...rest
}: SpotlightCursorProps) => {
  const canvasRef = useSpotlightEffect({ ...DEFAULTS, ...config });

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`fixed top-0 left-0 pointer-events-none z-[9999] w-full h-full ${className}`}
      {...rest}
    />
  );
};

// Alias kept so the upstream `import { Component } from ".../spotlight-cursor"` usage still
// resolves against this file.
export { SpotlightCursor as Component };
