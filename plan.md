# Plan de desarrollo — Flash Creator

- **Versión:** 1.3
- **Fecha:** 27 de noviembre de 2026
- **Producto:** Flash Creator. **Auto Poster** es solo la extensión de referencia.
- **Repositorio:** `ricardomaldonadomoreno/FlashCreator`.

## Propósito y resultado esperado

Evolucionar Flash Creator a un programa local instalable para Windows. El usuario organiza una cola de videos, revisa los horarios y da inicio a una tanda. Un agente local, limitado a la página de carga de TikTok Studio, abre un navegador visible, carga cada archivo de la cola, introduce su horario y confirma la programación. Repite el flujo en orden hasta terminar o detenerse ante un error que no pueda confirmar con seguridad.

Los videos, la cola, el historial y el perfil del navegador permanecen en el equipo. El programa no usa la Content Posting API ni envía videos a un backend de Flash Creator. La extensión MV3 actual se conserva durante la migración, pero el nuevo flujo de escritorio no depende de su Side Panel, service worker ni mensajería entre extensión y pestaña.

## Arquitectura y alcance

- **Aplicación de escritorio:** Electron empaqueta la interfaz React/Next existente y el proceso local. Se distribuye como instalador `.exe` de Windows. No requiere un servidor web de Flash Creator para administrar la biblioteca o la cola. El código de interfaz se reutilizará cuando sea compatible con la exportación/empaquetado local.
- **Navegador local:** Playwright lanza una ventana visible de Chrome con un perfil separado de Flash Creator. La primera vez, el usuario inicia sesión manualmente en ese perfil. No se reutiliza ni se lee el perfil personal existente de Chrome. El usuario debe mantener el programa y el navegador abiertos hasta que termine la tanda.
- **Agente acotado:** una máquina de estados determinista, no un modelo de lenguaje decidiendo clics a ciegas, controla solo el flujo de carga/programación configurado. Comprueba el estado esperado antes de cada paso, procesa un video a la vez y guarda el estado local antes y después de acciones externas. La IA podrá ayudar con textos, preparación y diagnóstico, pero no ejecutará código arbitrario ni ampliará los permisos de acción.
- **Acción de lote:** antes de iniciar, Flash Creator muestra los videos y horarios y pide una confirmación para la tanda. Después opera secuencialmente sobre los elementos aprobados. Si el usuario pausa, la página cambia inesperadamente, aparece una verificación humana o la confirmación de TikTok no es inequívoca, se detiene; no continúa ni repite una publicación incierta.
- **Persistencia local:** videos copiados a una biblioteca local seleccionable; metadatos, agenda, cola e historial en almacenamiento local transaccional. No se transportan blobs por mensajes de extensión, no se convierten a Base64 y no se envían al servidor. Los registros técnicos guardan estados y errores, no contraseñas, cookies ni contenido de video.
- **Agenda:** se conservan el intervalo, ventana horaria, días activos, límite diario, variación y horizonte máximo ya implementados. Los horarios se calculan y guardan antes de iniciar; la zona horaria se muestra explícitamente y no se recalcula al reanudar.
- **Proveedores de IA:** se prepara un adaptador independiente para OpenRouter y otros endpoints compatibles. La integración BYOK queda separada del control del navegador. Las claves se guardarán localmente usando el almacén seguro del sistema cuando se implemente. Por defecto solo se permitirán modelos gratuitos seleccionados y no habrá fallback silencioso a un modelo de pago. Ningún video se enviará al proveedor.
- **Permisos y límites:** solo se automatizan pasos del flujo de carga y programación de la cola. No se inspeccionan mensajes, analíticas, cookies, contactos ni otras páginas de la cuenta. No se incorporan mecanismos para ocultar la automatización o evadir verificaciones. TikTok puede cambiar la interfaz o sus condiciones; no se promete compatibilidad universal ni aprobación de TikTok.
- **Resultado de publicación:** Flash Creator marca un video como programado únicamente tras observar una confirmación inequívoca en Studio. Una vez aceptado el horario por TikTok, la publicación futura la realiza TikTok; el PC no necesita permanecer encendido para esos horarios ya aceptados. El PC sí permanece encendido hasta terminar de procesar la cola.

## Estructura prevista

```text
app/                         Interfaz React/Next reutilizada y rutas estáticas
components/                  Panel, biblioteca, agenda, ejecución y configuración
 desktop/
   main/                      Proceso Electron: ventana, IPC acotado y ciclo de vida
   preload/                   API IPC explícita y mínima para la interfaz
   agent/                     Orquestador secuencial y estados de la tanda
   browser/                   Perfil dedicado y adaptador de TikTok Studio
   storage/                   Biblioteca local, metadatos, cola e historial
   providers/                 Adaptadores de IA y resguardo local de claves
   packaging/                 Configuración del instalador Windows
extension/                    Versión MV3 anterior, conservada durante migración
extension/core/               Lógica reusable de agenda, cola y biblioteca cuando aplique
docs/                         Decisiones de arquitectura, operación y límites
scripts/                      Desarrollo, validación y empaquetado
.github/workflows/            Construcción del instalador Windows en runner Windows
```

## Mejoras comprometidas

### Cola y biblioteca

- Importar `.mp4` y `.mov` con validación de extensión, MIME y tamaño; permitir reordenar y quitar elementos.
- Separar los videos de sus metadatos y listar sin leer archivos completos. Conservar archivos en una carpeta local administrada por Flash Creator.
- Detectar posibles duplicados por nombre normalizado, tamaño y fecha, y permitir omitirlos o conservarlos conscientemente.
- Guardar localmente el identificador de cola, orden, índice, estado por video, intentos, horario, zona horaria, configuración, historial y último resultado.
- Recuperar el estado tras un cierre o reinicio. Si se interrumpe un paso cuyo resultado externo puede haber tenido éxito, marcar “por verificar” y no repetirlo automáticamente.
- Permitir hasta dos reintentos únicamente cuando el fallo se confirme antes de iniciar el envío externo, con pausas incrementales. Después del clic de programación, nunca reintentar sin verificación.

### Agenda y ejecución

- Calcular por adelantado los slots de todos los videos según intervalo, ventana horaria, días activos, tope diario y variación.
- Validar antes de iniciar el horizonte máximo configurado y conservar los slots al reanudar.
- Mostrar un resumen completo de videos y horarios y exigir una confirmación de lote antes de que el agente empiece.
- Procesar secuencialmente: abrir carga, seleccionar archivo local, esperar la carga, aplicar el horario, confirmar el envío/programación y comprobar el resultado antes de avanzar.
- Mantener controles visibles de pausar y detener. Si falta un control, hay más de un candidato, hay una verificación humana, TikTok cambia el formulario o el estado no coincide, detener la cola con una explicación y registro.
- No saltar un video fallido ni continuar con el siguiente como si el lote hubiese tenido éxito.

### IA y seguridad local

- Crear una interfaz `AIProvider` para OpenRouter y proveedores compatibles, con endpoint, modelo y clave configurables por usuario.
- Mantener la clave en almacenamiento cifrado del sistema operativo, no en el repositorio ni en el frontend público. La integración no debe guardar ni subir videos.
- Filtrar modelos gratuitos si el usuario activa “solo gratis”; no seleccionar modelos de pago como fallback sin aprobación explícita.
- Validar la salida de IA como sugerencias o datos estructurados. El ejecutor solo acepta acciones de una lista fija y nunca código JavaScript generado por el modelo.
- Restringir IPC de Electron a funciones necesarias de cola, biblioteca y navegador; no habilitar `nodeIntegration` en la interfaz.

### Producto y distribución

- Interfaz en español y colores definidos por el usuario: índigo `#0b1325`, celadón `#a9cdbe` y dorado `#f2b53a`.
- Construir y probar la app desde el repositorio; empaquetar el `.exe` mediante un runner Windows. La primera distribución puede ser sin firma y Windows podría mostrar una advertencia; para venta pública se evaluará firma de código.
- Conservar la extensión anterior mientras la edición de escritorio completa pruebas locales y una prueba supervisada con videos no críticos.
- Identidad comercial, licencias y Hotmart quedan en una fase separada. No guardar videos ni claves maestras en servicios de Flash Creator.

## Decisiones de diseño

Se conserva la dirección aprobada: **consola de creador**. La paleta del usuario mantiene índigo `#0b1325` como base, celadón `#a9cdbe` para avance y controles activos, y dorado `#f2b53a` para decisiones y alertas.

- **Movimiento visual:** consola editorial contemporánea inspirada en herramientas de postproducción.
- **Principios:** estado visible, medios locales, control acotado y acciones recuperables.
- **Layout:** navegación compacta, biblioteca y agenda en áreas de trabajo asimétricas y una línea de estado persistente para el lote.
- **Motivos:** monograma “FC” como marcos de video enlazados y una línea de tiempo fina en celadón con acentos dorados puntuales.
- **Interacción:** el inicio del lote presenta alcance y horarios; el progreso es por video; detener y pausar siempre están visibles; el estado incierto nunca se presenta como éxito.
- **Animación:** transiciones breves, progreso no bloqueante y sin efectos que aparenten una publicación antes de la confirmación.
- **Tipografía:** sans-serif de sistema para la interfaz, serif editorial opcional en titulares cortos y cifras tabulares en horarios.
- **Esencia:** “El estudio local que convierte una cola de videos en una agenda clara para creadores”. Personalidad enfocada, confiable y ágil.
- **Voz:** concreta, calmada y accionable. Ejemplos: “Tu agenda, antes de subir.” y “La cola está en pausa; revisa el resultado de este video en Studio.”
- **Wordmark:** monograma geométrico “FC” construido con dos marcos de video y una línea de timeline.
- **Color insignia:** celadón `#a9cdbe` como señal de preparación y continuidad sobre índigo.

## Fases

1. **Migración de escritorio:** incorporar Electron y una interfaz local, definir IPC restringido, abrir el perfil dedicado visible y configurar un proyecto de prueba local.
2. **Biblioteca y cola local:** migrar/reutilizar importación, agenda, persistencia, duplicados, recuperación y estados de la extensión.
3. **Agente de navegador:** implementar el flujo secuencial mediante un adaptador aislado para la página de carga y programación. Pausar ante verificaciones o cambios inesperados; probar primero con una página simulada y luego con una cuenta y clips no críticos bajo supervisión del usuario.
4. **Conectores de IA:** implementar BYOK/OpenRouter u otros proveedores compatibles, claves protegidas localmente y herramientas permitidas de texto/planificación, sin envío de video.
5. **Empaquetado Windows:** preparar el instalador `.exe` y flujo de build en Windows; conservar la extensión durante la transición.
6. **Acceso comercial y evolución:** evaluar licencias, distribución, localización adicional y otras integraciones sin mezclar secretos ni videos con el backend.

## Riesgos y límites

- Cambios en la interfaz de TikTok Studio pueden invalidar selectores; el agente debe pausar en vez de hacer clic a ciegas.
- Una pérdida de confirmación después de enviar un video puede producir duplicados si se reintenta; el resultado se conserva como “por verificar”.
- La primera sesión requiere inicio manual en el perfil dedicado. Una verificación humana o captcha pausa el lote y requiere intervención del usuario.
- La disponibilidad de carga y programación depende de la cuenta, región y estado de TikTok Studio. La app no afirma una aprobación o asociación oficial con TikTok.
- Mientras se carga y programa la cola, el equipo debe seguir encendido y el programa activo. Los horarios que TikTok ya confirmó quedan del lado de TikTok.
- El primer instalador puede requerir advertencia de seguridad de Windows hasta que se configure firma de código.

## Fuentes y referencias técnicas

- [TikTok Terms of Service global](https://www.tiktok.com/legal/page/global/terms-of-service/en)
- [TikTok Content Posting API](https://developers.tiktok.com/doc/content-posting-api-get-started)
- [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Playwright persistent browser context](https://playwright.dev/docs/api/class-browsertype)
- [Chrome remote debugging changes](https://developer.chrome.com/blog/remote-debugging-port)
- [Diseño actual de transferencia local](docs/chrome-file-transfer-design.md)
- [Compatibilidad de TikTok Studio revisada](docs/tiktok-studio-compatibility-review.md)
