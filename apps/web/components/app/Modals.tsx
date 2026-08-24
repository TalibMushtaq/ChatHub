"use client";

// Modal system: a stack of modals rendered over the shell. All modals talk to
// the real backend via ChatAPI and push to the stack for sub-flows (e.g. a
// room's info modal opening invite/join-request/link modals).
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useShell, type ModalEntry } from "./state";
import { ChatAPI, getErrorMessage } from "./api";
import { displayName, fmtList, fmtTime, avatarUrl } from "./helpers";
import type { Relationship } from "@repo/validators";
import type {
  Gender,
  Invitation,
  JoinLink,
  JoinRequest,
  RoomMember,
  UserProfile,
  UserStatus,
} from "./types";
import { profileActionSet } from "./profileActions";
import AppAvatar from "./AppAvatar";
import { AvatarLink, NameLink } from "./UserLinks";
import AvatarSelector from "./AvatarSelector";
import RoomSettingsModal from "./room/RoomSettingsModal";
import { STATUS_OPTIONS, TONE_BG } from "./statusTones";
import {
  BackIcon,
  CloseIcon,
  SearchIcon,
  CheckIcon,
  CopyIcon,
  RefreshIcon,
  SunIcon,
  MoonIcon,
  LogoutIcon,
  LinkIcon,
  UserIcon,
  MailIcon,
  TrashIcon,
} from "./icons";
import { useTheme } from "../../app/lib/useTheme";
import { useNotificationSound } from "./useNotificationSound";
import { useNotifications } from "./useNotifications";
import { CreateChannelModal } from "./room/CreateChannelModal";
import { CreateCategoryModal } from "./room/CreateCategoryModal";
import { EditChannelModal } from "./room/EditChannelModal";
import { EditCategoryModal } from "./room/EditCategoryModal";
import {
  MemberActionModal,
  BanListModal,
  NicknameModal,
} from "./room/MemberModals";
import {
  btn,
  btnPrimary,
  btnGhost,
  btnDanger,
  btnSm,
  btnBlock,
  iconBtn,
  searchBox,
  searchInput,
  fieldLabel,
  fieldInput,
  rowItem,
  rowGrow,
  rowT1,
  rowT2,
  chipOk,
  chipDead,
  chipPending,
  chipMember,
  chipOwner,
  chipAdmin,
} from "./styles";

const TITLES: Record<ModalEntry["name"], string> = {
  newDm: "New message",
  newRoom: "New room",
  roomInfo: "Room info",
  roomSettings: "Room settings",
  createChannel: "Create channel",
  createCategory: "Create category",
  editChannel: "Edit channel",
  editCategory: "Edit category",
  invite: "Invite to room",
  joinRequests: "Join requests",
  joinLinks: "Join links",
  receivedInvites: "Received invitations",
  sentInvites: "Sent invitations",
  myLinks: "My join links",
  profile: "Profile",
  status: "Status",
  privacy: "Privacy",
  notifications: "Notifications",
  recovery: "Recovery codes",
  confirm: "Confirm",
  userProfile: "Profile",
  avatarViewer: "Profile picture",
  memberAction: "Member",
  banList: "Banned users",
  nickname: "Nickname",
};

export default function Modals() {
  const { mStack, popModal } = useShell();
  // The element that opened the first modal; focus is returned to it when the
  // stack empties so keyboard users land back where they started.
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (mStack.length > 0 && !triggerRef.current) {
      triggerRef.current = document.activeElement;
    }
  }, [mStack.length]);

  // Escape closes the top-most modal. One listener here (not per frame) so the
  // handler count never grows with the stack depth.
  useEffect(() => {
    if (mStack.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        popModal();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mStack.length, popModal]);

  // Lock background scroll while any modal is open so the page behind a
  // full-screen overlay (avatar viewer) can't scroll; restored on close.
  useEffect(() => {
    const prev = document.body.style.overflow;
    if (mStack.length > 0) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mStack.length]);

  // Keep focus on the top frame through pushes AND pops (e.g. closing the
  // avatar viewer returns focus to the profile card beneath it).
  useEffect(() => {
    if (mStack.length === 0) return;
    const frames = document.querySelectorAll<HTMLElement>("[data-modal-frame]");
    frames[frames.length - 1]?.focus();
  }, [mStack.length]);

  // Return focus to whatever opened the modal once the stack is empty.
  useEffect(() => {
    if (mStack.length > 0) return;
    const trigger = triggerRef.current;
    triggerRef.current = null;
    if (trigger instanceof HTMLElement) trigger.focus();
  }, [mStack.length]);

  if (mStack.length === 0) return null;
  return (
    <>
      {mStack.map((entry, i) => (
        <ModalFrame
          key={`${entry.name}-${i}`}
          entry={entry}
          index={i}
          total={mStack.length}
        />
      ))}
    </>
  );
}

function ModalFrame({
  entry,
  index,
  total,
}: {
  entry: ModalEntry;
  index: number;
  total: number;
}) {
  const { popModal, clearModals } = useShell();
  const frameRef = useRef<HTMLDivElement | null>(null);
  const body = Body(entry);

  const isFullscreen = entry.name === "avatarViewer";

  // Keep Tab cycling within the frame so users can't focus content behind a
  // modal (especially the full-screen viewer's page underneath).
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Tab" || !frameRef.current) return;
    const focusables = frameRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // Accessible dialog label: each modal gets a unique ID for aria-labelledby.
  const titleId = `modal-title-${entry.name}`;

  // Full-screen overlay (avatar viewer): dark backdrop + centered content and
  // no card chrome. The backdrop pops only THIS modal so a profile card open
  // beneath it stays mounted and visible after the viewer closes.
  if (isFullscreen) {
    return (
      <div
        ref={frameRef}
        data-modal-frame
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="modal-root fixed inset-0 z-[80] flex items-center justify-center"
        style={{ zIndex: 80 + index }}
        onKeyDown={onKeyDown}
      >
        <div
          className="modal-back absolute inset-0 bg-[oklch(0_0_0/0.78)] animate-[fade_.2s_cubic-bezier(.2,.8,.2,1)]"
          onClick={popModal}
        />
        <h2 id={titleId} className="sr-only">
          {TITLES[entry.name]}
        </h2>
        {body}
      </div>
    );
  }

  return (
    <div
      ref={frameRef}
      data-modal-frame
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="modal-root fixed inset-0 z-[80] flex items-center justify-center"
      style={{ zIndex: 80 + index }}
      onKeyDown={onKeyDown}
    >
      {/* Backdrop: clicking outside the modal dismisses the stack. */}
      <div
        className="modal-back absolute inset-0 bg-[oklch(0_0_0/0.42)] animate-[fade_.2s_cubic-bezier(.2,.8,.2,1)]"
        onClick={clearModals}
      />
      {/* Centered dialog card: items-center above places this in the viewport center. */}
      <div className="modal relative flex max-h-[88dvh] w-[min(480px,100%)] flex-col overflow-hidden rounded-[24px] bg-surface shadow-lg animate-[rise_.24s_cubic-bezier(.2,.8,.2,1)]">
        <div className="modal-head flex items-center gap-2.5 border-b border-border px-[18px] py-[15px]">
          {total > 1 ? (
            <button
              className={`${iconBtn} h-[34px] w-[34px]`}
              onClick={popModal}
              aria-label="Back"
            >
              <BackIcon />
            </button>
          ) : (
            <span />
          )}
          <h2
            id={titleId}
            className="min-w-0 flex-1 truncate font-display text-[18px] leading-[1.15] tracking-tight"
          >
            {TITLES[entry.name]}
          </h2>
          <button
            className={`${iconBtn} h-[34px] w-[34px]`}
            onClick={clearModals}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="modal-body overflow-y-auto p-[16px_18px_22px]">
          {body}
        </div>
      </div>
    </div>
  );
}

function Body(entry: ModalEntry) {
  // Read once (unconditionally) so hook order stays stable across cases; used
  // by the nickname modal to look up a member's current nickname.
  const { roomMembers } = useShell();
  switch (entry.name) {
    case "newDm":
      return <NewDmModal />;
    case "newRoom":
      return <NewRoomModal />;
    case "createChannel": {
      // Payload is either `{ roomId, categoryId? }` or a bare roomId string
      // (kept for callers that predate the structured payload).
      const p = entry.payload as
        { roomId: string; categoryId?: string | null } | string;
      const roomId = typeof p === "string" ? p : p.roomId;
      const categoryId = typeof p === "string" ? null : (p.categoryId ?? null);
      return (
        <CreateChannelModal roomId={roomId} initialCategoryId={categoryId} />
      );
    }
    case "createCategory": {
      const roomId = String(entry.payload);
      return <CreateCategoryModal roomId={roomId} />;
    }
    case "editChannel": {
      const p = entry.payload as { roomId: string; channelId: string };
      return <EditChannelModal roomId={p.roomId} channelId={p.channelId} />;
    }
    case "editCategory": {
      const p = entry.payload as { roomId: string; categoryId: string };
      return <EditCategoryModal roomId={p.roomId} categoryId={p.categoryId} />;
    }
    case "roomInfo":
      return <RoomInfoModal />;
    case "invite":
      return <InviteModal roomId={String(entry.payload)} />;
    case "joinRequests":
      return <JoinRequestsModal roomId={String(entry.payload)} />;
    case "joinLinks":
      return <JoinLinksModal roomId={String(entry.payload)} />;
    case "receivedInvites":
      return <ReceivedInvitesModal />;
    case "sentInvites":
      return <SentInvitesModal />;
    case "myLinks":
      return <MyLinksModal />;
    case "profile":
      return <ProfileModal />;
    case "status":
      return <StatusModal />;
    case "privacy":
      return <PrivacyModal />;
    case "notifications":
      return <NotificationsModal />;
    case "roomSettings": {
      const p = entry.payload as { roomId: string };
      return <RoomSettingsModal roomId={p.roomId} />;
    }
    case "recovery":
      return <RecoveryModal />;
    case "confirm": {
      const p = entry.payload as {
        title: string;
        text: string;
        danger?: boolean;
        onYes: () => void;
      };
      return <ConfirmModal p={p} />;
    }
    case "userProfile": {
      const p = entry.payload as { userId: string };
      return <UserProfileModal userId={p.userId} />;
    }
    case "avatarViewer": {
      const p = entry.payload as {
        userId: string;
        name?: string;
        avatar?: string | null;
      };
      return <AvatarViewer name={p.name} avatar={p.avatar} />;
    }
    case "memberAction": {
      const p = entry.payload as {
        roomId: string;
        member: {
          memberId: string;
          role: string;
          nickname?: string | null;
          user: {
            id: string;
            username: string;
            displayName: string | null;
            avatar?: string | null;
          };
        };
        action: "kick" | "ban";
      };
      return (
        <MemberActionModal
          roomId={p.roomId}
          member={p.member as RoomMember}
          action={p.action}
        />
      );
    }
    case "banList": {
      const roomId = String(entry.payload);
      return <BanListModal roomId={roomId} />;
    }
    case "nickname": {
      const p = entry.payload as { roomId: string; userId: string };
      const current = (roomMembers[p.roomId] ?? []).find(
        (m) => m.user.id === p.userId,
      )?.nickname;
      return (
        <NicknameModal
          roomId={p.roomId}
          userId={p.userId}
          current={current ?? null}
        />
      );
    }
  }
}

// ---------------------------------------------------------------------------
// New DM
// ---------------------------------------------------------------------------

function NewDmModal() {
  const { openConv, clearModals, toast } = useShell();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<
    { id: string; username: string; displayName: string | null }[]
  >([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      try {
        const users = await ChatAPI.searchUsers(q.trim());
        setResults(users);
      } catch {
        setResults([]);
      }
    }, 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q]);

  async function start(u: {
    id: string;
    username: string;
    displayName: string | null;
  }) {
    setBusyId(u.id);
    try {
      const chat = await ChatAPI.startDm(u.id);
      clearModals();
      openConv({ kind: "dm", id: chat.id, otherUser: u });
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't start a chat"), "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="mfield mb-3.5">
        <label htmlFor="new-dm-search" className={fieldLabel}>
          Find someone
        </label>
        <div className={searchBox}>
          <SearchIcon className="h-[17px] w-[17px] flex-none text-muted" />
          <input
            id="new-dm-search"
            className={searchInput}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by username…"
            autoFocus
          />
        </div>
      </div>
      {q.trim() &&
        (results.length === 0 ? (
          <p className="role-note mt-1.5 mb-0.5 text-[12.5px] text-muted">
            No users found.
          </p>
        ) : (
          results.map((u) => (
            <div key={u.id} className={rowItem}>
              <AvatarLink
                userId={u.id}
                name={u.displayName ?? u.username}
                size={38}
              />
              <div className={rowGrow}>
                <div className={rowT1}>
                  <NameLink userId={u.id} name={displayName(u)} />
                </div>
                <div className={rowT2}>@{u.username}</div>
              </div>
              <button
                className={`${btnPrimary} ${btnSm}`}
                disabled={busyId === u.id}
                onClick={() => void start(u)}
              >
                Chat
              </button>
            </div>
          ))
        ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// New Room
// ---------------------------------------------------------------------------

function NewRoomModal() {
  const { openConv, clearModals, refreshLists, toast } = useShell();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarKey, setAvatarKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const room = await ChatAPI.createRoom(
        name.trim(),
        description.trim() || undefined,
        avatarKey || undefined,
      );
      clearModals();
      openConv({
        kind: "room",
        id: room.id,
        name: room.name,
        description: description.trim() || null,
        myRole: "OWNER",
      });
      void refreshLists();
    } catch (err) {
      toast(getErrorMessage(err, "Failed to create room"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mfield mb-3.5">
        <label htmlFor="new-room-name" className={fieldLabel}>
          Room name
        </label>
        <input
          id="new-room-name"
          className={fieldInput}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Friday Gaming"
          autoFocus
        />
      </div>
      <div className="mfield mb-3.5">
        <label htmlFor="new-room-desc" className={fieldLabel}>
          Description (optional)
        </label>
        <textarea
          id="new-room-desc"
          className={`${fieldInput} min-h-[70px] resize-y`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What's this room about?"
        />
      </div>
      <div className="mfield mb-3.5">
        <label htmlFor="new-room-avatar" className={fieldLabel}>
          Room avatar (optional)
        </label>
        <AvatarSelector
          source="room"
          selected={avatarKey}
          onSelect={setAvatarKey}
        />
      </div>
      <div className="mactions mt-4 grid gap-2.5">
        <button
          className={`${btnPrimary} ${btnBlock}`}
          onClick={() => void create()}
          disabled={busy || !name.trim()}
        >
          Create room
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Room info
// ---------------------------------------------------------------------------

// Helper sub-component for room avatar picker inside RoomInfoModal
function RoomAvatarSection({
  info,
  isAdmin,
}: {
  info: { roomId: string; name: string; myRole: string };
  isAdmin: boolean;
}) {
  const { toast, refreshLists } = useShell();
  const [showPicker, setShowPicker] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function saveAvatar() {
    if (!pendingKey) return;
    setSaving(true);
    try {
      await ChatAPI.updateRoomAvatar(info.roomId, pendingKey);
      await refreshLists();
      toast("Room avatar updated", "success");
      setShowPicker(false);
      setPendingKey(null);
    } catch (err) {
      toast(getErrorMessage(err, "Failed to update room avatar"), "error");
    } finally {
      setSaving(false);
    }
  }

  if (!isAdmin) return null;

  if (showPicker) {
    return (
      <div className="mt-3">
        <p className="mb-2 text-[12.5px] font-semibold text-muted">
          Choose a room avatar:
        </p>
        <AvatarSelector
          source="room"
          selected={pendingKey}
          onSelect={setPendingKey}
          contextId={info.roomId}
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            className={`${btnGhost} ${btnSm}`}
            onClick={() => {
              setShowPicker(false);
              setPendingKey(null);
            }}
          >
            Cancel
          </button>
          <button
            className={`${btnPrimary} ${btnSm}`}
            disabled={saving || !pendingKey}
            onClick={() => void saveAvatar()}
          >
            {saving ? "Saving…" : "Save avatar"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      className={`${btnGhost} ${btnBlock} mt-2`}
      onClick={() => setShowPicker(true)}
    >
      Change room avatar
    </button>
  );
}

function RoomInfoModal() {
  const { roomInfo, roomMembers, user, openModal } = useShell();
  const info = roomInfo();
  const members = info ? (roomMembers[info.roomId] ?? []) : [];
  const isAdmin = info?.myRole === "OWNER" || info?.myRole === "ADMIN";

  if (!info)
    return (
      <p className="role-note mt-1.5 mb-0.5 text-[12.5px] text-muted">
        Room not found.
      </p>
    );

  return (
    <>
      <div className={`${rowItem}`} style={{ padding: "2px 4px 14px" }}>
        <AppAvatar name={info.name} src={info.avatar} size={52} square />
        <div className={rowGrow}>
          <div className={rowT1}>
            # {info.name}{" "}
            <span className={info.myRole === "OWNER" ? chipOwner : chipAdmin}>
              {info.myRole.toLowerCase()}
            </span>
          </div>
          <div className={rowT2}>{info.description || "No description"}</div>
        </div>
      </div>

      <div className={rowItem}>
        <div className={rowGrow}>
          <div className={rowT1}>
            {members.length} member{members.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {members.map((m) => (
        <div key={m.memberId} className={rowItem}>
          <AvatarLink
            userId={m.user.id}
            name={displayName(m.user)}
            avatar={m.user.avatar}
            size={38}
          />
          <div className={rowGrow}>
            <div className={rowT1}>
              <NameLink userId={m.user.id} name={displayName(m.user)} />
              {m.user.id === user.id && (
                <span className={`${chipMember} ml-2`}>you</span>
              )}
            </div>
            <div className={rowT2}>Joined {fmtTime(m.joinedAt)}</div>
          </div>
          <span
            className={
              m.role === "OWNER"
                ? chipOwner
                : m.role === "ADMIN"
                  ? chipAdmin
                  : chipMember
            }
          >
            {m.role.toLowerCase()}
          </span>
        </div>
      ))}

      <RoomAvatarSection info={info} isAdmin={isAdmin} />

      {isAdmin && (
        <div className="mactions mt-4 grid gap-2.5">
          <button
            className={`${btnPrimary} ${btnBlock}`}
            onClick={() => openModal("invite", info.roomId)}
          >
            <UserIcon className="h-[17px] w-[17px]" /> Invite people
          </button>
          <button
            className={`${btnGhost} ${btnBlock}`}
            onClick={() => openModal("joinRequests", info.roomId)}
          >
            <MailIcon className="h-[17px] w-[17px]" /> Join requests
          </button>
          <button
            className={`${btnGhost} ${btnBlock}`}
            onClick={() => openModal("joinLinks", info.roomId)}
          >
            <LinkIcon className="h-[17px] w-[17px]" /> Join links
          </button>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Invite
// ---------------------------------------------------------------------------

function InviteModal({ roomId }: { roomId: string }) {
  const { toast, roomInfo } = useShell();
  const info = roomInfo();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<
    { id: string; username: string; displayName: string | null }[]
  >([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    debounce.current = setTimeout(async () => {
      try {
        const users = await ChatAPI.searchUsers(q.trim());
        setResults(users);
      } catch {
        setResults([]);
      }
    }, 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q]);

  async function invite(u: {
    id: string;
    username: string;
    displayName: string | null;
  }) {
    setBusyId(u.id);
    try {
      await ChatAPI.inviteToRoom(roomId, u.id);
      toast(
        `Invited ${displayName(u)} to ${info?.name ?? "the room"}`,
        "success",
      );
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't send invitation"), "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <p className="role-note mt-1.5 mb-0.5 text-[12.5px] text-muted">
        Inviting to #{info?.name ?? "room"}
      </p>
      <div className="mfield mb-3.5">
        <div className={searchBox}>
          <SearchIcon className="h-[17px] w-[17px] flex-none text-muted" />
          <input
            className={searchInput}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by username…"
            autoFocus
          />
        </div>
      </div>
      {q.trim() &&
        (results.length === 0 ? (
          <p className="role-note mt-1.5 mb-0.5 text-[12.5px] text-muted">
            No users found.
          </p>
        ) : (
          results.map((u) => (
            <div key={u.id} className={rowItem}>
              <AvatarLink
                userId={u.id}
                name={u.displayName ?? u.username}
                size={38}
              />
              <div className={rowGrow}>
                <div className={rowT1}>
                  <NameLink userId={u.id} name={displayName(u)} />
                </div>
                <div className={rowT2}>@{u.username}</div>
              </div>
              <button
                className={`${btnPrimary} ${btnSm}`}
                disabled={busyId === u.id}
                onClick={() => void invite(u)}
              >
                Invite
              </button>
            </div>
          ))
        ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Join requests
// ---------------------------------------------------------------------------

function JoinRequestsModal({ roomId }: { roomId: string }) {
  const { joinRequests, toast } = useShell();
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      setRequests(await joinRequests(roomId));
    } catch (err) {
      toast(getErrorMessage(err, "Failed to load requests"), "error");
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  async function decide(id: string, action: "APPROVED" | "REJECTED") {
    setBusyId(id);
    try {
      await ChatAPI.respondJoinRequest(roomId, id, action);
      toast(
        action === "APPROVED" ? "Request approved" : "Request rejected",
        "success",
      );
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't update request"), "error");
    } finally {
      setBusyId(null);
    }
  }

  if (requests.length === 0)
    return (
      <p className="role-note mt-1.5 mb-0.5 text-[12.5px] text-muted">
        No pending requests.
      </p>
    );
  return (
    <>
      {requests.map((r) => (
        <div key={r.id} className={rowItem}>
          <AppAvatar
            name={displayName(r.user)}
            src={r.user?.avatar}
            size={38}
          />
          <div className={rowGrow}>
            <div className={rowT1}>{displayName(r.user)}</div>
            <div className={rowT2}>@{r.user?.username}</div>
          </div>
          <button
            className={`${btn} ${btnSm} ${btnPrimary}`}
            disabled={busyId === r.id}
            onClick={() => void decide(r.id, "APPROVED")}
          >
            <CheckIcon className="h-[17px] w-[17px]" /> Approve
          </button>
          <button
            className={`${btnDanger} ${btnSm}`}
            disabled={busyId === r.id}
            onClick={() => void decide(r.id, "REJECTED")}
          >
            <CloseIcon className="h-[17px] w-[17px]" /> Reject
          </button>
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Join links
// ---------------------------------------------------------------------------

function JoinLinksModal({ roomId }: { roomId: string }) {
  const { createLink, joinLinks, toast } = useShell();
  const [links, setLinks] = useState<JoinLink[]>([]);
  const [freshToken, setFreshToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const all = await joinLinks();
      setLinks(all.filter((l) => l.room?.id === roomId));
    } catch (err) {
      toast(getErrorMessage(err, "Failed to load links"), "error");
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  async function makeLink() {
    setBusy(true);
    try {
      const link = await createLink(roomId);
      setFreshToken(link.token);
      await load();
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't create link"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(id: string) {
    try {
      await ChatAPI.deactivateJoinLink(roomId, id);
      toast("Link deactivated", "success");
      await load();
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't deactivate link"), "error");
    }
  }

  return (
    <>
      <p className="role-note mt-1.5 mb-0.5 text-[12.5px] text-muted">
        Create a link anyone can use to join <b>#{roomId.slice(0, 8)}</b>.
      </p>
      <button
        className={`${btnPrimary} ${btnBlock}`}
        onClick={() => void makeLink()}
        disabled={busy}
      >
        <LinkIcon className="h-[17px] w-[17px]" />{" "}
        {busy ? "Creating…" : "Create join link"}
      </button>

      {freshToken && (
        <div className="mlink my-2.5 flex items-center gap-2.5 rounded-xl border border-border bg-bg p-[10px_12px]">
          <span className="token min-w-0 flex-1 truncate font-mono text-[13px] font-bold text-accent-solid select-all">
            {freshToken}
          </span>
          <button
            className={`${btnGhost} ${btnSm}`}
            onClick={() => {
              void navigator.clipboard
                ?.writeText(freshToken)
                .then(() => toast("Copied to clipboard", "success"));
            }}
          >
            Copy
          </button>
        </div>
      )}

      {links.length > 0 && (
        <>
          <p className="linkrow-pill mt-2 text-[12.5px] font-semibold text-muted">
            Active links for this room
          </p>
          {links.map((l) => (
            <div key={l.id} className={rowItem}>
              <div className={rowGrow}>
                <div className={rowT1}>
                  {(l.isActive ?? l.active !== false) ? "Active" : "Inactive"}{" "}
                  <span
                    className={
                      (l.isActive ?? l.active !== false) ? chipOk : chipDead
                    }
                  >
                    {(l.isActive ?? l.active !== false) ? "ok" : "off"}
                  </span>
                </div>
                <div className={rowT2}>
                  {l.uses ?? l.usedCount ?? 0} uses
                  {l.maxUses ? ` / ${l.maxUses} max` : ""}
                  {l.expiresAt ? ` · expires ${fmtList(l.expiresAt)}` : ""}
                </div>
              </div>
              {(l.isActive ?? l.active !== false) && (
                <button
                  className={`${btnDanger} ${btnSm}`}
                  onClick={() => void deactivate(l.id)}
                >
                  <TrashIcon className="h-[17px] w-[17px]" /> Deactivate
                </button>
              )}
            </div>
          ))}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Invitations (received / sent)
// ---------------------------------------------------------------------------

function ReceivedInvitesModal() {
  const { refreshLists, toast } = useShell();
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    ChatAPI.invitationsReceived()
      .then(setInvites)
      .catch((err) =>
        toast(getErrorMessage(err, "Failed to load invites"), "error"),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function respond(id: string, status: "ACCEPTED" | "REJECTED") {
    setBusyId(id);
    try {
      await ChatAPI.respondInvitation(id, status);
      toast(
        status === "ACCEPTED" ? "Joined the room!" : "Invitation declined",
        "success",
      );
      setInvites((prev) => prev.filter((i) => i.id !== id));
      void refreshLists();
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't respond"), "error");
    } finally {
      setBusyId(null);
    }
  }

  if (invites.length === 0)
    return (
      <p className="role-note mt-1.5 mb-0.5 text-[12.5px] text-muted">
        No pending invitations.
      </p>
    );
  return (
    <>
      {invites.map((inv) => (
        <div key={inv.id} className={rowItem}>
          <AppAvatar name={inv.room?.name} size={38} square />
          <div className={rowGrow}>
            <div className={rowT1}>#{inv.room?.name}</div>
            <div className={rowT2}>
              from @{inv.invitedBy?.username} · {fmtList(inv.createdAt)}
            </div>
          </div>
          <button
            className={`${btn} ${btnSm} ${btnPrimary}`}
            disabled={busyId === inv.id}
            onClick={() => void respond(inv.id, "ACCEPTED")}
          >
            <CheckIcon className="h-[17px] w-[17px]" /> Accept
          </button>
          <button
            className={`${btnDanger} ${btnSm}`}
            disabled={busyId === inv.id}
            onClick={() => void respond(inv.id, "REJECTED")}
          >
            <CloseIcon className="h-[17px] w-[17px]" /> Decline
          </button>
        </div>
      ))}
    </>
  );
}

function SentInvitesModal() {
  const { toast } = useShell();
  const [invites, setInvites] = useState<Invitation[]>([]);

  useEffect(() => {
    ChatAPI.invitationsSent()
      .then(setInvites)
      .catch((err) =>
        toast(getErrorMessage(err, "Failed to load invites"), "error"),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (invites.length === 0)
    return (
      <p className="role-note mt-1.5 mb-0.5 text-[12.5px] text-muted">
        No pending invitations sent.
      </p>
    );
  return (
    <>
      {invites.map((inv) => (
        <div key={inv.id} className={rowItem}>
          <AppAvatar name={inv.room?.name} size={38} square />
          <div className={rowGrow}>
            <div className={rowT1}>#{inv.room?.name}</div>
            <div className={rowT2}>
              to @{inv.invitedUser?.username} · {fmtList(inv.createdAt)}
            </div>
          </div>
          <span className={chipPending}>pending</span>
        </div>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// My join links
// ---------------------------------------------------------------------------

function MyLinksModal() {
  const { joinLinks, toast } = useShell();
  const [links, setLinks] = useState<JoinLink[]>([]);

  async function load() {
    try {
      setLinks(await joinLinks());
    } catch (err) {
      toast(getErrorMessage(err, "Failed to load links"), "error");
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (links.length === 0)
    return (
      <p className="role-note mt-1.5 mb-0.5 text-[12.5px] text-muted">
        You haven&apos;t created any join links yet.
      </p>
    );
  return (
    <>
      {links.map((l) => {
        const active = l.isActive ?? l.active !== false;
        return (
          <div key={l.id} className={rowItem}>
            <AppAvatar name={l.room?.name} size={38} square />
            <div className={rowGrow}>
              <div className={rowT1}>
                #{l.room?.name}{" "}
                <span className={active ? chipOk : chipDead}>
                  {active ? "ok" : "off"}
                </span>
              </div>
              <div className={rowT2}>
                {l.uses ?? l.usedCount ?? 0} uses
                {l.maxUses ? ` / ${l.maxUses} max` : ""}
                {l.expiresAt ? ` · expires ${fmtList(l.expiresAt)}` : ""}
              </div>
            </div>
            {active && l.room && (
              <button
                className={`${btnDanger} ${btnSm}`}
                onClick={() =>
                  ChatAPI.deactivateJoinLink(l.room!.id, l.id)
                    .then(() => toast("Link deactivated", "success"))
                    .then(load)
                    .catch((err) =>
                      toast(
                        getErrorMessage(err, "Couldn't deactivate"),
                        "error",
                      ),
                    )
                }
              >
                <TrashIcon className="h-[17px] w-[17px]" /> Off
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Profile / Account / Recovery
// ---------------------------------------------------------------------------

const GENDER_OPTIONS: { value: Gender | ""; label: string }[] = [
  { value: "", label: "Not specified" },
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "NON_BINARY", label: "Non-binary" },
  { value: "OTHER", label: "Other" },
  { value: "PREFER_NOT_TO_SAY", label: "Prefer not to say" },
];

function formatDateInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function ProfileModal() {
  const { user, presence, toast, refreshUser } = useShell();
  const { theme, toggle } = useTheme();

  const [displayName, setDisplayName] = useState(user.displayName ?? "");
  const [bio, setBio] = useState(user.bio ?? "");
  const [gender, setGender] = useState<Gender | "">(user.gender ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(
    formatDateInput(user.dateOfBirth),
  );
  const [saving, setSaving] = useState(false);

  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [pendingAvatarKey, setPendingAvatarKey] = useState<string | null>(null);
  const [savingAvatar, setSavingAvatar] = useState(false);

  async function saveAvatar() {
    if (!pendingAvatarKey) return;
    setSavingAvatar(true);
    try {
      await ChatAPI.updateMyAvatar(pendingAvatarKey);
      await refreshUser();
      toast("Avatar updated", "success");
      setShowAvatarPicker(false);
      setPendingAvatarKey(null);
    } catch (err) {
      toast(getErrorMessage(err, "Failed to update avatar"), "error");
    } finally {
      setSavingAvatar(false);
    }
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await ChatAPI.updateMe({
        displayName: displayName.trim() || null,
        bio: bio.trim() || null,
        gender: gender || null,
        dateOfBirth: dateOfBirth || null,
      });
      await refreshUser();
      toast("Profile saved", "success");
    } catch (err) {
      toast(getErrorMessage(err, "Failed to save profile"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className={rowItem} style={{ padding: "4px 0 14px" }}>
        <AppAvatar
          name={user.displayName ?? user.username}
          src={user.avatar}
          size={56}
          presence={presence[user.id]}
        />
        <div className={rowGrow}>
          <div className={rowT1}>{displayName}</div>
          <div className={rowT2}>@{user.username}</div>
          <div className={rowT2}>{user.email}</div>
        </div>
      </div>

      {showAvatarPicker ? (
        <div>
          <p className="mb-2 text-[12.5px] font-semibold text-muted">
            Choose an avatar:
          </p>
          <AvatarSelector
            source="user"
            selected={pendingAvatarKey ?? user.avatar}
            onSelect={setPendingAvatarKey}
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              className={`${btnGhost} ${btnSm}`}
              onClick={() => {
                setShowAvatarPicker(false);
                setPendingAvatarKey(null);
              }}
            >
              Cancel
            </button>
            <button
              className={`${btnPrimary} ${btnSm}`}
              disabled={savingAvatar || !pendingAvatarKey}
              onClick={() => void saveAvatar()}
            >
              {savingAvatar ? "Saving…" : "Save avatar"}
            </button>
          </div>
        </div>
      ) : (
        <button
          className={`${btnGhost} ${btnBlock}`}
          onClick={() => setShowAvatarPicker(true)}
        >
          Change avatar
        </button>
      )}

      <form onSubmit={(e) => void saveProfile(e)} className="space-y-4">
        <div>
          <label htmlFor="profile-displayName" className={fieldLabel}>
            Display name
          </label>
          <input
            id="profile-displayName"
            type="text"
            autoComplete="nickname"
            placeholder="Your public name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={fieldInput}
            maxLength={40}
          />
        </div>

        <div>
          <label htmlFor="profile-bio" className={fieldLabel}>
            Bio
          </label>
          <textarea
            id="profile-bio"
            placeholder="A short bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className={`${fieldInput} min-h-[90px] resize-none`}
            maxLength={160}
          />
          <p className="mt-1 text-right text-[11px] text-muted">
            {bio.length}/160
          </p>
        </div>

        <div>
          <label htmlFor="profile-gender" className={fieldLabel}>
            Gender
          </label>
          <select
            id="profile-gender"
            value={gender}
            onChange={(e) => setGender(e.target.value as Gender | "")}
            className={fieldInput}
          >
            {GENDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="profile-dob" className={fieldLabel}>
            Date of birth
          </label>
          <input
            id="profile-dob"
            type="date"
            value={dateOfBirth}
            max={formatDateInput(new Date().toISOString())}
            onChange={(e) => setDateOfBirth(e.target.value)}
            className={fieldInput}
          />
        </div>

        <button className={btnPrimary} type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </button>
      </form>

      {/* Account settings live with the profile so the profile menu has a
          single entry instead of separate Profile and Account items. */}
      <div className="mactions grid gap-2.5 border-t border-border pt-4">
        <button
          className={`${btnGhost} ${btnBlock}`}
          onClick={() => {
            toggle();
            toast(theme === "dark" ? "Light mode" : "Dark mode", "info");
          }}
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />} Switch to{" "}
          {theme === "dark" ? "light" : "dark"} mode
        </button>
        <button
          className={`${btnDanger} ${btnBlock}`}
          onClick={() =>
            void ChatAPI.logout().finally(
              () => (window.location.href = "/auth"),
            )
          }
        >
          <LogoutIcon /> Sign out
        </button>
      </div>
    </div>
  );
}

const CUSTOM_STATUS_MAX = 128;

function StatusModal() {
  const { user, refreshUser, toast, clearModals } = useShell();
  const [status, setStatus] = useState<UserStatus>(user.status);
  const [customStatus, setCustomStatus] = useState(user.customStatus ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      // The server normalizes a blank custom status to null; mirror that so
      // the input clears in the same way the API treats "cleared".
      await ChatAPI.updateStatus({
        status,
        customStatus: customStatus.trim() || null,
      });
      await refreshUser();
      toast("Status updated", "success");
      clearModals();
    } catch (err) {
      toast(getErrorMessage(err, "Failed to update status"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <p className="role-note mt-1.5 mb-0.5 text-[12.5px] text-muted">
        Your status shows next to your name. It&apos;s independent of whether
        you&apos;re online right now.
      </p>
      <div className="mb-3.5 flex flex-col gap-1.5">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-left text-[14.5px] font-extrabold transition-colors duration-150 ease-app ${status === opt.value ? "bg-accent-soft text-accent-solid" : "text-fg hover:bg-surface-2"}`}
            onClick={() => setStatus(opt.value)}
            aria-pressed={status === opt.value}
          >
            {/* Colored dot advertises each status's tone; the checkmark (not
                the dot) marks which one is currently selected. */}
            <span className="flex min-w-0 items-center gap-2.5">
              <span
                className={`h-3 w-3 flex-none rounded-full ${TONE_BG[opt.tone]}`}
              />
              <span className="truncate">{opt.label}</span>
            </span>
            {status === opt.value && (
              <CheckIcon className="h-4 w-4 flex-none text-accent-solid" />
            )}
          </button>
        ))}
      </div>
      <div className="mfield mb-3.5">
        <label htmlFor="status-custom" className={fieldLabel}>
          Custom status (optional)
        </label>
        <input
          id="status-custom"
          className={fieldInput}
          value={customStatus}
          onChange={(e) => setCustomStatus(e.target.value)}
          maxLength={CUSTOM_STATUS_MAX}
          placeholder="e.g. Coding, BRB…"
        />
        <p className="mt-1 text-right text-[11px] text-muted">
          {customStatus.length}/{CUSTOM_STATUS_MAX}
        </p>
      </div>
      <div className="mactions mt-4 grid gap-2.5">
        <button
          className={`${btnPrimary} ${btnBlock}`}
          onClick={() => void save()}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save status"}
        </button>
      </div>
    </>
  );
}

function PrivacyModal() {
  const {
    user,
    refreshUser,
    toast,
    clearModals,
    blockedUsers,
    refreshBlockedUsers,
    unblockUser,
  } = useShell();
  const [showOnlineStatus, setShowOnlineStatus] = useState(
    user.showOnlineStatus,
  );
  const [showTypingStatus, setShowTypingStatus] = useState(
    user.showTypingStatus,
  );
  const [saving, setSaving] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  // Blocked users load lazily: the shell doesn't fetch them at startup, only
  // when this modal opens (and after each block/unblock elsewhere).
  useEffect(() => {
    void refreshBlockedUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    setSaving(true);
    try {
      await ChatAPI.updatePrivacy({ showOnlineStatus, showTypingStatus });
      await refreshUser();
      toast("Privacy settings saved", "success");
      clearModals();
    } catch (err) {
      toast(getErrorMessage(err, "Failed to save privacy settings"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function unblock(userId: string) {
    setUnblockingId(userId);
    try {
      await unblockUser(userId);
    } finally {
      setUnblockingId(null);
    }
  }

  return (
    <>
      <p className="role-note mt-1.5 mb-0.5 text-[12.5px] text-muted">
        Control what others can see about your activity. This never changes what
        you see yourself.
      </p>
      <div className={rowItem}>
        <div className={rowGrow}>
          <div className={rowT1}>Show online status</div>
          <div className={rowT2}>
            Let others see when you&apos;re online, idle, or offline.
          </div>
        </div>
        <Toggle on={showOnlineStatus} onChange={setShowOnlineStatus} />
      </div>
      <div className={rowItem}>
        <div className={rowGrow}>
          <div className={rowT1}>Show typing status</div>
          <div className={rowT2}>
            Let others see when you&apos;re typing a message.
          </div>
        </div>
        <Toggle on={showTypingStatus} onChange={setShowTypingStatus} />
      </div>
      <div className="mactions mt-4 grid gap-2.5">
        <button
          className={`${btnPrimary} ${btnBlock}`}
          onClick={() => void save()}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save privacy"}
        </button>
      </div>

      <div className="mt-6 border-t border-border pt-4">
        <div className="mb-2 text-[13.5px] font-extrabold">Blocked users</div>
        {blockedUsers.length === 0 ? (
          <p className="text-[12.5px] text-muted">
            Nobody is blocked. Blocking a user stops them from sending you
            friend requests and keeps your chats private.
          </p>
        ) : (
          <div className="flex max-h-[190px] flex-col gap-1.5 overflow-y-auto">
            {blockedUsers.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-[10px] rounded-[12px] p-1.5 hover:bg-surface-2"
              >
                <AvatarLink
                  userId={b.id}
                  name={b.displayName ?? b.username}
                  avatar={b.avatar}
                  size={34}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-bold">
                    <NameLink
                      userId={b.id}
                      name={displayName(b)}
                      className="text-[13.5px] font-bold"
                    />
                  </div>
                  <div className="truncate text-[11.5px] text-muted">
                    @{b.username}
                  </div>
                </div>
                <button
                  className={`${btnGhost} ${btnSm} flex-none`}
                  disabled={unblockingId === b.id}
                  onClick={() => void unblock(b.id)}
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function NotificationsModal() {
  // Preferences are persisted immediately (no save step) so they apply the
  // moment they flip — playback reads the sound hook's enabledRef, and the
  // notifications singleton emits its own state changes.
  const { soundEnabled, setSoundEnabled } = useNotificationSound();
  const { toast } = useShell();
  const { supported, checking, prefEnabled, permission, enable, disable } =
    useNotifications();

  async function toggleDesktop(on: boolean) {
    if (!on) {
      await disable();
      toast("Desktop notifications off", "info");
      return;
    }
    const result = await enable();
    if (result.ok) {
      toast("Desktop notifications on", "success");
      return;
    }
    toast(
      result.reason === "denied"
        ? "Notifications are blocked — allow them for this site in your browser"
        : result.reason === "unconfigured"
          ? "Desktop notifications aren't configured on this server"
          : "Couldn't enable desktop notifications",
      "error",
    );
  }

  const permissionDenied = permission === "denied";

  return (
    <>
      <p className="role-note mt-1.5 mb-0.5 text-[12.5px] text-muted">
        Control how ChatHubby alerts you about new activity.
      </p>
      <div className={rowItem}>
        <div className={rowGrow}>
          <div className={rowT1}>Message sounds</div>
          <div className={rowT2}>
            Play a sound when a new message arrives. Direct messages and rooms
            each have their own tone.
          </div>
        </div>
        <Toggle on={soundEnabled} onChange={setSoundEnabled} />
      </div>
      <div className={rowItem}>
        <div className={rowGrow}>
          <div className={rowT1}>Desktop notifications</div>
          <div className={rowT2}>
            Show an OS notification for new messages, even when ChatHubby
            isn&apos;t open. {permissionDenied && "Blocked by your browser."}
          </div>
        </div>
        <Toggle
          on={prefEnabled}
          onChange={(v) => void toggleDesktop(v)}
          disabled={checking || (!supported && !prefEnabled)}
        />
      </div>
      {!supported && (
        <p className="role-note mt-1.5 mb-0.5 text-[12.5px] text-muted">
          Desktop notifications need a secure connection (HTTPS or localhost).
        </p>
      )}
    </>
  );
}

function Toggle({
  on,
  onChange,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? "On" : "Off"}
      disabled={disabled}
      className={`relative h-6 w-11 flex-none rounded-full transition-colors duration-150 ease-app ${on ? "bg-accent-btn" : "bg-surface-3"} ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
      onClick={() => onChange(!on)}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150 ease-app ${on ? "translate-x-5" : ""}`}
      />
    </button>
  );
}

function RecoveryModal() {
  const { toast } = useShell();
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 1500);
    } catch {
      // Clipboard may be blocked (e.g. insecure context); select-all stays
      // available so a manual Ctrl+C still works.
    }
  }

  async function generate() {
    if (!password) return;
    setBusy(true);
    try {
      const fresh = await ChatAPI.regenerateRecoveryCodes(password);
      setCodes(fresh);
      setPassword("");
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't regenerate codes"), "error");
    } finally {
      setBusy(false);
    }
  }

  if (codes.length > 0) {
    return (
      <>
        <div className="warn my-[14px] flex gap-2.5 rounded-[10px] border border-[color-mix(in_oklab,oklch(0.76_0.13_75)_35%,transparent)] bg-warn-wash px-[13px] py-[11px] text-[13.5px] font-semibold">
          <RefreshIcon className="mt-px h-[18px] w-[18px] flex-none text-[oklch(0.7_0.12_75)]" />
          <span>
            These codes are shown only once. Save them somewhere safe — they
            replace all previous codes.
          </span>
        </div>
        <div className="codes my-4 flex flex-col gap-2">
          {codes.map((c) => (
            <div
              key={c}
              className="code flex items-center gap-2.5 rounded-[9px] bg-accent-soft pl-2.5 pr-1.5 py-[4px] font-mono text-[11.5px] font-bold text-accent-solid"
            >
              <span className="min-w-0 flex-1 whitespace-nowrap select-all">
                {c}
              </span>
              <button
                type="button"
                aria-label={copiedCode === c ? "Copied" : "Copy code"}
                title={copiedCode === c ? "Copied" : "Copy code"}
                onClick={() => void copyCode(c)}
                className="flex-none rounded-lg p-1.5 text-muted transition-colors duration-150 hover:bg-accent-wash hover:text-accent-solid"
              >
                {copiedCode === c ? (
                  <CheckIcon className="h-4 w-4 text-accent-solid" />
                ) : (
                  <CopyIcon className="h-4 w-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <p className="role-note mt-1.5 mb-0.5 text-[12.5px] text-muted">
        Regenerating codes invalidates all previous backup codes. Enter your
        password to continue.
      </p>
      <div className="mfield mb-3.5">
        <label htmlFor="recovery-password" className={fieldLabel}>
          Current password
        </label>
        <input
          id="recovery-password"
          className={fieldInput}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>
      <div className="mactions mt-4 grid gap-2.5">
        <button
          className={`${btnPrimary} ${btnBlock}`}
          onClick={() => void generate()}
          disabled={busy || !password}
        >
          <RefreshIcon className="h-[17px] w-[17px]" /> Generate codes
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Confirm
// ---------------------------------------------------------------------------

function ConfirmModal({
  p,
}: {
  p: { title: string; text: string; danger?: boolean; onYes: () => void };
}) {
  const { clearModals } = useShell();
  const [busy, setBusy] = useState(false);
  return (
    <>
      <p className="role-note mt-1.5 mb-0.5 text-[12.5px] text-muted">
        {p.text}
      </p>
      <div className="mactions mt-4 grid gap-2.5">
        <button
          className={`${btnGhost} ${btnBlock}`}
          onClick={clearModals}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          className={`${btnBlock} ${p.danger ? btnDanger : btnPrimary}`}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              // Await async handlers (e.g. delete channel/category) so the
              // modal shows a busy state and stays open until the call settles.
              await p.onYes();
            } catch {
              // Handlers toast their own errors; nothing to surface here.
            } finally {
              setBusy(false);
              clearModals();
            }
          }}
        >
          {busy ? "Working…" : p.danger ? "Delete" : "Confirm"}
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// User profile card
// ---------------------------------------------------------------------------

function UserProfileModal({ userId }: { userId: string }) {
  const {
    user: me,
    presence,
    openModal,
    openConv,
    clearModals,
    toast,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    withdrawFriendRequest,
    blockUser,
    unblockUser,
  } = useShell();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Relationship is local so an in-card action (send/cancel/accept/block)
  // re-renders the action row immediately without another network round-trip.
  const [relationship, setRelationship] = useState<Relationship>("NONE");

  // Extended profile data is fetched lazily — only when the card opens — so
  // rendering avatars/names elsewhere never triggers a profile request.
  async function load() {
    setLoading(true);
    setError(null);
    try {
      const p = await ChatAPI.getUserProfile(userId);
      setProfile(p);
      setRelationship(p.relationship);
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't load this profile"));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const isSelf = userId === me.id;
  const actions = profileActionSet(relationship, isSelf);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch {
      // The shell action methods toast the failure already; keep the card open.
    } finally {
      setBusy(false);
    }
  }

  async function message() {
    setBusy(true);
    try {
      const chat = await ChatAPI.startDm(userId);
      clearModals();
      openConv({
        kind: "dm",
        id: chat.id,
        otherUser: profile
          ? {
              id: profile.id,
              username: profile.username,
              displayName: profile.displayName,
              avatar: profile.avatar,
            }
          : { id: userId },
      });
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't start a chat"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function onFriend(kind: "add" | "cancel" | "accept" | "decline") {
    if (!profile?.friendRequestId && kind !== "add") return;
    await run(async () => {
      switch (kind) {
        case "add":
          await sendFriendRequest(userId);
          setRelationship("REQUEST_SENT");
          break;
        case "cancel":
          await withdrawFriendRequest(profile!.friendRequestId!);
          setRelationship("NONE");
          break;
        case "accept":
          await acceptFriendRequest(profile!.friendRequestId!);
          setRelationship("FRIENDS");
          break;
        case "decline":
          await declineFriendRequest(profile!.friendRequestId!);
          setRelationship("NONE");
          break;
      }
    });
  }

  async function onBlock() {
    await run(async () => {
      if (actions.blockAction === "unblock") {
        await unblockUser(userId);
        setRelationship("NONE");
      } else {
        await blockUser(userId);
        setRelationship("BLOCKED");
      }
    });
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10">
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <RefreshIcon className="h-4 w-4 animate-spin" /> Loading profile…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <p className="text-[13.5px] font-bold text-danger">{error}</p>
        <button
          className={`${btnGhost} ${btnSm} mt-4`}
          onClick={() => void load()}
        >
          <RefreshIcon className="h-[17px] w-[17px]" /> Retry
        </button>
      </div>
    );
  }

  if (!profile) return null;

  const p = presence[userId];

  return (
    <div className="space-y-4">
      {/* Header: avatar opens the full-screen viewer (never the card), and the
          name opens... nothing (it IS the card). Actions below stopPropagation
          so they never trigger the frame's backdrop close. */}
      <div className="flex items-center gap-3.5">
        <AvatarLink
          userId={userId}
          name={profile.displayName ?? profile.username}
          avatar={profile.avatar}
          size={64}
          presence={p}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[17px] font-extrabold">
            {profile.displayName ?? profile.username}
          </div>
          <div className="truncate text-[13px] text-muted">
            @{profile.username}
          </div>
          {isSelf && (
            <span className="mt-1 inline-block rounded-full bg-surface-2 px-2.5 py-[3px] text-[11px] font-extrabold tracking-[0.02em] text-muted">
              This is you
            </span>
          )}
        </div>
      </div>

      {/* Bio — empty state when unset. */}
      <div>
        <div className="text-[12.5px] font-bold text-muted">Bio</div>
        {profile.bio ? (
          <p className="mt-1 text-[14px] leading-[1.5] break-words whitespace-pre-wrap">
            {profile.bio}
          </p>
        ) : (
          <p className="mt-1 text-[13px] text-muted">No bio yet.</p>
        )}
      </div>

      {/* Only existing fields: gender, join date, manual status label. */}
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-muted">
        {profile.gender && (
          <span>
            <b className="font-bold text-fg">Gender:</b>{" "}
            {GENDER_LABELS[profile.gender]}
          </span>
        )}
        <span>
          <b className="font-bold text-fg">Joined:</b>{" "}
          {new Date(profile.createdAt).toLocaleDateString([], {
            year: "numeric",
            month: "short",
          })}
        </span>
      </div>

      {/* Relationship-driven actions. Invalid actions never render as dead
          buttons: blocked hides Message, self hides everything. */}
      <div className="mactions mt-4 grid gap-2.5 border-t border-border pt-4">
        {actions.showMessage && (
          <button
            className={`${btnPrimary} ${btnBlock}`}
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              void message();
            }}
          >
            Message
          </button>
        )}

        {!isSelf && (
          <div className="grid gap-2 sm:grid-cols-2">
            {actions.friendControls.map((k) => (
              <button
                key={k}
                className={`${btnSm} ${
                  k === "decline"
                    ? btnDanger
                    : k === "cancel"
                      ? btnGhost
                      : btnPrimary
                }`}
                disabled={busy || !profile.friendRequestId}
                onClick={(e) => {
                  e.stopPropagation();
                  void onFriend(k);
                }}
              >
                {k === "add" && "Add friend"}
                {k === "cancel" && "Cancel request"}
                {k === "accept" && "Accept"}
                {k === "decline" && "Decline"}
              </button>
            ))}
            {actions.friendLabels.map((label) => (
              <span
                key={label}
                className="flex min-h-8 items-center justify-center rounded-[99px] bg-surface-2 px-[13px] py-[5px] text-[12.5px] font-bold text-muted"
              >
                {label} ✓
              </span>
            ))}
          </div>
        )}

        {!isSelf && (
          <button
            className={`${btnSm} ${actions.blockAction === "unblock" ? btnGhost : btnGhost}`}
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              void onBlock();
            }}
          >
            {actions.blockAction === "unblock" ? "Unblock" : "Block"}
          </button>
        )}

        {isSelf && (
          <button
            className={`${btnGhost} ${btnBlock}`}
            onClick={(e) => {
              e.stopPropagation();
              openModal("profile");
            }}
          >
            Edit profile
          </button>
        )}
      </div>
    </div>
  );
}

const GENDER_LABELS: Record<Exclude<Gender, "">, string> = {
  MALE: "Male",
  FEMALE: "Female",
  NON_BINARY: "Non-binary",
  OTHER: "Other",
  PREFER_NOT_TO_SAY: "Prefer not to say",
};

// ---------------------------------------------------------------------------
// Full-screen avatar viewer
// ---------------------------------------------------------------------------

function AvatarViewer({
  name,
  avatar,
}: {
  name?: string;
  avatar?: string | null;
}) {
  const { popModal } = useShell();
  const [failed, setFailed] = useState(false);
  // Only one avatar resolution exists (single S3 key via the avatars proxy), so
  // the viewer uses the same URL as everywhere else; a broken image falls back
  // to the initials placeholder instead of leaving a dead <img>.
  const src = failed ? null : avatarUrl(avatar);

  return (
    <>
      <button
        className={`${iconBtn} fixed right-4 top-4 z-10 h-10 w-10 rounded-full bg-surface text-fg`}
        onClick={popModal}
        aria-label="Close"
      >
        <CloseIcon />
      </button>
      <div
        className="flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={name ?? "Profile picture"}
            className="max-h-[calc(100dvh-96px)] max-w-full rounded-2xl object-contain shadow-2xl"
            onError={() => setFailed(true)}
          />
        ) : (
          <AppAvatar name={name} size={160} />
        )}
      </div>
    </>
  );
}
