import { defineConfig } from "vite";

// BASE_PATH is set in GitHub Actions so the site works under /sigue-mirada/.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  build: {
    target: "es2022",
  },
});
