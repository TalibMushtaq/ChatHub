// Theming helpers for the emoji picker, resolving ChatHubby's design tokens
// through the browser's own color resolution pipeline.
//
// getComputedStyle(el).getPropertyValue('--color-…') does NOT resolve nested
// references (var(), color-mix, light-dark, etc.) — the browser returns the
// raw specified string for custom properties.  Instead we assign the token to
// a real property (color) on a throwaway element and read the computed value
// back, which is fully resolved but may serialize as oklch(), color(...), etc.
// We then normalize through <canvas>.fillStyle which always produces #rrggbb.

let probe: HTMLElement | null = null;

function resolveCssColor(name: string): string {
  if (!probe) {
    probe = document.createElement("div");
    probe.style.cssText =
      "position:absolute;visibility:hidden;width:0;height:0;";
    document.body.appendChild(probe);
  }
  probe.style.color = `var(${name})`;
  return getComputedStyle(probe).color;
}

/** Normalize any CSS color string to #rrggbb via canvas fillStyle. */
function normalizeToHex(colorValue: string): string {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return "#000000";
  ctx.fillStyle = "#000000";
  ctx.fillStyle = colorValue;
  return ctx.fillStyle;
}

/** Resolve a --color-* token to emoji-mart's bare "r, g, b" triplet format. */
export function cssVarRgb(name: string): string {
  const hex = normalizeToHex(resolveCssColor(name));
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

/** Resolve any --color-* token to a hex color string (#rrggbb). */
export function cssVarResolved(name: string): string {
  return normalizeToHex(resolveCssColor(name));
}
