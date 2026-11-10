import type { RequestState } from './App.js';

/** Rows for export. Anything not answered, or blocked by Verify, goes out blank with its status. */
function rows(req: RequestState) {
  return req.questions.map((q, i) => {
    const r = req.results[q.id];
    const ok = r && r.status === 'answered' && !r.exportBlocked;
    return {
      '#': i + 1,
      Question: q.text,
      Answer: ok ? r.answerLabel ?? '' : '',
      Comment: ok ? r.comment ?? '' : '',
      Evidence: ok && r.evidence ? r.evidence.quote : '',
      Policy: ok && r.evidence ? r.evidence.docTitle : '',
      Confidence: ok && r.probability != null ? `${Math.round(r.probability * 100)}%` : '',
      Status: !r ? 'Not read' : ok ? (r.fromLibrary ? `Answered by ${r.fromLibrary.answeredBy}` : 'Answered from policy') : r.reasons.map((x) => x.text).join(' '),
    };
  });
}

function download(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function exportCsv(req: RequestState) {
  const data = rows(req);
  const head = Object.keys(data[0]);
  const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [head.map(esc).join(','), ...data.map((r) => head.map((h) => esc((r as any)[h])).join(','))].join('\n');
  download('questionnaire-answers.csv', new Blob([csv], { type: 'text/csv' }));
}

export async function exportXlsx(req: RequestState) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Answers');
  const data = rows(req);
  ws.columns = Object.keys(data[0]).map((k) => ({ header: k, key: k, width: k === 'Question' || k === 'Comment' || k === 'Evidence' ? 60 : 16 }));
  data.forEach((r) => ws.addRow(r));
  ws.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  download('questionnaire-answers.xlsx', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}
