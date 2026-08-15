// Insert an emoji (or any text) into a textarea at the current caret
// position, replacing whatever is currently selected. Returns the new value
// through `onChange` (the composer owns message state) and, on the next
// animation frame, repositions the caret immediately after the inserted text
// and restores focus — the picker never owns the message input.
// The parameter is structural rather than HTMLTextAreaElement so the behavior
// can be unit-tested without a DOM.
export function insertEmojiAtCursor(
  textarea: Pick<
    HTMLTextAreaElement,
    "selectionStart" | "selectionEnd" | "setSelectionRange" | "focus"
  >,
  emoji: string,
  currentValue: string,
  onChange: (value: string) => void,
) {
  const start = textarea.selectionStart ?? currentValue.length;
  const end = textarea.selectionEnd ?? currentValue.length;
  const newValue =
    currentValue.slice(0, start) + emoji + currentValue.slice(end);
  onChange(newValue);
  // Wait for React to commit the new value before moving the caret, otherwise
  // the DOM node still holds the old text and setSelectionRange clamps to it.
  requestAnimationFrame(() => {
    const caret = start + emoji.length;
    textarea.setSelectionRange(caret, caret);
    textarea.focus();
  });
}
