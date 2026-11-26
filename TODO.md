# TODO — Flash Creator

El estado se marca por resultado entregable. La primera versión web y el Side Panel son etapas distintas: no se considera terminada la automatización real de TikTok hasta que exista adaptación y evidencia con cuenta de prueba.

## 1. Plataforma web Vercel y panel de producto — En progreso

- La web será la puerta de entrada a Flash Creator para cuenta, acceso, configuración, tutoriales y futuras herramientas.
- El usuario podrá abrir TikTok Studio en Chrome y ver los controles del agente en el Side Panel en la misma ventana; TikTok no se incrustará en un iframe de Flash Creator.
- La interfaz inicial estará en español y usará índigo `#0b1325`, celadón `#a9cdbe` y dorado `#f2b53a`.
- El estado del agente distinguirá lo que está conectado, configurado, ejecutándose, programado, fallido y pendiente de verificación; la interfaz no afirmará que una publicación terminó si solo se importó o cargó un archivo.

## 2. Biblioteca local de videos — En progreso

- Los videos permanecen en el equipo del usuario; no se suben ni guardan en el backend durante el flujo normal.
- La base local guarda blobs de video y metadatos por separado; listar, ordenar y mostrar elementos no recupera todos los blobs.
- La cola permite seleccionar `.mp4` y `.mov`, validar extensión, MIME y tamaño, reordenar y quitar elementos.
- Los videos permanecen en el equipo hasta que el usuario los borre o reemplace.
- La biblioteca puede manejar errores de cuota de IndexedDB y avisar cuando un archivo desaparece.
- Antes de importar, se avisa de posibles duplicados por nombre normalizado, tamaño y fecha de modificación; el usuario puede conservar las copias u omitirlas.

## 3. Agenda local completa y revisable — En progreso

- La agenda admite intervalo, ventana horaria permitida, días activos, tope diario y variación aleatoria pequeña y configurable.
- Se generan de antemano los horarios para toda la cola; cada horario conserva zona horaria e instante inequívoco y no cambia al reanudar salvo que el usuario solicite recalcular.
- Antes de iniciar, se valida que todos los horarios respeten ventana, días activos, tope y horizonte máximo que permite TikTok Studio para esa cuenta.
- Si el último horario excede el límite conocido o detectado, el inicio queda bloqueado antes de subir el primer video y se ofrecen recalcular la cola o cancelar.
- La vista previa muestra los videos, captions, productos, etiquetas, fecha/hora y zona horaria, junto con advertencias de posibles duplicados.

## 4. Cola recuperable, reintentos seguros e historial local — En progreso

- Se persisten localmente el ID de cola, índice, estado por video, número de intento, horario asignado, zona horaria, configuración y último resultado; los cambios relevantes se guardan antes y después de cada acción externa.
- Al reiniciar el navegador o service worker, se recupera la cola en el índice y horario guardados.
- Si un video estaba en envío o confirmación al cerrarse Chrome, se marca “por verificar”; no se vuelve a enviar automáticamente una acción cuyo resultado puede haber sido exitoso.
- Los errores recuperables ocurridos antes del envío final pueden reintentarse una o dos veces, con pausa incremental y registro del motivo.
- No se hace reintento automático después de pulsar “Programar” cuando TikTok no confirmó el resultado.
- El historial local avisa de posibles duplicados usando nombre, tamaño y fecha de modificación; el usuario decide si omite, revisa o programa de nuevo.

## 5. Compatibilidad con TikTok y permisos mínimos — Bloqueada para automatización hasta autorización

- La extensión no inyecta scripts, no lee ni modifica el DOM de TikTok, no detecta automáticamente sesión o campos, no sube videos ni activa controles de TikTok mientras no exista autorización escrita de TikTok o una integración oficial aprobada aplicable. La decisión y las fuentes están en `docs/tiktok-studio-compatibility-review.md`.
- El modo ensayo actual solo valida datos locales de cola y agenda; no consulta ni interactúa con una pestaña de TikTok. El usuario puede revisar manualmente su cuenta e interfaz sin compartir credenciales.
- Si se confirma una vía autorizada, el adaptador será reemplazable y usará únicamente los permisos/hosts aprobados estrictamente necesarios, con validación de cuenta y formulario antes de cualquier acción.
- Aun con autorización futura, un modo de prueba separado deberá permitir revisar el formulario sin subir ni pulsar “Programar”; la programación real requerirá criterios de aceptación y consentimiento explícitos en otra fase.
- Se mantiene la prohibición de añadir `cookies`, `tabs`, `scripting` o hosts TikTok por anticipado; cada permiso que se proponga deberá tener justificación y pruebas de Chrome.
- No se incorpora el antiguo host de licencias `sslip.io`.
- El panel lateral conserva el estado local al cerrarse y reabrirse, sin depender de leer datos de TikTok.
- La Content Posting API se evalúa separadamente: confirmar requisitos de aplicación, aprobación, scopes, auditoría, UX y si la programación futura está soportada antes de elegirla.

## 6. Transferencia de archivos grandes — Pendiente

- La extensión elimina el transporte base64 entre service worker y pestaña de TikTok.
- La transferencia usa fragmentos binarios acotados con confirmación y libera referencias al terminar.
- El procesamiento evita copias simultáneas innecesarias y maneja pestañas cerradas, cortes de red, cuota llena y archivos desaparecidos.
- Si el formulario de TikTok obliga a retener una copia completa y las mediciones muestran presión de memoria, se revisan alternativas antes de prometer soporte para videos de cientos de MB.

## 7. Resolución segura de enlaces de producto TikTok Shop — Pendiente

- El resolvedor acepta enlaces HTTP(S) solo si el hostname coincide exactamente con un dominio de TikTok permitido o un subdominio comprobado mediante límites de hostname.
- Se rechazan protocolos distintos de HTTP(S), dominios similares/falsificados y dominios no autorizados antes de hacer `fetch`.
- Cada redirección se valida para impedir que el enlace termine en un host ajeno a TikTok.
- Se conserva el apoyo a IDs numéricos de producto válidos sin ejecutar una petición de red.

## 8. Acceso, identidad verificada y Hotmart — Pendiente

- El usuario vincula una compra con una cuenta por correo verificado, enlace de un solo uso o código temporal; no se activa acceso por confiar en un email escrito sin verificación.
- El backend conserva solo los datos necesarios para identidad, plan, estado, fechas de acceso, instalaciones y recibos/eventos webhook; no guarda archivos de video ni captions completos.
- El endpoint de Hotmart valida `X-HOTMART-HOTTOK` únicamente en servidor; el secreto nunca se expone a frontend, extensión ni repositorio.
- Los eventos se procesan de forma idempotente por ID de evento y se guarda recepción/resultado para investigar reintentos.
- Compra aprobada, reembolso, contracargo, cancelación y eventos relevantes de suscripción aplican una política de acceso explícita con periodo de gracia y fecha efectiva de fin.
- Se implementa conciliación para cubrir webhooks perdidos o retrasados; no se revoca acceso indiscriminadamente por recibir una cancelación cuyo periodo de acceso aún no termina.
- Se mantiene una interfaz interna `BillingProvider` para añadir otra pasarela sin reescribir la lógica de permisos.

## 9. Conexión autenticada entre web y extensión — Pendiente

- La extensión solicita al backend un token de acceso de duración limitada, con expiración, revocación y revalidación periódica.
- No se almacenan credenciales maestras en la extensión ni se confía en datos del frontend como autoridad de licencia.
- Se define el comportamiento local durante periodos sin conexión sin convertir la licencia en un permiso permanente ilimitado.
- Los registros técnicos no contienen videos, captions, cookies ni claves.

## 10. Internacionalización y funciones futuras — Pendiente

- La interfaz inicial está en español; cuando los selectores y mensajes se estabilicen, los textos del panel y del motor se moverán a `chrome.i18n` con traducción mantenible.
- Solo se añadirán formatos como `.webm` después de confirmar compatibilidad real en la ruta de TikTok escogida.
- Se preparan adaptadores de IA para que el usuario pueda conectar servicios/APIs; las claves no se publican en JavaScript distribuido y su uso requiere consentimiento.
- La Content Posting API oficial de TikTok se evalúa como una vía distinta; no se asume que reemplaza la programación de Studio antes de verificar scopes, aprobación, límites y experiencia de usuario.

## 11. Privacidad, seguridad y distribución — Pendiente

- La PC y Chrome permanecen activos mientras el agente sube y programa los videos; tras la confirmación de TikTok de que una publicación futura quedó programada en sus servidores, apagar la PC no cancela esa programación aceptada.
- La extensión se prueba en cuentas de prueba con cierres/reinicios, red irregular, archivos grandes, almacenamiento local lleno, distintas zonas horarias y límites visibles de agenda.
- Antes de abrir ventas, se publican privacidad, condiciones, contacto, soporte y procedimiento de eliminación de cuenta.
- Se revisan políticas de Chrome Web Store y condiciones aplicables de TikTok antes de distribuir públicamente.
- La licencia controla el acceso al servicio, pero no se presenta como protección infalible contra modificaciones de código que corre localmente.
