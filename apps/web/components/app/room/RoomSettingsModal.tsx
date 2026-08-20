"use client";

import { useEffect, useRef, useState } from "react";
import { useShell } from "../state";
import { ChatAPI } from "../api";
import { getErrorMessage } from "../api";
import AppAvatar from "../AppAvatar";
import {
  GearIcon,
  TrashIcon,
  LogoutIcon,
  PlusIcon,
  UserIcon,
  UsersIcon,
  BellIcon,
} from "../icons";
import { btnPrimary, btnBlock, fieldLabel, fieldInput } from "../styles";

type Tab =
  | "overview"
  | "profile"
  | "channels"
  | "roles"
  | "members"
  | "notifications"
  | "moderation"
  | "danger";

function RoomSettingsModal({ roomId }: { roomId: string }) {
  const { toast, popModal, user } = useShell();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatarKey, setAvatarKey] = useState<string | null>(null);
  const [notificationPref, setNotificationPref] = useState<
    "ALL" | "MENTIONS" | "MUTED"
  >("ALL");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [createdAt, setCreatedAt] = useState<string>("");
  const [ownerId, setOwnerId] = useState("");
  const deleteInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function fetchRoom() {
      try {
        const room = await ChatAPI.getRoomDetail(roomId);
        setName(room.name);
        setDescription(room.description || "");
        setAvatarKey(room.avatar || null);
        setCreatedAt(room.createdAt ?? "");
        setOwnerId(room.createdBy ?? "");

        const membership = await ChatAPI.getRoomMemberNotificationPref(roomId);
        setNotificationPref(membership.notificationPref ?? "ALL");
      } catch (err) {
        toast(getErrorMessage(err, "Failed to load room settings"), "error");
      }
    }
    fetchRoom();
  }, [roomId, toast]);

  const isOwner = user?.id === ownerId;

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    {
      key: "overview",
      label: "Overview",
      icon: <GearIcon className="h-4 w-4" />,
    },
    {
      key: "profile",
      label: "Profile",
      icon: <PlusIcon className="h-4 w-4" />,
    },
    {
      key: "channels",
      label: "Channels",
      icon: <UserIcon className="h-4 w-4" />,
    },
    { key: "roles", label: "Roles", icon: <UsersIcon className="h-4 w-4" /> },
    {
      key: "members",
      label: "Members",
      icon: <UsersIcon className="h-4 w-4" />,
    },
    {
      key: "notifications",
      label: "Notifications",
      icon: <BellIcon className="h-4 w-4" />,
    },
    {
      key: "moderation",
      label: "Moderation",
      icon: <TrashIcon className="h-4 w-4" />,
    },
    {
      key: "danger",
      label: "Danger Zone",
      icon: <LogoutIcon className="h-4 w-4" />,
    },
  ];

  const handleSaveOverview = async () => {
    setLoading(true);
    try {
      await ChatAPI.updateRoom(roomId, {
        name: name.trim() || undefined,
        description: description.trim() || null,
        avatarKey: avatarKey || null,
      });
      toast("Room settings saved", "success");
      popModal();
    } catch (err) {
      toast(getErrorMessage(err, "Failed to save room settings"), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleChangeNotification = async (
    pref: "ALL" | "MENTIONS" | "MUTED",
  ) => {
    setNotificationPref(pref);
    try {
      await ChatAPI.updateRoomNotificationPref(roomId, pref);
      toast(`Notifications set to ${pref}`, "success");
    } catch (err) {
      toast(
        getErrorMessage(err, "Failed to update notification preferences"),
        "error",
      );
    }
  };

  const handleLeaveRoom = async () => {
    setLoading(true);
    try {
      await ChatAPI.leaveRoom(roomId);
      toast("Left the room", "success");
      popModal();
    } catch (err) {
      toast(getErrorMessage(err, "Couldn't leave the room"), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRoom = async () => {
    if (deleteConfirm.trim() !== name) {
      toast("Room name doesn't match", "error");
      return;
    }
    setLoading(true);
    try {
      await ChatAPI.deleteRoom(roomId);
      toast("Room deleted", "success");
      popModal();
    } catch (err) {
      toast(getErrorMessage(err, "Failed to delete room"), "error");
    } finally {
      setLoading(false);
    }
  };

  const fmtDate = (iso: string) => {
    if (!iso) return "Unknown";
    try {
      return new Date(iso).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "Unknown";
    }
  };

  return (
    <div className="flex min-h-[500px] w-full max-w-lg">
      <div className="bg-surface overflow-hidden rounded-[16px]">
        {/* Sidebar nav */}
        <div className="border-b border-border w-14 min-h-[500px] flex flex-col">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`flex flex-col items-center gap-1.5 px-2 py-3 text-[12px] font-medium transition-colors duration-150 ${
                activeTab === tab.key
                  ? "bg-accent-soft text-accent-solid"
                  : "text-fg/60 hover:bg-surface-2"
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content panel */}
        <div className="flex-1 p-6 overflow-y-auto">
          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div className="space-y-4">
              <div>
                <label className={fieldLabel}>Room name</label>
                <input
                  className={fieldInput}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Room name"
                  disabled={loading}
                />
              </div>
              <div>
                <label className={fieldLabel}>Description</label>
                <textarea
                  className={fieldInput}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your room..."
                  rows={3}
                  disabled={loading}
                />
              </div>
              <div>
                <label className={fieldLabel}>Avatar</label>
                <div className="flex items-center gap-3">
                  {avatarKey ? (
                    <AppAvatar name={name} src={avatarKey} size={40} square />
                  ) : (
                    <div className="h-10 w-10 rounded-[6px] bg-border flex items-center justify-center text-fg/40">
                      <svg
                        className="h-4 w-4 text-fg/40"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M12 4v16M4 12h16" />
                      </svg>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setAvatarKey(URL.createObjectURL(file));
                    }}
                  />
                  <button
                    className="px-3 py-1.5 text-[11px] font-medium text-blue-600 rounded hover:bg-blue-100"
                    disabled={loading}
                  >
                    Change Avatar
                  </button>
                </div>
                <p className="text-xs text-muted">
                  Supported: PNG, up to 512px
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleSaveOverview}
                  className={`flex-1 ${btnPrimary} disabled:opacity-50 disabled:cursor-default ${loading ? "opacity-50" : ""}`}
                  disabled={loading}
                >
                  {loading ? "Saving..." : "Save Changes"}
                </button>
                <button
                  onClick={popModal}
                  className="flex-1 ml-2 px-3 py-1.5 text-[11px] font-medium rounded border border-border hover:bg-surface-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Profile Tab */}
          {activeTab === "profile" && (
            <div className="space-y-4">
              <div className="p-3 rounded-[8px] bg-surface-2">
                <p className="font-semibold">Room Owner</p>
                <p className="text-muted">{user?.username || "Unknown"}</p>
                <p className="text-muted text-sm">Room creator</p>
              </div>
              <div className="p-3 rounded-[8px] bg-surface-2">
                <p className="font-semibold">Members</p>
                <p className="text-muted text-sm">See Members tab</p>
              </div>
              <div className="p-3 rounded-[8px] bg-surface-2">
                <p className="font-semibold">Created</p>
                <p className="text-muted text-sm">{fmtDate(createdAt)}</p>
              </div>
            </div>
          )}

          {/* Channels Tab */}
          {activeTab === "channels" && (
            <div className="space-y-4">
              <p className="font-medium">Channels</p>
              <p className="text-muted text-sm">
                Manage channels from the sidebar
              </p>
            </div>
          )}

          {/* Roles Tab */}
          {activeTab === "roles" && (
            <div className="space-y-4">
              <p className="font-medium">Roles</p>
              <p className="text-muted text-sm">
                Owner · Admin · Moderator · Member
              </p>
              <p className="text-xs text-muted">
                Permissions enforced on backend (Phase 4)
              </p>
            </div>
          )}

          {/* Members Tab */}
          {activeTab === "members" && (
            <div className="space-y-4">
              <p className="font-medium">Members</p>
              <p className="text-muted text-sm">
                Manage members from the sidebar
              </p>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === "notifications" && (
            <div className="space-y-4">
              <p className="font-medium">Notification Preferences</p>
              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="notificationPref"
                    value="ALL"
                    checked={notificationPref === "ALL"}
                    onChange={() => handleChangeNotification("ALL")}
                    className="rounded border border-border bg-surface w-5 h-5"
                  />
                  All messages
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="notificationPref"
                    value="MENTIONS"
                    checked={notificationPref === "MENTIONS"}
                    onChange={() => handleChangeNotification("MENTIONS")}
                    className="rounded border bg-surface w-5 h-5"
                  />
                  Only mentions
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="notificationPref"
                    value="MUTED"
                    checked={notificationPref === "MUTED"}
                    onChange={() => handleChangeNotification("MUTED")}
                    className="rounded border bg-surface w-5 h-5"
                  />
                  Muted
                </label>
              </div>
            </div>
          )}

          {/* Moderation Tab */}
          {activeTab === "moderation" && (
            <div className="space-y-4">
              <p className="font-medium">Moderation</p>
              <p className="text-muted text-sm">
                Ban list, slow mode, and moderation tools. Backend enforcement
                from Phase 4.
              </p>
            </div>
          )}

          {/* Danger Zone Tab */}
          {activeTab === "danger" && (
            <div className="space-y-4">
              <p className="font-medium text-danger">Danger Zone</p>
              <p className="text-muted text-sm">
                Destructive actions cannot be undone.
              </p>
              <div className="border-l-2 border-danger pl-3">
                <button
                  onClick={() => {
                    const confirmed = window.confirm(
                      "Are you sure you want to leave this room? You'll stop seeing its channels and messages.",
                    );
                    if (confirmed) handleLeaveRoom();
                  }}
                  className={btnBlock}
                >
                  Leave Room
                </button>
              </div>
              {isOwner && (
                <div className="border-l-2 border-danger pl-3">
                  <p className="text-danger text-sm">
                    Type the room name below to confirm deletion:
                  </p>
                  <p className="text-xs text-muted mb-2">
                    Room name: <span className="font-bold">{name}</span>
                  </p>
                  <input
                    ref={deleteInputRef}
                    type="text"
                    className={fieldInput}
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder="Type room name to confirm"
                    disabled={loading}
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={handleDeleteRoom}
                      className={`${btnBlock} mx-0`}
                      disabled={loading}
                    >
                      {loading ? "Deleting..." : "Delete Room"}
                    </button>
                    <button
                      onClick={popModal}
                      className="px-3 py-1.5 text-[11px] font-medium rounded border border-border hover:bg-surface-2"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RoomSettingsModal;
