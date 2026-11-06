
export function initTutorial() {

    
    ['tour-overlay','tour-glow','tour-tooltip'].forEach(id => {
        const elemento = document.getElementById(id);
        if (elemento) elemento.remove();
    });

    const pasos = [
        {
            elemento: 'h1',
            titulo: '¡Bienvenido al Panel de Control!',
            contenido: 'Este es el cerebro del Bot Spam. Desde aquí controlas absolutamente todo.',
            lado: 'bottom'
        },
        {
            elemento: '#tour-campaign',
            titulo: 'Gestor de Campañas',
            contenido: 'Crea y cambia entre carpetas para organizar distintas campañas. ¡Puedes tener una por cada negocio!',
            lado: 'bottom'
        },
        {
            elemento: '.control-grid',
            titulo: 'Control manual',
            contenido: 'Lo pusimos arriba para que no tengas que bajar hasta el fondo. ACTIVAR enciende el spam automático y DESACTIVAR lo pausa al instante. El contador arranca cuando terminen los envíos.',
            lado: 'bottom'
        },
        {
            elemento: '#tour-groups',
            titulo: 'Seleccionar Grupos',
            contenido: 'Aquí eliges a qué grupos llegará el spam. Puedes marcarlos todos de un golpe.',
            lado: 'bottom'
        },
        {
            elemento: '#btnToggleAll',
            titulo: 'Botón Seleccionar Todos',
            contenido: 'Un solo clic marca o desmarca todos los grupos disponibles para esta campaña.',
            lado: 'bottom'
        },
        {
            elemento: '#pubSlotsContainer',
            titulo: 'Agregar Publicaciones',
            contenido: 'Acá subes tus imágenes o videos con su texto. Cada "Ranura" es una publicación distinta que el bot rotará en cada envío. Puedes tener hasta 5 publicaciones por campaña.',
            lado: 'top'
        },
        {
            elemento: '#addSlotBtn',
            titulo: 'Nueva Ranura',
            contenido: 'Haz clic aquí para agregar una segunda, tercera publicación (hasta 5). El bot las enviará todas una por una en cada ciclo.',
            lado: 'top'
        },
        {
            elemento: '#tour-timer',
            titulo: 'Temporizador de Reenvío',
            contenido: 'Define cuántos minutos espera el bot entre cada ronda de envíos masivos.\nEj: Pones 10 minutos, el bot enviará cada 10 minutos el spam.',
            lado: 'bottom'
        },
        {
            elemento: '#spamScheduleForm',
            titulo: 'Programar inicio y pausa',
            contenido: 'Opcional. Activa el interruptor para que el spam encienda y apague solo cada día. Elige hora de inicio y de pausa, pulsa GUARDAR HORARIO y listo. Si lo dejas apagado, usa el Control manual de arriba.',
            lado: 'top'
        },
        {
            elemento: '#tour-redeem',
            titulo: 'Canjear códigos',
            contenido: '¿Tienes un código de BOT SPAM ULTRA? Escríbelo aquí y canjéalo para sumar tiempo a tu panel al instante. Cada código solo se puede usar una vez por cuenta, y puedes revisar tu historial de canjes.',
            lado: 'top'
        }
    ].filter(p => p.elemento === 'h1' || document.querySelector(p.elemento));

    let pasoActual = 0;

    
    const capa = document.createElement('div');
    capa.id = 'tour-overlay';
    capa.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:2147483640', 'pointer-events:auto',
        'background:rgba(0,0,0,0.88)', 'display:block',
        'transition:clip-path 0.55s cubic-bezier(0.19,1,0.22,1), opacity 0.4s ease'
    ].join(';') + ';';

    
    const bloquearClicks = (e) => {
        if (!panelInfo.contains(e.target)) {
            e.stopPropagation();
            if (e.cancelable) e.preventDefault();
        }
    };
    document.addEventListener('click', bloquearClicks, true);
    document.addEventListener('mousedown', bloquearClicks, true);
    document.addEventListener('mouseup', bloquearClicks, true);
    document.addEventListener('touchstart', bloquearClicks, { capture: true, passive: false });
    document.addEventListener('touchend', bloquearClicks, { capture: true, passive: false });
    
    capa.style.clipPath = 'polygon(0% 0%, 0% 100%, 100% 100%, 100% 0%)';

    
    const brillo = document.createElement('div');
    brillo.id = 'tour-glow';
    brillo.style.cssText = [
        'position:fixed', 'border-radius:10px', 'z-index:2147483641', 'pointer-events:none',
        'border:2px solid rgba(0,255,153,0.85)',
        'box-shadow:0 0 22px rgba(0,255,153,0.55),inset 0 0 12px rgba(0,255,153,0.12)',
        'transition:all 0.55s cubic-bezier(0.19,1,0.22,1)',
        'width:0', 'height:0', 'left:50%', 'top:50%', 'opacity:0'
    ].join(';') + ';';

    
    const panelInfo = document.createElement('div');
    panelInfo.id = 'tour-tooltip';
    panelInfo.style.cssText = [
        'position:fixed', 'width:300px', 'box-sizing:border-box', 'background:#0d0d0d',
        'border-radius:14px', 'border:1px solid #00ff99', 'padding:20px',
        'box-shadow:0 15px 40px rgba(0,0,0,0.95)',
        'z-index:2147483647', 'pointer-events:auto',
        'opacity:0', 'visibility:hidden', 'overflow:hidden',
        'transition:opacity 0.35s ease'
    ].join(';') + ';';

    document.body.appendChild(capa);
    document.body.appendChild(brillo);
    document.body.appendChild(panelInfo);

    function aplicarHueco(rect, margen) {
        margen = margen || 12;
        const x1 = rect.left - margen, y1 = rect.top - margen;
        const x2 = rect.right + margen, y2 = rect.bottom + margen;
        
        capa.style.clipPath =
            'polygon(' +
            '0% 0%, 0% 100%, ' +
            x1 + 'px 100%, ' +
            x1 + 'px ' + y1 + 'px, ' +
            x2 + 'px ' + y1 + 'px, ' +
            x2 + 'px ' + y2 + 'px, ' +
            x1 + 'px ' + y2 + 'px, ' +
            x1 + 'px 100%, ' +
            '100% 100%, 100% 0%)';
    }

    function actualizarTour() {
        const paso = pasos[pasoActual];
        let objetivo = document.querySelector(paso.elemento);

    
        document.body.style.overflow = 'hidden';

        if (objetivo) {
            objetivo.scrollIntoView({ behavior: 'instant', block: 'center' });
        }

        requestAnimationFrame(() => requestAnimationFrame(() => {
            let rect;
            if (objetivo) {
                rect = objetivo.getBoundingClientRect();
                aplicarHueco(rect, 12);
                brillo.style.width   = (rect.width  + 24) + 'px';
                brillo.style.height  = (rect.height + 24) + 'px';
                brillo.style.left    = (rect.left   - 12) + 'px';
                brillo.style.top     = (rect.top    - 12) + 'px';
                brillo.style.opacity = '1';
            } else {
                
                capa.style.clipPath = 'polygon(0% 0%, 0% 100%, 100% 100%, 100% 0%)';
                brillo.style.opacity = '0';
                rect = { left: window.innerWidth/2 - 150, top: window.innerHeight/2, bottom: window.innerHeight/2, right: window.innerWidth/2 + 150, width: 300, height: 0 };
            }

            
            let topInfo  = paso.lado === 'top' ? rect.top - 235 : rect.bottom + 20;
            let leftInfo = rect.left + rect.width / 2 - 150;
            leftInfo = Math.max(15, Math.min(leftInfo, window.innerWidth - 315));
            if (topInfo < 15)                       topInfo = rect.bottom + 20;
            if (topInfo > window.innerHeight - 240) topInfo = rect.top - 235;
            if (topInfo < 15)                       topInfo = (window.innerHeight / 2) - 120;

            panelInfo.style.top        = topInfo  + 'px';
            panelInfo.style.left       = leftInfo + 'px';
            panelInfo.style.opacity    = '1';
            panelInfo.style.visibility = 'visible';

            const esUltimo = pasoActual === pasos.length - 1;
            panelInfo.innerHTML =
                '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
                    '<div style="color:#00ff99;font-weight:800;text-transform:uppercase;font-size:1.05em;letter-spacing:0.5px;">' + paso.titulo + '</div>' +
                    '<span style="color:#00ff99;font-size:0.75em;font-weight:800;letter-spacing:1px;background:rgba(0,255,153,0.1);padding:2px 8px;border-radius:4px;border:1px solid rgba(0,255,153,0.2);">' + (pasoActual + 1) + ' / ' + pasos.length + '</span>' +
                '</div>' +
                '<div style="color:#bbb;font-size:0.92em;line-height:1.6;margin-bottom:24px;min-height:50px;">'
                    + paso.contenido + '</div>' +
                
                '<div style="display:flex;align-items:center;justify-content:flex-end;border-top:1px solid #222;padding-top:16px;margin-top:4px;">' +
                    '<button id="tour-next" style="display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#00ff99,#00cc7a);border:none;color:#000;padding:10px 22px;border-radius:10px;cursor:pointer;font-weight:700;font-size:0.9em;box-shadow:0 4px 15px rgba(0,255,153,0.25);transition:all 0.2s;white-space:nowrap;">'
                        + (esUltimo ? 'FINALIZAR' : 'SIGUIENTE')
                        + (esUltimo 
                            ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-left:2px;"><polyline points="20 6 9 17 4 12"></polyline></svg>'
                            : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-left:2px;"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>'
                        ) +
                    '</button>' +
                '</div>';

            document.getElementById('tour-next').onclick = () => {
                if (pasoActual < pasos.length - 1) { pasoActual++; actualizarTour(); }
                else                                  { terminarTour(); }
            };
        }));
    }

    function terminarTour() {
        capa.style.opacity = '0';
        brillo.style.opacity    = '0';
        panelInfo.style.opacity = '0';
        
        
        document.removeEventListener('click', bloquearClicks, true);
        document.removeEventListener('mousedown', bloquearClicks, true);
        document.removeEventListener('mouseup', bloquearClicks, true);
        document.removeEventListener('touchstart', bloquearClicks, { capture: true, passive: false });
        document.removeEventListener('touchend', bloquearClicks, { capture: true, passive: false });
        document.body.style.overflow = '';

        setTimeout(() => {
            capa.remove(); brillo.remove(); panelInfo.remove();
            localStorage.setItem('tutorialCompleted', 'true');
        }, 450);
    }

    actualizarTour();
}
