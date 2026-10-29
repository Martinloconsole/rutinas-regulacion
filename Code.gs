/**
 * RUTINAS DE REGULACIÓN — Backend en Google Apps Script
 * Pega este archivo en: Hoja de cálculo > Extensiones > Apps Script
 * Luego: Implementar > Nueva implementación > Aplicación web
 *        (Ejecutar como: Yo · Quién tiene acceso: Cualquier persona)
 *
 * Sobre CORS: Apps Script no permite fijar cabeceras manualmente, pero las
 * Web Apps que devuelven ContentService responden con
 * "Access-Control-Allow-Origin: *". Por eso app.js envía el POST como
 * text/plain (petición "simple", sin preflight OPTIONS).
 */

const SHEET_NAME = 'Registro';
const HEADERS = ['Fecha', 'Momento (Día/Noche)', 'Hábito', 'Completado (Sí/No)'];
const COLOR_SI = '#b7e1cd';  // verde
const COLOR_NO = '#f4c7c3';  // rojo

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold').setBackground('#e8e8e8');
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('@'); // la fecha se guarda como texto AAAA-MM-DD
    sh.setColumnWidths(1, 4, 160);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function normDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v).trim();
}

/** GET ?action=list → devuelve todos los registros. Sin action → ping. */
function doGet(e) {
  try {
    const action = e && e.parameter && e.parameter.action;
    if (action !== 'list') return json_({ ok: true, message: 'Rutinas de Regulación API activa' });

    const sh = getSheet_();
    const last = sh.getLastRow();
    if (last < 2) return json_({ ok: true, rows: [] });

    const values = sh.getRange(2, 1, last - 1, 4).getValues();
    const rows = values
      .filter(r => r[0] !== '' && r[2] !== '')
      .map(r => ({
        fecha: normDate_(r[0]),
        momento: String(r[1]),
        habito: String(r[2]),
        completado: String(r[3])
      }));
    return json_({ ok: true, rows: rows });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** POST con JSON: { fecha, momento, habito, completado }  o  { items: [ ... ] } */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const items = Array.isArray(body.items) ? body.items : [body];

    const sh = getSheet_();
    const last = sh.getLastRow();
    const existing = last > 1 ? sh.getRange(2, 1, last - 1, 3).getValues() : [];
    const index = {};
    existing.forEach((r, i) => { index[normDate_(r[0]) + '|' + r[1] + '|' + r[2]] = i + 2; });

    let saved = 0;
    items.forEach(it => {
      if (!it || !it.fecha || !it.habito) return;
      const fecha = normDate_(it.fecha);
      const momento = String(it.momento || '');
      const habito = String(it.habito);
      const completado = it.completado === 'Sí' ? 'Sí' : 'No';
      const key = fecha + '|' + momento + '|' + habito;

      let row = index[key];
      if (!row) {
        row = sh.getLastRow() + 1;
        sh.getRange(row, 1).setNumberFormat('@').setValue(fecha);
        sh.getRange(row, 2).setValue(momento);
        sh.getRange(row, 3).setValue(habito);
        index[key] = row;
      }
      sh.getRange(row, 4)
        .setValue(completado)
        .setBackground(completado === 'Sí' ? COLOR_SI : COLOR_NO);
      saved++;
    });

    return json_({ ok: true, saved: saved });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}
