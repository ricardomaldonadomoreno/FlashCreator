# Habilitar TikTok Content Posting API para Flash Creator

**Revisado:** 26 de noviembre de 2026  
**Estado:** investigación documental; no se ha creado ni configurado una app en TikTok for Developers.

## Conclusión para Flash Creator

La API oficial permite iniciar una publicación directa desde una aplicación y transferir a TikTok un video que está en el dispositivo del creador mediante `FILE_UPLOAD`. Así, Flash Creator no necesita guardar el archivo de video en su propio backend. TikTok sí recibe y procesa el video como parte de la publicación. Para archivos alojados en servidores, el método recomendado es `PULL_FROM_URL`, que requiere verificar la propiedad del dominio o prefijo URL [7] [8] [10].

Hay una diferencia importante con la arquitectura “todo local”: el intercambio OAuth y la gestión de access/refresh tokens deben ocurrir en el servidor, ya que TikTok exige proteger el `client_secret` y no exponerlo en el frontend. Por tanto, el diseño compatible sería mantener los videos en el equipo y transferirlos directamente a TikTok, pero usar un backend pequeño para callback OAuth y custodia/renovación de tokens [5] [6]. No se debe poner el secreto de TikTok en la extensión ni en JavaScript entregado al navegador.

La API documentada no ofrece un campo de fecha futura para agendar una publicación. Direct Post inicia una publicación cuando el usuario confirma y la app la envía. La otra modalidad, Upload API, deja un borrador en TikTok y exige que el usuario abra la notificación y termine la publicación en TikTok. Ninguna de las dos modalidades equivale a programar automáticamente una publicación para una fecha posterior en TikTok Studio [8] [11] [12]. La programación futura queda como una necesidad sin solución oficial confirmada en la documentación consultada.

## Pasos en TikTok for Developers

1. **Crear la cuenta y registrar la aplicación.** Inicia sesión en TikTok for Developers, crea o únete a una organización propietaria (TikTok lo recomienda para integraciones reales) y ve a **Manage apps → Connect an app**. Registra Flash Creator bajo la organización y completa nombre, ícono, descripción, categoría y plataforma Web con el dominio del producto [1].

2. **Completar el sitio público.** Antes de revisión, el sitio debe estar desarrollado y mostrar enlaces activos y visibles a los Términos de Servicio y la Política de Privacidad. TikTok indica que no acepta para revisión una landing page o una página de inicio de sesión como sitio oficial, y que una app todavía en desarrollo o pruebas no será aprobada [2].

3. **Agregar los productos.** En la página de la app, agrega **Login Kit** y **Content Posting API**. En la configuración del Content Posting API, habilita **Direct Post**. En Login Kit Web registra la URL de callback OAuth: debe ser HTTPS, absoluta, estática y coincidir exactamente con la usada en el flujo de autorización [1] [5] [7].

4. **Solicitar los scopes necesarios.** En **Scopes → Add Scopes**, solicita `video.publish` para Direct Post. Si también se desea la alternativa que carga un borrador para terminarlo manualmente, la referencia de Upload API usa `video.upload`. Solicitar/aprobar un scope no autoriza por sí mismo una cuenta: cada creador debe conceder su consentimiento OAuth para ese scope [4] [7] [11].

5. **Probar en Sandbox.** Crea un Sandbox desde la página de la app, agrega productos/configuración y añade hasta 10 cuentas propias como target users. Sandbox permite probar la integración antes de enviar la app a revisión, pero no habilita publicaciones de videos públicos [3]. Esto no elimina la posterior revisión de producción ni sirve para demostrar que la app puede publicar públicamente.

6. **Enviar a revisión de producción.** Completa App Review explicando cómo cada producto y scope mejora el flujo. Adjunta al menos un video de demostración completo, actualizado y grabado en el sitio real de Flash Creator; el límite documentado es cinco videos de hasta 50 MB cada uno. Para una primera revisión, TikTok pide demostrar el flujo con Sandbox y mostrar claramente la interfaz, las interacciones y todos los productos/scopes solicitados [1] [2]. Si aprueba, la app pasa a Live; los cambios posteriores también requieren revisión [1].

La aprobación no está garantizada. TikTok exige que la aplicación sirva a una audiencia amplia y no sea solo una utilidad privada para cuentas propias o del equipo. Flash Creator tendría que presentarse y funcionar como producto para creadores independientes en general. Su elegibilidad se debe evaluar con la descripción, el sitio y el flujo reales; no basta con activar un interruptor del portal [2] [10].

## Qué flujo tendría que implementar Flash Creator

El usuario conecta su cuenta mediante Login Kit. TikTok devuelve un código a la URL callback registrada; un servidor de Flash Creator valida `state` contra CSRF y canjea el código por tokens. TikTok documenta una vida típica de dos horas para el access token y 180 días para el refresh token, y exige reemplazar el refresh token cada vez que se renueva [5] [6].

Antes de renderizar la pantalla de publicación, Flash Creator consulta `creator_info/query` con scope `video.publish`. Debe mostrar el nombre de la cuenta destino, usar las opciones de privacidad devueltas sin preseleccionar una, comprobar el máximo de duración del video y respetar las restricciones devueltas para comentarios, Duet y Stitch [9] [10].

La pantalla debe mostrar una vista previa del video y permitir revisar/editar título y ajustes. El creador elige expresamente la privacidad y las opciones disponibles, confirma la declaración de uso de música y, cuando corresponda, completa la divulgación comercial requerida. La app solo puede empezar a transferir el video después del consentimiento explícito del usuario. También debe mostrar el estado de procesamiento/publicación, mediante consulta de estado o webhooks, e indicar que TikTok puede tardar unos minutos en hacerlo visible [10].

Con un video local, el cliente inicia `/v2/post/publish/video/init/` con `source=FILE_UPLOAD`, el tamaño y los datos de bloques; TikTok devuelve `publish_id` y `upload_url`. Después el cliente envía los bytes del archivo al `upload_url` por PUT y consulta el estado del `publish_id`. El archivo no necesita pasar por el backend de Flash Creator. El `upload_url` caduca en una hora. `PULL_FROM_URL` solo corresponde cuando el archivo ya está en almacenamiento de servidor bajo un dominio o prefijo verificado [8] [10].

## Límites que condicionan las pruebas y el lanzamiento

Mientras el cliente Direct Post no esté auditado, TikTok limita las publicaciones a cuentas configuradas como privadas y a visibilidad `SELF_ONLY`; la guía limita a cinco usuarios que publiquen en una ventana de 24 horas. Si se quiere eliminar la restricción de privacidad, hay que completar la auditoría de API. Incluso una app auditada sigue sujeta a topes por cliente y por creador; TikTok describe un límite que suele rondar 15 publicaciones por creador en 24 horas, variable y compartido entre clientes API [8] [10].

La alternativa `video.upload` requiere `video.upload` y deja el contenido como borrador para que el usuario continúe desde una notificación de la bandeja de entrada de TikTok. No publica ni programa por sí sola. Esa ruta también documenta un máximo de cinco cargas pendientes por usuario en cualquier periodo de 24 horas [11] [12].

## Siguiente paso recomendado

Antes de escribir una integración de producción, conviene que Ricardo registre la app y configure Login Kit, Content Posting API, Direct Post y el Sandbox en su Developer Portal. Después podemos hacer una prueba técnica de extremo a extremo con un archivo elegido localmente y una cuenta target autorizada, sin incrustar secretos en la extensión. La prueba debe confirmar por separado OAuth, transferencia binaria directa y consulta de estado. Solo entonces tendría sentido preparar una solicitud de revisión con la demo del producto real.

Si el requisito imprescindible sigue siendo programar la fecha y hora desde Flash Creator y publicar automáticamente después, hay que tratarlo como un bloqueo de producto: la documentación oficial examinada no ofrece ese agendamiento. No se debe reemplazar ese vacío con automatización de TikTok Studio sin autorización expresa de TikTok.

## Referencias

[1]: https://developers.tiktok.com/doc/getting-started-create-an-app "TikTok for Developers — Register Your App"
[2]: https://developers.tiktok.com/doc/app-review-guidelines "TikTok for Developers — App Review Guidelines"
[3]: https://developers.tiktok.com/doc/add-a-sandbox/ "TikTok for Developers — Add a Sandbox"
[4]: https://developers.tiktok.com/doc/scopes-overview "TikTok for Developers — Scopes Overview"
[5]: https://developers.tiktok.com/doc/login-kit-web "TikTok for Developers — Login Kit for Web"
[6]: https://developers.tiktok.com/doc/oauth-user-access-token-management "TikTok for Developers — Manage OAuth Access Tokens"
[7]: https://developers.tiktok.com/doc/content-posting-api-get-started "TikTok for Developers — Get Started with Direct Post"
[8]: https://developers.tiktok.com/doc/content-posting-api-reference-direct-post "TikTok for Developers — Direct Post API Reference"
[9]: https://developers.tiktok.com/doc/content-posting-api-reference-query-creator-info "TikTok for Developers — Query Creator Info"
[10]: https://developers.tiktok.com/docs/pt-BR/content-sharing-guidelines "TikTok for Developers — Content Sharing Guidelines"
[11]: https://developers.tiktok.com/doc/content-posting-api-reference-upload-video "TikTok for Developers — Upload Video API Reference"
[12]: https://developers.tiktok.com/products/content-posting-api "TikTok for Developers — Content Posting API"
