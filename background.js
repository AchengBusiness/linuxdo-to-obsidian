// Discourse Saver - Background Script V4.0.2
// 处理飞书/Notion API请求（解决CORS问题）+ 动态脚本注入
// V3.5: 支持上传MD文件作为附件
// V3.5.2: 支持飞书国内版和Lark国际版
// V3.5.3: 配合 content.js 支持评论书签功能
// V4.0.1: 新增 Notion Database 保存功能
// V4.0.2: 修复 Notion 内容换行问题
// V3.5.4: 版本同步
// V3.5.5: 修复飞书记录搜索 - 改用标题搜索（超链接字段contains不搜索URL）
// V3.5.12: 增强飞书测试连接 - 验证必需字段是否存在及类型是否正确
// V3.5.13: 增强错误提示 - 针对常见配置错误给出友好提示
// V3.6.0: 支持所有 Discourse 论坛 - 自动检测 + 自定义站点管理

// API 域名映射
const API_DOMAINS = {
  feishu: 'https://open.feishu.cn',
  lark: 'https://open.larksuite.com'
};

// 获取 API 基础 URL
function getApiBaseUrl(apiDomain) {
  return API_DOMAINS[apiDomain] || API_DOMAINS.feishu;
}

// 缓存 tenant_access_token（按域名分别缓存）
let feishuTokenCache = {
  feishu: { token: null, expireTime: 0 },
  lark: { token: null, expireTime: 0 }
};

// 飞书错误码映射 - 提供友好的中文提示
const FEISHU_ERROR_CODES = {
  // 认证相关
  10003: {
    msg: 'App ID 或 App Secret 错误',
    hint: '请检查飞书开放平台的应用凭证是否正确复制，注意不要包含多余空格'
  },
  10014: {
    msg: 'App Secret 错误',
    hint: '请重新复制 App Secret，注意 Secret 只显示一次，如果忘记需要重新生成'
  },
  99991663: {
    msg: 'App ID 格式错误',
    hint: 'App ID 应该是 cli_xxxxxx 格式，请检查是否完整复制'
  },
  99991664: {
    msg: 'App Secret 格式错误',
    hint: 'App Secret 格式不正确，请从飞书开放平台重新复制'
  },

  // 权限相关
  1254043: {
    msg: '应用权限不足',
    hint: '请在飞书开放平台添加 bitable:app 权限，并将应用添加为多维表格的协作者'
  },
  1254044: {
    msg: '无访问此文档的权限',
    hint: '请确保已将应用添加为多维表格的「可编辑」协作者'
  },
  1254045: {
    msg: '文档不存在或无权限',
    hint: '请检查 app_token 是否正确，或确认应用已添加为协作者'
  },
  1254607: {
    msg: '数据表不存在',
    hint: 'table_id 错误或数据表已被删除\n\n' +
          '📌 table_id 是【当前数据表】的标识\n' +
          '提取方法：从 URL「?table=」后面的部分\n\n' +
          '⚠️ 一个多维表格可以包含多个数据表：\n' +
          '• 确保你复制的是正确的数据表 ID\n' +
          '• 数据表 ID 以「tbl」开头\n' +
          '• 打开多维表格，点击你要使用的数据表，然后从 URL 复制'
  },

  // 资源相关
  1254301: {
    msg: '多维表格不存在',
    hint: 'app_token 错误\n\n' +
          '📌 app_token 是【整个多维表格文档】的标识\n' +
          '提取方法：从 URL「/base/」后面到「?」之前的部分\n\n' +
          '示例 URL：https://feishu.cn/base/VwGhbxxxxx?table=tblyyy\n' +
          'app_token 应该是：VwGhbxxxxx\n\n' +
          '⚠️ 不要复制整个 URL，只复制对应部分'
  },
  1254302: {
    msg: '数据表不存在',
    hint: 'table_id 错误\n\n' +
          '📌 table_id 是【当前数据表】的标识（以 tbl 开头）\n' +
          '提取方法：从 URL「?table=」后面的部分\n\n' +
          '示例 URL：https://feishu.cn/base/VwGhbxxxxx?table=tblyyyyyyy\n' +
          'table_id 应该是：tblyyyyyyy\n\n' +
          '⚠️ 注意：一个多维表格可以有多个数据表\n' +
          '确保复制的是你要保存数据的那个表的 ID'
  },
  1254006: {
    msg: '找不到指定的多维表格',
    hint: 'app_token 错误\n\n' +
          '📌 请检查 app_token 是否正确\n' +
          '提取方法：从 URL「/base/」后面到「?」之前的部分\n\n' +
          '常见错误：\n' +
          '• 复制了整个 URL 而不是 app_token 部分\n' +
          '• app_token 和 table_id 复制反了\n' +
          '• 复制时包含了多余空格'
  },

  // 字段相关
  1254016: {
    msg: '字段不存在',
    hint: '多维表格中缺少必需字段，请参考 README 创建：标题、链接、作者、保存时间、评论数、附件、正文'
  },
  1254017: {
    msg: '字段类型不匹配',
    hint: '请检查字段类型是否正确：链接必须是「超链接」类型，保存时间必须是「日期」类型，评论数必须是「数字」类型'
  },
  1254018: {
    msg: '字段值格式错误',
    hint: '请检查多维表格的字段类型配置是否正确'
  },

  // 应用状态相关
  10012: {
    msg: '应用未发布',
    hint: '请在飞书开放平台「版本管理与发布」中发布应用，企业自建应用必须发布后才能使用 API'
  },
  10013: {
    msg: '应用已停用',
    hint: '请在飞书开放平台检查应用状态，确保应用处于启用状态'
  },

  // 频率限制
  99991400: {
    msg: 'API 调用频率超限',
    hint: '请稍后再试，飞书 API 有调用频率限制'
  },

  // 网络/服务器相关
  99991401: {
    msg: '飞书服务暂时不可用',
    hint: '飞书服务器可能正在维护，请稍后再试'
  }
};

// ============================================
// Notion API 相关配置 (V4.0.1 新增)
// ============================================

// Notion API 版本
const NOTION_API_VERSION = '2022-06-28';

// Notion 错误码映射 - 提供友好的中文提示
const NOTION_ERROR_CODES = {
  400: {
    msg: '请求参数错误',
    hint: '请检查属性映射是否与 Database 中的列名完全匹配（区分大小写）'
  },
  401: {
    msg: 'Integration Token 无效',
    hint: 'Token 错误或已过期，请在 Notion Settings → Integrations 中重新获取\n\n' +
          '📌 Token 格式：secret_xxxxxxxxxxxxxxxx\n' +
          '⚠️ 注意：Token 必须以 secret_ 开头'
  },
  403: {
    msg: '无权限访问该 Database',
    hint: '请在 Notion 中将 Integration 连接到 Database：\n\n' +
          '1. 打开目标 Database 页面\n' +
          '2. 点击右上角「...」菜单\n' +
          '3. 选择「Connections」→「Connect to」\n' +
          '4. 选择你创建的 Integration'
  },
  404: {
    msg: 'Database 不存在',
    hint: 'Database ID 错误，请重新从 URL 中复制：\n\n' +
          '📌 提取方法：\n' +
          '1. 打开 Database 页面\n' +
          '2. 点击「Share」→「Copy link」\n' +
          '3. 从链接中提取 32 位 ID\n\n' +
          '示例：notion.so/xxxxx?v=yyy\n' +
          'Database ID 是中间的 32 位字符'
  },
  409: {
    msg: '数据冲突',
    hint: '可能存在重复记录，请稍后重试'
  },
  429: {
    msg: '请求过于频繁',
    hint: 'Notion API 有速率限制（每秒 3 次请求），请稍后再试'
  },
  500: {
    msg: 'Notion 服务器错误',
    hint: 'Notion 服务暂时不可用，请稍后再试'
  },
  502: {
    msg: 'Notion 网关错误',
    hint: 'Notion 服务暂时不可用，请稍后再试'
  },
  503: {
    msg: 'Notion 服务不可用',
    hint: 'Notion 正在维护或过载，请稍后再试'
  }
};

// 解析 Notion 错误，返回友好提示
function parseNotionError(status, errorData, context) {
  const errorInfo = NOTION_ERROR_CODES[status];
  const apiMessage = errorData?.message || '';
  const apiCode = errorData?.code || '';

  if (errorInfo) {
    let msg = `${context}失败：${errorInfo.msg}`;
    if (apiMessage) {
      msg += `\n\n❌ Notion 返回：${apiMessage}`;
    }
    msg += `\n\n💡 解决方法：${errorInfo.hint}`;
    return msg;
  }

  // 未知错误
  return `${context}失败：HTTP ${status}\n\n❌ Notion 返回：${apiMessage || '未知错误'}\n错误码：${apiCode}`;
}

// HTTP 错误码映射
const HTTP_ERROR_HINTS = {
  400: {
    msg: '请求参数错误',
    hint: '请检查配置信息格式是否正确'
  },
  401: {
    msg: '认证失败',
    hint: 'App ID 或 App Secret 错误，请检查飞书应用凭证'
  },
  403: {
    msg: '权限被拒绝',
    hint: '请确保应用已添加 bitable:app 权限，并将应用添加为多维表格协作者'
  },
  404: {
    msg: '多维表格或数据表不存在',
    hint: '请仔细检查 app_token 和 table_id：\n\n' +
          '📌 app_token（多维表格 token）：\n' +
          '   • 从 URL 中「/base/」后面到「?」之前的部分\n' +
          '   • 示例：VwGhbxxxxxxxxxxxxx\n' +
          '   • 这是整个多维表格文档的标识\n\n' +
          '📌 table_id（数据表 ID）：\n' +
          '   • 从 URL 中「?table=」后面的部分\n' +
          '   • 示例：tblyyyyyyyyyyy（以 tbl 开头）\n' +
          '   • 这是你要保存数据的那个具体数据表的 ID\n\n' +
          '⚠️ 常见错误：\n' +
          '   • 复制了整个 URL 而不是提取对应部分\n' +
          '   • app_token 和 table_id 复制反了\n' +
          '   • 一个多维表格有多个数据表，选错了表\n' +
          '   • 使用了 Lark 国际版但没有在设置中切换'
  },
  429: {
    msg: 'API 调用过于频繁',
    hint: '请稍后再试'
  },
  500: {
    msg: '飞书服务器错误',
    hint: '飞书服务器内部错误，请稍后再试'
  },
  502: {
    msg: '网关错误',
    hint: '飞书服务暂时不可用，请稍后再试'
  },
  503: {
    msg: '服务不可用',
    hint: '飞书服务正在维护，请稍后再试'
  }
};

// 解析飞书错误，返回友好提示
function parseFeishuError(code, originalMsg, context) {
  const errorInfo = FEISHU_ERROR_CODES[code];

  if (errorInfo) {
    return `${context}失败：${errorInfo.msg}\n\n💡 解决方法：${errorInfo.hint}`;
  }

  // 未知错误码，返回原始信息
  return `${context}失败：${originalMsg}\n（错误码: ${code}）`;
}

// 解析 HTTP 错误，返回友好提示
function parseHttpError(status, context, responseText) {
  const errorInfo = HTTP_ERROR_HINTS[status];

  if (errorInfo) {
    return `${context}失败：${errorInfo.msg}\n\n💡 可能原因：${errorInfo.hint}`;
  }

  // 未知 HTTP 错误
  return `${context}失败：HTTP ${status}\n响应内容：${responseText.substring(0, 100)}`;
}

// 安全解析 JSON 响应（增强版）
async function safeParseJson(response, context) {
  const text = await response.text();

  // 检查是否为空
  if (!text || text.trim() === '') {
    throw new Error(`${context}失败：服务器返回空响应\n\n💡 可能原因：\n• 网络连接问题\n• 飞书服务暂时不可用\n• API 地址不正确`);
  }

  // 检查 HTTP 状态
  if (!response.ok) {
    // 尝试解析 JSON 错误信息
    try {
      const errorData = JSON.parse(text);
      if (errorData.code !== undefined) {
        throw new Error(parseFeishuError(errorData.code, errorData.msg || '未知错误', context));
      }
    } catch (parseError) {
      // JSON 解析失败，使用 HTTP 错误处理
      if (parseError.message.includes('失败：')) {
        throw parseError; // 已经是格式化的错误
      }
    }

    throw new Error(parseHttpError(response.status, context, text));
  }

  // 尝试解析 JSON
  try {
    return JSON.parse(text);
  } catch (e) {
    // 如果是 HTML，提取有用信息
    if (text.includes('<!DOCTYPE') || text.includes('<html')) {
      throw new Error(`${context}失败：服务器返回了网页而不是数据\n\n💡 可能原因：\n• API 地址不正确\n• 网络代理或防火墙拦截\n• 飞书服务正在维护`);
    }
    throw new Error(`${context}失败：无法解析服务器响应\n\n响应内容：${text.substring(0, 100)}`);
  }
}

// 获取飞书 tenant_access_token
async function getFeishuToken(appId, appSecret, apiDomain = 'feishu') {
  // 先验证参数
  if (!appId || !appId.trim()) {
    throw new Error('App ID 未填写\n\n💡 请在飞书开放平台「凭证与基础信息」中复制 App ID');
  }
  if (!appSecret || !appSecret.trim()) {
    throw new Error('App Secret 未填写\n\n💡 请在飞书开放平台「凭证与基础信息」中复制 App Secret');
  }

  // App ID 格式检查
  if (!appId.startsWith('cli_')) {
    throw new Error(`App ID 格式错误：${appId.substring(0, 20)}...\n\n💡 App ID 应该以「cli_」开头，请检查是否复制正确`);
  }

  const cache = feishuTokenCache[apiDomain] || feishuTokenCache.feishu;

  // 检查缓存是否有效（提前5分钟过期）
  if (cache.token && Date.now() < cache.expireTime - 300000) {
    console.log('[Discourse Saver→飞书] 使用缓存的token');
    return cache.token;
  }

  const baseUrl = getApiBaseUrl(apiDomain);
  console.log('[Discourse Saver→飞书] 获取新的tenant_access_token，API域名:', baseUrl);

  let response;
  try {
    response = await fetch(`${baseUrl}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        app_id: appId.trim(),
        app_secret: appSecret.trim()
      })
    });
  } catch (fetchError) {
    throw new Error(`网络连接失败\n\n💡 可能原因：\n• 无法访问飞书服务器\n• 网络连接不稳定\n• 如果使用代理，请检查代理设置\n\n原始错误：${fetchError.message}`);
  }

  const data = await safeParseJson(response, '获取访问令牌');

  if (data.code !== 0) {
    throw new Error(parseFeishuError(data.code, data.msg, '获取访问令牌'));
  }

  // 缓存token（有效期2小时）
  if (!feishuTokenCache[apiDomain]) {
    feishuTokenCache[apiDomain] = {};
  }
  feishuTokenCache[apiDomain].token = data.tenant_access_token;
  feishuTokenCache[apiDomain].expireTime = Date.now() + (data.expire * 1000);

  console.log('[Discourse Saver→飞书] 获取token成功');
  return data.tenant_access_token;
}

// V3.5: 上传MD文件到飞书素材库
async function uploadMdFile(token, appToken, title, mdContent, apiDomain = 'feishu') {
  console.log('[Discourse Saver→飞书] 开始上传MD文件...');

  // 清理文件名中的非法字符
  const safeTitle = title
    .replace(/[《》<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);

  const fileName = `${safeTitle}.md`;

  // 创建 Blob
  const blob = new Blob([mdContent], { type: 'text/markdown' });

  // 构建 FormData
  // 注意：parent_type 对于多维表格附件应该是 'bitable_file'
  const formData = new FormData();
  formData.append('file', blob, fileName);
  formData.append('file_name', fileName);
  formData.append('parent_type', 'bitable_file');
  formData.append('parent_node', appToken);
  formData.append('size', blob.size.toString());

  const baseUrl = getApiBaseUrl(apiDomain);
  const response = await fetch(`${baseUrl}/open-apis/drive/v1/medias/upload_all`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });

  const data = await safeParseJson(response, '上传文件');

  if (data.code !== 0) {
    console.error('[Discourse Saver→飞书] 上传文件失败:', data);
    throw new Error(`上传文件失败: ${data.msg}`);
  }

  console.log('[Discourse Saver→飞书] 文件上传成功，file_token:', data.data.file_token);
  return data.data.file_token;
}

// 保存到飞书多维表格（可选MD附件）
async function saveToFeishu(config, postData) {
  const { apiDomain, appId, appSecret, appToken, tableId, uploadAttachment } = config;
  const domain = apiDomain || 'feishu';

  // 验证必填参数
  validateFeishuConfig(config);

  // 获取token
  const token = await getFeishuToken(appId, appSecret, domain);

  // 构建记录数据
  const fields = {
    '标题': postData.title,
    '链接': {
      link: postData.url,
      text: postData.title
    },
    '作者': postData.author,
    '保存时间': Date.now(),
    '评论数': postData.commentCount || 0
  };

  // 根据配置决定是否上传附件
  if (uploadAttachment) {
    // 上传MD文件
    let fileToken = null;
    try {
      fileToken = await uploadMdFile(token, appToken, postData.title, postData.content, domain);
      fields['附件'] = [{ file_token: fileToken }];
      console.log('[Discourse Saver→飞书] MD附件上传成功');
    } catch (uploadError) {
      console.warn('[Discourse Saver→飞书] MD文件上传失败，改为保存文本:', uploadError.message);
      fields['正文'] = postData.content;
    }
  } else {
    // 不上传附件，直接保存文本
    fields['正文'] = postData.content;
  }

  const record = { fields };

  // 调用飞书API新增记录
  const baseUrl = getApiBaseUrl(domain);
  const apiUrl = `${baseUrl}/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`;

  let response;
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(record)
    });
  } catch (fetchError) {
    throw new Error(`网络连接失败\n\n💡 请检查网络连接后重试\n\n原始错误：${fetchError.message}`);
  }

  const data = await safeParseJson(response, '保存记录');

  if (data.code !== 0) {
    throw new Error(parseFeishuError(data.code, data.msg, '保存记录'));
  }

  console.log('[Discourse Saver→飞书] 保存成功，record_id:', data.data.record.record_id);
  return data.data.record;
}

// 验证飞书配置参数
function validateFeishuConfig(config) {
  const { appId, appSecret, appToken, tableId, apiDomain } = config;

  // 检查 App ID
  if (!appId || !appId.trim()) {
    throw new Error('App ID 未配置\n\n💡 请在插件设置中填写飞书应用的 App ID');
  }
  if (!appId.startsWith('cli_')) {
    throw new Error(`App ID 格式错误\n\n💡 App ID 应该以「cli_」开头\n当前值：${appId.substring(0, 20)}...`);
  }

  // 检查 App Secret
  if (!appSecret || !appSecret.trim()) {
    throw new Error('App Secret 未配置\n\n💡 请在插件设置中填写飞书应用的 App Secret');
  }
  if (appSecret.length < 20) {
    throw new Error('App Secret 格式错误\n\n💡 App Secret 太短，请检查是否完整复制');
  }

  // 检查 app_token（多维表格 token）
  if (!appToken || !appToken.trim()) {
    throw new Error('app_token（多维表格 token）未配置\n\n' +
                    '💡 app_token 是指【整个多维表格文档】的标识\n\n' +
                    '提取方法：从多维表格 URL 中复制\n' +
                    '示例 URL：https://feishu.cn/base/【这里是 app_token】?table=xxx\n\n' +
                    '⚠️ 注意：\n' +
                    '• 这是整个多维表格文档的 token\n' +
                    '• 不是单个数据表的 ID');
  }
  // app_token 通常是一串字母数字
  if (appToken.includes('/') || appToken.includes('?') || appToken.includes('&')) {
    throw new Error(`app_token 格式错误\n\n` +
                    `💡 app_token 不应包含「/」「?」「&」等字符\n` +
                    `当前值：${appToken.substring(0, 30)}...\n\n` +
                    `正确提取方法：\n` +
                    `从 URL「/base/」后面到「?」之前的部分\n\n` +
                    `示例：\n` +
                    `URL: https://feishu.cn/base/VwGhbxxxxx?table=tblyyy\n` +
                    `app_token 是: VwGhbxxxxx`);
  }

  // 检查 table_id（数据表 ID）
  if (!tableId || !tableId.trim()) {
    throw new Error('table_id（数据表 ID）未配置\n\n' +
                    '💡 table_id 是指多维表格中【当前数据表】的标识\n\n' +
                    '提取方法：从多维表格 URL 中复制\n' +
                    '示例 URL：https://feishu.cn/base/xxx?table=【这里是 table_id】\n\n' +
                    '⚠️ 注意：\n' +
                    '• 这是你要保存数据的那个具体数据表的 ID\n' +
                    '• 一个多维表格可以有多个数据表，确保选择正确的表\n' +
                    '• 数据表 ID 以「tbl」开头');
  }
  if (!tableId.startsWith('tbl')) {
    throw new Error(`table_id 格式错误\n\n` +
                    `💡 table_id 应该以「tbl」开头\n` +
                    `当前值：${tableId.substring(0, 20)}...\n\n` +
                    `正确提取方法：\n` +
                    `从 URL「?table=」后面的部分\n\n` +
                    `示例：\n` +
                    `URL: https://feishu.cn/base/VwGhbxxxxx?table=tblyyyyyyy\n` +
                    `table_id 是: tblyyyyyyy\n\n` +
                    `⚠️ 注意：确保复制的是当前要使用的数据表 ID，而不是其他数据表`);
  }

  // 检查 API 版本选择
  if (apiDomain && !['feishu', 'lark'].includes(apiDomain)) {
    throw new Error(`API 版本选择错误\n\n💡 请选择「飞书国内版」或「Lark 国际版」`);
  }

  return true;
}

// 检查飞书记录是否存在（通过标题搜索）
// V3.5.5: 修复搜索逻辑 - 飞书超链接字段的contains搜索的是显示文本，不是URL
// 改为按标题搜索，然后精确比对URL
async function findFeishuRecord(config, url, title) {
  const { apiDomain, appId, appSecret, appToken, tableId } = config;
  const domain = apiDomain || 'feishu';

  const token = await getFeishuToken(appId, appSecret, domain);

  // 使用筛选条件查找
  const baseUrl = getApiBaseUrl(domain);
  const apiUrl = `${baseUrl}/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/search`;

  // V3.5.5: 改为按标题搜索（因为超链接字段的contains搜索的是text，不是link）
  // 提取基础标题（去掉楼层后缀如 " [2楼]"）
  const baseTitle = title.replace(/\s*\[\d+楼\]$/, '');

  console.log('[Discourse Saver→飞书] 搜索标题:', baseTitle);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      filter: {
        conjunction: 'and',
        conditions: [
          {
            field_name: '标题',
            operator: 'contains',
            value: [baseTitle]
          }
        ]
      },
      page_size: 20
    })
  });

  let data;
  try {
    data = await safeParseJson(response, '搜索记录');
  } catch (e) {
    console.log('[Discourse Saver→飞书] 搜索记录失败:', e.message);
    return null;
  }

  if (data.code !== 0) {
    // 搜索API可能不可用，返回null表示未找到
    console.log('[Discourse Saver→飞书] 搜索记录失败:', data.msg);
    return null;
  }

  // V3.5.5: 在结果中精确匹配 URL，确保找到正确的记录
  if (data.data.total > 0 && data.data.items) {
    console.log('[Discourse Saver→飞书] 找到', data.data.items.length, '条可能匹配的记录');

    for (const item of data.data.items) {
      const recordLink = item.fields?.['链接'];
      // 超链接字段格式: { link: "url", text: "title" } 或直接是字符串
      const recordUrl = typeof recordLink === 'object' ? recordLink.link : recordLink;

      console.log('[Discourse Saver→飞书] 比对URL:', recordUrl, 'vs', url);

      if (recordUrl === url) {
        console.log('[Discourse Saver→飞书] 找到精确匹配的记录:', item.record_id);
        return item;
      }
    }
    console.log('[Discourse Saver→飞书] 未找到精确匹配的URL，将新建记录');
  }

  return null;
}

// 更新飞书记录（可选MD附件）
async function updateFeishuRecord(config, recordId, postData) {
  const { apiDomain, appId, appSecret, appToken, tableId, uploadAttachment } = config;
  const domain = apiDomain || 'feishu';

  const token = await getFeishuToken(appId, appSecret, domain);

  // 构建记录数据
  const fields = {
    '标题': postData.title,
    '链接': {
      link: postData.url,
      text: postData.title
    },
    '作者': postData.author,
    '保存时间': Date.now(),
    '评论数': postData.commentCount || 0
  };

  // 根据配置决定是否上传附件
  if (uploadAttachment) {
    let fileToken = null;
    try {
      fileToken = await uploadMdFile(token, appToken, postData.title, postData.content, domain);
      fields['附件'] = [{ file_token: fileToken }];
      console.log('[Discourse Saver→飞书] MD附件更新成功');
    } catch (uploadError) {
      console.warn('[Discourse Saver→飞书] MD文件上传失败，改为保存文本:', uploadError.message);
      fields['正文'] = postData.content;
    }
  } else {
    fields['正文'] = postData.content;
  }

  const record = { fields };

  const baseUrl = getApiBaseUrl(domain);
  const apiUrl = `${baseUrl}/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`;

  let response;
  try {
    response = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(record)
    });
  } catch (fetchError) {
    throw new Error(`网络连接失败\n\n💡 请检查网络连接后重试\n\n原始错误：${fetchError.message}`);
  }

  const data = await safeParseJson(response, '更新记录');

  if (data.code !== 0) {
    throw new Error(parseFeishuError(data.code, data.msg, '更新记录'));
  }

  console.log('[Discourse Saver→飞书] 更新成功');
  return data.data.record;
}

// ============================================
// Notion API 功能函数 (V4.0.1 新增)
// ============================================

// 验证 Notion 配置
function validateNotionConfig(config) {
  const errors = [];

  // 检查 Token
  if (!config.notionToken || !config.notionToken.trim()) {
    errors.push('Integration Token 不能为空');
  } else if (!config.notionToken.trim().startsWith('secret_')) {
    errors.push('Integration Token 格式错误（应以 secret_ 开头）');
  } else if (config.notionToken.trim().length < 20) {
    errors.push('Integration Token 长度不正确');
  }

  // 检查 Database ID
  if (!config.notionDatabaseId || !config.notionDatabaseId.trim()) {
    errors.push('Database ID 不能为空');
  } else {
    // 移除可能的连字符，验证是否为 32 位 hex
    const cleanId = config.notionDatabaseId.replace(/-/g, '').trim();
    if (!/^[a-f0-9]{32}$/i.test(cleanId)) {
      errors.push('Database ID 格式错误（应为 32 位十六进制字符，可含连字符）');
    }
  }

  // 检查必填属性映射
  const requiredProps = [
    { key: 'notionPropTitle', name: '标题属性名' },
    { key: 'notionPropUrl', name: '链接属性名' }
  ];

  for (const prop of requiredProps) {
    if (!config[prop.key] || !config[prop.key].trim()) {
      errors.push(`${prop.name} 不能为空`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// 格式化 Database ID（移除连字符）
function formatNotionDatabaseId(id) {
  return id.replace(/-/g, '').trim();
}

// 构建 Notion Page 数据
function buildNotionPageData(postData, config) {
  const properties = {};

  // Title (标题) - Notion 的 title 类型
  if (config.notionPropTitle) {
    properties[config.notionPropTitle] = {
      title: [{
        text: { content: (postData.title || '未命名帖子').substring(0, 2000) }
      }]
    };
  }

  // URL (链接) - Notion 的 url 类型
  if (config.notionPropUrl && postData.url) {
    properties[config.notionPropUrl] = {
      url: postData.url
    };
  }

  // Author (作者) - rich_text 类型
  if (config.notionPropAuthor && postData.author) {
    properties[config.notionPropAuthor] = {
      rich_text: [{
        text: { content: postData.author.substring(0, 2000) }
      }]
    };
  }

  // Category (分类) - rich_text 类型
  if (config.notionPropCategory && postData.category) {
    properties[config.notionPropCategory] = {
      rich_text: [{
        text: { content: postData.category.substring(0, 2000) }
      }]
    };
  }

  // Saved Date (保存日期) - date 类型
  if (config.notionPropSavedDate) {
    properties[config.notionPropSavedDate] = {
      date: {
        start: new Date().toISOString()
      }
    };
  }

  // Comment Count (评论数) - number 类型
  if (config.notionPropCommentCount && postData.commentCount !== undefined) {
    properties[config.notionPropCommentCount] = {
      number: parseInt(postData.commentCount) || 0
    };
  }

  // 构建 Page 内容 (children blocks)
  const children = [];

  // 添加内容
  // V4.0.2: 改进换行处理，确保单换行也能正确显示
  if (postData.content) {
    // 先按双换行拆分成段落块，再按单换行拆分成行
    // 这样确保所有换行都能在 Notion 中正确显示
    const paragraphs = postData.content.split('\n\n');
    let blockCount = 0;
    const maxBlocks = 100; // Notion 限制 100 个 blocks

    for (const para of paragraphs) {
      if (blockCount >= maxBlocks) break;

      // 按单换行拆分每个段落块
      const lines = para.split('\n');

      for (const line of lines) {
        if (blockCount >= maxBlocks) break;

        const trimmedLine = line.trim();
        if (!trimmedLine) continue; // 跳过空行

        // 检查是否是标题（以 # 开头）
        if (trimmedLine.startsWith('# ')) {
          children.push({
            object: 'block',
            type: 'heading_1',
            heading_1: {
              rich_text: [{
                text: { content: trimmedLine.substring(2).substring(0, 2000) }
              }]
            }
          });
        } else if (trimmedLine.startsWith('## ')) {
          children.push({
            object: 'block',
            type: 'heading_2',
            heading_2: {
              rich_text: [{
                text: { content: trimmedLine.substring(3).substring(0, 2000) }
              }]
            }
          });
        } else if (trimmedLine.startsWith('### ')) {
          children.push({
            object: 'block',
            type: 'heading_3',
            heading_3: {
              rich_text: [{
                text: { content: trimmedLine.substring(4).substring(0, 2000) }
              }]
            }
          });
        } else if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
          // V4.0.2: 支持无序列表
          children.push({
            object: 'block',
            type: 'bulleted_list_item',
            bulleted_list_item: {
              rich_text: [{
                text: { content: trimmedLine.substring(2).substring(0, 2000) }
              }]
            }
          });
        } else if (/^\d+\.\s/.test(trimmedLine)) {
          // V4.0.2: 支持有序列表
          const listContent = trimmedLine.replace(/^\d+\.\s/, '');
          children.push({
            object: 'block',
            type: 'numbered_list_item',
            numbered_list_item: {
              rich_text: [{
                text: { content: listContent.substring(0, 2000) }
              }]
            }
          });
        } else if (trimmedLine === '---' || trimmedLine === '***') {
          // V4.0.2: 支持分割线
          children.push({
            object: 'block',
            type: 'divider',
            divider: {}
          });
        } else if (/^!\[.*?\]\((https?:\/\/[^)]+)\)$/.test(trimmedLine)) {
          // V4.0.2: 支持图片 ![alt](url)
          const imgMatch = trimmedLine.match(/^!\[.*?\]\((https?:\/\/[^)]+)\)$/);
          if (imgMatch && imgMatch[1]) {
            children.push({
              object: 'block',
              type: 'image',
              image: {
                type: 'external',
                external: {
                  url: imgMatch[1]
                }
              }
            });
          }
        } else {
          // 普通段落（可能包含内联图片，转为链接显示）
          // 将内联图片 ![alt](url) 转为 [alt](url) 链接文本
          const textWithLinks = trimmedLine.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '[$1]($2)');
          children.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{
                text: { content: textWithLinks.substring(0, 2000) }
              }]
            }
          });
        }

        blockCount++;
      }
    }
  }

  return { properties, children };
}

// 保存到 Notion
async function saveToNotion(postData, config) {
  console.log('[Discourse Saver→Notion] 开始保存...');
  console.log('[Discourse Saver→Notion] 标题:', postData.title);

  // 验证配置
  const validation = validateNotionConfig(config);
  if (!validation.valid) {
    throw new Error('配置错误：\n• ' + validation.errors.join('\n• '));
  }

  const token = config.notionToken.trim();
  const databaseId = formatNotionDatabaseId(config.notionDatabaseId);

  // 构建页面数据
  const pageData = buildNotionPageData(postData, config);

  // 调用 Notion API 创建页面
  let response;
  try {
    response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': NOTION_API_VERSION,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties: pageData.properties,
        children: pageData.children
      })
    });
  } catch (fetchError) {
    throw new Error(`网络连接失败\n\n💡 请检查网络连接后重试\n\n原始错误：${fetchError.message}`);
  }

  // 处理响应
  if (!response.ok) {
    let errorData = {};
    try {
      errorData = await response.json();
    } catch (e) {
      // 忽略 JSON 解析错误
    }
    throw new Error(parseNotionError(response.status, errorData, '保存到 Notion'));
  }

  const result = await response.json();
  console.log('[Discourse Saver→Notion] 保存成功，页面ID:', result.id);

  return {
    success: true,
    pageId: result.id,
    url: result.url
  };
}

// 测试 Notion 连接
async function testNotionConnection(config) {
  console.log('[Discourse Saver→Notion] 测试连接...');

  // 验证配置
  const validation = validateNotionConfig(config);
  if (!validation.valid) {
    return {
      success: false,
      error: '配置验证失败：\n• ' + validation.errors.join('\n• ')
    };
  }

  const token = config.notionToken.trim();
  const databaseId = formatNotionDatabaseId(config.notionDatabaseId);

  // 查询 Database 信息
  let response;
  try {
    response = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': NOTION_API_VERSION
      }
    });
  } catch (fetchError) {
    return {
      success: false,
      error: `网络连接失败：${fetchError.message}`
    };
  }

  if (!response.ok) {
    let errorData = {};
    try {
      errorData = await response.json();
    } catch (e) {
      // 忽略
    }
    return {
      success: false,
      error: parseNotionError(response.status, errorData, '连接 Database')
    };
  }

  const database = await response.json();
  const dbTitle = database.title?.[0]?.plain_text || '未命名 Database';
  const dbProperties = Object.keys(database.properties);

  // V4.0.2: 严格验证属性映射（包括类型检查）
  const propMappings = [
    { configKey: 'notionPropTitle', label: '标题', required: true, expectedType: 'title' },
    { configKey: 'notionPropUrl', label: '链接', required: true, expectedType: 'url' },
    { configKey: 'notionPropAuthor', label: '作者', required: false, expectedType: 'rich_text' },
    { configKey: 'notionPropCategory', label: '分类', required: false, expectedType: ['rich_text', 'select'] },
    { configKey: 'notionPropSavedDate', label: '保存日期', required: false, expectedType: 'date' },
    { configKey: 'notionPropCommentCount', label: '评论数', required: false, expectedType: 'number' }
  ];

  const errors = [];
  const warnings = [];
  const foundProps = [];

  for (const mapping of propMappings) {
    const configValue = config[mapping.configKey];
    if (configValue && configValue.trim()) {
      const propName = configValue.trim();
      const propInfo = database.properties[propName];

      if (!propInfo) {
        // 属性不存在
        if (mapping.required) {
          errors.push(`❌ ${mapping.label}「${propName}」：Database 中不存在此属性`);
        } else {
          warnings.push(`⚠️ ${mapping.label}「${propName}」：Database 中不存在（可选，保存时将跳过）`);
        }
      } else {
        // 属性存在，检查类型
        const actualType = propInfo.type;
        const expectedTypes = Array.isArray(mapping.expectedType) ? mapping.expectedType : [mapping.expectedType];

        if (expectedTypes.includes(actualType)) {
          foundProps.push(`✓ ${mapping.label}「${propName}」→ ${actualType} 类型`);
        } else {
          const expectedTypeStr = expectedTypes.join(' 或 ');
          if (mapping.required) {
            errors.push(`❌ ${mapping.label}「${propName}」：类型错误，当前是 ${actualType}，应为 ${expectedTypeStr}`);
          } else {
            warnings.push(`⚠️ ${mapping.label}「${propName}」：类型不匹配，当前是 ${actualType}，建议使用 ${expectedTypeStr}`);
          }
        }
      }
    } else if (mapping.required) {
      errors.push(`❌ ${mapping.label}：未配置属性名`);
    }
  }

  // 构建结果消息
  const hasErrors = errors.length > 0;
  let message = '';

  if (hasErrors) {
    message = `❌ 验证失败\n\n` +
      `📋 Database: ${dbTitle}\n\n` +
      `🔴 错误（必须修复）：\n${errors.join('\n')}\n`;
    if (warnings.length > 0) {
      message += `\n🟡 警告（可选）：\n${warnings.join('\n')}\n`;
    }
    message += `\n📊 Database 现有属性：\n`;
    for (const [propName, propInfo] of Object.entries(database.properties)) {
      message += `  • ${propName}（${propInfo.type}）\n`;
    }
    message += `\n💡 提示：请确保 Database 中的属性名和类型与配置完全匹配`;
  } else {
    message = `✅ 连接成功！\n\n` +
      `📋 Database: ${dbTitle}\n\n` +
      `🟢 已验证的属性：\n${foundProps.join('\n')}\n`;
    if (warnings.length > 0) {
      message += `\n🟡 警告（不影响保存）：\n${warnings.join('\n')}\n`;
    }
    message += `\n📊 Database 所有属性：\n`;
    for (const [propName, propInfo] of Object.entries(database.properties)) {
      message += `  • ${propName}（${propInfo.type}）\n`;
    }
  }

  return {
    success: !hasErrors,
    databaseName: dbTitle,
    properties: dbProperties,
    foundMappings: foundProps,
    errors: errors,
    warnings: warnings,
    message: message
  };
}

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // V3.6.0: 处理动态脚本注入请求（来自 detector.js）
  if (request.action === 'injectContentScript') {
    console.log('[Discourse Saver] 收到脚本注入请求，URL:', request.tabUrl);

    (async () => {
      try {
        const tabId = sender.tab?.id;
        if (!tabId) {
          console.error('[Discourse Saver] 无法获取标签页ID');
          sendResponse({ success: false, error: '无法获取标签页ID' });
          return;
        }

        // 检查是否已经注入过（防止重复注入）
        try {
          const result = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => window.__discourseSaverInjected
          });

          if (result[0]?.result === true) {
            console.log('[Discourse Saver] 脚本已注入，跳过');
            sendResponse({ success: true, skipped: true });
            return;
          }
        } catch (checkError) {
          // 忽略检查错误，继续注入
          console.log('[Discourse Saver] 检查注入状态失败，继续注入');
        }

        // 注入 turndown 库
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['lib/turndown.min.js']
        });
        console.log('[Discourse Saver] turndown.min.js 注入成功');

        // 注入主脚本
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        });
        console.log('[Discourse Saver] content.js 注入成功');

        // 标记已注入
        await chrome.scripting.executeScript({
          target: { tabId },
          func: () => { window.__discourseSaverInjected = true; }
        });

        sendResponse({ success: true });
      } catch (error) {
        console.error('[Discourse Saver] 脚本注入失败:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true; // 异步响应
  }

  if (request.action === 'saveToFeishu') {
    console.log('[Discourse Saver→飞书] 收到保存请求');
    console.log('[Discourse Saver→飞书] 标题:', request.postData.title);
    console.log('[Discourse Saver→飞书] URL:', request.postData.url);

    (async () => {
      try {
        const { config, postData } = request;

        // V3.5.5: 传入标题用于搜索（因为飞书超链接字段的contains不搜索URL）
        const existingRecord = await findFeishuRecord(config, postData.url, postData.title);

        let result;
        if (existingRecord) {
          // 更新现有记录
          console.log('[Discourse Saver→飞书] 找到现有记录，更新中...');
          result = await updateFeishuRecord(config, existingRecord.record_id, postData);
          sendResponse({ success: true, action: 'updated', record: result });
        } else {
          // 新增记录
          result = await saveToFeishu(config, postData);
          sendResponse({ success: true, action: 'created', record: result });
        }
      } catch (error) {
        console.error('[Discourse Saver→飞书] 保存失败:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    // 返回true表示异步响应
    return true;
  }

  if (request.action === 'testFeishuConnection') {
    console.log('[Discourse Saver→飞书] 测试连接');

    (async () => {
      try {
        const { apiDomain, appId, appSecret, appToken, tableId } = request.config;
        const domain = apiDomain || 'feishu';
        const baseUrl = getApiBaseUrl(domain);

        // 步骤0: 验证配置参数格式
        console.log('[Discourse Saver→飞书] 步骤0: 验证配置参数...');
        try {
          validateFeishuConfig(request.config);
        } catch (validationError) {
          sendResponse({ success: false, error: validationError.message });
          return;
        }

        // 步骤1: 测试获取 token
        console.log('[Discourse Saver→飞书] 步骤1: 获取 token...');
        const token = await getFeishuToken(appId, appSecret, domain);
        console.log('[Discourse Saver→飞书] Token 获取成功');

        // 步骤2: 获取表格字段列表
        console.log('[Discourse Saver→飞书] 步骤2: 获取表格字段列表...');
        const fieldsUrl = `${baseUrl}/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/fields`;
        console.log('[Discourse Saver→飞书] 字段列表 API URL:', fieldsUrl);

        let fieldsResponse;
        try {
          fieldsResponse = await fetch(fieldsUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
        } catch (fetchError) {
          throw new Error(`网络连接失败\n\n💡 可能原因：\n• 无法访问飞书服务器\n• 网络连接不稳定\n\n原始错误：${fetchError.message}`);
        }

        const fieldsData = await safeParseJson(fieldsResponse, '获取字段列表');

        if (fieldsData.code !== 0) {
          throw new Error(parseFeishuError(fieldsData.code, fieldsData.msg, '获取字段列表'));
        }

        // 步骤3: 验证字段
        console.log('[Discourse Saver→飞书] 步骤3: 验证字段配置...');
        const fields = fieldsData.data?.items || [];

        // 飞书字段类型映射
        const FIELD_TYPES = {
          TEXT: 1,        // 文本
          NUMBER: 2,      // 数字
          DATE: 5,        // 日期
          URL: 15,        // 超链接
          ATTACHMENT: 17  // 附件
        };

        // 必需字段配置
        const REQUIRED_FIELDS = [
          { name: '标题', type: FIELD_TYPES.TEXT, desc: '文本' },
          { name: '链接', type: FIELD_TYPES.URL, desc: '超链接' },
          { name: '作者', type: FIELD_TYPES.TEXT, desc: '文本' },
          { name: '保存时间', type: FIELD_TYPES.DATE, desc: '日期' },
          { name: '评论数', type: FIELD_TYPES.NUMBER, desc: '数字' },
          { name: '附件', type: FIELD_TYPES.ATTACHMENT, desc: '附件' },
          { name: '正文', type: FIELD_TYPES.TEXT, desc: '文本' }
        ];

        // 构建字段映射
        const fieldMap = {};
        fields.forEach(field => {
          fieldMap[field.field_name] = {
            type: field.type,
            typeName: getFieldTypeName(field.type)
          };
        });

        // 验证字段
        const missingFields = [];
        const wrongTypeFields = [];

        REQUIRED_FIELDS.forEach(required => {
          const existing = fieldMap[required.name];

          if (!existing) {
            // 字段不存在
            missingFields.push(`「${required.name}」(类型: ${required.desc})`);
          } else if (existing.type !== required.type) {
            // 字段类型不匹配
            wrongTypeFields.push(
              `「${required.name}」(期望: ${required.desc}, 实际: ${existing.typeName})`
            );
          }
        });

        // 如果有错误，返回详细提示
        if (missingFields.length > 0 || wrongTypeFields.length > 0) {
          let errorMsg = '字段配置有误：\n\n';

          if (missingFields.length > 0) {
            errorMsg += `❌ 缺失字段（${missingFields.length}个）：\n`;
            errorMsg += missingFields.map(f => `  • ${f}`).join('\n');
            errorMsg += '\n\n';
          }

          if (wrongTypeFields.length > 0) {
            errorMsg += `⚠️ 字段类型错误（${wrongTypeFields.length}个）：\n`;
            errorMsg += wrongTypeFields.map(f => `  • ${f}`).join('\n');
            errorMsg += '\n\n';
          }

          errorMsg += '请在飞书多维表格中创建或修正这些字段。\n';
          errorMsg += '详细要求请参考 README.md 的「飞书配置教程」。';

          throw new Error(errorMsg);
        }

        // 步骤4: 测试访问记录
        console.log('[Discourse Saver→飞书] 步骤4: 测试访问表格记录...');
        const recordsUrl = `${baseUrl}/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=1`;

        let recordsResponse;
        try {
          recordsResponse = await fetch(recordsUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
        } catch (fetchError) {
          throw new Error(`网络连接失败\n\n💡 请检查网络连接后重试\n\n原始错误：${fetchError.message}`);
        }

        const recordsData = await safeParseJson(recordsResponse, '访问表格记录');

        if (recordsData.code !== 0) {
          throw new Error(parseFeishuError(recordsData.code, recordsData.msg, '访问表格记录'));
        }

        const recordCount = recordsData.data?.total || 0;
        const domainName = domain === 'lark' ? 'Lark 国际版' : '飞书国内版';

        // 显示检测到的字段列表
        const detectedFields = fields.map(f => f.field_name).join('、');
        const requiredFieldNames = REQUIRED_FIELDS.map(f => f.name).join('、');

        sendResponse({
          success: true,
          message: `✅ 连接成功！\n\n` +
                   `📋 配置验证通过：\n` +
                   `  • API 版本：${domainName}\n` +
                   `  • 应用认证：通过\n` +
                   `  • 表格访问：正常\n` +
                   `  • 现有记录：${recordCount} 条\n\n` +
                   `📝 字段验证通过（7个必需字段）：\n` +
                   `  ${requiredFieldNames}\n\n` +
                   `📊 当前数据表的所有字段：\n` +
                   `  ${detectedFields}`
        });
      } catch (error) {
        console.error('[Discourse Saver→飞书] 测试连接失败:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // ============================================
  // Notion 消息处理 (V4.0.1 新增)
  // ============================================

  // 保存到 Notion
  if (request.action === 'saveToNotion') {
    console.log('[Discourse Saver→Notion] 收到保存请求');

    (async () => {
      try {
        const { config, postData } = request;
        const result = await saveToNotion(postData, config);
        sendResponse(result);
      } catch (error) {
        console.error('[Discourse Saver→Notion] 保存失败:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }

  // 测试 Notion 连接
  if (request.action === 'testNotionConnection') {
    console.log('[Discourse Saver→Notion] 收到测试连接请求');

    (async () => {
      try {
        const result = await testNotionConnection(request.config);
        sendResponse(result);
      } catch (error) {
        console.error('[Discourse Saver→Notion] 测试连接失败:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }
});

// 辅助函数：获取字段类型名称
function getFieldTypeName(typeCode) {
  const typeNames = {
    1: '文本',
    2: '数字',
    3: '单选',
    4: '多选',
    5: '日期',
    7: '复选框',
    11: '人员',
    13: '电话号码',
    15: '超链接',
    17: '附件',
    18: '单向关联',
    21: '查找引用',
    22: '公式',
    23: '双向关联'
  };
  return typeNames[typeCode] || `未知类型(${typeCode})`;
}

console.log('[Discourse Saver] Background script 已加载 (V4.0.2)');
