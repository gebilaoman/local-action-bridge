const extensionIdInput = document.getElementById('extensionId');
const targetWindowTitleInput = document.getElementById('targetWindowTitle');
const actionKeyInput = document.getElementById('actionKey');
const stepsInput = document.getElementById('steps');
const status = document.getElementById('status');
const log = document.getElementById('log');

function appendLog(title, payload) {
  const entry = {
    time: new Date().toLocaleString('zh-CN', { hour12: false }),
    title,
    payload
  };
  log.textContent = `${JSON.stringify(entry, null, 2)}\n\n${log.textContent}`;
}

function setStatus(text, type = '') {
  status.textContent = text;
  status.className = `status ${type}`.trim();
}

function getExtensionId() {
  const extensionId = extensionIdInput.value.trim();
  if (!extensionId) {
    throw new Error('请先填写 Chrome 插件 ID');
  }
  return extensionId;
}

function sendToExtension(message) {
  return new Promise((resolve, reject) => {
    if (!window.chrome?.runtime?.sendMessage) {
      reject(new Error('当前浏览器环境不能调用 chrome.runtime.sendMessage'));
      return;
    }

    chrome.runtime.sendMessage(getExtensionId(), message, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response);
    });
  });
}

async function run(title, messageFactory) {
  try {
    const response = await sendToExtension(messageFactory());
    appendLog(title, response);
    setStatus(response?.success ? '成功' : '失败', response?.success ? 'ok' : 'error');
  } catch (error) {
    appendLog(title, { success: false, error: error.message });
    setStatus('失败', 'error');
  }
}

document.getElementById('pingBtn').addEventListener('click', () => {
  run('PING', () => ({ type: 'PING' }));
});

document.getElementById('connectBtn').addEventListener('click', () => {
  run('CONNECT_APP', () => ({
    type: 'CONNECT_APP',
    targetWindowTitle: targetWindowTitleInput.value.trim()
  }));
});

document.getElementById('executeBtn').addEventListener('click', () => {
  run('EXECUTE_ACTION', () => ({
    type: 'EXECUTE_ACTION',
    actionKey: actionKeyInput.value.trim(),
    steps: JSON.parse(stepsInput.value)
  }));
});
