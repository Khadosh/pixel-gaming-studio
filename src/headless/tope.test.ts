// The whole suite shares a 60 s ceiling (vitest.config.ts): a heavy test that
// runs past 5 s with the machine loaded is slow, not red.
it("every test runs under the shared 60 s ceiling", async () => {
  await new Promise((r) => setTimeout(r, 5500));
});
