import Link from "next/link";
import { Mascot } from "./Mascot";

export function LandingFooter() {
  const links = [
    { href: "#positioning", label: "Why ChatHubby" },
    { href: "#features", label: "Features" },
    { href: "#personality", label: "Personality" },
  ];

  return (
    <footer className="footer" data-od-id="footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <Link className="logo" href="#top" aria-label="ChatHubby home">
            <Mascot expr="smile" />
            <span className="logo-text">
              <span>Chat</span>
              <span className="accent">Hubby</span>
            </span>
          </Link>
          <p className="tag">A private, real-time, personal place to chat.</p>
        </div>
        <nav className="footer-links" aria-label="Footer">
          {links.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
          <Link href="/auth">Get the app</Link>
        </nav>
        <p className="footer-copy">
          © {new Date().getFullYear()} ChatHubby · Made for real conversations.
        </p>
      </div>
    </footer>
  );
}
