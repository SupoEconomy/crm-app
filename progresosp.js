
/**
 * progresosp.js - Lógica para manejar el progreso de guardado masivo en español
 */

export class GestorProgreso {
    constructor() {
        this.progresoActual = 0;
        this.totalTareas = 0;
        this.estaCargando = false;
        this.mensajeEstado = "";
    }

    iniciar(total, mensajeInicial = "Iniciando guardado...") {
        this.totalTareas = total;
        this.progresoActual = 0;
        this.estaCargando = true;
        this.mensajeEstado = mensajeInicial;
    }

    actualizar(incremento = 1, nombreGrupo = "") {
        if (!this.estaCargando) return;
        
        this.progresoActual += incremento;
        if (this.progresoActual > this.totalTareas) {
            this.progresoActual = this.totalTareas;
        }

        const porcentaje = Math.round((this.progresoActual / this.totalTareas) * 100);
        this.mensajeEstado = `Guardando en: ${nombreGrupo || 'procesando...'} | Progreso: ${porcentaje}%`;
        
        return {
            porcentaje,
            mensaje: this.mensajeEstado,
            completado: this.progresoActual >= this.totalTareas
        };
    }

    finalizar(mensajeFinal = "¡Guardado completado!") {
        this.estaCargando = false;
        this.mensajeEstado = mensajeFinal;
        return {
            porcentaje: 100,
            mensaje: this.mensajeEstado,
            completado: true
        };
    }
}

export const spinnerHtml = `
<div id="spinner-progreso" style="display: none;" class="fixed inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center z-[9999]">
    <div class="bg-gray-900 p-8 rounded-2xl border border-cyan-500 shadow-[0_0_20px_rgba(6,182,212,0.5)] flex flex-col items-center max-w-sm w-full">
        <!-- Spinner Animado -->
        <div class="relative w-24 h-24 mb-6">
            <div class="absolute inset-0 border-4 border-cyan-500/20 rounded-full"></div>
            <div class="absolute inset-0 border-4 border-cyan-500 rounded-full border-t-transparent animate-spin"></div>
        </div>
        
        <!-- Texto de Progreso -->
        <h3 id="titulo-spinner" class="text-white text-xl font-bold mb-2 text-center">Guardando Publicaciones</h3>
        <p id="mensaje-progreso" class="text-cyan-400 text-sm mb-6 text-center h-10">Iniciando proceso...</p>
        
        <!-- Barra de Progreso -->
        <div class="w-full bg-gray-800 rounded-full h-4 overflow-hidden border border-gray-700">
            <div id="barra-progreso" class="bg-gradient-to-r from-cyan-600 to-blue-500 h-full w-0 transition-all duration-300"></div>
        </div>
        <div id="texto-porcentaje" class="text-white text-xs mt-2 font-mono">0%</div>
    </div>
</div>

<script>
window.gestorSpinner = {
    mostrar: function(titulo = "Guardando...") {
        const spinner = document.getElementById('spinner-progreso');
        if (spinner) {
            spinner.style.display = 'flex';
        }
        document.getElementById('titulo-spinner').innerText = titulo;
        this.actualizar(0, "Preparando...");
    },
    ocultar: function() {
        const spinner = document.getElementById('spinner-progreso');
        if (spinner) {
            spinner.style.display = 'none';
        }
    },
    actualizar: function(porcentaje, mensaje) {
        document.getElementById('barra-progreso').style.width = porcentaje + '%';
        document.getElementById('texto-porcentaje').innerText = porcentaje + '%';
        if (mensaje) document.getElementById('mensaje-progreso').innerText = mensaje;
    }
}
</script>
`;
