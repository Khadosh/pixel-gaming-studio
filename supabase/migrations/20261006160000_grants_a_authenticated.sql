-- Las tablas de public las crean las migraciones corriendo como `postgres`, y los
-- privilegios por defecto del esquema public están definidos para `supabase_admin`,
-- no para `postgres`. Resultado: una base levantada desde cero con estas migraciones
-- (supabase start, CI, un entorno nuevo) deja a `authenticated` sin SELECT/INSERT/
-- UPDATE/DELETE, y la app falla con «permission denied for table projects» apenas
-- el usuario intenta crear un proyecto. Encontrado el 6 de octubre de 2026 levantando
-- el stack local.
--
-- Quien decide qué fila ve cada usuario sigue siendo RLS (las políticas de
-- 20260402144703 y 20260922130000, que ya están y no se tocan). Un GRANT abre la
-- tabla al rol; la política decide las filas. Las dos cosas hacen falta.
--
-- `anon` no recibe nada: no hay una sola política para usuarios sin sesión, así que
-- un GRANT a anon abriría la puerta sin que nada del otro lado filtre.
--
-- Idempotente: GRANT sobre un privilegio que ya está no hace nada.

grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.project_sprites to authenticated;

-- user_ai_usage sólo se lee desde el cliente: lo escribe increment_ai_usage(), que
-- es SECURITY DEFINER y está reservada a service_role (20260922120000).
grant select on public.user_ai_usage to authenticated;

-- Y que las tablas que vengan después no repitan el problema.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated;
