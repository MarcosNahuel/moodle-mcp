<!--
Example FichaClase. Copy of tests/fixtures/ficha-clase-ejemplo.md annotated
with commentary for teachers authoring their first Ficha.

The frontmatter YAML block (between the two `---` lines) is the *contract*:
every field is validated by the `FichaClase` zod schema. The markdown body
below it is the teaching material, with `{#anchor}` tags that tie each section
back to the corresponding `componentes[*].id`.
-->

---
# Required
id: italiano-a1-2026-u3-c5     # unique and stable — used to compute idnumbers
tipo: clase                    # always "clase" for a FichaClase
idioma: italiano               # italiano | portugues
programa: italiano-a1-2026     # free string identifying the program
unidad: 3                      # integer
orden: 5                       # integer — position inside the unit
duracion_min: 90
modalidad: virtual             # virtual | presencial | hibrida
perfil_alumno: adulto          # adulto | adolescente | universitario
objetivos_observables:
  - presentar_familia_propia_oral
  - comprender_dialogo_familiar_basico
componentes:
  - { id: apertura, tipo: texto, minutos: 10 }
  - { id: cierre,   tipo: texto, minutos: 5 }
moodle:
  course_id: 42                # Moodle course to publish into

# Optional
competencias_activadas: [comp-23]
competencias_prerequisito: [comp-12]
vocabulario:
  - { it: "famiglia", es: "familia", ipa: "ˈfamiʎʎa" }
estructuras: [presente_indicativo_regulares]
assets_generados:
  - { id: img-1, tipo: imagen,        path: ./assets/img-1.png }
  - { id: aud-1, tipo: audio_dialogo, path: ./assets/aud-1.mp3 }
---

# Clase 5 — La mia famiglia

## Apertura (10 min) {#apertura}
Saludo y recuperación de la clase anterior.

## Cierre (5 min) {#cierre}
Recapitulación y asignación de tarea.
