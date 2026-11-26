# Flash Creator

Flash Creator es el producto nuevo. **Auto Poster** es únicamente la extensión de referencia. Este repositorio público contiene una plataforma web y un agente local de Chrome en desarrollo.

## Primer incremento

- La web usa Next.js App Router y está preparada para desplegarse en Vercel.
- `extension/` contiene una extensión Manifest V3 con Side Panel. En esta versión permite agregar `.mp4`/`.mov` de hasta 2 GiB por archivo, guardar los archivos en IndexedDB con metadatos separados de los blobs, ordenar/quitar clips y preparar una vista previa de agenda.
- La extensión usa `activeTab` y `scripting` para una conexión temporal a la pestaña activa solo cuando el usuario lo solicita. No pide `cookies`, `tabs` ni hosts TikTok persistentes. La conexión inicial no sube ni programa publicaciones; la transferencia local y el llenado supervisado del formulario se desarrollarán por etapas.
- Los archivos no se envían al servidor. La integración de acceso, base comercial y webhooks de Hotmart se implementará en una fase posterior con secretos solo en el servidor.

## Alcance de TikTok

La extensión no usa la API de TikTok. La beta supervisada se conectará, a petición del usuario, con la página de carga de TikTok Studio en la pestaña activa; el usuario revisará el formulario y confirmará manualmente la programación. La conexión, carga y automatización se añadirán en etapas distintas. Esto no significa que TikTok haya aprobado el uso. La decisión y las fuentes están en [la evaluación de compatibilidad con TikTok](docs/tiktok-studio-compatibility-review.md).

## Requisitos y comandos

Se requiere Node.js `>=22.13.0` y pnpm `11.25.0`.

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm extension:check
pnpm build
```

## Cargar el agente en Chrome para desarrollo

1. Abre `chrome://extensions` en Chrome.
2. Activa **Modo de desarrollador**.
3. Elige **Cargar descomprimida** y selecciona la carpeta `extension/`.
4. Pulsa el icono de Flash Creator para abrir el Side Panel.
5. Agrega clips de prueba y calcula la vista previa de horarios. En esta versión todavía no se transfieren videos a TikTok.
6. Para probar el puente, abre TikTok Studio, cambia a esa pestaña y abre Flash Creator desde el icono de extensiones; pulsa **Comprobar pestaña activa**. La prueba solo comprueba la ruta y los controles de archivo; no carga ni programa.

La versión actual está en fase local de desarrollo. No redistribuir como versión comercial ni confiar en su agenda como límite detectado automáticamente: el horizonte que muestra es configurable y debe verificarse en TikTok Studio.

## Privacidad de archivos

El agente usa IndexedDB local para guardar blobs y metadatos en stores separados. El flujo web y el backend no reciben los videos. No se deben añadir archivos `.crx`, perfiles de navegador, llaves privadas, tokens ni `.env` al repositorio. `.env.example` contiene nombres de variables sin valores secretos.

## Despliegue

En Vercel, importa `ricardomaldonadomoreno/FlashCreator` y conserva la raíz del proyecto como raíz del repositorio. No configures variables de Supabase ni Hotmart hasta que esos endpoints y la política de acceso estén implementados.
