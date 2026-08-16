// Initial shell load sequence, factored out of AppShell so the "auth first,
// lists best-effort" behaviour is unit-testable without a React renderer.
//
// Contract: /auth/me resolving is what flips the shell out of the splash. If
// the inbox/rooms/friend-request requests fail (API hiccup, rate-limited
// endpoint, etc.) we still surface the user and only report the list failure —
// never leave the shell stuck on "Loading your conversations…".

import { isAxiosError } from "axios";
import { getErrorMessage } from "./errors";
import type {
  AppUser,
  DMInboxEntry,
  FriendRequest,
  RoomInboxEntry,
} from "../../components/app/types";

export type InitialLoadApi = {
  getMe: () => Promise<AppUser>;
  getDmInbox: () => Promise<{ items: DMInboxEntry[] }>;
  getRooms: () => Promise<{ items: RoomInboxEntry[] }>;
  getFriendRequests: () => Promise<{ items: FriendRequest[] }>;
};

export type InitialLoadCallbacks = {
  onUser: (user: AppUser) => void;
  onLists: (
    dm: DMInboxEntry[],
    rooms: RoomInboxEntry[],
    friendRequests: FriendRequest[],
  ) => void;
  onUnauthorized: () => void;
  onLoadError: (message: string) => void;
  onListError: (message: string) => void;
  onDone: () => void;
};

export async function loadInitialState(
  api: InitialLoadApi,
  cb: InitialLoadCallbacks,
): Promise<void> {
  try {
    cb.onUser(await api.getMe());
  } catch (err) {
    if (isAxiosError(err) && err.response?.status === 401) {
      cb.onUnauthorized();
    } else {
      cb.onLoadError(getErrorMessage(err, "Couldn't reach the server"));
    }
    return;
  }

  try {
    const [dm, rooms, friendRequests] = await Promise.all([
      api.getDmInbox(),
      api.getRooms(),
      api.getFriendRequests(),
    ]);
    cb.onLists(dm.items, rooms.items, friendRequests.items);
  } catch {
    cb.onListError("Couldn't load your conversations");
  } finally {
    cb.onDone();
  }
}
