import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// One ceiling for the whole suite: 60 s. What draws a whole map, a whole rig
// or starts the binary takes 1-4 s alone, 5-18 s with other suites running
// beside it (load 30 to 100 on 8 cores) and up to 30 s at load 230-290. At
// vitest's 5 s that was red one test at a time, each with its issue (#35,
// Khadosh/estudio#241), and a red from the load teaches to ignore red. The
// report still flags, with its time, any test past the old 5 s. A test that
// hangs is still red.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    testTimeout: 60000,
    slowTestThreshold: 5000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
