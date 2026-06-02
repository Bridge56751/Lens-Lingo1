import { defineConfig } from "drizzle-kit";
import path from "path";
import { getConnectionString } from "./src/connection";

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: getConnectionString(),
  },
});
