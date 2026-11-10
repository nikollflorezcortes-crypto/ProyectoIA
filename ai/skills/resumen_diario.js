/**
 * IntelliPlan AI - Skill de Resumen y Enfoque Diario
 */

export class SkillResumenDiario {
    constructor(geminiService = null) {
        this.name = 'skill-resumen-diario';
        this.description = 'Genera recomendacion ejecutiva con las 3 tareas criticas del dia.';
        this.geminiService = geminiService;
    }

    async ejecutar(tareas = []) {
        const pendientes = tareas.filter(t => !t.completada);

        if (pendientes.length === 0) {
            return {
                top3: [],
                resumenEjecutivo: 'Excelente, no tienes tareas pendientes registradas. Puedes planificar o descansar.',
                consejoProductividad: 'Mantener la bandeja al dia reduce la fatiga cognitiva.'
            };
        }

        if (this.geminiService && this.geminiService.isAvailable()) {
            try {
                const prompt = `Actua como 'skill-resumen-diario' de IntelliPlan AI.
Analiza estas tareas pendientes y elige las 3 mas criticas para hoy.
Tareas: ${JSON.stringify(pendientes.map(t => ({ id: t.id, titulo: t.titulo, categoria: t.categoria, prioridad: t.prioridad, fechaLimite: t.fechaLimite })))}

Devuelve UNICAMENTE JSON:
{
  "top3Ids": [id1, id2, id3],
  "resumenEjecutivo": "texto explicativo",
  "consejoProductividad": "consejo accionable"
}`;
                const res = await this.geminiService.generateJSON(prompt);
                if (res && Array.isArray(res.top3Ids)) {
                    const top3 = res.top3Ids
                        .map(id => pendientes.find(t => t.id == id))
                        .filter(Boolean);

                    return {
                        top3: top3.length > 0 ? top3 : this._seleccionarTop3Local(pendientes),
                        resumenEjecutivo: res.resumenEjecutivo || 'Enfoque estrategico generado por Gemini Flash.',
                        consejoProductividad: res.consejoProductividad || 'Aborda la tarea de mayor impacto primero.'
                    };
                }
            } catch (err) {
                console.warn('[SkillResumenDiario] Fallback a motor local:', err);
            }
        }

        return this._generarResumenLocal(pendientes);
    }

    _generarResumenLocal(pendientes) {
        const top3 = this._seleccionarTop3Local(pendientes);
        const urgentes = pendientes.filter(t => t.prioridad === 'Alta' || t.categoria === 'Urgente').length;
        const total = pendientes.length;

        const resumen = `Tienes ${total} pendientes activos (${urgentes} con alta prioridad o urgentes). Recomendamos resolver los compromisos criticos a primera hora.`;
        const consejo = urgentes >= 2
            ? 'Metodo Pomodoro: bloques de 25 min concentrado en la tarea de mayor prioridad.'
            : 'Regla de los 2 minutos: haz tareas rapidas de inmediato para despejar la lista.';

        return {
            top3,
            resumenEjecutivo: resumen,
            consejoProductividad: consejo
        };
    }

    _seleccionarTop3Local(pendientes) {
        const ponderadas = pendientes.map(t => {
            let score = 0;
            if (t.prioridad === 'Alta') score += 50;
            if (t.prioridad === 'Media') score += 20;
            if (t.categoria === 'Urgente') score += 40;
            if (t.categoria === 'Trabajo') score += 15;
            if (t.fechaLimite) {
                const hoy = new Date().toISOString().split('T')[0];
                if (t.fechaLimite <= hoy) score += 30;
            }
            return { ...t, _score: score };
        });

        ponderadas.sort((a, b) => b._score - a._score);
        return ponderadas.slice(0, 3);
    }
}