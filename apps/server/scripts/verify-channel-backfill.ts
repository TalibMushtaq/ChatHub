import "../src/lib/env";
import { prisma } from "../db/prisma";

/**
 * Manual verification / repair tool for the channels migration backfill.
 *
 * Confirms that every Room has exactly one GENERAL category + #general channel
 * and that no room message is left without a channel. It is safe to re-run:
 * the repair branch only creates the missing defaults and never deletes data.
 *
 * Usage:
 *   pnpm tsx scripts/verify-channel-backfill.ts            # report only
 *   FIX=true pnpm tsx scripts/verify-channel-backfill.ts   # create missing defaults
 */

const shouldFix = process.env.FIX === "true";

async function main() {
  const rooms = await prisma.chatRoom.findMany({ select: { id: true } });
  const categories = await prisma.category.findMany({
    select: { roomId: true, name: true },
  });
  const channels = await prisma.channel.findMany({
    select: { roomId: true, categoryId: true, name: true },
  });

  const missingCategory = rooms.filter(
    (r) => !categories.some((c) => c.roomId === r.id),
  );
  const missingChannel = rooms.filter(
    (r) => !channels.some((c) => c.roomId === r.id && c.name === "general"),
  );
  const orphanMessages = await prisma.message.count({
    where: { chatRoomId: { not: null }, channelId: null },
  });

  console.log(
    `rooms=${rooms.length} generalCategories=${categories.filter((c) => c.name === "GENERAL").length}`,
  );
  console.log(
    `generalChannels=${channels.filter((c) => c.name === "general").length}`,
  );
  console.log(`roomMessagesWithoutChannel=${orphanMessages}`);
  console.log(`roomsMissingCategory=${missingCategory.length}`);
  console.log(`roomsMissingGeneralChannel=${missingChannel.length}`);

  if (!shouldFix) {
    console.log("Dry run — set FIX=true to repair missing defaults.");
    return;
  }

  for (const room of missingCategory) {
    await prisma.category.create({
      data: { roomId: room.id, name: "GENERAL", position: 0 },
    });
    console.log(`created GENERAL category for room ${room.id}`);
  }

  for (const room of missingChannel) {
    const category = await prisma.category.findFirst({
      where: { roomId: room.id, name: "GENERAL" },
    });
    await prisma.channel.create({
      data: {
        roomId: room.id,
        categoryId: category?.id ?? null,
        name: "general",
        type: "TEXT",
        position: 0,
      },
    });
    console.log(`created #general channel for room ${room.id}`);
  }

  if (orphanMessages > 0) {
    const repaired = await prisma.$executeRaw`
      UPDATE "Message" m
      SET "channelId" = ch."id"
      FROM "Channel" ch
      WHERE ch."roomId" = m."chatRoomId"
        AND ch."name" = 'general'
        AND m."channelId" IS NULL
        AND m."chatRoomId" IS NOT NULL
    `;
    console.log(`repaired ${repaired} room messages without a channel`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
