const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function toICSDate(isoStr) {
  const d = new Date(isoStr);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeICS(s) {
  return String(s || '').replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
}

function event({ uid, start, summary, description, alarms }) {
  const startDate = new Date(start);
  const endDate = new Date(startDate.getTime() + 3600000);
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toICSDate(new Date().toISOString())}`,
    `DTSTART:${toICSDate(startDate.toISOString())}`,
    `DTEND:${toICSDate(endDate.toISOString())}`,
    `SUMMARY:${escapeICS(summary)}`,
    `DESCRIPTION:${escapeICS(description)}`
  ];
  for (const a of alarms) {
    lines.push(
      'BEGIN:VALARM',
      `TRIGGER:${a.trigger}`,
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeICS(a.label)}`,
      'END:VALARM'
    );
  }
  lines.push('END:VEVENT');
  return lines;
}

function main() {
  const exams = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/exams.json'), 'utf8'));
  const todos = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/todos.json'), 'utf8'));

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//exam-reminder//CN',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:考试与待办'
  ];

  const defaultAlarms = [
    { trigger: '-P7D', label: '还有 7 天' },
    { trigger: '-P3D', label: '还有 3 天' },
    { trigger: '-P1D', label: '还有 1 天' },
    { trigger: '-PT1H', label: '还有 1 小时' }
  ];

  for (const exam of exams) {
    for (const ev of exam.events) {
      lines.push(...event({
        uid: `${exam.id}-${ev.type}@exam-reminder`,
        start: ev.date,
        summary: `${exam.name} - ${ev.type}`,
        description: `${ev.note || ''}\n来源：${exam.source || ''}`,
        alarms: defaultAlarms
      }));
    }
  }

  for (const todo of todos) {
    if (todo.done) continue;
    lines.push(...event({
      uid: `${todo.id}@exam-reminder`,
      start: todo.due,
      summary: `待办：${todo.title}`,
      description: '',
      alarms: [
        { trigger: '-P1D', label: '还有 1 天' },
        { trigger: '-PT3H', label: '还有 3 小时' },
        { trigger: '-PT30M', label: '还有 30 分钟' }
      ]
    }));
  }

  lines.push('END:VCALENDAR');

  const outDir = path.join(ROOT, 'docs');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'calendar.ics'), lines.join('\r\n'));
  console.log('docs/calendar.ics 已生成');
}

main();
