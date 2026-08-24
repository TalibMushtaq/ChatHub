// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

vi.mock("../../../app/lib/socket", () => ({
  socket: { emit: vi.fn() },
}));

vi.mock("../components/app/EmojiPicker", () => ({
  default: ({ onSelect }: { onSelect: (e: string) => void }) =>
    React.createElement(
      "div",
      { "data-testid": "emoji-picker" },
      React.createElement(
        "button",
        { onClick: () => onSelect("\ud83d\ude0a") },
        "pick",
      ),
    ),
}));

vi.mock("../insertEmojiAtCursor", () => ({
  insertEmojiAtCursor: vi.fn(),
}));

vi.mock("../VoiceRecorder", () => {
  const Comp = React.forwardRef((_props: unknown, ref: React.Ref<unknown>) => {
    React.useImperativeHandle(ref, () => ({ stop: vi.fn() }));
    return React.createElement("div", { "data-testid": "voice-recorder" });
  });
  Comp.displayName = "VoiceRecorder";
  return { __esModule: true, default: Comp };
});

vi.mock("../helpers", () => ({
  fmtBytes: (n: number) => `${n} B`,
}));

import { MessageComposer } from "../components/app/messages/MessageComposer";
import type { ActiveConv } from "../components/app/state";

const active: ActiveConv = { kind: "dm", id: "dm-1" };

function renderComposer(
  overrides: Partial<React.ComponentProps<typeof MessageComposer>> = {},
) {
  const defaults = {
    active,
    placeholder: "Type a message",
    typingEnabled: true,
    onSend: vi.fn().mockResolvedValue(undefined),
    onSendVoice: vi.fn().mockResolvedValue(undefined),
    editing: null,
    editText: "",
    setEditText: vi.fn(),
    onCancelEdit: vi.fn(),
    onCommitEdit: vi.fn().mockResolvedValue(undefined),
  };
  return render(
    React.createElement(MessageComposer, { ...defaults, ...overrides }),
  );
}

describe("MessageComposer", () => {
  it("renders textarea input", () => {
    renderComposer();
    expect(screen.getByPlaceholderText("Type a message")).toBeInTheDocument();
  });

  it("sends message on Enter (without shift)", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    renderComposer({ onSend });
    const textarea = screen.getByPlaceholderText("Type a message");
    const user = userEvent.setup();
    await user.type(textarea, "hello{Enter}");
    expect(onSend).toHaveBeenCalledWith("hello", []);
  });

  it("inserts newline on Shift+Enter", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    renderComposer({ onSend });
    const textarea = screen.getByPlaceholderText("Type a message");
    const user = userEvent.setup();
    await user.type(textarea, "line1{Shift>}{Enter}{/Shift}line2");
    expect(onSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("line1\nline2");
  });

  it("clears input on successful send", async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    renderComposer({ onSend });
    const textarea = screen.getByPlaceholderText("Type a message");
    const user = userEvent.setup();
    await user.type(textarea, "hello{Enter}");
    expect(textarea).toHaveValue("");
  });

  it("preserves input on failed send", async () => {
    const onSend = vi.fn().mockRejectedValue(new Error("network"));
    renderComposer({ onSend });
    const textarea = screen.getByPlaceholderText("Type a message");
    const user = userEvent.setup();
    await user.type(textarea, "hello{Enter}");
    expect(textarea).toHaveValue("hello");
  });

  it("send button is disabled when input is empty", () => {
    renderComposer();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("emoji picker opens and closes on toggle", async () => {
    renderComposer();
    const user = userEvent.setup();
    const btn = screen.getByRole("button", { name: "Add emoji" });
    await user.click(btn);
    expect(screen.getByTestId("emoji-picker")).toBeInTheDocument();
    await user.click(btn);
    expect(screen.queryByTestId("emoji-picker")).not.toBeInTheDocument();
  });

  it("edit mode renders with pre-filled content", () => {
    renderComposer({
      editing: { id: "msg-1", content: "original" },
      editText: "edited text",
      setEditText: vi.fn(),
    });
    expect(
      screen.getByPlaceholderText("Edit message\u2026"),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("edited text")).toBeInTheDocument();
  });
});
