const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const path = require('path');

const app = express();  // <-- THIS MUST COME FIRST!
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-this-in-production';

// Middleware - THESE COME NEXT
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

// File paths - using /data for persistent storage in Docker
const DATA_DIR = process.env.DATA_DIR || '/data';
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ENTRIES_FILE = path.join(DATA_DIR, 'entries.json');

// Ensure data directory exists
async function ensureDataDirectory() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    console.log(`Data directory ensured: ${DATA_DIR}`);
  } catch (error) {
    console.error('Error creating data directory:', error);
  }
}

// Initialize files if they don't exist
async function initializeFiles() {
  await ensureDataDirectory();
  
  try {
    await fs.access(USERS_FILE);
    console.log('Users file exists');
  } catch {
    console.log('Creating users file with default admin');
    // Create default admin user
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const defaultUsers = {
      users: [
        {
          id: 1,
          username: 'admin',
          password: hashedPassword,
          name: 'Administrator',
          role: 'admin',
          createdAt: new Date().toISOString()
        }
      ]
    };
    await fs.writeFile(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
  }

  try {
    await fs.access(ENTRIES_FILE);
    console.log('Entries file exists');
  } catch {
    console.log('Creating entries file');
    await fs.writeFile(ENTRIES_FILE, JSON.stringify({ entries: [] }, null, 2));
  }
}

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// ===== API ROUTES =====

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const data = await fs.readFile(USERS_FILE, 'utf8');
    const { users } = JSON.parse(data);
    
    const user = users.find(u => u.username === username);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    const token = jwt.sign(
      { id: user.id, username: user.username, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Register new user (admin only)
app.post('/api/register', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { username, password, name, role } = req.body;
    
    const data = await fs.readFile(USERS_FILE, 'utf8');
    const usersData = JSON.parse(data);
    
    // Check if user exists
    if (usersData.users.find(u => u.username === username)) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
      id: usersData.users.length + 1,
      username,
      password: hashedPassword,
      name,
      role: role || 'user',
      createdAt: new Date().toISOString()
    };
    
    usersData.users.push(newUser);
    await fs.writeFile(USERS_FILE, JSON.stringify(usersData, null, 2));
    
    res.status(201).json({ 
      message: 'User created successfully', 
      user: { id: newUser.id, username, name, role: newUser.role } 
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all users (admin only)
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const data = await fs.readFile(USERS_FILE, 'utf8');
    const { users } = JSON.parse(data);
    
    // Remove passwords from response
    const safeUsers = users.map(({ password, ...user }) => user);
    
    res.json(safeUsers);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete user (admin only)
app.delete('/api/users/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const userId = parseInt(req.params.id);
    
    const data = await fs.readFile(USERS_FILE, 'utf8');
    const usersData = JSON.parse(data);
    
    // Find user
    const userIndex = usersData.users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Prevent deleting the main admin
    if (usersData.users[userIndex].username === 'admin') {
      return res.status(400).json({ error: 'Cannot delete main admin user' });
    }
    
    // Remove user
    usersData.users.splice(userIndex, 1);
    
    // Also remove all entries by this user
    try {
      const entriesData = await fs.readFile(ENTRIES_FILE, 'utf8');
      const entries = JSON.parse(entriesData);
      entries.entries = entries.entries.filter(entry => entry.userId !== userId);
      await fs.writeFile(ENTRIES_FILE, JSON.stringify(entries, null, 2));
    } catch (error) {
      console.error('Error updating entries:', error);
      // Continue even if entries update fails
    }
    
    // Save users
    await fs.writeFile(USERS_FILE, JSON.stringify(usersData, null, 2));
    
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Save barcode entry
app.post('/api/entries', authenticateToken, async (req, res) => {
  try {
    const { barcode, date } = req.body;
    
    const data = await fs.readFile(ENTRIES_FILE, 'utf8');
    const entriesData = JSON.parse(data);
    
    const newEntry = {
      id: entriesData.entries.length + 1,
      barcode,
      date,
      userId: req.user.id,
      userName: req.user.name,
      timestamp: new Date().toISOString()
    };
    
    entriesData.entries.push(newEntry);
    await fs.writeFile(ENTRIES_FILE, JSON.stringify(entriesData, null, 2));
    
    res.status(201).json(newEntry);
  } catch (error) {
    console.error('Save entry error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's entries
app.get('/api/entries', authenticateToken, async (req, res) => {
  try {
    const data = await fs.readFile(ENTRIES_FILE, 'utf8');
    const { entries } = JSON.parse(data);
    
    // Filter entries for current user
    const userEntries = entries.filter(entry => entry.userId === req.user.id);
    
    res.json(userEntries);
  } catch (error) {
    console.error('Get entries error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all entries (admin only)
app.get('/api/entries/all', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const data = await fs.readFile(ENTRIES_FILE, 'utf8');
    const { entries } = JSON.parse(data);
    
    res.json(entries);
  } catch (error) {
    console.error('Get all entries error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Clear user's entries
app.delete('/api/entries', authenticateToken, async (req, res) => {
  try {
    const data = await fs.readFile(ENTRIES_FILE, 'utf8');
    const entriesData = JSON.parse(data);
    
    // Remove only current user's entries
    entriesData.entries = entriesData.entries.filter(entry => entry.userId !== req.user.id);
    
    await fs.writeFile(ENTRIES_FILE, JSON.stringify(entriesData, null, 2));
    
    res.json({ message: 'Entries cleared successfully' });
  } catch (error) {
    console.error('Clear entries error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Redirect root to login
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// Initialize files and start server
initializeFiles().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Data directory: ${DATA_DIR}`);
  });
});

// Update user (admin only) - allows changing username, password, name, role
app.put('/api/users/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const userId = parseInt(req.params.id);
    const { username, password, name, role } = req.body;

    const data = await fs.readFile(USERS_FILE, 'utf8');
    const usersData = JSON.parse(data);

    const userIndex = usersData.users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    const existingUser = usersData.users[userIndex];

    // Prevent renaming the main admin account
    if (existingUser.username === 'admin' && username && username !== 'admin') {
      return res.status(400).json({ error: 'Cannot rename main admin user' });
    }

    // If username change requested, ensure uniqueness
    if (username && username !== existingUser.username) {
      if (usersData.users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Username already exists' });
      }
      usersData.users[userIndex].username = username;
    }

    if (typeof name === 'string') {
      usersData.users[userIndex].name = name;
    }

    if (typeof role === 'string') {
      usersData.users[userIndex].role = role;
    }

    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      usersData.users[userIndex].password = hashed;
    }

    await fs.writeFile(USERS_FILE, JSON.stringify(usersData, null, 2));

    const { password: pw, ...safeUser } = usersData.users[userIndex];
    res.json({ message: 'User updated successfully', user: safeUser });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});