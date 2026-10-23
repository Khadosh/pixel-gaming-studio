import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// The map steps paint whole maps: ~1-4 s alone, past vitest's 5 s when the
// machine is loaded. They get one shared ceiling instead of a timeout per
// test, and the report still flags any of them that crosses the old 5 s.
const MAPSTEPS = "src/headless/mapsteps/**";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: "mapas",
          include: [`${MAPSTEPS}/*.{test,spec}.{ts,tsx}`],
          testTimeout: 30000,
          slowTestThreshold: 5000,
        },
      },
      {
        extends: true,
        test: {
          name: "resto",
          include: ["src/**/*.{test,spec}.{ts,tsx}"],
          exclude: [...configDefaults.exclude, MAPSTEPS],
        },
      },
    ],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
