// АПГРЕЙД 2026 — приёмник заявок для живой Google Таблицы.
// Вставьте этот код в Apps Script вашей таблицы (Расширения → Apps Script)
// и опубликуйте как веб-приложение. Инструкция: GOOGLE_SHEETS_SETUP.md
//
// Скрипт держит лист «Заявки» точной копией базы:
//   upsert  — добавить новую строку или обновить существующую (ищет по ID в столбце A)
//   delete  — удалить строку по ID
//   replace — полностью перезаписать лист (кнопка «Синхр. с Google»)

var SHEET_NAME = 'Заявки';
var SECRET = ''; // если задали GSHEET_SECRET в Coolify — впишите то же значение; иначе оставьте ''

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (SECRET && data.secret !== SECRET) {
      return json({ ok: false, error: 'bad secret' });
    }
    var sheet = getSheet_();

    if (data.action === 'replace') {
      sheet.clearContents();
      sheet.getRange(1, 1, 1, data.headers.length).setValues([data.headers]);
      if (data.rows && data.rows.length) {
        sheet.getRange(2, 1, data.rows.length, data.headers.length).setValues(data.rows);
      }
      return json({ ok: true, count: data.rows ? data.rows.length : 0 });
    }

    if (data.action === 'upsert') {
      ensureHeaders_(sheet, data.headers);
      var rowIndex = findRowById_(sheet, data.row[0]);
      if (rowIndex > 0) {
        sheet.getRange(rowIndex, 1, 1, data.row.length).setValues([data.row]);
      } else {
        sheet.appendRow(data.row);
      }
      return json({ ok: true });
    }

    if (data.action === 'delete') {
      var idx = findRowById_(sheet, data.id);
      if (idx > 0) sheet.deleteRow(idx);
      return json({ ok: true });
    }

    return json({ ok: false, error: 'unknown action' });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  return sheet;
}

function ensureHeaders_(sheet, headers) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
}

function findRowById_(sheet, id) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return i + 2;
  }
  return -1;
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
