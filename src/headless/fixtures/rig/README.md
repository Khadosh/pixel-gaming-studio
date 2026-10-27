# El rig de Tomás (Khadosh/pixel-gaming-studio#60)

Copiados de El estudio (`art/voxel/gente/persona/`, `art/paleta.pss.json`) el 27 oct 2026: los modelos de
Tomás (`persona`) mirando a `yp` que dibujó a mano `art/voxel/gente/armar_persona.py`, y su paleta.

`persona.rig.json` es su esqueleto calcado de las medidas de ese script (`CUERPO` y lo suyo, `ZANCADAS`,
`SUBE`, `VAIVEN`, `BRAZO`, `INCLINA`): `voxelrig.test.ts` exige que `parada`, `camina` ×4 y `corre` ×4
salgan del rig iguales celda por celda y píxel por píxel. Las demás poses del rig (`teclea`, `sentada`,
`mano_parada`, `dibuja`, `lleva`) son esas mismas poses dichas como datos, para la lámina
(`docs/rig/lamina.png`), y `senala` la primera que no existía.

Las piernas llevan `stretch: 3`: la carrera dibujada acorta la pantorrilla hasta 2,8 unidades.
