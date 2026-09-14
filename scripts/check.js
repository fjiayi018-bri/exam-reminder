const fs = require('fs');
const path = require('path');
const https = require('https');

const NTFY_TOPIC = process.env.NTFY_TOPIC;
if (!NTFY_TOPIC) {
  console.error('缺少 NTFY_TOPIC 环境变量');
  process.exit(1);
}

const ROOT = path.join(__dirname, '..');

// 发送 ntfy 推送
function push(title, message, priority = 3) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      topic: NTFY_TOPIC,
      title,
      message,
      priority,           // 1=min 2=low 3=default 4=high 5=urgent
      tags: ['bell']
    });
    const req = https.request({
      hostname: 'ntfy.sh',
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, res => {
      res.on('data', () => {});
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// 把时间转成北京时间当天日期字符串 YYYY-MM-DD
function beijingDate(d) {
  const t = new Date(d.getTime() + 8 * 3600 * 1000);
  return t.toISOString().slice(0, 10);
}

// 计算日期差（天），今天 0，明天 1，后天 2 ...
function daysUntil(isoStr, now) {
  const target = new Date(isoStr);
  const t1 = new Date(beijingDate(target) + 'T00:00:00+08:00');
  const t2 = new Date(beijingDate(now) + 'T00:00:00+08:00');
  return Math.round((t1 - t2) / 86400000);
}

async function main() {
  const now = new Date();
  const exams = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/exams.json'), 'utf8'));
  const todos = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/todos.json'), 'utf8'));

  // 考试事件：提前 7 / 3 / 1 / 0 天提醒
  const TRIGGERS = [7, 3, 1, 0];
  for (const exam of exams) {
    for (const ev of exam.events) {
      const d = daysUntil(ev.date, now);
      if (!TRIGGERS.includes(d)) continue;

      let priority = 3;
      let title = '';
      let msg = '';

      if (d === 0) {
        priority = 5;
        title = `🔔 今天：${exam.name} · ${ev.type}`;
        msg = ev.note || '就是今天，别忘了！';
      } else if (d === 1) {
        priority = 4;
        title = `⏰ 明天：${exam.name} · ${ev.type}`;
        msg = ev.note || '提前准备好材料';
      } else {
        title = `📅 ${d} 天后：${exam.name} · ${ev.type}`;
        msg = `${ev.date.slice(0, 10)} ${ev.note || ''}`.trim();
      }

      await push(title, msg, priority);
      console.log(`已推送：${title}`);
    }
  }

  // 待办：今天或明天到期就提醒
  for (const todo of todos) {
    if (todo.done) continue;
    const d = daysUntil(todo.due, now);
    if (d === 0 || d === 1) {
      const priority = d === 0 ? 5 : 4;
      const title = d === 0 ? `📌 今天到期：${todo.title}` : `📌 明天到期：${todo.title}`;
      await push(title, `截止：${todo.due.slice(0, 16).replace('T', ' ')}`, priority);
      console.log(`已推送：${title}`);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
