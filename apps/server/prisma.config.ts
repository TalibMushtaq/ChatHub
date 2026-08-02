import "./src/lib/env";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "db/schema.prisma",

  datasource: {
    url: process.env.DATABASE_URL,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },

  migrations: {
    path: "db/migrations",
  },
});
