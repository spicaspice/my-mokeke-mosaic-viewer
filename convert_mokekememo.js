const fs = require('fs');

// 大分類マッピング
const majorCategoryMap = {
  // 北海道
  '北海道': '01',
  '美瑛': '01',
  '函館山': '01',
  
  // 東北
  '青森': '02',
  '岩手': '02',
  '宮城': '02',
  '秋田': '02',
  '山形': '02',
  '福島': '02',
  
  // 関東
  '茨城': '03',
  '栃木': '03',
  'あしかがフラワーパーク': '03',
  '群馬': '03',
  '荻野屋': '03',
  '埼玉': '03',
  '千葉': '03',
  '東京': '03',
  'よみうりランド': '03',
  '神奈川': '03',
  '海老名': '03',
  '江ノ島': '03',
  '箱根': '03',
  '伊豆': '03',
  '伊豆・箱根': '03',
  '鎌倉': '03',
  '湘南': '03',
  '横浜': '03',
  
  // 中部
  '新潟': '04',
  '富山': '04',
  '石川': '04',
  '北陸': '04',
  '福井': '04',
  '山梨': '04',
  '軽井沢': '04',
  '信州': '04',
  '諏訪湖': '04',
  '善光寺': '04',
  '飛騨': '04',
  '下呂温泉': '04',
  '静岡': '04',
  '富士山': '04',
  '熱海': '04',
  '富士スピードウェイ': '04',
  '富士急ハイランド': '04',
  '沼津': '04',
  'アルプス': '04',
  '名古屋': '04',
  'ナゴヤドーム': '04',
  '中日ドラゴンズ': '04',
  '三重': '04',
  
  // 近畿
  '滋賀': '05',
  '京都': '05',
  '大阪': '05',
  '淡路島': '05',
  '姫路': '05',
  '兵庫': '05',
  '城崎': '05',
  '神戸': '05',
  '但馬': '05',
  '奈良': '05',
  
  // 中国
  '鳥取': '06',
  '山陰': '06',
  '島根': '06',
  '岡山': '06',
  '瀬戸内': '06',
  '広島': '06',
  '広島東洋カープ': '06',
  '山口': '06',
  
  // 四国
  '四国': '07',
  '徳島': '07',
  '香川': '07',
  '愛媛': '07',
  '高知': '07',
  
  // 九州
  '福岡': '08',
  '佐賀': '08',
  '長崎': '08',
  '熊本': '08',
  '大分': '08',
  '宮崎': '08',
  '鹿児島': '08',
  
  // 沖縄
  '沖縄': '09',
  '石垣島': '09',
  '宮古島': '09',
  '八重山': '09',
  
  // 水族館
  '水族館': '10',
  '水族館（八景島）': '10',
  
  // スポーツ
  'スポーツ': '11',
  
  // 季節
  '春': '12',
  '夏': '12',
  'ウィンター': '12',
  
  // その他
  'その他': '13',
  'リゾート限定': '13'
};

function convertData() {
  try {
    // ファイルを読み込み
    const content = fs.readFileSync('mokekememo.md', 'utf8');
    const lines = content.split('\n');
    
    const convertedLines = [];
    
    for (const line of lines) {
      if (line.trim() === '') {
        convertedLines.push(line);
        continue;
      }
      
      const parts = line.split('\t');
      if (parts.length >= 2) {
        const categoryName = parts[1].trim();
        const majorCategory = majorCategoryMap[categoryName] || '13'; // デフォルトはその他
        
        // 03_長崎 形式に変換
        const convertedName = `${majorCategory.padStart(2, '0')}_${categoryName}`;
        convertedLines.push(`${parts[0]}\t${convertedName}`);
      } else {
        convertedLines.push(line);
      }
    }
    
    // 変換されたデータをファイルに書き込み
    const convertedContent = convertedLines.join('\n');
    fs.writeFileSync('mokekememo_converted.md', convertedContent, 'utf8');
    
    console.log('変換完了！mokekememo_converted.md に保存しました。');
    
    // 統計情報を表示
    const stats = {};
    convertedLines.forEach(line => {
      if (line.includes('_')) {
        const majorCategory = line.split('_')[0];
        stats[majorCategory] = (stats[majorCategory] || 0) + 1;
      }
    });
    
    console.log('\n大分類別統計:');
    Object.keys(stats).sort().forEach(category => {
      console.log(`${category}: ${stats[category]}件`);
    });
    
  } catch (error) {
    console.error('エラーが発生しました:', error);
  }
}

convertData();
