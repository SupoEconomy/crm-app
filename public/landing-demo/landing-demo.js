/**
 * Demo del panel.
 * Control.
 */
(function () {
  'use strict'

  var SCENES = [
    {
      id: 'control',
      label: 'Panel',
      title: 'Tu panel privado',
      text: 'Entras con tu usuario. Ves la campaña, el tiempo del plan y activás o pausás el sistema.',
      duration: 4500,
      section: 'control',
      nav: 1,
      phone: 'idle',
    },
    {
      id: 'pubs',
      label: 'Publicaciones',
      title: 'Cargás texto e imagen',
      text: 'Cada ranura es una pub (foto + texto). El bot las rota en cada ronda de envío.',
      duration: 5000,
      section: 'pubs',
      nav: 3,
      phone: 'draft',
    },
    {
      id: 'groups',
      label: 'Grupos',
      title: 'Elegís los destinos',
      text: 'Marcás solo los grupos de esa carpeta. El resto no recibe ese spam.',
      duration: 4800,
      section: 'groups',
      nav: 2,
      phone: 'groups',
    },
    {
      id: 'timer',
      label: 'Tiempo',
      title: 'Intervalo y horario',
      text: 'Definís cada cuántos minutos se manda, o horas fijas. El bot espera y publica solo.',
      duration: 5000,
      section: 'timer',
      nav: 4,
      phone: 'timer',
    },
    {
      id: 'spam',
      label: 'Spam',
      title: 'Se envía a los grupos',
      text: 'Cuando toca, sale imagen + texto a cada grupo marcado. Ves el progreso en tiempo real.',
      duration: 6500,
      section: 'spam',
      nav: 1,
      phone: 'spam',
    },
    {
      id: 'autoreply',
      label: 'Auto-resp.',
      title: 'Contesta en privado',
      text: 'Si escriben al número del bot, responde con palabras clave. El spam de grupos sigue.',
      duration: 6000,
      section: 'autoreply',
      nav: 5,
      phone: 'autoreply',
    },
  ]

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function buildMarkup(brand) {
    return (
      '<div class="lp-demo" id="lpDemo">' +
      '  <div class="lp-demo-head">' +
      '    <h2>Así se ve tu panel</h2>' +
      '    <p>Recorrido del panel: publicaciones, grupos, tiempos, spam y respuesta en privados. Tocá un paso si querés saltar.</p>' +
      '  </div>' +
      '  <div class="lp-demo-frame" role="region" aria-label="Recorrido del panel">' +
      '    <div class="lp-demo-toolbar">' +
      '      <div class="lp-demo-steps" id="lpDemoSteps" role="tablist"></div>' +
      '    </div>' +
      '    <div class="lp-demo-scene-bar" aria-hidden="true"><i id="lpDemoSceneBar"></i></div>' +
      '    <div class="lp-demo-stage">' +
      '      <div class="lp-demo-panel">' +
      '        <div class="lp-demo-panel-inner">' +
      '          <div class="d-page-header">' +
      '            <div class="d-brand">' +
      '              <h1><i class="fas fa-terminal"></i> <span>' + esc(brand) + '</span></h1>' +
      '              <span class="d-badge">PANEL</span>' +
      '            </div>' +
      '            <p class="d-sub">Gestión de campañas y publicaciones</p>' +
      '          </div>' +
      '          <div class="d-stat-board">' +
      '            <div class="d-stat-group">' +
      '              <span class="d-stat-group-title"><i class="fas fa-folder-open"></i> Campaña · Ofertas</span>' +
      '              <div class="d-stat-mini-row">' +
      '                <div class="d-stat-mini"><span class="d-stat-mini-val">12</span><span class="d-stat-mini-lbl">Grupos</span></div>' +
      '                <div class="d-stat-mini"><span class="d-stat-mini-val">3</span><span class="d-stat-mini-lbl">Pubs</span></div>' +
      '                <div class="d-stat-mini"><span class="d-stat-mini-val">4</span><span class="d-stat-mini-lbl">Marcados</span></div>' +
      '              </div>' +
      '            </div>' +
      '            <div class="d-stat-group">' +
      '              <span class="d-stat-group-title"><i class="fas fa-id-card"></i> Tiempo restante</span>' +
      '              <span class="d-plan-val">1 mes 12 días</span>' +
      '              <span class="d-plan-detail">Panel activo</span>' +
      '            </div>' +
      '          </div>' +
      '          <nav class="d-glass-nav" id="dNav" aria-hidden="true">' +
      '            <a data-n="0"><span class="d-nav-step">1</span> Campaña</a>' +
      '            <a data-n="1" class="is-on"><span class="d-nav-step">2</span> Control</a>' +
      '            <a data-n="2"><span class="d-nav-step">3</span> Grupos</a>' +
      '            <a data-n="3"><span class="d-nav-step">4</span> Publicaciones</a>' +
      '            <a data-n="4"><span class="d-nav-step">5</span> Tiempo</a>' +
      '            <a data-n="5"><span class="d-nav-step">6</span> Auto-resp.</a>' +
      '          </nav>' +
      '          <div class="d-section" data-sec="control">' +
      '            <h2><span class="d-section-step">2</span> Control manual</h2>' +
      '            <p class="d-help">Activás o pausás el spam de la carpeta.</p>' +
      '            <div class="d-btn-row">' +
      '              <button type="button" class="d-btn primary is-on" tabindex="-1"><i class="fas fa-play"></i> SISTEMA ACTIVO</button>' +
      '              <button type="button" class="d-btn danger" tabindex="-1"><i class="fas fa-stop"></i> DESACTIVAR</button>' +
      '              <button type="button" class="d-btn ghost full" tabindex="-1"><i class="fas fa-list"></i> Ver publicaciones (3)</button>' +
      '              <button type="button" class="d-btn ghost full d-btn-accent" tabindex="-1"><i class="fas fa-chart-line"></i> Ver rendimiento</button>' +
      '            </div>' +
      '          </div>' +
      '          <div class="d-section" data-sec="pubs">' +
      '            <h2><span class="d-section-step">4</span> Agregar publicaciones</h2>' +
      '            <p class="d-help">Ranuras con texto e imagen. Se rotan en cada envío.</p>' +
      '            <div class="d-slots">' +
      '              <div class="d-slot"><div class="d-slot-thumb"></div><div><b>Ranura 1</b><span>Promo del día — stock limitado</span></div><span class="tag">IMG</span></div>' +
      '              <div class="d-slot"><div class="d-slot-thumb a2"></div><div><b>Ranura 2</b><span>Catálogo nuevo · manda INFO</span></div><span class="tag">IMG</span></div>' +
      '              <div class="d-slot"><div class="d-slot-thumb a3"></div><div><b>Ranura 3</b><span>Últimas unidades de la semana</span></div><span class="tag">TXT</span></div>' +
      '            </div>' +
      '          </div>' +
      '          <div class="d-section" data-sec="groups">' +
      '            <h2><span class="d-section-step">3</span> Grupos seleccionados</h2>' +
      '            <p class="d-help">Solo estos reciben el spam de Ofertas.</p>' +
      '            <div class="d-groups">' +
      '              <div class="d-group" data-g="0"><span class="box">✓</span> Ventas Lima Centro</div>' +
      '              <div class="d-group" data-g="1"><span class="box">✓</span> Ofertas Norte</div>' +
      '              <div class="d-group" data-g="2"><span class="box">✓</span> Comunidad VIP</div>' +
      '              <div class="d-group" data-g="3"><span class="box">✓</span> Mayoristas</div>' +
      '            </div>' +
      '          </div>' +
      '          <div class="d-section" data-sec="timer">' +
      '            <h2><span class="d-section-step">5</span> Tiempo entre envíos</h2>' +
      '            <p class="d-help">Intervalo continuo u horas fijas del día.</p>' +
      '            <div class="d-time-grid">' +
      '              <div class="d-time-card"><label>Intervalo</label><strong>15 min</strong></div>' +
      '              <div class="d-time-card"><label>Próximo</label><strong id="dCountdown">15:00</strong></div>' +
      '            </div>' +
      '            <div class="d-hours">' +
      '              <span>09:00</span><span class="on">12:00</span><span class="on">16:30</span><span>21:00</span>' +
      '            </div>' +
      '            <div class="d-progress"><i id="dTimerBar"></i></div>' +
      '          </div>' +
      '          <div class="d-section" data-sec="spam">' +
      '            <h2><span class="d-section-step">2</span> Control · enviando</h2>' +
      '            <p class="d-help">Ronda en curso: publicación → grupo.</p>' +
      '            <div class="d-btn-row" style="margin-bottom:10px;">' +
      '              <button type="button" class="d-btn primary is-on full" tabindex="-1"><i class="fas fa-bolt"></i> <span id="dSendStatus">Pub 1 → Ventas Lima</span></button>' +
      '            </div>' +
      '            <div class="d-time-card d-time-card-l">' +
      '              <label>Progreso de la ronda</label>' +
      '              <strong id="dSendPct">0%</strong>' +
      '              <div class="d-progress"><i id="dSendBar"></i></div>' +
      '            </div>' +
      '          </div>' +
      '          <div class="d-section" data-sec="autoreply">' +
      '            <h2><span class="d-section-step">6</span> Respuestas automáticas</h2>' +
      '            <p class="d-help">Privados: palabra clave → mensaje listo.</p>' +
      '            <div class="d-rule"><div class="d-rule-label">Si el mensaje contiene</div><div class="d-rule-val"><em>precio · info · hola</em></div></div>' +
      '            <div class="d-rule"><div class="d-rule-label">El bot responde</div><div class="d-rule-val">Hola. Precio: S/ 49. ¿Quieres el catálogo?</div></div>' +
      '            <div class="d-rule"><div class="d-rule-label">Horario</div><div class="d-rule-val">09:00 – 22:00 · fuera: Te escribo mañana</div></div>' +
      '          </div>' +
      '        </div>' +
      '      </div>' +
      '      <div class="lp-demo-phone">' +
      '        <div class="lp-demo-phone-top">' +
      '          <div class="lp-demo-phone-avatar" id="lpDemoAvatar">B</div>' +
      '          <div><strong id="lpDemoChatName">Tu WhatsApp</strong><small id="lpDemoChatSub">bot conectado</small></div>' +
      '        </div>' +
      '        <div class="lp-demo-chat">' +
      '          <div class="lp-demo-chat-label" id="lpDemoChatLabel">Vista del chat</div>' +
      '          <div class="lp-demo-bubble" data-b="s1"><div class="media"></div>Promo del día — stock limitado<div class="meta"><span>12:01</span><span class="ticks">✓✓</span></div></div>' +
      '          <div class="lp-demo-bubble" data-b="s2"><div class="media alt"></div>Catálogo nuevo · manda INFO<div class="meta"><span>12:16</span><span class="ticks">✓✓</span></div></div>' +
      '          <div class="lp-demo-bubble" data-b="s3">Últimas unidades de la semana<div class="meta"><span>12:31</span><span class="ticks">✓✓</span></div></div>' +
      '          <div class="lp-demo-bubble in" data-b="u1">Hola, precio?<div class="meta"><span>14:02</span></div></div>' +
      '          <div class="lp-demo-typing" id="lpDemoTyping"><span></span><span></span><span></span></div>' +
      '          <div class="lp-demo-bubble" data-b="a1">Hola. Precio: S/ 49. ¿Quieres el catálogo?<div class="meta"><span>14:02</span><span class="ticks">✓✓</span></div></div>' +
      '        </div>' +
      '      </div>' +
      '    </div>' +
      '    <div class="lp-demo-caption">' +
      '      <div class="lp-demo-caption-row">' +
      '        <div class="lp-demo-caption-copy">' +
      '          <div class="lp-demo-kicker" id="lpDemoKicker">Paso 1 de 6</div>' +
      '          <h3 id="lpDemoCapTitle">—</h3>' +
      '          <p id="lpDemoCapText">—</p>' +
      '        </div>' +
      '        <div class="lp-demo-next" id="lpDemoNext">Siguiente →</div>' +
      '      </div>' +
      '      <div class="lp-demo-track"><i id="lpDemoTrack"></i></div>' +
      '    </div>' +
      '  </div>' +
      '</div>'
    )
  }

  function Demo(root) {
    this.root = root
    this.brand = root.getAttribute('data-brand') || 'Bot Spam Ultra'
    this.idx = 0
    this.gen = 0
    this.effectTimers = []
    this.advanceTimer = null
    this.progressTimer = null
    this.alive = true

    root.innerHTML = buildMarkup(this.brand)
    this.el = root.querySelector('#lpDemo')
    this.stepsEl = root.querySelector('#lpDemoSteps')
    this.capTitle = root.querySelector('#lpDemoCapTitle')
    this.capText = root.querySelector('#lpDemoCapText')
    this.kicker = root.querySelector('#lpDemoKicker')
    this.nextHint = root.querySelector('#lpDemoNext')
    this.track = root.querySelector('#lpDemoTrack')
    this.sceneBar = root.querySelector('#lpDemoSceneBar')
    this.avatar = root.querySelector('#lpDemoAvatar')
    this.chatName = root.querySelector('#lpDemoChatName')
    this.chatSub = root.querySelector('#lpDemoChatSub')
    this.chatLabel = root.querySelector('#lpDemoChatLabel')
    this.typing = root.querySelector('#lpDemoTyping')
    this.sendStatus = root.querySelector('#dSendStatus')
    this.sendPct = root.querySelector('#dSendPct')
    this.sendBar = root.querySelector('#dSendBar')
    this.countdown = root.querySelector('#dCountdown')
    this.timerBar = root.querySelector('#dTimerBar')
    this.nav = root.querySelector('#dNav')

    this.buildSteps()
    this.go(0)
  }

  Demo.prototype.clearEffects = function () {
    for (var i = 0; i < this.effectTimers.length; i++) clearTimeout(this.effectTimers[i])
    this.effectTimers = []
    if (this.progressTimer) {
      clearInterval(this.progressTimer)
      this.progressTimer = null
    }
  }

  Demo.prototype.clearAdvance = function () {
    if (this.advanceTimer) {
      clearTimeout(this.advanceTimer)
      this.advanceTimer = null
    }
  }

  /** Micro-animaciones (no controlan el cambio de escena). */
  Demo.prototype.later = function (fn, ms) {
    var self = this
    var t = setTimeout(function () {
      if (!self.alive) return
      fn()
    }, ms || 0)
    this.effectTimers.push(t)
  }

  Demo.prototype.buildSteps = function () {
    var self = this
    this.stepsEl.innerHTML = ''
    for (var i = 0; i < SCENES.length; i++) {
      ;(function (index) {
        var sc = SCENES[index]
        var b = document.createElement('button')
        b.type = 'button'
        b.className = 'lp-demo-step'
        b.innerHTML =
          '<span class="lp-demo-step-num">' +
          String(index + 1).padStart(2, '0') +
          '</span><span class="lp-demo-step-lab">' +
          esc(sc.label) +
          '</span>'
        b.addEventListener('click', function () {
          self.go(index)
        })
        self.stepsEl.appendChild(b)
      })(i)
    }
  }

  Demo.prototype.setProgress = function (pct) {
    var w = Math.max(0, Math.min(100, pct)) + '%'
    if (this.track) this.track.style.width = w
    if (this.sceneBar) this.sceneBar.style.width = w
  }

  /**
   * Cambia de escena y SIEMPRE programa la siguiente.
   * El timer de avance es independiente de efectos e IntersectionObserver.
   */
  Demo.prototype.go = function (i) {
    if (!this.alive) return

    this.clearEffects()
    this.clearAdvance()
    this.gen += 1
    var myGen = this.gen

    this.idx = ((i % SCENES.length) + SCENES.length) % SCENES.length
    var scene = SCENES[this.idx]
    var duration = scene.duration || 4500

    this.applyScene(scene)
    this.updateSteps()
    this.setProgress(0)

    var next = SCENES[(this.idx + 1) % SCENES.length]
    if (this.kicker) {
      this.kicker.textContent = 'Paso ' + (this.idx + 1) + ' de ' + SCENES.length
    }
    if (this.nextHint) {
      this.nextHint.textContent = 'Siguiente: ' + next.label + ' →'
    }

    // Barra del paso (setInterval simple, no depende de rAF ni de view)
    var started = Date.now()
    var self = this
    this.progressTimer = setInterval(function () {
      if (myGen !== self.gen) return
      var t = Math.min(1, (Date.now() - started) / duration)
      self.setProgress(t * 100)
      if (t >= 1 && self.progressTimer) {
        clearInterval(self.progressTimer)
        self.progressTimer = null
      }
    }, 50)

    // AUTO-AVANCE OBLIGATORIO — el corazón de la demo
    this.advanceTimer = setTimeout(function () {
      // Si el usuario saltó a otra escena, gen cambió → no avanzar
      if (myGen !== self.gen) return
      self.go(self.idx + 1)
    }, duration)
  }

  Demo.prototype.updateSteps = function () {
    var btns = this.stepsEl.querySelectorAll('.lp-demo-step')
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('is-active', i === this.idx)
      btns[i].classList.toggle('is-done', i < this.idx)
    }
  }

  Demo.prototype.setNav = function (n) {
    if (!this.nav) return
    var links = this.nav.querySelectorAll('a')
    for (var i = 0; i < links.length; i++) {
      links[i].classList.toggle('is-on', parseInt(links[i].getAttribute('data-n'), 10) === n)
    }
  }

  Demo.prototype.showSection = function (name) {
    var layers = this.el.querySelectorAll('.d-section')
    for (var i = 0; i < layers.length; i++) {
      var on = layers[i].getAttribute('data-sec') === name
      layers[i].classList.toggle('is-on', on)
    }
  }

  Demo.prototype.hideAllBubbles = function () {
    var bubbles = this.el.querySelectorAll('.lp-demo-bubble')
    for (var i = 0; i < bubbles.length; i++) {
      bubbles[i].classList.remove('is-show')
      bubbles[i].style.display = 'none'
    }
    if (this.typing) this.typing.classList.remove('is-on')
  }

  Demo.prototype.revealBubble = function (id, delay) {
    var self = this
    this.later(function () {
      var b = self.el.querySelector('.lp-demo-bubble[data-b="' + id + '"]')
      if (!b) return
      b.style.display = 'block'
      // force reflow
      void b.offsetWidth
      b.classList.add('is-show')
    }, delay || 0)
  }

  Demo.prototype.setChat = function (name, sub, av) {
    if (this.chatName) this.chatName.textContent = name
    if (this.chatSub) this.chatSub.textContent = sub
    if (this.avatar) this.avatar.textContent = av || (name && name.charAt(0)) || '?'
  }

  Demo.prototype.applyScene = function (scene) {
    var self = this
    if (this.capTitle) this.capTitle.textContent = scene.title
    if (this.capText) this.capText.textContent = scene.text
    this.showSection(scene.section)
    this.setNav(scene.nav)
    this.hideAllBubbles()

    var groups = this.el.querySelectorAll('.d-group')
    for (var g = 0; g < groups.length; g++) groups[g].classList.remove('is-on')

    if (this.timerBar) this.timerBar.style.width = '0%'
    if (this.sendBar) this.sendBar.style.width = '0%'
    if (this.sendPct) this.sendPct.textContent = '0%'
    if (this.countdown) this.countdown.textContent = '15:00'

    switch (scene.phone) {
      case 'idle':
        this.setChat('Tu WhatsApp', 'bot conectado · listo', 'B')
        if (this.chatLabel) this.chatLabel.textContent = 'En espera de envíos'
        break
      case 'draft':
        this.setChat('Borrador del panel', 'aún no se envía', 'P')
        if (this.chatLabel) this.chatLabel.textContent = 'Pubs guardadas en el panel'
        this.revealBubble('s1', 400)
        break
      case 'groups':
        this.setChat('Grupos de la carpeta', '4 marcados', '4')
        if (this.chatLabel) this.chatLabel.textContent = 'Destinos de Ofertas'
        this.later(function () {
          var list = self.el.querySelectorAll('.d-group')
          for (var i = 0; i < list.length; i++) {
            ;(function (el, delay) {
              self.later(function () {
                el.classList.add('is-on')
              }, delay)
            })(list[i], i * 320)
          }
        }, 150)
        break
      case 'timer':
        this.setChat('Programación', 'intervalo · horas fijas', 'T')
        if (this.chatLabel) this.chatLabel.textContent = 'Cuenta regresiva al próximo envío'
        this.animateCountdown(scene.duration - 400)
        break
      case 'spam':
        this.setChat('Ventas Lima Centro', 'grupo · enviando', 'V')
        if (this.chatLabel) this.chatLabel.textContent = 'Ronda de spam en curso'
        this.animateSpam()
        break
      case 'autoreply':
        this.setChat('Cliente · privado', 'chat 1 a 1', 'C')
        if (this.chatLabel) this.chatLabel.textContent = 'Auto-respuesta por palabra clave'
        this.animateAutoReply()
        break
    }
  }

  Demo.prototype.animateCountdown = function (ms) {
    var self = this
    var steps = 8
    var i = 0
    function step() {
      if (i > steps) return
      var left = 15 * 60 - Math.floor((i / steps) * 180)
      var m = Math.floor(left / 60)
      var s = left % 60
      if (self.countdown) {
        self.countdown.textContent =
          String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
      }
      if (self.timerBar) self.timerBar.style.width = Math.round((i / steps) * 100) + '%'
      i++
      self.later(step, Math.max(80, Math.floor(ms / steps)))
    }
    step()
  }

  Demo.prototype.animateSpam = function () {
    var self = this
    var targets = [
      { name: 'Ventas Lima Centro', av: 'V', pub: 'Pub 1', b: 's1' },
      { name: 'Ofertas Norte', av: 'O', pub: 'Pub 1', b: 's1' },
      { name: 'Comunidad VIP', av: 'C', pub: 'Pub 2', b: 's2' },
    ]
    for (var i = 0; i < targets.length; i++) {
      ;(function (t, index) {
        self.later(function () {
          self.setChat(t.name, 'grupo · enviando', t.av)
          if (self.sendStatus) self.sendStatus.textContent = t.pub + ' → ' + t.name
          var pct = Math.round(((index + 1) / targets.length) * 100)
          if (self.sendPct) self.sendPct.textContent = pct + '%'
          if (self.sendBar) self.sendBar.style.width = pct + '%'
          self.hideAllBubbles()
          if (self.chatLabel) self.chatLabel.textContent = 'Enviado a ' + t.name
          self.revealBubble(t.b, 40)
          if (index === targets.length - 1) {
            self.later(function () {
              self.revealBubble('s3', 0)
            }, 700)
          }
        }, 400 + index * 1500)
      })(targets[i], i)
    }
  }

  Demo.prototype.animateAutoReply = function () {
    var self = this
    this.later(function () {
      self.revealBubble('u1', 0)
    }, 280)
    this.later(function () {
      if (self.typing) self.typing.classList.add('is-on')
    }, 850)
    this.later(function () {
      if (self.typing) self.typing.classList.remove('is-on')
      self.revealBubble('a1', 0)
    }, 2000)
  }

  function boot() {
    var root = document.getElementById('lpDemoRoot')
    if (!root) return
    // evitar inicializar dos veces
    if (root.getAttribute('data-booted') === '1') return
    root.setAttribute('data-booted', '1')
    try {
      new Demo(root)
    } catch (err) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[landing-demo]', err)
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
  } else {
    boot()
  }
})()
