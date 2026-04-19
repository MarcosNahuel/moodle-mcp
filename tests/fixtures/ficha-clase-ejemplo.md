---
id: italiano-a1-2026-u3-c5
tipo: clase
idioma: italiano
programa: italiano-a1-2026
unidad: 3
orden: 5
duracion_min: 90
modalidad: virtual
perfil_alumno: adulto
competencias_activadas:
  - comp-23
  - comp-24
competencias_prerequisito:
  - comp-12
  - comp-15
objetivos_observables:
  - presentar_familia_propia_oral
  - comprender_dialogo_familiar_basico
vocabulario:
  - { it: "famiglia", es: "familia", ipa: "ˈfamiʎʎa" }
  - { it: "madre",    es: "madre",   ipa: "ˈmadre" }
  - { it: "padre",    es: "padre",   ipa: "ˈpadre" }
estructuras:
  - presente_indicativo_regulares
assets_generados:
  - { id: img-1, tipo: imagen,        path: ./assets/img-1.png, autor: gemini-imagen-3 }
  - { id: aud-1, tipo: audio_dialogo, path: ./assets/aud-1.mp3, autor: gemini-tts }
componentes:
  - { id: apertura,     tipo: texto,                     minutos: 10 }
  - { id: disparador-1, tipo: imagen,                    minutos: 5,  asset: img-1 }
  - { id: input-1,      tipo: dialogo,                   minutos: 15, asset: aud-1 }
  - { id: ejercicio-1,  tipo: ejercicio_cloze,           minutos: 10 }
  - { id: ejercicio-2,  tipo: ejercicio_opcion_multiple, minutos: 10 }
  - { id: produccion-1, tipo: produccion_oral,           minutos: 25 }
  - { id: cierre,       tipo: texto,                     minutos: 5 }
  - { id: tarea-1,      tipo: tarea_asincronica,         minutos: 10 }
moodle:
  course_id: 42
---

# Clase 5 — La mia famiglia

## Apertura (10 min) {#apertura}
Saludo, recuperación de la clase anterior. Activación de vocabulario sobre la familia.

## Disparador (5 min) {#disparador-1}
![Familia italiana](./assets/img-1.png)

Preguntas detonadoras: ¿Quiénes son? ¿Qué creés que están haciendo?

## Input: diálogo modelo (15 min) {#input-1}
<audio src="./assets/aud-1.mp3"></audio>

**Transcripción:**

> MARCO: Ciao, come stai?
> LAURA: Bene, grazie. E tu?
> MARCO: Abbastanza bene. Questa è la mia famiglia.

## Ejercicio 1 — Completar (10 min) {#ejercicio-1}
Completá con el verbo correcto:

1. Io ______ (parlare) italiano.
2. Lei ______ (vivere) a Roma.
3. Noi ______ (lavorare) insieme.

## Ejercicio 2 — Opción múltiple (10 min) {#ejercicio-2}
¿Cuál es el plural de *famiglia*?

- [ ] famiglias
- [x] famiglie
- [ ] famiglios

## Producción oral (25 min) {#produccion-1}
En parejas, presenten a tres miembros de su familia usando el vocabulario y el verbo *essere*.

## Cierre (5 min) {#cierre}
Recapitulación de estructuras practicadas. Asignación de tarea.

## Tarea asincrónica (10 min) {#tarea-1}
Subí un audio corto (1 minuto) presentando tu familia a la plataforma.
