async function enviarPublicacionMasiva(event) {
  event.preventDefault();
  const form = event.target;
  const formData = new FormData(form);

  const texts = [0, 1, 2, 3, 4].some(function (i) {
    const val = formData.get('text_' + i);
    return val && val.trim() !== '';
  });
  const files = Array.from(form.querySelectorAll('input[type="file"]')).some(function (input) {
    return input.files.length > 0;
  });

  if (!texts && !files) {
    alert('Debes completar al menos una ranura con texto o multimedia.');
    return;
  }

  const spinner = document.getElementById('spinner-progreso');
  if (spinner) {
    spinner.style.display = 'flex';
    document.getElementById('titulo-spinner').innerText = 'Guardando Publicaciones...';
    document.getElementById('mensaje-progreso').innerText = 'Iniciando proceso (pueden ser muchos grupos)...';
    document.getElementById('barra-progreso').style.width = '5%';
    document.getElementById('texto-porcentaje').innerText = '5%';
  }

  try {
    const response = await fetch('/add-pub', {
      method: 'POST',
      body: formData,
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'Accept': 'text/plain',
      },
    });

    if (!response.ok) {
      const errorMsg = await response.text();
      alert('Error: ' + errorMsg);
      if (spinner) spinner.style.display = 'none';
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    function parseChunk(chunk) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.type === 'progress') {
            const percent = data.percent || 0;
            document.getElementById('barra-progreso').style.width = percent + '%';
            document.getElementById('texto-porcentaje').innerText = percent + '%';
            document.getElementById('mensaje-progreso').innerText =
              'Guardando grupo ' + data.groupName + ' (' + data.processedItems + '/' + data.totalItems + ') - Ranura ' + data.slot + '/' + data.slotCount;
          } else if (data.type === 'done') {
            document.getElementById('barra-progreso').style.width = '100%';
            document.getElementById('texto-porcentaje').innerText = '100%';
            document.getElementById('mensaje-progreso').innerText = data.message || '¡Finalizado!';
          } else if (data.type === 'error') {
            throw new Error(data.message || 'Error desconocido');
          }
        } catch (e) {
          console.error('Error parseando progreso:', e, line);
        }
      }
    }

    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      parseChunk(decoder.decode(chunk.value, { stream: true }));
    }
    if (buffer.trim()) {
      parseChunk('\n');
    }

    setTimeout(function () {
      window.location.reload();
    }, 1200);
  } catch (error) {
    console.error('Error al guardar:', error);
    alert('Ocurrió un error al procesar la solicitud.');
    if (spinner) spinner.style.display = 'none';
  }
}

window.enviarPublicacionMasiva = enviarPublicacionMasiva;

document.addEventListener('DOMContentLoaded', function () {
  const multiForm = document.getElementById('multiPubForm');
  if (multiForm) multiForm.addEventListener('submit', enviarPublicacionMasiva);

  document.querySelectorAll('.section').forEach(function (el, i) {
    el.classList.add('reveal-on-scroll');
    el.style.transitionDelay = (i * 0.07) + 's';
  });

  const revealObs = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) e.target.classList.add('visible');
      });
    },
    { threshold: 0.06, rootMargin: '0px 0px -30px 0px' }
  );
  document.querySelectorAll('.reveal-on-scroll').forEach(function (el) {
    revealObs.observe(el);
  });
  document.querySelectorAll('.section.reveal-on-scroll').forEach(function (el) {
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight) el.classList.add('visible');
  });
});
