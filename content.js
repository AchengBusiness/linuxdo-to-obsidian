// Discourse Saver - Content Script V4.0.3
// 劫持链接按钮，保存帖子+评论到Obsidian（保留颜色样式）
// V3.5: 支持同时保存到飞书多维表格（带MD附件）
// V3.5.1: 单击保存到Obsidian，双击触发原生复制链接
// V3.5.2: 支持飞书国内版和Lark国际版
// V4.0.1: 新增 Notion Database 保存功能
// V3.5.3: 支持评论区链接按钮 - 点击评论链接保存主帖+该评论
// V3.5.4: 修复双击检测竞态条件 + 改进原生复制链接触发机制
// V3.5.5: 修复飞书记录重复问题（搜索逻辑改进）
// V3.5.6: 保存时间改为北京时间格式
// V3.5.7: 改为劫持链接按钮
// V3.5.8: 修复误触发问题 - 增加严格的区域检测，只拦截帖子操作菜单中的链接按钮
// V3.5.9: 增强链接按钮检测 - 使用 post-action-menu__copy-link class
// V3.5.10: 修复评论楼层号获取 - 从 .topic-post 而非 article 获取 data-post-number
// V3.5.11: 明确支持 Edge/Brave/Opera 等 Chromium 浏览器
// V3.5.12: 飞书字段验证功能
// V3.5.13: 增强错误提示 + UI文字更新 + Mac快捷键支持
// V3.6.0: 支持所有 Discourse 论坛 + 自定义站点管理 + 图片 Base64 嵌入
// V4.0.2: 修复换行丢失问题 - <br>标签现在正确转换为换行符
// V4.0.3: onebox 链接预览优化 + 在线视频链接自动转 iframe（YouTube/Bilibili/Vimeo）
//
// 功能说明：
// - 点击主帖链接按钮：保存主帖（如开启"保存评论"则包含所有评论）
// - 点击评论链接按钮：保存主帖+该条评论（文件名带楼层号，不受"保存评论"设置影响）
// - 双击同一链接按钮：触发原生复制链接功能（必须是同一个按钮）

(function() {
  'use strict';

  // 默认配置
  const DEFAULT_CONFIG = {
    // V3.5.1: 插件总开关
    pluginEnabled: true,

    // V3.6.0: 自定义站点列表
    customSites: [],

    vaultName: '',
    folderPath: 'Discourse收集箱',
    addMetadata: true,
    includeImages: true,
    saveComments: false,
    commentCount: 100,
    foldComments: false,  // V3.2: 默认不折叠，使用普通Markdown格式
    useAdvancedUri: true, // V3.4: 默认使用 Advanced URI 插件

    // V3.6.0: 图片嵌入设置
    embedImages: false,
    imageMaxWidth: 1920,
    imageQuality: 0.9,
    imageSkipGif: true,

    // V3.5: 飞书设置
    saveToObsidian: true,
    saveToFeishu: false,
    feishuApiDomain: 'feishu', // 'feishu' 或 'lark'
    feishuAppId: '',
    feishuAppSecret: '',
    feishuAppToken: '',
    feishuTableId: '',
    feishuUploadAttachment: false,

    // V4.0.1: Notion 设置
    // V4.0.2: 默认属性名改为中文
    saveToNotion: false,
    notionToken: '',
    notionDatabaseId: '',
    notionPropTitle: '标题',
    notionPropUrl: '链接',
    notionPropAuthor: '作者',
    notionPropCategory: '分类',
    notionPropSavedDate: '保存日期',
    notionPropCommentCount: '评论数'
  };

  // 检查是否在帖子页面
  function isTopicPage() {
    return document.querySelector('#topic-title h1') !== null;
  }

  // 判断是否为帖子/评论区域的链接按钮，返回 { isLink: boolean, postNumber: string|null }
  // V3.5.7: 改为检测链接按钮（原书签按钮）
  // V3.5.8: 修复误触发问题 - 必须在帖子容器内 + 链接按钮特征
  // V3.5.9: 增强检测 - 使用 data-share-url 属性（Discourse 标准分享按钮特征）
  function isLinkButton(element) {
    if (!element) return { isLink: false, postNumber: null };

    // 必须在帖子页面上
    if (!isTopicPage()) {
      return { isLink: false, postNumber: null };
    }

    // 核心检测：必须在帖子容器内（主帖或评论）
    const postContainer = element.closest('.topic-post, article[data-post-id]');
    if (!postContainer) {
      return { isLink: false, postNumber: null };
    }

    // 必须在帖子操作区域内（.post-controls 或 .post-menu-area 或类似区域）
    const controlsArea = element.closest('.post-controls, .post-menu-area, .actions, nav.post-controls');
    if (!controlsArea) {
      return { isLink: false, postNumber: null };
    }

    // 收集元素属性用于检测
    const className = element.className || '';
    const dataShareUrl = element.getAttribute('data-share-url');
    const title = element.title || '';
    const ariaLabel = element.getAttribute('aria-label') || '';

    // LinuxDo/Discourse 分享按钮的关键特征（通过浏览器检查确认）：
    // 最可靠特征: class="post-action-menu__copy-link"
    // 次要特征: title="copy a link to this post to clipboard" 或中文版
    const hasCopyLinkClass = className.includes('post-action-menu__copy-link') ||
                              className.includes('copy-link');
    const hasShareUrl = dataShareUrl !== null && dataShareUrl !== '';
    const hasShareClass = className.includes('share');
    const hasShareTitle = title.includes('将此帖子的链接复制到剪贴板') ||
                          title.includes('复制到剪贴板') ||
                          title.includes('链接') ||
                          title.toLowerCase().includes('copy a link') ||
                          title.toLowerCase().includes('copy') ||
                          title.toLowerCase().includes('share');
    const hasShareAria = ariaLabel.includes('链接') ||
                         ariaLabel.includes('复制') ||
                         ariaLabel.includes('分享') ||
                         ariaLabel.toLowerCase().includes('share') ||
                         ariaLabel.toLowerCase().includes('copy');

    // 判断是否为链接/分享按钮（优先检测最可靠的特征）
    const isLinkLike = hasCopyLinkClass || hasShareUrl || hasShareClass || hasShareTitle || hasShareAria;

    // 如果不像链接按钮，返回 false
    if (!isLinkLike) {
      return { isLink: false, postNumber: null };
    }

    // 获取楼层号 - 必须从 .topic-post 元素获取（不是 article）
    // 因为 article[data-post-id] 没有 data-post-number，楼层号在外层 .topic-post 上
    const topicPost = element.closest('.topic-post');
    const postNumber = topicPost?.getAttribute('data-post-number') ||
                       postContainer.getAttribute('data-post-number') ||
                       postContainer.querySelector('[data-post-number]')?.getAttribute('data-post-number') ||
                       '1';

    console.log('[Discourse Saver] 检测到链接按钮，楼层:', postNumber);
    return { isLink: true, postNumber: postNumber };
  }

  // 劫持链接按钮点击事件
  // V3.5.1: 单击保存到Obsidian，双击触发原生功能
  // V3.5.3: 支持评论区按钮，点击评论按钮保存主帖+该评论
  // V3.5.3.1: 修复双击检测竞态条件 - 必须是同一个按钮才算双击
  // V3.5.7: 改为劫持链接按钮，双击触发原生复制链接
  let linkClickCount = 0;
  let linkClickTimer = null;
  let lastLinkTarget = null;
  let lastLinkPostNumber = null; // 记录点击的楼层号
  let eventListenerAdded = false; // 防止重复添加事件监听器

  function hijackLinkButton() {
    // 防止重复添加事件监听器
    if (eventListenerAdded) {
      console.log('[Discourse Saver] 事件监听器已存在，跳过添加');
      return;
    }
    eventListenerAdded = true;

    document.addEventListener('click', (e) => {
      // V3.5.8: 简化检测 - 直接从点击元素向上查找 button
      // Discourse 的按钮结构: button > svg，点击 svg 时需要找到 button
      let target = e.target.closest('button');

      // 如果没找到 button，也检查 a 标签
      if (!target) {
        target = e.target.closest('a');
      }

      // V3.5.3.1: 检查是否有bypass标记（用于触发原生复制链接）
      if (target?.hasAttribute('data-linuxdo-obsidian-bypass')) {
        console.log('[Discourse Saver] 检测到bypass标记，放行原生点击');
        return; // 不拦截，让原生事件通过
      }

      const linkResult = isLinkButton(target);

      if (target && linkResult.isLink) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // V3.5.3.1: 检查是否点击的是同一个按钮（通过楼层号判断）
        const isSameButton = lastLinkPostNumber === linkResult.postNumber;

        if (isSameButton) {
          linkClickCount++;
        } else {
          // 点击了不同的链接按钮，重置计数
          if (linkClickTimer) {
            clearTimeout(linkClickTimer);
            linkClickTimer = null;
          }
          linkClickCount = 1;
        }

        lastLinkTarget = target;
        lastLinkPostNumber = linkResult.postNumber;

        // 清除之前的定时器
        if (linkClickTimer) {
          clearTimeout(linkClickTimer);
        }

        if (linkClickCount === 2 && isSameButton) {
          // 双击同一个按钮：触发原生复制链接
          console.log('[Discourse Saver] 双击检测，触发原生复制链接，楼层:', linkResult.postNumber);
          linkClickCount = 0;
          lastLinkPostNumber = null;
          triggerOriginalCopyLink(target);
        } else {
          // 等待300ms判断是否为双击
          const postNumber = linkResult.postNumber;
          linkClickTimer = setTimeout(() => {
            if (linkClickCount === 1) {
              // 单击：保存到Obsidian
              if (postNumber === '1') {
                console.log('[Discourse Saver] 单击主帖链接按钮，保存整个帖子');
                saveToObsidian(null); // 主帖：按原逻辑保存
              } else {
                console.log('[Discourse Saver] 单击评论链接按钮，保存主帖+第' + postNumber + '楼评论');
                saveToObsidian(postNumber); // 评论：保存主帖+该评论
              }
            }
            linkClickCount = 0;
            lastLinkPostNumber = null;
          }, 300);
        }

        return false;
      }
    }, true);

    console.log('[Discourse Saver] 链接按钮劫持已激活 (V3.6.0)');
  }

  // V3.5.7: 触发原生复制链接功能
  function triggerOriginalCopyLink(target) {
    // 直接复制当前帖子/评论的链接到剪贴板
    // V3.5.10: 从 .topic-post 获取楼层号
    const topicPost = target.closest('.topic-post');
    const postNumber = topicPost?.getAttribute('data-post-number') || '1';

    // 构建链接URL
    let linkUrl = window.location.href;

    // 清理URL（移除查询参数和锚点）
    linkUrl = linkUrl.replace(/#.*$/, '').replace(/\?.*$/, '');

    // 如果是评论，添加楼层号
    if (postNumber !== '1') {
      // 检查URL是否已经有楼层号，如果有则替换
      const match = linkUrl.match(/^(.*\/t\/[^/]+\/\d+)(\/\d+)?$/);
      if (match) {
        linkUrl = match[1] + '/' + postNumber;
      } else {
        linkUrl = linkUrl + '/' + postNumber;
      }
    }

    console.log('[Discourse Saver] 复制链接:', linkUrl);

    // 使用 Clipboard API 复制
    navigator.clipboard.writeText(linkUrl)
      .then(() => {
        if (postNumber === '1') {
          showNotification('已复制帖子链接', 'success');
        } else {
          showNotification(`已复制${postNumber}楼链接`, 'success');
        }
      })
      .catch(err => {
        console.error('[Discourse Saver] 剪贴板复制失败:', err);
        // 回退方法：触发原生点击
        fallbackTriggerCopyLink(target);
      });
  }

  // 回退方法：临时禁用插件拦截，触发原生点击
  function fallbackTriggerCopyLink(target) {
    console.log('[Discourse Saver] 使用回退方法触发原生复制链接');

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

    showNotification('已触发复制链接', 'success');
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

    console.log(`[Discourse Saver] 提取到 ${comments.length} 条评论`);
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
          console.log(`[Discourse Saver] 提取到第${postNumber}楼评论，作者: ${username}`);
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

    console.log(`[Discourse Saver] 未找到第${postNumber}楼评论`);
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
    // V4.0.2: 修复内部<br>标签不换行的问题
    turndownService.addRule('preserveStyledElements', {
      filter: (node) => {
        return (node.nodeName === 'SPAN' || node.nodeName === 'DIV' || node.nodeName === 'P') &&
               node.hasAttribute('style') &&
               node.getAttribute('style').includes('color');
      },
      replacement: (content, node) => {
        // 获取HTML并将<br>转换为换行符
        let html = node.outerHTML;
        // 将<br>、<br/>、<br />转换为换行符
        html = html.replace(/<br\s*\/?>/gi, '\n');
        return html;
      }
    });

    // 规则1.5：处理<br>标签，确保换行符被保留
    // V4.0.2: 新增，修复换行丢失问题
    turndownService.addRule('lineBreaks', {
      filter: 'br',
      replacement: () => '\n'
    });

    // 规则2：保留表格HTML
    turndownService.addRule('preserveTables', {
      filter: 'table',
      replacement: (content, node) => {
        return '\n\n' + node.outerHTML + '\n\n';
      }
    });

    // 规则2.5：处理LinuxDo的onebox（链接预览卡片）- 转换为丰富的引用块格式
    turndownService.addRule('onebox', {
      filter: (node) => {
        if (node.nodeName !== 'ASIDE') return false;
        const className = node.className || '';
        return className.includes('onebox') || className.includes('quote');
      },
      replacement: (content, node) => {
        // 尝试提取链接和更多信息
        const link = node.querySelector('a[href]');
        if (!link) return '';

        const href = link.href;
        // 提取标题
        const titleEl = node.querySelector('h3, h4, .onebox-title, .title, header');
        const title = titleEl?.textContent?.trim() || link.textContent?.trim() || '链接';
        // 提取描述
        const descEl = node.querySelector('.onebox-description, .description, p, .excerpt');
        const description = descEl?.textContent?.trim() || '';
        // 提取图片
        const imgEl = node.querySelector('img.thumbnail, img.onebox-avatar, .onebox-body img');
        const imgSrc = imgEl?.src || '';

        // 构建丰富的引用块格式
        let result = '\n\n> **' + title + '**\n';
        if (description) {
          result += '> ' + description.substring(0, 200) + (description.length > 200 ? '...' : '') + '\n';
        }
        result += '> 🔗 ' + href + '\n';
        if (imgSrc) {
          result += '> ![](' + imgSrc + ')\n';
        }
        result += '\n';

        return result;
      }
    });

    // 规则3：代码块保留语言标识
    // V4.0.2: 修复代码块内换行丢失问题
    // V4.0.2: 修复 LinuxDo 代码块结构（pre > div.按钮 + code）
    turndownService.addRule('codeBlocks', {
      filter: (node) => {
        // LinuxDo 的代码块结构：<pre><div>按钮</div><code>代码</code></pre>
        // 或者标准结构：<pre><code>代码</code></pre>
        // 只要 pre 里包含 code 就匹配
        return node.nodeName === 'PRE' && node.querySelector('code');
      },
      replacement: (content, node) => {
        // 查找 code 元素（可能不是 firstChild）
        const codeNode = node.querySelector('code');
        if (!codeNode) return content;

        // V4.0.2: 先将 <br> 标签转换为换行符，再获取文本内容
        // 克隆节点以避免修改原始 DOM
        const clonedCode = codeNode.cloneNode(true);
        // 将所有 <br> 替换为换行符文本节点
        const brTags = clonedCode.querySelectorAll('br');
        brTags.forEach(br => {
          br.replaceWith('\n');
        });
        const code = clonedCode.textContent;

        // 获取语言标识（从 class 或 data-code-wrap 属性）
        const langFromClass = codeNode.className.match(/lang-(\w+)/);
        const langFromData = node.getAttribute('data-code-wrap');
        const lang = langFromClass ? langFromClass[1] : (langFromData || '');

        return '\n\n```' + lang + '\n' + code + '\n```\n\n';
      }
    });

    // 规则3.5：处理独立的 <pre> 标签（不包含 <code>）
    // V4.0.2: 新增，确保所有预格式文本的换行都正确
    turndownService.addRule('preBlocks', {
      filter: (node) => {
        // 只匹配不包含 code 的 pre 标签
        return node.nodeName === 'PRE' && !node.querySelector('code');
      },
      replacement: (content, node) => {
        // 克隆节点处理 <br> 标签
        const clonedPre = node.cloneNode(true);
        const brTags = clonedPre.querySelectorAll('br');
        brTags.forEach(br => {
          br.replaceWith('\n');
        });
        const code = clonedPre.textContent;
        return '\n\n```\n' + code + '\n```\n\n';
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

    // 规则7.1：处理在线视频链接（YouTube、Bilibili、Vimeo）转为 iframe 嵌入
    turndownService.addRule('onlineVideoEmbed', {
      filter: (node) => {
        if (node.nodeName !== 'A') return false;
        const href = node.href || '';
        // 匹配 YouTube
        if (/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)/.test(href)) return true;
        // 匹配 Bilibili
        if (/bilibili\.com\/video\//.test(href)) return true;
        // 匹配 Vimeo
        if (/vimeo\.com\/\d+/.test(href)) return true;
        return false;
      },
      replacement: (content, node) => {
        const href = node.href || '';
        let embedUrl = '';

        // YouTube 处理
        const youtubeMatch = href.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/);
        if (youtubeMatch) {
          embedUrl = 'https://www.youtube.com/embed/' + youtubeMatch[1];
        }

        // Bilibili 处理
        const bilibiliMatch = href.match(/bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/i);
        if (bilibiliMatch) {
          embedUrl = 'https://player.bilibili.com/player.html?bvid=' + bilibiliMatch[1] + '&autoplay=0';
        }

        // Vimeo 处理
        const vimeoMatch = href.match(/vimeo\.com\/(\d+)/);
        if (vimeoMatch) {
          embedUrl = 'https://player.vimeo.com/video/' + vimeoMatch[1];
        }

        if (!embedUrl) return '[' + content + '](' + href + ')';

        return '\n\n<iframe src="' + embedUrl + '" style="width:100%; aspect-ratio:16/9;" frameborder="0" allowfullscreen></iframe>\n\n';
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
  // V3.6.0: 添加 keepGif 参数，在启用图片嵌入时保留 GIF 链接
  function cleanupMarkdown(markdown, keepGif = false) {
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

    // 7. 移除GIF图片链接（V3.6.0: 除非 keepGif 为 true）
    if (!keepGif) {
      markdown = markdown.replace(/!\[[^\]]*\]\([^)]*\.gif[^)]*\)/gi, '');
    }

    // 8. 移除多余空行
    markdown = markdown.replace(/\n{3,}/g, '\n\n');

    return markdown;
  }

  // V3.6.0: 图片转 Base64 功能
  // 下载图片并转为 Base64 数据
  async function fetchImageAsBase64(url, maxWidth, quality, skipGif) {
    try {
      // 检查是否为 GIF
      if (skipGif && /\.gif(\?|$)/i.test(url)) {
        console.log('[Discourse Saver] 跳过 GIF 图片:', url);
        return null;
      }

      // 获取图片
      const response = await fetch(url, {
        mode: 'cors',
        credentials: 'omit'
      });

      if (!response.ok) {
        console.warn('[Discourse Saver] 图片下载失败:', url, response.status);
        return null;
      }

      const blob = await response.blob();

      // 检查是否为 GIF（通过 MIME 类型）
      if (skipGif && blob.type === 'image/gif') {
        console.log('[Discourse Saver] 跳过 GIF 图片 (MIME):', url);
        return null;
      }

      // 使用 Canvas 处理图片（压缩和转换）
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        // 创建 Object URL 并在使用后释放，避免内存泄漏
        const blobUrl = URL.createObjectURL(blob);

        img.onload = () => {
          // 释放 Object URL
          URL.revokeObjectURL(blobUrl);

          try {
            let width = img.width;
            let height = img.height;

            // 如果设置了最大宽度且图片超宽，等比缩放
            if (maxWidth > 0 && width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // 转为 Base64（JPEG 格式，支持质量压缩）
            // 对于透明图片使用 PNG
            const hasAlpha = blob.type === 'image/png';
            const outputType = hasAlpha ? 'image/png' : 'image/jpeg';
            const base64 = canvas.toDataURL(outputType, quality);

            console.log('[Discourse Saver] 图片转换成功:', url, `${img.width}x${img.height} → ${width}x${height}`);
            resolve(base64);
          } catch (e) {
            console.warn('[Discourse Saver] Canvas 处理失败:', e);
            resolve(null);
          }
        };

        img.onerror = () => {
          // 释放 Object URL
          URL.revokeObjectURL(blobUrl);
          console.warn('[Discourse Saver] 图片加载失败:', url);
          resolve(null);
        };

        img.src = blobUrl;
      });
    } catch (error) {
      console.warn('[Discourse Saver] 获取图片异常:', url, error);
      return null;
    }
  }

  // 处理 Markdown 中的所有图片，转换为 Base64
  async function processMarkdownImages(markdown, config) {
    if (!config.embedImages) {
      return markdown;
    }

    console.log('[Discourse Saver] 开始处理图片嵌入...');

    // 匹配 Markdown 图片语法 ![alt](url)
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const images = [];
    let match;

    // 收集所有图片
    while ((match = imageRegex.exec(markdown)) !== null) {
      images.push({
        fullMatch: match[0],
        alt: match[1],
        url: match[2]
      });
    }

    if (images.length === 0) {
      console.log('[Discourse Saver] 没有找到需要处理的图片');
      return markdown;
    }

    // 提取唯一的 URL 进行下载，避免重复下载相同图片
    const uniqueUrls = [...new Set(images.map(img => img.url))];
    console.log(`[Discourse Saver] 找到 ${images.length} 张图片（${uniqueUrls.length} 张唯一），开始转换...`);

    // 并行下载所有唯一的图片
    const urlToBase64 = new Map();
    const results = await Promise.all(
      uniqueUrls.map(async (url) => {
        const base64 = await fetchImageAsBase64(
          url,
          config.imageMaxWidth,
          config.imageQuality,
          config.imageSkipGif
        );
        return { url, base64 };
      })
    );

    // 构建 URL 到 Base64 的映射
    for (const result of results) {
      if (result.base64) {
        urlToBase64.set(result.url, result.base64);
      }
    }

    // 替换图片链接为 Base64
    let processedMarkdown = markdown;
    let successCount = 0;
    let skipCount = 0;

    for (const img of images) {
      const base64 = urlToBase64.get(img.url);
      if (base64) {
        // 替换为 Base64 格式
        processedMarkdown = processedMarkdown.replace(
          img.fullMatch,
          `![${img.alt}](${base64})`
        );
        successCount++;
      } else {
        // 保留原链接
        skipCount++;
      }
    }

    console.log(`[Discourse Saver] 图片处理完成: ${successCount} 张嵌入, ${skipCount} 张保留原链接`);
    return processedMarkdown;
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

    // V3.6.0: 如果启用图片嵌入且保留 GIF，则不在转换阶段移除 GIF
    // 让后续的 processMarkdownImages 函数决定如何处理
    if (config.embedImages && config.imageSkipGif) {
      // 重新定义规则：保留 GIF 图片链接
      turndownService.addRule('keepGifImages', {
        filter: (node) => {
          if (node.nodeName !== 'IMG') return false;
          const src = node.src || '';
          const className = node.className || '';
          // 匹配 GIF 图片
          return src.includes('.gif') || className.includes('animated');
        },
        replacement: (content, node) => {
          const src = node.src;
          if (!src) return '';
          const fullSrc = src.startsWith('http') ? src : window.location.origin + src;
          const alt = node.alt?.replace(/[_\d]+$/, '').trim() || 'gif';
          return '\n\n![' + alt + '](' + fullSrc + ')\n\n';
        }
      });
    }

    // 转换正文并清理格式
    let mainContent = turndownService.turndown(contentHTML);
    // V3.6.0: 传递配置给 cleanupMarkdown，以便在启用图片嵌入时保留 GIF
    mainContent = cleanupMarkdown(mainContent, config.embedImages && config.imageSkipGif);
    mainContent = mainContent.trim();

    // 构建完整Markdown
    let markdown = '';

    // 添加中文frontmatter
    if (config.addMetadata) {
      // V3.5.6: 使用北京时间格式
      const now = new Date();
      const beijingTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
      const timeStr = beijingTime.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');

      markdown += `---
来源: ${metadata.url}
标题: ${metadata.title}
作者: ${metadata.author}
保存时间: ${timeStr}
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
        // V3.6.0: 传递 keepGif 参数
        commentContent = cleanupMarkdown(commentContent, config.embedImages && config.imageSkipGif);
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
      console.log('[Discourse Saver] 读取到的配置:', config);
      console.log('[Discourse Saver] 目标楼层:', targetPostNumber || '主帖');

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

      let markdown = convertToMarkdownWithComments(
        contentHTML,
        { title, url, author, topicId },
        comments,
        effectiveConfig
      );

      // V3.6.0: 处理图片嵌入（Base64）
      if (config.embedImages) {
        showNotification('正在处理图片嵌入...', 'info');
        markdown = await processMarkdownImages(markdown, config);
      }

      // 构建文件名：只用标题
      // V3.5.3: 单条评论模式时添加楼层号后缀
      const sanitizedTitle = title
        .replace(/[《》<>:"/\\|?*]/g, '')
        .replace(/\s+/g, '-')
        .replace(/^[\s-]+|[\s-]+$/g, '')
        .substring(0, 80);

      // 单条评论模式：文件名加楼层号，避免覆盖主帖文件
      const fileName = isSingleCommentMode
        ? `${sanitizedTitle}-${targetPostNumber}楼`
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

      console.log('[Discourse Saver] 生成的URI长度:', uri.length);
      console.log('[Discourse Saver] 文件路径:', filePath);
      console.log('[Discourse Saver] 评论数量:', comments.length);
      console.log('[Discourse Saver] 使用Advanced URI:', config.useAdvancedUri);

      // V3.5: 检查是否需要保存到 Obsidian
      const shouldSaveToObsidian = config.saveToObsidian !== false; // 默认为 true

      // V3.4.1: Advanced URI 优先模式
      // 当启用 Advanced URI 时，始终使用它（更可靠，无大小限制）
      const URI_LENGTH_LIMIT = 100000;

      if (shouldSaveToObsidian && config.useAdvancedUri) {
        // 始终使用 Advanced URI 插件（更可靠）
        console.log('[Discourse Saver] 使用 Advanced URI 插件（始终模式）');

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
          console.error('[Discourse Saver] 剪贴板写入失败:', clipboardError);
          showNotification('剪贴板不可用，请手动复制', 'error');
        }
      } else if (shouldSaveToObsidian && uri.length > URI_LENGTH_LIMIT) {
        // 未启用 Advanced URI 但内容过大，弹窗提示安装
        console.log('[Discourse Saver] URI过长 (' + uri.length + ' 字符)，需要 Advanced URI');
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
        console.log('[Discourse Saver→飞书] 检测到飞书配置，开始同步...');

        // V3.5.5: 统一清理URL，移除查询参数和锚点，确保URL一致性
        // 先清理基础URL
        let cleanUrl = url.replace(/#.*$/, '').replace(/\?.*$/, '');

        // V3.5.4: 评论书签保存时，URL和标题加上楼层标识，避免覆盖主帖记录
        // Discourse 的楼层 URL 格式是 /t/topic-slug/123/2（直接加楼层号）
        let feishuUrl = cleanUrl;
        let feishuTitle = title;
        if (isSingleCommentMode) {
          // URL格式: /t/topic-slug/123 或 /t/topic-slug/123/2
          // 需要保留帖子ID（第一个数字），只替换/添加楼层号（第二个数字）
          // 检查URL是否已经有楼层号（格式：/t/slug/123/2）
          // 匹配：保留到帖子ID为止，移除可能存在的楼层号
          const match = cleanUrl.match(/^(.*\/t\/[^/]+\/\d+)(\/\d+)?$/);
          if (match) {
            cleanUrl = match[1]; // 保留 /t/slug/123 部分
          }

          feishuUrl = `${cleanUrl}/${targetPostNumber}`;  // /t/xxx/123/2 可正常跳转
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
            console.error('[Discourse Saver→飞书] 发送消息失败:', chrome.runtime.lastError);
            return;
          }

          if (response && response.success) {
            const actionText = response.action === 'updated' ? '已更新' : '已保存';
            showNotification(`飞书${actionText}成功`, 'success');
          } else if (response) {
            console.error('[Discourse Saver→飞书] 保存失败:', response.error);
            showNotification('飞书保存失败: ' + response.error, 'error');
          }
        });
      }

      // V4.0.1: 检查 Notion 配置是否完整，如果完整则同步保存到 Notion
      const notionConfigComplete = config.saveToNotion &&
        config.notionToken &&
        config.notionDatabaseId;

      if (notionConfigComplete) {
        console.log('[Discourse Saver→Notion] 检测到 Notion 配置，开始同步...');

        // 清理URL，移除查询参数和锚点
        let cleanNotionUrl = url.replace(/#.*$/, '').replace(/\?.*$/, '');

        // 评论书签保存时，URL和标题加上楼层标识
        let notionUrl = cleanNotionUrl;
        let notionTitle = title;
        if (isSingleCommentMode) {
          const match = cleanNotionUrl.match(/^(.*\/t\/[^/]+\/\d+)(\/\d+)?$/);
          if (match) {
            cleanNotionUrl = match[1];
          }
          notionUrl = `${cleanNotionUrl}/${targetPostNumber}`;
          notionTitle = `${title} [${targetPostNumber}楼]`;
        }

        // 获取分类信息
        let category = '';
        const categoryBadge = document.querySelector('.topic-category .badge-category__name');
        if (categoryBadge) {
          category = categoryBadge.textContent.trim();
        }

        chrome.runtime.sendMessage({
          action: 'saveToNotion',
          config: {
            notionToken: config.notionToken,
            notionDatabaseId: config.notionDatabaseId,
            notionPropTitle: config.notionPropTitle || 'Title',
            notionPropUrl: config.notionPropUrl || 'URL',
            notionPropAuthor: config.notionPropAuthor || 'Author',
            notionPropCategory: config.notionPropCategory || 'Category',
            notionPropSavedDate: config.notionPropSavedDate || 'Saved Date',
            notionPropCommentCount: config.notionPropCommentCount || 'Comments'
          },
          postData: {
            title: notionTitle,
            url: notionUrl,
            author: author,
            content: markdown,
            category: category,
            commentCount: comments.length
          }
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('[Discourse Saver→Notion] 发送消息失败:', chrome.runtime.lastError);
            return;
          }

          if (response && response.success) {
            showNotification('Notion 保存成功', 'success');
          } else if (response) {
            console.error('[Discourse Saver→Notion] 保存失败:', response.error);
            showNotification('Notion 保存失败: ' + response.error, 'error');
          }
        });
      }

      // V4.0.1: 如果所有保存目标都没有启用，提示用户
      if (!shouldSaveToObsidian && !feishuConfigComplete && !notionConfigComplete) {
        showNotification('请在设置中至少启用一个保存目标', 'warning');
      }

    } catch (error) {
      console.error('[Discourse Saver] 保存失败:', error);
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
      console.log('[Discourse Saver] 快捷键监听器已存在，跳过添加');
      return;
    }
    keyboardListenerAdded = true;

    document.addEventListener('keydown', (e) => {
      // 只在帖子页面响应快捷键
      if (!isTopicPage()) return;

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
        e.preventDefault();
        console.log('[Discourse Saver] 快捷键触发');
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
      console.log('[Discourse Saver] 插件已禁用');
      return;
    }

    // 检查是否是帖子页面
    if (!isTopicPage()) {
      console.log('[Discourse Saver] 非帖子页面，跳过初始化');
      return;
    }

    // 检查是否已经为当前页面初始化过
    const topicUrl = window.location.pathname;
    if (pluginInitialized && currentTopicUrl === topicUrl) {
      console.log('[Discourse Saver] 当前页面已初始化');
      return;
    }

    // 初始化事件监听器（只添加一次）
    hijackLinkButton();
    setupKeyboardShortcut();

    pluginInitialized = true;
    currentTopicUrl = topicUrl;
    console.log('[Discourse Saver] 插件已加载 (V3.6.0)');
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
      console.log('[Discourse Saver] 检测到页面导航:', url);
      // 页面导航时重置初始化状态，允许重新初始化
      pluginInitialized = false;
      setTimeout(init, 500);
    }
  }).observe(document, { subtree: true, childList: true });

})();
