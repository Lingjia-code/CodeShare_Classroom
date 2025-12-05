const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("roomId");

if (!roomId) {
  alert("No room ID provided");
  window.location.href = "/studentJoin.html";
}

let socket = null;
let isConnected = false;
let autoSaveEnabled = true;
let debounceTimer = null;
let isUpdatingFromRemote = false;
let currentLanguage = 'javascript';

async function getUserInfo() {
  try {
    const classroomRes = await fetch(`/api/classrooms/${roomId}`);
    if (classroomRes.ok) {
      const classroom = await classroomRes.json();
      document.getElementById('roomCode').textContent = classroom.roomCode;
    }

    const userRes = await fetch('/api/classrooms/me');
    if (!userRes.ok) {
      throw new Error('Failed to get user info');
    }

    const userInfo = await userRes.json();

    return {
      userId: userInfo.userId,
      username: userInfo.username,
      role: userInfo.role
    };
  } catch (err) {
    console.error('Auth error:', err);
    alert('Please sign in to continue');
    window.location.href = '/';
    return null;
  }
}

async function initializeSocket() {
  const userInfo = await getUserInfo();
  if (!userInfo) {
    updateStatus(false, 'Failed to authenticate');
    return;
  }

  socket = io({
    auth: {
      userId: userInfo.userId,
      username: userInfo.username,
      role: userInfo.role
    }
  });

  socket.on('connect', () => {
    isConnected = true;
    updateStatus(true, 'Connected');
    socket.emit('join-classroom', roomId);
  });

  socket.on('help-resolved-notification', (data) => {
    if (data.studentId === userInfo.userId) {
      alert(`${data.instructorName} has responded to your help request!`);
    }
  });

  socket.on('instructor-code-update', (data) => {
    if (data.studentId === userInfo.userId) {
      isUpdatingFromRemote = true;
      setEditorContent(data.code);

      if (data.language && data.language !== currentLanguage) {
        currentLanguage = data.language;
        document.getElementById('languageSelect').value = data.language;
        if (editor) {
          monaco.editor.setModelLanguage(editor.getModel(), data.language);
        }
      }

      setTimeout(() => { isUpdatingFromRemote = false; }, 100);

      const autoSaveStatus = document.getElementById('autoSaveStatus');
      autoSaveStatus.textContent = `✓ Updated by ${data.instructorName}`;
      autoSaveStatus.style.color = '#2196f3';

      setTimeout(() => {
        autoSaveStatus.textContent = '✓ Real-time sync enabled';
        autoSaveStatus.style.color = '#666';
      }, 3000);
    }
  });

  socket.on('instructor-execution-result', (data) => {
    if (data.studentId === userInfo.userId) {
      const outputDiv = document.getElementById('output');
      if (data.result.success) {
        outputDiv.innerHTML = `<div class="output-success">Exit Code: ${data.result.exitCode || 0}</div>\n${data.result.output || '(no output)'}`;
      } else {
        outputDiv.innerHTML = `<div class="output-error">Error:</div>\n${data.result.error}`;
      }
    }
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
    isConnected = false;
    updateStatus(false, 'Connection error');
  });

  socket.on('disconnect', () => {
    isConnected = false;
    updateStatus(false, 'Disconnected');
  });

  socket.on('error', (data) => {
    console.error('Server error:', data.message);
    alert(`Error: ${data.message}`);
  });
}

function updateStatus(connected, text) {
  const indicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');

  if (connected) {
    indicator.classList.add('connected');
    statusText.textContent = text || 'Connected';
  } else {
    indicator.classList.remove('connected');
    statusText.textContent = text || 'Disconnected';
  }
}

function sendCodeChange(code) {
  if (!isConnected || !autoSaveEnabled || isUpdatingFromRemote) return;

  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(() => {
    socket.emit('code-change', {
      classroomId: roomId,
      code: code,
      language: currentLanguage
    });

    const autoSaveStatus = document.getElementById('autoSaveStatus');
    autoSaveStatus.textContent = '✓ Synced';
    autoSaveStatus.style.color = '#4caf50';

    setTimeout(() => {
      autoSaveStatus.textContent = '✓ Real-time sync enabled';
      autoSaveStatus.style.color = '#666';
    }, 2000);
  }, 50);
}

document.getElementById("helpBtn").addEventListener("click", () => {
  if (!isConnected) {
    alert('Not connected to server. Please refresh the page.');
    return;
  }

  const message = prompt('Describe what you need help with:');
  if (message && message.trim()) {
    socket.emit('help-request', {
      classroomId: roomId,
      message: message.trim()
    });
    alert('Help request sent to instructor!');
  }
});

document.getElementById("backBtn").addEventListener("click", () => {
  if (socket && isConnected) {
    socket.emit('leave-classroom', roomId);
    socket.disconnect();
  }
  window.location.href = '/studentJoin.html';
});

document.getElementById("signOutBtn").addEventListener("click", async () => {
  if (socket && isConnected) {
    socket.emit('leave-classroom', roomId);
    socket.disconnect();
  }

  try {
    await fetch('/signout', { method: 'POST' });
  } catch (err) {
    console.error('Sign out error:', err);
  }

  window.location.href = '/';
});

function onEditorChange(code) {
  sendCodeChange(code);
}

window.addEventListener('load', async () => {
  await initializeSocket();

  try {
    const res = await fetch(`/api/code/${roomId}/refresh`);
    if (res.ok) {
      const data = await res.json();
      if (data.code) setEditorContent(data.code);
    }
  } catch (err) {
    console.error('Failed to load code:', err);
  }
});

window.addEventListener('beforeunload', () => {
  if (socket && isConnected) {
    socket.emit('leave-classroom', roomId);
    socket.disconnect();
  }
});

document.getElementById('languageSelect').addEventListener('change', (e) => {
  currentLanguage = e.target.value;

  if (editor) {
    monaco.editor.setModelLanguage(editor.getModel(), currentLanguage);
  }

  if (socket && isConnected) {
    socket.emit('code-change', {
      classroomId: roomId,
      code: getEditorContent(),
      language: currentLanguage
    });
  }
});

document.getElementById('runBtn').addEventListener('click', async () => {
  const code = getEditorContent();
  const outputDiv = document.getElementById('output');

  if (!code.trim()) {
    outputDiv.textContent = 'Error: No code to run';
    outputDiv.className = 'output-error';
    return;
  }

  outputDiv.textContent = 'Running code...';
  outputDiv.className = '';

  try {
    const response = await fetch('/api/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, language: currentLanguage })
    });

    const result = await response.json();

    if (result.success) {
      outputDiv.innerHTML = `<div class="output-success">Exit Code: ${result.exitCode || 0}</div>\n${result.output || '(no output)'}`;
    } else {
      outputDiv.innerHTML = `<div class="output-error">Error:</div>\n${result.error || 'Unknown error occurred'}`;
    }

    if (socket && isConnected) {
      socket.emit('student-execution-result', {
        classroomId: roomId,
        result
      });
    }
  } catch (err) {
    console.error('Execution error:', err);
    outputDiv.innerHTML = `<div class="output-error">Failed to execute code:</div>\n${err.message}`;
  }
});
