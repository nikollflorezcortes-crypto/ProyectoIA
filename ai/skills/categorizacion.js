/**
 * IntelliPlan AI - Skill de Categorización Automática
 * 
 * Evalúa semánticamente el texto de la tarea para clasificarla en:
 * - Urgente
 * - Trabajo
 * - Personal
 * 
 * Puede operar con Google Gemini Flash API o con el motor de reglas semánticas local.
 */

export class SkillCategorizacion {
    constructor(geminiService = null) {
        this.name = 'skill-categorizacion';
        this.description = 'Clasifica la tarea en categorías semánticas (Trabajo, Personal, Urgente).';
        this.geminiService = geminiService;

        // Diccionarios semánticos para el motor heurístico local
        this.keywords = {
            urgente: [
                'urgente', 'inmediato', 'hoy mismo', 'ya', 'asap', 'emergencia', 'crítico',
                'prioritario', 'cuanto antes', 'grave', 'plazo vencido', 'alarma', 'apuro'
            ],
            trabajo: [
                'reunión', 'reunion', 'informe', 'reporte', 'jefe', 'cliente', 'proyecto',
                'entregable', 'presentación', 'presentacion', 'email', 'correo', 'código',
                'codigo', 'deploy', 'bug', 'tarea', 'examen', 'universidad', 'parcial',
                'clase', 'profesor', 'oficina', 'empresa', 'sprint', 'commit', 'pull request',
                'contrato', 'presupuesto', 'factura', 'documento', 'tesis', 'materia'
            ],
            personal: [
                'comprar', 'supermercado', 'casa', 'familia', 'médico', 'medico', 'cita',
                'gimnasio', 'gym', 'entrenar', 'viaje', 'cena', 'almuerzo', 'desayuno',
                'amigos', 'película', 'pelicula', 'descanso', 'pagar servicios', 'lavar',
                'limpiar', 'farmacia', 'mascota', 'veterinario', 'cumpleaños', 'hobby', 'paseo'
            ]
        };
    }

    /**
     * Clasifica el texto de la tarea
     * @param {string} text - Texto en lenguaje natural
     * @returns {Promise<{categoria: string, confianza: number, motivo: string}>}
     */
    async ejecutar(text) {
        if (!text || typeof text !== 'string') {
            return { categoria: 'Personal', confianza: 0.5, motivo: 'Texto vacío, categoría por defecto.' };
        }

        // Si hay servicio Gemini configurado y disponible, intentamos usar IA
        if (this.geminiService && this.geminiService.isAvailable()) {
            try {
                const prompt = `Actúa como el módulo 'skill-categorizacion' de IntelliPlan AI.
Clasifica la siguiente tarea en EXACTAMENTE una de estas tres categorías: ["Trabajo", "Personal", "Urgente"].
Texto de la tarea: "${text}"

Devuelve ÚNICAMENTE un objeto JSON con este formato:
{
  "categoria": "Trabajo" | "Personal" | "Urgente",
  "confianza": número entre 0.0 y 1.0,
  "motivo": "explicación breve de 1 línea de por qué se eligió esta categoría"
}`;
                const res = await this.geminiService.generateJSON(prompt);
                if (res && res.categoria) {
                    return {
                        categoria: this._normalizarCategoria(res.categoria),
                        confianza: res.confianza || 0.95,
                        motivo: res.motivo || 'Clasificado mediante Gemini Flash AI'
                    };
                }
            } catch (err) {
                console.warn('[SkillCategorizacion] Fallback a motor heurístico local:', err);
            }
        }

        // Motor heurístico local (análisis semántico por pesos)
        return this._clasificarLocal(text);
    }

    _clasificarLocal(text) {
        const lower = text.toLowerCase();
        let scores = { Urgente: 0, Trabajo: 0, Personal: 0 };

        for (const kw of this.keywords.urgente) {
            if (lower.includes(kw)) scores.Urgente += 3;
        }
        for (const kw of this.keywords.trabajo) {
            if (lower.includes(kw)) scores.Trabajo += 2;
        }
        for (const kw of this.keywords.personal) {
            if (lower.includes(kw)) scores.Personal += 2;
        }

        // Si tiene palabras de urgencia marcada
        if (scores.Urgente > 0 && scores.Urgente >= scores.Trabajo && scores.Urgente >= scores.Personal) {
            return {
                categoria: 'Urgente',
                confianza: 0.9,
                motivo: 'Detectada terminología crítica o de tiempo apremiante en el texto.'
            };
        }

        if (scores.Trabajo > scores.Personal) {
            return {
                categoria: 'Trabajo',
                confianza: 0.85,
                motivo: 'Relacionado con entorno laboral, académico o proyectos.'
            };
        }

        if (scores.Personal > 0) {
            return {
                categoria: 'Personal',
                confianza: 0.85,
                motivo: 'Identificadas actividades de vida cotidiana, salud o compras.'
            };
        }

        // Por defecto
        return {
            categoria: 'Personal',
            confianza: 0.6,
            motivo: 'Clasificación general estimada por contexto cotidiano.'
        };
    }

    _normalizarCategoria(cat) {
        const clean = (cat || '').trim().toLowerCase();
        if (clean.includes('urgent')) return 'Urgente';
        if (clean.includes('trabaj') || clean.includes('work') || clean.includes('estudi')) return 'Trabajo';
        return 'Personal';
    }
}
