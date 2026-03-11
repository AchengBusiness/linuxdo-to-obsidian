// LinuxDo to Obsidian - Content Script V3.5.4
// 劫持书签按钮，保存帖子+评论到Obsidian（保留颜色样式）
// V3.5: 支持同时保存到飞书多维表格（带MD附件）
// V3.5.1: 单击保存到Obsidian，双击触发L站原生收藏
// V3.5.2: 支持飞书国内版和Lark国际版
// V3.5.3: 支持评论区书签按钮 - 点击评论书签保存主帖+该评论
// V3.5.4: 修复双击检测竞态条件 + 改进原生收藏触发机制
//
// 功能说明：
// - 点击主帖书签：保存主帖（如开启"保存评论"则包含所有评论）
// - 点击评论书签：保存主帖+该条评论（文件名带楼层号，不受"保存评论"设置影响）
// - 双击同一书签：触发原生L站收藏功能（必须是同一个按钮）

(function() {
  'use strict';

  // 默认配置
  const DEFAULT_CONFIG = {
    // V3.5.1: 插件总开关
    pluginEnabled: true,

    vaultName: '',
    folderPath: 'LinuxDo收集箱',
    addMetadata: true,
    includeImages: true,
    saveComments: false,
    commentCount: 100,
    foldComments: false,  // V3.2: 默认不折叠，使用普通Markdown格式
    useAdvancedUri: true, // V3.4: 默认使用 Advanced URI 插件

    // V3.5: 飞书设置
    saveToObsidian: true,
    saveToFeishu: false,
    feishuApiDomain: 'feishu', // 'feishu' 或 'lark'
    feishuAppId: '',
    feishuAppSecret: '',
    feishuAppToken: '',
    feishuTableId: '',
    feishuUploadAttachment: false
  };

  // 检查是否在帖子页面
  function isTopicPage() {
    return document.querySelector('#topic-title h1') !== null;
  }

  // 判断是否为帖子/评论区域的书签按钮，返回 { isBookmark: boolean, postNumber: string|null }
  function isBookmarkButton(element) {
    if (!element) return { isBookmark: false, postNumber: null };

    // 先检查元素特征是否像书签按钮
    const text = element.textContent || '';
    const className = element.className || '';
    const dataValue = element.getAttribute('data-value') || '';
    const title = element.title || '';
    const ariaLabel = element.getAttribute('aria-label') || '';

    const isBookmarkLike = className.includes('bookmark') ||
           dataValue === 'bookmark' ||
           text.includes('书签') ||
           text.includes('Bookmark') ||
           text.toLowerCase().includes('bookmark') ||
           title.toLowerCase().includes('bookmark') ||
           ariaLabel.toLowerCase().includes('bookmark');

    // 如果不像书签按钮，直接返回 false
    if (!isBookmarkLike) {
      return { isBookmark: false, postNumber: null };
    }

    // 排除导航栏、用户中心等区域的书签链接
    const excludeAreas = [
      '.d-header',           // 顶部导航栏
      '.user-main',          // 用户中心主区域
      '.user-navigation',    // 用户导航
      '.user-nav',           // 用户导航
      '.nav-pills',          // 导航标签
      '.activity-nav',       // 活动导航
      '.user-stream',        // 用户流
      '.nav-stacked',        // 堆叠导航
      '.navigation-container' // 导航容器
    ];

    for (const selector of excludeAreas) {
      if (element.closest(selector)) {
        console.log('[LinuxDo→Obsidian] 书签按钮在排除区域内:', selector);
        return { isBookmark: false, postNumber: null };
      }
    }

    // 检查是否是 URL 导航链接（href 包含 /bookmarks 或 /u/xxx/activity）
    const href = element.getAttribute('href') || '';
    if (href.includes('/bookmarks') || href.includes('/activity') || href.includes('/u/')) {
      console.log('[LinuxDo→Obsidian] 排除导航链接:', href);
      return { isBookmark: false, postNumber: null };
    }

    // 必须在帖子页面上
    if (!isTopicPage()) {
      return { isBookmark: false, postNumber: null };
    }

    // 检查是在主帖还是评论区
    const postContainer = element.closest('.topic-post, article[data-post-id]');
    let postNumber = '1'; // 默认是主帖
    if (postContainer) {
      postNumber = postContainer.getAttribute('data-post-number') ||
                   postContainer.querySelector('[data-post-number]')?.getAttribute('data-post-number') ||
                   '1';
    }

    console.log('[LinuxDo→Obsidian] 检测到书签按钮，楼层:', postNumber);
    return { isBookmark: true, postNumber: postNumber };
  }

  // 劫持书签按钮点击事件
  // V3.5.1: 单击保存到Obsidian，双击触发原生收藏
  // V3.5.3: 支持评论区书签按钮，点击评论书签保存主帖+该评论
  // V3.5.3.1: 修复双击检测竞态条件 - 必须是同一个按钮才算双击
  let bookmarkClickCount = 0;
  let bookmarkClickTimer = null;
  let lastBookmarkTarget = null;
  let lastBookmarkPostNumber = null; // 记录点击的楼层号
  let eventListenerAdded = false; // 防止重复添加事件监听器

  function hijackBookmarkButton() {
    // 防止重复添加事件监听器
    if (eventListenerAdded) {
      console.log('[LinuxDo→Obsidian] 事件监听器已存在，跳过添加');
      return;
    }
    eventListenerAdded = true;

    document.addEventListener('click', (e) => {
      const target = e.target.closest('button, a');

      // V3.5.3.1: 检查是否有bypass标记（用于触发原生收藏）
      if (target?.hasAttribute('data-linuxdo-obsidian-bypass')) {
        console.log('[LinuxDo→Obsidian] 检测到bypass标记，放行原生点击');
        return; // 不拦截，让原生事件通过
      }

      const bookmarkResult = isBookmarkButton(target);

      if (target && bookmarkResult.isBookmark) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // V3.5.3.1: 检查是否点击的是同一个按钮（通过楼层号判断）
        const isSameButton = lastBookmarkPostNumber === bookmarkResult.postNumber;

        if (isSameButton) {
          bookmarkClickCount++;
        } else {
          // 点击了不同的书签按钮，重置计数
          if (bookmarkClickTimer) {
            clearTimeout(bookmarkClickTimer);
            bookmarkClickTimer = null;
          }
          bookmarkClickCount = 1;
        }

        lastBookmarkTarget = target;
        lastBookmarkPostNumber = bookmarkResult.postNumber;

        // 清除之前的定时器
        if (bookmarkClickTimer) {
          clearTimeout(bookmarkClickTimer);
        }

        if (bookmarkClickCount === 2 && isSameButton) {
          // 双击同一个按钮：触发原生收藏
          console.log('[LinuxDo→Obsidian] 双击检测，触发原生收藏，楼层:', bookmarkResult.postNumber);
          bookmarkClickCount = 0;
          lastBookmarkPostNumber = null;
          triggerOriginalBookmark(target);
        } else {
          // 等待300ms判断是否为双击
          const postNumber = bookmarkResult.postNumber;
          bookmarkClickTimer = setTimeout(() => {
            if (bookmarkClickCount === 1) {
              // 单击：保存到Obsidian
              if (postNumber === '1') {
                console.log('[LinuxDo→Obsidian] 单击主帖书签，保存整个帖子');
                saveToObsidian(null); // 主帖：按原逻辑保存
              } else {
                console.log('[LinuxDo→Obsidian] 单击评论书签，保存主帖+第' + postNumber + '楼评论');
                saveToObsidian(postNumber); // 评论：保存主帖+该评论
              }
            }
            bookmarkClickCount = 0;
            lastBookmarkPostNumber = null;
          }, 300);
        }

        return false;
      }
    }, true);

    console.log('[LinuxDo→Obsidian] 书签按钮劫持已激活 (V3.5.3 - 支持评论书签)');
  }

  // 触发原生收藏功能
  // V3.5.3.1: 改进实现，使用模拟原生事件而非克隆节点
  function triggerOriginalBookmark(target) {
    // 方法1: 尝试找到并直接调用Discourse的书签API
    // LinuxDo基于Discourse，书签操作通常通过 data-post-id 属性标识
    const postContainer = target.closest('.topic-post, article[data-post-id]');
    const postId = postContainer?.getAttribute('data-post-id');

    if (postId) {
      // 尝试通过Discourse API添加书签
      console.log('[LinuxDo→Obsidian] 尝试通过API添加书签，post_id:', postId);

      fetch('/bookmarks.json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]')?.content || ''
        },
        body: JSON.stringify({
          bookmarkable_id: postId,
          bookmarkable_type: 'Post'
        })
      })
      .then(response => {
        if (response.ok) {
          showNotification('已添加到L站收藏', 'success');
          // 更新按钮视觉状态
          target.classList.add('bookmarked');
        } else if (response.status === 422) {
          // 可能已经收藏过了
          showNotification('该内容已在收藏中', 'info');
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      })
      .catch(err => {
        console.error('[LinuxDo→Obsidian] API书签失败:', err);
        // 方法2: 回退到模拟点击
        fallbackTriggerBookmark(target);
      });
    } else {
      // 找不到post_id，使用回退方法
      fallbackTriggerBookmark(target);
    }
  }

  // 回退方法：临时禁用插件拦截，触发原生点击
  function fallbackTriggerBookmark(target) {
    console.log('[LinuxDo→Obsidian] 使用回退方法触发原生书签');

    // 临时标记，让下一次点击通过
    target.setAttribute('data-linuxdo-obsidian-bypass', 'true');

    // 创建并分发真实的点击事件
    const clickEvent = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window
    });
    target.dispatchEvent(clickEvent);

    // 移除标记
    setTimeout(() => {
      target.removeAttribute('data-linuxdo-obsidian-bypass');
    }, 100);

    showNotification('已触发L站收藏', 'success');
  }

  // 提取帖子内容
  function extractContent() {
    const titleElement = document.querySelector('#topic-title h1');
    const contentElement = document.querySelector('.topic-body .cooked');
    const authorElement = document.querySelector('.topic-meta-data .creator a, .names .first a');

    if (!titleElement || !contentElement) {
      return null;
    }

    const title = titleElement.textContent.trim();
    const contentHTML = contentElement.innerHTML;
    const url = window.location.href;
    const author = authorElement ? authorElement.textContent.trim() : '未知作者';
    const topicId = window.location.pathname.match(/\/t\/[^/]+\/(\d+)/)?.[1];

    return { title, contentHTML, url, author, topicId };
  }

  // V3: 提取评论
  function extractComments(maxCount = 100) {
    const comments = [];

    // 方法1: 尝试 crawler-post 选择器
    let commentElements = document.querySelectorAll('div.crawler-post');

    // 如果找不到，尝试备用选择器
    if (commentElements.length === 0) {
      commentElements = document.querySelectorAll('.topic-post');
    }

    // 跳过第一个（主帖），获取评论
    const commentNodes = Array.from(commentElements).slice(1, maxCount + 1);

    for (const el of commentNodes) {
      // 提取用户名（多种选择器兼容）
      const usernameEl = el.querySelector('.creator span[itemprop="name"]') ||
                         el.querySelector('.names .first a') ||
                         el.querySelector('.username a');
      const username = usernameEl ? usernameEl.textContent.trim() : '匿名用户';

      // 提取评论内容
      const contentEl = el.querySelector('.post[itemprop="text"]') ||
                        el.querySelector('.cooked');
      const contentHTML = contentEl ? contentEl.innerHTML : '';

      // 提取楼层号
      const positionEl = el.querySelector('span[itemprop="position"]') ||
                         el.querySelector('.post-number');
      const position = positionEl ? positionEl.textContent.trim() : (comments.length + 1).toString();

      // 提取时间
      const timeEl = el.querySelector('time.post-time') ||
                     el.querySelector('.relative-date');
      const time = timeEl ? (timeEl.getAttribute('datetime') || timeEl.textContent) : '';

      // 提取点赞数
      const likesEl = el.querySelector('meta[itemprop="userInteractionCount"]') ||
                      el.querySelector('.post-likes');
      const likes = likesEl ?
                    (likesEl.getAttribute('content') || likesEl.textContent.replace(/[^\d]/g, '')) : '0';

      if (contentHTML) {
        comments.push({
          username,
          contentHTML,
          position,
          time,
          likes
        });
      }
    }

    console.log(`[LinuxDo→Obsidian] 提取到 ${comments.length} 条评论`);
    return comments;
  }

  // V3.5.3: 提取指定楼层的单条评论
  function extractSingleComment(postNumber) {
    // 查找指定楼层的评论元素
    const commentElements = document.querySelectorAll('.topic-post, article[data-post-id]');

    for (const el of commentElements) {
      const posNum = el.getAttribute('data-post-number') ||
                     el.querySelector('[data-post-number]')?.getAttribute('data-post-number');

      if (posNum === postNumber) {
        // 提取用户名
        const usernameEl = el.querySelector('.creator span[itemprop="name"]') ||
                           el.querySelector('.names .first a') ||
                           el.querySelector('.username a');
        const username = usernameEl ? usernameEl.textContent.trim() : '匿名用户';

        // 提取评论内容
        const contentEl = el.querySelector('.post[itemprop="text"]') ||
                          el.querySelector('.cooked');
        const contentHTML = contentEl ? contentEl.innerHTML : '';

        // 提取时间
        const timeEl = el.querySelector('time.post-time') ||
                       el.querySelector('.relative-date');
        const time = timeEl ? (timeEl.getAttribute('datetime') || timeEl.textContent) : '';

        // 提取点赞数
        const likesEl = el.querySelector('meta[itemprop="userInteractionCount"]') ||
                        el.querySelector('.post-likes');
        const likes = likesEl ?
                      (likesEl.getAttribute('content') || likesEl.textContent.replace(/[^\d]/g, '')) : '0';

        if (contentHTML) {
          console.log(`[LinuxDo→Obsidian] 提取到第${postNumber}楼评论，作者: ${username}`);
          return {
            username,
            contentHTML,
            position: postNumber,
            time,
            likes
          };
        }
      }
    }

    console.log(`[LinuxDo→Obsidian] 未找到第${postNumber}楼评论`);
    return null;
  }

  // 创建Turndown服务实例（复用）
  function createTurndownService() {
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-'
    });

    // 规则1：保留有style属性的元素（保留颜色）
    turndownService.addRule('preserveStyledElements', {
      filter: (node) => {
        return (node.nodeName === 'SPAN' || node.nodeName === 'DIV' || node.nodeName === 'P') &&
               node.hasAttribute('style') &&
               node.getAttribute('style').includes('color');
      },
      replacement: (content, node) => {
        return node.outerHTML;
      }
    });

    // 规则2：保留表格HTML
    turndownService.addRule('preserveTables', {
      filter: 'table',
      replacement: (content, node) => {
        return '\n\n' + node.outerHTML + '\n\n';
      }
    });

    // 规则2.5：处理LinuxDo的onebox（链接预览卡片）- 转换为简单链接
    turndownService.addRule('onebox', {
      filter: (node) => {
        if (node.nodeName !== 'ASIDE') return false;
        const className = node.className || '';
        return className.includes('onebox') || className.includes('quote');
      },
      replacement: (content, node) => {
        // 尝试提取链接
        const link = node.querySelector('a[href]');
        if (link) {
          const href = link.href;
          const title = link.textContent?.trim() || node.querySelector('h4, h3, .title')?.textContent?.trim() || '链接';
          return '\n\n[' + title + '](' + href + ')\n\n';
        }
        return '';
      }
    });

    // 规则3：代码块保留语言标识
    turndownService.addRule('codeBlocks', {
      filter: (node) => {
        return node.nodeName === 'PRE' && node.firstChild && node.firstChild.nodeName === 'CODE';
      },
      replacement: (content, node) => {
        const codeNode = node.firstChild;
        const code = codeNode.textContent;
        const langMatch = codeNode.className.match(/lang-(\w+)/);
        const lang = langMatch ? langMatch[1] : '';
        return '\n\n```' + lang + '\n' + code + '\n```\n\n';
      }
    });

    // 规则4：处理LinuxDo的lightbox图片链接（a标签包裹img）
    turndownService.addRule('lightboxImages', {
      filter: (node) => {
        return node.nodeName === 'A' &&
               node.classList.contains('lightbox') &&
               node.querySelector('img');
      },
      replacement: (content, node) => {
        const img = node.querySelector('img');
        if (!img) return '';

        // 使用原图链接（href）而非缩略图
        const src = node.href || img.src;
        const fullSrc = src.startsWith('http') ? src : 'https://linux.do' + src;

        // 使用data-base62-sha1或简化的alt
        const alt = img.getAttribute('data-base62-sha1') ||
                    img.alt?.replace(/[_\d]+$/, '').trim() ||
                    'image';

        return '\n\n![' + alt + '](' + fullSrc + ')\n\n';
      }
    });

    // 规则5：处理普通图片（非lightbox）
    turndownService.addRule('images', {
      filter: (node) => {
        if (node.nodeName !== 'IMG') return false;
        // 跳过emoji图片
        if (node.classList.contains('emoji')) return false;
        // 跳过已被lightbox规则处理的
        if (node.parentNode?.classList?.contains('lightbox')) return false;
        return true;
      },
      replacement: (content, node) => {
        const src = node.src;
        if (!src) return '';

        const fullSrc = src.startsWith('http') ? src : 'https://linux.do' + src;
        const alt = node.alt?.replace(/[_\d]+$/, '').trim() || 'image';

        return '\n\n![' + alt + '](' + fullSrc + ')\n\n';
      }
    });

    // 规则6：移除emoji图片和GIF动图（完全移除）
    turndownService.addRule('emojiAndGifImages', {
      filter: (node) => {
        if (node.nodeName !== 'IMG') return false;
        const className = node.className || '';
        const src = node.src || '';
        const alt = node.alt || '';
        // emoji图片
        if (className.includes('emoji') ||
            src.includes('/emoji/') ||
            src.includes('twemoji') ||
            /^:[^:]+:$/.test(alt)) return true;
        // GIF动图
        if (src.includes('.gif') || className.includes('animated')) return true;
        return false;
      },
      replacement: () => ''  // 完全移除
    });

    // 规则7：处理视频（嵌入到Obsidian）
    turndownService.addRule('videoEmbed', {
      filter: (node) => {
        // 处理 video 标签
        if (node.nodeName === 'VIDEO') return true;
        // 处理包含视频的 a 标签
        if (node.nodeName === 'A') {
          const href = node.href || '';
          return /\.(mp4|webm|mov|avi)(\?|$)/i.test(href);
        }
        return false;
      },
      replacement: (content, node) => {
        let src = '';
        if (node.nodeName === 'VIDEO') {
          // 从 video 标签获取 src
          const sourceEl = node.querySelector('source');
          src = node.src || sourceEl?.src || '';
        } else if (node.nodeName === 'A') {
          src = node.href;
        }

        if (!src) return '';
        const fullSrc = src.startsWith('http') ? src : 'https://linux.do' + src;
        return '\n\n![video](' + fullSrc + ')\n\n';
      }
    });

    // 规则8：移除图片元信息span（仅匹配特定class或纯尺寸信息）
    turndownService.addRule('removeImageMeta', {
      filter: (node) => {
        // 只处理span元素
        if (node.nodeName !== 'SPAN') return false;
        const text = node.textContent?.trim() || '';
        const className = node.className || '';
        // 匹配meta class或纯尺寸信息文本
        if (className.includes('meta') || className.includes('image-size-info')) return true;
        // 仅当文本是纯尺寸信息时才移除（如 "1920×1080 180 KB"）
        if (/^\d+×\d+\s+\d+(?:\.\d+)?\s*(?:KB|MB|GB)$/i.test(text)) return true;
        return false;
      },
      replacement: () => ''
    });

    return turndownService;
  }

  // V3.2: 清理Markdown中的残留语法（保守版，不破坏正常链接和图片）
  function cleanupMarkdown(markdown) {
    // 1. 移除空锚点链接 [](#anchor-id)
    markdown = markdown.replace(/\[\s*\]\(#[^)]*\)/g, '');

    // 2. 移除emoji图片语法 ![:emoji:](url)
    markdown = markdown.replace(/!\[:[a-z_]+:\]\([^)]+\)/gi, '');

    // 3. 移除图片尺寸信息行（独立成行的 "1920×1080 180 KB" 格式）
    markdown = markdown.replace(/^\s*\d+×\d+\s+\d+(?:\.\d+)?\s*(?:KB|MB|GB)\s*$/gim, '');

    // 4. 移除转义下划线
    markdown = markdown.replace(/\\_/g, '_');

    // 5. 清理嵌套图片链接 [![alt](thumb)](original) → ![alt](original)
    markdown = markdown.replace(/\[!\[([^\]]*)\]\([^)]+\)\]\(([^)]+)\)/g, '![$1]($2)');

    // 6. 移除残留的HTML标签（aside, article等）
    markdown = markdown.replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');
    markdown = markdown.replace(/<article[^>]*>[\s\S]*?<\/article>/gi, '');

    // 7. 移除GIF图片链接
    markdown = markdown.replace(/!\[[^\]]*\]\([^)]*\.gif[^)]*\)/gi, '');

    // 8. 移除多余空行
    markdown = markdown.replace(/\n{3,}/g, '\n\n');

    return markdown;
  }

  // V3: HTML转Markdown（带评论版本）
  function convertToMarkdownWithComments(contentHTML, metadata, comments, config) {
    const turndownService = createTurndownService();

    // V3.1: 如果不保留图片，移除所有图片规则的输出
    if (!config.includeImages) {
      turndownService.addRule('removeAllImages', {
        filter: ['img', 'a'],
        replacement: (content, node) => {
          if (node.nodeName === 'IMG') return '';
          if (node.nodeName === 'A' && node.classList.contains('lightbox')) return '';
          return content;
        }
      });
    }

    // 转换正文并清理格式
    let mainContent = turndownService.turndown(contentHTML);
    mainContent = cleanupMarkdown(mainContent);
    mainContent = mainContent.trim();

    // 构建完整Markdown
    let markdown = '';

    // 添加中文frontmatter
    if (config.addMetadata) {
      markdown += `---
来源: ${metadata.url}
标题: ${metadata.title}
作者: ${metadata.author}
保存时间: ${new Date().toISOString()}
标签: [linuxdo]
评论数: ${comments.length}
---

`;
    }

    // 添加标题和正文
    markdown += `# ${metadata.title}\n\n`;
    markdown += mainContent;

    // 添加评论区
    if (config.saveComments && comments.length > 0) {
      markdown += '\n\n---\n\n';
      markdown += `## 评论区（共${comments.length}条）\n\n`;

      for (const comment of comments) {
        let commentContent = turndownService.turndown(comment.contentHTML);

        // V3.1: 清理残留语法和多余空行
        commentContent = cleanupMarkdown(commentContent);
        commentContent = commentContent.trim();

        if (config.foldComments) {
          // 折叠模式：使用 <details> 标签（不用###标题）
          markdown += `<details>\n<summary><b>${comment.position}楼 - ${comment.username}</b></summary>\n\n`;
          markdown += commentContent.trim();
          markdown += '\n\n</details>\n\n';
        } else {
          // 非折叠模式：普通标题
          markdown += `### ${comment.position}楼 - ${comment.username}\n\n`;
          markdown += commentContent.trim();
          markdown += '\n\n';
        }
      }
    }

    return markdown;
  }

  // 保存到Obsidian
  // V3.5.3: 支持 targetPostNumber 参数
  // - 为 null 或 '1' 时：保存主帖（可选带所有评论）
  // - 为其他值时：保存主帖 + 该楼层评论（文件名添加楼层号）
  async function saveToObsidian(targetPostNumber = null) {
    try {
      // 获取配置
      const config = await chrome.storage.sync.get(DEFAULT_CONFIG);
      console.log('[LinuxDo→Obsidian] 读取到的配置:', config);
      console.log('[LinuxDo→Obsidian] 目标楼层:', targetPostNumber || '主帖');

      // 提取正文内容
      const extracted = extractContent();
      if (!extracted) {
        showNotification('无法提取帖子内容', 'error');
        return;
      }

      const { title, contentHTML, url, author, topicId } = extracted;

      // V3.5.3: 根据目标楼层决定评论处理方式
      let comments = [];
      let isSingleCommentMode = targetPostNumber && targetPostNumber !== '1';

      if (isSingleCommentMode) {
        // 单条评论模式：提取指定楼层的评论
        showNotification(`正在提取第${targetPostNumber}楼评论...`, 'info');
        const singleComment = extractSingleComment(targetPostNumber);
        if (singleComment) {
          comments = [singleComment];
        } else {
          showNotification(`未找到第${targetPostNumber}楼评论`, 'error');
          return;
        }
      } else if (config.saveComments) {
        // 主帖模式 + 启用了保存评论：提取所有评论
        showNotification('正在提取评论...', 'info');
        comments = extractComments(config.commentCount);
      }

      // 转换为Markdown（带评论）
      // 对于单条评论模式，强制使用非折叠格式
      const effectiveConfig = isSingleCommentMode
        ? { ...config, saveComments: true, foldComments: false }
        : config;

      const markdown = convertToMarkdownWithComments(
        contentHTML,
        { title, url, author, topicId },
        comments,
        effectiveConfig
      );

      // 构建文件名：只用标题
      // V3.5.3: 单条评论模式时添加楼层号后缀
      const sanitizedTitle = title
        .replace(/[《》<>:"/\\|?*]/g, '')
        .replace(/\s+/g, '-')
        .replace(/^[\s-]+|[\s-]+$/g, '')
        .substring(0, 80);

      // 单条评论模式：文件名加楼层号，避免覆盖主帖文件
      const fileName = isSingleCommentMode
        ? `${sanitizedTitle}-评论${targetPostNumber}楼`
        : sanitizedTitle;

      // 构建Obsidian URI
      const filePath = config.folderPath ? `${config.folderPath}/${fileName}` : fileName;
      const vaultParam = config.vaultName && config.vaultName.trim() !== ''
        ? 'vault=' + encodeURIComponent(config.vaultName.trim()) + '&'
        : '';

      // 构建普通URI（用于检测长度）
      let uri = 'obsidian://new?' + vaultParam;
      uri += 'file=' + encodeURIComponent(filePath) + '&';
      uri += 'overwrite=true&';
      uri += 'content=' + encodeURIComponent(markdown);

      console.log('[LinuxDo→Obsidian] 生成的URI长度:', uri.length);
      console.log('[LinuxDo→Obsidian] 文件路径:', filePath);
      console.log('[LinuxDo→Obsidian] 评论数量:', comments.length);
      console.log('[LinuxDo→Obsidian] 使用Advanced URI:', config.useAdvancedUri);

      // V3.5: 检查是否需要保存到 Obsidian
      const shouldSaveToObsidian = config.saveToObsidian !== false; // 默认为 true

      // V3.4.1: Advanced URI 优先模式
      // 当启用 Advanced URI 时，始终使用它（更可靠，无大小限制）
      const URI_LENGTH_LIMIT = 100000;

      if (shouldSaveToObsidian && config.useAdvancedUri) {
        // 始终使用 Advanced URI 插件（更可靠）
        console.log('[LinuxDo→Obsidian] 使用 Advanced URI 插件（始终模式）');

        try {
          await navigator.clipboard.writeText(markdown);

          // 构建 Advanced URI
          let advancedUri = 'obsidian://advanced-uri?' + vaultParam;
          advancedUri += 'filepath=' + encodeURIComponent(filePath + '.md') + '&';
          advancedUri += 'clipboard=true&';  // 自动从剪贴板读取内容
          advancedUri += 'mode=overwrite';

          window.location.href = advancedUri;

          // 显示成功提示
          let msg;
          if (isSingleCommentMode) {
            // 单条评论模式
            msg = `已保存主帖+第${targetPostNumber}楼评论`;
            showNotification(msg, 'success');
          } else if (config.saveComments && comments.length > 0) {
            if (comments.length < config.commentCount) {
              msg = `已保存（获取到${comments.length}条评论，如需更多请先滚动页面加载）`;
              showNotification(msg, 'warning');
            } else {
              msg = `已保存到Obsidian（含${comments.length}条评论）`;
              showNotification(msg, 'success');
            }
          } else if (config.saveComments && comments.length === 0) {
            showNotification('已保存到Obsidian（未找到评论）', 'info');
          } else {
            showNotification('已保存到Obsidian', 'success');
          }
        } catch (clipboardError) {
          console.error('[LinuxDo→Obsidian] 剪贴板写入失败:', clipboardError);
          showNotification('剪贴板不可用，请手动复制', 'error');
        }
      } else if (shouldSaveToObsidian && uri.length > URI_LENGTH_LIMIT) {
        // 未启用 Advanced URI 但内容过大，弹窗提示安装
        console.log('[LinuxDo→Obsidian] URI过长 (' + uri.length + ' 字符)，需要 Advanced URI');
        showAdvancedUriPrompt(markdown, filePath, vaultParam, title, comments.length);
      } else if (shouldSaveToObsidian) {
        // 未启用 Advanced URI 且内容不大，使用普通 URI
        window.location.href = uri;

        // 显示成功提示
        let msg;
        if (isSingleCommentMode) {
          // 单条评论模式
          msg = `已保存主帖+第${targetPostNumber}楼评论`;
          showNotification(msg, 'success');
        } else if (config.saveComments && comments.length > 0) {
          if (comments.length < config.commentCount) {
            msg = `已保存（获取到${comments.length}条评论，如需更多请先滚动页面加载）`;
            showNotification(msg, 'warning');
          } else {
            msg = `已保存到Obsidian（含${comments.length}条评论）`;
            showNotification(msg, 'success');
          }
        } else if (config.saveComments && comments.length === 0) {
          showNotification('已保存到Obsidian（未找到评论）', 'info');
        } else {
          showNotification('已保存到Obsidian', 'success');
        }
      }

      // V3.5: 检查飞书配置是否完整，如果完整则同步保存到飞书
      const feishuConfigComplete = config.saveToFeishu &&
        config.feishuAppId &&
        config.feishuAppSecret &&
        config.feishuAppToken &&
        config.feishuTableId;

      if (feishuConfigComplete) {
        console.log('[LinuxDo→飞书] 检测到飞书配置，开始同步...');

        // V3.5.4: 评论书签保存时，URL和标题加上楼层标识，避免覆盖主帖记录
        // Discourse 的楼层 URL 格式是 /t/topic-slug/123/2（直接加楼层号）
        let feishuUrl = url;
        let feishuTitle = title;
        if (isSingleCommentMode) {
          // URL格式: /t/topic-slug/123 或 /t/topic-slug/123/2
          // 需要保留帖子ID（第一个数字），只替换/添加楼层号（第二个数字）
          let baseUrl = url;

          // 移除末尾的锚点和查询参数
          baseUrl = baseUrl.replace(/#.*$/, '').replace(/\?.*$/, '');

          // 检查URL是否已经有楼层号（格式：/t/slug/123/2）
          // 匹配：保留到帖子ID为止，移除可能存在的楼层号
          const match = baseUrl.match(/^(.*\/t\/[^/]+\/\d+)(\/\d+)?$/);
          if (match) {
            baseUrl = match[1]; // 保留 /t/slug/123 部分
          }

          feishuUrl = `${baseUrl}/${targetPostNumber}`;  // /t/xxx/123/2 可正常跳转
          feishuTitle = `${title} [${targetPostNumber}楼]`;
        }

        chrome.runtime.sendMessage({
          action: 'saveToFeishu',
          config: {
            apiDomain: config.feishuApiDomain || 'feishu',
            appId: config.feishuAppId,
            appSecret: config.feishuAppSecret,
            appToken: config.feishuAppToken,
            tableId: config.feishuTableId,
            uploadAttachment: config.feishuUploadAttachment || false
          },
          postData: {
            title: feishuTitle,
            url: feishuUrl,
            author: author,
            content: markdown,
            commentCount: comments.length
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('[LinuxDo→飞书] 发送消息失败:', chrome.runtime.lastError);
            return;
          }

          if (response && response.success) {
            const actionText = response.action === 'updated' ? '已更新' : '已保存';
            showNotification(`飞书${actionText}成功`, 'success');
          } else if (response) {
            console.error('[LinuxDo→飞书] 保存失败:', response.error);
            showNotification('飞书保存失败: ' + response.error, 'error');
          }
        });
      }

      // V3.5: 如果两个保存目标都没有启用，提示用户
      if (!shouldSaveToObsidian && !feishuConfigComplete) {
        showNotification('请在设置中至少启用一个保存目标', 'warning');
      }

    } catch (error) {
      console.error('[LinuxDo→Obsidian] 保存失败:', error);
      showNotification('保存失败: ' + error.message, 'error');
    }
  }

  // V3.4: 弹窗提示安装 Advanced URI 插件
  function showAdvancedUriPrompt(markdown, filePath, vaultParam, title, commentCount) {
    // 移除旧弹窗
    const oldPrompt = document.querySelector('#linuxdo-obsidian-prompt');
    if (oldPrompt) oldPrompt.remove();

    const overlay = document.createElement('div');
    overlay.id = 'linuxdo-obsidian-prompt';
    overlay.innerHTML = `
      <div class="prompt-overlay">
        <div class="prompt-box">
          <h3>内容过大，需要安装插件</h3>
          <p>当前内容超过 100KB，原生 Obsidian URI 无法处理。</p>
          <p>请安装 <strong>Advanced URI</strong> 插件来支持大内容保存：</p>
          <ol>
            <li>打开 Obsidian → 设置 → 第三方插件</li>
            <li>搜索 "Advanced URI" 并安装</li>
            <li>启用插件后，在本插件设置中勾选"使用 Advanced URI"</li>
          </ol>
          <div class="prompt-buttons">
            <button class="btn-copy">复制内容到剪贴板</button>
            <button class="btn-close">关闭</button>
          </div>
          <p class="prompt-tip">复制后可手动在 Obsidian 中粘贴</p>
        </div>
      </div>
    `;

    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
      #linuxdo-obsidian-prompt .prompt-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10001;
      }
      #linuxdo-obsidian-prompt .prompt-box {
        background: #fff;
        padding: 24px;
        border-radius: 12px;
        max-width: 420px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
      }
      #linuxdo-obsidian-prompt h3 {
        margin: 0 0 12px 0;
        color: #dc2626;
        font-size: 18px;
      }
      #linuxdo-obsidian-prompt p {
        margin: 8px 0;
        color: #333;
        font-size: 14px;
        line-height: 1.6;
      }
      #linuxdo-obsidian-prompt ol {
        margin: 12px 0;
        padding-left: 20px;
        color: #555;
        font-size: 13px;
        line-height: 1.8;
      }
      #linuxdo-obsidian-prompt strong {
        color: #2563eb;
      }
      #linuxdo-obsidian-prompt .prompt-buttons {
        display: flex;
        gap: 12px;
        margin-top: 16px;
      }
      #linuxdo-obsidian-prompt button {
        flex: 1;
        padding: 10px 16px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        cursor: pointer;
        font-family: inherit;
      }
      #linuxdo-obsidian-prompt .btn-copy {
        background: #2563eb;
        color: #fff;
      }
      #linuxdo-obsidian-prompt .btn-copy:hover {
        background: #1d4ed8;
      }
      #linuxdo-obsidian-prompt .btn-close {
        background: #f0f0f0;
        color: #666;
      }
      #linuxdo-obsidian-prompt .btn-close:hover {
        background: #e5e5e5;
      }
      #linuxdo-obsidian-prompt .prompt-tip {
        font-size: 12px !important;
        color: #888 !important;
        margin-top: 12px !important;
        text-align: center;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(overlay);

    // 绑定事件
    overlay.querySelector('.btn-copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(markdown);
        showNotification(`已复制到剪贴板（${commentCount}条评论）`, 'success');
        overlay.remove();
      } catch (err) {
        showNotification('复制失败: ' + err.message, 'error');
      }
    });

    overlay.querySelector('.btn-close').addEventListener('click', () => {
      overlay.remove();
    });

    // 点击遮罩关闭
    overlay.querySelector('.prompt-overlay').addEventListener('click', (e) => {
      if (e.target.classList.contains('prompt-overlay')) {
        overlay.remove();
      }
    });
  }

  // V3.1: 显示通知（简洁风格）
  function showNotification(message, type = 'info', duration = 3000) {
    // 移除旧通知
    const oldNotification = document.querySelector('#linuxdo-obsidian-notification');
    if (oldNotification) oldNotification.remove();

    const notification = document.createElement('div');
    notification.id = 'linuxdo-obsidian-notification';
    notification.textContent = message;

    // 简洁配色
    const colors = {
      success: { bg: '#ecfdf5', text: '#059669', border: '#a7f3d0' },
      error: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
      warning: { bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
      info: { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' }
    };

    const color = colors[type] || colors.info;

    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      background: ${color.bg};
      color: ${color.text};
      border: 1px solid ${color.border};
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      z-index: 10000;
      font-size: 14px;
      font-weight: 500;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
      max-width: 320px;
      animation: slideIn 0.2s ease-out;
    `;

    // 添加动画样式
    if (!document.querySelector('#obsidian-notification-style')) {
      const style = document.createElement('style');
      style.id = 'obsidian-notification-style';
      style.textContent = `
        @keyframes slideIn {
          from { transform: translateY(-20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes slideOut {
          from { transform: translateY(0); opacity: 1; }
          to { transform: translateY(-20px); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    // 自动消失
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.2s ease-out';
      setTimeout(() => notification.remove(), 200);
    }, duration);
  }

  // 添加快捷键支持
  let keyboardListenerAdded = false;
  function setupKeyboardShortcut() {
    if (keyboardListenerAdded) {
      console.log('[LinuxDo→Obsidian] 快捷键监听器已存在，跳过添加');
      return;
    }
    keyboardListenerAdded = true;

    document.addEventListener('keydown', (e) => {
      // 只在帖子页面响应快捷键
      if (!isTopicPage()) return;

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        console.log('[LinuxDo→Obsidian] 快捷键触发');
        saveToObsidian();
      }
    });
  }

  // 插件是否已初始化（针对当前页面）
  let pluginInitialized = false;
  let currentTopicUrl = null;

  // 初始化
  async function init() {
    // 检查插件是否启用
    const config = await chrome.storage.sync.get({ pluginEnabled: true });
    if (!config.pluginEnabled) {
      console.log('[LinuxDo→Obsidian] 插件已禁用');
      return;
    }

    // 检查是否是帖子页面
    if (!isTopicPage()) {
      console.log('[LinuxDo→Obsidian] 非帖子页面，跳过初始化');
      return;
    }

    // 检查是否已经为当前页面初始化过
    const topicUrl = window.location.pathname;
    if (pluginInitialized && currentTopicUrl === topicUrl) {
      console.log('[LinuxDo→Obsidian] 当前页面已初始化');
      return;
    }

    // 初始化事件监听器（只添加一次）
    hijackBookmarkButton();
    setupKeyboardShortcut();

    pluginInitialized = true;
    currentTopicUrl = topicUrl;
    console.log('[LinuxDo→Obsidian] 插件已加载 (V3.5.4 - 修复双击检测)');
  }

  // 页面加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 监听页面导航（单页应用）
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      console.log('[LinuxDo→Obsidian] 检测到页面导航:', url);
      // 页面导航时重置初始化状态，允许重新初始化
      pluginInitialized = false;
      setTimeout(init, 500);
    }
  }).observe(document, { subtree: true, childList: true });

})();
