import type { DrawOp, Point } from "@iguess/shared";
import { stroke, circle, arc, line } from "./geometry.ts";
export const natureDoodles: Record<string, () => DrawOp[][]> = {
  tree: () => [
    stroke([
      { x: 0.47, y: 0.85 },
      { x: 0.47, y: 0.62 },
      { x: 0.53, y: 0.62 },
      { x: 0.53, y: 0.85 },
    ]),
    circle(0.5, 0.44, 0.16),
  ],
  cat: () => [
    circle(0.5, 0.55, 0.22),
    stroke([
      { x: 0.34, y: 0.4 },
      { x: 0.3, y: 0.22 },
      { x: 0.46, y: 0.36 },
    ]),
    stroke([
      { x: 0.66, y: 0.4 },
      { x: 0.7, y: 0.22 },
      { x: 0.54, y: 0.36 },
    ]),
    stroke([
      { x: 0.44, y: 0.52 },
      { x: 0.46, y: 0.52 },
    ]),
    stroke([
      { x: 0.54, y: 0.52 },
      { x: 0.56, y: 0.52 },
    ]),
    stroke([
      { x: 0.3, y: 0.6 },
      { x: 0.18, y: 0.57 },
    ]),
    stroke([
      { x: 0.3, y: 0.63 },
      { x: 0.18, y: 0.64 },
    ]),
    stroke([
      { x: 0.7, y: 0.6 },
      { x: 0.82, y: 0.57 },
    ]),
    stroke([
      { x: 0.7, y: 0.63 },
      { x: 0.82, y: 0.64 },
    ]),
  ],
  sun: () => {
    const rays: DrawOp[][] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      rays.push(
        stroke([
          { x: 0.5 + 0.19 * c, y: 0.5 + 0.19 * s },
          { x: 0.5 + 0.32 * c, y: 0.5 + 0.32 * s },
        ]),
      );
    }
    return [circle(0.5, 0.5, 0.15), ...rays];
  },
  flower: () => {
    // One wavy ring, not five circles. Five circles look like a bunch of grapes.
    const ring: Point[] = [];
    for (let i = 0; i <= 60; i++) {
      const a = -Math.PI / 2 + (i / 60) * Math.PI * 2;
      const r = 0.09 + 0.08 * Math.abs(Math.cos((5 * a) / 2));
      ring.push({ x: 0.5 + r * Math.cos(a), y: 0.38 + r * Math.sin(a) });
    }
    return [
      stroke(ring),
      circle(0.5, 0.38, 0.05),
      stroke([
        { x: 0.5, y: 0.44 },
        { x: 0.51, y: 0.84 },
      ]),
      stroke([
        { x: 0.51, y: 0.66 },
        { x: 0.66, y: 0.58 },
        { x: 0.62, y: 0.7 },
        { x: 0.51, y: 0.66 },
      ]),
    ];
  },
  fish: () => [
    stroke([
      { x: 0.3, y: 0.5 },
      { x: 0.44, y: 0.4 },
      { x: 0.6, y: 0.4 },
      { x: 0.68, y: 0.5 },
      { x: 0.6, y: 0.6 },
      { x: 0.44, y: 0.6 },
      { x: 0.3, y: 0.5 },
    ]),
    stroke([
      { x: 0.68, y: 0.5 },
      { x: 0.8, y: 0.42 },
      { x: 0.8, y: 0.58 },
      { x: 0.68, y: 0.5 },
    ]),
    circle(0.4, 0.47, 0.014),
  ],
  cloud: () => [
    // One bumpy outline. Overlapping circles just look like overlapping circles.
    stroke([
      { x: 0.28, y: 0.62 },
      { x: 0.24, y: 0.55 },
      { x: 0.28, y: 0.47 },
      { x: 0.36, y: 0.45 },
      { x: 0.38, y: 0.37 },
      { x: 0.48, y: 0.33 },
      { x: 0.57, y: 0.36 },
      { x: 0.62, y: 0.42 },
      { x: 0.71, y: 0.43 },
      { x: 0.77, y: 0.5 },
      { x: 0.75, y: 0.58 },
      { x: 0.68, y: 0.62 },
      { x: 0.28, y: 0.62 },
    ]),
  ],
  mushroom: () => [
    stroke([
      { x: 0.32, y: 0.5 },
      { x: 0.36, y: 0.4 },
      { x: 0.5, y: 0.36 },
      { x: 0.64, y: 0.4 },
      { x: 0.68, y: 0.5 },
      { x: 0.32, y: 0.5 },
    ]),
    stroke([
      { x: 0.44, y: 0.5 },
      { x: 0.44, y: 0.66 },
      { x: 0.56, y: 0.66 },
      { x: 0.56, y: 0.5 },
    ]),
  ],
  apple: () => [
    arc(0.5, 0.56, 0.2, -Math.PI * 0.9, Math.PI * 0.9),
    stroke([
      { x: 0.5, y: 0.38 },
      { x: 0.52, y: 0.26 },
    ]),
    stroke([
      { x: 0.52, y: 0.3 },
      { x: 0.66, y: 0.24 },
      { x: 0.56, y: 0.34 },
    ]),
  ],
  moon: () => [
    stroke([
      { x: 0.6, y: 0.22 },
      { x: 0.42, y: 0.3 },
      { x: 0.36, y: 0.5 },
      { x: 0.42, y: 0.7 },
      { x: 0.6, y: 0.78 },
      { x: 0.5, y: 0.66 },
      { x: 0.48, y: 0.5 },
      { x: 0.5, y: 0.34 },
      { x: 0.6, y: 0.22 },
    ]),
  ],
  egg: () => [
    stroke([
      { x: 0.5, y: 0.22 },
      { x: 0.64, y: 0.38 },
      { x: 0.68, y: 0.58 },
      { x: 0.6, y: 0.74 },
      { x: 0.5, y: 0.78 },
      { x: 0.4, y: 0.74 },
      { x: 0.32, y: 0.58 },
      { x: 0.36, y: 0.38 },
      { x: 0.5, y: 0.22 },
    ]),
  ],
  leaf: () => [
    stroke([
      { x: 0.28, y: 0.74 },
      { x: 0.3, y: 0.48 },
      { x: 0.46, y: 0.28 },
      { x: 0.7, y: 0.24 },
    ]),
    stroke([
      { x: 0.7, y: 0.24 },
      { x: 0.66, y: 0.48 },
      { x: 0.5, y: 0.66 },
      { x: 0.28, y: 0.74 },
    ]),
    line(0.28, 0.74, 0.66, 0.32),
    line(0.42, 0.6, 0.4, 0.44),
    line(0.55, 0.5, 0.52, 0.36),
  ],
};
