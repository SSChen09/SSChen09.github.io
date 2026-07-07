const fs = require('fs');
const path = require('path');

// 1. 配置路径
const inputPath = path.join(__dirname, '../source/other/data.txt');
const outputPath = path.join(__dirname, '../source/other/pic.html');

// 2. HTML 模板的前半部分
const htmlHeader = `---
layout: false
---
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>图片来源及版权致谢</title>
    <style>
        body { font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 60px 20px; background: #ffffff; color: #333333; line-height: 1.7; }
        header { margin-bottom: 50px; }
        h1 { font-size: 1.4rem; font-weight: 600; color: #111111; margin-bottom: 8px; }
        .subtitle { color: #888888; font-size: 0.85rem; }
        .notice { font-size: 0.8rem; color: #999999; margin-top: 10px; }
        .item { padding: 16px 0; border-bottom: 1px solid #f0f0f0; }
        .item:first-of-type { border-top: 1px solid #f0f0f0; }
        .item-title { font-weight: 500; font-size: 0.95rem; color: #222222; }
        .item-meta { font-size: 0.85rem; color: #666666; margin-top: 2px; }
        .item-meta span { margin-right: 15px; }
        a { color: #0084ff; text-decoration: none; }
        a:hover { opacity: 0.7; text-decoration: underline; }
        .item-img { width: 100%; max-width: 320px; border-radius: 8px; margin: 12px 0 4px 0; object-fit: cover; }
        footer { margin-top: 50px; font-size: 0.85rem; }
        .back-link { color: #666666; border-bottom: 1px solid #cccccc; }
    </style>
</head>
<body>
    <header>
        <h1>图片来源声明</h1>
        <p class="subtitle">本站使用的插画与图片基于公开授权或规范引用，版权归原作者所有。</p>
        <p class="notice">※ 若部分版权所有者禁止非商业转载，请联系我删除。</p>
    </header>
    <main>
`;

const htmlFooter = `
    </main>
    <footer>
        <a href="/" class="back-link">← 返回博客首页</a>
    </footer>
</body>
</html>
`;

// 获取 Pixiv 数据（通过 Pixiv 官方 AJAX API）
async function fetchPixivData(pid) {
    try {
        const response = await fetch(`https://www.pixiv.net/ajax/illust/${pid}`, {
            headers: {
                'Referer': 'https://www.pixiv.net/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
            }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const json = await response.json();
        if (json.error) throw new Error(json.message);

        const body = json.body || {};
        const title = body.title || '无题';
        const artist = body.userName || '未知画师';
        const uid = body.userId || '';

        const allTags = (body.tags?.tags || []).map(t => t.translation?.zh || t.tag);
        const tags = allTags.slice(0, 5).join(', ');

        return {
            title: `《${title}》`,
            artist,
            link: `https://www.pixiv.net/artworks/${pid}`,
            artistLink: uid ? `https://www.pixiv.net/users/${uid}` : '#',
            tags
        };
    } catch (error) {
        console.warn(`[Pixiv] 获取 PID ${pid} 失败: ${error.message}`);
        return { title: '', artist: '未知画师', link: `https://www.pixiv.net/artworks/${pid}`, artistLink: '#', tags: '' };
    }
}

async function main() {
    if (!fs.existsSync(inputPath)) {
        console.error(`错误：未找到数据文件: ${inputPath}`);
        return;
    }

    const lines = fs.readFileSync(inputPath, 'utf-8').split('\n').filter(line => line.trim());
    let itemsHtml = '';

    console.log('⏳ 开始解析图片数据清单...');

    for (const line of lines) {
        const parts = line.split(',').map(s => s.trim());
        if (parts.length < 3) continue;

        const position = parts[0];
        const typeOrSource = parts[1];

        if (typeOrSource.toLowerCase() === 'pixiv') {
            const pid = parts[2];
            const localImg = parts[3] || '';
            console.log(`[Pixiv] 正在自动获取 [${position}] (PID: ${pid})...`);
            const info = await fetchPixivData(pid);

            const tagPart = info.tags ? `<span>标签: ${info.tags}</span>` : '';
            const imgPart = localImg ? `<img class="item-img" src="/img/${localImg}" alt="${info.title}" loading="lazy" />` : '';

            itemsHtml += `
        <div class="item">
            ${imgPart}
            <div class="item-title">${position} ${info.title}</div>
            <div class="item-meta">
                <span>画师: <a href="${info.artistLink}" target="_blank">${info.artist}</a></span>
                <span>来源: Pixiv</span>
                <span>作品: <a href="${info.link}" target="_blank">${pid}</a></span>
                ${tagPart}
            </div>
        </div>`;
            await new Promise(resolve => setTimeout(resolve, 600));
        } else {
            const artistName = parts[2];
            const sourceLink = parts[3] || '#';
            const localImg = parts[4] || '';
            console.log(`[其他] 正在录入 [${position}] (来源: ${typeOrSource})...`);

            const imgPart = localImg ? `<img class="item-img" src="/img/${localImg}" alt="${position}" loading="lazy" />` : '';

            itemsHtml += `
        <div class="item">
            ${imgPart}
            <div class="item-title">${position}</div>
            <div class="item-meta">
                <span>作者: ${artistName}</span>
                <span>来源: ${typeOrSource}</span>
                <span>链接: ${sourceLink !== '#' ? `<a href="${sourceLink}" target="_blank">访问原链接</a>` : '本地提供'}</span>
            </div>
        </div>`;
        }
    }

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(outputPath, htmlHeader + itemsHtml + htmlFooter);
    console.log(`✅ 数据自动填写完成！保存至: ${outputPath}`);
}

main();