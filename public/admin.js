let currentUser = null;

// Check if user is admin
function checkAdminAuth() {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');
  
  if (!token || !user) {
    window.location.href = '/login.html';
    return false;
  }
  
  currentUser = JSON.parse(user);
  
  // Redirect if not admin
  if (currentUser.role !== 'admin') {
    window.location.href = '/dashboard.html';
    return false;
  }
  
  document.getElementById('userDisplay').textContent = `Welcome, ${currentUser.name} (Admin)`;
  return true;
}

// Load all users
async function loadUsers() {
  const token = localStorage.getItem('token');
  
  try {
    const response = await fetch('/api/users', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.ok) {
      const users = await response.json();
      displayUsers(users);
      updateStats(users);
    } else if (response.status === 401 || response.status === 403) {
      logout();
    } else {
      showMessage('Failed to load users', 'error');
    }
  } catch (error) {
    console.error('Error loading users:', error);
    showMessage('Error loading users', 'error');
  }
}

// Display users in table
function displayUsers(users) {
  const tbody = document.getElementById('usersTableBody');
  
  if (users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">No users found</td></tr>';
    return;
  }
  
  tbody.innerHTML = users.map(user => `
    <tr>
      <td>#${user.id}</td>
      <td><strong>${escapeHtml(user.username)}</strong></td>
      <td>${escapeHtml(user.name)}</td>
      <td>
        <span class="role-badge ${user.role === 'admin' ? 'role-admin' : 'role-user'}">
          ${user.role}
        </span>
      </td>
      <td>${new Date(user.createdAt).toLocaleDateString()}</td>
      <td>
            ${user.username !== 'admin' ? `
              <button class="delete-btn" onclick="deleteUser(${user.id})" 
                ${user.id === currentUser.id ? 'disabled title="Cannot delete yourself"' : ''}>
                Delete
              </button>
              <button class="delete-btn" style="margin-left:8px; background:#2563eb;" onclick="editUser(${user.id})">
                Edit
              </button>
            ` : '<span style="color:#94a3b8;">System</span>'}
      </td>
    </tr>
  `).join('');
}

    // Edit user (username and password)
    async function editUser(userId) {
      const token = localStorage.getItem('token');

      try {
        // Fetch users to find current values
        const resp = await fetch('/api/users', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!resp.ok) {
          if (resp.status === 401 || resp.status === 403) return logout();
          showMessage('Failed to fetch user details', 'error');
          return;
        }

        const users = await resp.json();
        const user = users.find(u => u.id === userId);
        if (!user) {
          showMessage('User not found', 'error');
          return;
        }

        const newUsername = prompt(`Enter new username for ${user.username}:`, user.username);
        if (newUsername === null) return; // cancelled
        const newPassword = prompt('Enter new password (leave blank to keep current):', '');
        if (newPassword === null) return; // cancelled

        const body = {};
        if (newUsername.trim() && newUsername.trim() !== user.username) body.username = newUsername.trim();
        if (newPassword) body.password = newPassword;

        if (Object.keys(body).length === 0) {
          showMessage('No changes provided', 'error');
          return;
        }

        const updateResp = await fetch(`/api/users/${userId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(body)
        });

        const data = await updateResp.json();
        if (updateResp.ok) {
          showMessage('User updated successfully', 'success');
          loadUsers();
        } else {
          showMessage(data.error || 'Failed to update user', 'error');
        }
      } catch (error) {
        console.error('Error editing user:', error);
        showMessage('Error editing user', 'error');
      }
    }

// Update statistics
function updateStats(users) {
  document.getElementById('totalUsers').textContent = users.length;
  
  // Calculate users created today
  const today = new Date().toDateString();
  const activeToday = users.filter(user => 
    new Date(user.createdAt).toDateString() === today
  ).length;
  
  document.getElementById('activeToday').textContent = activeToday;
}

// Create new user
async function createUser() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const name = document.getElementById('name').value.trim();
  const role = document.getElementById('role').value;
  
  if (!username || !password || !name) {
    showMessage('Please fill all fields', 'error');
    return;
  }
  
  const token = localStorage.getItem('token');
  
  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ username, password, name, role })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      showMessage(`User ${username} created successfully!`, 'success');
      // Clear form
      document.getElementById('username').value = '';
      document.getElementById('password').value = '';
      document.getElementById('name').value = '';
      document.getElementById('role').value = 'user';
      // Reload users list
      loadUsers();
    } else {
      showMessage(data.error || 'Failed to create user', 'error');
    }
  } catch (error) {
    console.error('Error creating user:', error);
    showMessage('Error creating user', 'error');
  }
}

// Delete user
async function deleteUser(userId) {
  if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
    return;
  }
  
  const token = localStorage.getItem('token');
  
  try {
    const response = await fetch(`/api/users/${userId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (response.ok) {
      showMessage('User deleted successfully', 'success');
      loadUsers();
    } else {
      const data = await response.json();
      showMessage(data.error || 'Failed to delete user', 'error');
    }
  } catch (error) {
    console.error('Error deleting user:', error);
    showMessage('Error deleting user', 'error');
  }
}

// Show message
function showMessage(text, type) {
  const messageDiv = document.getElementById('message');
  messageDiv.textContent = text;
  messageDiv.className = `message ${type}`;
  
  // Auto hide after 3 seconds
  setTimeout(() => {
    messageDiv.style.display = 'none';
  }, 3000);
}

// Escape HTML
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe.replace(/[&<>"']/g, function(m) {
    if(m === '&') return '&amp;';
    if(m === '<') return '&lt;';
    if(m === '>') return '&gt;';
    if(m === '"') return '&quot;';
    return '&#039;';
  });
}

// Logout
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login.html';
}

// Initialize
async function init() {
  if (!checkAdminAuth()) return;
  await loadUsers();
}

// Add delete user endpoint to server.js
// We'll need to add this to backend/server.js

document.addEventListener('DOMContentLoaded', init);