"use client";

// Phase 4 §8.3 member-management modals: MemberActionModal (kick/ban with
// reason + confirm), BanListModal (review/lift bans), NicknameModal (set/clear
// a per-room nickname). All actions delegate to the shell context which talks
// to the backend; the server enforces permissions.
import { useState, type FormEvent } from "react";
import { useShell } from "../state";
import { displayName } from "../helpers";
import { AvatarLink, NameLink } from "../UserLinks";
import { TrashIcon, UserIcon, LogoutIcon } from "../icons";
import {
  btn,
  btnPrimary,
  btnGhost,
  btnDanger,
  btnSm,
  btnBlock,
  fieldLabel,
  fieldInput,
  rowItem,
  rowGrow,
  rowT1,
  rowT2,
} from "../styles";
import type { RoomBan, RoomMember } from "../types";

// ---------------------------------------------------------------------------
// Member action (kick / ban) with confirmation + optional reason
// ---------------------------------------------------------------------------

export function MemberActionModal({
  roomId,
  member,
  action,
}: {
  roomId: string;
  member: RoomMember;
  action: "kick" | "ban";
}) {
  const { clearModals, kickMember, banMember, toast } = useShell();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const name =
    member.nickname || member.user.displayName || member.user.username;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (action === "kick") {
        await kickMember(roomId, member.user.id);
        toast(`${name} was removed from the room`, "success");
      } else {
        await banMember(roomId, member.user.id, reason.trim() || undefined);
        toast(`${name} was banned`, "success");
      }
      clearModals();
    } catch {
      // Actions toast their own errors; keep the modal open to retry.
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)}>
      <p className="role-note mt-1.5 mb-0.5 text-[12.5px] text-muted">
        {action === "kick"
          ? `Remove ${name} from this room? They can rejoin via an invite or join link.`
          : `Ban ${name} from this room? They won&apos;t be able to rejoin until the ban is lifted.`}
      </p>
      {action === "ban" && (
        <div className="mfield mb-3.5 mt-3">
          <label htmlFor="member-action-reason" className={fieldLabel}>
            Reason (optional)
          </label>
          <input
            id="member-action-reason"
            className={fieldInput}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Spam, harassment…"
            maxLength={200}
          />
        </div>
      )}
      <div className="mactions mt-4 grid gap-2.5">
        <button
          type="button"
          className={`${btnGhost} ${btnBlock}`}
          onClick={clearModals}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={`${btnBlock} ${action === "ban" ? btnDanger : btnPrimary}`}
          disabled={busy}
        >
          {action === "ban" ? (
            <TrashIcon className="h-[17px] w-[17px]" />
          ) : (
            <LogoutIcon className="h-[17px] w-[17px]" />
          )}
          {busy ? "Working…" : action === "kick" ? "Kick" : "Ban"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Ban list (review + lift bans)
// ---------------------------------------------------------------------------

export function BanListModal({ roomId }: { roomId: string }) {
  const { roomBans, refreshRoomBans, unbanMember, toast } = useShell();
  const [busyId, setBusyId] = useState<string | null>(null);
  const bans: RoomBan[] = roomBans[roomId] ?? [];

  async function lift(ban: RoomBan) {
    setBusyId(ban.userId);
    try {
      await unbanMember(roomId, ban.userId);
      toast(`${displayName(ban.user)} unbanned`, "success");
    } catch {
      // unbanMember toasts its own error
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="role-note mt-1.5 mb-0.5 text-[12.5px] text-muted">
          Banned users can&apos;t rejoin until you lift the ban.
        </p>
        <button
          className={`${btnGhost} ${btnSm} flex-none`}
          onClick={() => void refreshRoomBans(roomId)}
        >
          Refresh
        </button>
      </div>
      {bans.length === 0 ? (
        <p className="role-note mt-1.5 mb-0.5 text-[12.5px] text-muted">
          No one is banned from this room.
        </p>
      ) : (
        bans.map((b) => (
          <div key={b.id} className={rowItem}>
            <AvatarLink
              userId={b.user.id}
              name={displayName(b.user)}
              avatar={b.user.avatar}
              size={38}
            />
            <div className={rowGrow}>
              <div className={rowT1}>
                <NameLink userId={b.user.id} name={displayName(b.user)} />
              </div>
              <div className={rowT2}>
                @{b.user.username}
                {b.reason ? ` · ${b.reason}` : ""}
              </div>
            </div>
            <button
              className={`${btnPrimary} ${btnSm} flex-none`}
              disabled={busyId === b.userId}
              onClick={() => void lift(b)}
            >
              <UserIcon className="h-[15px] w-[15px]" /> Unban
            </button>
          </div>
        ))
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Nickname (set/clear a per-room display name)
// ---------------------------------------------------------------------------

export function NicknameModal({
  roomId,
  userId,
  current,
}: {
  roomId: string;
  userId: string;
  current?: string | null;
}) {
  const { clearModals, setMemberNickname } = useShell();
  const [nickname, setNickname] = useState(current ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const value = nickname.trim() || null;
      await setMemberNickname(roomId, userId, value);
      clearModals();
    } catch {
      // setMemberNickname toasts its own error
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)}>
      <p className="role-note mt-1.5 mb-0.5 text-[12.5px] text-muted">
        This nickname shows in this room instead of your global display name.
      </p>
      <div className="mfield mb-3.5 mt-3">
        <label htmlFor="nickname-input" className={fieldLabel}>
          Nickname
        </label>
        <input
          id="nickname-input"
          className={fieldInput}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Leave blank to clear"
          maxLength={32}
          autoFocus
        />
      </div>
      <div className="mactions mt-4 grid gap-2.5">
        <button
          type="button"
          className={`${btnGhost} ${btnBlock}`}
          onClick={clearModals}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={`${btn} ${btnPrimary} ${btnBlock}`}
          disabled={busy}
        >
          {busy ? "Saving…" : "Save nickname"}
        </button>
      </div>
    </form>
  );
}
