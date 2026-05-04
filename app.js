// ============================================================
//  SISTEMA AD-01 — I.E. Divino Niño
//  app.js v2.1 — Con búsqueda en tiempo real y filtro por grado
// ============================================================

// ============================================================
//  CONFIGURACIÓN SUPABASE
// ============================================================
const SUPABASE_URL = 'https://tpfzvidfardfcpngyoxq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwZnp2aWRmYXJkZmNwbmd5b3hxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMTk4MzQsImV4cCI6MjA5Mjc5NTgzNH0.asyZ-C5MV5zmiH5Pu4SzOoAlPaX-uD4qQhlaHGEXpuM';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================================
//  ESTADO GLOBAL
// ============================================================
let usuarioActual = null;
let registroActualId = null;
let estudiantesCache = [];
let registrosCache = [];

// ============================================================
//  INICIALIZACIÓN
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  const sesion = localStorage.getItem('ad01_sesion');
  if (sesion) {
    try {
      usuarioActual = JSON.parse(sesion);
      mostrarApp();
    } catch {
      localStorage.removeItem('ad01_sesion');
    }
  }

  const hoy = new Date().toISOString().split('T')[0];
  const fFecha = document.getElementById('fFecha');
  const fFechaRem = document.getElementById('fFechaRem');
  if (fFecha) fFecha.value = hoy;
  if (fFechaRem) fFechaRem.value = hoy;

  document.getElementById('loginPassword')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') iniciarSesion();
  });
  document.getElementById('loginEmail')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') iniciarSesion();
  });
});

// ============================================================
//  AUTENTICACIÓN
// ============================================================
async function iniciarSesion() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';

  if (!email || !password) {
    errorEl.textContent = 'Por favor completa todos los campos.';
    return;
  }

  mostrarLoader(true);

  try {
    const { data, error } = await db
      .from('usuarios')
      .select('*')
      .eq('email', email)
      .eq('password', password)
      .single();

    if (error || !data) {
      errorEl.textContent = 'Correo o contraseña incorrectos.';
      mostrarLoader(false);
      return;
    }

    usuarioActual = data;
    localStorage.setItem('ad01_sesion', JSON.stringify(data));
    mostrarApp();
  } catch (err) {
    errorEl.textContent = 'Error de conexión. Verifica tu internet.';
    console.error(err);
  }

  mostrarLoader(false);
}

function cerrarSesion() {
  if (!confirm('¿Cerrar sesión?')) return;
  localStorage.removeItem('ad01_sesion');
  usuarioActual = null;
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('appMain').classList.add('hidden');
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
}

function mostrarApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appMain').classList.remove('hidden');
  document.getElementById('sidebarUserName').textContent = usuarioActual.nombre;
  document.getElementById('sidebarUserRole').textContent = usuarioActual.rol || 'Orientación';
  cargarStats();
  cargarRegistros();
  cargarBase(); // poblarFiltroGrados se llama dentro de cargarBase
}

function togglePass() {
  const input = document.getElementById('loginPassword');
  input.type = input.type === 'password' ? 'text' : 'password';
}

// ============================================================
//  NAVEGACIÓN
// ============================================================
function mostrarSeccion(nombre) {
  document.querySelectorAll('.seccion').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('seccion-' + nombre)?.classList.add('active');
  document.querySelector(`[data-section="${nombre}"]`)?.classList.add('active');

  if (nombre === 'registros') cargarRegistros();
  if (nombre === 'base') cargarBase();
  if (nombre === 'buscar') cargarStats();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('expanded');
}

// ============================================================
//  ESTADÍSTICAS
// ============================================================
async function cargarStats() {
  try {
    const [{ count: cEst }, { count: cReg }] = await Promise.all([
      db.from('estudiantes').select('*', { count: 'exact', head: true }),
      db.from('registros').select('*', { count: 'exact', head: true })
    ]);

    const hoy = new Date().toISOString().split('T')[0];
    const { count: cHoy } = await db
      .from('registros')
      .select('*', { count: 'exact', head: true })
      .eq('fecha', hoy);

    document.getElementById('statEstudiantes').textContent = cEst ?? 0;
    document.getElementById('statRegistros').textContent = cReg ?? 0;
    document.getElementById('statHoy').textContent = cHoy ?? 0;
  } catch (err) {
    console.error('Error cargando stats:', err);
  }
}

// ============================================================
//  BUSCAR ESTUDIANTE — tiempo real + filtro por grado
// ============================================================
function buscarEstudiante() {
  const texto = (document.getElementById('inputBuscar').value || '').trim().toLowerCase();
  const gradoFiltro = (document.getElementById('filtroBuscarGrado')?.value || '').toLowerCase();
  const resultadoEl = document.getElementById('resultadoBusqueda');

  if (!texto && !gradoFiltro) {
    resultadoEl.classList.add('hidden');
    resultadoEl.innerHTML = '';
    return;
  }

  let resultados = estudiantesCache;

  if (texto) {
    resultados = resultados.filter(e =>
      (e.documento || '').toLowerCase().includes(texto) ||
      (e.nombre || '').toLowerCase().includes(texto)
    );
  }

  if (gradoFiltro) {
    resultados = resultados.filter(e =>
      (e.grupo || '').toLowerCase() === gradoFiltro
    );
  }

  mostrarResultados(resultados);
}

function mostrarResultados(datos) {
  const el = document.getElementById('resultadoBusqueda');

  if (!datos || datos.length === 0) {
    el.classList.remove('hidden');
    el.innerHTML = '<p style="padding:20px 18px;color:var(--texto-suave);">No se encontraron estudiantes.</p>';
    return;
  }

  el.classList.remove('hidden');
  el.innerHTML = datos.map(est => `
    <div class="resultado-item" style="
      display:flex;
      justify-content:space-between;
      align-items:center;
      padding:14px 18px;
      border-bottom:1px solid var(--borde);
      gap:12px;
      flex-wrap:wrap;
    ">
      <div>
        <div style="font-weight:700;font-size:15px;">${est.nombre}</div>
        <div style="font-size:13px;color:var(--texto-suave);margin-top:4px;">
          📄 ${est.documento}
          ${est.grupo ? '&nbsp;·&nbsp; 🏫 ' + est.grupo : ''}
          ${est.celular ? '&nbsp;·&nbsp; 📱 ' + est.celular : ''}
          ${est.acudiente ? '&nbsp;·&nbsp; 👤 ' + est.acudiente : ''}
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-shrink:0;">
        <button class="btn-tabla" onclick="verHistorialEstudiante('${est.documento}')" title="Ver historial">📋 Historial</button>
        <button class="btn-tabla" style="background:var(--azul);color:white;" onclick='llenarFormulario(${JSON.stringify(est).replace(/'/g, "&#39;")})' title="Nuevo registro">➕ Registro</button>
      </div>
    </div>
  `).join('');
}

async function verHistorialEstudiante(documento) {
  const histId = 'historial-' + documento;
  const existente = document.getElementById(histId);
  if (existente) { existente.remove(); return; }

  mostrarLoader(true);
  const { data, error } = await db
    .from('registros')
    .select('*')
    .eq('documento', documento)
    .order('fecha', { ascending: false });
  mostrarLoader(false);

  if (error) { mostrarToast('Error al cargar historial', 'error'); return; }

  const est = estudiantesCache.find(e => e.documento === documento);
  const el = document.getElementById('resultadoBusqueda');

  const div = document.createElement('div');
  div.id = histId;
  div.style.cssText = 'margin:6px 0 4px 0;border:1px solid var(--borde);border-radius:12px;overflow:hidden;background:#f8faff;';

  if (!data || data.length === 0) {
    div.innerHTML = `
      <div style="background:var(--azul);color:white;padding:10px 16px;font-weight:700;display:flex;justify-content:space-between;">
        <span>📋 Historial de ${est?.nombre || documento}</span>
        <span style="cursor:pointer;" onclick="document.getElementById('${histId}').remove()">✕</span>
      </div>
      <p style="padding:16px;color:var(--texto-suave);font-size:13px;">Este estudiante no tiene registros de atención aún.</p>
    `;
  } else {
    div.innerHTML = `
      <div style="background:var(--azul);color:white;padding:10px 16px;font-weight:700;display:flex;justify-content:space-between;align-items:center;">
        <span>📋 Historial de ${est?.nombre || documento} — ${data.length} registro(s)</span>
        <span style="cursor:pointer;font-size:18px;" onclick="document.getElementById('${histId}').remove()">✕</span>
      </div>
      ${data.map(r => `
        <div style="padding:12px 16px;border-bottom:1px solid var(--borde);font-size:13px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
            <strong>📅 ${r.fecha || '—'}</strong>
            <span class="badge badge-azul">${r.remision || '—'}</span>
          </div>
          <div style="color:#333;margin-bottom:3px;">${r.motivo || 'Sin motivo registrado'}</div>
          ${r.observaciones ? '<div style="color:var(--texto-suave);font-size:12px;">📝 ' + r.observaciones + '</div>' : ''}
          <div style="color:var(--texto-suave);font-size:11px;margin-top:4px;">Registrado por: ${r.usuario_nombre || '—'}</div>
        </div>
      `).join('')}
    `;
  }

  el.appendChild(div);
}

function poblarFiltroGrados() {
  const select = document.getElementById('filtroBuscarGrado');
  if (!select) return;

  const grados = [...new Set(
    estudiantesCache
      .map(e => (e.grupo || '').trim())
      .filter(g => g !== '')
  )].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));

  select.innerHTML = '<option value="">Todos los grados</option>' +
    grados.map(g => `<option value="${g}">${g}</option>`).join('');
}

function llenarFormulario(data) {
  document.getElementById('fDoc').value = data.documento || '';
  document.getElementById('fNombre').value = data.nombre || '';
  document.getElementById('fGrupo').value = data.grupo || '';
  document.getElementById('fCelular').value = data.celular || '';
  mostrarSeccion('formulario');
  mostrarToast('Datos autocargados en el formulario ✓', 'success');
}

// ============================================================
//  AUTOCOMPLETAR FORMULARIO
// ============================================================
async function autocompletar() {
  const doc = document.getElementById('fDoc').value.trim();
  if (!doc) { mostrarToast('Ingresa el documento primero', 'error'); return; }

  mostrarLoader(true);
  const { data, error } = await db.from('estudiantes').select('*').eq('documento', doc).single();
  mostrarLoader(false);

  if (error || !data) {
    mostrarToast('Estudiante no encontrado', 'error'); return;
  }

  document.getElementById('fNombre').value = data.nombre || '';
  document.getElementById('fGrupo').value = data.grupo || '';
  document.getElementById('fCelular').value = data.celular || '';
  mostrarToast('Datos autocargados ✓', 'success');
}

// ============================================================
//  GUARDAR REGISTRO AD-01
// ============================================================
async function guardarRegistro() {
  const doc = document.getElementById('fDoc').value.trim();
  const nombre = document.getElementById('fNombre').value.trim();

  if (!doc || !nombre) {
    mostrarToast('El documento y nombre son obligatorios', 'error'); return;
  }

  const acomp = Array.from(document.querySelectorAll('input[name="acomp"]:checked')).map(c => c.value).join(', ');
  const ruta = Array.from(document.querySelectorAll('input[name="ruta"]:checked')).map(c => c.value).join(', ');

  const registro = {
    documento: doc,
    nombre,
    motivo: document.getElementById('fMotivo').value,
    remision: document.getElementById('fRemision').value,
    quien_remite: document.getElementById('fQuienRemite').value,
    acompanamiento: acomp,
    ruta,
    observaciones: document.getElementById('fObservaciones').value,
    fecha: document.getElementById('fFecha').value,
    fecha_rem: document.getElementById('fFechaRem').value,
    rem_formal: document.getElementById('fRemFormal').value,
    usuario_id: usuarioActual.id,
    usuario_nombre: usuarioActual.nombre
  };

  const { data: est } = await db.from('estudiantes').select('id').eq('documento', doc).single();
  if (est) registro.estudiante_id = est.id;

  mostrarLoader(true);
  const { error } = await db.from('registros').insert(registro);
  mostrarLoader(false);

  if (error) {
    mostrarToast('Error al guardar: ' + error.message, 'error'); return;
  }

  mostrarToast('Registro guardado exitosamente ✓', 'success');
  limpiarFormulario();
  cargarStats();
}

function limpiarFormulario() {
  ['fDoc','fNombre','fGrupo','fCelular','fMotivo','fQuienRemite','fObservaciones'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('fRemision').value = '';
  document.getElementById('fRemFormal').value = 'no';
  document.querySelectorAll('input[name="acomp"], input[name="ruta"]').forEach(c => c.checked = false);
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('fFecha').value = hoy;
  document.getElementById('fFechaRem').value = hoy;
}

// ============================================================
//  REGISTROS GUARDADOS
// ============================================================
async function cargarRegistros() {
  const { data, error } = await db.from('registros').select('*').order('created_at', { ascending: false });
  if (error) { console.error(error); return; }
  registrosCache = data || [];
  renderTablaRegistros(registrosCache);
}

function renderTablaRegistros(datos) {
  const cont = document.getElementById('tablaRegistros');
  if (!datos.length) {
    cont.innerHTML = '<p style="padding:24px;color:var(--texto-suave);">No hay registros aún.</p>';
    return;
  }
  cont.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Estudiante</th>
          <th>Documento</th>
          <th>Motivo</th>
          <th>Remisión</th>
          <th>Registrado por</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${datos.map(r => `
          <tr>
            <td>${r.fecha || '—'}</td>
            <td><strong>${r.nombre || '—'}</strong></td>
            <td>${r.documento || '—'}</td>
            <td>${(r.motivo || '').substring(0, 40)}${(r.motivo || '').length > 40 ? '...' : ''}</td>
            <td><span class="badge badge-azul">${r.remision || '—'}</span></td>
            <td>${r.usuario_nombre || '—'}</td>
            <td>
              <button class="btn-tabla" onclick="verRegistro('${r.id}')" title="Ver detalle">👁</button>
              <button class="btn-tabla" onclick="eliminarRegistro('${r.id}')" title="Eliminar">🗑</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function filtrarRegistros() {
  const filtro = document.getElementById('filtroRegistros').value.toLowerCase();
  const filtrados = registrosCache.filter(r =>
    (r.nombre || '').toLowerCase().includes(filtro) ||
    (r.documento || '').toLowerCase().includes(filtro) ||
    (r.motivo || '').toLowerCase().includes(filtro) ||
    (r.fecha || '').includes(filtro)
  );
  renderTablaRegistros(filtrados);
}

async function verRegistro(id) {
  registroActualId = id;
  const reg = registrosCache.find(r => r.id === id);
  if (!reg) return;

  const { data: seguimientos } = await db.from('seguimientos').select('*').eq('registro_id', id).order('created_at');
  const segs = seguimientos || [];

  document.getElementById('detalleRegistro').innerHTML = `
    <div class="detalle-grid">
      <div class="detalle-item"><label>Estudiante</label><span>${reg.nombre}</span></div>
      <div class="detalle-item"><label>Documento</label><span>${reg.documento}</span></div>
      <div class="detalle-item"><label>Fecha atención</label><span>${reg.fecha || '—'}</span></div>
      <div class="detalle-item"><label>Fecha remisión</label><span>${reg.fecha_rem || '—'}</span></div>
      <div class="detalle-item"><label>Tipo remisión</label><span>${reg.remision || '—'}</span></div>
      <div class="detalle-item"><label>Quién remite</label><span>${reg.quien_remite || '—'}</span></div>
      <div class="detalle-item"><label>Acompañamiento</label><span>${reg.acompanamiento || '—'}</span></div>
      <div class="detalle-item"><label>Ruta</label><span>${reg.ruta || '—'}</span></div>
      <div class="detalle-item"><label>Rem. formal</label><span>${reg.rem_formal || 'No'}</span></div>
      <div class="detalle-item"><label>Registrado por</label><span>${reg.usuario_nombre || '—'}</span></div>
    </div>
    <p style="font-weight:700;margin-bottom:8px;">Motivo de atención:</p>
    <div class="detalle-obs">${reg.motivo || '—'}</div>
    <p style="font-weight:700;margin:14px 0 8px;">Observaciones:</p>
    <div class="detalle-obs">${reg.observaciones || '—'}</div>
    <div class="seguimientos-list">
      <p style="font-weight:800;color:var(--azul);margin-bottom:10px;margin-top:18px;">
        Seguimientos (${segs.length})
      </p>
      ${segs.length === 0
        ? '<p style="color:var(--texto-suave);font-size:13px;">Sin seguimientos aún.</p>'
        : segs.map(s => `
            <div class="seg-item">
              <div class="seg-fecha">📅 ${s.fecha || '—'}</div>
              ${s.obs}
            </div>
          `).join('')
      }
    </div>
  `;

  abrirModal('modalRegistro');
}

async function eliminarRegistro(id) {
  if (!confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return;
  mostrarLoader(true);
  await db.from('seguimientos').delete().eq('registro_id', id);
  const { error } = await db.from('registros').delete().eq('id', id);
  mostrarLoader(false);
  if (error) { mostrarToast('Error al eliminar', 'error'); return; }
  mostrarToast('Registro eliminado', 'success');
  cargarRegistros();
  cargarStats();
}

function abrirSeguimiento() {
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('segFecha').value = hoy;
  document.getElementById('segObs').value = '';
  abrirModal('modalSeguimiento');
}

async function guardarSeguimiento() {
  const obs = document.getElementById('segObs').value.trim();
  const fecha = document.getElementById('segFecha').value;
  if (!obs) { mostrarToast('Escribe la observación del seguimiento', 'error'); return; }

  mostrarLoader(true);
  const { error } = await db.from('seguimientos').insert({
    registro_id: registroActualId,
    obs,
    fecha,
    usuario_id: usuarioActual.id,
    usuario_nombre: usuarioActual.nombre
  });
  mostrarLoader(false);

  if (error) { mostrarToast('Error al guardar seguimiento', 'error'); return; }
  mostrarToast('Seguimiento guardado ✓', 'success');
  cerrarModal('modalSeguimiento');
  verRegistro(registroActualId);
}

// ============================================================
//  BASE DE DATOS DE ESTUDIANTES
// ============================================================
async function cargarBase() {
  const { data, error } = await db.from('estudiantes').select('*').order('nombre');
  if (error) { console.error(error); return; }
  estudiantesCache = data || [];
  renderTablaBase(estudiantesCache);
  poblarFiltroGrados();
}

function renderTablaBase(datos) {
  const cont = document.getElementById('tablaBase');
  if (!datos.length) {
    cont.innerHTML = '<p style="padding:24px;color:var(--texto-suave);">No hay estudiantes registrados.</p>';
    return;
  }
  cont.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Documento</th>
          <th>Grupo</th>
          <th>Acudiente</th>
          <th>Cel. Acudiente</th>
          <th>IPS</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${datos.map(e => `
          <tr>
            <td><strong>${e.nombre}</strong></td>
            <td>${e.documento}</td>
            <td>${e.grupo || '—'}</td>
            <td>${e.acudiente || '—'}</td>
            <td>${e.cel_acudiente || '—'}</td>
            <td>${e.ips || '—'}</td>
            <td>
              <button class="btn-tabla" onclick="editarEstudiante('${e.id}')" title="Editar">✏️</button>
              <button class="btn-tabla" onclick="eliminarEstudiante('${e.id}')" title="Eliminar">🗑</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function filtrarBase() {
  const filtro = document.getElementById('filtroBase').value.toLowerCase();
  const filtrados = estudiantesCache.filter(e =>
    (e.nombre || '').toLowerCase().includes(filtro) ||
    (e.documento || '').toLowerCase().includes(filtro) ||
    (e.grupo || '').toLowerCase().includes(filtro)
  );
  renderTablaBase(filtrados);
}

function abrirModalNuevoEstudiante() {
  document.getElementById('modalEstTitulo').textContent = 'Nuevo Estudiante';
  ['estId','estNombre','estDocumento','estGrupo','estCelular','estIps',
   'estDiscapacidad','estAcudiente','estParentesco','estCelAcudiente','estDireccion']
    .forEach(id => { document.getElementById(id).value = ''; });
  abrirModal('modalEstudiante');
}

function editarEstudiante(id) {
  const est = estudiantesCache.find(e => e.id === id);
  if (!est) return;
  document.getElementById('modalEstTitulo').textContent = 'Editar Estudiante';
  document.getElementById('estId').value = est.id;
  document.getElementById('estNombre').value = est.nombre || '';
  document.getElementById('estDocumento').value = est.documento || '';
  document.getElementById('estGrupo').value = est.grupo || '';
  document.getElementById('estCelular').value = est.celular || '';
  document.getElementById('estIps').value = est.ips || '';
  document.getElementById('estDiscapacidad').value = est.discapacidad || '';
  document.getElementById('estAcudiente').value = est.acudiente || '';
  document.getElementById('estParentesco').value = est.parentesco || '';
  document.getElementById('estCelAcudiente').value = est.cel_acudiente || '';
  document.getElementById('estDireccion').value = est.direccion || '';
  abrirModal('modalEstudiante');
}

async function guardarEstudiante() {
  const nombre = document.getElementById('estNombre').value.trim();
  const documento = document.getElementById('estDocumento').value.trim();
  if (!nombre || !documento) {
    mostrarToast('Nombre y documento son obligatorios', 'error'); return;
  }

  const datos = {
    nombre, documento,
    grupo: document.getElementById('estGrupo').value,
    celular: document.getElementById('estCelular').value,
    ips: document.getElementById('estIps').value,
    discapacidad: document.getElementById('estDiscapacidad').value,
    acudiente: document.getElementById('estAcudiente').value,
    parentesco: document.getElementById('estParentesco').value,
    cel_acudiente: document.getElementById('estCelAcudiente').value,
    direccion: document.getElementById('estDireccion').value
  };

  const id = document.getElementById('estId').value;
  mostrarLoader(true);

  let error;
  if (id) {
    ({ error } = await db.from('estudiantes').update(datos).eq('id', id));
  } else {
    ({ error } = await db.from('estudiantes').insert(datos));
  }

  mostrarLoader(false);
  if (error) {
    if (error.code === '23505') {
      mostrarToast('Ya existe un estudiante con ese documento', 'error');
    } else {
      mostrarToast('Error al guardar: ' + error.message, 'error');
    }
    return;
  }

  mostrarToast((id ? 'Estudiante actualizado' : 'Estudiante agregado') + ' ✓', 'success');
  cerrarModal('modalEstudiante');
  cargarBase();
  cargarStats();
}

async function eliminarEstudiante(id) {
  if (!confirm('¿Eliminar este estudiante? Sus registros AD-01 no se eliminarán.')) return;
  mostrarLoader(true);
  const { error } = await db.from('estudiantes').delete().eq('id', id);
  mostrarLoader(false);
  if (error) { mostrarToast('Error al eliminar', 'error'); return; }
  mostrarToast('Estudiante eliminado', 'success');
  cargarBase();
  cargarStats();
}

// ============================================================
//  CARGA MASIVA DE EXCEL
// ============================================================
function normalizar(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function cargarExcel(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      mostrarLoader(true);
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];

      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
        raw: false
      });

      console.log('=== PRIMERAS 10 FILAS DEL EXCEL ===');
      rows.slice(0, 10).forEach((r, i) => console.log(`Fila ${i}:`, r));

      const filaEnc = encontrarFilaEncabezados(rows);
      console.log('Fila de encabezados detectada:', filaEnc, rows[filaEnc]);

      if (filaEnc === -1) {
        mostrarToast('No se encontraron encabezados válidos en el archivo', 'error');
        mostrarLoader(false);
        return;
      }

      const headers = rows[filaEnc].map(h => String(h).trim());
      console.log('Headers:', headers);

      const dataRows = rows.slice(filaEnc + 1).filter(r =>
        r.some(c => String(c).trim() !== '')
      );

      const estudiantes = dataRows
        .map(row => mapearFila(headers, row))
        .filter(e => {
          const tieneNombre = e.nombre && e.nombre.trim().length > 1;
          const tieneDoc = e.documento && e.documento.trim().length > 1;
          return tieneNombre && tieneDoc;
        });

      console.log(`Estudiantes válidos para importar: ${estudiantes.length}`);
      if (estudiantes.length > 0) console.log('Primer estudiante:', estudiantes[0]);

      if (!estudiantes.length) {
        mostrarToast('No se encontraron filas válidas. Revisa la consola (F12) para más detalles.', 'error');
        mostrarLoader(false);
        return;
      }

      const { count } = await db.from('estudiantes').select('*', { count: 'exact', head: true });
      if (count > 0) {
        const ok = confirm(
          `Ya hay ${count} estudiantes en la base de datos.\n\n` +
          `¿Deseas reemplazar todos con los ${estudiantes.length} del nuevo archivo?\n\n` +
          `(Se borrarán primero los datos actuales)`
        );
        if (!ok) { mostrarLoader(false); return; }
        await db.from('estudiantes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      }

      const lote = 100;
      let insertados = 0;
      let errores = 0;
      for (let i = 0; i < estudiantes.length; i += lote) {
        const batch = estudiantes.slice(i, i + lote);
        const { error } = await db.from('estudiantes').insert(batch);
        if (error) {
          console.error('Error en lote', i, error);
          errores += batch.length;
        } else {
          insertados += batch.length;
        }
      }

      mostrarLoader(false);
      mostrarToast(
        `✓ ${insertados} estudiantes importados correctamente${errores ? ` | ${errores} con error` : ''}`,
        'success'
      );
      cargarBase();
      cargarStats();
    } catch (err) {
      mostrarLoader(false);
      mostrarToast('Error al procesar el archivo: ' + err.message, 'error');
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
  event.target.value = '';
}

function encontrarFilaEncabezados(rows) {
  const keywords = ['estudiante', 'identificacion', 'grupo', 'celular', 'ips', 'nombre', 'documento', 'acudiente', 'parentesco'];
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const textos = rows[i].map(c => normalizar(String(c)));
    const hits = keywords.filter(k => textos.some(t => t === k || (t.length > 3 && t.includes(k))));
    if (hits.length >= 3) return i;
  }
  return -1;
}

function mapearFila(headers, row) {
  const get = (...aliases) => {
    for (const alias of aliases) {
      const aN = normalizar(alias);
      const idx = headers.findIndex(h => {
        const hN = normalizar(h);
        if (hN.length === 0) return false;
        if (hN === aN) return true;
        if (hN.length > 3 && aN.length > 3 && hN.includes(aN)) return true;
        return false;
      });
      if (idx !== -1) {
        const val = String(row[idx] ?? '').trim();
        if (val !== '' && val !== '0') return val;
      }
    }
    return '';
  };

  const nomAcud  = get('Nombres(Acudiente)', 'nombresacudiente', 'nombreacudiente');
  const apelAcud = get('Apellidos(Acudiente)', 'apellidosacudiente', 'apellidoacudiente');
  const acudiente = (nomAcud && apelAcud)
    ? `${nomAcud} ${apelAcud}`
    : (nomAcud || apelAcud || get('acudiente', 'responsable'));

  return {
    nombre:        get('Estudiante', 'estudiante', 'nombrecompleto', 'nombre'),
    documento:     get('Identificacion', 'Identificación', 'identificacion', 'documento', 'cedula'),
    grupo:         get('Grupo', 'grupo', 'grado', 'curso'),
    celular:       get('Celular', 'celular', 'telefono', 'cel'),
    ips:           get('IPS', 'ips', 'eps'),
    discapacidad:  get('Tipodiscapacidad', 'discapacidad', 'condicion'),
    acudiente,
    parentesco:    get('Parentesco(Acudiente)', 'parentescoacudiente', 'parentesco'),
    cel_acudiente: get('Celular(Acudiente)', 'celularacudiente', 'telacudiente'),
    direccion:     get('Direccion(Acudiente)', 'direccionacudiente', 'direccion', 'domicilio')
  };
}

// ============================================================
//  EXPORTAR EXCEL — REGISTROS (ExcelJS)
// ============================================================
async function exportarRegistrosExcel() {
  if (!registrosCache.length) { mostrarToast('No hay registros para exportar', 'error'); return; }

  mostrarLoader(true);
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Registros AD-01');

    ws.columns = [
      { key: 'fecha', width: 14 },
      { key: 'nombre', width: 30 },
      { key: 'documento', width: 16 },
      { key: 'motivo', width: 35 },
      { key: 'remision', width: 16 },
      { key: 'quien_remite', width: 22 },
      { key: 'acompanamiento', width: 28 },
      { key: 'ruta', width: 28 },
      { key: 'observaciones', width: 40 },
      { key: 'rem_formal', width: 14 },
      { key: 'usuario_nombre', width: 22 }
    ];

    ws.mergeCells('A1:K1');
    ws.getCell('A1').value = 'I.E. DIVINO NIÑO — CAUCASIA, ANTIOQUIA';
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3A6B' } };
    ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 30;

    ws.mergeCells('A2:K2');
    ws.getCell('A2').value = 'REGISTROS DE ACOMPAÑAMIENTO PSICOSOCIAL — AD-01';
    ws.getCell('A2').font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2855A0' } };
    ws.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(2).height = 22;

    ws.mergeCells('A3:K3');
    ws.getCell('A3').value = `Exportado el: ${new Date().toLocaleDateString('es-CO')}  |  Total registros: ${registrosCache.length}`;
    ws.getCell('A3').font = { italic: true, size: 10, color: { argb: 'FF1A3A6B' } };
    ws.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F7' } };
    ws.getCell('A3').alignment = { horizontal: 'center' };
    ws.getRow(3).height = 18;

    ws.addRow([]);

    const encRow = ws.addRow([
      'Fecha','Estudiante','Documento','Motivo','Tipo Remisión',
      'Quién Remite','Acompañamiento','Ruta','Observaciones','Rem. Formal','Registrado Por'
    ]);
    encRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3A6B' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFFFFFFF' } } };
    });
    encRow.height = 22;

    registrosCache.forEach((r, i) => {
      const row = ws.addRow([
        r.fecha, r.nombre, r.documento, r.motivo,
        r.remision, r.quien_remite, r.acompanamiento,
        r.ruta, r.observaciones, r.rem_formal, r.usuario_nombre
      ]);
      const fill = i % 2 === 0
        ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
        : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FB' } };
      row.eachCell(cell => {
        cell.fill = fill;
        cell.alignment = { wrapText: true, vertical: 'top' };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFDCE3EF' } } };
      });
    });

    const buf = await wb.xlsx.writeBuffer();
    descargarBlob(buf, 'Registros_AD01_' + fechaHoy() + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    mostrarToast('Excel exportado ✓', 'success');
  } catch (err) {
    mostrarToast('Error al exportar: ' + err.message, 'error');
  }
  mostrarLoader(false);
}

// ============================================================
//  EXPORTAR PDF — REGISTROS (jsPDF)
// ============================================================
function exportarRegistrosPDF() {
  if (!registrosCache.length) { mostrarToast('No hay registros para exportar', 'error'); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', format: 'letter' });

  doc.setFillColor(26, 58, 107);
  doc.rect(0, 0, 280, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text('I.E. DIVINO NIÑO — Registros AD-01', 140, 13, { align: 'center' });

  doc.setTextColor(26, 58, 107);
  doc.setFontSize(10); doc.setFont('helvetica', 'normal');
  doc.text('Área de Orientación Escolar — Caucasia, Antioquia', 140, 28, { align: 'center' });

  doc.autoTable({
    startY: 34,
    head: [['Fecha','Estudiante','Documento','Motivo','Remisión','Quién Remite','Observaciones']],
    body: registrosCache.map(r => [
      r.fecha || '', r.nombre || '', r.documento || '',
      (r.motivo || '').substring(0, 60),
      r.remision || '', r.quien_remite || '',
      (r.observaciones || '').substring(0, 60)
    ]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [26, 58, 107], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [232, 240, 251] },
    margin: { left: 10, right: 10 }
  });

  doc.save('Registros_AD01_' + fechaHoy() + '.pdf');
  mostrarToast('PDF exportado ✓', 'success');
}

// ============================================================
//  EXPORTAR EXCEL — BASE DE DATOS (ExcelJS)
// ============================================================
async function exportarBaseExcel() {
  if (!estudiantesCache.length) { mostrarToast('No hay estudiantes para exportar', 'error'); return; }

  mostrarLoader(true);
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Estudiantes');

    ws.columns = [
      { key: 'nombre', width: 32 }, { key: 'documento', width: 18 },
      { key: 'grupo', width: 12 }, { key: 'celular', width: 16 },
      { key: 'ips', width: 20 }, { key: 'discapacidad', width: 20 },
      { key: 'acudiente', width: 28 }, { key: 'parentesco', width: 14 },
      { key: 'cel_acudiente', width: 18 }, { key: 'direccion', width: 30 }
    ];

    ws.mergeCells('A1:J1');
    ws.getCell('A1').value = 'I.E. DIVINO NIÑO — BASE DE DATOS DE ESTUDIANTES';
    ws.getCell('A1').font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
    ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3A6B' } };
    ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(1).height = 28;

    ws.mergeCells('A2:J2');
    ws.getCell('A2').value = `Total estudiantes: ${estudiantesCache.length}  |  Exportado: ${new Date().toLocaleDateString('es-CO')}`;
    ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F7' } };
    ws.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF1A3A6B' } };
    ws.getCell('A2').alignment = { horizontal: 'center' };
    ws.getRow(2).height = 18;

    ws.addRow([]);

    const encRow = ws.addRow([
      'Nombre','Documento','Grupo','Celular','IPS',
      'Discapacidad','Acudiente','Parentesco','Cel. Acudiente','Dirección'
    ]);
    encRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3A6B' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    encRow.height = 20;

    estudiantesCache.forEach((e, i) => {
      const row = ws.addRow([
        e.nombre, e.documento, e.grupo, e.celular, e.ips,
        e.discapacidad, e.acudiente, e.parentesco, e.cel_acudiente, e.direccion
      ]);
      const fill = i % 2 === 0
        ? { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
        : { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FB' } };
      row.eachCell(cell => {
        cell.fill = fill;
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFDCE3EF' } } };
      });
    });

    const buf = await wb.xlsx.writeBuffer();
    descargarBlob(buf, 'Base_Estudiantes_' + fechaHoy() + '.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    mostrarToast('Excel exportado ✓', 'success');
  } catch (err) {
    mostrarToast('Error al exportar: ' + err.message, 'error');
  }
  mostrarLoader(false);
}

// ============================================================
//  ELIMINAR BASE DE DATOS
// ============================================================
function abrirModalEliminarBD() {
  abrirModal('modalEliminarBD');
}

async function ejecutarEliminarBD(tipo) {
  const mensajes = {
    estudiantes: '¿Estás SEGURO de que quieres eliminar TODOS los estudiantes?\n\nEsta acción no se puede deshacer.',
    registros:   '¿Estás SEGURO de que quieres eliminar TODOS los registros AD-01 y sus seguimientos?\n\nEsta acción no se puede deshacer.',
    todo:        '⚠️ ADVERTENCIA MÁXIMA ⚠️\n\n¿Estás SEGURO de que quieres eliminar TODO:\n- Todos los estudiantes\n- Todos los registros AD-01\n- Todos los seguimientos\n\nEsta acción es IRREVERSIBLE.'
  };

  if (!confirm(mensajes[tipo])) return;

  cerrarModal('modalEliminarBD');
  mostrarLoader(true);

  try {
    const UUID_DUMMY = '00000000-0000-0000-0000-000000000000';

    if (tipo === 'registros' || tipo === 'todo') {
      const { error: errSeg } = await db.from('seguimientos').delete().neq('id', UUID_DUMMY);
      if (errSeg) throw new Error('Error eliminando seguimientos: ' + errSeg.message);

      const { error: errReg } = await db.from('registros').delete().neq('id', UUID_DUMMY);
      if (errReg) throw new Error('Error eliminando registros: ' + errReg.message);
    }

    if (tipo === 'estudiantes' || tipo === 'todo') {
      const { error: errEst } = await db.from('estudiantes').delete().neq('id', UUID_DUMMY);
      if (errEst) throw new Error('Error eliminando estudiantes: ' + errEst.message);
    }

    mostrarLoader(false);

    const msgs = {
      estudiantes: 'Todos los estudiantes fueron eliminados ✓',
      registros:   'Todos los registros y seguimientos fueron eliminados ✓',
      todo:        'Todos los datos del sistema fueron eliminados ✓'
    };
    mostrarToast(msgs[tipo], 'success');

    cargarBase();
    cargarRegistros();
    cargarStats();
  } catch (err) {
    mostrarLoader(false);
    mostrarToast('Error: ' + err.message, 'error');
    console.error(err);
  }
}

// ============================================================
//  UTILIDADES
// ============================================================
function abrirModal(id) {
  document.getElementById(id)?.classList.remove('hidden');
}
function cerrarModal(id) {
  document.getElementById(id)?.classList.add('hidden');
}

function mostrarToast(msg, tipo = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (tipo ? ' ' + tipo : '');
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3500);
}

function mostrarLoader(show) {
  document.getElementById('loader').classList.toggle('hidden', !show);
}

function descargarBlob(buffer, nombre, mime) {
  const blob = new Blob([buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function fechaHoy() {
  return new Date().toISOString().split('T')[0];
}

// Cerrar modales al hacer click fuera
document.addEventListener('click', (e) => {
  ['modalRegistro','modalSeguimiento','modalEstudiante','modalEliminarBD'].forEach(id => {
    const modal = document.getElementById(id);
    if (modal && e.target === modal) cerrarModal(id);
  });
});
