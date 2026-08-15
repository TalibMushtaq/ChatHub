// Theming helpers for the emoji picker, resolving ChatHubby's design tokens
// through the browser's own color resolution pipeline.
//
// getComputedStyle(el).getPropertyValue('--color-…') does NOT resolve nested
// references (var(), color-mix, light-dark, etc.) — the browser returns the
// raw specified string for custom properties.  Instead we assign the token to
// a real property (color) on a throwaway element and read the computed value
// back, which is always fully resolved to rgb()/rgba().

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

/** Resolve a --color-* token to emoji-mart's bare "r, g, b" triplet format. */
export function cssVarRgb(name: string): string {
  const resolved = resolveCssColor(name);
  // getComputedStyle returns "rgb(r, g, b)" or "rgba(r, g, b, a)"
  const m = resolved.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return "0, 0, 0";
  return `${m[1]}, ${m[2]}, ${m[3]}`;
}

/** Resolve any --color-* token to a normal CSS color value string. */
export function cssVarResolved(name: string): string {
  return resolveCssColor(name);
}
