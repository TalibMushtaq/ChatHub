import { HeartIcon, LockIcon, ZapIcon } from "./icons";

export function PositioningSection() {
  return (
    <section className="positioning" id="positioning" data-od-id="positioning">
      <div className="container">
        <div className="head">
          <p className="eyebrow">The idea</p>
          <h2>Built around the conversations that matter.</h2>
          <p className="lead">
            No newsfeed, no noise, no pressure to perform. Just the people you
            choose, talking the way people actually talk.
          </p>
        </div>
        <div className="positioning-grid">
          <div className="value-card" data-od-id="value-card-private">
            <div className="v-icon" aria-hidden="true">
              <LockIcon />
            </div>
            <h3>Private</h3>
            <p>
              Your conversations live in your space — nothing noisy, nothing
              public.
            </p>
          </div>
          <div className="value-card" data-od-id="value-card-realtime">
            <div className="v-icon" aria-hidden="true">
              <ZapIcon />
            </div>
            <h3>Real-time</h3>
            <p>
              Typing indicators, live presence, and messages that land the
              second they&apos;re sent.
            </p>
          </div>
          <div className="value-card" data-od-id="value-card-personal">
            <div className="v-icon" aria-hidden="true">
              <HeartIcon />
            </div>
            <h3>Personal</h3>
            <p>
              Quiet corners for real talk, with a little green personality
              sprinkled in.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
