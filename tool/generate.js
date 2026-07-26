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
        body { font-family: -apple-system, sans-serif; max-width: 820px; margin: 0 auto; padding: 60px 24px; background: #ffffff; color: #333333; line-height: 1.7; }
        header { margin-bottom: 40px; }
        h1 { font-size: 1.6rem; font-weight: 600; color: #111111; margin-bottom: 10px; }
        .subtitle { color: #888888; font-size: 0.95rem; }
        .notice { font-size: 0.85rem; color: #999999; margin-top: 10px; }
        .item { display: flex; align-items: center; gap: 20px; padding: 18px 0; border-bottom: 1px solid #f0f0f0; }
        .item:first-of-type { border-top: 1px solid #f0f0f0; }
        .item-img { width: 100px; height: 100px; border-radius: 8px; object-fit: cover; flex-shrink: 0; }
        .item-body { flex: 1; min-width: 0; }
        .item-title { font-weight: 600; font-size: 1.05rem; color: #222222; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .item-meta { font-size: 0.9rem; color: #888888; margin-top: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .item-meta span { margin-right: 16px; }
        a { color: #0084ff; text-decoration: none; }
        a:hover { opacity: 0.7; text-decoration: underline; }
        footer { margin-top: 50px; font-size: 0.85rem; }
        .back-link { color: #666666; border-bottom: 1px solid #cccccc; }
        /* 分页控件样式 */
        .pagination { display: flex; justify-content: center; align-items: center; gap: 8px; margin: 30px 0; flex-wrap: wrap; }
        .pagination button { padding: 6px 14px; border: 1px solid #ddd; background: #fff; color: #333; border-radius: 4px; cursor: pointer; font-size: 0.85rem; transition: all 0.2s; }
        .pagination button:hover:not(:disabled) { background: #f5f5f5; border-color: #ccc; }
        .pagination button:disabled { opacity: 0.4; cursor: not-allowed; }
        .pagination button.active { background: #0084ff; color: #fff; border-color: #0084ff; }
        .pagination .page-info { font-size: 0.85rem; color: #666; }
        .item.hidden { display: none; }

        /* ——— 设备自适应 ——— */
        /* 平板 (<=768px) */
        @media (max-width: 768px) {
            body { padding: 40px 16px; }
            h1 { font-size: 1.25rem; }
            .item-meta span { margin-right: 10px; }
            .item-img { max-width: 280px; }
            .pagination { gap: 6px; margin: 24px 0; }
            .pagination button { padding: 5px 10px; font-size: 0.8rem; }
            .pagination .page-info { font-size: 0.8rem; }
        }

        /* 手机 (<=480px) */
        @media (max-width: 480px) {
            body { padding: 24px 12px; max-width: 100%; }
            header { margin-bottom: 30px; }
            h1 { font-size: 1.1rem; }
            .subtitle { font-size: 0.8rem; }
            .notice { font-size: 0.75rem; }
            .item { padding: 12px 0; }
            .item-title { font-size: 0.9rem; }
            .item-meta { font-size: 0.8rem; display: flex; flex-wrap: wrap; gap: 4px 12px; }
            .item-meta span { margin-right: 0; }
            .item-img { max-width: 100%; border-radius: 6px; }
            footer { margin-top: 30px; }
            /* 分页：换行 + 加大点击区域 */
            .pagination { gap: 5px; margin: 20px 0; justify-content: center; }
            .pagination button { padding: 8px 12px; font-size: 0.82rem; min-height: 36px; }
            .pagination .page-info { font-size: 0.75rem; width: 100%; text-align: center; margin-top: 4px; }
        }
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
        <div class="pagination" id="pagination-bottom"></div>
    </main>
    <footer>
        <a href="/" class="back-link">&larr; 返回博客首页</a>
    </footer>
    <script>
    (function() {
        var ITEMS_PER_PAGE = 10;
        var currentPage = 1;
        var items = [];
        var totalPages = 1;

        function init() {
            items = Array.from(document.querySelectorAll('.item'));
            totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
            render();
        }

        function render() {
            var start = (currentPage - 1) * ITEMS_PER_PAGE;
            var end = start + ITEMS_PER_PAGE;

            items.forEach(function(item, i) {
                if (i < start || i >= end) {
                    item.classList.add('hidden');
                } else {
                    item.classList.remove('hidden');
                }
            });

            renderPagination('pagination-bottom');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function renderPagination(containerId) {
            var container = document.getElementById(containerId);
            if (!container) return;

            // 当总页数不大于 1 时，直接清空内容并隐藏分页组件
            if (totalPages <= 1) {
                container.innerHTML = '';
                container.style.display = 'none';
                return;
            }

            container.style.display = 'flex';

            var html = '';
            html += '<button id="prev-' + containerId + '"' + (currentPage === 1 ? ' disabled' : '') + '>\u4E0A\u4E00\u9875</button>';

            var maxVisible = 5;
            var startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
            var endPage = Math.min(totalPages, startPage + maxVisible - 1);
            if (endPage - startPage < maxVisible - 1) {
                startPage = Math.max(1, endPage - maxVisible + 1);
            }

            if (startPage > 1) {
                html += '<button class="page-btn" data-page="1">1</button>';
                if (startPage > 2) html += '<span class="page-info">...</span>';
            }

            for (var i = startPage; i <= endPage; i++) {
                html += '<button class="page-btn' + (i === currentPage ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
            }

            if (endPage < totalPages) {
                if (endPage < totalPages - 1) html += '<span class="page-info">...</span>';
                html += '<button class="page-btn" data-page="' + totalPages + '">' + totalPages + '</button>';
            }

            html += '<button id="next-' + containerId + '"' + (currentPage === totalPages ? ' disabled' : '') + '>\u4E0B\u4E00\u9875</button>';
            html += '<span class="page-info">\u7B2C ' + currentPage + '/' + totalPages + ' \u9875\uFF0C\u5171 ' + items.length + ' \u6761</span>';

            container.innerHTML = html;

            var prevBtn = document.getElementById('prev-' + containerId);
            var nextBtn = document.getElementById('next-' + containerId);
            if (prevBtn) prevBtn.addEventListener('click', function() { if (currentPage > 1) { currentPage--; render(); }});
            if (nextBtn) nextBtn.addEventListener('click', function() { if (currentPage < totalPages) { currentPage++; render(); }});

            container.querySelectorAll('.page-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    currentPage = parseInt(btn.dataset.page);
                    render();
                });
            });
        }

        document.addEventListener('DOMContentLoaded', init);
    })();
    </script>
</body>
</html>
`;

function parseOldData(htmlContent, pid) {
    if (!htmlContent) return null;
    try {
        const regex = new RegExp(`<div class="item">[\\s\\S]*?\\/artworks\\/${pid}[\\s\\S]*?<\\/div>`, 'i');
        const match = htmlContent.match(regex);
        if (!match) return null;

        const itemBlock = match[0];
        const titleMatch = itemBlock.match(/<div class="item-title">.*?《(.*?)》<\/div>/);
        const artistMatch = itemBlock.match(/<span>画师: <a href="(.*?)" target="_blank">(.*?)<\/a><\/span>/);
        const tagsMatch = itemBlock.match(/<span>标签: (.*?)<\/span>/);

        return {
            title: titleMatch ? `《${titleMatch[1]}》` : '',
            artist: artistMatch ? artistMatch[2] : '未知画师',
            artistLink: artistMatch ? artistMatch[1] : '#',
            tags: tagsMatch ? tagsMatch[1] : '',
            link: `https://www.pixiv.net/artworks/${pid}`
        };
    } catch (e) {
        return null;
    }
}

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
        console.warn(`[Pixiv] 获取 PID ${pid} 失败: ${error.message} (将尝试保持原样)`);
        return null; 
    }
}

async function main() {
    if (!fs.existsSync(inputPath)) {
        console.error(`错误：未找到数据文件: ${inputPath}`);
        return;
    }

    const oldHtmlContent = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf-8') : '';

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
            
            let info = await fetchPixivData(pid);

            if (!info) {
                const backup = parseOldData(oldHtmlContent, pid);
                if (backup && backup.title) {
                    console.log(`   └─ 🔄 [提示] 已成功恢复 [${position}] 的本地历史缓存数据。`);
                    info = backup;
                } else {
                    info = { title: `《未知作品_${pid}》`, artist: '未知画师', link: `https://www.pixiv.net/artworks/${pid}`, artistLink: '#', tags: '' };
                }
            }

            const tagPart = info.tags ? `<span>标签: ${info.tags}</span>` : '';
            const imgPart = localImg ? `<img class="item-img" src="/img/${localImg}" alt="${info.title}" loading="lazy" />` : '';

            itemsHtml += `
        <div class="item">
            ${imgPart}
            <div class="item-body">
                <div class="item-title">${position} ${info.title}</div>
                <div class="item-meta">
                    <span>画师: <a href="${info.artistLink}" target="_blank">${info.artist}</a></span>
                    <span>来源: Pixiv</span>
                    <span>作品: <a href="${info.link}" target="_blank">${pid}</a></span>
                    ${tagPart}
                </div>
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
            <div class="item-body">
                <div class="item-title">${position}</div>
                <div class="item-meta">
                    <span>作者: ${artistName}</span>
                    <span>来源: ${typeOrSource}</span>
                    <span>链接: ${sourceLink !== '#' ? `<a href="${sourceLink}" target="_blank">访问原链接</a>` : '本地提供'}</span>
                </div>
            </div>
        </div>`;
        }
    }

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // 为每个item添加data-index属性（客户端分页需要）
    let indexedItemsHtml = itemsHtml;
    let itemIndex = 0;
    indexedItemsHtml = indexedItemsHtml.replace(/<div class="item">/g, () => {
        return `<div class="item" data-index="${itemIndex++}">`;
    });

    fs.writeFileSync(outputPath, htmlHeader + indexedItemsHtml + htmlFooter);
    console.log(`✅ 数据自动填写完成！保存至: ${outputPath}`);
}

main();