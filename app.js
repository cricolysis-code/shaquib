// SecureID Demo Application
// Prototype implementation using localStorage for persistence
// In production: replace with proper backend, database, and security measures

const SecureID = {
  // Initialize demo data
  init() {
    // Always recreate default admin for demo
    const users = this.getAllUsers();
    const adminIndex = users.findIndex(u => u.email === 'admin@secureid.gov');
    if (adminIndex !== -1) {
      users.splice(adminIndex, 1);
    }
    this.register({
      name: 'System Administrator',
      email: 'admin@secureid.gov',
      password: 'Admin@2025',
      role: 'admin',
      active: true
    });
  },

  // Hash password (simulated - in production use bcrypt)
  hashPassword(password) {
    // Simple simulation for demo - NOT SECURE
    return btoa(password); // Base64 encode for demo
  },

  // Verify password
  verifyPassword(password, hash) {
    return this.hashPassword(password) === hash;
  },

  // Generate unique ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  // User management
  register(userData) {
    const users = this.getAllUsers();
    if (users.find(u => u.email === userData.email)) {
      return { ok: false, msg: 'Email already registered' };
    }

    const user = {
      id: this.generateId(),
      name: userData.name,
      email: userData.email,
      passwordHash: this.hashPassword(userData.password),
      role: userData.role || 'member',
      active: userData.active !== false,
      createdAt: Date.now(),
      phone: userData.phone || '',
      mockId: userData.mockId || ''
    };

    users.push(user);
    localStorage.setItem('secureid_users', JSON.stringify(users));
    return { ok: true, user };
  },

  login(credentials) {
    const users = this.getAllUsers();
    const user = users.find(u =>
      u.email === credentials.email &&
      this.verifyPassword(credentials.password, u.passwordHash) &&
      u.role === credentials.role &&
      u.active
    );

    if (!user) {
      return { ok: false, msg: 'Invalid credentials or account inactive' };
    }

    // Create session
    const session = {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      loginTime: Date.now()
    };

    sessionStorage.setItem('secureid_session', JSON.stringify(session));
    return { ok: true };
  },

  logout() {
    const session = this.getSession();
    sessionStorage.removeItem('secureid_session');
    // Revoke user's active codes
    if (session) {
      this.revokeUserCodes(session.userId);
    }
    window.location.href = 'login.html';
  },

  getSession() {
    const session = sessionStorage.getItem('secureid_session');
    return session ? JSON.parse(session) : null;
  },

  requireAuth(requiredRole) {
    const session = this.getSession();
    if (!session || session.role !== requiredRole) {
      window.location.href = 'login.html';
      return null;
    }
    return session;
  },

  getProfile(userId) {
    const users = this.getAllUsers();
    return users.find(u => u.id === userId) || null;
  },

  updateProfile(userId, updates) {
    const users = this.getAllUsers();
    const user = users.find(u => u.id === userId);
    if (!user) return { ok: false, msg: 'User not found' };

    Object.assign(user, updates);
    localStorage.setItem('secureid_users', JSON.stringify(users));
    return { ok: true };
  },

  getAllUsers() {
    const data = localStorage.getItem('secureid_users');
    return data ? JSON.parse(data) : [];
  },

  toggleUserActive(userId) {
    const users = this.getAllUsers();
    const user = users.find(u => u.id === userId);
    if (!user || user.role === 'admin') {
      return { ok: false, msg: 'Cannot modify admin or user not found' };
    }

    user.active = !user.active;
    localStorage.setItem('secureid_users', JSON.stringify(users));

    // Revoke codes if deactivating
    if (!user.active) {
      this.revokeUserCodes(userId);
    }

    return { ok: true, active: user.active };
  },

  deleteUser(userId) {
    const users = this.getAllUsers();
    const index = users.findIndex(u => u.id === userId);
    if (index === -1 || users[index].role === 'admin') {
      return { ok: false, msg: 'Cannot delete admin or user not found' };
    }

    users.splice(index, 1);
    localStorage.setItem('secureid_users', JSON.stringify(users));

    // Clean up codes
    this.revokeUserCodes(userId);

    return { ok: true };
  },

  // Statistics
  getStats() {
    const users = this.getAllUsers();
    const codes = this.getAllCodes();

    const now = Date.now();
    const activeCodes = codes.filter(c => now < c.expiresAt);

    return {
      totalUsers: users.length,
      activeUsers: users.filter(u => u.active).length,
      admins: users.filter(u => u.role === 'admin').length,
      activeCodes: activeCodes.length,
      expiredCodes: codes.length - activeCodes.length
    };
  },

  // Share codes
  generateCode() {
    const session = this.getSession();
    if (!session) return { ok: false, msg: 'Not logged in' };

    // Revoke existing code for this user
    this.revokeUserCodes(session.userId);

    const code = this.generateRandomCode();
    const codeData = {
      code,
      userId: session.userId,
      createdAt: Date.now(),
      expiresAt: Date.now() + (30 * 60 * 1000), // 30 minutes
      verifyCount: 0
    };

    const codes = this.getAllCodes();
    codes.push(codeData);
    localStorage.setItem('secureid_codes', JSON.stringify(codes));

    return { ok: true, code };
  },

  generateRandomCode() {
    const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ';
    const digits = '23456789';
    let result = '';
    // First 2: letters
    for (let i = 0; i < 2; i++) {
      result += letters.charAt(Math.floor(Math.random() * letters.length));
    }
    // Last 4: digits
    for (let i = 0; i < 4; i++) {
      result += digits.charAt(Math.floor(Math.random() * digits.length));
    }
    return result;
  },

  verifyCode(code) {
    const codes = this.getAllCodes();
    const codeData = codes.find(c => c.code === code && Date.now() < c.expiresAt);

    if (!codeData) {
      return { ok: false, msg: 'Invalid or expired code' };
    }

    // Get user data
    const user = this.getProfile(codeData.userId);
    if (!user) {
      return { ok: false, msg: 'User not found' };
    }

    // Increment verify count
    codeData.verifyCount++;
    localStorage.setItem('secureid_codes', JSON.stringify(codes));

    return {
      ok: true,
      identity: {
        name: user.name,
        email: user.email,
        mockId: user.mockId,
        phone: user.phone,
        role: user.role,
        memberSince: new Date(user.createdAt).toLocaleDateString()
      },
      codeInfo: {
        expiresAt: new Date(codeData.expiresAt).toLocaleString(),
        verifyCount: codeData.verifyCount
      }
    };
  },

  getAllCodes() {
    const data = localStorage.getItem('secureid_codes');
    return data ? JSON.parse(data) : [];
  },

  revokeUserCodes(userId) {
    const codes = this.getAllCodes();
    const filtered = codes.filter(c => c.userId !== userId);
    localStorage.setItem('secureid_codes', JSON.stringify(filtered));
  },

  revokeCode(userId) {
    this.revokeUserCodes(userId);
    return { ok: true };
  },

  getUserActiveCode(userId) {
    const codes = this.getAllCodes();
    return codes.find(c => c.userId === userId && Date.now() < c.expiresAt) || null;
  }
};

// Initialize on load
SecureID.init();
