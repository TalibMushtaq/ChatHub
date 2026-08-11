import { Mascot } from "./Mascot";

export function PersonalitySection() {
  return (
    <section className="personality" id="personality" data-od-id="personality">
      <div className="container">
        <div className="head">
          <p className="eyebrow">The companion</p>
          <h2>A little personality, all the way down.</h2>
          <p className="lead">
            ChatHubby comes with a small green companion. He&apos;s there in
            empty states, loading moments, and the quiet gaps between messages —
            never in the way, always in the brand.
          </p>
        </div>
        <div className="personality-grid">
          <div className="mascot-card" data-od-id="mascot-idle">
            <Mascot expr="smile" />
            <h3>Along for the ride</h3>
            <p>
              He hangs out in empty states and quiet corners, keeping you
              company until someone shows up.
            </p>
          </div>
          <div className="mascot-card" data-od-id="mascot-typing">
            <Mascot expr="typing" />
            <h3>Typing with you</h3>
            <p>
              When the dots are waiting, he&apos;s right there waiting with them
              — same three beats, same hope.
            </p>
          </div>
          <div className="mascot-card" data-od-id="mascot-celebrate">
            <Mascot expr="celebrate" />
            <h3>Happy you replied</h3>
            <p>
              Message seen, reply received. Small wins deserve a little cheer.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
