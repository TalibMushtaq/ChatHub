import { CheckIcon } from "./icons";
import {
  AttachmentsDemo,
  PresenceDemo,
  ReactionsDemo,
  RealtimeDemo,
  ReceiptsDemo,
} from "./demos";

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="bullets">
      {items.map((item) => (
        <li key={item}>
          <CheckIcon />
          {item}
        </li>
      ))}
    </ul>
  );
}

function DemoRow({
  id,
  eyebrow,
  title,
  copy,
  bullets,
  reversed,
  stage,
}: {
  id: string;
  eyebrow: string;
  title: string;
  copy: string;
  bullets: string[];
  reversed?: boolean;
  stage: React.ReactNode;
}) {
  return (
    <div className={`demo-row ${reversed ? "rev" : ""}`} data-od-id={id}>
      <div className="demo-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{copy}</p>
        <Bullets items={bullets} />
      </div>
      {stage}
    </div>
  );
}

export function FeaturesSection() {
  return (
    <div className="features-wrap">
      <section className="features" id="features" data-od-id="features">
        <div className="container">
          <DemoRow
            id="demo-realtime-copy"
            eyebrow="Real-time"
            title="Messages land the moment they're sent."
            copy="Typing indicators that feel human, order that's always preserved, and delivery that never keeps you guessing."
            bullets={[
              "Typing indicators that feel human",
              "Conversation order, always preserved",
            ]}
            stage={<RealtimeDemo />}
          />

          <DemoRow
            id="demo-reactions-copy"
            eyebrow="Reactions"
            title="Say it without typing a word."
            copy="One tap on a message and the feeling lands. Reactions pop in with the conversation — no separate screen, no ceremony."
            bullets={[
              "One-tap, right on the message",
              "Lives inside the thread, never a side quest",
            ]}
            reversed
            stage={<ReactionsDemo />}
          />

          <DemoRow
            id="demo-presence-copy"
            eyebrow="Presence"
            title="Know when they're really around."
            copy={
              'Honest presence — online, away, busy, or off. No creepy "last seen", just a quiet green dot that means what it says.'
            }
            bullets={[
              "Clear states, no surveillance energy",
              "Animated transitions, never jittery",
            ]}
            stage={<PresenceDemo />}
          />

          <DemoRow
            id="demo-attachments-copy"
            eyebrow="Attachments"
            title="Photos and files, dropped right in line."
            copy="Attach from the composer and watch the upload land in the thread with real progress — then keep chatting without leaving the conversation."
            bullets={[
              "Visible upload progress",
              "Media lands inline, in order",
            ]}
            reversed
            stage={<AttachmentsDemo />}
          />

          <DemoRow
            id="demo-receipts-copy"
            eyebrow="Read receipts"
            title="Sent · Delivered · Read."
            copy={
              'Every message tells you where it is. Ticks that fill in as your words make it there, and a quiet "Seen" when they do.'
            }
            bullets={[
              "Clear delivery status on every message",
              "Quiet, optional, easy to turn off",
            ]}
            stage={<ReceiptsDemo />}
          />
        </div>
      </section>
    </div>
  );
}
