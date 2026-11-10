/**
 * IntelliPlan AI - Cliente Principal, Tiempo Real y Gestión Integral
 * 
 * Incluye:
 * - Soporte universal (funciona en servidor http/https y directo en file://)
 * - Agente Cognitivo CoreAgent y 3 Skills modulares
 * - Reloj en tiempo real y saludo dinámico
 * - Búsqueda y filtrado instantáneo en vivo
 * - Temporizador Pomodoro interactivo en tiempo real
 * - Síntesis y reconocimiento de voz (Speech-to-Text & Text-to-Speech)
 * - Editor completo de tareas (Modal CRUD)
 * - Exportación / Importación (JSON & CSV)
 * - Sincronización multi-pestaña en tiempo real (storage events)
 * - Efectos de sonido con Web Audio API (sin dependencias externas)
 */

// ==========================================
// 1. MOTOR DE AUDIO SINTETIZADO (Web Audio)
// ==========================================
class SoundFX {
    constructor() {
        this.ctx = null;
        this.enabled = true;
    }

    _init() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) this.ctx = new AudioContext();
        }
    }

    playBeep(freq = 600, duration = 0.1, type = 'sine') {
        if (!this.enabled) return;
        try {
            this._init();
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch (e) {
            // Ignorar políticas de autoplay hasta interacción del usuario
        }
    }

    playSuccess() {
        this.playBeep(523.25, 0.1); // C5
        setTimeout(() => this.playBeep(659.25, 0.15), 100); // E5
        setTimeout(() => this.playBeep(783.99, 0.25), 200); // G5
    }

    playComplete() {
        this.playBeep(440, 0.08);
        setTimeout(() => this.playBeep(880, 0.15), 90);
    }

    playTimerAlert() {
        for (let i = 0; i < 3; i++) {
            setTimeout(() => this.playBeep(800, 0.15, 'triangle'), i * 300);
        }
    }
}

// ==========================================
// 2. MÓDULOS DE IA Y SKILLS (STANDALONE & MODULAR)
// ==========================================

class GeminiService {
    constructor() {
        this.apiKey = localStorage.getItem('intelliplan_gemini_api_key') || '';
        this.model = 'gemini-1.5-flash';
    }

    setApiKey(key) {
        this.apiKey = (key || '').trim();
        if (this.apiKey) {
            localStorage.setItem('intelliplan_gemini_api_key', this.apiKey);
        } else {
            localStorage.removeItem('intelliplan_gemini_api_key');
        }
    }

    getApiKey() {
        return this.apiKey;
    }

    isAvailable() {
        return Boolean(this.apiKey && this.apiKey.length > 15);
    }

    async generateJSON(prompt) {
        if (!this.isAvailable()) throw new Error('API Key de Gemini no configurada.');

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
        const body = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: 'application/json',
                temperature: 0.2
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Error en API Gemini (${response.status}): ${err}`);
        }

        const data = await response.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) throw new Error('Respuesta vacía de Gemini.');

        try {
            return JSON.parse(rawText);
        } catch (e) {
            const clean = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
            return JSON.parse(clean);
        }
    }
}

class SkillCategorizacion {
    constructor(geminiService = null) {
        this.name = 'skill-categorizacion';
        this.geminiService = geminiService;
        this.keywords = {
            urgente: ['urgente', 'inmediato', 'hoy mismo', 'ya', 'asap', 'emergencia', 'crítico', 'prioritario', 'cuanto antes', 'grave', 'plazo vencido', 'alarma', 'apuro', 'falla'],
            trabajo: ['reunión', 'reunion', 'informe', 'reporte', 'jefe', 'cliente', 'proyecto', 'entregable', 'presentación', 'presentacion', 'email', 'correo', 'código', 'codigo', 'deploy', 'bug', 'tarea', 'examen', 'universidad', 'parcial', 'clase', 'profesor', 'oficina', 'empresa', 'sprint', 'contrato', 'presupuesto', 'factura', 'documento', 'tesis', 'materia'],
            personal: ['comprar', 'supermercado', 'casa', 'familia', 'médico', 'medico', 'cita', 'gimnasio', 'gym', 'entrenar', 'viaje', 'cena', 'almuerzo', 'desayuno', 'amigos', 'película', 'pelicula', 'descanso', 'pagar servicios', 'lavar', 'limpiar', 'farmacia', 'mascota', 'veterinario', 'cumpleaños', 'hobby', 'paseo', 'mercado']
        };
    }

    async ejecutar(text) {
        if (!text || typeof text !== 'string') return { categoria: 'Personal', confianza: 0.5, motivo: 'Texto general.' };

        if (this.geminiService && this.geminiService.isAvailable()) {
            try {
                const prompt = `Actúa como 'skill-categorizacion' de IntelliPlan AI.
Clasifica esta tarea exactamente en una de: ["Trabajo", "Personal", "Urgente"].
Texto: "${text}"
Devuelve ÚNICAMENTE un JSON: {"categoria": "Trabajo"|"Personal"|"Urgente", "confianza": 0.0-1.0, "motivo": "explicación de 1 línea"}`;
                const res = await this.geminiService.generateJSON(prompt);
                if (res && res.categoria) {
                    return {
                        categoria: this._norm(res.categoria),
                        confianza: res.confianza || 0.95,
                        motivo: res.motivo || 'Clasificado con Gemini Flash'
                    };
                }
            } catch (err) {
                console.warn('[SkillCategorizacion] Fallback a motor local:', err);
            }
        }
        return this._clasificarLocal(text);
    }

    _clasificarLocal(text) {
        const lower = text.toLowerCase();
        let scores = { Urgente: 0, Trabajo: 0, Personal: 0 };
        this.keywords.urgente.forEach(k => { if (lower.includes(k)) scores.Urgente += 3; });
        this.keywords.trabajo.forEach(k => { if (lower.includes(k)) scores.Trabajo += 2; });
        this.keywords.personal.forEach(k => { if (lower.includes(k)) scores.Personal += 2; });

        if (scores.Urgente > 0 && scores.Urgente >= scores.Trabajo && scores.Urgente >= scores.Personal) {
            return { categoria: 'Urgente', confianza: 0.92, motivo: 'Detectada alta urgencia temporal o criticidad.' };
        }
        if (scores.Trabajo > scores.Personal) {
            return { categoria: 'Trabajo', confianza: 0.88, motivo: 'Contexto académico, profesional o laboral.' };
        }
        if (scores.Personal > 0) {
            return { categoria: 'Personal', confianza: 0.85, motivo: 'Actividad de vida cotidiana o bienestar personal.' };
        }
        return { categoria: 'Personal', confianza: 0.65, motivo: 'Estimación por contexto general.' };
    }

    _norm(cat) {
        const c = (cat || '').toLowerCase();
        if (c.includes('urgent')) return 'Urgente';
        if (c.includes('trabaj') || c.includes('work') || c.includes('estudi')) return 'Trabajo';
        return 'Personal';
    }
}

class SkillPriorizacion {
    constructor(geminiService = null) {
        this.name = 'skill-priorizacion';
        this.geminiService = geminiService;
    }

    async ejecutar(text, categoria = 'Personal') {
        if (!text || typeof text !== 'string') return { prioridad: 'Baja', fechaLimite: null, tiempoEstimado: '30 min', motivo: 'Sin especificar.' };

        if (this.geminiService && this.geminiService.isAvailable()) {
            try {
                const fechaHoy = new Date().toISOString().split('T')[0];
                const prompt = `Actúa como 'skill-priorizacion' de IntelliPlan AI.
Evalúa urgencia y plazos. Fecha hoy: ${fechaHoy}. Categoría: ${categoria}.
Texto: "${text}"
Devuelve ÚNICAMENTE JSON:
{"prioridad": "Alta"|"Media"|"Baja", "fechaLimite": "YYYY-MM-DD"|null, "tiempoEstimado": string, "motivo": string}`;
                const res = await this.geminiService.generateJSON(prompt);
                if (res && res.prioridad) {
                    return {
                        prioridad: this._norm(res.prioridad),
                        fechaLimite: res.fechaLimite || this._inferirFecha(text),
                        tiempoEstimado: res.tiempoEstimado || '1 hora',
                        motivo: res.motivo || 'Evaluado por Gemini Flash'
                    };
                }
            } catch (err) {
                console.warn('[SkillPriorizacion] Fallback a motor local:', err);
            }
        }
        return this._priorizarLocal(text, categoria);
    }

    _priorizarLocal(text, categoria) {
        const lower = text.toLowerCase();
        let prioridad = 'Media';
        let motivo = 'Prioridad estándar equilibrada.';
        const fechaLimite = this._inferirFecha(text);

        const palabrasAlta = ['urgente', 'hoy', 'ya', 'inmediato', 'asap', 'grave', 'crítico', 'plazo', 'examen', 'parcial', 'entregar', 'jefe', 'emergencia', 'falla'];
        const palabrasBaja = ['cuando pueda', 'algún día', 'algun dia', 'luego', 'sin prisa', 'opcional', 'hobby', 'paseo'];

        if (categoria === 'Urgente' || palabrasAlta.some(p => lower.includes(p))) {
            prioridad = 'Alta';
            motivo = 'Plazo inminente o alto impacto identificado.';
        } else if (palabrasBaja.some(p => lower.includes(p))) {
            prioridad = 'Baja';
            motivo = 'Flexibilidad de tiempo o baja criticidad.';
        } else if (categoria === 'Trabajo') {
            prioridad = 'Media';
            motivo = 'Compromiso laboral o académico con seguimiento.';
        }

        let tiempoEstimado = '45 min';
        if (lower.includes('informe') || lower.includes('reporte') || lower.includes('estudiar') || lower.includes('proyecto')) {
            tiempoEstimado = '2 - 3 horas';
        } else if (lower.includes('comprar') || lower.includes('llamar') || lower.includes('correo')) {
            tiempoEstimado = '20 min';
        }

        return { prioridad, fechaLimite, tiempoEstimado, motivo };
    }

    _inferirFecha(text) {
        const lower = text.toLowerCase();
        const hoy = new Date();
        if (lower.includes('hoy') || lower.includes('ya') || lower.includes('esta tarde')) {
            return hoy.toISOString().split('T')[0];
        }
        if (lower.includes('mañana') || lower.includes('manana')) {
            const m = new Date(hoy);
            m.setDate(hoy.getDate() + 1);
            return m.toISOString().split('T')[0];
        }
        if (lower.includes('pasado mañana') || lower.includes('pasado manana')) {
            const p = new Date(hoy);
            p.setDate(hoy.getDate() + 2);
            return p.toISOString().split('T')[0];
        }
        if (lower.includes('fin de semana') || lower.includes('sábado') || lower.includes('domingo')) {
            const s = new Date(hoy);
            const dias = (6 - hoy.getDay() + 7) % 7 || 7;
            s.setDate(hoy.getDate() + dias);
            return s.toISOString().split('T')[0];
        }
        const s = new Date(hoy);
        s.setDate(hoy.getDate() + 2);
        return s.toISOString().split('T')[0];
    }

    _norm(p) {
        const c = (p || '').toLowerCase();
        if (c.includes('alt') || c.includes('high')) return 'Alta';
        if (c.includes('baj') || c.includes('low')) return 'Baja';
        return 'Media';
    }
}

class SkillResumenDiario {
    constructor(geminiService = null) {
        this.name = 'skill-resumen-diario';
        this.geminiService = geminiService;
    }

    async ejecutar(tareas = []) {
        const pendientes = tareas.filter(t => !t.completada);
        if (pendientes.length === 0) {
            return {
                top3: [],
                resumenEjecutivo: '¡Bandeja despejada! No tienes tareas pendientes activas hoy. Excelente momento para descansar o planificar metas a largo plazo.',
                consejoProductividad: 'Mantener la bandeja al día reduce la fatiga mental y maximiza tu claridad estratégica.'
            };
        }

        if (this.geminiService && this.geminiService.isAvailable()) {
            try {
                const prompt = `Actúa como 'skill-resumen-diario' de IntelliPlan AI.
Analiza estas tareas pendientes y elige las 3 más críticas para hoy.
Tareas: ${JSON.stringify(pendientes.map(t => ({ id: t.id, titulo: t.titulo, categoria: t.categoria, prioridad: t.prioridad, fechaLimite: t.fechaLimite })))}
Devuelve ÚNICAMENTE JSON:
{"top3Ids": [ids...], "resumenEjecutivo": string, "consejoProductividad": string}`;
                const res = await this.geminiService.generateJSON(prompt);
                if (res && Array.isArray(res.top3Ids)) {
                    const top3 = res.top3Ids.map(id => pendientes.find(t => t.id == id)).filter(Boolean);
                    return {
                        top3: top3.length > 0 ? top3 : this._top3Local(pendientes),
                        resumenEjecutivo: res.resumenEjecutivo || 'Enfoque estratégico generado por Gemini Flash.',
                        consejoProductividad: res.consejoProductividad || 'Aborda la tarea de mayor impacto a primera hora.'
                    };
                }
            } catch (err) {
                console.warn('[SkillResumenDiario] Fallback a motor local:', err);
            }
        }
        return this._generarResumenLocal(pendientes);
    }

    _generarResumenLocal(pendientes) {
        const top3 = this._top3Local(pendientes);
        const urgentes = pendientes.filter(t => t.prioridad === 'Alta' || t.categoria === 'Urgente').length;
        const total = pendientes.length;

        const resumen = `Tienes un total de ${total} pendientes activos, de los cuales ${urgentes} exigen atención prioritaria. Te recomendamos completar primero las tareas urgentes durante la mañana para dejar la tarde disponible para labores creativas o personales.`;
        const consejo = urgentes >= 2
            ? 'Método Pomodoro recomendado: trabaja en bloques de 25 minutos sin interrupciones en tu tarea principal.'
            : 'Regla de los 2 minutos: si alguna tarea pendiente toma menos de 2 minutos, resuélvela de inmediato.';

        return { top3, resumenEjecutivo: resumen, consejoProductividad: consejo };
    }

    _top3Local(pendientes) {
        const scored = pendientes.map(t => {
            let s = 0;
            if (t.prioridad === 'Alta') s += 50;
            if (t.prioridad === 'Media') s += 20;
            if (t.categoria === 'Urgente') s += 40;
            if (t.categoria === 'Trabajo') s += 15;
            if (t.fechaLimite) {
                const hoy = new Date().toISOString().split('T')[0];
                if (t.fechaLimite <= hoy) s += 30;
            }
            return { ...t, _score: s };
        });
        scored.sort((a, b) => b._score - a._score);
        return scored.slice(0, 3);
    }
}

class CoreAgent {
    constructor() {
        this.geminiService = new GeminiService();
        this.skillCategorizacion = new SkillCategorizacion(this.geminiService);
        this.skillPriorizacion = new SkillPriorizacion(this.geminiService);
        this.skillResumenDiario = new SkillResumenDiario(this.geminiService);
    }

    async procesarEntradaNatural(inputTexto, onStep = null) {
        const log = (paso, detalle, stepNum = 1) => {
            const entry = { timestamp: new Date().toLocaleTimeString(), paso, detalle, stepNum };
            if (onStep) onStep(entry);
        };

        log('Paso 1: Percepción', `Analizando texto en lenguaje natural: "${inputTexto}"`, 1);
        await this._delay(180);

        const tituloLimpio = this._limpiarTitulo(inputTexto);
        log('Paso 2: Comprensión', `Intención identificada: "${tituloLimpio}"`, 2);
        await this._delay(180);

        log('Paso 3: Skill Categorización', 'Invocando skill-categorizacion para clasificación semántica...', 3);
        const resCat = await this.skillCategorizacion.ejecutar(inputTexto);
        log('Paso 3: Resultado Skill 1', `Categoría: ${resCat.categoria} (${Math.round(resCat.confianza * 100)}%). ${resCat.motivo}`, 3);
        await this._delay(180);

        log('Paso 4: Skill Priorización', `Invocando skill-priorizacion con contexto "${resCat.categoria}"...`, 4);
        const resPrio = await this.skillPriorizacion.ejecutar(inputTexto, resCat.categoria);
        log('Paso 4: Resultado Skill 2', `Prioridad: ${resPrio.prioridad} | Plazo: ${resPrio.fechaLimite || 'Sin fecha'} | Estimado: ${resPrio.tiempoEstimado}`, 4);
        await this._delay(180);

        const tarea = {
            id: 'task_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
            textoOriginal: inputTexto,
            titulo: tituloLimpio,
            categoria: resCat.categoria,
            prioridad: resPrio.prioridad,
            fechaLimite: resPrio.fechaLimite,
            tiempoEstimado: resPrio.tiempoEstimado,
            motivoAnalisis: `${resCat.motivo} ${resPrio.motivo}`,
            completada: false,
            fechaCreacion: new Date().toISOString()
        };

        log('Paso 5: Síntesis Final', `Tarea estructurada con éxito en el sistema.`, 5);
        return tarea;
    }

    async generarEnfoqueDelDia(tareas, onStep = null) {
        if (onStep) onStep({ timestamp: new Date().toLocaleTimeString(), paso: 'Enfoque Diario', detalle: 'Skill 3 analizando prioridades...', stepNum: 3 });
        return await this.skillResumenDiario.ejecutar(tareas);
    }

    _limpiarTitulo(texto) {
        let l = texto.trim().replace(/^(tengo que|debo|necesito|hay que|por favor|recuérdame|recordarme|hacer)\s+/i, '');
        return l.charAt(0).toUpperCase() + l.slice(1);
    }

    _delay(ms) {
        return new Promise(r => setTimeout(r, ms));
    }
}

// ==========================================
// 3. ESTADO GLOBAL DE LA APLICACIÓN
// ==========================================
const app = {
    agent: new CoreAgent(),
    sound: new SoundFX(),
    tareas: [],
    filtroEstado: 'pendientes',
    filtroCategoria: 'todas',
    ordenarPor: 'prioridad',
    busquedaQuery: '',
    vozActiva: true,

    // Temporizador Pomodoro en tiempo real
    pomodoro: {
        totalSeconds: 25 * 60,
        secondsLeft: 25 * 60,
        timerId: null,
        isRunning: false,
        activeTask: null
    }
};

const TAREAS_DEMO = [
    {
        id: 'task_demo_1',
        textoOriginal: 'Terminar entrega del proyecto IntelliPlan AI para la clase de Inteligencia Artificial Aplicada',
        titulo: 'Entrega de proyecto IntelliPlan AI',
        categoria: 'Trabajo',
        prioridad: 'Alta',
        fechaLimite: new Date(Date.now() + 86400000).toISOString().split('T')[0],
        tiempoEstimado: '3 horas',
        motivoAnalisis: 'Compromiso académico crítico evaluado por skill-categorizacion y priorizado con urgencia alta.',
        completada: false,
        fechaCreacion: new Date().toISOString()
    },
    {
        id: 'task_demo_2',
        textoOriginal: 'Comprar frutas y verduras en el supermercado para la semana',
        titulo: 'Comprar víveres en el supermercado',
        categoria: 'Personal',
        prioridad: 'Media',
        fechaLimite: new Date(Date.now() + 172800000).toISOString().split('T')[0],
        tiempoEstimado: '45 min',
        motivoAnalisis: 'Actividad de vida cotidiana clasificada como Personal con tiempo estimado estándar.',
        completada: false,
        fechaCreacion: new Date().toISOString()
    },
    {
        id: 'task_demo_3',
        textoOriginal: 'Llamar al soporte técnico por falla urgente en el servidor de base de datos',
        titulo: 'Soporte técnico por falla en servidor',
        categoria: 'Urgente',
        prioridad: 'Alta',
        fechaLimite: new Date().toISOString().split('T')[0],
        tiempoEstimado: '30 min',
        motivoAnalisis: 'Falla crítica en infraestructura identificada por skill-priorizacion para atención inmediata hoy.',
        completada: false,
        fechaCreacion: new Date().toISOString()
    }
];

// ==========================================
// 4. PERSISTENCIA Y SINCRONIZACIÓN
// ==========================================
function cargarTareas() {
    const data = localStorage.getItem('intelliplan_tareas');
    if (data) {
        try {
            app.tareas = JSON.parse(data);
        } catch (e) {
            app.tareas = [...TAREAS_DEMO];
        }
    } else {
        app.tareas = [...TAREAS_DEMO];
        guardarTareas(false);
    }
    renderizarTareas();
    actualizarEstadisticas();
}

function guardarTareas(broadcast = true) {
    localStorage.setItem('intelliplan_tareas', JSON.stringify(app.tareas));
    renderizarTareas();
    actualizarEstadisticas();
    if (broadcast) {
        // Disparar evento para pestañas locales
        localStorage.setItem('intelliplan_sync_trigger', Date.now().toString());
    }
}

// Sincronización en tiempo real multi-pestaña
window.addEventListener('storage', (e) => {
    if (e.key === 'intelliplan_tareas' || e.key === 'intelliplan_sync_trigger') {
        cargarTareas();
        showToast('Sincronizado en tiempo real con otra pestaña', 'success');
    }
});

// ==========================================
// 5. RELOJ Y TIEMPO REAL
// ==========================================
function iniciarRelojRealTime() {
    const clockEl = document.getElementById('rtClock');
    const dateEl = document.getElementById('rtDate');
    const greetingEl = document.getElementById('greetingText');

    function actualizar() {
        const ahora = new Date();
        const horas = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const fecha = ahora.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

        if (clockEl) clockEl.textContent = horas;
        if (dateEl) dateEl.textContent = fecha;

        if (greetingEl) {
            const h = ahora.getHours();
            let saludo = 'Buenos días';
            if (h >= 12 && h < 19) saludo = 'Buenas tardes';
            else if (h >= 19 || h < 6) saludo = 'Buenas noches';
            greetingEl.textContent = saludo;
        }
    }

    actualizar();
    setInterval(actualizar, 1000);
}

// ==========================================
// 6. TEMPORIZADOR POMODORO EN TIEMPO REAL
// ==========================================
function iniciarPomodoro() {
    const displayEl = document.getElementById('pomoDisplay');
    const startBtn = document.getElementById('pomoStartBtn');
    const resetBtn = document.getElementById('pomoResetBtn');
    const taskLabel = document.getElementById('pomoTaskLabel');

    function renderDisplay() {
        const m = Math.floor(app.pomodoro.secondsLeft / 60).toString().padStart(2, '0');
        const s = (app.pomodoro.secondsLeft % 60).toString().padStart(2, '0');
        if (displayEl) displayEl.textContent = `${m}:${s}`;
        document.title = app.pomodoro.isRunning ? `(${m}:${s}) IntelliPlan AI` : 'IntelliPlan AI';
    }

    function toggleTimer() {
        if (app.pomodoro.isRunning) {
            clearInterval(app.pomodoro.timerId);
            app.pomodoro.isRunning = false;
            startBtn.innerHTML = '▶ Reanudar';
            showToast('Pomodoro en pausa', 'warning');
        } else {
            app.pomodoro.isRunning = true;
            startBtn.innerHTML = '⏸ Pausar';
            showToast('Pomodoro iniciado (25m concentración)', 'success');
            app.sound.playBeep(440, 0.1);

            app.pomodoro.timerId = setInterval(() => {
                if (app.pomodoro.secondsLeft > 0) {
                    app.pomodoro.secondsLeft--;
                    renderDisplay();
                } else {
                    clearInterval(app.pomodoro.timerId);
                    app.pomodoro.isRunning = false;
                    startBtn.innerHTML = '▶ Iniciar';
                    app.pomodoro.secondsLeft = app.pomodoro.totalSeconds;
                    renderDisplay();
                    app.sound.playTimerAlert();
                    showToast('¡Pomodoro completado! Tómate un descanso de 5 min.', 'success');
                    if (window.Notification && Notification.permission === 'granted') {
                        new Notification('IntelliPlan AI - Pomodoro', { body: '¡Sesión de 25 minutos finalizada! Buen trabajo.' });
                    }
                }
            }, 1000);
        }
    }

    function resetTimer() {
        clearInterval(app.pomodoro.timerId);
        app.pomodoro.isRunning = false;
        app.pomodoro.secondsLeft = app.pomodoro.totalSeconds;
        startBtn.innerHTML = '▶ Iniciar';
        renderDisplay();
    }

    if (startBtn) startBtn.addEventListener('click', toggleTimer);
    if (resetBtn) resetBtn.addEventListener('click', resetTimer);
    renderDisplay();
}

window.vincularPomodoroConTarea = function(taskId) {
    const tarea = app.tareas.find(t => t.id === taskId);
    if (tarea) {
        app.pomodoro.activeTask = tarea;
        const taskLabel = document.getElementById('pomoTaskLabel');
        if (taskLabel) taskLabel.textContent = `🎯 Enfocado en: ${tarea.titulo}`;
        showToast(`Tarea vinculada al Pomodoro: "${tarea.titulo}"`, 'success');

        const pomoCard = document.getElementById('pomodoroCard');
        if (pomoCard) pomoCard.scrollIntoView({ behavior: 'smooth' });
    }
};

// ==========================================
// 7. RENDERIZADO Y GESTIÓN DE TAREAS
// ==========================================
function renderizarTareas() {
    const listaEl = document.getElementById('tasksList');
    if (!listaEl) return;

    let filtradas = app.tareas.filter(t => {
        if (app.filtroEstado === 'pendientes') return !t.completada;
        if (app.filtroEstado === 'completadas') return t.completada;
        return true;
    });

    if (app.filtroCategoria !== 'todas') {
        filtradas = filtradas.filter(t => t.categoria === app.filtroCategoria);
    }

    if (app.busquedaQuery) {
        const q = app.busquedaQuery.toLowerCase();
        filtradas = filtradas.filter(t => 
            t.titulo.toLowerCase().includes(q) || 
            (t.textoOriginal && t.textoOriginal.toLowerCase().includes(q)) ||
            (t.categoria && t.categoria.toLowerCase().includes(q))
        );
    }

    // Ordenamiento
    if (app.ordenarPor === 'prioridad') {
        const orden = { 'Alta': 3, 'Media': 2, 'Baja': 1 };
        filtradas.sort((a, b) => (orden[b.prioridad] || 0) - (orden[a.prioridad] || 0));
    } else if (app.ordenarPor === 'fecha') {
        filtradas.sort((a, b) => (a.fechaLimite || '9999').localeCompare(b.fechaLimite || '9999'));
    } else if (app.ordenarPor === 'titulo') {
        filtradas.sort((a, b) => a.titulo.localeCompare(b.titulo));
    } else if (app.ordenarPor === 'recientes') {
        filtradas.sort((a, b) => (b.fechaCreacion || '').localeCompare(a.fechaCreacion || ''));
    }

    if (filtradas.length === 0) {
        listaEl.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📋</div>
                <h3>No se encontraron tareas</h3>
                <p>Usa la barra de arriba para añadir tareas con IA o ajusta tus filtros de búsqueda.</p>
            </div>
        `;
        return;
    }

    listaEl.innerHTML = filtradas.map(t => {
        const catClass = t.categoria ? t.categoria.toLowerCase() : 'personal';
        const tagClass = `tag-${catClass}`;
        const prioColor = t.prioridad === 'Alta' ? '🔴' : (t.prioridad === 'Media' ? '🟡' : '🟢');

        return `
            <div class="task-card ${t.completada ? 'completed' : ''}" data-id="${t.id}">
                <input type="checkbox" class="task-check" ${t.completada ? 'checked' : ''} title="Marcar como completada">
                
                <div class="task-body">
                    <div class="task-meta-top">
                        <span class="badge-tag ${tagClass}">${t.categoria}</span>
                        <span class="prio-indicator prio-${t.prioridad}">${prioColor} Prioridad ${t.prioridad}</span>
                    </div>

                    <div class="task-title">${escapeHtml(t.titulo)}</div>

                    <div class="task-details">
                        ${t.fechaLimite ? `<span class="task-detail-item">📅 Plazo: ${t.fechaLimite}</span>` : ''}
                        ${t.tiempoEstimado ? `<span class="task-detail-item">⏱️ ${t.tiempoEstimado}</span>` : ''}
                        <span class="task-detail-item">💬 "${escapeHtml(t.textoOriginal)}"</span>
                    </div>

                    ${t.motivoAnalisis ? `
                        <div class="task-reasoning">
                            <strong>🧠 Razonamiento del Agente:</strong> ${escapeHtml(t.motivoAnalisis)}
                        </div>
                    ` : ''}
                </div>

                <div class="task-actions">
                    <button class="btn-icon focus" title="Enfocar en Pomodoro" onclick="vincularPomodoroConTarea('${t.id}')">⏱️</button>
                    <button class="btn-icon edit" title="Editar tarea">✏️</button>
                    <button class="btn-icon delete" title="Eliminar tarea">🗑️</button>
                </div>
            </div>
        `;
    }).join('');

    // Eventos interactivos en tarjetas
    listaEl.querySelectorAll('.task-check').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const id = e.target.closest('.task-card').dataset.id;
            const tarea = app.tareas.find(t => t.id === id);
            if (tarea) {
                tarea.completada = e.target.checked;
                if (tarea.completada) app.sound.playComplete();
                guardarTareas();
                showToast(tarea.completada ? 'Tarea marcada como completada' : 'Tarea reabierta', 'success');
            }
        });
    });

    listaEl.querySelectorAll('.btn-icon.edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.closest('.task-card').dataset.id;
            abrirModalEditar(id);
        });
    });

    listaEl.querySelectorAll('.btn-icon.delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.closest('.task-card').dataset.id;
            const tarea = app.tareas.find(t => t.id === id);
            if (tarea && confirm(`¿Deseas eliminar la tarea "${tarea.titulo}"?`)) {
                app.tareas = app.tareas.filter(t => t.id !== id);
                guardarTareas();
                showToast('Tarea eliminada', 'warning');
            }
        });
    });
}

function actualizarEstadisticas() {
    const total = app.tareas.length;
    const pendientes = app.tareas.filter(t => !t.completada).length;
    const urgentes = app.tareas.filter(t => !t.completada && (t.categoria === 'Urgente' || t.prioridad === 'Alta')).length;
    const completadas = app.tareas.filter(t => t.completada).length;

    const sTot = document.getElementById('statTotal');
    const sPen = document.getElementById('statPendientes');
    const sUrg = document.getElementById('statUrgentes');
    const sCom = document.getElementById('statCompletadas');

    if (sTot) sTot.textContent = total;
    if (sPen) sPen.textContent = pendientes;
    if (sUrg) sUrg.textContent = urgentes;
    if (sCom) sCom.textContent = completadas;
}

// ==========================================
// 8. FLUJO COGNITIVO DEL AGENTE EN VIVO
// ==========================================
function actualizarHUDStep(stepNum, status) {
    const hud = document.getElementById('cognitiveHUD');
    if (hud) hud.classList.add('active');

    for (let i = 1; i <= 4; i++) {
        const pill = document.getElementById(`hudStep${i}`);
        if (!pill) continue;
        if (i < stepNum) {
            pill.className = 'hud-step-pill done';
            pill.innerHTML = `✓ Paso ${i}`;
        } else if (i === stepNum) {
            pill.className = `hud-step-pill ${status}`;
            pill.innerHTML = `⚡ Paso ${i}`;
        } else {
            pill.className = 'hud-step-pill';
        }
    }

    if (stepNum > 4) {
        setTimeout(() => {
            if (hud) hud.classList.remove('active');
        }, 1500);
    }
}

function agregarLogTerminal(entry) {
    const terminal = document.getElementById('cognitiveTerminal');
    if (!terminal) return;

    let stepClass = `step-${entry.stepNum || 1}`;
    const div = document.createElement('div');
    div.className = `cognitive-entry ${stepClass}`;
    div.innerHTML = `
        <span class="cog-time">[${entry.timestamp}]</span>
        <span class="cog-step">${escapeHtml(entry.paso)}</span>
        <span class="cog-detail">${escapeHtml(entry.detalle)}</span>
    `;

    terminal.appendChild(div);
    terminal.scrollTop = terminal.scrollHeight;
}

async function procesarNuevaTarea(texto) {
    if (!texto || !texto.trim() || app.isProcessing) return;

    app.isProcessing = true;
    const inputEl = document.getElementById('nlInput');
    const submitBtn = document.getElementById('submitTaskBtn');

    if (inputEl) inputEl.disabled = true;
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>⏳ Agente Procesando...</span>`;
    }

    try {
        actualizarHUDStep(1, 'running');

        const tareaGenerada = await app.agent.procesarEntradaNatural(texto.trim(), (entry) => {
            agregarLogTerminal(entry);
            actualizarHUDStep(entry.stepNum || 1, 'running');
        });

        actualizarHUDStep(5, 'done');
        app.tareas.unshift(tareaGenerada);
        guardarTareas();
        app.sound.playSuccess();
        showToast(`Tarea creada con éxito: "${tareaGenerada.titulo}"`, 'success');

        // Síntesis de voz opcional (TTS)
        hablarTexto(`Tarea agregada: ${tareaGenerada.titulo}. Categoría ${tareaGenerada.categoria}, prioridad ${tareaGenerada.prioridad}.`);

        if (inputEl) {
            inputEl.value = '';
            inputEl.disabled = false;
            inputEl.focus();
        }
    } catch (err) {
        console.error('Error procesando tarea:', err);
        showToast('Error al procesar: ' + err.message, 'danger');
    } finally {
        app.isProcessing = false;
        if (inputEl) inputEl.disabled = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span>✨ Crear con IA</span>`;
        }
    }
}

// ==========================================
// 9. SÍNTESIS Y RECONOCIMIENTO DE VOZ
// ==========================================
function hablarTexto(texto) {
    if (!app.vozActiva || !('speechSynthesis' in window)) return;
    try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(texto);
        utter.lang = 'es-ES';
        utter.rate = 1.05;
        window.speechSynthesis.speak(utter);
    } catch (e) {
        console.warn('SpeechSynthesis error:', e);
    }
}

function iniciarReconocimientoVoz() {
    const micBtn = document.getElementById('micBtn');
    const inputEl = document.getElementById('nlInput');
    const voiceStatus = document.getElementById('voiceStatus');

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        showToast('Reconocimiento de voz no soportado en este navegador. Escribe directamente.', 'warning');
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.interimResults = true;

    recognition.onstart = () => {
        if (micBtn) micBtn.classList.add('recording');
        if (voiceStatus) {
            voiceStatus.classList.add('visible');
            voiceStatus.textContent = '🎙️ Escuchando... habla claramente';
        }
    };

    recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
        }
        if (inputEl) inputEl.value = transcript;
        if (event.results[0].isFinal) {
            procesarNuevaTarea(transcript);
        }
    };

    recognition.onerror = (e) => {
        console.warn('Voice error:', e);
        if (micBtn) micBtn.classList.remove('recording');
        if (voiceStatus) voiceStatus.classList.remove('visible');
    };

    recognition.onend = () => {
        if (micBtn) micBtn.classList.remove('recording');
        if (voiceStatus) voiceStatus.classList.remove('visible');
    };

    recognition.start();
}

// ==========================================
// 10. SKILL 3: RESUMEN Y ENFOQUE DIARIO
// ==========================================
async function dispararResumenDiario() {
    const btn = document.getElementById('btnResumenDiario');
    const banner = document.getElementById('dailyFocusCard');

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳ Evaluando pendientes...</span>';
    }

    try {
        const res = await app.agent.generarEnfoqueDelDia(app.tareas, (entry) => {
            agregarLogTerminal(entry);
        });

        document.getElementById('dfSummary').textContent = res.resumenEjecutivo;
        document.getElementById('dfTip').textContent = res.consejoProductividad;

        const top3Grid = document.getElementById('dfTop3Grid');
        if (res.top3.length === 0) {
            top3Grid.innerHTML = `<p style="font-size:0.85rem; color:#9ca3af;">No hay tareas pendientes en este momento.</p>`;
        } else {
            top3Grid.innerHTML = res.top3.map((t, idx) => `
                <div class="df-top3-item">
                    <div class="df-top3-num">${idx + 1}</div>
                    <div class="df-top3-text">${escapeHtml(t.titulo)}</div>
                    <div class="df-top3-footer">
                        <span>${t.categoria} • ${t.prioridad}</span>
                        <button class="btn-start-focus" onclick="vincularPomodoroConTarea('${t.id}')">⏱️ Enfocar</button>
                    </div>
                </div>
            `).join('');
        }

        banner.classList.add('visible');
        banner.scrollIntoView({ behavior: 'smooth' });
        app.sound.playSuccess();
        hablarTexto(`Enfoque del día listo. Hay ${res.top3.length} tareas clave recomendadas.`);
    } catch (err) {
        console.error('Error generando resumen diario:', err);
        showToast('Error en Skill 3: ' + err.message, 'danger');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span>🎯 Generar Enfoque del Día (Skill 3)</span>';
        }
    }
}

// ==========================================
// 11. EDICIÓN COMPLETA (MODAL CRUD)
// ==========================================
function abrirModalEditar(id) {
    const tarea = app.tareas.find(t => t.id === id);
    if (!tarea) return;

    document.getElementById('editTaskId').value = tarea.id;
    document.getElementById('editTaskTitle').value = tarea.titulo;
    document.getElementById('editTaskCat').value = tarea.categoria;
    document.getElementById('editTaskPrio').value = tarea.prioridad;
    document.getElementById('editTaskDeadline').value = tarea.fechaLimite || '';
    document.getElementById('editTaskTime').value = tarea.tiempoEstimado || '';
    document.getElementById('editTaskReasoning').value = tarea.motivoAnalisis || '';

    const modal = document.getElementById('modalEditTask');
    if (modal) modal.classList.add('active');
}

// ==========================================
// 12. EXPORTACIÓN & IMPORTACIÓN
// ==========================================
function exportarJSON() {
    const blob = new Blob([JSON.stringify(app.tareas, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `intelliplan_tareas_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Archivo JSON exportado', 'success');
}

function exportarCSV() {
    const headers = ['ID', 'Titulo', 'Categoria', 'Prioridad', 'Fecha_Limite', 'Tiempo_Estimado', 'Completada', 'Texto_Original'];
    const rows = app.tareas.map(t => [
        `"${t.id}"`,
        `"${(t.titulo || '').replace(/"/g, '""')}"`,
        `"${t.categoria || ''}"`,
        `"${t.prioridad || ''}"`,
        `"${t.fechaLimite || ''}"`,
        `"${t.tiempoEstimado || ''}"`,
        t.completada ? 'SI' : 'NO',
        `"${(t.textoOriginal || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `intelliplan_tareas_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Archivo CSV exportado para Excel', 'success');
}

function importarJSON(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (Array.isArray(data)) {
                app.tareas = data;
                guardarTareas();
                showToast(`Se importaron ${data.length} tareas correctamente`, 'success');
            } else {
                showToast('El formato del archivo JSON no es una lista válida de tareas', 'danger');
            }
        } catch (err) {
            showToast('Error leyendo el archivo JSON: ' + err.message, 'danger');
        }
    };
    reader.readAsText(file);
}

// ==========================================
// 13. TOAST NOTIFICATIONS & UTILIDADES
// ==========================================
function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '✅' : (type === 'warning' ? '⚠️' : (type === 'danger' ? '❌' : 'ℹ️'));
    toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(msg)}</span>`;

    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function actualizarBadgeGemini() {
    const badge = document.getElementById('badgeGemini');
    if (!badge) return;
    if (app.agent.geminiService.isAvailable()) {
        badge.classList.add('active');
        badge.innerHTML = `<span>⚡</span> Gemini Flash (Online)`;
    } else {
        badge.classList.remove('active');
        badge.innerHTML = `<span>🤖</span> Motor Cognitivo Local`;
    }
}

// ==========================================
// 14. INICIALIZACIÓN GLOBAL
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    cargarTareas();
    iniciarRelojRealTime();
    iniciarPomodoro();
    actualizarBadgeGemini();

    // Notificación en terminal
    agregarLogTerminal({
        timestamp: new Date().toLocaleTimeString(),
        paso: 'Sistema Iniciado en Tiempo Real',
        detalle: 'CoreAgent listo con skills de categorización, priorización y resumen ejecutivo.',
        stepNum: 1
    });

    // Solicitar permiso de notificaciones de navegador
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    // Formulario de entrada natural
    const nlForm = document.getElementById('nlForm');
    const nlInput = document.getElementById('nlInput');
    if (nlForm) {
        nlForm.addEventListener('submit', (e) => {
            e.preventDefault();
            procesarNuevaTarea(nlInput.value);
        });
    }

    // Búsqueda en vivo en tiempo real
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            app.busquedaQuery = e.target.value;
            renderizarTareas();
        });
    }

    // Ordenamiento
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            app.ordenarPor = e.target.value;
            renderizarTareas();
        });
    }

    // Chips de ejemplo
    document.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const text = chip.dataset.prompt;
            if (nlInput) nlInput.value = text;
            procesarNuevaTarea(text);
        });
    });

    // Micrófono
    const micBtn = document.getElementById('micBtn');
    if (micBtn) micBtn.addEventListener('click', iniciarReconocimientoVoz);

    // Filtros de estado (tabs)
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            app.filtroEstado = btn.dataset.status;
            renderizarTareas();
        });
    });

    // Filtros de categoría
    document.querySelectorAll('.filter-badge').forEach(badge => {
        badge.addEventListener('click', () => {
            document.querySelectorAll('.filter-badge').forEach(b => b.classList.remove('active'));
            badge.classList.add('active');
            app.filtroCategoria = badge.dataset.cat;
            renderizarTareas();
        });
    });

    // Botón Skill 3: Resumen Diario
    const btnResumenDiario = document.getElementById('btnResumenDiario');
    if (btnResumenDiario) btnResumenDiario.addEventListener('click', dispararResumenDiario);

    // Acciones por lote
    const btnClearCompleted = document.getElementById('btnClearCompleted');
    if (btnClearCompleted) {
        btnClearCompleted.addEventListener('click', () => {
            const antes = app.tareas.length;
            app.tareas = app.tareas.filter(t => !t.completada);
            guardarTareas();
            showToast(`Se eliminaron ${antes - app.tareas.length} tareas completadas`, 'warning');
        });
    }

    const btnResetDemo = document.getElementById('btnResetDemo');
    if (btnResetDemo) {
        btnResetDemo.addEventListener('click', () => {
            app.tareas = [...TAREAS_DEMO];
            guardarTareas();
            showToast('Tareas de demostración restablecidas', 'success');
        });
    }

    // Export / Import
    const btnExportJSON = document.getElementById('btnExportJSON');
    if (btnExportJSON) btnExportJSON.addEventListener('click', exportarJSON);

    const btnExportCSV = document.getElementById('btnExportCSV');
    if (btnExportCSV) btnExportCSV.addEventListener('click', exportarCSV);

    const importInput = document.getElementById('importJSONInput');
    if (importInput) {
        importInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                importarJSON(e.target.files[0]);
                e.target.value = '';
            }
        });
    }

    // Formulario de edición de tarea
    const formEditTask = document.getElementById('formEditTask');
    if (formEditTask) {
        formEditTask.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = document.getElementById('editTaskId').value;
            const tarea = app.tareas.find(t => t.id === id);
            if (tarea) {
                tarea.titulo = document.getElementById('editTaskTitle').value;
                tarea.categoria = document.getElementById('editTaskCat').value;
                tarea.prioridad = document.getElementById('editTaskPrio').value;
                tarea.fechaLimite = document.getElementById('editTaskDeadline').value;
                tarea.tiempoEstimado = document.getElementById('editTaskTime').value;
                tarea.motivoAnalisis = document.getElementById('editTaskReasoning').value;
                guardarTareas();
                document.getElementById('modalEditTask').classList.remove('active');
                showToast('Tarea actualizada correctamente', 'success');
            }
        });
    }

    // Modales de configuración y arquitectura
    const modalSettings = document.getElementById('modalSettings');
    const modalArch = document.getElementById('modalArch');
    const btnOpenSettings = document.getElementById('btnOpenSettings');
    const btnOpenArch = document.getElementById('btnOpenArch');

    if (btnOpenSettings) {
        btnOpenSettings.addEventListener('click', () => {
            document.getElementById('apiKeyInput').value = app.agent.geminiService.getApiKey();
            modalSettings.classList.add('active');
        });
    }

    if (btnOpenArch) {
        btnOpenArch.addEventListener('click', () => modalArch.classList.add('active'));
    }

    document.querySelectorAll('.close-modal, .btn-close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
        });
    });

    const formSettings = document.getElementById('formSettings');
    if (formSettings) {
        formSettings.addEventListener('submit', (e) => {
            e.preventDefault();
            const key = document.getElementById('apiKeyInput').value;
            app.agent.geminiService.setApiKey(key);
            actualizarBadgeGemini();
            modalSettings.classList.remove('active');
            showToast(key ? 'Conectado a Google Gemini API' : 'Modo local activado', 'success');
        });
    }

    // Toggle de voz asistente
    const btnVoiceToggle = document.getElementById('btnVoiceToggle');
    if (btnVoiceToggle) {
        btnVoiceToggle.addEventListener('click', () => {
            app.vozActiva = !app.vozActiva;
            btnVoiceToggle.textContent = app.vozActiva ? '🔊 Voz On' : '🔇 Voz Off';
            showToast(app.vozActiva ? 'Voz del asistente activada' : 'Voz del asistente silenciada', 'info');
        });
    }
});