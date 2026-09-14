const fs = require('fs');
const path = require('path');
const https = require('https');

const NTFY_TOPIC = process.env.NTFY_TOPIC;
if (!NTFY_TOPIC) {
  console.error('缺少 NTFY_TOPIC 环境变量');
  process.exit(1);
}

const ROOT = path.join(__dirname, '..');
const TODOS_PATH = path.join(ROOT, 'data/todos.json');
const EXAMS_PATH = path.join(ROOT, 'data/exams.json');

function push(title, message, priority = 3, tags = ['bell']) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ topic: NTFY_TOPIC, title, message, priority, tags });
    const req = https.request({
      hostname: 'ntfy.sh', path: '/', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, res => { res.on('data', () => {}); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function fetchNtfyMessages() {
  return new Promise((resolve, reject) => {
    https.get(`https://ntfy.sh/${NTFY_TOPIC}/json?poll=1&since=12h`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const messages = data.trim().split('\n').map(line => {
          try { return JSON.parse(line); } catch(e) { return null; }
        }).filter(m => m && m.event === 'message');
        resolve(messages);
      });
    }).on('error', reject);
  });
}

function beijingDate(d) {
  const t = new Date(d.getTime() + 8 * 3600 * 1000);
  return t.toISOString().slice(0, 10);
}

function daysUntil(isoStr, now) {
  const target = new Date(isoStr);
  const t1 = new Date(beijingDate(target) + 'T00:00:00+08:00');
  const t2 = new Date(beijingDate(now) + 'T00:00:00+08:00');
  return Math.round((t1 - t2) / 86400000);
}

async function processIncomingMessages() {
  const messages = await fetchNtfyMessages();
  const todos = JSON.parse(fs.readFileSync(TODOS_PATH, 'utf8'));
  let changed = false;

  for (const msg of messages) {
    const text = (msg.message || '').trim();
    if (!text.startsWith('todo ')) continue;

    const match = text.match(/^todo\s+(.+?)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})$/i);
    
    if (match) {
      const title = match[1].trim();
      const due = `${match[2]}T${match[3]}:00+08:00`;
      
      const exists = todos.some(t => t.title === title && t.due === due);
      if (!exists) {
        todos.push({ id: `todo-${Date.now()}`, title: title, due: due, done: false });
        changed = true;
        await push('✅ 已添加待办', `${title}\n截止：${match[2]} ${match[3]}`, 3, ['white_check_mark']);
      }
    } else {
      await push('❌ 格式错误', '请使用：todo 任务名称 2026-09-20 18:00', 3, ['warning']);
    }
  }

  if (changed) {
    fs.writeFileSync(TODOS_PATH, JSON.stringify(todos, null, 2));
    console.log('todos.json 已更新');
  }
}

async function main() {
  await processIncomingMessages();
  const now = new Date();
  const exams = JSON.parse(fs.readFileSync(EXAMS_PATH, 'utf8'));
  const todos = JSON.parse(fs.readFileSync(TODOS_PATH, 'utf8'));

  const TRIGGERS = [7, 3, 1, 0];
  for (const exam of exams) {
    for (const ev of exam.events) {
      const d = daysUntil(ev.date, now);
      if (!TRIGGERS.includes(d)) continue;
      let priority = 3, title = '', msg = '';
      if (d === 0) { priority = 5; title = `🔔 今天：${exam.name} · ${ev.type}`; msg = ev.note || '就是今天，别忘了！'; }
      else if (d === 1) { priority = 4; title = `⏰ 明天：${exam.name} · ${ev.type}`; msg = ev.note || '提前准备好材料'; }
      else { title = `📅 ${d} 天后：${exam.name} · ${ev.type}`; msg = `${ev.date.slice(0, 10)} ${ev.note || ''}`.trim(); }
      await push(title, msg, priority);
    }
  }

  for (const todo of todos) {
    if (todo.done) continue;
    const d = daysUntil(todo.due, now);
    if (d === 0 || d === 1) {
      const priority = d === 0 ? 5 : 4;
      const title = d === 0 ? `📌 今天到期：${todo.title}` : `📌 明天到期：${todo.title}`;
      await push(title, `截止：${todo.due.slice(0, 16).replace('T', ' ')}`, priority);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
