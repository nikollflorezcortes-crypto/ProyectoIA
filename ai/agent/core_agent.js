/**
 * IntelliPlan AI - Core Agent (El Agente Inteligente)
 * 
 * Actua como el nucleo cognitivo del sistema. Recibe cualquier texto ingresado
 * por el usuario en lenguaje coloquial, analiza la intencion, estructura la
 * informacion y decide dinamicamente que habilidades (skills) invocar:
 * - SkillCategorizacion
 * - SkillPriorizacion
 * - SkillResumenDiario
 */

import { SkillCategorizacion } from '../skills/categorizacion.js';
import { SkillPriorizacion } from '../skills/priorizacion.js';
import { SkillResumenDiario } from '../skills/resumen_diario.js';

export class GeminiService {
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
        return Boolean(this.apiKey && this.apiKey.length > 10);
    }

    async generateJSON(prompt) {
        if (!this.isAvailable()) {
            throw new Error('API Key de Gemini no configurada.');
        }

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
        if (!rawText) throw new Error('Respuesta vacia de Gemini.');

        try {
            return JSON.parse(rawText);
        } catch (e) {
            // Limpieza si incluye bloques markdown ```json ... ```
            const clean = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
            return JSON.parse(clean);
        }
    }
}

export class CoreAgent {
    constructor() {
        this.geminiService = new GeminiService();
        this.skillCategorizacion = new SkillCategorizacion(this.geminiService);
        this.skillPriorizacion = new SkillPriorizacion(this.geminiService);
        this.skillResumenDiario = new SkillResumenDiario(this.geminiService);

        this.historialPensamiento = [];
    }

    /**
     * Procesa una entrada en lenguaje natural de extremo a extremo
     * @param {string} inputTexto 
     * @param {Function} onStepCallback - Notifica el progreso cognitivo a la interfaz
     * @returns {Promise<Object>} Tarea estructurada
     */
    async procesarEntradaNatural(inputTexto, onStepCallback = null) {
        const log = (paso, detalle) => {
            const entry = { timestamp: new Date().toLocaleTimeString(), paso, detalle };
            this.historialPensamiento.push(entry);
            if (onStepCallback) onStepCallback(entry);
        };

        log('Paso 1: Percepcion', `Analizando entrada natural: "${inputTexto}"`);

        // Extraer titulo limpio
        const tituloLimpio = this._limpiarTitulo(inputTexto);
        log('Paso 2: Comprension de Intencion', `Objetivo identificado: "${tituloLimpio}"`);

        // Invocar Skill 1: Categorizacion
        log('Paso 3: Delegacion a Skill 1', 'Invocando skill-categorizacion para clasificacion semantica...');
        const resCat = await this.skillCategorizacion.ejecutar(inputTexto);
        log('Paso 3: Resultado Skill 1', `Categoria: ${resCat.categoria} (Confianza: ${Math.round(resCat.confianza * 100)}%). Motivo: ${resCat.motivo}`);

        // Invocar Skill 2: Priorizacion
        log('Paso 4: Delegacion a Skill 2', `Invocando skill-priorizacion con contexto de categoria "${resCat.categoria}"...`);
        const resPrio = await this.skillPriorizacion.ejecutar(inputTexto, resCat.categoria);
        log('Paso 4: Resultado Skill 2', `Prioridad: ${resPrio.prioridad} | Plazo: ${resPrio.fechaLimite || 'No especificado'} | Duracion estimada: ${resPrio.tiempoEstimado}`);

        // Ensamblar tarea final
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

        log('Paso 5: Sintesis y Creacion', `Tarea "${tarea.titulo}" generada exitosamente por el Agente.`);
        return tarea;
    }

    /**
     * Invoca la Skill 3 de Resumen y Enfoque Diario
     */
    async generarEnfoqueDelDia(tareas, onStepCallback = null) {
        const log = (paso, detalle) => {
            const entry = { timestamp: new Date().toLocaleTimeString(), paso, detalle };
            if (onStepCallback) onStepCallback(entry);
        };

        log('Enfoque Diario: Inicio', `Recibidas ${tareas.length} tareas. Invocando skill-resumen-diario...`);
        const resultado = await this.skillResumenDiario.ejecutar(tareas);
        log('Enfoque Diario: Completado', `Seleccionadas las ${resultado.top3.length} tareas prioritarias de hoy.`);
        return resultado;
    }

    _limpiarTitulo(texto) {
        let limpio = texto.trim();
        // Quitar muletillas iniciales como "tengo que", "debo", "recordar", "necesito"
        limpio = limpio.replace(/^(tengo que|debo|necesito|hay que|por favor|recuérdame|recordarme|hacer)\s+/i, '');
        // Mayuscula inicial
        return limpio.charAt(0).toUpperCase() + limpio.slice(1);
    }
}