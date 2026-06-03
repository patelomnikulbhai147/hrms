const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../backend/src/controllers/userController.js');
let content = fs.readFileSync(file, 'utf8');

const additionalMethods = `
exports.createUser = async (req, res) => {
  try {
    const { name, email, username, password, role, companyId, status, accessibleCompanyIds, permissions, moduleAccess } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }]
      }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'User with this email or username already exists' });
    }

    const passwordHash = await bcrypt.hash(password || 'welcome123', 10);

    let combinedPermissions = {};
    if (permissions) combinedPermissions.permissions = permissions;
    if (moduleAccess) combinedPermissions.moduleAccess = moduleAccess;

    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        username,
        password: password || 'welcome123', // Storing plaintext for fallback demo purposes only
        passwordHash,
        role: role || 'Employee',
        companyId,
        status: status || 'Active',
        accessibleCompanyIds: accessibleCompanyIds || [companyId],
        permissions: combinedPermissions
      }
    });

    res.status(201).json(newUser);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Internal server error while creating user' });
  }
};

exports.getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' }
    });
    // Remove passwordHash before sending
    const safeUsers = users.map(u => {
      const { passwordHash, ...rest } = u;
      return rest;
    });
    res.json(safeUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error while fetching users' });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.user.delete({ where: { id } });
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Internal server error while deleting user' });
  }
};
`;

content += additionalMethods;

fs.writeFileSync(file, content);
console.log('userController.js patched!');
