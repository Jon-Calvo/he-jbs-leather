// ============================================================
// API CLIENT — Comunicación con Google Apps Script
// ============================================================

// ⚠️ IMPORTANTE: Reemplazar con la URL de tu implementación de Apps Script
const API_URL = 'https://script.google.com/macros/s/AKfycbw85gjK5YnDVpQ1SVZtcOASXwMojisjR6QMu-LVqQ4-yQtvkw5Nqp3EpcoICd3SmNf85w/exec';

// ——— SESIÓN ——————————————————————————————————————————————————
const Sesion = {
  get token()    { return sessionStorage.getItem('he_token'); },
  get usuario()  { return sessionStorage.getItem('he_usuario'); },
  get nombre()   { return sessionStorage.getItem('he_nombre'); },
  get area()     { return sessionStorage.getItem('he_area'); },
  get acceso()   { return sessionStorage.getItem('he_acceso'); },
  get mail()     { return sessionStorage.getItem('he_mail'); },

  guardar(data) {
    sessionStorage.setItem('he_token',   data.token);
    sessionStorage.setItem('he_usuario', data.usuario);
    sessionStorage.setItem('he_nombre',  data.nombre);
    sessionStorage.setItem('he_area',    data.area);
    sessionStorage.setItem('he_acceso',  data.acceso);
    sessionStorage.setItem('he_mail',    data.mail || '');
  },

  limpiar() {
    ['he_token','he_usuario','he_nombre','he_area','he_acceso','he_mail']
      .forEach(k => sessionStorage.removeItem(k));
  },

  get estaActiva() { return !!this.token; },
  get esAdmin()    { return this.acceso === 'TODAS'; },
  get esGerente()  { return this.area === 'Gerente'; }
};

// ——— HTTP ————————————————————————————————————————————————————
function apiCall(action, params = {}) {
  return new Promise((resolve, reject) => {
    const body = { action, ...params };
    if (Sesion.token) body.token = Sesion.token;

    // Nombre único para el callback
    const cbName = 'cb_' + Date.now() + '_' + Math.floor(Math.random() * 10000);

    // Timeout de 15 segundos
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timeout: el servidor no respondió'));
    }, 15000);

    // Limpiar después de la respuesta
    function cleanup() {
      clearTimeout(timeout);
      delete window[cbName];
      const script = document.getElementById(cbName);
      if (script) script.remove();
    }

    // Definir el callback global
    window[cbName] = function(data) {
      cleanup();
      if (!data.ok && data.error && data.error.includes('Sesión inválida')) {
        Sesion.limpiar();
        mostrarPantalla('login');
        mostrarToast('Tu sesión expiró. Por favor ingresá de nuevo.', 'error');
        resolve(null);
        return;
      }
      resolve(data);
    };

    // Construir URL con callback
    const url = API_URL
      + '?callback=' + cbName
      + '&payload=' + encodeURIComponent(JSON.stringify(body));

    // Crear tag <script>
    const script = document.createElement('script');
    script.id = cbName;
    script.src = url;
    script.onerror = () => {
      cleanup();
      const cache = localStorage.getItem('cache_' + action);
      if (cache) resolve(JSON.parse(cache));
      else reject(new Error('Error de red'));
    };
    document.head.appendChild(script);
  });
}

// ——— MÉTODOS DE API ——————————————————————————————————————————

const API = {
  async login(usuario, password) {
    return apiCall('login', { usuario, password });
  },

  async logout() {
    return apiCall('logout');
  },

  async getSolicitudes(filtros = {}) {
    const data = await apiCall('getSolicitudes', filtros);
    if (data?.ok) localStorage.setItem('cache_getSolicitudes', JSON.stringify(data));
    return data;
  },

  async crearSolicitud(solicitud) {
    return apiCall('crearSolicitud', { solicitud });
  },

  async actualizarStatus(nroSolicitud, nuevoStatus, legajo = null) {
    return apiCall('actualizarStatus', { nroSolicitud, nuevoStatus, legajo });
  },

  async modificarSolicitud(nroSolicitud, cambios) {
    return apiCall('modificarSolicitud', { nroSolicitud, cambios });
  },

  async getColaboradores(query = '') {
    return apiCall('getColaboradores', { query });
  },

  async getReferencias() {
    const data = await apiCall('getReferencias');
    if (data?.ok) localStorage.setItem('cache_getReferencias', JSON.stringify(data));
    return data;
  },

  async getTarifas() {
    return apiCall('getTarifas');
  },

  async getUsuarios() {
    return apiCall('getUsuarios');
  },

  async crearUsuario(datos) {
    return apiCall('crearUsuario', datos);
  },

  async actualizarUsuario(usuario, cambios) {
    return apiCall('actualizarUsuario', { usuario, cambios });
  },

  async getLogs() {
    return apiCall('getLogs');
  },

  async getDashboard() {
    return apiCall('getDashboard');
  }
};
