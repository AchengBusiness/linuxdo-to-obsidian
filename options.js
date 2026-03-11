// LinuxDo Saver V3.5 - 设置页面
// 支持 Obsidian 和飞书多维表格

// 默认配置
const DEFAULT_CONFIG = {
  // 插件总开关
  pluginEnabled: true,

  // 保存目标
  saveToObsidian: true,
  saveToFeishu: false,

  // Obsidian 设置
  vaultName: '',
  folderPath: 'LinuxDo收集箱',
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

  // 评论设置
  saveComments: false,
  commentCount: 100,
  foldComments: false
};

// 加载配置
function loadOptions() {
  chrome.storage.sync.get(DEFAULT_CONFIG, (config) => {
    // 插件开关
    document.getElementById('pluginEnabled').checked = config.pluginEnabled;

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

    // 评论设置
    document.getElementById('saveComments').checked = config.saveComments;
    document.getElementById('commentCount').value = config.commentCount;
    document.getElementById('foldComments').checked = config.foldComments;

    // 更新UI状态
    updateObsidianSectionVisibility(config.saveToObsidian);
    updateFeishuOptionsVisibility(config.saveToFeishu);
    updateCommentOptionsVisibility(config.saveComments);
  });
}

// 更新 Obsidian 区域可见性
function updateObsidianSectionVisibility(enabled) {
  const section = document.getElementById('obsidianSection');
  if (section) {
    section.style.opacity = enabled ? '1' : '0.5';
    section.style.pointerEvents = enabled ? 'auto' : 'none';
  }
}

// 更新飞书选项可见性
function updateFeishuOptionsVisibility(enabled) {
  const feishuOptions = document.getElementById('feishuOptions');
  if (feishuOptions) {
    if (enabled) {
      feishuOptions.classList.remove('disabled');
    } else {
      feishuOptions.classList.add('disabled');
    }
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

  // 移除文件夹路径首尾斜杠
  document.getElementById('folderPath').addEventListener('input', (e) => {
    let value = e.target.value.trim();
    value = value.replace(/^\/+|\/+$/g, '');
    if (e.target.value !== value) {
      e.target.value = value;
    }
  });
});
