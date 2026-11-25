# Plan de desarrollo — Flash Creator

- **Versión:** 1.1
- **Fecha:** 25 de noviembre de 2026
- **Producto:** Flash Creator. **Auto Poster** es solo la extensión de referencia, no el nombre del producto nuevo.
**Repositorio:** `ricardomaldonadomoreno/FlashCreator` (público, autorizado por el propietario).

## Propósito y resultado esperado

Construir Flash Creator como una plataforma web con una extensión/agente local de Chrome que acompañe TikTok Studio en el Side Panel. La extensión conserva en el equipo del usuario los videos, la cola y el historial; la web administra la cuenta, el acceso comercial y las herramientas futuras. Se preservará el comportamiento útil de la extensión de referencia, pero el código del CRX no se copiará como producto terminado ni se ejecutará sin inspección.

## Arquitectura y alcance

- **Web en Vercel:** Next.js App Router para el sitio, panel de cuenta y futuras páginas. Los Route Handlers alojarán endpoints server-side como webhooks. Ningún secreto privado ni clave de proveedor se incluirá en el JavaScript público.
- **Agente de Chrome Manifest V3:** extensión con Side Panel, service worker y scripts limitados a TikTok Studio. La interfaz de configuración quedará junto a la pestaña de TikTok Studio; no se intentará incrustar TikTok en un iframe de la web.
- **Datos locales:** IndexedDB guarda blobs y metadatos en object stores separados; `chrome.storage.local` guarda preferencias pequeñas y estado recuperable. Los videos, captions completos y cookies no se envían al backend en el flujo normal.
- **Backend comercial:** rutas server-side y una base pequeña para identidad verificada, licencia, instalaciones autorizadas, suscripciones y eventos de pago. Se propone Supabase Auth/Postgres para el primer lanzamiento por su integración sencilla con Vercel; no se habilitará acceso real hasta configurar credenciales y políticas. Hotmart será el primer adaptador de pago y se mantendrá una interfaz para agregar otras pasarelas.
- **MVP inicial de este repositorio:** interfaz web de producto y una primera versión del Side Panel que importa videos localmente, mantiene metadatos separados de blobs y genera/visualiza una agenda. El agente no afirmará que ya sube ni programa videos hasta implementar y probar el adaptador de TikTok.
- **Entrega de la extensión:** desarrollo primero como extensión desempaquetada en Chrome; antes de venderla se preparará el paquete y el flujo de distribución de Chrome Web Store.

## Estructura prevista

```text
app/                     Rutas web, layout y APIs server-side de Next.js
components/              Componentes del panel y elementos visuales
lib/                     Funciones server-side, autenticación y adaptadores
extension/
  manifest.json          Manifiesto MV3 y permisos mínimos
  background.js          Coordinación de cola y service worker
  panel.html/js/css      Side Panel que acompaña TikTok Studio
  content/               Adaptador de interfaz de TikTok Studio
  lib/                   IndexedDB local, cola, agenda y resolvedores seguros
  locales/               Textos del agente; i18n cuando el flujo se estabilice
supabase/                Esquema/migraciones del backend, sin datos locales de video
public/                  Iconos y recursos web públicos
scripts/                 Comandos de desarrollo y empaquetado de la extensión
```

## Mejoras comprometidas

### Cola, reintentos, historial y memoria

- Guardar identificador de cola, índice, estado, intento, horario asignado, zona horaria, configuración y resultado. Confirmar el guardado antes y después de las acciones externas importantes.
- Al reiniciar navegador o service worker, reanudar la cola desde su estado persistido. Un video que estaba en envío/confirmación se marca “por verificar” en vez de repetir una acción que quizá ya tuvo éxito.
- Reintentar una o dos veces únicamente fallos recuperables previos al envío final, con pausa incremental. No repetir automáticamente si TikTok recibió la orden de programar y no confirmó el resultado.
- Guardar historial local para advertir de posibles duplicados usando nombre, tamaño y fecha de modificación. Permitir omitir, revisar o volver a programar con decisión del usuario.
- Mantener los blobs de video separados de sus metadatos; listar, ordenar y mostrar elementos sin cargar los blobs. Permitir quitar y reordenar videos.
- Eliminar base64 del intercambio de archivos. Usar fragmentos binarios con confirmación y liberación de referencias; si TikTok exige retener todo el archivo y las pruebas revelan presión de memoria, revisar antes de prometer compatibilidad con videos de cientos de MB.

### Agenda y seguridad del flujo

- Configurar intervalo, ventana horaria permitida, días activos, tope por día y variación aleatoria pequeña.
- Calcular y persistir de antemano los slots de toda la cola, con zona horaria explícita; reanudar sin cambiar horarios automáticamente.
- Validar antes de comenzar que todos los slots respetan ventana, tope y horizonte que permita TikTok Studio para la cuenta. No asumir que un límite visible en una cuenta es universal.
- Antes de confirmar, comprobar que el formulario contiene la fecha y hora solicitadas y que la acción final dice “Programar”; nunca pulsar “Publicar ahora” en una solicitud de futuro.
- Eliminar `cookies` si no hace falta. Probar si `tabs` se puede eliminar o limitar; conservar únicamente los permisos Chrome y hosts que se prueben necesarios. El estado de login se comprobará con marcadores visibles en TikTok Studio.
- El resolvedor de enlaces acepta solo HTTPS/HTTP en hostnames de TikTok incluidos en allowlist, valida cada salto de redirección y rechaza protocolos, dominios y hosts falsificados.

### Producto, acceso y evolución

- Interfaz inicial en español; i18n con `chrome.i18n` y cobertura del motor después de estabilizar selectores y mensajes.
- MVP con `.mp4` y `.mov`, comprobación anticipada de extensión/MIME/tamaño, modo de prueba y vista previa final de cuenta, clips, captions, productos, etiquetas, fechas y advertencias.
- Hotmart enviará eventos a un endpoint server-side que valide `X-HOTMART-HOTTOK`, procese idempotentemente el ID de evento y actualice la política de acceso. Reembolso, contracargo, cancelación y fechas de renovación se tratarán de manera distinta según la política; no se revocará acceso indiscriminadamente ante cualquier cancelación.
- Vincular compra con cuenta mediante correo verificado o código temporal; nunca activar por un email escrito sin verificación. La extensión usará tokens de acceso de vida limitada y no contendrá secretos maestros.
- Persistir solo datos necesarios para cuentas, acceso, instalaciones y recibos de webhooks. No persistir videos ni enviar archivos al backend.
- Añadir después conectores de IA que permitan elegir proveedor/API, con claves guardadas del lado servidor cuando sea posible. Las claves personales utilizadas directamente por el usuario se gestionarán con consentimiento, almacenamiento seguro y límites claros.
- La Content Posting API oficial de TikTok se evaluará por separado. No se asumirá que sustituye TikTok Studio ni que admite programación futura hasta verificar aprobación, scopes y UX requerida.

## Decisiones de diseño

Tres direcciones consideradas: **consola de creador** (0.08), **editorial suave** (0.05) y **estudio neo-dorado** (0.07). Se elige consola de creador porque el producto combina archivos, cola y señales operativas. La paleta fue definida por el usuario: índigo `#0b1325` como base de confianza y foco, celadón `#a9cdbe` para progreso y controles activos, y dorado `#f2b53a` para decisiones, alertas y acciones importantes.

- **Movimiento visual:** consola editorial contemporánea inspirada en herramientas de postproducción, con un lenguaje sobrio y expresivo.
- **Principios:** jerarquía de estado inmediata; medios en primer plano; seguridad antes de automatizar; controles claros y reversibles.
- **Layout:** navegación vertical compacta, espacio de trabajo asimétrico para agenda y cola, y una línea de estado persistente. El Side Panel usa una columna estrecha y prioriza pasos cortos.
- **Motivos distintivos:** marca “FC” como dos marcos de video enlazados; líneas de tiempo finas en celadón; acentos dorados puntuales sobre fondos índigo.
- **Interacción:** cualquier acción que cambie estado muestra alcance, progreso y opción de detener. La programación se presenta primero como vista previa; los estados inciertos se nombran explícitamente.
- **Animación:** transiciones breves de 160–220 ms para paneles, progreso no bloqueante y pequeños desplazamientos de timeline; sin loops decorativos ni animaciones que sugieran que un video se publicó cuando solo se cargó.
- **Tipografía:** sans-serif de sistema para interfaz y cifras, con una serif editorial opcional en titulares cortos. Los metadatos y horarios usan números tabulares.
- **Esencia de marca:** “El estudio local que convierte una cola de videos en una agenda clara para creadores”. Personalidad: enfocado, confiable, ágil.
- **Voz:** concreta, calmada y accionable. Ejemplos: “Tu agenda, antes de subir.” y “Revisa cada horario; Flash Creator conserva tu cola en este equipo.”
- **Wordmark:** monograma geométrico “FC” construido con dos marcos verticales de video y una línea de timeline; no depender de texto de fuente predeterminada para el símbolo.
- **Color insignia:** celadón `#a9cdbe` como señal propia de preparación y continuidad sobre la base índigo.

## Fases

1. **Base del producto:** estructura Next.js y agente lateral, paleta, importación local, metadatos/blobs separados y agenda preliminar.
2. **Núcleo robusto:** persistencia de cola e índice, historial, reintentos seguros, transferencia binaria, reordenamiento y cálculo completo de horarios.
3. **Adaptador TikTok Studio:** conservar el flujo de la referencia, detectar cambios de pantalla, login, prueba sin publicar, confirmación rigurosa de hora y acción final.
4. **Cuenta y pagos:** login verificado, política de acceso, esquema de base, token temporal de extensión, webhook Hotmart idempotente y adaptador de pagos.
5. **Beta y distribución:** validación con cuentas de prueba, reinicios, red irregular, cuotas locales, zonas horarias y límites; preparar privacidad, soporte y distribución Web Store.
6. **Evolución:** localización, formatos nuevos como `.webm` solo tras comprobar compatibilidad, integraciones de IA configurables y otros proveedores de pago.

## Riesgos y límites

- Cambios en TikTok Studio pueden invalidar selectores; el adaptador debe ser reemplazable y fallar con explicación, no hacer clic a ciegas.
- Una confirmación perdida después de enviar es un riesgo de duplicación; el resultado debe quedar “por verificar”.
- La PC y Chrome deben seguir activos mientras el agente carga y programa. Cuando TikTok confirme que cada publicación futura quedó programada en sus servidores, apagar la PC no debe cancelar esas publicaciones ya aceptadas.
- La automatización depende de la UI autorizada al usuario y puede cambiar por cuenta, país o versión. No prometer compatibilidad universal sin pruebas.
- El control de licencia protege el servicio, pero no vuelve imposible inspeccionar/modificar una extensión ejecutada localmente; la autoridad de acceso y secretos permanecen server-side.

## Referencias técnicas consultadas

- [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Next.js en Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs)
- [TikTok Content Posting API](https://developers.tiktok.com/doc/content-posting-api-get-started)
- [Hotmart Purchase Webhook](https://developers.hotmart.com/docs/en/2.0.0/webhook/purchase-webhook/)
