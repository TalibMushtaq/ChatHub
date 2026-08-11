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
              The ChatHubby prototype is live. Sign in with the demo account{" "}
              <b>avery</b> / <b>password123</b> and start chatting.
            </p>
            <div className="cta-actions">
              <Link
                className="btn btn-primary"
                id="ctaBtn"
                href="/auth"
                data-od-id="cta-primary"
              >
                Start a conversation
              </Link>
            </div>
          </div>
          <Mascot expr="celebrate" />
        </div>
      </div>
    </section>
  );
}
