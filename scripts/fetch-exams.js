const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const EXAMS_PATH = path.join(ROOT, 'data/exams.json');

// 简易抓取页面
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// 从教资官网提取考试时间（示例：解析首页或考试安排页）
async function fetchNTCE() {
  try {
    const html = await fetchUrl('https://ntce.neea.edu.cn/');
    // 这里用正则粗略匹配日期，实际可更精确
    const dateRegex = /(\d{4})年(\d{1,2})月(\d{1,2})日/g;
    const dates = [];
    let match;
    while ((match = dateRegex.exec(html)) !== null) {
      dates.push(`${match[1]}-${String(match[2]).padStart(2,'0')}-${String(match[3]).padStart(2,'0')}`);
    }
    if (dates.length > 0) {
      return {
        id: 'ntce',
        name: '教师资格证（笔试）',
        region: '全国',
        events: [
          { type: '考试', date: dates[0] + 'T09:00:00+08:00', note: '自动抓取，请以官网为准' }
        ],
        source: '中国教育考试网',
        updated_at: new Date().toISOString().slice(0,10)
      };
    }
  } catch (e) {
    console.error('抓取教资失败', e);
  }
  return null;
}

// 保留原有数据，合并新抓取的
async function main() {
  let exams = [];
  if (fs.existsSync(EXAMS_PATH)) {
    exams = JSON.parse(fs.readFileSync(EXAMS_PATH, 'utf8'));
  }

  const ntce = await fetchNTCE();
  if (ntce) {
    // 移除旧教资数据，插入新数据
    exams = exams.filter(e => e.id !== 'ntce');
    exams.push(ntce);
  }

  // 四六级考试时间（全国统一，示例固定，实际也可抓取）
  const cet = {
    id: 'cet',
    name: '英语四六级',
    region: '全国',
    events: [
      { type: '考试', date: '2026-12-12T09:00:00+08:00', note: '以学校通知为准' }
    ],
    source: '中国教育考试网',
    updated_at: new Date().toISOString().slice(0,10)
  };
  exams = exams.filter(e => e.id !== 'cet');
  exams.push(cet);

  fs.writeFileSync(EXAMS_PATH, JSON.stringify(exams, null, 2));
  console.log('exams.json 已更新');
}

main().catch(console.error);
