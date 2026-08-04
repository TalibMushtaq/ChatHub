"use client";

import RoomMessages from "../../../../components/roomComponent/RoomMessages";
import RoomInput from "../../../../components/roomComponent/RoomInput";

export default function RoomChatClient({ chatRoomId }: { chatRoomId: string }) {
  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      <RoomMessages chatRoomId={chatRoomId} />
      <RoomInput chatRoomId={chatRoomId} />
    </div>
  );
}
