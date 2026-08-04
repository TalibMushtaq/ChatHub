import RoomChatClient from "./RoomChatClient";

export default async function RoomChatPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const { roomId } = await params;

  return <RoomChatClient chatRoomId={roomId} />;
}
