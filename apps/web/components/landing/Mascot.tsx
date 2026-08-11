// The green ChatHubby companion. Rendered as inline SVG so it can be reused
// anywhere on the landing page with a chosen expression (face).
const EYE = "oklch(0.23 0.02 155)";

const FACES: Record<"smile" | "typing" | "celebrate", string> = {
  smile: `<circle cx="47" cy="51" r="4" fill="${EYE}"/><circle cx="73" cy="51" r="4" fill="${EYE}"/><path d="M51 64c4 4.4 14 4.4 18 0" stroke="${EYE}" stroke-width="3.6" stroke-linecap="round" fill="none"/><ellipse cx="40" cy="60" rx="4.4" ry="3" fill="oklch(1 0 0 / 0.32)"/><ellipse cx="80" cy="60" rx="4.4" ry="3" fill="oklch(1 0 0 / 0.32)"/>`,
  typing: `<path d="M43 50c2.4 3.2 5.6 3.2 8 0" stroke="${EYE}" stroke-width="3.6" stroke-linecap="round" fill="none"/><path d="M69 50c2.4 3.2 5.6 3.2 8 0" stroke="${EYE}" stroke-width="3.6" stroke-linecap="round" fill="none"/><path d="M53 63c3 3 11 3 14 0" stroke="${EYE}" stroke-width="3.6" stroke-linecap="round" fill="none"/><circle cx="96" cy="52" r="3.4" fill="${EYE}"/><circle cx="96" cy="62" r="3.4" fill="${EYE}"/><circle cx="96" cy="72" r="3.4" fill="${EYE}"/>`,
  celebrate: `<path d="M43 50c2.4 3.2 5.6 3.2 8 0" stroke="${EYE}" stroke-width="3.6" stroke-linecap="round" fill="none"/><path d="M69 50c2.4 3.2 5.6 3.2 8 0" stroke="${EYE}" stroke-width="3.6" stroke-linecap="round" fill="none"/><path d="M50 60c3 7 17 7 20 0-3 8-17 8-20 0Z" fill="${EYE}"/><path d="M24 26l2.1 4.7 4.7 2.1-4.7 2.1-2.1 4.7-2.1-4.7-4.7-2.1 4.7-2.1z" fill="oklch(0.85 0.18 128)"/><path d="M96 22l1.7 3.8 3.8 1.7-3.8 1.7-1.7 3.8-1.7-3.8-3.8-1.7 3.8-1.7z" fill="oklch(0.85 0.18 128)"/>`,
};

export type MascotExpr = keyof typeof FACES;

export function Mascot({
  expr = "smile",
  className,
}: {
  expr?: MascotExpr;
  className?: string;
}) {
  return (
    <svg
      className={`mascot ${className ?? ""}`}
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="60" cy="106" rx="27" ry="5.5" fill="oklch(0 0 0 / 0.13)" />
      <path
        d="M60 12c-26 0-45 17.5-45 40 0 12.5 6.7 23 17.5 29.5L24 95l16.5-7.2C43 88.4 46 89 49.2 89.3 53 89.8 56.5 90 60 90c26 0 45-17.5 45-38S86 12 60 12Z"
        fill="url(#mGrad)"
      />
      <ellipse
        cx="42"
        cy="39"
        rx="9"
        ry="4.5"
        fill="oklch(1 0 0 / 0.3)"
        transform="rotate(-16 42 39)"
      />
      <g dangerouslySetInnerHTML={{ __html: FACES[expr] }} />
    </svg>
  );
}

/** One shared gradient definition the mascots reference via `url(#mGrad)`. */
export function MascotDefs() {
  return (
    <svg
      width="0"
      height="0"
      style={{ position: "absolute" }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="mGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.82 0.14 152)" />
          <stop offset="1" stopColor="oklch(0.65 0.17 152)" />
        </linearGradient>
      </defs>
    </svg>
  );
}
