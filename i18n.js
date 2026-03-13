// 国际化翻译字典
const i18n = {
  zh: {
    header: {
      subtitle: '保存 Discourse 论坛帖子到 Obsidian、飞书或 Notion V4.0.2'
    },
    sections: {
      pluginStatus: '插件状态',
      siteSettings: '站点设置',
      saveTarget: '保存目标',
      obsidian: 'Obsidian 设置',
      feishu: '飞书多维表格设置',
      notion: 'Notion Database 设置',
      content: '内容设置',
      comments: '评论设置'
    },
    pluginStatus: {
      enabled: '启用插件（关闭后链接按钮恢复原功能）',
      help: '关闭后需刷新页面生效'
    },
    siteSettings: {
      customSites: '自定义站点列表',
      addSite: '添加站点',
      help: '添加私有部署或未被自动检测的 Discourse 站点域名（如 forum.example.com）',
      autoDetect: '已内置支持所有 Discourse 论坛自动检测，仅在检测失败时需要手动添加',
      newSitePlaceholder: '输入站点域名，如 forum.example.com'
    },
    saveTarget: {
      obsidian: '保存到 Obsidian',
      feishu: '保存到飞书多维表格',
      notion: '保存到 Notion Database',
      multiSaveHelp: '可以同时保存到多个地方'
    },
    obsidian: {
      vaultName: 'Vault 名称',
      vaultHelp: '留空使用当前打开的 vault（推荐）',
      vaultPlaceholder: '留空自动使用当前打开的仓库',
      vaultHelpDetail: '推荐留空，会自动保存到当前打开的 Obsidian 仓库',
      folder: '保存文件夹',
      folderHelp: '文件保存到该文件夹下',
      folderPlaceholder: 'LinuxDo收集箱',
      folderHelpDetail: '文件夹不存在会自动创建',
      useUri: '使用 Advanced URI 插件',
      uriHelp: '支持保存大内容（需先在 Obsidian 中安装 Advanced URI 插件）'
    },
    feishu: {
      version: 'API 版本',
      versionFeishu: '飞书（国内版）',
      versionLark: 'Lark（国际版）',
      versionHelp: '根据你的飞书账号类型选择，国内用户选飞书，海外用户选 Lark',
      appId: 'App ID',
      appIdHelp: '在飞书开放平台创建应用获取',
      appIdPlaceholder: 'cli_xxxxxxxxxxxxxxxx',
      appSecret: 'App Secret',
      appSecretPlaceholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      appToken: '多维表格 app_token',
      appTokenHelp: 'URL 中 /base/ 后面到 ? 之前的字符串',
      appTokenPlaceholder: 'bascnxxxxxxxxxxxxxxxx',
      appTokenHelpDetail: '从多维表格 URL 中获取：feishu.cn/base/bascnxxx?table=...',
      tableId: '数据表 table_id',
      tableIdHelp: 'URL 中 ?table= 后面的字符串（以 tbl 开头）',
      tableIdPlaceholder: 'tblxxxxxxxxxxxxxxxx',
      tableIdHelpDetail: '从 URL 中获取：?table=tblxxx&view=...',
      uploadMd: '上传 MD 附件',
      uploadMdHelp: '将完整内容作为 .md 文件上传到飞书',
      uploadMdHelpDetail: '不勾选则只保存文本摘要，无需 drive 权限',
      testConnection: '测试连接',
      help: '配置教程请参考 README 中的飞书设置章节'
    },
    notion: {
      token: 'Integration Token',
      tokenHelp: '以 secret_ 开头，从 Notion Integration 页面获取',
      databaseId: 'Database ID',
      databaseIdHelp: '32 位十六进制字符，从 Database URL 获取',
      databaseIdHelpDetail: '从 Database 链接中复制，格式为 32 位字符（可含连字符）',
      propertyMapping: '属性映射配置',
      propertyMappingHelp: '属性名需与 Notion Database 中的列名完全匹配（区分大小写）',
      propertyTitle: '标题（Title 类型）',
      propertyUrl: '链接（URL 类型）',
      propertyAuthor: '作者（Rich Text 类型）',
      propertyCategory: '分类（Rich Text/Select）',
      propertySaveDate: '保存日期（Date 类型）',
      propertyComments: '评论数（Number 类型）',
      testConnection: '测试连接',
      help: '详细配置请参考 NOTION-GUIDE.html'
    },
    content: {
      addMetadata: '添加中文元数据（frontmatter）',
      keepImages: '保留图片链接',
      embedImages: '将图片嵌入笔记（Base64）',
      embedImagesHelp: '图片转为 Base64 嵌入 Markdown，单文件完整保存（需启用 Advanced URI）',
      maxWidth: '图片最大宽度',
      maxWidthHelp: '超过此宽度的图片会等比例缩小',
      maxWidthOriginal: '保持原始尺寸',
      quality: '图片质量',
      qualityHelp: '降低质量可减小文件体积',
      skipGif: '跳过 GIF 动图',
      skipGifHelp: 'GIF 转 Base64 会失去动画效果，启用后保留原链接',
      skipGifHelpDetail: 'GIF 转换后会失去动画效果'
    },
    comments: {
      saveComments: '保存评论区',
      commentsCount: '评论数量',
      commentsHelp: '设置最多保存多少条评论（1-3000）',
      collapseComments: '折叠评论',
      collapseHelp: '使用 <details> 标签折叠评论内容'
    },
    buttons: {
      save: '保存设置',
      saving: '保存中...',
      saved: '已保存',
      testConnection: '测试连接',
      testing: '测试中...',
      addSite: '添加站点',
      add: '添加',
      reset: '恢复默认'
    },
    messages: {
      saveSuccess: '设置已保存',
      saveError: '保存失败',
      feishuTestSuccess: '飞书连接测试成功！',
      feishuTestFailed: '飞书连接测试失败',
      notionTestSuccess: 'Notion 连接测试成功！',
      notionTestFailed: 'Notion 连接测试失败',
      siteAdded: '站点已添加',
      siteRemoved: '站点已删除',
      pleaseEnterDomain: '请输入域名'
    },
    badges: {
      new: '新',
      obsidian: 'Obsidian',
      feishu: '飞书',
      notion: 'Notion'
    }
  },
  en: {
    header: {
      subtitle: 'Save Discourse Forum Posts to Obsidian, Feishu or Notion V4.0.2'
    },
    sections: {
      pluginStatus: 'Plugin Status',
      siteSettings: 'Site Settings',
      saveTarget: 'Save Target',
      obsidian: 'Obsidian Settings',
      feishu: 'Feishu Bitable Settings',
      notion: 'Notion Database Settings',
      content: 'Content Settings',
      comments: 'Comment Settings'
    },
    pluginStatus: {
      enabled: 'Enable Plugin (Link button restores original function when disabled)',
      help: 'Refresh page after changing'
    },
    siteSettings: {
      customSites: 'Custom Site List',
      addSite: 'Add Site',
      help: 'Add privately deployed or undetected Discourse site domain (e.g., forum.example.com)',
      autoDetect: 'Built-in automatic detection for all Discourse forums, only add manually if detection fails',
      newSitePlaceholder: 'Enter site domain, e.g., forum.example.com'
    },
    saveTarget: {
      obsidian: 'Save to Obsidian',
      feishu: 'Save to Feishu Bitable',
      notion: 'Save to Notion Database',
      multiSaveHelp: 'Can save to multiple destinations simultaneously'
    },
    obsidian: {
      vaultName: 'Vault Name',
      vaultHelp: 'Leave empty to use currently open vault (recommended)',
      vaultPlaceholder: 'Leave empty to use current vault',
      vaultHelpDetail: 'Recommended to leave empty, will automatically use current Obsidian vault',
      folder: 'Save Folder',
      folderHelp: 'Files will be saved to this folder',
      folderPlaceholder: 'LinuxDo Inbox',
      folderHelpDetail: 'Folder will be created automatically if it does not exist',
      useUri: 'Use Advanced URI Plugin',
      uriHelp: 'Support large content save (requires Advanced URI plugin installed in Obsidian)'
    },
    feishu: {
      version: 'API Version',
      versionFeishu: 'Feishu (Domestic)',
      versionLark: 'Lark (International)',
      versionHelp: 'Choose based on your account type, Feishu for domestic China, Lark for international',
      appId: 'App ID',
      appIdHelp: 'Get from Feishu Open Platform after creating an app',
      appIdPlaceholder: 'cli_xxxxxxxxxxxxxxxx',
      appSecret: 'App Secret',
      appSecretPlaceholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      appToken: 'Bitable app_token',
      appTokenHelp: 'String after /base/ and before ? in URL',
      appTokenPlaceholder: 'bascnxxxxxxxxxxxxxxxx',
      appTokenHelpDetail: 'Get from Bitable URL: feishu.cn/base/bascnxxx?table=...',
      tableId: 'Data table table_id',
      tableIdHelp: 'String after ?table= in URL (starts with tbl)',
      tableIdPlaceholder: 'tblxxxxxxxxxxxxxxxx',
      tableIdHelpDetail: 'Get from URL: ?table=tblxxx&view=...',
      uploadMd: 'Upload MD Attachment',
      uploadMdHelp: 'Upload complete content as .md file to Feishu',
      uploadMdHelpDetail: 'If unchecked, only save text summary without drive permission',
      testConnection: 'Test Connection',
      help: 'See Feishu Settings section in README for configuration tutorial'
    },
    notion: {
      token: 'Integration Token',
      tokenHelp: 'Starts with secret_, get from Notion Integration page',
      databaseId: 'Database ID',
      databaseIdHelp: '32-character hexadecimal string, get from Database URL',
      databaseIdHelpDetail: 'Copy from Database link, 32-character format (may contain hyphens)',
      propertyMapping: 'Property Mapping Config',
      propertyMappingHelp: 'Property names must exactly match column names in Notion Database (case-sensitive)',
      propertyTitle: 'Title (Title type)',
      propertyUrl: 'Link (URL type)',
      propertyAuthor: 'Author (Rich Text type)',
      propertyCategory: 'Category (Rich Text/Select)',
      propertySaveDate: 'Save Date (Date type)',
      propertyComments: 'Comments (Number type)',
      testConnection: 'Test Connection',
      help: 'See NOTION-GUIDE.html for detailed configuration'
    },
    content: {
      addMetadata: 'Add Chinese metadata (frontmatter)',
      keepImages: 'Keep image links',
      embedImages: 'Embed images in notes (Base64)',
      embedImagesHelp: 'Convert images to Base64 embedded in Markdown, complete single-file save (requires Advanced URI)',
      maxWidth: 'Max Image Width',
      maxWidthHelp: 'Images wider than this will be proportionally resized',
      maxWidthOriginal: 'Keep original size',
      quality: 'Image Quality',
      qualityHelp: 'Lower quality reduces file size',
      skipGif: 'Skip GIF animations',
      skipGifHelp: 'GIF to Base64 loses animation, keep original link when enabled',
      skipGifHelpDetail: 'GIF will lose animation after conversion'
    },
    comments: {
      saveComments: 'Save Comment Section',
      commentsCount: 'Comment Count',
      commentsHelp: 'Set maximum number of comments to save (1-3000)',
      collapseComments: 'Collapse Comments',
      collapseHelp: 'Use <details> tag to collapse comment content'
    },
    buttons: {
      save: 'Save Settings',
      saving: 'Saving...',
      saved: 'Saved',
      testConnection: 'Test Connection',
      testing: 'Testing...',
      addSite: 'Add Site',
      add: 'Add',
      reset: 'Reset to Default'
    },
    messages: {
      saveSuccess: 'Settings saved',
      saveError: 'Save failed',
      feishuTestSuccess: 'Feishu connection test successful!',
      feishuTestFailed: 'Feishu connection test failed',
      notionTestSuccess: 'Notion connection test successful!',
      notionTestFailed: 'Notion connection test failed',
      siteAdded: 'Site added',
      siteRemoved: 'Site removed',
      pleaseEnterDomain: 'Please enter domain'
    },
    badges: {
      new: 'New',
      obsidian: 'Obsidian',
      feishu: 'Feishu',
      notion: 'Notion'
    }
  }
};

// 语言切换函数
function setLanguage(lang) {
  // 保存语言偏好
  chrome.storage.local.set({ uiLanguage: lang });

  // 更新 HTML lang 属性
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';

  // 更新所有带 data-i18n 属性的元素
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const keys = key.split('.');
    let value = i18n[lang];

    for (const k of keys) {
      value = value?.[k];
    }

    if (value) {
      if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'password')) {
        el.placeholder = value;
      } else {
        el.textContent = value;
      }
    }
  });

  // 更新语言切换按钮状态
  document.querySelectorAll('.language-toggle button').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-lang') === lang);
  });
}

// 初始化语言
function initLanguage() {
  chrome.storage.local.get(['uiLanguage'], (result) => {
    const lang = result.uiLanguage || 'zh';
    setLanguage(lang);
  });
}

// 导出函数供其他脚本使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { i18n, setLanguage, initLanguage };
}
