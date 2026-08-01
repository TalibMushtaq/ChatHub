import type { SocketData } from "socket.io";

export interface ClientToServerEvents {
  "directChat:join": (payload: { directChatId: string }) => void;
  "directChat:leave": (payload: { directChatId: string }) => void;
}

export interface ServerToClientEvents {
  "directChat:joined": (payload: { directChatId: string }) => void;
  "directChat:left": (payload: { directChatId: string }) => void;
  "directChat:error": (payload: { code: string; message: string }) => void;
  "message:new": (payload: MessagePayload) => void;
  "message:edited": (payload: MessageEditedPayload) => void;
  "message:deleted": (payload: MessageDeletedPayload) => void;
  "inbox:update": (payload: { directChatId: string }) => void;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface InterServerEvents {
  // reserved for inter-server communication (e.g. broadcasting across nodes)
}

// Re-export the module-augmented SocketData so downstream files can import
// it from this module instead of remembering the augmentation lives in
// `types/socket.io.d.ts`.
export type { SocketData };

export type MessagePayload = {
  id: string;
  content: string | null;
  senderId: string;
  directChatId: string;
  createdAt: Date;
  messageType: string;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
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
