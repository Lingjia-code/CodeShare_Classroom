// Get roomId from URL
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("roomId");

if (!roomId) {
  alert("No room ID provided");
  window.location.href = "/instructorDashboard.html";
}

// Socket.IO connection
let socket = null;
let isConnected = false;
let currentSelectedStudent = null;
let students = new Map(); // Map of studentId -> student info
let debounceTimer = null;
let isUpdatingFromRemote = false; // Flag to prevent echo when receiving remote updates

// Get user info from API
async function getUserInfo() {
  try {
    // Get classroom info to display room code
    const classroomRes = await fetch(`/api/classrooms/${roomId}`);
    if (classroomRes.ok) {
      const classroom = await classroomRes.json();
      document.getElementById('roomCode').textContent = classroom.roomCode;
    }

    // Get current user info from authentication
    const userRes = await fetch('/api/classrooms/me');
    if (!userRes.ok) {
      throw new Error('Failed to get user info');
    }

    const userInfo = await userRes.json();
    console.log('User info:', userInfo);

    // Verify this is an instructor
    if (userInfo.role !== 'instructor') {
      alert('Access denied. Only instructors can access this page.');
      window.location.href = '/';
      return null;
    }

    return {
      userId: userInfo.userId,
      username: userInfo.username,
      role: userInfo.role
    };
  } catch (err) {
    console.error('Error getting user info:', err);
    alert('Please sign in to continue');
    window.location.href = '/';
    return null;
  }
}

// Initialize Socket.IO connection
async function initializeSocket() {
  const userInfo = await getUserInfo();

  if (!userInfo) {
    updateStatus(false, 'Failed to authenticate');
    return;
  }

  // Connect to Socket.IO server
  socket = io({
    auth: {
      userId: userInfo.userId,
      username: userInfo.username,
      role: userInfo.role
    }
  });

  // Connection successful
  socket.on('connect', () => {
    console.log('✅ Socket connected');
    isConnected = true;
    updateStatus(true, 'Connected');

    // Join the classroom room
    socket.emit('join-classroom', roomId);
  });

  // Receive initial list of users in classroom
  socket.on('classroom-users', (users) => {
    console.log('Users in classroom:', users);
    updateStudentList(users);
  });

  // User joined notification
  socket.on('user-joined', (data) => {
    console.log(`${data.username} joined the classroom`);

    // Add to students map
    students.set(data.userId, {
      userId: data.userId,
      username: data.username,
      role: data.role,
      needsHelp: false
    });

    // Refresh student list
    refreshStudentListUI();
  });

  // User left notification
  socket.on('user-left', (data) => {
    console.log(`${data.username} left the classroom`);

    // Remove from students map
    students.delete(data.userId);

    // If this was the selected student, clear the editor
    if (currentSelectedStudent === data.userId) {
      currentSelectedStudent = null;
      document.getElementById('currentStudentName').textContent = 'Select a student to view their code';
      document.getElementById('noStudentMessage').style.display = 'flex';
      document.getElementById('editor').style.display = 'none';
    }

    // Refresh student list
    refreshStudentListUI();
  });

  // Student code update (real-time sync)
  socket.on('student-code-update', (data) => {
    console.log('Received code update from:', data.studentName);

    // Update student's code in memory
    if (students.has(data.studentId)) {
      const student = students.get(data.studentId);
      student.code = data.code;
      student.language = data.language;
    }

    // If this is the currently selected student, update the editor
    if (currentSelectedStudent === data.studentId) {
      isUpdatingFromRemote = true;
      updateEditorContent(data.code);
      setTimeout(() => { isUpdatingFromRemote = false; }, 100);
    }
  });

  // Instructor code update broadcast (when instructor edits code)
  socket.on('instructor-code-update', (data) => {
    console.log('Received instructor code update for student:', data.studentId);

    // Update student's code in memory
    if (students.has(data.studentId)) {
      const student = students.get(data.studentId);
      student.code = data.code;
      student.language = data.language;
    }

    // If this is the currently selected student, update the editor
    if (currentSelectedStudent === data.studentId) {
      isUpdatingFromRemote = true;
      updateEditorContent(data.code);
      setTimeout(() => { isUpdatingFromRemote = false; }, 100);
    }
  });

  // Help request received
  socket.on('help-request-received', (data) => {
    console.log('Help request from:', data.studentName);

    // Update student's help status
    if (students.has(data.studentId)) {
      students.get(data.studentId).needsHelp = true;
      students.get(data.studentId).helpMessage = data.message;
    }

    // Refresh student list to show help badge
    refreshStudentListUI();

    // Show notification
    alert(`Help request from ${data.studentName}:\n${data.message}`);
  });

  // Connection error
  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
    isConnected = false;
    updateStatus(false, 'Connection error');
  });

  // Disconnection
  socket.on('disconnect', () => {
    console.log('❌ Socket disconnected');
    isConnected = false;
    updateStatus(false, 'Disconnected');
  });

  // Error from server
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

  // Show/hide resolve help button
  const resolveBtn = document.getElementById('resolveHelpBtn');
  if (student.needsHelp) {
    resolveBtn.style.display = 'block';
  } else {
    resolveBtn.style.display = 'none';
  }

  // Refresh student list to highlight selected student
  refreshStudentListUI();

  // Load student's current code from server
  try {
    const res = await fetch(`/api/code/${roomId}/student/${studentId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.code) {
        updateEditorContent(data.code);

        // Update in-memory copy
        student.code = data.code;
        student.language = data.language || 'javascript';
      } else {
        updateEditorContent('// No code yet...');
      }
    }
  } catch (err) {
    console.error('Failed to load student code:', err);
    updateEditorContent('// Error loading code');
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
  }, 1000); // 1 second debounce
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
