// LinuxDo to Obsidian - Background Script V3.5.4
// 处理飞书API请求（解决CORS问题）
// V3.5: 支持上传MD文件作为附件
// V3.5.2: 支持飞书国内版和Lark国际版
// V3.5.3: 配合 content.js 支持评论书签功能
// V3.5.4: 版本同步

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

// 安全解析 JSON 响应
async function safeParseJson(response, context) {
  const text = await response.text();

  // 检查是否为空
  if (!text || text.trim() === '') {
    throw new Error(`${context}: 服务器返回空响应`);
  }

  // 检查 HTTP 状态
  if (!response.ok) {
    throw new Error(`${context}: HTTP ${response.status} - ${text.substring(0, 200)}`);
  }

  // 尝试解析 JSON
  try {
    return JSON.parse(text);
  } catch (e) {
    // 如果是 HTML，提取有用信息
    if (text.includes('<!DOCTYPE') || text.includes('<html')) {
      throw new Error(`${context}: 服务器返回HTML页面，可能是网络问题或API地址错误`);
    }
    throw new Error(`${context}: JSON解析失败 - ${text.substring(0, 100)}`);
  }
}

// 获取飞书 tenant_access_token
async function getFeishuToken(appId, appSecret, apiDomain = 'feishu') {
  const cache = feishuTokenCache[apiDomain] || feishuTokenCache.feishu;

  // 检查缓存是否有效（提前5分钟过期）
  if (cache.token && Date.now() < cache.expireTime - 300000) {
    console.log('[LinuxDo→飞书] 使用缓存的token');
    return cache.token;
  }

  const baseUrl = getApiBaseUrl(apiDomain);
  console.log('[LinuxDo→飞书] 获取新的tenant_access_token，API域名:', baseUrl);

  const response = await fetch(`${baseUrl}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret
    })
  });

  const data = await safeParseJson(response, '获取token');

  if (data.code !== 0) {
    throw new Error(`获取飞书token失败: ${data.msg}`);
  }

  // 缓存token（有效期2小时）
  if (!feishuTokenCache[apiDomain]) {
    feishuTokenCache[apiDomain] = {};
  }
  feishuTokenCache[apiDomain].token = data.tenant_access_token;
  feishuTokenCache[apiDomain].expireTime = Date.now() + (data.expire * 1000);

  console.log('[LinuxDo→飞书] 获取token成功');
  return data.tenant_access_token;
}

// V3.5: 上传MD文件到飞书素材库
async function uploadMdFile(token, appToken, title, mdContent, apiDomain = 'feishu') {
  console.log('[LinuxDo→飞书] 开始上传MD文件...');

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
    console.error('[LinuxDo→飞书] 上传文件失败:', data);
    throw new Error(`上传文件失败: ${data.msg}`);
  }

  console.log('[LinuxDo→飞书] 文件上传成功，file_token:', data.data.file_token);
  return data.data.file_token;
}

// 保存到飞书多维表格（可选MD附件）
async function saveToFeishu(config, postData) {
  const { apiDomain, appId, appSecret, appToken, tableId, uploadAttachment } = config;
  const domain = apiDomain || 'feishu';

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
      console.log('[LinuxDo→飞书] MD附件上传成功');
    } catch (uploadError) {
      console.warn('[LinuxDo→飞书] MD文件上传失败，改为保存文本:', uploadError.message);
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

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(record)
  });

  const data = await safeParseJson(response, '保存记录');

  if (data.code !== 0) {
    throw new Error(`保存到飞书失败: ${data.msg}`);
  }

  console.log('[LinuxDo→飞书] 保存成功，record_id:', data.data.record.record_id);
  return data.data.record;
}

// 检查飞书记录是否存在（通过URL查找）
// V3.5.4: 改进匹配逻辑，先用 contains 搜索，再精确比对 URL
async function findFeishuRecord(config, url) {
  const { apiDomain, appId, appSecret, appToken, tableId } = config;
  const domain = apiDomain || 'feishu';

  const token = await getFeishuToken(appId, appSecret, domain);

  // 使用筛选条件查找
  const baseUrl = getApiBaseUrl(domain);
  const apiUrl = `${baseUrl}/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/search`;

  // 先用 contains 搜索可能匹配的记录（最多10条）
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
            field_name: '链接',
            operator: 'contains',
            value: [url]
          }
        ]
      },
      page_size: 10
    })
  });

  let data;
  try {
    data = await safeParseJson(response, '搜索记录');
  } catch (e) {
    console.log('[LinuxDo→飞书] 搜索记录失败:', e.message);
    return null;
  }

  if (data.code !== 0) {
    // 搜索API可能不可用，返回null表示未找到
    console.log('[LinuxDo→飞书] 搜索记录失败:', data.msg);
    return null;
  }

  // V3.5.4: 在结果中精确匹配 URL，避免 /t/xxx/123 误匹配 /t/xxx/123/2
  if (data.data.total > 0 && data.data.items) {
    for (const item of data.data.items) {
      const recordLink = item.fields?.['链接'];
      // 超链接字段格式: { link: "url", text: "title" } 或直接是字符串
      const recordUrl = typeof recordLink === 'object' ? recordLink.link : recordLink;

      if (recordUrl === url) {
        console.log('[LinuxDo→飞书] 找到精确匹配的记录:', item.record_id);
        return item;
      }
    }
    console.log('[LinuxDo→飞书] 未找到精确匹配的URL，将新建记录');
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
      console.log('[LinuxDo→飞书] MD附件更新成功');
    } catch (uploadError) {
      console.warn('[LinuxDo→飞书] MD文件上传失败，改为保存文本:', uploadError.message);
      fields['正文'] = postData.content;
    }
  } else {
    fields['正文'] = postData.content;
  }

  const record = { fields };

  const baseUrl = getApiBaseUrl(domain);
  const apiUrl = `${baseUrl}/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`;

  const response = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(record)
  });

  const data = await safeParseJson(response, '更新记录');

  if (data.code !== 0) {
    throw new Error(`更新飞书记录失败: ${data.msg}`);
  }

  console.log('[LinuxDo→飞书] 更新成功');
  return data.data.record;
}

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveToFeishu') {
    console.log('[LinuxDo→飞书] 收到保存请求');

    (async () => {
      try {
        const { config, postData } = request;

        // 先尝试查找是否已存在
        const existingRecord = await findFeishuRecord(config, postData.url);

        let result;
        if (existingRecord) {
          // 更新现有记录
          console.log('[LinuxDo→飞书] 找到现有记录，更新中...');
          result = await updateFeishuRecord(config, existingRecord.record_id, postData);
          sendResponse({ success: true, action: 'updated', record: result });
        } else {
          // 新增记录
          result = await saveToFeishu(config, postData);
          sendResponse({ success: true, action: 'created', record: result });
        }
      } catch (error) {
        console.error('[LinuxDo→飞书] 保存失败:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    // 返回true表示异步响应
    return true;
  }

  if (request.action === 'testFeishuConnection') {
    console.log('[LinuxDo→飞书] 测试连接');

    (async () => {
      try {
        const { apiDomain, appId, appSecret, appToken, tableId } = request.config;
        const domain = apiDomain || 'feishu';
        const baseUrl = getApiBaseUrl(domain);

        // 步骤1: 测试获取 token
        console.log('[LinuxDo→飞书] 步骤1: 获取 token...');
        const token = await getFeishuToken(appId, appSecret, domain);
        console.log('[LinuxDo→飞书] Token 获取成功');

        // 步骤2: 测试列出记录（比获取表格信息更可靠）
        console.log('[LinuxDo→飞书] 步骤2: 测试访问表格...');
        const apiUrl = `${baseUrl}/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records?page_size=1`;
        console.log('[LinuxDo→飞书] 测试 API URL:', apiUrl);

        const response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        const data = await safeParseJson(response, '访问表格');

        if (data.code !== 0) {
          // 如果是权限问题，给出更友好的提示
          if (data.code === 1254043 || data.msg?.includes('permission')) {
            throw new Error(`权限不足，请确保应用已添加 bitable:app 权限，且已将应用添加为多维表格协作者`);
          }
          throw new Error(`访问表格失败: ${data.msg} (错误码: ${data.code})`);
        }

        const recordCount = data.data?.total || 0;
        sendResponse({
          success: true,
          message: `连接成功！表格中有 ${recordCount} 条记录`
        });
      } catch (error) {
        console.error('[LinuxDo→飞书] 测试连接失败:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true;
  }
});

console.log('[LinuxDo→Obsidian] Background script 已加载 (V3.5.4)');
