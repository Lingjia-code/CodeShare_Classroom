// Get roomId from URL
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get("roomId");

if (!roomId) {
  alert("No room ID provided");
  window.location.href = "/studentJoin.html";
}

// Socket.IO connection
let socket = null;
let isConnected = false;
let autoSaveEnabled = true;
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

  // Join confirmation
  socket.on('classroom-users', (users) => {
    console.log('Users in classroom:', users);
  });

  // User joined notification
  socket.on('user-joined', (data) => {
    console.log(`${data.username} joined the classroom`);
  });

  // User left notification
  socket.on('user-left', (data) => {
    console.log(`${data.username} left the classroom`);
  });

  // Help resolved notification
  socket.on('help-resolved-notification', (data) => {
    if (data.studentId === userInfo.userId) {
      alert(`${data.instructorName} has responded to your help request!`);
    }
  });

  // Instructor code update (when instructor edits student's code)
  socket.on('instructor-code-update', (data) => {
    // Only update if this is the current student's code
    if (data.studentId === userInfo.userId) {
      console.log('Received code update from instructor:', data.instructorName);

      // Set flag to prevent echo
      isUpdatingFromRemote = true;
      setEditorContent(data.code);

      // Clear flag after a short delay
      setTimeout(() => { isUpdatingFromRemote = false; }, 100);

      // Show notification
      const autoSaveStatus = document.getElementById('autoSaveStatus');
      autoSaveStatus.textContent = `✓ Updated by ${data.instructorName}`;
      autoSaveStatus.style.color = '#2196f3';

      setTimeout(() => {
        autoSaveStatus.textContent = '✓ Real-time sync enabled';
        autoSaveStatus.style.color = '#666';
      }, 3000);
    }
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

// Send code changes to server (with debouncing)
function sendCodeChange(code) {
  if (!isConnected || !autoSaveEnabled || isUpdatingFromRemote) {
    return;
  }

  // Clear existing timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  // Set new timer - wait 1 second after typing stops
  debounceTimer = setTimeout(() => {
    socket.emit('code-change', {
      classroomId: roomId,
      code: code,
      language: 'javascript'
    });

    // Update auto-save status
    const autoSaveStatus = document.getElementById('autoSaveStatus');
    autoSaveStatus.textContent = '✓ Synced';
    autoSaveStatus.style.color = '#4caf50';

    setTimeout(() => {
      autoSaveStatus.textContent = '✓ Real-time sync enabled';
      autoSaveStatus.style.color = '#666';
    }, 2000);
  }, 1000); // 1 second debounce
}

// Help request button
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

// Listen for editor changes and send to server
function onEditorChange(code) {
  sendCodeChange(code);
}

// Initialize everything when page loads
window.addEventListener('load', async () => {
  // Initialize Socket.IO
  await initializeSocket();

  // Load initial code from server
  try {
    const res = await fetch(`/api/code/${roomId}/refresh`);
    if (res.ok) {
      const data = await res.json();
      if (data.code) {
        setEditorContent(data.code);
      }
    }
  } catch (err) {
    console.error('Failed to load initial code:', err);
  }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (socket && isConnected) {
    socket.emit('leave-classroom', roomId);
    socket.disconnect();
  }
});
