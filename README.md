# IntelliPlan AI - Asistente Inteligente de Tareas y Planificación

**Materia:** Inteligencia Artificial Aplicada  
**Integrantes:** Nikoll Florez, Alan Rangel, Carlos Movilla  

---

## 📌 Descripción del Proyecto
IntelliPlan AI es una evolución de la clásica aplicación de lista de tareas que incorpora capacidades cognitivas avanzadas mediante Inteligencia Artificial. El sistema interpreta lenguaje natural para automatizar la captura, categorización, priorización y planificación del tiempo del usuario.

## 🏛️ Estructura Modular y Arquitectura

```
Inteliplan Web/
├── index.html                   # Interfaz gráfica principal de la aplicación web
├── css/
│   └── styles.css               # Estilos y animaciones visuales
├── js/
│   └── app.js                   # Lógica del cliente y persistencia local
└── ai/                          # Directorio de Inteligencia Artificial
    ├── agent/
    │   └── core_agent.js        # Lógica central del Agente que procesa la entrada natural
    └── skills/
        ├── categorizacion.js    # Skill 1: Clasificación semántica (Trabajo/Personal/Urgente)
        ├── priorizacion.js      # Skill 2: Evaluación automática de prioridad y urgencia
        └── resumen_diario.js    # Skill 3: Generación de recomendaciones y enfoque del día
```

### Componentes de Inteligencia Artificial:
1. **Core Agent (`core_agent.js`):** Actúa como el núcleo cognitivo del sistema. Recibe texto coloquial, analiza la intención del usuario y delega secuencialmente a las skills correspondientes.
2. **Skill de Categorización (`categorizacion.js`):** Clasifica la tarea en **Trabajo**, **Personal** o **Urgente**.
3. **Skill de Priorización (`priorizacion.js`):** Evalúa la urgencia y plazos para asignar prioridad (**Alta**, **Media**, **Baja**) e inferir fecha límite.
4. **Skill de Resumen Diario (`resumen_diario.js`):** Analiza el conjunto total de pendientes y genera una recomendación ejecutiva de cuáles son las 3 tareas críticas en las que enfocarse hoy.
5. **Motor de IA Dual:**
   - **Google Gemini Flash API:** Soporte para razonamiento avanzado vía API Key.
   - **Motor Semántico Local:** Permite que la aplicación funcione al 100% sin necesidad de configurar una API key o conexión externa.

---

## 🚀 Cómo Ejecutar la Aplicación

Debido a que utiliza módulos JavaScript nativos (`import`/`export`), se recomienda abrir la aplicación mediante cualquier servidor web local:

### Opción 1: Con Python (si está instalado)
```bash
python -m http.server 8000
```
Y abre en tu navegador: `http://localhost:8000`

### Opción 2: Con Node.js / npx
```bash
npx serve .
# o
npx http-server
```

### Opción 3: Extensión Live Server de VS Code
Haz clic derecho en `index.html` y selecciona **"Open with Live Server"**.