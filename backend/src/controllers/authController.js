const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  });
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Please provide username and password' });
    }

    const user = await prisma.user.findFirst({
      where: { 
        OR: [
          { username: username },
          { email: username }
        ]
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.status !== 'Active') {
      return res.status(403).json({ error: 'Account is disabled. Please contact admin.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Don't send the passwordHash back to the client
    const { passwordHash, permissions: rawPermissions, ...userWithoutPassword } = user;
    const parsedPerms = rawPermissions || {};

    res.json({
      message: 'Login successful',
      token: generateToken(user.id),
      user: {
        ...userWithoutPassword,
        permissions: parsedPerms.permissions || {},
        moduleAccess: parsedPerms.moduleAccess || {}
      }
    });

  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { passwordHash, permissions: rawPermissions, ...userWithoutPassword } = user;
    const parsedPerms = rawPermissions || {};
    res.json({
      ...userWithoutPassword,
      permissions: parsedPerms.permissions || {},
      moduleAccess: parsedPerms.moduleAccess || {}
    });
  } catch (error) {
    console.error('GetMe Error:', error);
    res.status(500).json({ error: 'Server error fetching user details' });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { username, newPassword } = req.body;
    if (!username || !newPassword) {
      return res.status(400).json({ error: 'Please provide username/email and new password' });
    }

    const user = await prisma.user.findFirst({
      where: { 
        OR: [
          { username: username },
          { email: username }
        ]
      }
    });

    if (!user) {
      // Return a generic success to prevent email enumeration, or actual error in this MVP
      return res.status(404).json({ error: 'Account not found with this login ID/email' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        password: newPassword, // Mock fallback
        passwordHash: passwordHash
      }
    });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Forgot Password Error:', error);
    res.status(500).json({ error: 'Server error during password reset' });
  }
};
