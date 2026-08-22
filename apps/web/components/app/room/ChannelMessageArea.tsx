"use client";

// A channel's timeline + composer. Owns the local pagination state (cursor and
// "has more" are tracked per-channel inside AppShell; this component just
// drives the fetch on scroll-to-top) and the in-place edit box. Messages and
// read receipts come from the shared shell state keyed by the channel timeline.
import { useState } from "react";
import { useShell, channelKey } from "../state";
import { getErrorMessage } from "../api";
import type { Channel, Message } from "../types";
import { MessageList } from "../messages/MessageList";
import { MessageComposer } from "../messages/MessageComposer";

export function ChannelMessageArea({ channel }: { channel: Channel }) {
  const {
    active,
    msgs,
    readReceipts,
    user,
    openModal,
    sendMessage,
    sendVoiceMessage,
    editMessage,
    deleteMessage,
    removeLocalMessage,
    loadOlderMessages,
    toast,
  } = useShell();

  const [editing, setEditing] = useState<{
    id: string;
    content: string;
  } | null>(null);
  const [editText, setEditText] = useState("");
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const roomId = channel.roomId;
  const channelId = channel.id;
  const key = channelKey(roomId, channelId);
  const list = msgs[key] ?? [];
  // Room read receipts are tracked at room granularity (the server marks the
  // whole room read), so the same cursor set feeds every channel timeline.
  const receipts = readReceipts[`room:${roomId}`] ?? [];

  async function loadOlder() {
    if (loadingOlder) return;
    setLoadingOlder(true);
    try {
      const res = await loadOlderMessages(roomId, channelId);
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

  const activeNow =
    active && active.kind === "room" && active.channelId === channelId
      ? active
      : null;

  return (
    <>
      <MessageList
        messages={list}
        receipts={receipts}
        mine={user.id}
        isRoom
        onEdit={(m) => {
          setEditing({ id: m.id, content: m.content ?? "" });
          setEditText(m.content ?? "");
        }}
        onDelete={askDelete}
        onDismissFailed={(id) => removeLocalMessage(id)}
        onLoadOlder={loadOlder}
        hasMore={hasMore}
        loadingOlder={loadingOlder}
        empty={
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-2xl">
              #
            </div>
            <div>
              <p className="font-extrabold text-fg">
                Welcome to #{channel.name}
              </p>
              <p className="mt-0.5 text-[13px] text-muted">
                This is the very beginning of this channel.
              </p>
            </div>
          </div>
        }
      />
      {activeNow && (
        <MessageComposer
          active={activeNow}
          placeholder={`Message #${channel.name}…`}
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
      )}
    </>
  );
}
