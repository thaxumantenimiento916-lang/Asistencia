// ============================================================
// CONFIGURACIÓN — pega aquí la URL de tu Apps Script Web App
// ============================================================
const API_URL = 'https://script.google.com/macros/s/AKfycbwl0Q2Mlh4ExJ9vl7kqCMQfJedaJ3lBYoUDEiHrSAOZ1Q4mPcwNUKkQqCxeNUfFALvX_w/exec';

const DIAS = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];
const DIAS_CORTO = { Lunes: 'Lun', Martes: 'Mar', Miercoles: 'Mié', Jueves: 'Jue', Viernes: 'Vie', Sabado: 'Sáb', Domingo: 'Dom' };

let TOKEN = localStorage.getItem('token') || null;
let personalCache = [];
let horarioCache = [];
let asistenciaCache = [];
let MINUTOS_ALMUERZO = 60; // valor por defecto; se actualiza desde Config al iniciar sesión

function calcularHorasTrabajadas(horaIngreso, horaSalida) {
  if (!horaIngreso || !horaSalida) return '';
  const [h1, m1] = horaIngreso.split(':').map(Number);
  const [h2, m2] = horaSalida.split(':').map(Number);
  if (isNaN(h1) || isNaN(h2)) return '';
  let minutos = (h2 * 60 + m2) - (h1 * 60 + m1) - MINUTOS_ALMUERZO;
  if (minutos < 0) minutos += 24 * 60;
  const horas = Math.floor(minutos / 60);
  const mins = minutos % 60;
  return `${horas}h ${mins}m`;
}

// ============================================================
// API helper — usa text/plain para evitar preflight CORS con Apps Script
// ============================================================
async function api(action, payload) {
  const body = JSON.stringify({ action, token: TOKEN, ...payload });
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body
  });
  return res.json();
}

// ============================================================
// LOGIN
// ============================================================
async function login() {
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';
  try {
    const res = await api('login', { password });
    if (res.ok) {
      TOKEN = res.token;
      localStorage.setItem('token', TOKEN);
      mostrarApp();
    } else {
      errorEl.textContent = res.error || 'Contraseña incorrecta';
    }
  } catch (e) {
    errorEl.textContent = 'No se pudo conectar con el servidor. Revisa API_URL en app.js.';
  }
}

function logout() {
  TOKEN = null;
  localStorage.removeItem('token');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
}

function mostrarApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  const hoy = new Date();
  document.getElementById('fechaAsistencia').value = fmtDate(hoy);
  document.getElementById('fechaReporte').value = fmtDate(hoy);
  document.getElementById('semanaInput').value = fmtDate(lunesDeEstaSemana(hoy));
  cargarPersonal();
  cargarHorario();
  cargarAsistencia();
  api('getConfig', {}).then(res => { if (res.ok) MINUTOS_ALMUERZO = res.minutosAlmuerzo; });
}

if (TOKEN) mostrarApp();

// ============================================================
// UTILIDADES
// ============================================================
function fmtDate(d) { return d.toISOString().split('T')[0]; }
function lunesDeEstaSemana(d) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date;
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 2500);
}
function showTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.remove('hidden');
  document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add('active');
}

// ============================================================
// PERSONAL
// ============================================================
async function cargarPersonal() {
  const res = await api('getPersonal', {});
  if (!res.ok) return toast(res.error || 'Error cargando personal');
  personalCache = res.data;
  renderPersonal();
}

function renderPersonal() {
  const tbody = document.querySelector('#tablaPersonal tbody');
  tbody.innerHTML = '';
  personalCache.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.nombre}</td>
      <td>${p.tipo}</td>
      <td>${p.area || ''}</td>
      <td>${p.estado}</td>
      <td><button onclick='editarPersonal(${JSON.stringify(p)})'>Editar</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function abrirFormPersonal() {
  document.getElementById('formPersonal').classList.remove('hidden');
  document.getElementById('pId').value = '';
  document.getElementById('pNombre').value = '';
  document.getElementById('pArea').value = '';
}
function cerrarFormPersonal() {
  document.getElementById('formPersonal').classList.add('hidden');
}
function editarPersonal(p) {
  document.getElementById('formPersonal').classList.remove('hidden');
  document.getElementById('pId').value = p.id;
  document.getElementById('pNombre').value = p.nombre;
  document.getElementById('pTipo').value = p.tipo;
  document.getElementById('pArea').value = p.area;
  document.getElementById('pEstado').value = p.estado;
}
async function guardarPersonal() {
  const persona = {
    id: document.getElementById('pId').value,
    nombre: document.getElementById('pNombre').value,
    tipo: document.getElementById('pTipo').value,
    area: document.getElementById('pArea').value,
    estado: document.getElementById('pEstado').value
  };
  if (!persona.nombre) return toast('Falta el nombre');
  const res = await api('savePersonal', { persona });
  if (res.ok) {
    toast('Guardado');
    cerrarFormPersonal();
    cargarPersonal();
  } else {
    toast(res.error || 'Error');
  }
}

// ============================================================
// HORARIO SEMANAL
// ============================================================
async function cargarHorario() {
  const semana = document.getElementById('semanaInput').value;
  if (!semana) return;
  const res = await api('getHorario', { semana });
  if (!res.ok) return toast(res.error || 'Error cargando horario');
  horarioCache = res.data;
  renderHorario();
}

async function generarHorario() {
  const semana = document.getElementById('semanaInput').value;
  if (!semana) return toast('Selecciona una semana primero');
  const res = await api('generarHorario', { semana });
  if (res.ok) {
    horarioCache = res.data;
    renderHorario();
    toast('Propuesta generada. Revisa y ajusta antes de guardar.');
  } else {
    toast(res.error || 'Error');
  }
}

function renderHorario() {
  if (personalCache.length === 0) return;
  const tbody = document.querySelector('#tablaHorario tbody');
  tbody.innerHTML = '';
  const activos = personalCache.filter(p => p.estado === 'Activo');

  activos.forEach(p => {
    const tr = document.createElement('tr');
    let celdas = `<td>${p.nombre}</td><td>${p.tipo}</td>`;
    DIAS.forEach(dia => {
      const registro = horarioCache.find(h => h.id === p.id && h.dia === dia);
      const turno = registro ? registro.turno : 'Dia';
      celdas += `<td>
        <select class="turno-select" data-turno="${turno}" data-id="${p.id}" data-nombre="${p.nombre.replace(/"/g,'&quot;')}" data-dia="${dia}"
          onchange="this.dataset.turno=this.value">
          <option value="Dia" ${turno === 'Dia' ? 'selected' : ''}>Día</option>
          <option value="Noche" ${turno === 'Noche' ? 'selected' : ''}>Noche</option>
          <option value="Descanso" ${turno === 'Descanso' ? 'selected' : ''}>Descanso</option>
        </select>
      </td>`;
    });
    tr.innerHTML = celdas;
    tbody.appendChild(tr);
  });
}

async function guardarHorario() {
  const semana = document.getElementById('semanaInput').value;
  const filas = [];
  document.querySelectorAll('#tablaHorario select.turno-select').forEach(sel => {
    filas.push({ id: sel.dataset.id, nombre: sel.dataset.nombre, dia: sel.dataset.dia, turno: sel.value });
  });
  const res = await api('guardarHorario', { semana, filas });
  if (res.ok) {
    toast('Horario guardado');
    cargarHorario();
  } else {
    toast(res.error || 'Error');
  }
}

// ============================================================
// ASISTENCIA
// ============================================================
async function cargarAsistencia() {
  const fecha = document.getElementById('fechaAsistencia').value;
  if (!fecha) return;
  const [semana, diaNombre] = semanaYDiaDe(fecha);
  document.getElementById('semanaInput').value; // no-op, mantiene selección de horario aparte

  const resHorario = await api('getHorario', { semana });
  const resAsist = await api('getAsistencia', { fecha });
  if (!resAsist.ok) return toast(resAsist.error || 'Error');

  asistenciaCache = resAsist.data;
  const horarioDia = (resHorario.ok ? resHorario.data : []).filter(h => h.dia === diaNombre);
  renderAsistencia(horarioDia);
}

function semanaYDiaDe(fechaStr) {
  const fecha = new Date(fechaStr + 'T00:00:00');
  const lunes = lunesDeEstaSemana(fecha);
  const diaNombre = DIAS[(fecha.getDay() + 6) % 7];
  return [fmtDate(lunes), diaNombre];
}

const OPCIONES_INGRESO = ['7:30', 'Otro'];
const OPCIONES_SALIDA = ['17:00', '19:30', 'Otro'];

function renderAsistencia(horarioDia) {
  const tbody = document.querySelector('#tablaAsistencia tbody');
  tbody.innerHTML = '';
  const activos = personalCache.filter(p => p.estado === 'Activo');

  activos.forEach(p => {
    const asignado = horarioDia.find(h => h.id === p.id);
    const turno = asignado ? asignado.turno : 'Dia';
    if (turno === 'Descanso') return;
    const marca = asistenciaCache.find(a => a.id === p.id);
    const estado = marca ? marca.estado : 'Sin marcar';

    const badgeClass = {
      'Presente': 'badge-presente', 'Ausente': 'badge-ausente', 'Sin marcar': 'badge-sin-marcar'
    }[estado];

    const nombreSeguro = p.nombre.replace(/'/g, "\\'");
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.nombre}</td>
      <td>${p.tipo}</td>
      <td>${turno}</td>
      <td><span class="badge ${badgeClass}">${estado}</span></td>
      <td>${renderHoraSelect(p.id, 'ingreso', OPCIONES_INGRESO, marca ? marca.horaIngreso : '')}</td>
      <td>${renderHoraSelect(p.id, 'salida', OPCIONES_SALIDA, marca ? marca.horaSalida : '')}</td>
      <td class="mark-btns">
        <button class="mark-presente" onclick="marcar('${p.id}','${nombreSeguro}','${turno}','Presente')">Presente</button>
        <button class="mark-ausente" onclick="marcar('${p.id}','${nombreSeguro}','${turno}','Ausente')">Ausente</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Construye el <select> de hora + input oculto para "Otro"
function renderHoraSelect(id, tipo, opciones, valorGuardado) {
  const esPreset = opciones.includes(valorGuardado);
  const seleccion = valorGuardado ? (esPreset ? valorGuardado : 'Otro') : opciones[0];
  const opts = opciones.map(o => `<option value="${o}" ${o === seleccion ? 'selected' : ''}>${o}</option>`).join('');
  const mostrarCustom = seleccion === 'Otro';
  const valorCustom = mostrarCustom && valorGuardado ? valorGuardado : '';
  return `
    <select class="hora-select" id="${tipo}-${id}" onchange="toggleCustom('${id}','${tipo}')">${opts}</select>
    <br>
    <input type="time" class="hora-custom ${mostrarCustom ? '' : 'hidden'}" id="${tipo}-custom-${id}" value="${valorCustom}">
  `;
}

function toggleCustom(id, tipo) {
  const select = document.getElementById(`${tipo}-${id}`);
  const custom = document.getElementById(`${tipo}-custom-${id}`);
  custom.classList.toggle('hidden', select.value !== 'Otro');
}

function getHoraSeleccionada(id, tipo) {
  const select = document.getElementById(`${tipo}-${id}`);
  if (select.value === 'Otro') {
    const custom = document.getElementById(`${tipo}-custom-${id}`);
    return custom.value || '';
  }
  return select.value;
}

async function marcar(id, nombre, turno, estado) {
  const fecha = document.getElementById('fechaAsistencia').value;
  const horaIngreso = estado === 'Presente' ? getHoraSeleccionada(id, 'ingreso') : '';
  const horaSalida = estado === 'Presente' ? getHoraSeleccionada(id, 'salida') : '';
  if (estado === 'Presente' && (!horaIngreso || !horaSalida)) {
    return toast('Completa la hora de ingreso y salida');
  }
  const res = await api('marcarAsistencia', { fecha, id, nombre, turno, estado, horaIngreso, horaSalida });
  if (res.ok) {
    toast(`${nombre}: ${estado}`);
    cargarAsistencia();
  } else {
    toast(res.error || 'Error');
  }
}

// ============================================================
// REPORTES: CSV y PDF
// ============================================================
async function exportarCSV() {
  const fecha = document.getElementById('fechaReporte').value;
  const res = await api('getAsistencia', { fecha });
  if (!res.ok || res.data.length === 0) return toast('No hay datos de asistencia para esa fecha');

  let csv = 'Nombre,Turno,Estado,Ingreso,Salida,Horas trabajadas,Observaciones\n';
  res.data.forEach(a => {
    const horasTrabajadas = calcularHorasTrabajadas(a.horaIngreso, a.horaSalida);
    csv += `"${a.nombre}","${a.turno}","${a.estado}","${a.horaIngreso || ''}","${a.horaSalida || ''}","${horasTrabajadas}","${a.obs || ''}"\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `asistencia_${fecha}.csv`;
  link.click();
}

async function exportarPDF() {
  const fecha = document.getElementById('fechaReporte').value;
  const res = await api('getAsistencia', { fecha });
  if (!res.ok || res.data.length === 0) return toast('No hay datos de asistencia para esa fecha');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(`Reporte de asistencia - ${fecha}`, 14, 16);

  const filas = res.data.map(a => [a.nombre, a.turno, a.estado, a.horaIngreso || '-', a.horaSalida || '-', calcularHorasTrabajadas(a.horaIngreso, a.horaSalida) || '-', a.obs || '']);
  doc.autoTable({
    startY: 22,
    head: [['Nombre', 'Turno', 'Estado', 'Ingreso', 'Salida', 'Horas trabajadas', 'Observaciones']],
    body: filas
  });

  doc.save(`asistencia_${fecha}.pdf`);
}
