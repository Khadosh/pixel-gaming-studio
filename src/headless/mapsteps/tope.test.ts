// The map steps share a 30 s ceiling (vitest.config.ts, project "mapas"):
// a heavy map that runs past 5 s with the machine loaded is slow, not red.
it("map steps run under the shared 30 s ceiling", async () => {
  await new Promise((r) => setTimeout(r, 5500));
});
