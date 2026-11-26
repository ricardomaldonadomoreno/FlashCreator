# Diseño de transferencia local a TikTok Studio

## Decisión

El transporte normal de `chrome.runtime.sendMessage`, `tabs.sendMessage`, `Port.postMessage` de la extensión y `scripting.executeScript({ args })` usa mensajes JSON o argumentos serializables como JSON. Chrome fija un máximo de 64 MiB por mensaje. Por eso Flash Creator no envía el video por esas APIs ni lo convierte en Base64.

La transferencia de prueba usa un iframe estático de la extensión, permitido solo para la ruta de carga de TikTok Studio, dentro de un Shadow DOM cerrado creado por el adaptador. El content script crea un `MessageChannel` y envía uno de sus puertos directamente al iframe con `window.postMessage` y un origen de destino exacto. El iframe valida que el emisor sea su ventana padre y que el origen sea `https://www.tiktok.com`; también exige un nonce aleatorio. La página no recibe el puerto por un mensaje global, ni puede acceder al iframe a través del DOM ordinario.

El iframe de extensión lee el blob y sus metadatos de IndexedDB local. Los fragmentos se obtienen con `Blob.slice()` y pasan por el puerto con confirmación de cada fragmento. El content script los mantiene como `Blob` y solo crea un `File` para asignarlo al control de archivo seleccionado. No se llama a la API de TikTok ni a un servidor de Flash Creator. Asignar el archivo al input puede hacer que TikTok Studio comience una carga; por eso la extensión solicita confirmación expresa justo antes de empezar y persiste un estado seguro antes de asignarlo.

## Limitaciones comprobadas

La documentación de Chrome indica que su mensajería de extensiones usa serialización JSON y que el límite por mensaje es 64 MiB [1]. En contraste, el `MessagePort` de la plataforma web usa Structured Clone y documenta `Blob` y `File` entre los tipos clonables [2] [3]. El transporte no depende de que `Blob` sea transferible: cada fragmento se clona como objeto `Blob`, no como `ArrayBuffer` completo ni como texto Base64.

Un ensayo local en Chromium 156 verificó que un `File` de 2 MiB enviado por `MessageChannel` conserva nombre, tamaño, tipo y fecha, y que `DataTransfer` puede asignarlo a `input.files`. Esto no prueba el comportamiento de la interfaz de TikTok ni garantiza el uso de memoria en videos de cientos de MiB. La extensión informa progreso por fragmentos, aplica ACK y timeout, y se detiene si la pestaña o el canal dejan de responder. Los videos grandes todavía requieren prueba manual con clips no críticos.

El patrón del iframe privado con token y canal se inspira en una discusión pública de ejemplos de Chrome, no en una API oficial de extensión ni en una garantía de compatibilidad de Chrome [4]. La página no debe recibir datos de cuenta ni sesión; el adaptador solo inspecciona controles de archivo y trabaja con el video que el usuario elige enviar. Si el iframe no puede cargarse, el origen no coincide, hay más de un control de archivo candidato o falla una confirmación, la acción se detiene.

## Referencias

[1]: https://developer.chrome.com/docs/extensions/develop/concepts/messaging "Chrome extension messaging and serialization"
[2]: https://developer.mozilla.org/en-US/docs/Web/API/MessagePort/postMessage "MessagePort postMessage"
[3]: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm "Structured clone algorithm"
[4]: https://github.com/GoogleChrome/chrome-extensions-samples/issues/766#issuecomment-1295767046 "Chrome extensions sample discussion on private MessagePort bridges"
