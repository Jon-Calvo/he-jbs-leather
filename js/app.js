// ============================================================
// APP.JS — Lógica principal del frontend
// ============================================================

// ——— ESTADO GLOBAL ———————————————————————————————————————————
const State = {
  referencias: null,
  equipo: [],           // colaboradores seleccionados
  solicitudesCache: [],
  proximoNro: null,
  editandoUsuario: null
};

// ——— INICIALIZACIÓN —————————————————————————————————————————

document.addEventListener('DOMContentLoaded', () => {
  if (Sesion.estaActiva) {
    iniciarApp();
  } else {
    mostrarPantalla('login');
  }

  bindLogin();
  bindSidebar();
  bindNuevaSolicitud();
  bindModal();
  bindAdmin();
});

// ——— NAVEGACIÓN ——————————————————————————————————————————————

function mostrarPantalla(nombre) {
  document.getElementById('screen-login').classList.toggle('active', nombre === 'login');
  document.getElementById('screen-login').classList.toggle('hidden', nombre !== 'login');
  document.getElementById('screen-app').classList.toggle('hidden', nombre !== 'app');
}

function mostrarView(nombre) {
  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('active', false);
    v.classList.toggle('hidden', true);
  });
  const v = document.getElementById(`view-${nombre}`);
  if (v) {
    v.classList.remove('hidden');
    v.classList.add('active');
  }

  document.querySelectorAll('.nav-link').forEach(l => {
    l.classList.toggle('active', l.dataset.view === nombre);
  });

  document.getElementById('topbar-title').textContent = {
    dashboard: 'Dashboard',
    solicitudes: 'Mis Solicitudes',
    nueva: 'Nueva Solicitud',
    aprobacion: 'Aprobación',
    admin: 'Administración'
  }[nombre] || nombre;

  if (nombre === 'dashboard') cargarDashboard();
  if (nombre === 'solicitudes') cargarSolicitudes();
  if (nombre === 'nueva') iniciarWizard();
  if (nombre === 'aprobacion') cargarAprobacion();
  if (nombre === 'admin') cargarAdmin();

  // Cerrar sidebar en mobile
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
}

// ——— LOGIN ————————————————————————————————————————————————————

function bindLogin() {
  const form = document.getElementById('form-login');
  const btnToggle = document.getElementById('btn-toggle-pass');
  const inp = document.getElementById('inp-pass');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const usuario = document.getElementById('inp-usuario').value.trim();
    const pass = inp.value;
    const errorDiv = document.getElementById('login-error');
    const btnText = document.getElementById('btn-login-text');
    const spinner = document.getElementById('btn-login-spinner');

    if (!usuario || !pass) {
      mostrarError(errorDiv, 'Ingresá usuario y contraseña.');
      return;
    }

    btnText.classList.add('hidden');
    spinner.classList.remove('hidden');
    errorDiv.classList.add('hidden');

    try {
      const res = await API.login(usuario, pass);
      if (res?.ok) {
        Sesion.guardar(res);
        iniciarApp();
      } else {
        mostrarError(errorDiv, res?.error || 'Error al iniciar sesión.');
      }
    } catch (err) {
      mostrarError(errorDiv, 'No se pudo conectar al servidor. Verificá tu conexión.');
    } finally {
      btnText.classList.remove('hidden');
      spinner.classList.add('hidden');
    }
  });

  btnToggle.addEventListener('click', () => {
    inp.type = inp.type === 'password' ? 'text' : 'password';
    btnToggle.textContent = inp.type === 'password' ? '👁' : '🙈';
  });
}

function iniciarApp() {
  mostrarPantalla('app');

  // Llenar datos de usuario en nav
  const nombre = Sesion.nombre || '';
  const partes = nombre.split(' ');
  const iniciales = partes.length >= 2
    ? partes[0][0] + partes[partes.length - 1][0]
    : nombre.substring(0, 2);

  document.getElementById('nav-avatar').textContent = iniciales.toUpperCase();
  document.getElementById('nav-nombre').textContent = nombre;
  document.getElementById('nav-area').textContent = Sesion.area || '';

  // Mostrar/ocultar ítems de nav según rol
  if (Sesion.esAdmin) {
    document.getElementById('nav-aprobacion').classList.remove('hidden');
    document.getElementById('nav-admin').classList.remove('hidden');
  }

  // Cargar referencias en background
  API.getReferencias().then(r => {
    if (r?.ok) State.referencias = r.data;
  });

  mostrarView('dashboard');
}

// ——— SIDEBAR ————————————————————————————————————————————————

function bindSidebar() {
  document.getElementById('btn-open-sidebar').addEventListener('click', () => {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('open');
  });

  document.getElementById('btn-close-sidebar').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
  });

  document.getElementById('sidebar-overlay').addEventListener('click', () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
  });

  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      mostrarView(link.dataset.view);
    });
  });

  document.getElementById('btn-logout').addEventListener('click', async () => {
    await API.logout();
    Sesion.limpiar();
    mostrarPantalla('login');
    document.getElementById('form-login').reset();
  });

  document.getElementById('topbar-refresh').addEventListener('click', () => {
    const activeView = document.querySelector('.view.active')?.id.replace('view-', '');
    if (activeView) mostrarView(activeView);
  });
}

// ——— DASHBOARD ———————————————————————————————————————————————

async function cargarDashboard() {
  document.getElementById('dash-bienvenida').textContent =
    `Bienvenido, ${Sesion.nombre}`;

  // Reset stats
  ['pendientes','aprobadas','rechazadas','horas'].forEach(k => {
    document.getElementById(`stat-${k}`).textContent = '—';
  });

  try {
    const res = await API.getDashboard();
    if (!res?.ok) return;

    const d = res.data;
    document.getElementById('stat-pendientes').textContent = d.resumen.pendientes;
    document.getElementById('stat-aprobadas').textContent = d.resumen.aprobadas;
    document.getElementById('stat-rechazadas').textContent = d.resumen.rechazadas;
    document.getElementById('stat-horas').textContent = d.resumen.totalHoras.toFixed(1);

    // Badge de pendientes en nav
    if (d.resumen.pendientes > 0 && Sesion.esAdmin) {
      const badge = document.getElementById('badge-pendientes');
      badge.textContent = d.resumen.pendientes;
      badge.classList.remove('hidden');
    }

    // Gráfico de barras sectores
    const chart = document.getElementById('chart-sectores');
    chart.innerHTML = '';
    if (d.porSector && d.porSector.length > 0) {
      const maxVal = d.porSector[0][1];
      d.porSector.forEach(([sector, cant]) => {
        const pct = maxVal > 0 ? (cant / maxVal * 100) : 0;
        chart.innerHTML += `
          <div class="chart-bar-item">
            <div class="chart-bar-label" title="${sector}">${sector}</div>
            <div class="chart-bar-track">
              <div class="chart-bar-fill" style="width:${pct}%"></div>
            </div>
            <div class="chart-bar-val">${cant}</div>
          </div>
        `;
      });
    } else {
      chart.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;">Sin datos aún</p>';
    }
  } catch (err) {
    mostrarToast('Error al cargar el dashboard', 'error');
  }
}

// ——— SOLICITUDES ————————————————————————————————————————————

async function cargarSolicitudes(filtros = {}) {
  const loading = document.getElementById('sol-loading');
  const empty = document.getElementById('sol-empty');
  const lista = document.getElementById('lista-solicitudes');

  loading.classList.remove('hidden');
  empty.classList.add('hidden');
  lista.classList.add('hidden');

  try {
    const nro = document.getElementById('filter-nro')?.value.trim();
    const status = document.getElementById('filter-status')?.value;
    const desde = document.getElementById('filter-desde')?.value;

    const params = {};
    if (nro) params.nroSolicitud = nro;
    if (status) params.status = status;
    if (desde) params.desde = desde;

    const res = await API.getSolicitudes(params);
    loading.classList.add('hidden');

    if (!res?.ok || !res.data?.length) {
      empty.classList.remove('hidden');
      return;
    }

    State.solicitudesCache = res.data;
    lista.classList.remove('hidden');
    lista.innerHTML = '';

    // Agrupar por NroSolicitud
    const grupos = agruparPorNro(res.data);
    grupos.forEach(grupo => {
      lista.appendChild(crearTarjetaSolicitud(grupo));
    });

    document.getElementById('btn-ir-nueva').addEventListener('click', () => mostrarView('nueva'));
  } catch (err) {
    loading.classList.add('hidden');
    empty.classList.remove('hidden');
    mostrarToast('Error al cargar solicitudes', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-filtrar')?.addEventListener('click', () => cargarSolicitudes());
  document.getElementById('btn-exportar')?.addEventListener('click', exportarCSV);
});

function agruparPorNro(filas) {
  const mapa = new Map();
  filas.forEach(f => {
    const nro = String(f.NroSolicitud);
    if (!mapa.has(nro)) {
      mapa.set(nro, { ...f, _colaboradores: [] });
    }
    mapa.get(nro)._colaboradores.push({
      legajo: f.Legajo,
      nombre: f.Colaborador,
      ib: f.IB_Colaborador,
      ranking: f.RankingHoras_Snapshot,
      habilitacion: f.HabilitacionSnapshot,
      categoria: f.Categoria
    });
  });
  return [...mapa.values()].reverse();
}

function crearTarjetaSolicitud(grupo) {
  const div = document.createElement('div');
  const statusClass = {
    'PENDIENTE APROBACION': 'status-pendiente',
    'APROBADA': 'status-aprobada',
    'RECHAZADA': 'status-rechazada',
    'CANCELADA': 'status-cancelada'
  }[grupo.StatusSolicitud] || '';

  const fecha = formatearFecha(grupo.FechaInicioExtra);
  const badge = badgeStatus(grupo.StatusSolicitud);

  div.className = `solicitud-card ${statusClass}`;
  div.innerHTML = `
    <div class="sol-row-1">
      <span class="sol-nro">N° ${grupo.NroSolicitud}</span>
      <span class="sol-solicitante">${grupo.NombreSolicitante || grupo.UsuarioSolicitante}</span>
      ${badge}
    </div>
    <div class="sol-row-2">
      <span class="sol-meta"><span>Fecha:</span> ${fecha}</span>
      <span class="sol-meta"><span>Horario:</span> ${grupo.HoraInicio}–${grupo.HoraFin}</span>
      <span class="sol-meta"><span>Motivo:</span> ${grupo.MotivoExtra}</span>
      <span class="sol-meta"><span>Sector:</span> ${grupo.SectorExtra}</span>
      <span class="sol-meta"><span>Equipo:</span> ${grupo._colaboradores.length} persona(s)</span>
    </div>
  `;
  div.addEventListener('click', () => mostrarDetalleSolicitud(grupo));
  return div;
}

function mostrarDetalleSolicitud(grupo) {
  const modal = document.getElementById('modal-overlay');
  document.getElementById('modal-title').textContent = `Solicitud N° ${grupo.NroSolicitud}`;

  const content = document.getElementById('modal-content');
  const badge = badgeStatus(grupo.StatusSolicitud);

  content.innerHTML = `
    <div class="resumen-card">
      <div class="resumen-row">
        <div class="resumen-label">STATUS</div>
        <div class="resumen-val">${badge}</div>
      </div>
      <div class="resumen-row">
        <div class="resumen-label">SOLICITANTE</div>
        <div class="resumen-val">${grupo.NombreSolicitante || grupo.UsuarioSolicitante}</div>
      </div>
      <div class="resumen-row">
        <div class="resumen-label">FECHA REALIZACIÓN</div>
        <div class="resumen-val">${formatearFecha(grupo.FechaInicioExtra)}</div>
      </div>
      <div class="resumen-row">
        <div class="resumen-label">HORARIO</div>
        <div class="resumen-val">${grupo.HoraInicio} a ${grupo.HoraFin} (${grupo.TotalHoras} hs)</div>
      </div>
      <div class="resumen-row">
        <div class="resumen-label">MOTIVO</div>
        <div class="resumen-val">${grupo.MotivoExtra}</div>
      </div>
      <div class="resumen-row">
        <div class="resumen-label">SECTOR</div>
        <div class="resumen-val">${grupo.SectorExtra}</div>
      </div>
      ${grupo.ObservacionExtra ? `
      <div class="resumen-row">
        <div class="resumen-label">OBSERVACIÓN</div>
        <div class="resumen-val">${grupo.ObservacionExtra}</div>
      </div>` : ''}
      <div class="resumen-row" style="flex-direction:column; gap:8px; padding-top:12px;">
        <div class="resumen-label">EQUIPO (${grupo._colaboradores.length})</div>
        <div class="resumen-colab-list">
          ${grupo._colaboradores.map(c => `
            <div class="resumen-colab">
              <span style="font-family:var(--mono);font-size:0.78rem;color:var(--text-muted)">${c.legajo}</span>
              <span style="flex:1;font-size:0.85rem">${c.nombre}</span>
              ${badgeHabilitacion(c.habilitacion)}
              <span style="font-family:var(--mono);font-size:0.75rem;color:var(--text-muted)">${c.ranking || 0} hs</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  // Mostrar botones de aprobación si es admin y está pendiente
  const actions = document.getElementById('modal-actions');
  if (Sesion.esAdmin && grupo.StatusSolicitud === 'PENDIENTE APROBACION') {
    actions.classList.remove('hidden');
    document.getElementById('modal-btn-aprobar').onclick = () => cambiarStatus(grupo.NroSolicitud, 'APROBADA');
    document.getElementById('modal-btn-rechazar').onclick = () => cambiarStatus(grupo.NroSolicitud, 'RECHAZADA');
  } else {
    actions.classList.add('hidden');
  }

  modal.classList.remove('hidden');
}

async function cambiarStatus(nroSolicitud, nuevoStatus) {
  try {
    const res = await API.actualizarStatus(nroSolicitud, nuevoStatus);
    if (res?.ok) {
      cerrarModal();
      mostrarToast(`Solicitud ${nuevoStatus.toLowerCase()} correctamente`, 'success');
      cargarSolicitudes();
      cargarDashboard();
    } else {
      mostrarToast(res?.error || 'Error al cambiar estado', 'error');
    }
  } catch (err) {
    mostrarToast('Error al procesar', 'error');
  }
}

// ——— APROBACIÓN ————————————————————————————————————————————

async function cargarAprobacion() {
  const lista = document.getElementById('lista-aprobacion');
  lista.innerHTML = '<div class="loading-state"><div class="spinner-lg"></div><p>Cargando...</p></div>';

  const status = document.getElementById('filter-apro-status')?.value || 'PENDIENTE APROBACION';
  const desde = document.getElementById('filter-apro-desde')?.value;

  try {
    const params = { incluirRechazadas: 'true' };
    if (status) params.status = status;
    if (desde) params.desde = desde;

    const res = await API.getSolicitudes(params);
    lista.innerHTML = '';

    if (!res?.ok || !res.data?.length) {
      lista.innerHTML = '<div class="empty-state"><div class="empty-icon">◎</div><p>No hay solicitudes</p></div>';
      return;
    }

    const grupos = agruparPorNro(res.data);
    grupos.forEach(grupo => lista.appendChild(crearTarjetaSolicitud(grupo)));
  } catch (err) {
    lista.innerHTML = '<div class="empty-state"><p>Error al cargar</p></div>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-filtrar-apro')?.addEventListener('click', cargarAprobacion);
});

// ——— NUEVA SOLICITUD (WIZARD) ————————————————————————————————

function bindNuevaSolicitud() {
  // Step 1 → 2
  document.getElementById('btn-step1-next').addEventListener('click', () => {
    if (!validarStep1()) return;
    mostrarStep(2);
    cargarColaboradores('');
  });

  document.getElementById('btn-step2-back').addEventListener('click', () => mostrarStep(1));
  document.getElementById('btn-step2-next').addEventListener('click', () => {
    if (State.equipo.length === 0) {
      mostrarToast('Agregá al menos un colaborador al equipo', 'error');
      return;
    }
    mostrarStep(3);
    mostrarResumen();
  });

  document.getElementById('btn-step3-back').addEventListener('click', () => mostrarStep(2));
  document.getElementById('btn-enviar').addEventListener('click', enviarSolicitud);

  document.getElementById('btn-ver-solicitud').addEventListener('click', () => mostrarView('solicitudes'));
  document.getElementById('btn-nueva-otra').addEventListener('click', () => iniciarWizard());

  // Cálculo de horas en tiempo real
  document.getElementById('f-hora-inicio').addEventListener('input', calcularTotalHoras);
  document.getElementById('f-hora-fin').addEventListener('input', calcularTotalHoras);

  // Formato HH:MM automático
  ['f-hora-inicio', 'f-hora-fin'].forEach(id => {
    document.getElementById(id).addEventListener('blur', (e) => {
      const val = e.target.value.trim();
      const match = val.match(/^(\d{1,2}):?(\d{2})?$/);
      if (match) {
        const h = match[1].padStart(2, '0');
        const m = (match[2] || '00').substring(0, 2);
        e.target.value = `${h}:${m}`;
        calcularTotalHoras();
      }
    });
  });

  // Búsqueda de colaboradores
  let searchTimeout;
  document.getElementById('search-colab').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => cargarColaboradores(e.target.value), 400);
  });

  document.getElementById('btn-ir-nueva')?.addEventListener('click', () => mostrarView('nueva'));
}

async function iniciarWizard() {
  State.equipo = [];
  mostrarStep(1);

  // Resetear form
  ['f-responsable','f-fecha','f-obs','f-hora-inicio','f-hora-fin'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // Fecha de hoy por defecto
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('f-fecha').value = hoy;
  document.getElementById('total-horas-val').textContent = '0:00 hs';
  document.getElementById('total-horas-alert').classList.add('hidden');
  document.getElementById('preview-nro').textContent = '—';
  document.getElementById('confirm-error').classList.add('hidden');

  // Cargar referencias
  if (!State.referencias) {
    const res = await API.getReferencias();
    if (res?.ok) State.referencias = res.data;
  }

  if (State.referencias) {
    // Responsables
    const dl = document.getElementById('list-responsables');
    dl.innerHTML = (State.referencias.responsables || [])
      .map(r => `<option value="${r.nombre}">`).join('');

    // Motivos
    const selMot = document.getElementById('f-motivo');
    selMot.innerHTML = '<option value="">Seleccionar motivo...</option>';
    (State.referencias.motivos || []).forEach(m => {
      selMot.innerHTML += `<option value="${m.motivo}">${m.motivo} (${m.tipo})</option>`;
    });

    // Sectores
    const selSect = document.getElementById('f-sector');
    selSect.innerHTML = '<option value="">Seleccionar sector...</option>';
    (State.referencias.sectores || []).forEach(s => {
      selSect.innerHTML += `<option value="${s}">${s}</option>`;
    });
  }

  // Si es usuario normal, pre-completar responsable
  if (!Sesion.esAdmin) {
    document.getElementById('f-responsable').value = Sesion.nombre;
  }

  // Obtener próximo número
  API.getSolicitudes({}).then(res => {
    if (res?.ok && res.data) {
      const nros = res.data.map(s => parseInt(s.NroSolicitud) || 0);
      const max = nros.length ? Math.max(...nros) : 0;
      State.proximoNro = max + 1;
      document.getElementById('preview-nro').textContent = State.proximoNro;
    }
  });
}

function mostrarStep(n) {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`step-${i}`) || document.getElementById('step-success');
    if (el) {
      el.classList.toggle('active', false);
      el.classList.add('hidden');
    }
  }
  const target = n === 'success'
    ? document.getElementById('step-success')
    : document.getElementById(`step-${n}`);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('active');
  }
}

function validarStep1() {
  const responsable = document.getElementById('f-responsable').value.trim();
  const fecha = document.getElementById('f-fecha').value;
  const motivo = document.getElementById('f-motivo').value;
  const sector = document.getElementById('f-sector').value;
  const hi = document.getElementById('f-hora-inicio').value;
  const hf = document.getElementById('f-hora-fin').value;

  if (!responsable) { mostrarToast('El responsable es requerido', 'error'); return false; }
  if (!fecha) { mostrarToast('La fecha de realización es requerida', 'error'); return false; }
  if (!motivo) { mostrarToast('Seleccioná un motivo', 'error'); return false; }
  if (!sector) { mostrarToast('Seleccioná un sector', 'error'); return false; }
  if (!validarFormatoHora(hi)) { mostrarToast('Hora inicio inválida (formato HH:MM)', 'error'); return false; }
  if (!validarFormatoHora(hf)) { mostrarToast('Hora fin inválida (formato HH:MM)', 'error'); return false; }

  return true;
}

function calcularTotalHoras() {
  const hi = document.getElementById('f-hora-inicio').value;
  const hf = document.getElementById('f-hora-fin').value;

  if (!validarFormatoHora(hi) || !validarFormatoHora(hf)) return;

  const [h1, m1] = hi.split(':').map(Number);
  const [h2, m2] = hf.split(':').map(Number);
  let minutos = (h2 * 60 + m2) - (h1 * 60 + m1);
  if (minutos < 0) minutos += 24 * 60;

  const horas = Math.floor(minutos / 60);
  const mins = minutos % 60;
  const totalDecimal = minutos / 60;

  document.getElementById('total-horas-val').textContent =
    `${horas}:${String(mins).padStart(2, '0')} hs (${totalDecimal.toFixed(2)})`;

  document.getElementById('total-horas-alert').classList.toggle('hidden', totalDecimal <= 12);
}

async function cargarColaboradores(query) {
  const spinner = document.getElementById('search-spinner');
  spinner.classList.remove('hidden');

  try {
    const res = await API.getColaboradores(query);
    spinner.classList.add('hidden');

    const lista = document.getElementById('lista-colab-disponibles');
    lista.innerHTML = '';

    if (!res?.ok || !res.data?.length) {
      lista.innerHTML = '<div class="empty-equipo"><p>Sin resultados</p></div>';
      return;
    }

    res.data.forEach(c => {
      // No mostrar si ya está en el equipo
      if (State.equipo.find(e => e.legajo === c.legajo)) return;

      const div = document.createElement('div');
      div.className = 'colab-item';
      div.innerHTML = `
        <div class="colab-info">
          <div class="colab-nombre">${c.nombre}</div>
          <div class="colab-meta">
            <span>${c.legajo}</span>
            <span>${c.categoria}</span>
            <span>${c.ib}</span>
            ${badgeHabilitacion(c.habilitacion)}
            <span>${c.rankingHoras} hs</span>
          </div>
        </div>
        <span class="colab-add">+</span>
      `;
      div.addEventListener('click', () => agregarAlEquipo(c));
      lista.appendChild(div);
    });
  } catch (err) {
    spinner.classList.add('hidden');
    mostrarToast('Error al buscar colaboradores', 'error');
  }
}

function agregarAlEquipo(colab) {
  if (State.equipo.find(e => e.legajo === colab.legajo)) {
    mostrarToast('Este colaborador ya está en el equipo', 'error');
    return;
  }
  State.equipo.push(colab);
  actualizarListaEquipo();
  // Recargar disponibles para quitar el que se agregó
  cargarColaboradores(document.getElementById('search-colab').value);
}

function quitarDelEquipo(legajo) {
  State.equipo = State.equipo.filter(e => e.legajo !== legajo);
  actualizarListaEquipo();
  cargarColaboradores(document.getElementById('search-colab').value);
}

function actualizarListaEquipo() {
  const lista = document.getElementById('lista-colab-equipo');
  const count = document.getElementById('count-equipo');
  count.textContent = `${State.equipo.length} persona(s)`;

  if (State.equipo.length === 0) {
    lista.innerHTML = '<div class="empty-equipo"><p>Agregue colaboradores desde la búsqueda</p></div>';
    return;
  }

  lista.innerHTML = '';
  State.equipo.forEach(c => {
    const div = document.createElement('div');
    div.className = 'colab-item';
    div.innerHTML = `
      <div class="colab-info">
        <div class="colab-nombre">${c.nombre}</div>
        <div class="colab-meta">
          <span>${c.legajo}</span>
          <span>${c.categoria}</span>
          ${badgeHabilitacion(c.habilitacion)}
        </div>
      </div>
      <span class="colab-remove" data-legajo="${c.legajo}">✕</span>
    `;
    div.querySelector('.colab-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      quitarDelEquipo(c.legajo);
    });
    lista.appendChild(div);
  });
}

function mostrarResumen() {
  const resumen = document.getElementById('resumen-solicitud');
  const hi = document.getElementById('f-hora-inicio').value;
  const hf = document.getElementById('f-hora-fin').value;
  const fecha = document.getElementById('f-fecha').value;

  resumen.innerHTML = `
    <div class="resumen-row">
      <div class="resumen-label">N° SOLICITUD</div>
      <div class="resumen-val" style="font-family:var(--mono);color:var(--accent)">${State.proximoNro || '—'}</div>
    </div>
    <div class="resumen-row">
      <div class="resumen-label">RESPONSABLE</div>
      <div class="resumen-val">${document.getElementById('f-responsable').value}</div>
    </div>
    <div class="resumen-row">
      <div class="resumen-label">FECHA REALIZACIÓN</div>
      <div class="resumen-val">${formatearFecha(fecha)}</div>
    </div>
    <div class="resumen-row">
      <div class="resumen-label">HORARIO</div>
      <div class="resumen-val">${hi} a ${hf}</div>
    </div>
    <div class="resumen-row">
      <div class="resumen-label">MOTIVO</div>
      <div class="resumen-val">${document.getElementById('f-motivo').value}</div>
    </div>
    <div class="resumen-row">
      <div class="resumen-label">SECTOR</div>
      <div class="resumen-val">${document.getElementById('f-sector').value}</div>
    </div>
    ${document.getElementById('f-obs').value ? `
    <div class="resumen-row">
      <div class="resumen-label">OBSERVACIÓN</div>
      <div class="resumen-val">${document.getElementById('f-obs').value}</div>
    </div>` : ''}
    <div class="resumen-row" style="flex-direction:column;gap:8px;padding-top:12px;">
      <div class="resumen-label">EQUIPO (${State.equipo.length})</div>
      <div class="resumen-colab-list">
        ${State.equipo.map(c => `
          <div class="resumen-colab">
            <span style="font-family:var(--mono);font-size:0.78rem;color:var(--text-muted)">${c.legajo}</span>
            <span style="flex:1">${c.nombre}</span>
            ${badgeHabilitacion(c.habilitacion)}
            <span style="font-family:var(--mono);font-size:0.75rem;color:var(--text-muted)">${c.rankingHoras} hs</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

async function enviarSolicitud() {
  const btnText = document.getElementById('btn-enviar-text');
  const spinner = document.getElementById('btn-enviar-spinner');
  const errorDiv = document.getElementById('confirm-error');

  btnText.classList.add('hidden');
  spinner.classList.remove('hidden');
  errorDiv.classList.add('hidden');

  const solicitud = {
    responsable: document.getElementById('f-responsable').value.trim(),
    fechaInicio: document.getElementById('f-fecha').value,
    horaInicio: document.getElementById('f-hora-inicio').value,
    horaFin: document.getElementById('f-hora-fin').value,
    motivo: document.getElementById('f-motivo').value,
    sector: document.getElementById('f-sector').value,
    observacion: document.getElementById('f-obs').value,
    colaboradores: State.equipo
  };

  try {
    const res = await API.crearSolicitud(solicitud);

    if (res?.ok) {
      document.getElementById('success-nro').textContent = res.nroSolicitud;
      mostrarStep('success');
      State.equipo = [];
    } else if (res?.requiereConfirmacion) {
      solicitud.confirmarSobreLimite = true;
      if (confirm('⚠️ El total de horas supera 12. ¿Desea confirmar igual?')) {
        const res2 = await API.crearSolicitud(solicitud);
        if (res2?.ok) {
          document.getElementById('success-nro').textContent = res2.nroSolicitud;
          mostrarStep('success');
          State.equipo = [];
        } else {
          mostrarError(errorDiv, res2?.error || 'Error al enviar');
        }
      }
    } else {
      mostrarError(errorDiv, res?.error || 'Error al enviar la solicitud');
    }
  } catch (err) {
    mostrarError(errorDiv, 'No se pudo conectar. Verificá tu conexión.');
  } finally {
    btnText.classList.remove('hidden');
    spinner.classList.add('hidden');
  }
}

// ——— MODAL ————————————————————————————————————————————————————

function bindModal() {
  document.getElementById('modal-close').addEventListener('click', cerrarModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) cerrarModal();
  });
}

function cerrarModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ——— ADMIN ————————————————————————————————————————————————————

function bindAdmin() {
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.admin-tab-content').forEach(c => {
        c.classList.remove('active'); c.classList.add('hidden');
      });
      tab.classList.add('active');
      const content = document.getElementById(`admin-tab-${tab.dataset.tab}`);
      if (content) { content.classList.remove('hidden'); content.classList.add('active'); }

      if (tab.dataset.tab === 'logs') cargarLogs();
      if (tab.dataset.tab === 'tarifas') cargarTarifas();
    });
  });

  document.getElementById('btn-nuevo-usuario').addEventListener('click', () => {
    State.editandoUsuario = null;
    document.getElementById('modal-usuario-title').textContent = 'Nuevo Usuario';
    ['u-nombre','u-area','u-usuario','u-pass','u-mail'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('u-hoja').value = 'Menu';
    document.getElementById('modal-usuario-error').classList.add('hidden');
    document.getElementById('modal-usuario-overlay').classList.remove('hidden');
  });

  document.getElementById('modal-usuario-close').addEventListener('click', () => {
    document.getElementById('modal-usuario-overlay').classList.add('hidden');
  });

  document.getElementById('modal-usuario-cancel').addEventListener('click', () => {
    document.getElementById('modal-usuario-overlay').classList.add('hidden');
  });

  document.getElementById('modal-usuario-save').addEventListener('click', guardarUsuario);
}

async function cargarAdmin() {
  await cargarUsuarios();
}

async function cargarUsuarios() {
  const tabla = document.getElementById('tabla-usuarios');
  tabla.innerHTML = '<div class="loading-state"><div class="spinner-lg"></div></div>';

  try {
    const res = await API.getUsuarios();
    if (!res?.ok) { tabla.innerHTML = '<p style="color:var(--red);padding:16px">Error al cargar usuarios</p>'; return; }

    const usuarios = res.data;
    let html = `<table class="generic-table"><thead><tr>
      <th>USUARIO</th><th>NOMBRE</th><th>ÁREA</th><th>ACCESO</th><th>MAIL</th><th>ACTIVO</th><th></th>
    </tr></thead><tbody>`;

    usuarios.forEach(u => {
      const activo = String(u.Activo || u.activo).toUpperCase() === 'TRUE';
      html += `<tr>
        <td class="mono">${u.Usuario || u.usuario || ''}</td>
        <td>${u.Nombre || u.nombre || ''}</td>
        <td>${u.AreaUsuario || u.area || ''}</td>
        <td><span class="badge ${u.Hoja === 'TODAS' ? 'badge-approved' : 'badge-pending'}">${u.Hoja || ''}</span></td>
        <td style="font-size:0.78rem">${u.Mail || u.mail || ''}</td>
        <td><span class="badge ${activo ? 'badge-approved' : 'badge-rejected'}">${activo ? 'SI' : 'NO'}</span></td>
        <td><button class="btn-secondary btn-sm" onclick="editarUsuario('${u.Usuario || u.usuario}')">Editar</button></td>
      </tr>`;
    });

    html += '</tbody></table>';
    tabla.innerHTML = html;
  } catch (err) {
    tabla.innerHTML = '<p style="color:var(--red);padding:16px">Error de conexión</p>';
  }
}

async function editarUsuario(codigoUsuario) {
  const res = await API.getUsuarios();
  if (!res?.ok) return;
  const u = res.data.find(x => (x.Usuario || x.usuario) === codigoUsuario);
  if (!u) return;

  State.editandoUsuario = codigoUsuario;
  document.getElementById('modal-usuario-title').textContent = 'Editar Usuario';
  document.getElementById('u-nombre').value = u.Nombre || '';
  document.getElementById('u-area').value = u.AreaUsuario || '';
  document.getElementById('u-usuario').value = u.Usuario || '';
  document.getElementById('u-usuario').disabled = true;
  document.getElementById('u-pass').value = '';
  document.getElementById('u-pass').placeholder = '(dejar vacío para no cambiar)';
  document.getElementById('u-hoja').value = u.Hoja || 'Menu';
  document.getElementById('u-mail').value = u.Mail || '';
  document.getElementById('modal-usuario-error').classList.add('hidden');
  document.getElementById('modal-usuario-overlay').classList.remove('hidden');
}

async function guardarUsuario() {
  const errorDiv = document.getElementById('modal-usuario-error');
  const datos = {
    nombre: document.getElementById('u-nombre').value.trim(),
    area: document.getElementById('u-area').value.trim(),
    usuario: document.getElementById('u-usuario').value.trim().toUpperCase(),
    password: document.getElementById('u-pass').value.trim(),
    hoja: document.getElementById('u-hoja').value,
    mail: document.getElementById('u-mail').value.trim()
  };

  try {
    let res;
    if (State.editandoUsuario) {
      const cambios = { nombre: datos.nombre, area: datos.area, hoja: datos.hoja, mail: datos.mail };
      if (datos.password) cambios.password = datos.password;
      res = await API.actualizarUsuario(State.editandoUsuario, cambios);
    } else {
      if (!datos.usuario || !datos.password) {
        mostrarError(errorDiv, 'Usuario y contraseña son requeridos'); return;
      }
      res = await API.crearUsuario(datos);
    }

    if (res?.ok) {
      document.getElementById('modal-usuario-overlay').classList.add('hidden');
      document.getElementById('u-usuario').disabled = false;
      mostrarToast('Usuario guardado correctamente', 'success');
      cargarUsuarios();
    } else {
      mostrarError(errorDiv, res?.error || 'Error al guardar');
    }
  } catch (err) {
    mostrarError(errorDiv, 'Error de conexión');
  }
}

async function cargarLogs() {
  const tabla = document.getElementById('tabla-logs');
  tabla.innerHTML = '<div class="loading-state"><div class="spinner-lg"></div></div>';

  try {
    const res = await API.getLogs();
    if (!res?.ok) return;

    let html = `<table class="generic-table"><thead><tr>
      <th>FECHA</th><th>USUARIO</th><th>ACCIÓN</th><th>DETALLE</th>
    </tr></thead><tbody>`;

    res.data.slice(0, 200).forEach(log => {
      const fecha = formatearFecha(log.Fecha || log.fecha, true);
      html += `<tr>
        <td class="mono" style="white-space:nowrap;font-size:0.75rem">${fecha}</td>
        <td class="mono">${log.Usuario || ''}</td>
        <td><span class="badge badge-pending">${log.Accion || ''}</span></td>
        <td style="font-size:0.8rem">${log.Detalle || ''}</td>
      </tr>`;
    });

    html += '</tbody></table>';
    tabla.innerHTML = html;
  } catch (err) {
    tabla.innerHTML = '<p style="color:var(--red);padding:16px">Error al cargar logs</p>';
  }
}

async function cargarTarifas() {
  const tabla = document.getElementById('tabla-tarifas');
  tabla.innerHTML = '<div class="loading-state"><div class="spinner-lg"></div></div>';

  try {
    const res = await API.getTarifas();
    if (!res?.ok) return;

    let html = `<table class="generic-table"><thead><tr>
      <th>CATEGORÍA</th><th>VALOR BASE ($)</th><th>H.EXTRA 50%</th><th>H.NOC 50%</th><th>H.EXTRA 100%</th><th>H.NOC 100%</th>
    </tr></thead><tbody>`;

    res.data.forEach(t => {
      html += `<tr>
        <td class="mono" style="color:var(--accent)">${t.categoria}</td>
        <td class="mono">${fmt(t.valorBase)}</td>
        <td class="mono">${fmt(t.hExtra50)}</td>
        <td class="mono">${fmt(t.hNoc50)}</td>
        <td class="mono">${fmt(t.hExtra100)}</td>
        <td class="mono">${fmt(t.hNoc100)}</td>
      </tr>`;
    });

    html += '</tbody></table>';
    tabla.innerHTML = html;
  } catch (err) {
    tabla.innerHTML = '<p style="color:var(--red);padding:16px">Error al cargar tarifas</p>';
  }
}

// ——— EXPORTAR CSV ————————————————————————————————————————————

function exportarCSV() {
  if (!State.solicitudesCache.length) { mostrarToast('No hay datos para exportar', 'error'); return; }

  const headers = ['NroSolicitud','FechaSolicitud','NombreSolicitante','FechaInicioExtra','HoraInicio','HoraFin','TotalHoras','MotivoExtra','SectorExtra','Colaborador','Legajo','IB_Colaborador','RankingHoras_Snapshot','StatusSolicitud'];
  const rows = State.solicitudesCache.map(s => headers.map(h => `"${(s[h] || '').toString().replace(/"/g, '""')}"`).join(','));
  const csv = [headers.join(','), ...rows].join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `solicitudes_${new Date().toISOString().split('T')[0]}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ——— UTILIDADES UI ———————————————————————————————————————————

function mostrarToast(mensaje, tipo = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${tipo}`;
  toast.textContent = mensaje;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function mostrarError(div, msg) {
  div.textContent = msg;
  div.classList.remove('hidden');
}

function badgeStatus(status) {
  const map = {
    'PENDIENTE APROBACION': ['badge-pending', 'PENDIENTE'],
    'APROBADA': ['badge-approved', 'APROBADA'],
    'RECHAZADA': ['badge-rejected', 'RECHAZADA'],
    'CANCELADA': ['badge-cancelled', 'CANCELADA']
  };
  const [cls, label] = map[status] || ['badge-cancelled', status || '—'];
  return `<span class="badge ${cls}">${label}</span>`;
}

function badgeHabilitacion(hab) {
  const map = {
    'HABILITADO': ['badge-hab', 'HAB'],
    'ATENCION': ['badge-aten', 'ATENC'],
    'NO HABILITADO': ['badge-nohab', 'NO HAB']
  };
  const [cls, label] = map[hab] || ['badge-cancelled', hab || ''];
  return `<span class="badge ${cls}">${label}</span>`;
}

function validarFormatoHora(hora) {
  return /^\d{2}:\d{2}$/.test(hora) && parseInt(hora.split(':')[0]) <= 23 && parseInt(hora.split(':')[1]) <= 59;
}

function formatearFecha(valor, conHora = false) {
  if (!valor) return '—';
  try {
    // Si es número serial de Excel
    if (typeof valor === 'number' || /^\d{5}$/.test(String(valor))) {
      const d = new Date((parseFloat(valor) - 25569) * 86400 * 1000);
      return d.toLocaleDateString('es-AR');
    }
    const d = new Date(valor);
    if (isNaN(d.getTime())) return String(valor);
    if (conHora) return d.toLocaleString('es-AR');
    return d.toLocaleDateString('es-AR');
  } catch { return String(valor); }
}

function fmt(n) {
  return (parseFloat(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
