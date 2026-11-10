/**
 * Gabi OS — envia a aba "Tarefas" desta planilha para as Tarefas do Trabalho TURBO.
 *
 * Como instalar (uma vez):
 *   1. Na planilha: Extensões > Apps Script.
 *   2. Apague o que estiver no editor, cole este código e salve.
 *   3. Escolha a função "instalarGabiOS" no topo e clique em Executar. Autorize o acesso.
 *
 * Depois disso, toda linha nova (ou alterada) na aba Tarefas vai para o Gabi OS sozinha:
 *   - na hora em que a planilha é editada; e
 *   - de 15 em 15 minutos, como garantia.
 * Também aparece o menu "Gabi OS > Enviar tarefas agora".
 *
 * Só entram linhas com a coluna "Tarefa" preenchida e Proprietário = Gabriela (ou vazio).
 * A ligação entre cada linha e a tarefa fica guardada na própria linha (metadados invisíveis),
 * então ordenar, filtrar ou inserir linhas não cria tarefas repetidas.
 */
const GABI_OS_URL = 'https://gabi-os-api.onrender.com/functions/v1/sheet-sync';
const GABI_OS_TOKEN = 'COLE_AQUI_O_TOKEN';
const GABI_OS_ABA = 'Tarefas';
const GABI_OS_CHAVE = 'gabi_os_id';

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Gabi OS').addItem('Enviar tarefas agora', 'enviarTarefasGabiOSMenu').addToUi();
}

function instalarGabiOS() {
  const ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers()
    .filter((t) => ['gabiOsAoEditar', 'gabiOsPeriodico'].indexOf(t.getHandlerFunction()) >= 0)
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('gabiOsAoEditar').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('gabiOsAoEditar').forSpreadsheet(ss).onChange().create();
  ScriptApp.newTrigger('gabiOsPeriodico').timeBased().everyMinutes(15).create();
  const r = enviarTarefasGabiOS();
  Logger.log('Instalado. Primeiro envio: ' + JSON.stringify(r));
}

function gabiOsAoEditar(e) {
  if (e && e.range && e.range.getSheet().getName() !== GABI_OS_ABA) return;
  enviarTarefasGabiOS();
}

function gabiOsPeriodico() {
  enviarTarefasGabiOS();
}

function enviarTarefasGabiOSMenu() {
  const r = enviarTarefasGabiOS();
  SpreadsheetApp.getActive().toast(
    'Novas: ' + r.created + ' · Atualizadas: ' + r.updated + ' · Sem mudança: ' + r.unchanged + ' · Fora (outra pessoa/sem título): ' + r.ignored,
    'Gabi OS',
    8
  );
}

function enviarTarefasGabiOS() {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) return null;
  try {
    const ss = SpreadsheetApp.getActive();
    const sh = ss.getSheetByName(GABI_OS_ABA);
    if (!sh) throw new Error('Aba "' + GABI_OS_ABA + '" não encontrada.');
    const ultima = sh.getLastRow();
    const ncol = sh.getLastColumn();
    if (ultima < 2 || ncol < 1) return enviar_(ss, []);
    const cab = sh.getRange(1, 1, 1, ncol).getValues()[0].map((h) => String(h).trim());
    const valores = sh.getRange(2, 1, ultima - 1, ncol).getValues();
    const tz = ss.getSpreadsheetTimeZone();
    const chaves = chavesDasLinhas_(sh);
    const usadas = {};
    const linhas = [];
    valores.forEach((linha, i) => {
      const r = i + 2;
      const obj = {};
      cab.forEach((h, c) => {
        if (!h) return;
        const v = linha[c];
        obj[h] = v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : String(v).trim();
      });
      if (!obj['Tarefa']) return;
      const mds = chaves[r] || [];
      let chave = mds.length ? mds[0].getValue() : null;
      if (!chave || usadas[chave]) {
        // Linha nova (ou copiada de outra): ganha uma identificação própria
        mds.forEach((md) => md.remove());
        chave = Utilities.getUuid();
        sh.getRange(r + ':' + r).addDeveloperMetadata(GABI_OS_CHAVE, chave);
      }
      usadas[chave] = true;
      linhas.push({ key: chave, values: obj });
    });
    return enviar_(ss, linhas);
  } finally {
    lock.releaseLock();
  }
}

function chavesDasLinhas_(sh) {
  const m = {};
  sh.createDeveloperMetadataFinder()
    .withKey(GABI_OS_CHAVE)
    .withLocationType(SpreadsheetApp.DeveloperMetadataLocationType.ROW)
    .find()
    .forEach((md) => {
      const row = md.getLocation().getRow().getRow();
      (m[row] = m[row] || []).push(md);
    });
  return m;
}

function enviar_(ss, linhas) {
  const opcoes = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-sync-token': GABI_OS_TOKEN },
    payload: JSON.stringify({ spreadsheetId: ss.getId(), rows: linhas }),
    muteHttpExceptions: true,
  };
  let res = null;
  // O servidor gratuito do Render "dorme": a primeira chamada pode demorar ~50 s
  for (let t = 0; t < 3; t++) {
    try {
      res = UrlFetchApp.fetch(GABI_OS_URL, opcoes);
      if (res.getResponseCode() < 500) break;
    } catch (e) {
      if (t === 2) throw e;
    }
    Utilities.sleep(5000);
  }
  const code = res.getResponseCode();
  const body = res.getContentText();
  Logger.log('Gabi OS respondeu ' + code + ': ' + body);
  if (code !== 200) throw new Error('Gabi OS respondeu ' + code + ': ' + body);
  return JSON.parse(body);
}
