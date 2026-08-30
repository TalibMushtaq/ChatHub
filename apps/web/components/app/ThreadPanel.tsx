"use client";

// Thread column for DIRECT MESSAGES: header, message timeline, and composer for
// the active conversation. Rooms render a full RoomShell instead (Phase 2), so
// this panel only ever receives `active.kind === "dm"`.
import { useState } from "react";
import { useShell, convKey } from "./state";
import { getErrorMessage } from "./api";
import { displayName } from "./helpers";
import type { Message } from "./types";
import AppAvatar from "./AppAvatar";
import { AvatarLink, NameLink } from "./UserLinks";
import { STATUS_LABELS } from "./statusTones";
import { BackIcon } from "./icons";
import { iconBtn } from "./styles";
import { useCallCtx } from "./CallProvider";
import { useCallStore } from "./callStore";
import DmCallView from "./room/DmCallView";
import { Phone, Video } from "lucide-react";
import { MessageList } from "./messages/MessageList";
import { MessageComposer } from "./messages/MessageComposer";

export default function ThreadPanel() {
  const {
    active,
    msgs,
    readReceipts,
    typing,
    presence,
    user,
    navigateBack,
    openModal,
    sendMessage,
    sendVoiceMessage,
    editMessage,
    deleteMessage,
    removeLocalMessage,
    loadOlderDmMessages,
    toast,
  } = useShell();
  const { initiateDmCall } = useCallCtx();

  // Show the active call view (replacing messages) when the viewed DM has a
  // connected call; a connected DM call used to have no in-thread UI at all.
  const dmCallStatus = useCallStore((s) => s.dmCallStatus);
  const activeDirectChatId = useCallStore((s) => s.activeDirectChatId);
  const dmCallType = useCallStore((s) => s.dmCallType);
  const inActiveDmCall =
    active?.kind === "dm" &&
    dmCallStatus === "ACTIVE" &&
    activeDirectChatId === active.id;

  const [editing, setEditing] = useState<{
    id: string;
    content: string;
  } | null>(null);
  const [editText, setEditText] = useState("");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  if (!active) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-[30px] text-center text-[14.5px] text-muted">
        <div className="mb-4">
          <AppAvatar
            name="ChatHubby"
            src="/chathubby-v2.webp"
            size={96}
            square
          />
        </div>
        <b className="mb-1 block text-[17px] text-fg">ChatHubby</b>
        <p>Select a conversation to start chatting.</p>
      </div>
    );
  }

  const other =
    active.kind === "dm" && active.otherUser
      ? displayName(active.otherUser)
      : active.kind === "dm"
        ? "Unknown"
        : (active.name ?? "Room");

  const key = convKey(active.kind, active.id);
  const list = msgs[key] ?? [];
  const typers = typing[key] ?? [];
  const receipts = readReceipts[key] ?? [];
  const otherPresence = presence[active.otherUser?.id ?? ""] ?? null;

  const sub = otherPresence?.status
    ? STATUS_LABELS[otherPresence.status]
    : otherPresence?.presence === "online"
      ? "online"
      : otherPresence?.presence === "idle"
        ? "idle"
        : `@${active.otherUser?.username ?? ""}`;

  async function loadOlder() {
    if (loadingOlder || !active || active.kind !== "dm") return;
    setLoadingOlder(true);
    try {
      const res = await loadOlderDmMessages(active.id);
      setHasMore(res.hasMore);
    } finally {
      setLoadingOlder(false);
    }
  }

  async function submitEdit() {
    if (!editing || !editText.trim()) return;
    try {
      await editMessage(editing.id, editText.trim());
      setEditing(null);
      setEditText("");
    } catch (err) {
      toast(getErrorMessage(err, "Failed to edit"), "error");
    }
  }

  function askDelete(m: Message) {
    openModal("confirm", {
      title: "Delete message",
      text: "This will delete the message for everyone. This can't be undone.",
      danger: true,
      onYes: () =>
        deleteMessage(m.id).catch((err: unknown) =>
          toast(getErrorMessage(err, "Failed to delete"), "error"),
        ),
    });
  }

  return (
    <>
      <div className="thread-head flex items-center gap-3 border-b border-border bg-surface px-[14px] py-[11px]">
        <button
          className={`${iconBtn} back h-10 w-10 hidden max-md:inline-flex`}
          onClick={navigateBack}
          aria-label="Back"
        >
          <BackIcon />
        </button>
        {active.kind === "dm" && active.otherUser ? (
          <AvatarLink
            userId={active.otherUser.id}
            name={active.otherUser.displayName ?? active.otherUser.username}
            avatar={active.otherUser.avatar}
            size={40}
            presence={otherPresence}
          />
        ) : (
          <AppAvatar name={other} src={active.avatar} size={40} square />
        )}
        <div className="titles min-w-0 flex-1">
          <div className="name truncate text-[15px] font-extrabold">
            {active.kind === "dm" && active.otherUser ? (
              <NameLink userId={active.otherUser.id} name={other} />
            ) : (
              other
            )}
          </div>
          <div className="sub text-[12.5px] text-muted">
            {typers.length > 0 ? (
              <span className="text-accent-solid">
                {typers.map((t) => t.username).join(", ")} typing…
              </span>
            ) : (
              sub
            )}
          </div>
        </div>

        {/* DM call buttons — only visible in DM threads, hidden while a call
            is already active to avoid re-initiating over a connected call. */}
        {active.kind === "dm" && !inActiveDmCall && (
          <div className="flex items-center gap-1">
            <button
              onClick={async () => {
                try {
                  await initiateDmCall(active.id, "VOICE");
                } catch (err) {
                  toast(getErrorMessage(err, "Couldn't start call"), "error");
                }
              }}
              className={`${iconBtn} h-9 w-9 rounded-full hover:bg-success-wash hover:text-success`}
              title="Voice call"
              aria-label="Start voice call"
            >
              <Phone size={16} />
            </button>
            <button
              onClick={async () => {
                try {
                  await initiateDmCall(active.id, "VIDEO");
                } catch (err) {
                  toast(getErrorMessage(err, "Couldn't start call"), "error");
                }
              }}
              className={`${iconBtn} h-9 w-9 rounded-full hover:bg-success-wash hover:text-success`}
              title="Video call"
              aria-label="Start video call"
            >
              <Video size={16} />
            </button>
          </div>
        )}
      </div>

      {inActiveDmCall ? (
        <DmCallView callType={dmCallType ?? "VOICE"} partnerName={other} />
      ) : (
        <>
          <MessageList
            messages={list}
            receipts={receipts}
            mine={user.id}
            isRoom={false}
            onEdit={(m) => {
              setEditing({ id: m.id, content: m.content ?? "" });
              setEditText(m.content ?? "");
            }}
            onDelete={askDelete}
            onDismissFailed={(id) => removeLocalMessage(id)}
            onLoadOlder={loadOlder}
            hasMore={hasMore}
            loadingOlder={loadingOlder}
          />

          <MessageComposer
            active={active}
            placeholder={`Message ${other}…`}
            typingEnabled={user.showTypingStatus !== false}
            onSend={sendMessage}
            onSendVoice={sendVoiceMessage}
            editing={editing}
            editText={editText}
            setEditText={setEditText}
            onCancelEdit={() => {
              setEditing(null);
              setEditText("");
            }}
            onCommitEdit={submitEdit}
          />
        </>
      )}
    </>
  );
}
