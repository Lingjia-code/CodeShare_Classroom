const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("roomId");

if (!roomId) {
  alert("No room ID provided");
  window.location.href = "/instructor.html";
}

let socket = null;
let isConnected = false;
let currentSelectedStudent = null;
let students = new Map();
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

  socket.on('classroom-users', (users) => {
    updateStudentList(users);
  });

  socket.on('user-joined', (data) => {
    if (data.role === 'student') {
      students.set(data.userId, {
        userId: data.userId,
        username: data.username,
        role: data.role,
        needsHelp: false
      });
      refreshStudentListUI();
    }
  });

  socket.on('user-left', (data) => {
    students.delete(data.userId);

    if (currentSelectedStudent === data.userId) {
      currentSelectedStudent = null;
      document.getElementById('currentStudentName').textContent = 'Select a student to view their code';
      document.getElementById('noStudentMessage').style.display = 'flex';
      document.getElementById('editor').style.display = 'none';
    }
    refreshStudentListUI();
  });

  socket.on('student-code-update', (data) => {
    if (students.has(data.studentId)) {
      const student = students.get(data.studentId);
      student.code = data.code;
      student.language = data.language;
    }

    if (currentSelectedStudent === data.studentId) {
      isUpdatingFromRemote = true;
      updateEditorContent(data.code);

      // Update language if changed
      if (data.language && data.language !== currentLanguage) {
        currentLanguage = data.language;
        document.getElementById('languageSelect').value = data.language;
        if (editor) {
          monaco.editor.setModelLanguage(editor.getModel(), data.language);
        }
      }

      setTimeout(() => { isUpdatingFromRemote = false; }, 100);
    }
  });

  socket.on('instructor-code-update', (data) => {
    if (students.has(data.studentId)) {
      const student = students.get(data.studentId);
      student.code = data.code;
      student.language = data.language;
    }

    if (currentSelectedStudent === data.studentId) {
      isUpdatingFromRemote = true;
      updateEditorContent(data.code);
      setTimeout(() => { isUpdatingFromRemote = false; }, 100);
    }
  });

  socket.on('help-request-received', (data) => {
    if (students.has(data.studentId)) {
      students.get(data.studentId).needsHelp = true;
      students.get(data.studentId).helpMessage = data.message;
    }
    refreshStudentListUI();
    alert(`Help request from ${data.studentName}:\n${data.message}`);
  });

  socket.on('student-execution-result', (data) => {
    if (currentSelectedStudent === data.studentId) {
      const outputDiv = document.getElementById('output');
      const outputContainer = document.getElementById('output-container');
      outputContainer.style.display = 'block';

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

// Update connection status indicator
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

// Update student list with initial users
function updateStudentList(users) {
  students.clear();

  users.forEach(user => {
    // Only add students, not the instructor
    if (user.role === 'student') {
      students.set(user.userId, {
        userId: user.userId,
        username: user.username,
        role: user.role,
        needsHelp: false
      });
    }
  });

  refreshStudentListUI();
}

// Refresh the student list UI
function refreshStudentListUI() {
  const studentList = document.getElementById('studentList');
  const studentCount = document.getElementById('studentCount');

  // Update count
  studentCount.textContent = `${students.size} student${students.size !== 1 ? 's' : ''}`;

  // Clear existing list
  studentList.innerHTML = '';

  if (students.size === 0) {
    studentList.innerHTML = '<li class="empty-state">No students online</li>';
    return;
  }

  // Add each student to the list
  students.forEach((student, studentId) => {
    const li = document.createElement('li');
    li.className = 'student-item';

    if (studentId === currentSelectedStudent) {
      li.classList.add('active');
    }

    if (student.needsHelp) {
      li.classList.add('needs-help');
    }

    li.innerHTML = `
      <div>
        <div class="student-name">${student.username}</div>
        <div class="student-status">
          <span class="online-indicator"></span>Online
        </div>
      </div>
      ${student.needsHelp ? '<span class="help-badge">HELP</span>' : ''}
    `;

    // Add click handler to select student
    li.addEventListener('click', () => selectStudent(studentId));

    studentList.appendChild(li);
  });
}

// Select a student to view their code
async function selectStudent(studentId) {
  currentSelectedStudent = studentId;
  const student = students.get(studentId);

  if (!student) return;

  // Update UI
  document.getElementById('currentStudentName').textContent = `${student.username}'s Code`;
  document.getElementById('noStudentMessage').style.display = 'none';
  document.getElementById('editor').style.display = 'block';

  // Show language controls and output panel
  document.getElementById('languageControls').style.display = 'flex';
  document.getElementById('output-container').style.display = 'block';

  // Set language selector to student's language
  const languageSelect = document.getElementById('languageSelect');
  languageSelect.value = student.language || 'javascript';
  currentLanguage = student.language || 'javascript';

  // Update Monaco Editor language mode
  if (editor) {
    monaco.editor.setModelLanguage(editor.getModel(), currentLanguage);
  }

  // Show/hide resolve help button
  const resolveBtn = document.getElementById('resolveHelpBtn');
  if (student.needsHelp) {
    resolveBtn.style.display = 'block';
  } else {
    resolveBtn.style.display = 'none';
  }

  // Refresh student list to highlight selected student
  refreshStudentListUI();

  // Clear editor first to avoid showing previous student's code
  updateEditorContent('');

  // Load student's current code from server
  try {
    const res = await fetch(`/api/code/${roomId}/student/${studentId}`);
    if (res.ok) {
      const data = await res.json();

      // Update editor with loaded code (or empty string if no code)
      const loadedCode = data.code || '';
      updateEditorContent(loadedCode);

      // Update in-memory copy
      student.code = loadedCode;
      student.language = data.language || 'javascript';

      // Update language selector and editor mode if language changed
      if (data.language && data.language !== currentLanguage) {
        currentLanguage = data.language;
        document.getElementById('languageSelect').value = data.language;
        if (editor) {
          monaco.editor.setModelLanguage(editor.getModel(), data.language);
        }
      }
    }
  } catch (err) {
    console.error('Failed to load student code:', err);
    updateEditorContent('');
  }
}

// Update editor content (used by Monaco editor)
function updateEditorContent(code) {
  if (editor) {
    const currentPosition = editor.getPosition();
    editor.setValue(code);

    // Try to restore cursor position if possible
    if (currentPosition) {
      editor.setPosition(currentPosition);
    }
  }
}

// Send instructor's code changes to server and broadcast to student (with debouncing)
function sendInstructorCodeChange(code) {
  if (!isConnected || !currentSelectedStudent || isUpdatingFromRemote) {
    return;
  }

  // Clear existing timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  // Set new timer - wait 1 second after typing stops
  debounceTimer = setTimeout(() => {
    socket.emit('instructor-code-change', {
      classroomId: roomId,
      studentId: currentSelectedStudent,
      code: code,
      language: 'javascript'
    });

    console.log('Sent instructor code update for student:', currentSelectedStudent);
  }, 50); // 0.05 second debounce
}

// Editor change handler called from Monaco editor
function onInstructorEditorChange(code) {
  sendInstructorCodeChange(code);
}

// Resolve help request
document.getElementById('resolveHelpBtn').addEventListener('click', () => {
  if (!currentSelectedStudent || !isConnected) return;

  const student = students.get(currentSelectedStudent);
  if (!student || !student.needsHelp) return;

  // Send resolve event to server
  socket.emit('resolve-help', {
    classroomId: roomId,
    studentId: currentSelectedStudent
  });

  // Update local state
  student.needsHelp = false;
  student.helpMessage = null;

  // Update UI
  document.getElementById('resolveHelpBtn').style.display = 'none';
  refreshStudentListUI();

  console.log(`Resolved help request for ${student.username}`);
});

// Refresh all button - reload student list and current code
document.getElementById('refreshBtn').addEventListener('click', async () => {
  if (!isConnected) {
    alert('Not connected to server. Please refresh the page.');
    return;
  }

  // Request fresh user list from server
  socket.emit('request-users', roomId);

  // If a student is selected, reload their code
  if (currentSelectedStudent) {
    await selectStudent(currentSelectedStudent);
  }

  console.log('Refreshed student list and code');
});

document.getElementById('backBtn').addEventListener('click', () => {
  if (socket && isConnected) {
    socket.emit('leave-classroom', roomId);
    socket.disconnect();
  }
  window.location.href = '/instructor.html';
});

// Sign out button
document.getElementById('signOutBtn').addEventListener('click', async () => {
  if (socket && isConnected) {
    socket.emit('leave-classroom', roomId);
    socket.disconnect();
  }

  // Sign out from Azure
  try {
    await fetch('/signout', { method: 'POST' });
  } catch (err) {
    console.error('Sign out error:', err);
  }

  window.location.href = '/';
});

// Initialize everything when page loads
window.addEventListener('load', async () => {
  // Initialize Socket.IO
  await initializeSocket();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (socket && isConnected) {
    socket.emit('leave-classroom', roomId);
    socket.disconnect();
  }
});

// Language selection change handler
document.getElementById('languageSelect').addEventListener('change', (e) => {
  if (!currentSelectedStudent) return;

  currentLanguage = e.target.value;

  // Update Monaco Editor language mode
  if (editor) {
    monaco.editor.setModelLanguage(editor.getModel(), currentLanguage);
  }

  // Update student's language in memory
  const student = students.get(currentSelectedStudent);
  if (student) {
    student.language = currentLanguage;
  }

  // Broadcast language change to student
  if (socket && isConnected) {
    socket.emit('instructor-code-change', {
      classroomId: roomId,
      studentId: currentSelectedStudent,
      code: editor.getValue(),
      language: currentLanguage
    });
  }

  console.log(`Changed language to ${currentLanguage} for student:`, currentSelectedStudent);
});

// Run code button handler
document.getElementById('runBtn').addEventListener('click', async () => {
  if (!currentSelectedStudent) {
    alert('Please select a student first');
    return;
  }

  const code = editor.getValue();
  const outputDiv = document.getElementById('output');
  const outputContainer = document.getElementById('output-container');

  // Show output container if hidden
  outputContainer.style.display = 'block';
  outputDiv.textContent = 'Running code...';

  try {
    const response = await fetch('/api/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code,
        language: currentLanguage
      })
    });

    const result = await response.json();

    if (result.success) {
      outputDiv.innerHTML = `<div class="output-success">Exit Code: ${result.exitCode || 0}</div>\n${result.output || '(no output)'}`;
    } else {
      outputDiv.innerHTML = `<div class="output-error">Error:</div>\n${result.error}`;
    }

    // Broadcast execution result to student
    if (socket && isConnected) {
      socket.emit('execution-result', {
        classroomId: roomId,
        studentId: currentSelectedStudent,
        result: result
      });
    }

    console.log('Code execution result:', result);
  } catch (err) {
    console.error('Failed to execute code:', err);
    outputDiv.innerHTML = `<div class="output-error">Error:</div>\nFailed to execute code: ${err.message}`;
  }
});
