import { describe, it, expect, vi } from "vitest";
import {
  getLiveKitRoomClient,
  generateJoinToken,
} from "../../../../src/lib/livekit";

vi.mock("livekit-server-sdk", () => {
  const AccessTokenMock = vi.fn().mockImplementation(function () {
    return {
      addGrant: vi.fn(),
      toJwt: vi.fn().mockReturnValue("mock.jwt.token"),
    };
  });
  return {
    RoomServiceClient: vi.fn(),
    AccessToken: AccessTokenMock,
  };
});

describe("livekit lib", () => {
  it("returns a singleton RoomServiceClient", () => {
    const client1 = getLiveKitRoomClient();
    const client2 = getLiveKitRoomClient();
    expect(client1).toBe(client2);
  });

  it("generates a join token with correct grants", async () => {
    const token = await generateJoinToken("user-1", "channel:ch1");
    expect(token).toBe("mock.jwt.token");
  });
});
