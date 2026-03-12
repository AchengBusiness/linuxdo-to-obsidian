// Discourse Saver V3.6.0 - 设置页面
// 支持 Obsidian 和飞书多维表格
// V3.6.0: 支持所有 Discourse 论坛 + 自定义站点管理 + 可折叠面板

// 默认配置
const DEFAULT_CONFIG = {
  // 插件总开关
  pluginEnabled: true,

  // 自定义站点列表 (V3.6.0)
  customSites: [],

  // 保存目标
  saveToObsidian: true,
  saveToFeishu: false,

  // Obsidian 设置
  vaultName: '',
  folderPath: 'Discourse收集箱',
  useAdvancedUri: true,

  // 飞书设置
  feishuApiDomain: 'feishu', // 'feishu' 或 'lark'
  feishuAppId: '',
  feishuAppSecret: '',
  feishuAppToken: '',
  feishuTableId: '',
  feishuUploadAttachment: false,

  // 内容设置
  addMetadata: true,
  includeImages: true,

  // 图片嵌入设置 (V3.6.0)
  embedImages: false,
  imageMaxWidth: 1920,
  imageQuality: 0.9,
  imageSkipGif: true,

  // 评论设置
  saveComments: false,
  commentCount: 100,
  foldComments: false
};

// 折叠/展开面板
function toggleSection(sectionId) {
  const content = document.getElementById('content-' + sectionId);
  const icon = document.getElementById('icon-' + sectionId);

  if (content && icon) {
    content.classList.toggle('expanded');
    icon.classList.toggle('expanded');
  }
}

// 展开所有面板
function expandAllSections() {
  const sections = ['pluginStatus', 'siteSettings', 'saveTarget', 'obsidianSettings', 'feishuSettings', 'contentSettings', 'commentSettings'];
  sections.forEach(sectionId => {
    const content = document.getElementById('content-' + sectionId);
    const icon = document.getElementById('icon-' + sectionId);
    if (content && icon) {
      content.classList.add('expanded');
      icon.classList.add('expanded');
    }
  });
}

// 渲染自定义站点列表
function renderCustomSites(sites) {
  const container = document.getElementById('customSitesList');
  container.innerHTML = '';

  if (!sites || sites.length === 0) {
    return;
  }

  sites.forEach((site, index) => {
    const item = document.createElement('div');
    item.className = 'site-item';
    item.innerHTML = `
      <span class="site-url">${escapeHtml(site)}</span>
      <button type="button" class="remove-btn" data-index="${index}">删除</button>
    `;
    container.appendChild(item);
  });

  // 添加删除事件监听
  container.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index);
      removeSite(index);
    });
  });
}

// HTML 转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 添加站点
function addSite() {
  const input = document.getElementById('newSiteInput');
  let site = input.value.trim();

  if (!site) {
    showStatus('请输入站点域名', 'error');
    return;
  }

  // 清理输入，提取域名
  site = site.replace(/^https?:\/\//, '').replace(/\/.*$/, '').toLowerCase();

  // 验证域名格式
  if (!/^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i.test(site)) {
    showStatus('域名格式不正确', 'error');
    return;
  }

  chrome.storage.sync.get({ customSites: [] }, (config) => {
    const sites = config.customSites || [];

    // 检查是否已存在
    if (sites.includes(site)) {
      showStatus('该站点已存在', 'error');
      return;
    }

    sites.push(site);

    chrome.storage.sync.set({ customSites: sites }, () => {
      if (chrome.runtime.lastError) {
        showStatus('添加失败: ' + chrome.runtime.lastError.message, 'error');
        return;
      }
      input.value = '';
      renderCustomSites(sites);
      showStatus('站点已添加', 'success');
    });
  });
}

// 删除站点
function removeSite(index) {
  chrome.storage.sync.get({ customSites: [] }, (config) => {
    const sites = config.customSites || [];

    if (index >= 0 && index < sites.length) {
      sites.splice(index, 1);

      chrome.storage.sync.set({ customSites: sites }, () => {
        if (chrome.runtime.lastError) {
          showStatus('删除失败: ' + chrome.runtime.lastError.message, 'error');
          return;
        }
        renderCustomSites(sites);
        showStatus('站点已删除', 'success');
      });
    }
  });
}

// 加载配置
function loadOptions() {
  chrome.storage.sync.get(DEFAULT_CONFIG, (config) => {
    // 插件开关
    document.getElementById('pluginEnabled').checked = config.pluginEnabled;

    // 自定义站点 (V3.6.0)
    renderCustomSites(config.customSites || []);

    // 保存目标
    document.getElementById('saveToObsidian').checked = config.saveToObsidian;
    document.getElementById('saveToFeishu').checked = config.saveToFeishu;

    // Obsidian 设置
    document.getElementById('vaultName').value = config.vaultName;
    document.getElementById('folderPath').value = config.folderPath;
    document.getElementById('useAdvancedUri').checked = config.useAdvancedUri;

    // 飞书设置
    document.getElementById('feishuApiDomain').value = config.feishuApiDomain || 'feishu';
    document.getElementById('feishuAppId').value = config.feishuAppId;
    document.getElementById('feishuAppSecret').value = config.feishuAppSecret;
    document.getElementById('feishuAppToken').value = config.feishuAppToken;
    document.getElementById('feishuTableId').value = config.feishuTableId;
    document.getElementById('feishuUploadAttachment').checked = config.feishuUploadAttachment;

    // 内容设置
    document.getElementById('addMetadata').checked = config.addMetadata;
    document.getElementById('includeImages').checked = config.includeImages;

    // 图片嵌入设置 (V3.6.0)
    document.getElementById('embedImages').checked = config.embedImages;
    document.getElementById('imageMaxWidth').value = config.imageMaxWidth;
    document.getElementById('imageQuality').value = config.imageQuality;
    document.getElementById('imageSkipGif').checked = config.imageSkipGif;

    // 评论设置
    document.getElementById('saveComments').checked = config.saveComments;
    document.getElementById('commentCount').value = config.commentCount;
    document.getElementById('foldComments').checked = config.foldComments;

    // 更新UI状态
    updateObsidianSectionVisibility(config.saveToObsidian);
    updateFeishuOptionsVisibility(config.saveToFeishu);
    updateCommentOptionsVisibility(config.saveComments);
    updateImageSettingsVisibility(config.embedImages);

    // 确保所有面板默认展开
    expandAllSections();
  });
}

// 更新 Obsidian 区域可见性
function updateObsidianSectionVisibility(enabled) {
  const section = document.getElementById('obsidianSection');
  if (section) {
    section.style.opacity = enabled ? '1' : '0.5';
    const content = section.querySelector('.section-content');
    if (content) {
      content.style.pointerEvents = enabled ? 'auto' : 'none';
    }
  }
}

// 更新飞书选项可见性
function updateFeishuOptionsVisibility(enabled) {
  const feishuOptions = document.getElementById('feishuOptions');
  if (feishuOptions) {
    feishuOptions.style.opacity = enabled ? '1' : '0.5';
    feishuOptions.style.pointerEvents = enabled ? 'auto' : 'none';
  }
}

// 更新评论选项可见性
function updateCommentOptionsVisibility(enabled) {
  const commentOptions = document.getElementById('commentOptions');
  if (commentOptions) {
    if (enabled) {
      commentOptions.classList.remove('disabled');
    } else {
      commentOptions.classList.add('disabled');
    }
  }
}

// 更新图片设置面板可见性 (V3.6.0)
function updateImageSettingsVisibility(enabled) {
  const panel = document.getElementById('imageSettingsPanel');
  if (panel) {
    if (enabled) {
      panel.classList.remove('disabled');
    } else {
      panel.classList.add('disabled');
    }
  }
}

// 保存配置
function saveOptions(e) {
  e.preventDefault();

  const commentCount = Math.min(
    Math.max(1, parseInt(document.getElementById('commentCount').value) || 100),
    3000
  );

  const config = {
    // 插件开关
    pluginEnabled: document.getElementById('pluginEnabled').checked,

    // 保存目标
    saveToObsidian: document.getElementById('saveToObsidian').checked,
    saveToFeishu: document.getElementById('saveToFeishu').checked,

    // Obsidian 设置
    vaultName: document.getElementById('vaultName').value.trim(),
    folderPath: document.getElementById('folderPath').value.trim(),
    useAdvancedUri: document.getElementById('useAdvancedUri').checked,

    // 飞书设置
    feishuApiDomain: document.getElementById('feishuApiDomain').value,
    feishuAppId: document.getElementById('feishuAppId').value.trim(),
    feishuAppSecret: document.getElementById('feishuAppSecret').value.trim(),
    feishuAppToken: document.getElementById('feishuAppToken').value.trim(),
    feishuTableId: document.getElementById('feishuTableId').value.trim(),
    feishuUploadAttachment: document.getElementById('feishuUploadAttachment').checked,

    // 内容设置
    addMetadata: document.getElementById('addMetadata').checked,
    includeImages: document.getElementById('includeImages').checked,

    // 图片嵌入设置 (V3.6.0)
    embedImages: document.getElementById('embedImages').checked,
    imageMaxWidth: parseInt(document.getElementById('imageMaxWidth').value) || 1920,
    imageQuality: parseFloat(document.getElementById('imageQuality').value) || 0.9,
    imageSkipGif: document.getElementById('imageSkipGif').checked,

    // 评论设置
    saveComments: document.getElementById('saveComments').checked,
    commentCount: commentCount,
    foldComments: document.getElementById('foldComments').checked
  };

  // 验证：插件启用时至少选择一个保存目标
  if (config.pluginEnabled && !config.saveToObsidian && !config.saveToFeishu) {
    showStatus('请至少选择一个保存目标', 'error');
    return;
  }

  // 验证：如果启用飞书，检查必填项
  if (config.saveToFeishu) {
    if (!config.feishuAppId || !config.feishuAppSecret || !config.feishuAppToken || !config.feishuTableId) {
      showStatus('请填写完整的飞书配置信息', 'error');
      return;
    }
  }

  // V3.6.0: 验证图片嵌入需要 Advanced URI
  if (config.embedImages && config.saveToObsidian && !config.useAdvancedUri) {
    // 自动启用 Advanced URI
    config.useAdvancedUri = true;
    document.getElementById('useAdvancedUri').checked = true;
    showStatus('已自动启用 Advanced URI（图片嵌入必需）', 'info');
  }

  chrome.storage.sync.set(config, () => {
    if (chrome.runtime.lastError) {
      showStatus('保存失败: ' + chrome.runtime.lastError.message, 'error');
      return;
    }
    showStatus('设置已保存', 'success');
  });
}

// 恢复默认
function resetOptions() {
  if (confirm('确定恢复默认设置？飞书配置也会被清空。')) {
    chrome.storage.sync.set(DEFAULT_CONFIG, () => {
      loadOptions();
      showStatus('已恢复默认设置', 'success');
    });
  }
}

// 测试飞书连接
async function testFeishuConnection() {
  const btn = document.getElementById('testFeishuBtn');
  const originalText = btn.textContent;

  btn.textContent = '测试中...';
  btn.disabled = true;

  const config = {
    apiDomain: document.getElementById('feishuApiDomain').value,
    appId: document.getElementById('feishuAppId').value.trim(),
    appSecret: document.getElementById('feishuAppSecret').value.trim(),
    appToken: document.getElementById('feishuAppToken').value.trim(),
    tableId: document.getElementById('feishuTableId').value.trim()
  };

  // 验证必填项
  if (!config.appId || !config.appSecret || !config.appToken || !config.tableId) {
    showStatus('请先填写完整的飞书配置', 'error');
    btn.textContent = originalText;
    btn.disabled = false;
    return;
  }

  try {
    // 发送消息给 background script 测试连接
    chrome.runtime.sendMessage(
      { action: 'testFeishuConnection', config },
      (response) => {
        btn.textContent = originalText;
        btn.disabled = false;

        if (chrome.runtime.lastError) {
          showStatus('测试失败: ' + chrome.runtime.lastError.message, 'error');
          return;
        }

        if (response.success) {
          showStatus(response.message, 'success');
        } else {
          showStatus('连接失败: ' + response.error, 'error');
        }
      }
    );
  } catch (error) {
    btn.textContent = originalText;
    btn.disabled = false;
    showStatus('测试失败: ' + error.message, 'error');
  }
}

// 显示状态
function showStatus(message, type) {
  const statusElement = document.getElementById('statusMessage');
  statusElement.textContent = message;
  statusElement.className = `status-message ${type} show`;

  setTimeout(() => {
    statusElement.classList.remove('show');
  }, 3000);
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  loadOptions();

  // 表单提交
  document.getElementById('optionsForm').addEventListener('submit', saveOptions);

  // 恢复默认
  document.getElementById('resetBtn').addEventListener('click', resetOptions);

  // 测试飞书连接
  document.getElementById('testFeishuBtn').addEventListener('click', testFeishuConnection);

  // 添加自定义站点 (V3.6.0)
  document.getElementById('addSiteBtn').addEventListener('click', addSite);

  // 回车添加站点
  document.getElementById('newSiteInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addSite();
    }
  });

  // 保存目标复选框变化
  document.getElementById('saveToObsidian').addEventListener('change', (e) => {
    updateObsidianSectionVisibility(e.target.checked);
  });

  document.getElementById('saveToFeishu').addEventListener('change', (e) => {
    updateFeishuOptionsVisibility(e.target.checked);
  });

  // 保存评论复选框控制子选项
  document.getElementById('saveComments').addEventListener('change', (e) => {
    updateCommentOptionsVisibility(e.target.checked);
  });

  // 图片嵌入设置 (V3.6.0)
  document.getElementById('embedImages').addEventListener('change', (e) => {
    updateImageSettingsVisibility(e.target.checked);

    // 启用图片嵌入时，自动启用 Advanced URI（必需）
    if (e.target.checked) {
      const advancedUriCheckbox = document.getElementById('useAdvancedUri');
      if (advancedUriCheckbox && !advancedUriCheckbox.checked) {
        advancedUriCheckbox.checked = true;
        showStatus('已自动启用 Advanced URI（图片嵌入必需）', 'info');
      }
    }
  });

  // 移除文件夹路径首尾斜杠
  document.getElementById('folderPath').addEventListener('input', (e) => {
    let value = e.target.value.trim();
    value = value.replace(/^\/+|\/+$/g, '');
    if (e.target.value !== value) {
      e.target.value = value;
    }
  });
});

// 将 toggleSection 暴露到全局作用域（供 onclick 使用）
window.toggleSection = toggleSection;
