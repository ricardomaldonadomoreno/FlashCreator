# Revisión de compatibilidad — TikTok Studio y automatización

**Fecha:** 25 de noviembre de 2026

**Producto:** Flash Creator

## Hallazgo y decisión

TikTok confirma que TikTok Studio en navegador permite cargar, programar y editar publicaciones, y que las herramientas para creadores están disponibles para cuentas personales y de empresa. La disponibilidad de funciones puede variar por región y por requisitos de la cuenta [1] [2]. Esto confirma que el flujo nativo de Studio existe, pero no autoriza a Flash Creator a controlarlo automáticamente.

Los términos globales de TikTok prohíben usar scripts automatizados para recopilar información o interactuar con sus servicios. Los términos de EE. UU. también prohíben extraer datos mediante software automatizado salvo aprobación escrita. Como Flash Creator busca distribuir una herramienta comercial, los propios términos globales incluyen restricciones adicionales para uso comercial o incorporación de los servicios a otros productos sin consentimiento expreso [3] [4]. No se puede concluir que un ensayo de solo lectura, un content script o una detección de marcadores visibles quede exento. Por eso no se implementará inspección del DOM, lectura automatizada de estado/campos, ni interacción con TikTok Studio hasta obtener autorización escrita de TikTok o confirmar una vía aprobada aplicable.

La extensión seguirá sin hosts TikTok, `content_scripts`, `scripting`, `tabs` o `cookies`. El ensayo permitido por ahora se limita a preparar y validar datos locales en Flash Creator; el usuario puede abrir Studio y revisar la interfaz manualmente. No se subirán videos, no se pulsará ningún control de TikTok y no se leerá información de una página de TikTok.

## Vía oficial a evaluar por separado

La Content Posting API oficial requiere registrar una aplicación, configurar el producto Direct Post, solicitar aprobación del scope `video.publish` y obtener autorización del creador. TikTok indica que los clientes no auditados publican solo con visibilidad privada; sus directrices añaden límites y requieren una experiencia donde el usuario conserve conocimiento y control explícitos del contenido [5] [6]. También señalan que la API debe servir a una audiencia amplia y no ser únicamente una utilidad interna para las cuentas propias o del equipo. La elegibilidad de Flash Creator debe evaluarse contra esas reglas antes de invertir en la integración.

En las páginas oficiales revisadas no se encontró un parámetro de programación futura en el flujo Direct Post documentado. Por tanto, no se presentará esa API como sustituto probado de la agenda de TikTok Studio. La capacidad de programar mediante API debe confirmarse con documentación oficial vigente y aprobación de TikTok antes de diseñarla.

## Alcance de ensayo por ahora

Se mantiene la biblioteca, la cola, los horarios calculados y las verificaciones puramente locales. Se pueden probar cambios de ruta, formatos y estados con datos simulados propios, sin reproducir selectores ni inspeccionar el DOM real de TikTok. Una validación de integración en cuenta requeriría primero autorización y luego la participación manual del usuario; no se solicitarán credenciales ni se operará su cuenta desde esta fase.

## Referencias

[1]: https://support.tiktok.com/en/using-tiktok/creating-videos/creator-tools-on-tiktok "TikTok — Tools for creators"
[2]: https://support.tiktok.com/en/using-tiktok/creating-videos/tiktok-studio "TikTok — TikTok Studio"
[3]: https://www.tiktok.com/legal/page/global/terms-of-service/en "TikTok — Global Terms of Service"
[4]: https://www.tiktok.com/legal/page/us/terms-of-service/en "TikTok — United States Terms of Service"
[5]: https://developers.tiktok.com/doc/content-posting-api-get-started "TikTok for Developers — Get Started with Direct Post"
[6]: https://developers.tiktok.com/doc/content-sharing-guidelines "TikTok for Developers — Content Sharing Guidelines"
