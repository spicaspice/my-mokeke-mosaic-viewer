const fs = require('fs');
const path = require('path');

// 画像フォルダのマッピング
const regionMap = {
  '01hokkaido': '北海道',
  '02tohoku': '東北',
  '03kanto': '関東',
  '04chubu': '中部',
  '05kinki': '近畿',
  '06chugoku': '中国',
  '07shikoku': '四国',
  '08kyushu': '九州',
  '09okinawa': '沖縄',
  '10sports': 'スポーツ',
  '11suizokukan': '水族館',
  '12kisetsu': '季節'
};

// 画像ファイル名を解析する関数
function parseImageFilename(filename, regionName) {
  // 例: 01_北海道_01_北海道_01_牛.jpg
  const parts = filename.replace('.jpg', '').split('_');
  if (parts.length < 6) return null;
  
  const areaNo = parts[0];           // エリア番号 (01)
  const area = parts[1];             // エリア (北海道)
  const regionNo = parts[2];         // 地域番号 (01)
  const region = parts[3];           // 地域 (北海道)
  const itemNo = parts[4];           // 番号 (01)
  const itemName = parts[5];         // 名前 (牛)
  const color = parts.length > 6 ? parts.slice(6).join('_') : ''; // カラー区分
  
  return {
    areaNo,
    area,
    regionNo,
    region,
    itemNo,
    itemName,
    color,
    filename,
    regionName
  };
}

// メイン処理
async function extractImageData() {
  const csvData = [];
  const header = ['エリア番号', 'エリア', '地域番号', '地域', '番号', '名前', 'カラー区分', 'ファイル名', 'フォルダ名'];
  csvData.push(header);
  
  console.log('画像データの抽出を開始...');
  
  for (const [folder, regionName] of Object.entries(regionMap)) {
    const folderPath = path.join('images', folder);
    
    try {
      if (fs.existsSync(folderPath)) {
        const files = fs.readdirSync(folderPath);
        const imageFiles = files.filter(file => file.endsWith('.jpg'));
        
        console.log(`${regionName} (${folder}): ${imageFiles.length} 枚の画像を処理中...`);
        
        for (const filename of imageFiles) {
          const imageData = parseImageFilename(filename, regionName);
          if (imageData) {
            csvData.push([
              imageData.areaNo,
              imageData.area,
              imageData.regionNo,
              imageData.region,
              imageData.itemNo,
              imageData.itemName,
              imageData.color,
              imageData.filename,
              folder
            ]);
          }
        }
      } else {
        console.log(`${folder} フォルダが見つかりません`);
      }
    } catch (error) {
      console.error(`${folder} の処理中にエラー:`, error.message);
    }
  }
  
  // CSVファイルに書き込み
  const csvContent = csvData.map(row => 
    row.map(cell => `"${cell}"`).join(',')
  ).join('\n');
  
  fs.writeFileSync('image_data.csv', csvContent, 'utf8');
  
  console.log(`\nCSVファイル作成完了: image_data.csv`);
  console.log(`総画像数: ${csvData.length - 1} 枚`);
  
  // 統計情報を表示
  const stats = {};
  for (let i = 1; i < csvData.length; i++) {
    const region = csvData[i][3]; // 地域
    stats[region] = (stats[region] || 0) + 1;
  }
  
  console.log('\n地域別統計:');
  Object.entries(stats).forEach(([region, count]) => {
    console.log(`  ${region}: ${count} 枚`);
  });
  
  // 最初の10行を表示
  console.log('\nCSVファイルの最初の10行:');
  for (let i = 0; i < Math.min(10, csvData.length); i++) {
    console.log(csvData[i].join(', '));
  }
}

// 実行
extractImageData().catch(console.error);
