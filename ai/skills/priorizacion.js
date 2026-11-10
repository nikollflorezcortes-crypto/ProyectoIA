/**
 * IntelliPlan AI - Skill de Priorizacion Inteligente
 */

export class SkillPriorizacion {
    constructor(geminiService = null) {
        this.name = 'skill-priorizacion';
        this.description = 'Evalua urgencia y plazos para asignar prioridad (Alta, Media, Baja).';
        this.geminiService = geminiService;
    }

    async ejecutar(text, categoria = 'Personal') {
        if (!text || typeof text !== 'string') {
            return {
                prioridad: 'Baja',
                fechaLimite: null,
                tiempoEstimado: '30 min',
                motivo: 'Tarea no especificada.'
            };
        }

        if (this.geminiService && this.geminiService.isAvailable()) {
            try {
                const fechaHoy = new Date().toISOString().split('T')[0];
                const prompt = `Actua como el modulo 'skill-priorizacion' de IntelliPlan AI.
Evalua la urgencia y plazos en la siguiente tarea.
Fecha actual: ${fechaHoy}.
Categoria: ${categoria}.
Texto de la tarea: "${text}"

Determina:
1. Prioridad: "Alta", "Media" o "Baja".
2. Fecha limite inferida en formato YYYY-MM-DD.
3. Tiempo estimado aproximado (ej: "45 min", "2 horas", "1 dia").
4. Motivo breve de la priorizacion.

Devuelve UNICAMENTE un objeto JSON:
{
  "prioridad": "Alta" | "Media" | "Baja",
  "fechaLimite": "YYYY-MM-DD" | null,
  "tiempoEstimado": string,
  "motivo": string
}`;
                const res = await this.geminiService.generateJSON(prompt);
                if (res && res.prioridad) {
                    return {
                        prioridad: this._normalizarPrioridad(res.prioridad),
                        fechaLimite: res.fechaLimite || this._inferirFechaLocal(text),
                        tiempoEstimado: res.tiempoEstimado || '1 hora',
                        motivo: res.motivo || 'Priorizado por analisis semantico Gemini'
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
        let motivo = 'Prioridad estandar asignada por balance de carga.';
        const fechaLimite = this._inferirFechaLocal(text);

        const palabrasAlta = [
            'urgente', 'hoy', 'ya', 'inmediato', 'asap', 'grave', 'critico',
            'antes de las', 'plazo', 'examen', 'parcial', 'entregar', 'jefe', 'emergencia'
        ];

        const palabrasBaja = [
            'cuando pueda', 'algun dia', 'luego', 'sin prisa',
            'opcional', 'ver pelicula', 'hobby', 'paseo', 'despues'
        ];

        if (categoria === 'Urgente' || palabrasAlta.some(p => lower.includes(p))) {
            prioridad = 'Alta';
            motivo = 'Detectada alta urgencia temporal o compromiso critico.';
        } else if (palabrasBaja.some(p => lower.includes(p))) {
            prioridad = 'Baja';
            motivo = 'Tarea con flexibilidad de tiempo o de baja criticidad.';
        } else if (categoria === 'Trabajo') {
            prioridad = 'Media';
            motivo = 'Compromiso laboral o academico con seguimiento programado.';
        }

        let tiempoEstimado = '45 min';
        if (lower.includes('informe') || lower.includes('reporte') || lower.includes('estudiar') || lower.includes('proyecto')) {
            tiempoEstimado = '2 - 3 horas';
        } else if (lower.includes('comprar') || lower.includes('llamar') || lower.includes('enviar correo')) {
            tiempoEstimado = '20 min';
        }

        return {
            prioridad,
            fechaLimite,
            tiempoEstimado,
            motivo
        };
    }

    _inferirFechaLocal(text) {
        const lower = text.toLowerCase();
        const hoy = new Date();

        if (lower.includes('hoy') || lower.includes('ya') || lower.includes('esta tarde')) {
            return hoy.toISOString().split('T')[0];
        }

        if (lower.includes('mañana') || lower.includes('manana')) {
            const manana = new Date(hoy);
            manana.setDate(hoy.getDate() + 1);
            return manana.toISOString().split('T')[0];
        }

        if (lower.includes('pasado mañana') || lower.includes('pasado manana')) {
            const pasado = new Date(hoy);
            pasado.setDate(hoy.getDate() + 2);
            return pasado.toISOString().split('T')[0];
        }

        if (lower.includes('fin de semana') || lower.includes('sabado') || lower.includes('domingo')) {
            const proxSabado = new Date(hoy);
            const diasHastaSabado = (6 - hoy.getDay() + 7) % 7 || 7;
            proxSabado.setDate(hoy.getDate() + diasHastaSabado);
            return proxSabado.toISOString().split('T')[0];
        }

        const sugerida = new Date(hoy);
        sugerida.setDate(hoy.getDate() + 2);
        return sugerida.toISOString().split('T')[0];
    }

    _normalizarPrioridad(p) {
        const clean = (p || '').trim().toLowerCase();
        if (clean.includes('alt') || clean.includes('high')) return 'Alta';
        if (clean.includes('baj') || clean.includes('low')) return 'Baja';
        return 'Media';
    }
}
