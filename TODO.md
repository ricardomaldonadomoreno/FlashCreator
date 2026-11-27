# TODO — Flash Creator

El producto evoluciona desde una web con extensión hacia un ejecutable local para Windows. La extensión MV3 se conserva durante la migración, pero la nueva app procesa la biblioteca y la cola sin su puente de mensajería. Un video solo se marca como programado si TikTok Studio presenta una confirmación inequívoca.

## 1. Aplicación de escritorio Windows — En progreso

- Flash Creator se instalará como un programa `.exe` local de Windows y su flujo de cola no dependerá de que la web esté abierta ni de que funcione el Side Panel de la extensión.
- La interfaz reutilizará React/Next cuando sea viable y mantendrá los colores índigo `#0b1325`, celadón `#a9cdbe` y dorado `#f2b53a`.
- Electron tendrá `contextIsolation` activo, `nodeIntegration` desactivado y una API IPC explícita y acotada; el renderer no podrá ejecutar funciones Node arbitrarias.
- El instalador Windows se construirá en un runner Windows y no incluirá videos, claves ni perfiles de navegador en el repositorio.
- La extensión anterior se conservará hasta que la app de escritorio tenga una ruta de migración probada.

## 2. Navegador local dedicado — En progreso

- La aplicación abrirá una ventana visible de Chrome/Chromium con un perfil local dedicado a Flash Creator, separado del perfil habitual del usuario.
- La primera vez, el usuario iniciará sesión manualmente en TikTok Studio desde ese perfil; Flash Creator no solicitará ni guardará contraseña, cookies ni tokens de TikTok.
- El navegador no se incrustará dentro de la aplicación. Flash Creator lo abrirá en la ruta de carga de TikTok Studio y mantendrá visible el progreso.
- El acceso automatizado se limitará al flujo de carga y programación solicitado; no leerá mensajes, analíticas, contactos ni páginas ajenas a ese flujo.
- Si aparece una verificación humana, captcha, cambio de formulario o estado de página no reconocido, el agente pausará la cola y pedirá intervención del usuario; no intentará evadir la verificación.

## 3. Biblioteca local de videos — En progreso

- Los videos permanecen en el equipo y no se suben a la web ni al backend de Flash Creator.
- La biblioteca acepta `.mp4` y `.mov`, valida extensión, estructura ISO-BMFF con una pista de video y tamaño, y permite reordenar y quitar videos.
- Los videos se almacenan en una carpeta local administrada; la lista lee metadatos sin recuperar blobs o archivos completos.
- Antes de importar, se advierten posibles duplicados por nombre normalizado, tamaño y fecha de modificación; el usuario puede omitirlos o conservar las copias.
- Los videos permanecen en el equipo hasta que el usuario los borre o reemplace; el almacenamiento local informa falta de espacio o archivos ausentes.
- No se convierte ningún video a Base64 ni se transporta por mensajes de extensión para que la app de escritorio lo use.

## 4. Agenda local completa y revisable — En progreso

- La agenda admite intervalo, ventana horaria permitida, días activos, tope diario y variación aleatoria pequeña configurable.
- Se generan de antemano los horarios para toda la cola; cada horario conserva zona horaria e instante inequívoco y no cambia al reanudar salvo que el usuario solicite recalcular.
- Antes de iniciar, se valida que los horarios respeten ventana, días activos, tope y horizonte configurado para la cuenta.
- Si el último horario supera el horizonte configurado, el inicio queda bloqueado antes de cargar el primer video y se ofrecen recalcular la cola o cancelar.
- La vista previa muestra cada video, su orden, fecha, hora y zona horaria, más advertencias de posibles duplicados.

## 5. Cola secuencial, recuperación e historial — En progreso

- Se persisten localmente el ID de cola, índice, estado por video, intentos, horario, zona horaria, configuración e historial; los cambios relevantes se guardan antes y después de cada acción externa.
- El usuario revisa la lista y horarios y confirma explícitamente el inicio de cada tanda. Después, el agente procesa uno por uno todos los videos aprobados hasta completar la cola o detenerse ante un error.
- Al cerrar o reiniciar la aplicación, se recupera la cola y el cursor guardados sin cambiar el orden ni los horarios.
- Si la aplicación se cierra durante una carga o después de pulsar Programar, el elemento queda “por verificar”; el agente no repite automáticamente una acción cuyo resultado puede haber sido aceptado.
- Los errores claramente recuperables antes del envío final pueden reintentarse hasta dos veces con pausa incremental y registro del motivo.
- No se reintenta automáticamente después de pulsar el control final de Programar cuando TikTok Studio no confirmó el resultado.
- Si un video falla, la cola no lo salta como si todo hubiese salido bien; se pausa y muestra qué video requiere revisión.
- El historial local advierte de duplicados por nombre, tamaño y fecha; el usuario decide si omite, revisa o programa de nuevo.

## 6. Agente local de TikTok Studio — En progreso

- El agente automatiza el flujo visible solicitado en TikTok Studio: abrir la carga, seleccionar el archivo local de la cola, esperar a que la página termine de procesarlo, aplicar el horario previsto y confirmar la programación.
- Solo se procesa un video a la vez; la siguiente carga comienza después de una confirmación inequívoca del video actual.
- Antes de la primera acción del lote, la app presenta los videos y horarios y pide confirmación de la tanda. Durante la ejecución, quedan visibles los controles de pausar y detener.
- Cada paso comprueba que la página, control y estado esperado coincidan antes de actuar; nunca hace clic en un control ambiguo.
- Si no se detecta un control único, falla el selector, la página cambia o el resultado no es claro, la cola se pausa y el elemento queda en un estado explicativo o “por verificar”.
- La app registra el resultado por video y solo lo marca como programado después de observar una confirmación explícita de TikTok Studio.
- Cuando TikTok confirme los horarios, sus servidores se encargan de la publicación futura; el PC debe seguir encendido solo hasta que Flash Creator termine de programar la cola.

## 7. Proveedores de IA — Pendiente

- Flash Creator podrá conectar OpenRouter u otros proveedores con API compatible; cada integración indicará su proveedor, URL, modelo y estado de disponibilidad.
- Las claves BYOK se guardan cifradas localmente mediante almacenamiento seguro del sistema operativo, no en el repositorio ni en la parte web pública.
- El modo “solo modelos gratuitos” no usa modelos de pago ni realiza fallback silencioso; los límites y disponibilidad del proveedor se muestran al usuario.
- Los videos no se envían a los proveedores de IA. Solo se envían textos/metadatos que el usuario seleccione y autorice.
- Las respuestas del modelo se validan como texto o datos estructurados; el modelo no puede inyectar JavaScript ni cambiar la lista de acciones permitidas del agente.
- El agente determinista ejecuta los clics y validaciones; el modelo puede ayudar con captions, planificación o explicación de errores, pero no decide acciones arbitrarias.

## 8. Seguridad, verificación y transparencia — Pendiente

- Flash Creator no usa la Content Posting API en la primera implementación del agente de navegador.
- La app no pide cookies, credenciales de TikTok, mensajes, analíticas o permisos para controlar otras aplicaciones o sitios.
- Las verificaciones humanas y estados de resultado incierto requieren intervención del usuario; no se ocultan automatizaciones ni se eluden controles de acceso.
- No se afirma que TikTok haya aprobado, revisado o respaldado Flash Creator; los cambios en la interfaz pueden requerir actualizar el adaptador.
- Los registros técnicos incluyen tiempos, estados y mensajes de error necesarios para soporte, pero no contenido de video, contraseñas, cookies ni claves de proveedor.

## 9. Acceso comercial y distribución — Pendiente

- El acceso de licencia y pagos se implementa en fase separada de la cola local; videos, claves de proveedor y sesiones de navegador no se sincronizan con el backend comercial.
- Se mantiene una interfaz para futuros proveedores de pago, sin incorporar todavía un host de licencias `sslip.io`.
- Antes de distribución comercial, se definen privacidad, condiciones, contacto, soporte, eliminación de cuenta y procedimiento de actualización del ejecutable.
- Se evalúa firma de código para reducir advertencias de Windows SmartScreen antes de una distribución pública.
- La app se prueba con cuenta de prueba, cola interrumpida, red irregular, almacenamiento local lleno, zonas horarias diferentes, archivos de varios tamaños y cambios detectables en la interfaz.
