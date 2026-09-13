import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: [
    "./db/control-plane-schema.js",
    "./db/tenant-schema.js"
  ],
  out: "./load/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL
  }
});