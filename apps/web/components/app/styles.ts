// Shared Tailwind class strings that replaced the app.css design-system
// utilities (`.btn`, `.icon-btn`, …). Kept in one place so every panel uses
// identical utilities instead of hand-rolling slightly different variants.

export const btn =
  "inline-flex items-center justify-center gap-2 min-h-[42px] px-[18px] py-2.5 rounded-[99px] font-extrabold text-sm tracking-[0.02em] cursor-pointer transition-[background-color,color,border-color,opacity] duration-150 ease-app";

export const btnPrimary = `${btn} bg-accent-btn text-accent-on hover:bg-accent-hover disabled:opacity-55 disabled:cursor-default`;
export const btnGhost = `${btn} bg-transparent text-fg border-[1.5px] border-border-strong hover:border-accent-solid hover:text-accent-solid`;
export const btnDanger = `${btn} bg-danger-soft text-danger hover:bg-[color-mix(in_oklab,var(--color-danger)_20%,transparent)]`;
export const btnSm = "min-h-8 px-[13px] py-[5px] text-[12.5px]";
export const btnBlock = "w-full";

export const iconBtn =
  "inline-flex items-center justify-center flex-none rounded-full text-muted transition-colors duration-150 ease-app hover:bg-surface-2 hover:text-fg";

export const searchBox =
  "flex items-center gap-2 rounded-xl border-[1.5px] border-border bg-bg px-3 py-[9px] transition-[border-color,box-shadow] duration-150 ease-app focus-within:border-accent-solid focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-accent)_45%,transparent)]";
export const searchInput =
  "min-w-0 flex-1 border-0 bg-transparent text-[14.5px] focus:outline-none";

export const fieldLabel = "mb-1.5 block text-[13px] font-bold";
export const fieldInput =
  "w-full rounded-xl border-[1.5px] border-border bg-bg px-[13px] py-[11px] text-[14.5px] transition-[border-color,box-shadow] duration-150 ease-app focus:border-accent-solid focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-accent)_45%,transparent)] focus:outline-none";

export const rowItem =
  "flex items-center gap-3 border-b border-border px-1 py-2.5 last:border-b-0";
export const rowGrow = "min-w-0 flex-1";
export const rowT1 = "truncate text-[14.5px] font-extrabold";
export const rowT2 = "truncate text-[12.5px] text-muted";

export const chip =
  "inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] font-extrabold tracking-[0.02em]";
export const chipOwner = `${chip} bg-accent-wash text-accent-solid`;
export const chipAdmin = `${chip} bg-[color-mix(in_oklab,oklch(0.7_0.15_265)_14%,transparent)] text-[oklch(0.55_0.14_265)]`;
export const chipMember = `${chip} bg-fg-wash text-muted`;
export const chipPending = `${chip} bg-[color-mix(in_oklab,oklch(0.7_0.12_75)_16%,transparent)] text-[oklch(0.62_0.11_75)]`;
export const chipOk = `${chip} bg-success-wash text-success`;
export const chipDead = `${chip} bg-danger-wash text-danger`;
