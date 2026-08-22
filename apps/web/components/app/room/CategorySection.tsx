"use client";

// Collapsible category section in the room sidebar: the category header (name +
// chevron, with a drag grip + context menu for admins) and its channels. The
// header is a sortable (category reorder) and the channel list area is a
// droppable so channels can be dropped into an empty category. Collapse state
// is owned by RoomShell so it survives channel switches within the session.
import { useRef, useState } from "react";
import {
  useSortable,
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Channel } from "../types";
import { ChevronIcon, GripIcon, MoreIcon, PlusIcon } from "../icons";
import { useShell } from "../state";
import { ChannelItem } from "./ChannelItem";
import { CategoryContextMenu } from "./CategoryContextMenu";
import type { MenuPosition } from "./ChannelContextMenu";

export function CategorySection({
  roomId,
  category,
  channelIds,
  channelById,
  collapsed,
  onToggle,
  activeChannelId,
  collapsible = true,
  canManage,
  dragEnabled,
  channelReorderEnabled,
}: {
  roomId: string;
  category: { id: string; name: string };
  /** Ordered channel ids rendered under this section (driven by DnD state). */
  channelIds: string[];
  channelById: Map<string, Channel>;
  collapsed: boolean;
  onToggle: () => void;
  activeChannelId?: string;
  /** Uncategorized has no collapse affordance — always rendered expanded. */
  collapsible?: boolean;
  canManage: boolean;
  /** Category header reorder (uncategorized headers are not draggable). */
  dragEnabled: boolean;
  /** Whether individual channels can be dragged out of / into this section. */
  channelReorderEnabled: boolean;
}) {
  const { openModal, channelUnreads } = useShell();
  const [menu, setMenu] = useState<MenuPosition | null>(null);
  const headRef = useRef<HTMLButtonElement>(null);

  const sortable = useSortable({
    id: `category:${category.id}`,
    disabled: !dragEnabled,
    data: { type: "category", categoryId: category.id },
  });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.4 : undefined,
  };

  const droppable = useDroppable({
    id: `container:${category.id}`,
    data: { type: "container", container: category.id },
  });

  const channels = channelIds
    .map((id) => channelById.get(id))
    .filter((c): c is Channel => !!c);

  function openMenuAt(x: number, y: number) {
    setMenu({ x, y });
  }

  function openMenuFromButton() {
    const rect = headRef.current?.getBoundingClientRect();
    openMenuAt(rect ? rect.right - 4 : 0, rect ? rect.bottom + 4 : 0);
  }

  return (
    <div className="category group mt-2" style={style}>
      <div
        className="cat-head flex items-center gap-1 px-1"
        onContextMenu={(e) => {
          if (!canManage) return;
          e.preventDefault();
          openMenuAt(e.clientX, e.clientY);
        }}
      >
        {dragEnabled && (
          <button
            {...sortable.attributes}
            {...sortable.listeners}
            className="flex h-5 w-5 flex-none cursor-grab items-center justify-center rounded-md text-muted opacity-100 transition-opacity duration-150 ease-app hover:text-fg md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 active:cursor-grabbing"
            aria-label={`Reorder ${category.name}`}
            title="Drag to reorder"
          >
            <GripIcon className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          ref={headRef}
          className={`flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded-md px-1 py-1 text-left text-[11.5px] font-extrabold tracking-[0.06em] text-muted transition-colors duration-150 ease-app hover:text-fg ${
            collapsible ? "" : "cursor-default"
          }`}
          onClick={collapsible ? onToggle : undefined}
          aria-expanded={collapsible ? !collapsed : undefined}
          aria-label={`Toggle category ${category.name}`}
        >
          {collapsible && (
            <ChevronIcon
              className={`h-3.5 w-3.5 flex-none transition-transform duration-150 ease-app ${
                collapsed ? "-rotate-90" : ""
              }`}
            />
          )}
          <span className="truncate uppercase">{category.name}</span>
        </button>
        {canManage && (
          <button
            className="flex h-5 w-5 flex-none cursor-pointer items-center justify-center rounded-md text-muted opacity-100 transition-opacity duration-150 ease-app hover:bg-surface-2 hover:text-fg md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
            onClick={() =>
              openModal("createChannel", { roomId, categoryId: category.id })
            }
            aria-label={`Create channel in ${category.name}`}
            title="Create channel"
          >
            <PlusIcon className="h-3.5 w-3.5" />
          </button>
        )}
        {canManage && (
          <button
            className="flex h-5 w-5 flex-none cursor-pointer items-center justify-center rounded-md text-muted opacity-100 transition-opacity duration-150 ease-app hover:bg-surface-2 hover:text-fg md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              openMenuFromButton();
            }}
            aria-label={`Options for ${category.name}`}
            title="Category options"
          >
            <MoreIcon className="h-[15px] w-[15px]" />
          </button>
        )}
      </div>
      {menu && (
        <CategoryContextMenu
          roomId={roomId}
          categoryId={category.id}
          categoryName={category.name}
          position={menu}
          onClose={() => setMenu(null)}
        />
      )}
      <div 
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-app ${
          collapsible && collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
        }`}
      >
        <div className="overflow-hidden">
          <div
            ref={droppable.setNodeRef}
            className="mt-0.5 flex min-h-[4px] flex-col gap-px pl-1"
          >
            <SortableContext
              items={channelIds}
              strategy={verticalListSortingStrategy}
            >
              {channels.map((c) => (
                <ChannelItem
                  key={c.id}
                  channel={c}
                  active={c.id === activeChannelId}
                  unreadState={channelUnreads[`room:${c.roomId}:${c.id}`]}
                  canManage={canManage}
                  containerId={category.id}
                  dragEnabled={channelReorderEnabled}
                />
              ))}
            </SortableContext>
          </div>
        </div>
      </div>
    </div>
  );
}
