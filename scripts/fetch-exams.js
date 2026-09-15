const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const ROOT = path.join(__dirname, '..');
const EXAMS_PATH = path.join(ROOT, 'data/exams.json');

// 抓取中国教育考试网页面
async function fetchNEEA() {
  console.log('开始抓取考试时间...');
  let exams = [];

  // 1. 读取现有数据作为兜底
  if (fs.existsSync(EXAMS_PATH)) {
    exams = JSON.parse(fs.readFileSync(EXAMS_PATH, 'utf8'));
  }

  try {
    // 抓取教资笔试时间（中国教育考试网 NTCE）
    // 注意：这里用的是通用页面，如果官网改版，需要更新选择器
    const ntceRes = await axios.get('https://ntce.neea.edu.cn/', { timeout: 10000 });
    const $ntce = cheerio.load(ntceRes.data);
    
    // 在页面中寻找包含“考试时间”的文本（简单示例）
    const pageText = $ntce('body').text();
    const dateRegex = /(\d{4})年(\d{1,2})月(\d{1,2})日/g;
    let match;
    const foundDates = [];
    while ((match = dateRegex.exec(pageText)) !== null) {
      foundDates.push(`${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`);
    }

    if (foundDates.length > 0) {
      // 找到最新的考试日期（简单取第一个）
      const examDate = foundDates[0];
      console.log(`抓取到教资考试时间: ${examDate}`);
      
      let ntceExam = exams.find(e => e.id === 'ntce-2027h1');
      if (ntceExam) {
        // 更新考试时间（保持报名时间由手动维护，或者也尝试抓取）
        const examEvent = ntceExam.events.find(ev => ev.type.includes('考试'));
        if (examEvent) {
          examEvent.date = `${examDate}T09:00:00+08:00`;
          examEvent.note = '自动抓取，请以官网最新公告为准';
        }
      }
    }
  } catch (error) {
    console.error('抓取教资官网失败（可能是反爬或网络超时）:', error.message);
  }

  try {
    // 抓取四六级考试时间（中国教育考试网 CET）
    const cetRes = await axios.get('https://cet.neea.edu.cn/', { timeout: 10000 });
    const $cet = cheerio.load(cetRes.data);
    const cetText = $cet('body').text();
    
    // 四六级的考试时间通常固定在12月的某个周六
    // 这里只做示例，真实环境需要更精确的解析
    console.log('四六级官网访问成功，考试时间通常为12月中旬');
    
    // 如果抓到了，就更新；没抓到就保留原来手动填写的
  } catch (error) {
    console.error('抓取四六级官网失败:', error.message);
  }

  // 写回文件
  fs.writeFileSync(EXAMS_PATH, JSON.stringify(exams, null, 2));
  console.log('exams.json 已更新完毕');
}

fetchNEEA().catch(console.error);
