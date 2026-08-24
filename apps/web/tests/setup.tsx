import "@testing-library/jest-dom/vitest";
import { vi, afterEach } from "vitest";
import { createElement } from "react";
import { cleanup } from "@testing-library/react";

// Auto-cleanup after every test so DOM doesn't accumulate across tests.
if (typeof window !== "undefined") {
  afterEach(() => {
    cleanup();
  });
}

// Mock window.matchMedia for jsdom (used by MessageComposer for mobile detection)
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// Mock next/navigation hooks used by components
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  })),
  usePathname: vi.fn(() => "/"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useParams: vi.fn(() => ({})),
}));

// Mock next/link as a plain anchor element
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children?: React.ReactNode;
    href?: string;
    [key: string]: unknown;
  }) => createElement("a", { href, ...props }, children),
}));

// Suppress React act() warnings in tests — these are expected when testing
// state updates triggered by async operations (socket events, API calls).
const originalError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].includes("act(")) return;
  originalError(...args);
};
