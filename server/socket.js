import { Server } from 'socket.io';
import Classroom from './models/Classroom.js';

export function initializeSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: '*', // In production, specify your domain
      methods: ['GET', 'POST']
    }
  });

  io.use((socket, next) => {
    const { userId, username, role } = socket.handshake.auth;

    if (!userId || !username) {
      return next(new Error('Authentication error'));
    }

    socket.userId = userId;
    socket.username = username;
    socket.role = role;

    next();
  });

  io.on('connection', (socket) => {
    console.log(`Connected: ${socket.username} (${socket.role})`);

    socket.on('join-classroom', async (classroomId) => {
      try {
        const classroom = await Classroom.findById(classroomId);
        if (!classroom) {
          socket.emit('error', { message: 'Classroom not found' });
          return;
        }

        socket.join(classroomId);
        socket.currentClassroom = classroomId;

        // Notify others that this user joined
        socket.to(classroomId).emit('user-joined', {
          userId: socket.userId,
          username: socket.username,
          role: socket.role
        });

        // Send current user list to the joining user
        const socketsInRoom = await io.in(classroomId).fetchSockets();
        const usersInRoom = socketsInRoom.map(s => ({
          userId: s.userId,
          username: s.username,
          role: s.role
        }));

        socket.emit('classroom-users', usersInRoom);
      } catch (err) {
        console.error('Join classroom error:', err);
        socket.emit('error', { message: 'Failed to join classroom' });
      }
    });

    socket.on('code-change', async (data) => {
      const { classroomId, code, language } = data;

      if (socket.role !== 'student') return;

      try {
        const classroom = await Classroom.findById(classroomId);
        if (!classroom) {
          socket.emit('error', { message: 'Classroom not found' });
          return;
        }

        let fileEntry = classroom.files.find(
          f => f.student.toString() === socket.userId
        );

        if (fileEntry) {
          fileEntry.content = code;
          fileEntry.language = language || 'javascript';
          fileEntry.lastUpdated = new Date();
        } else {
          classroom.files.push({
            student: socket.userId,
            filename: `${socket.username}.js`,
            content: code,
            language: language || 'javascript',
            lastUpdated: new Date()
          });
        }

        await classroom.save();

        socket.to(classroomId).emit('student-code-update', {
          studentId: socket.userId,
          studentName: socket.username,
          code,
          language,
          timestamp: new Date()
        });
      } catch (err) {
        console.error('Save code error:', err);
        socket.emit('error', { message: 'Failed to save code' });
      }
    });

    socket.on('instructor-code-change', async (data) => {
      const { classroomId, studentId, code, language } = data;

      if (socket.role !== 'instructor') return;

      try {
        const classroom = await Classroom.findById(classroomId);
        if (!classroom) {
          socket.emit('error', { message: 'Classroom not found' });
          return;
        }

        let fileEntry = classroom.files.find(
          f => f.student.toString() === studentId
        );

        if (fileEntry) {
          fileEntry.content = code;
          fileEntry.language = language || 'javascript';
          fileEntry.lastUpdated = new Date();
        } else {
          classroom.files.push({
            student: studentId,
            filename: 'main.js',
            content: code,
            language: language || 'javascript',
            lastUpdated: new Date()
          });
        }

        await classroom.save();

        socket.to(classroomId).emit('instructor-code-update', {
          studentId,
          instructorName: socket.username,
          code,
          language,
          timestamp: new Date()
        });
      } catch (err) {
        console.error('Save instructor code error:', err);
        socket.emit('error', { message: 'Failed to save code' });
      }
    });

    socket.on('request-student-code', async (data) => {
      const { classroomId, studentId } = data;

      if (socket.role !== 'instructor') return;

      try {
        const classroom = await Classroom.findById(classroomId);
        if (!classroom) {
          socket.emit('error', { message: 'Classroom not found' });
          return;
        }

        const fileEntry = classroom.files.find(
          f => f.student.toString() === studentId
        );

        socket.emit('student-code-response', {
          studentId,
          code: fileEntry ? fileEntry.content : '',
          language: fileEntry ? fileEntry.language : 'javascript'
        });
      } catch (err) {
        console.error('Fetch student code error:', err);
        socket.emit('error', { message: 'Failed to fetch code' });
      }
    });

    socket.on('help-request', (data) => {
      const { classroomId, message } = data;
      if (socket.role !== 'student') return;

      socket.to(classroomId).emit('help-request-received', {
        studentId: socket.userId,
        studentName: socket.username,
        message,
        timestamp: new Date()
      });
    });

    socket.on('resolve-help', (data) => {
      const { classroomId, studentId } = data;
      if (socket.role !== 'instructor') return;

      io.to(classroomId).emit('help-resolved-notification', {
        studentId,
        instructorName: socket.username
      });
    });

    socket.on('student-execution-result', (data) => {
      const { classroomId, result } = data;
      if (socket.role !== 'student') return;

      socket.to(classroomId).emit('student-execution-result', {
        studentId: socket.userId,
        studentName: socket.username,
        result,
        timestamp: new Date()
      });
    });

    socket.on('execution-result', (data) => {
      const { classroomId, studentId, result } = data;
      if (socket.role !== 'instructor') return;

      socket.to(classroomId).emit('instructor-execution-result', {
        studentId,
        instructorName: socket.username,
        result,
        timestamp: new Date()
      });
    });

    socket.on('request-users', async (classroomId) => {
      try {
        const socketsInRoom = await io.in(classroomId).fetchSockets();
        const usersInRoom = socketsInRoom.map(s => ({
          userId: s.userId,
          username: s.username,
          role: s.role
        }));

        socket.emit('classroom-users', usersInRoom);
      } catch (err) {
        console.error('Fetch users error:', err);
        socket.emit('error', { message: 'Failed to fetch users' });
      }
    });

    socket.on('leave-classroom', (classroomId) => {
      socket.leave(classroomId);
      socket.to(classroomId).emit('user-left', {
        userId: socket.userId,
        username: socket.username
      });
    });

    socket.on('disconnect', () => {
      if (socket.currentClassroom) {
        socket.to(socket.currentClassroom).emit('user-left', {
          userId: socket.userId,
          username: socket.username
        });
      }
    });

    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  console.log('Socket.IO initialized');
  return io;
}
