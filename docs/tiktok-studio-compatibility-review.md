# Revisión de compatibilidad — TikTok Studio y automatización

**Fecha:** 25 de noviembre de 2026

**Producto:** Flash Creator

## Hallazgo y decisión del producto

TikTok confirma que TikTok Studio en navegador permite cargar, programar y editar publicaciones, y que las herramientas para creadores están disponibles para cuentas personales y de empresa. La disponibilidad de funciones puede variar por región y por requisitos de la cuenta [1] [2]. Esto confirma que el flujo nativo de Studio existe, pero no autoriza a Flash Creator a controlarlo automáticamente.

Los términos globales de TikTok prohíben usar scripts automatizados para recopilar información de los servicios o interactuar con ellos. Los términos de EE. UU. revisados describen una restricción centrada en la extracción automatizada de datos; esa diferencia no permite generalizar una conclusión igual para todas las regiones [3] [4]. El proyecto no afirma que el uso local, la ausencia de extracción de datos ni la confirmación manual constituyan autorización de TikTok.

La decisión actual del propietario es construir una beta supervisada que usa el navegador y la sesión iniciada por el usuario, sin la Content Posting API y sin enviar archivos al backend de Flash Creator. El acceso será bajo demanda a la pestaña activa, con permisos temporales mínimos y limitado a la ruta de carga. La beta detendrá el flujo antes de pulsar la acción final de programar, para que el usuario revise y confirme manualmente. Este alcance reduce el acceso técnico, pero no cambia por sí solo el significado de los términos aplicables ni equivale a autorización comercial.

## Vía oficial a evaluar por separado

La Content Posting API oficial requiere registrar una aplicación, configurar el producto Direct Post, solicitar aprobación del scope `video.publish` y obtener autorización del creador. TikTok indica que los clientes no auditados publican solo con visibilidad privada; sus directrices añaden límites y requieren una experiencia donde el usuario conserve conocimiento y control explícitos del contenido [5] [6]. También señalan que la API debe servir a una audiencia amplia y no ser únicamente una utilidad interna para las cuentas propias o del equipo. La elegibilidad de Flash Creator debe evaluarse contra esas reglas antes de invertir en la integración.

En las páginas oficiales revisadas no se encontró un parámetro de programación futura en el flujo Direct Post documentado. Por tanto, no se presentará esa API como sustituto probado de la agenda de TikTok Studio. La capacidad de programar mediante API debe confirmarse con documentación oficial vigente y aprobación de TikTok antes de diseñarla.

## Alcance de implementación acordado

La primera etapa conecta a la página de carga exacta a petición del usuario y reporta solo si el adaptador y los controles de carga están disponibles. Las siguientes etapas pueden transferir un archivo de la biblioteca local y preparar los campos; cualquier envío debe estar indicado claramente en el panel y confirmado por el usuario. La programación final queda en manos del usuario. El código no solicitará contraseñas ni cookies, no inspeccionará otras áreas de la cuenta y no ocultará que automatiza controles de la página. La eventual distribución comercial sigue sujeta a los términos aplicables y a cualquier autorización que TikTok determine necesaria.

## Referencias

[1]: https://support.tiktok.com/en/using-tiktok/creating-videos/creator-tools-on-tiktok "TikTok — Tools for creators"
[2]: https://support.tiktok.com/en/using-tiktok/creating-videos/tiktok-studio "TikTok — TikTok Studio"
[3]: https://www.tiktok.com/legal/page/global/terms-of-service/en "TikTok — Global Terms of Service"
[4]: https://www.tiktok.com/legal/page/us/terms-of-service/en "TikTok — United States Terms of Service"
[5]: https://developers.tiktok.com/doc/content-posting-api-get-started "TikTok for Developers — Get Started with Direct Post"
[6]: https://developers.tiktok.com/doc/content-sharing-guidelines "TikTok for Developers — Content Sharing Guidelines"
