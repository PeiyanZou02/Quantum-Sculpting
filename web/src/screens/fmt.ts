// Number formats shared by the panels.
export const fmt = {
  int: (v: number) => Math.round(v).toLocaleString('en-US'),
  f2: (v: number) => v.toFixed(2),
  f1: (v: number) => v.toFixed(1),
  pct: (v: number) => `${Math.round(v * 100)}%`,
  up: (u: string) => `${u[0]}${u[1].toUpperCase()}`,
}
