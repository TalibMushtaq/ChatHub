import type { SocketData } from "socket.io";

export interface ClientToServerEvents {
  "directChat:join": (payload: { directChatId: string }) => void;
  "directChat:leave": (payload: { directChatId: string }) => void;
  "directChat:typing": (payload: {
    directChatId: string;
    isTyping: boolean;
  }) => void;
  "chatroom:typing": (payload: {
    chatRoomId: string;
    isTyping: boolean;
  }) => void;
}

export interface ServerToClientEvents {
  "directChat:joined": (payload: { directChatId: string }) => void;
  "directChat:left": (payload: { directChatId: string }) => void;
  "directChat:error": (payload: { code: string; message: string }) => void;
  "message:new": (payload: MessagePayload) => void;
  "message:edited": (payload: MessageEditedPayload) => void;
  "message:deleted": (payload: MessageDeletedPayload) => void;
  "inbox:update": (payload: { directChatId: string }) => void;
  "directChat:read": (payload: {
    directChatId: string;
    unreadCount: number;
  }) => void;
  "chatroom:read": (payload: {
    chatRoomId: string;
    unreadCount: number;
  }) => void;
  "directChat:typing": (payload: {
    userId: string;
    username: string;
    directChatId: string;
    isTyping: boolean;
  }) => void;
  "chatroom:typing": (payload: {
    userId: string;
    username: string;
    chatRoomId: string;
    isTyping: boolean;
  }) => void;
  "directChat:readReceipt": (payload: {
    userId: string;
    directChatId: string;
    lastReadMessageId: string;
    lastReadMessageCreatedAt: Date;
  }) => void;
  "chatroom:readReceipt": (payload: {
    userId: string;
    chatRoomId: string;
    lastReadMessageId: string;
    lastReadMessageCreatedAt: Date;
  }) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface InterServerEvents {
  // reserved for inter-server communication (e.g. broadcasting across nodes)
}

// Re-export the module-augmented SocketData so downstream files can import
// it from this module instead of remembering the augmentation lives in
// `types/socket.io.d.ts`.
export type { SocketData };

export type AttachmentPayload = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  width?: number | null;
  height?: number | null;
  thumbnailKey?: string | null;
};

export type MessagePayload = {
  id: string;
  content: string | null;
  senderId: string;
  directChatId: string;
  createdAt: Date;
  messageType: string;
  attachments: AttachmentPayload[];
  isDeleted: boolean;
  editedAt?: Date | null;
  deletedAt?: Date | null;
};

export type MessageEditedPayload = {
  messageId: string;
  directChatId: string;
  content: string | null;
  editedAt: Date | null;
};

export type MessageDeletedPayload = {
  messageId: string;
  directChatId: string;
  deletedAt: Date;
};
