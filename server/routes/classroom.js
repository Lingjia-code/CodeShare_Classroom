import express from 'express';
import Classroom from '../models/Classroom.js';
import User from '../models/User.js';

const router = express.Router();

// Get current user info
router.get('/me', async (req, res) => {
  try {
    const user = await ensureUser(req);

    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    return res.json({
      userId: user._id.toString(),
      username: user.username,
      role: user.role,
      azureId: user.azureId
    });
  } catch (err) {
    console.error('Error getting user info:', err);
    return res.status(500).json({ error: 'Failed to get user info' });
  }
});

function getAzureIdentity(req) {
  const account = req.authContext?.account || {};
  const claims = account.idTokenClaims || {};

  console.log('=== Getting Azure Identity ===');
  console.log('account:', account);
  console.log('claims:', claims);

  const azureId =
    claims.oid ||
    claims.sub ||
    account.homeAccountId ||
    account.localAccountId ||
    account.username;

  const username =
    account.name ||
    claims.name ||
    account.username ||
    claims.preferred_username ||
    'Unknown User';

  console.log('Extracted azureId:', azureId);
  console.log('Extracted username:', username);

  return { azureId, username };
}

async function ensureUser(req, roleHint) {
  const { azureId, username } = getAzureIdentity(req);

  if (!azureId) {
    return null;
  }

  let user = await User.findOne({ azureId });

  if (!user) {
    user = await User.create({
      azureId,
      username,
      role: roleHint || 'student',
    });
  } else if (roleHint && user.role !== roleHint) {
    user.role = roleHint;
    await user.save();
  }

  return user;
}

async function generateUniqueRoomCode() {
  const length = 6;
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  while (true) {
    let code = '';
    for (let i = 0; i < length; i += 1) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const existing = await Classroom.findOne({ roomCode: code });
    if (!existing) {
      return code;
    }
  }
}

router.post('/', async (req, res) => {
  try {
    console.log('=== Create Classroom Request ===');
    console.log('authContext:', req.authContext);
    console.log('account:', req.authContext?.account);

    const instructor = await ensureUser(req, 'instructor');
    console.log('Instructor from ensureUser:', instructor);

    if (!instructor) {
      console.log('No instructor found - returning 401');
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const roomCode = await generateUniqueRoomCode();
    console.log('Generated room code:', roomCode);

    const classroom = await Classroom.create({
      roomCode,
      instructor: instructor._id,
      students: [],
      files: [],
    });
    console.log('Classroom created:', classroom);

    return res.status(201).json({
      _id: classroom._id,
      roomCode: classroom.roomCode,
    });
  } catch (err) {
    console.error('Error creating classroom:', err);
    return res.status(500).json({ error: 'Failed to create classroom' });
  }
});

router.get('/', async (req, res) => {
  try {
    const instructor = await ensureUser(req, 'instructor');

    if (!instructor) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const classrooms = await Classroom.find({
      instructor: instructor._id,
    }).sort({ createdAt: -1 });

    return res.json(classrooms);
  } catch (err) {
    console.error('Error fetching classrooms:', err);
    return res.status(500).json({ error: 'Failed to load classrooms' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const user = await ensureUser(req);

    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const classroom = await Classroom.findById(req.params.id).populate(
      'students',
      'username role'
    );

    if (!classroom) {
      return res.status(404).json({ error: 'Classroom not found' });
    }

    return res.json(classroom);
  } catch (err) {
    console.error('Error fetching classroom:', err);
    return res.status(500).json({ error: 'Failed to load classroom' });
  }
});

router.post('/:code/join', async (req, res) => {
  try {
    const student = await ensureUser(req, 'student');

    if (!student) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const roomCode = req.params.code.trim();

    const classroom = await Classroom.findOne({ roomCode });

    if (!classroom) {
      return res.json({ success: false });
    }

    const alreadyJoined = classroom.students.some(
      (id) => id.toString() === student._id.toString()
    );

    if (!alreadyJoined) {
      classroom.students.push(student._id);
      await classroom.save();
    }

    return res.json({
      success: true,
      classroomId: classroom._id,
    });
  } catch (err) {
    console.error('Error joining classroom:', err);
    return res.status(500).json({ success: false, error: 'Failed to join classroom' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const user = await ensureUser(req);

    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const classroom = await Classroom.findById(req.params.id);

    if (!classroom) {
      return res.status(404).json({ error: 'Classroom not found' });
    }

    await Classroom.findByIdAndDelete(req.params.id);

    return res.json({ success: true, message: 'Classroom deleted' });
  } catch (err) {
    console.error('Error deleting classroom:', err);
    return res.status(500).json({ error: 'Failed to delete classroom' });
  }
});

export default router;
