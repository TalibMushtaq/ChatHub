-- Rename displayname to displayName and make it optional, then add the new
-- optional profile fields (gender enum and date of birth). The rename keeps
-- existing display-name data instead of dropping the old column and recreating it.
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'NON_BINARY', 'OTHER', 'PREFER_NOT_TO_SAY');

ALTER TABLE "User" RENAME COLUMN "displayname" TO "displayName";
ALTER TABLE "User" ALTER COLUMN "displayName" DROP NOT NULL;

ALTER TABLE "User" ADD COLUMN "gender" "Gender";
ALTER TABLE "User" ADD COLUMN "dateOfBirth" TIMESTAMP(3);
