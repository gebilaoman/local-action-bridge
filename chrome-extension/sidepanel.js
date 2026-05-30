import logger from './utils/logger.js';

const DEFAULT_SETTINGS = {
  targetWindowTitle: '',
  genericActions: {
    click_center: [
      { type: 'click', coordinate_mode: 'window', x: 400, y: 300 }
    ]
  }
};

let isConnected = false;
let operationSettings = { ...DEFAULT_SETTINGS };

const targetWindowTitleInput = document.getElementById('targetWindowTitle');
const actionKeyInput = document.getElementById('actionKey');
const actionStepsInput = document.getElementById('actionSteps');
const savedActionSelect = document.getElementById('savedActionSelect');
const connectBtn = document.getElementById('connectBtn');
const clearCacheBtn = document.getElementById('clearCacheBtn');
const saveActionBtn = document.getElementById('saveActionBtn');
const executeActionBtn = document.getElementById('executeActionBtn');
const clearLogBtn = document.getElementById('clearLogBtn');
const exportLogBtn = document.getElementById('exportLogBtn');

function mergeSettings(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    genericActions: {
      ...DEFAULT_SETTINGS.genericActions,
      ...(settings.genericActions || {})
    }
  };
}

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

function parseSteps() {
  const parsed = JSON.parse(actionStepsInput.value);
  if (!Array.isArray(parsed)) {
    throw new Error('动作步骤必须是数组');
  }
  return parsed;
}

function refreshActionOptions() {
  const actionKeys = Object.keys(operationSettings.genericActions || {});
  savedActionSelect.innerHTML = '';

  actionKeys.forEach((actionKey) => {
    const option = document.createElement('option');
    option.value = actionKey;
    option.textContent = actionKey;
    savedActionSelect.appendChild(option);
  });

  const currentKey = actionKeyInput.value || actionKeys[0] || '';
  if (currentKey) {
    savedActionSelect.value = currentKey;
    actionKeyInput.value = currentKey;
    actionStepsInput.value = formatJson(operationSettings.genericActions[currentKey] || []);
  }
}

function saveSettings(callback = null) {
  chrome.runtime.sendMessage({
    action: 'update_settings',
    settings: operationSettings
  }, (response) => {
    if (!response?.success) {
      logger.error(`保存配置失败: ${response?.error || 'unknown error'}`);
      return;
    }
    if (callback) {
      callback();
    }
  });
}

function updateConnectionStatus(status, error = null, windowInfo = null) {
  const indicator = document.getElementById('connectionIndicator');
  const statusText = document.getElementById('connectionStatus');
  const windowDetails = document.getElementById('windowDetails');

  indicator.classList.remove('connected', 'connecting');

  if (status === 'connected') {
    isConnected = true;
    indicator.classList.add('connected');
    statusText.textContent = '已连接';
    connectBtn.textContent = '断开连接';
    connectBtn.disabled = false;
    executeActionBtn.disabled = false;

    if (windowInfo) {
      windowDetails.style.display = 'block';
      windowDetails.innerHTML = [
        `标题: ${windowInfo.title || '未知'}`,
        `位置: (${(windowInfo.box || [])[0] ?? '未知'}, ${(windowInfo.box || [])[1] ?? '未知'})`,
        `尺寸: ${(windowInfo.size || {}).width || '未知'} x ${(windowInfo.size || {}).height || '未知'}`
      ].join('<br>');
    }
    logger.success('已连接本地程序');
    return;
  }

  if (status === 'connecting' || status === 'reconnecting') {
    isConnected = false;
    indicator.classList.add('connecting');
    statusText.textContent = status === 'connecting' ? '连接中...' : '重连中...';
    connectBtn.disabled = true;
    executeActionBtn.disabled = true;
    if (error) {
      logger.warn(error);
    }
    return;
  }

  isConnected = false;
  statusText.textContent = '未连接';
  connectBtn.textContent = '连接本地程序';
  connectBtn.disabled = false;
  executeActionBtn.disabled = true;
  windowDetails.style.display = 'none';
  if (error) {
    logger.error(error);
  }
}

function loadSettings() {
  chrome.storage.local.get(['operationSettings'], (result) => {
    operationSettings = mergeSettings(result.operationSettings);
    targetWindowTitleInput.value = operationSettings.targetWindowTitle || '';
    refreshActionOptions();
    logger.info('配置已加载');
  });
}

function checkConnection() {
  chrome.runtime.sendMessage({ action: 'check_connection' }, (response) => {
    updateConnectionStatus(response?.connected ? 'connected' : 'disconnected');
  });
}

connectBtn.addEventListener('click', () => {
  if (isConnected) {
    chrome.runtime.sendMessage({ action: 'disconnect' });
    return;
  }

  operationSettings.targetWindowTitle = targetWindowTitleInput.value.trim();
  saveSettings(() => {
    updateConnectionStatus('connecting');
    chrome.runtime.sendMessage({
      action: 'connect',
      target_window_title: operationSettings.targetWindowTitle
    });
  });
});

clearCacheBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'clear_cache' }, (response) => {
    if (response?.success) {
      logger.info('缓存已清理');
    }
  });
});

saveActionBtn.addEventListener('click', () => {
  try {
    const actionKey = actionKeyInput.value.trim();
    if (!actionKey) {
      throw new Error('动作名称不能为空');
    }

    operationSettings.targetWindowTitle = targetWindowTitleInput.value.trim();
    operationSettings.genericActions[actionKey] = parseSteps();
    saveSettings(() => {
      refreshActionOptions();
      savedActionSelect.value = actionKey;
      logger.success(`动作配置已保存: ${actionKey}`);
    });
  } catch (error) {
    logger.error(`保存配置失败: ${error.message}`);
  }
});

executeActionBtn.addEventListener('click', () => {
  try {
    const actionKey = actionKeyInput.value.trim();
    const steps = parseSteps();

    chrome.runtime.sendMessage({
      action: 'execute_action',
      action_key: actionKey,
      steps
    }, (response) => {
      if (response?.success) {
        logger.success(`动作已发送: ${actionKey}`);
      } else {
        logger.error(`动作发送失败: ${response?.error || 'unknown error'}`);
      }
    });
  } catch (error) {
    logger.error(`动作配置错误: ${error.message}`);
  }
});

savedActionSelect.addEventListener('change', () => {
  const actionKey = savedActionSelect.value;
  actionKeyInput.value = actionKey;
  actionStepsInput.value = formatJson(operationSettings.genericActions[actionKey] || []);
});

targetWindowTitleInput.addEventListener('change', () => {
  operationSettings.targetWindowTitle = targetWindowTitleInput.value.trim();
  saveSettings();
});

clearLogBtn.addEventListener('click', () => {
  logger.clear();
});

exportLogBtn.addEventListener('click', () => {
  logger.export();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'close_sidepanel') {
    window.close();
  } else if (message.action === 'connection_status') {
    updateConnectionStatus(message.status, message.error, message.window_info);
  } else if (message.action === 'operation_result') {
    if (message.success) {
      logger.success(`${message.operation} 执行成功`);
    } else {
      logger.error(`${message.operation} 执行失败: ${message.error}`);
    }
  } else if (message.action === 'native_message') {
    logger.info(`收到本地程序消息: ${JSON.stringify(message.message)}`);
  } else if (message.action === 'web_result') {
    logger.info(`收到 Web 消息: ${JSON.stringify(message.message || message.error)}`);
  } else if (message.action === 'cache_cleared') {
    logger.info('窗口缓存已清理');
  }

  sendResponse({ success: true });
  return true;
});

window.addEventListener('unload', () => {
  chrome.runtime.sendMessage({ action: 'sidepanel_closed' });
});

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  checkConnection();
  logger.info('控制面板已启动');
});
