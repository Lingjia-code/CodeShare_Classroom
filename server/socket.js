import { Server } from 'socket.io';
import Classroom from './models/Classroom.js';

export function initializeSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: '*', // In production, specify your domain
      methods: ['GET', 'POST']
    }
  });

  // Middleware to authenticate socket connections
  io.use((socket, next) => {
    const { userId, username, role } = socket.handshake.auth;

    if (!userId || !username) {
      return next(new Error('Authentication error'));
    }

    socket.userId = userId;
    socket.username = username;
    socket.role = role;

    console.log(`Socket authenticated: ${username} (${role})`);
    next();
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.username} (${socket.userId})`);

    // Join a classroom room
    socket.on('join-classroom', async (classroomId) => {
      try {
        const classroom = await Classroom.findById(classroomId);

        if (!classroom) {
          socket.emit('error', { message: 'Classroom not found' });
          return;
        }

        // Join the Socket.IO room
        socket.join(classroomId);
        socket.currentClassroom = classroomId;

        console.log(`${socket.username} joined classroom ${classroomId}`);

        // Notify others in the room
        socket.to(classroomId).emit('user-joined', {
          userId: socket.userId,
          username: socket.username,
          role: socket.role
        });

        // Send current users list to the new user
        const socketsInRoom = await io.in(classroomId).fetchSockets();
        const usersInRoom = socketsInRoom.map(s => ({
          userId: s.userId,
          username: s.username,
          role: s.role
        }));

        socket.emit('classroom-users', usersInRoom);

      } catch (err) {
        console.error('Error joining classroom:', err);
        socket.emit('error', { message: 'Failed to join classroom' });
      }
    });

    // Student sends code update
    socket.on('code-change', async (data) => {
      const { classroomId, code, language } = data;

      console.log(`Code change from ${socket.username} in classroom ${classroomId}`);

      // Only students should send code changes
      if (socket.role !== 'student') {
        return;
      }

      try {
        // Save code to database
        const classroom = await Classroom.findById(classroomId);

        if (!classroom) {
          socket.emit('error', { message: 'Classroom not found' });
          return;
        }

        // Find or create file entry for this student
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

        // Broadcast to instructor(s) in the room
        socket.to(classroomId).emit('student-code-update', {
          studentId: socket.userId,
          studentName: socket.username,
          code,
          language,
          timestamp: new Date()
        });

      } catch (err) {
        console.error('Error saving code:', err);
        socket.emit('error', { message: 'Failed to save code' });
      }
    });

    // Instructor sends code update for a student
    socket.on('instructor-code-change', async (data) => {
      const { classroomId, studentId, code, language } = data;

      console.log(`Instructor ${socket.username} editing code for student ${studentId}`);

      // Only instructors should send instructor code changes
      if (socket.role !== 'instructor') {
        return;
      }

      try {
        // Save code to database
        const classroom = await Classroom.findById(classroomId);

        if (!classroom) {
          socket.emit('error', { message: 'Classroom not found' });
          return;
        }

        // Verify instructor owns this classroom
        if (classroom.instructor.toString() !== socket.userId) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }

        // Find or create file entry for the student
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

        // Broadcast to everyone in the room (student and other instructors)
        socket.to(classroomId).emit('instructor-code-update', {
          studentId: studentId,
          instructorName: socket.username,
          code,
          language,
          timestamp: new Date()
        });

      } catch (err) {
        console.error('Error saving instructor code:', err);
        socket.emit('error', { message: 'Failed to save code' });
      }
    });

    // Instructor requests to view a specific student's code
    socket.on('request-student-code', async (data) => {
      const { classroomId, studentId } = data;

      if (socket.role !== 'instructor') {
        return;
      }

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
        console.error('Error fetching student code:', err);
        socket.emit('error', { message: 'Failed to fetch code' });
      }
    });

    // Handle help requests from students
    socket.on('help-request', (data) => {
      const { classroomId, message } = data;

      if (socket.role !== 'student') {
        return;
      }

      console.log(`Help request from ${socket.username} in classroom ${classroomId}`);

      // Notify all instructors in the classroom
      socket.to(classroomId).emit('help-request-received', {
        studentId: socket.userId,
        studentName: socket.username,
        message,
        timestamp: new Date()
      });
    });

    // Instructor resolves help request
    socket.on('resolve-help', (data) => {
      const { classroomId, studentId } = data;

      if (socket.role !== 'instructor') {
        return;
      }

      console.log(`Help resolved for student ${studentId} by ${socket.username}`);

      // Notify the student
      io.to(classroomId).emit('help-resolved-notification', {
        studentId,
        instructorName: socket.username
      });
    });

    // Instructor requests updated user list
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
        console.error('Error fetching users:', err);
        socket.emit('error', { message: 'Failed to fetch users' });
      }
    });

    // Leave classroom
    socket.on('leave-classroom', (classroomId) => {
      socket.leave(classroomId);
      socket.to(classroomId).emit('user-left', {
        userId: socket.userId,
        username: socket.username
      });

      console.log(`=K ${socket.username} left classroom ${classroomId}`);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`L User disconnected: ${socket.username}`);

      if (socket.currentClassroom) {
        socket.to(socket.currentClassroom).emit('user-left', {
          userId: socket.userId,
          username: socket.username
        });
      }
    });

    // Error handling
    socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  });

  console.log('=� Socket.IO initialized');

  return io;
}
