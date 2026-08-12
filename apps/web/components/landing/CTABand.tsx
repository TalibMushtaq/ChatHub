import Link from "next/link";
import { Mascot } from "./Mascot";

export function CTABand() {
  return (
    <section className="cta-band" id="download" data-od-id="cta-band">
      <div className="container">
        <div className="cta-card">
          <div>
            <p className="eyebrow">Ready when you are</p>
            <h2>Your space to talk — ready when you are.</h2>
            <p>
              Create your free account and start chatting in under a minute — no
              cards, no noise.
            </p>
            <div className="cta-actions">
              <Link
                className="btn btn-primary"
                id="ctaBtn"
                href="/auth?mode=signup"
                data-od-id="cta-primary"
              >
                Start a conversation
              </Link>
              <Link
                className="btn btn-ghost"
                href="/auth?mode=login"
                data-od-id="cta-secondary"
              >
                Log in
              </Link>
            </div>
          </div>
          <Mascot expr="celebrate" />
        </div>
      </div>
    </section>
  );
}
