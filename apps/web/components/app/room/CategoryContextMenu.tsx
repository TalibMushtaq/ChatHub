"use client";

// Category context menu (Phase 3 §7.2): rename, create a channel inside, or
// delete the category. Deleting moves its channels to "Uncategorized" — never
// destroys them (backend guarantees this, mirrored locally for the sidebar).
// Categories are admin-managed, so this menu only renders for OWNER/ADMIN.
// Portal-rendered with fixed coordinates so it escapes the sidebar's scroll
// container (same reason as the channel context menu).
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useShell } from "../state";
import { ChatAPI, getErrorMessage } from "../api";
import { EditIcon, PlusIcon, TrashIcon } from "../icons";
import type { MenuPosition } from "./ChannelContextMenu";
import { MenuList, type MenuItem } from "./MenuList";

export function CategoryContextMenu({
  roomId,
  categoryId,
  categoryName,
  position,
  onClose,
}: {
  roomId: string;
  categoryId: string;
  categoryName: string;
  position: MenuPosition;
  onClose: () => void;
}) {
  const { openModal, toast, patchRoomDetail } = useShell();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function askDelete() {
    openModal("confirm", {
      title: "Delete category",
      text: `Delete ${categoryName}? Its channels will move to "Uncategorized" — no messages are lost.`,
      danger: true,
      onYes: async () => {
        try {
          await ChatAPI.deleteCategory(roomId, categoryId);
          // Move the category's channels to uncategorized locally so the
          // sidebar matches the server without a refetch.
          patchRoomDetail(roomId, (detail) => {
            const cat = detail.categories.find((c) => c.id === categoryId);
            const moved = cat?.channels ?? [];
            return {
              ...detail,
              categories: detail.categories.filter((c) => c.id !== categoryId),
              uncategorized: [
                ...detail.uncategorized,
                ...moved.map((c) => ({ ...c, categoryId: null })),
              ],
            };
          });
          toast(`Category ${categoryName} deleted`, "success");
        } catch (err) {
          toast(getErrorMessage(err, "Couldn't delete the category"), "error");
        }
      },
    });
  }

  const items: MenuItem[] = [
    {
      label: "Rename Category",
      icon: <EditIcon className="h-4 w-4 flex-none" />,
      onClick: () => {
        openModal("editCategory", { roomId, categoryId });
        onClose();
      },
    },
    {
      label: "Create Channel",
      icon: <PlusIcon className="h-4 w-4 flex-none" />,
      onClick: () => {
        openModal("createChannel", { roomId, categoryId });
        onClose();
      },
    },
    {
      label: "Delete Category",
      icon: <TrashIcon className="h-4 w-4 flex-none" />,
      danger: true,
      onClick: () => {
        onClose();
        askDelete();
      },
    },
  ];

  const style = {
    top: Math.min(
      position.y,
      (typeof window !== "undefined" ? window.innerHeight : 0) - 190,
    ),
    left: Math.min(
      position.x,
      (typeof window !== "undefined" ? window.innerWidth : 0) - 230,
    ),
  };

  return createPortal(
    <div
      ref={wrapRef}
      style={style}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-[95] min-w-[210px] rounded-[14px] border border-border bg-surface shadow-lg animate-[pop_.13s_cubic-bezier(.2,.8,.2,1)]"
    >
      <MenuList items={items} />
    </div>,
    document.body,
  );
}
