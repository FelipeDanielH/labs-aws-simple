# Scalable Web Platform

Base de monorepo para aplicaciones web con Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query y Zustand.

## Requisitos

- Node.js 20.9 o superior
- pnpm 11.3 o superior

## Comandos

```bash
pnpm dev
pnpm build
pnpm check
```

## Gestión de documentos con Vercel Blob

La administración convierte archivos `.docx` en el navegador y almacena únicamente Markdown, imágenes y manifiestos en Vercel Blob. El DOCX original no se sube.

Configuración necesaria:

1. Crea un Blob Store público en Vercel y conéctalo al proyecto. En los despliegues, Vercel inyectará `BLOB_STORE_ID` y proporcionará `VERCEL_OIDC_TOKEN` como variable de sistema. `BLOB_READ_WRITE_TOKEN` queda como alternativa para desarrollo local sin OIDC.
2. Genera el hash de una contraseña de al menos 12 caracteres:

```powershell
$env:ADMIN_PASSWORD='una-contraseña-larga'; pnpm admin:hash
```

3. Guarda el resultado como `ADMIN_PASSWORD_HASH` en Vercel.
4. Genera el secreto de sesión y guárdalo como `ADMIN_SESSION_SECRET`:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

No uses el prefijo `NEXT_PUBLIC_` para ninguno de estos secretos. Configura rate limiting para `/api/admin/auth/login` cuando el plan de Vercel lo permita.

El flujo administrativo está en `/admin`: importar DOCX, revisar advertencias y preview, guardar borrador, editar Markdown/metadata, publicar, despublicar, enviar a papelera, restaurar y purgar. El catálogo público se sirve en `/laboratorios`.

## Rutas

- `/`: inicio público.
- `/laboratorios`: catálogo público de laboratorios.
- `/admin`: administración protegida por contraseña; no aparece en navegación y usa metadata `noindex`.

## Límites arquitectónicos

- `apps/web/src/app`: composición, rutas y layouts de Next.js.
- `apps/web/src/features`: casos de uso agrupados por capacidad de negocio.
- `apps/web/src/domain`: contratos y reglas puras, sin dependencias del framework.
- `apps/web/src/application`: orquestación de casos de uso y puertos.
- `apps/web/src/infrastructure`: adaptadores para APIs, persistencia y servicios externos.
- `apps/web/src/shared`: utilidades y configuración exclusivas de la aplicación.
- `apps/web/src/shared/providers`: composición de providers transversales como tema, idioma y datos remotos.
- `apps/web/src/shared/store/preferences-store.ts`: preferencias persistentes de idioma; los temas se delegan a `next-themes`.
- `packages/ui`: sistema visual compartido y destino de componentes shadcn/ui.
- `packages/typescript-config` y `packages/eslint-config`: políticas compartidas del workspace.

Las dependencias deben apuntar hacia el dominio: infraestructura y UI pueden depender de contratos internos; el dominio no debe importar Next.js, React ni clientes externos.

## Núcleo del lector Markdown

`apps/web/src/features/markdown-reader` contiene el cargador sin interfaz visual. El dominio define un AST propio; la aplicación valida y carga objetos compatibles con `File`; infraestructura adapta Remark y GFM. El punto de composición público es `createMarkdownLoader()`.

Por defecto acepta `.md` y `.markdown` hasta 2 MiB. La política puede inyectarse sin modificar el caso de uso.

La carpeta `presentation` contiene el workspace de carga y un adaptador visual basado en `react-markdown`. El registro `Components` permite sustituir elementos React sin modificar el loader, el dominio ni la política de seguridad. Una futura biblioteca por categorías debe administrar colecciones y referencias a documentos por encima de esta feature.

El contrato visual soporta CommonMark, GFM y HTML embebido. El pipeline procesa HTML con `rehype-raw`, neutraliza elementos desconocidos o activos, y finalmente aplica una allowlist con `rehype-sanitize`. HTML semántico, tablas, multimedia, formularios inertes, SVG seguro y MathML se visualizan; scripts, estilos activos, objetos y etiquetas desconocidas se presentan como contenido inerte en vez de ejecutarse o desaparecer.

## Búsqueda de contenidos

`apps/web/src/features/content-search` contiene la lógica de búsqueda sin UI. El dominio modela cualquier contenido mediante `SearchableContent`, incluyendo tipo, categorías, jerarquía, etiquetas, orden y atributos extensibles como `deliverable` o `difficulty`.

Los casos de uso dependen de `ContentSearchIndex`; el adaptador local actual usa MiniSearch con índice incremental, normalización de acentos, prefijos, fuzzy matching, boosts, filtros, paginación, orden y facets. `mapMarkdownToSearchableContent()` integra documentos Markdown sin acoplar el motor a su formato. Un adaptador remoto futuro puede implementar el mismo puerto.

## Preferencias visuales

La aplicación incluye ocho temas (`light/dark` en azul, morado, naranja y rosa) y dos idiomas (`es` y `en`). Los temas se expresan mediante tokens semánticos CSS, por lo que los componentes no deben usar colores de marca directamente.
