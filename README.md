# Flash Creator

Flash Creator es el producto nuevo. **Auto Poster** es únicamente la extensión de referencia. Este repositorio público contiene una plataforma web y un agente local de Chrome en desarrollo.

## Primer incremento

- La web usa Next.js App Router y está preparada para desplegarse en Vercel.
- `extension/` contiene una extensión Manifest V3 con Side Panel. Permite agregar `.mp4`/`.mov` de hasta 2 GiB por archivo, guardarlos en IndexedDB con metadatos separados, ordenar/quitar clips y preparar una vista previa de agenda.
- La extensión usa `activeTab` y `scripting` para conectarse temporalmente a la pestaña activa cuando el usuario lo solicita. No pide `cookies`, `tabs` ni hosts TikTok persistentes. Después de una confirmación por video, un puente local entrega fragmentos Blob al control de carga de TikTok Studio; no usa Base64 ni un backend de Flash Creator.
- Los archivos no se envían al servidor. La integración de acceso, base comercial y webhooks de Hotmart se implementará en una fase posterior con secretos solo en el servidor.

## Alcance de TikTok

La extensión no usa la API de TikTok. La beta supervisada se conecta, a petición del usuario, con la ruta de carga de TikTok Studio en la pestaña activa. El usuario confirma cada transferencia y revisa allí el resultado. Flash Creator no pulsa Programar; esa acción sigue siendo manual. Esto no significa que TikTok haya aprobado el uso. La decisión y las fuentes están en [la evaluación de compatibilidad con TikTok](docs/tiktok-studio-compatibility-review.md).

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
5. Agrega un clip no crítico y calcula la vista previa de horarios.
6. Abre TikTok Studio en `https://www.tiktok.com/tiktokstudio/upload`, cambia a esa pestaña y abre Flash Creator desde el icono de extensiones. Pulsa **Comprobar pestaña activa**.
7. En la fila del clip de prueba, pulsa **Enviar video a TikTok Studio** y confirma el nombre/tamaño. Espera a que termine el progreso; luego comprueba manualmente la pestaña de TikTok Studio. La página puede iniciar la carga al recibir el archivo. Flash Creator no pulsa **Programar**.

La versión actual está en fase local de desarrollo. No redistribuir como versión comercial ni confiar en su agenda como límite detectado automáticamente: el horizonte que muestra es configurable y debe verificarse en TikTok Studio.

## Privacidad de archivos

El agente usa IndexedDB local para guardar blobs y metadatos en stores separados. El flujo web y el backend no reciben los videos. La transferencia de prueba pasa fragmentos Blob por un MessageChannel privado y los conserva en la pestaña para preparar el control de archivo; el comportamiento de carga de TikTok y la presión de memoria con clips grandes aún deben validarse en Chrome con videos no críticos. Si se corta el canal, el estado queda fallido o por verificar y no se reenvía automáticamente. No se deben añadir archivos `.crx`, perfiles de navegador, llaves privadas, tokens ni `.env` al repositorio. `.env.example` contiene nombres de variables sin valores secretos.

## Despliegue

En Vercel, importa `ricardomaldonadomoreno/FlashCreator` y conserva la raíz del proyecto como raíz del repositorio. No configures variables de Supabase ni Hotmart hasta que esos endpoints y la política de acceso estén implementados.
