"use client";

// Modal system: a stack of modals rendered over the shell. All modals talk to
// the real backend via ChatAPI and push to the stack for sub-flows (e.g. a
// room's info modal opening invite/join-request/link modals).
import { useEffect, useRef, useState } from "react";
import { useShell, type ModalEntry } from "./state";
import { ChatAPI, getErrorMessage } from "./api";
import { displayName, fmtList, fmtTime } from "./helpers";
import type { Invitation, JoinLink, JoinRequest } from "./types";
import AppAvatar from "./AppAvatar";
import AvatarSelector from "./AvatarSelector";
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
  invite: "Invite to room",
  joinRequests: "Join requests",
  joinLinks: "Join links",
  receivedInvites: "Received invitations",
  sentInvites: "Sent invitations",
  myLinks: "My join links",
  profile: "Profile",
  account: "My account",
  recovery: "Recovery codes",
  confirm: "Confirm",
};

export default function Modals() {
  const { mStack } = useShell();
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
  const body = Body(entry);
  return (
    <div
      className="modal-root fixed inset-0 z-[80] flex items-end justify-center"
      style={{ zIndex: 80 + index }}
    >
      <div
        className="modal-back absolute inset-0 bg-[oklch(0_0_0/0.42)] animate-[fade_.2s_cubic-bezier(.2,.8,.2,1)]"
        onClick={clearModals}
      />
      <div className="modal relative flex max-h-[88dvh] w-[min(480px,100%)] flex-col overflow-hidden rounded-t-[24px] bg-surface shadow-lg animate-[rise_.24s_cubic-bezier(.2,.8,.2,1)]">
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
          <h2 className="min-w-0 flex-1 truncate font-display text-[18px] leading-[1.15] tracking-tight">
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
  switch (entry.name) {
    case "newDm":
      return <NewDmModal />;
    case "newRoom":
      return <NewRoomModal />;
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
    case "account":
      return <AccountModal />;
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
  }
}

// ---------------------------------------------------------------------------
// New DM
// ---------------------------------------------------------------------------

function NewDmModal() {
  const { openConv, clearModals, toast } = useShell();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<
    { id: string; username: string; displayname: string | null }[]
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
    displayname: string | null;
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
        <label className={fieldLabel}>Find someone</label>
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
              <AppAvatar name={u.displayname ?? u.username} size={38} />
              <div className={rowGrow}>
                <div className={rowT1}>{displayName(u)}</div>
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
        <label className={fieldLabel}>Room name</label>
        <input
          className={fieldInput}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Friday Gaming"
          autoFocus
        />
      </div>
      <div className="mfield mb-3.5">
        <label className={fieldLabel}>Description (optional)</label>
        <textarea
          className={`${fieldInput} min-h-[70px] resize-y`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What's this room about?"
        />
      </div>
      <div className="mfield mb-3.5">
        <label className={fieldLabel}>Room avatar (optional)</label>
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
        <AppAvatar name={info.name} size={52} square />
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
          <AppAvatar name={displayName(m.user)} src={m.user.avatar} size={38} />
          <div className={rowGrow}>
            <div className={rowT1}>
              {displayName(m.user)}
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
    { id: string; username: string; displayname: string | null }[]
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
    displayname: string | null;
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
              <AppAvatar name={u.displayname ?? u.username} size={38} />
              <div className={rowGrow}>
                <div className={rowT1}>{displayName(u)}</div>
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

function ProfileModal() {
  const { user } = useShell();
  return (
    <div className={rowItem} style={{ padding: "4px 0 14px" }}>
      <AppAvatar
        name={user.displayname ?? user.username}
        src={user.avatar}
        size={56}
      />
      <div className={rowGrow}>
        <div className={rowT1}>{displayName(user)}</div>
        <div className={rowT2}>@{user.username}</div>
        <div className={rowT2}>{user.email}</div>
      </div>
    </div>
  );
}

function AccountModal() {
  const { user, toast, refreshUser } = useShell();
  const { theme, toggle } = useTheme();
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

  return (
    <>
      <div className={rowItem}>
        <AppAvatar
          name={user.displayname ?? user.username}
          src={user.avatar}
          size={40}
        />
        <div className={rowGrow}>
          <div className={rowT1}>{displayName(user)}</div>
          <div className={rowT2}>{user.email}</div>
        </div>
      </div>

      {showAvatarPicker ? (
        <div className="mt-3">
          <p className="mb-2 text-[12.5px] font-semibold text-muted">
            {user.avatar
              ? "Selecting a default avatar will replace your current one."
              : "Choose a default avatar:"}
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
          className={`${btnGhost} ${btnBlock} mt-3`}
          onClick={() => setShowAvatarPicker(true)}
        >
          Change avatar
        </button>
      )}

      <div className="mactions mt-4 grid gap-2.5">
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
    </>
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
        <label className={fieldLabel}>Current password</label>
        <input
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
        <button className={`${btnGhost} ${btnBlock}`} onClick={clearModals}>
          Cancel
        </button>
        <button
          className={`${btnBlock} ${p.danger ? btnDanger : btnPrimary}`}
          disabled={busy}
          onClick={() => {
            setBusy(true);
            try {
              p.onYes();
            } finally {
              clearModals();
            }
          }}
        >
          {p.danger ? "Delete" : "Confirm"}
        </button>
      </div>
    </>
  );
}
