// Pasos de ejemplo para `--pasos=`: aprieta GUARDAR en el editor de sprites. Lo
// que guarda sale en <salida>.escrito.json: el PATCH a project_sprites, y otro
// más del autoguardado, que salta 3 s después de que cambia el asset.
export default async function (page) {
  await page.getByRole('button', { name: /GUARDAR/ }).click();
  await page.waitForTimeout(800);
}
