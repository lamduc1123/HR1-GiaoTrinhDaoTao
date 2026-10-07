// Hệ thống Quản lý Người dùng & Phân quyền Biên tập (RBAC)
// Dự án Giáo Án HR1Vietnam Holdings

const USER_ROLES = {
  ADMIN: "admin",       // Toàn quyền: sửa mọi giảng viên, cấu trúc slide, rollback phiên bản
  SPEAKER: "speaker",   // Giảng viên: chỉ được sửa giáo án của chính mình
  VIEWER: "viewer"      // Người xem / Sinh viên: chỉ xem, tự động đồng bộ bản mới nhất
};

// Danh mục tài khoản / giảng viên mặc định
const PRESET_ACCOUNTS = {
  admin: {
    id: "admin",
    name: "Quản Trị Viên (Admin)",
    email: "admin@hr1vietnam.com",
    role: USER_ROLES.ADMIN,
    speakerId: null,
    avatar: "👑",
    pin: "1234"
  },
  haiha: {
    id: "haiha",
    name: "Hải Hà",
    email: "haiha@hr1vietnam.com",
    role: USER_ROLES.SPEAKER,
    speakerId: "haiha",
    avatar: "👩‍💼",
    pin: "1111"
  },
  quynhmai: {
    id: "quynhmai",
    name: "Quỳnh Mai",
    email: "quynhmai@hr1vietnam.com",
    role: USER_ROLES.SPEAKER,
    speakerId: "quynhmai",
    avatar: "👩‍🏫",
    pin: "2222"
  },
  maianh: {
    id: "maianh",
    name: "Mai Anh",
    email: "maianh@hr1vietnam.com",
    role: USER_ROLES.SPEAKER,
    speakerId: "maianh",
    avatar: "👩‍💻",
    pin: "3333"
  },
  viewer: {
    id: "viewer",
    name: "Học Viên / Khách Xem",
    email: "viewer@hr1vietnam.com",
    role: USER_ROLES.VIEWER,
    speakerId: null,
    avatar: "🎓",
    pin: ""
  }
};

class AuthManager {
  static STORAGE_USER_KEY = "hr1_current_user";
  static listeners = [];
  static currentUser = null;

  static init() {
    try {
      const saved = localStorage.getItem(this.STORAGE_USER_KEY);
      if (saved) {
        this.currentUser = JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Lỗi nạp phiên đăng nhập:", e);
    }

    if (!this.currentUser) {
      // Mặc định ban đầu là Viewer hoặc Giảng viên Hải Hà
      this.currentUser = PRESET_ACCOUNTS.viewer;
      this.persistUser();
    }

    return this.currentUser;
  }

  static getCurrentUser() {
    if (!this.currentUser) {
      this.init();
    }
    return this.currentUser;
  }

  static persistUser() {
    if (this.currentUser) {
      localStorage.setItem(this.STORAGE_USER_KEY, JSON.stringify(this.currentUser));
    } else {
      localStorage.removeItem(this.STORAGE_USER_KEY);
    }
  }

  static subscribe(fn) {
    if (typeof fn === "function") {
      this.listeners.push(fn);
      fn(this.currentUser);
    }
  }

  static notifyListeners() {
    this.listeners.forEach(fn => {
      try {
        fn(this.currentUser);
      } catch (e) {
        console.error("Auth listener error:", e);
      }
    });
  }

  // Đăng nhập nhanh bằng mã PIN hoặc chọn profile
  static loginPreset(accountId, pinInput = "") {
    const acc = PRESET_ACCOUNTS[accountId];
    if (!acc) throw new Error("Tài khoản không tồn tại");

    if (acc.pin && acc.pin !== pinInput.trim()) {
      throw new Error("Mã PIN không chính xác (Mặc định: Admin '1234', Giảng viên '1111'/'2222'/'3333')");
    }

    this.currentUser = { ...acc };
    this.persistUser();
    this.notifyListeners();
    return this.currentUser;
  }

  // Đăng nhập bằng Firebase Auth User
  static setFirebaseUser(fbUser, customRole = null, speakerId = null) {
    if (!fbUser) {
      this.logout();
      return;
    }

    // Tự động phân loại role theo email nếu khớp
    let role = customRole || USER_ROLES.VIEWER;
    let assignedSpeakerId = speakerId;

    const email = (fbUser.email || "").toLowerCase();
    if (email.includes("admin")) {
      role = USER_ROLES.ADMIN;
    } else if (email.includes("haiha")) {
      role = USER_ROLES.SPEAKER;
      assignedSpeakerId = "haiha";
    } else if (email.includes("quynhmai")) {
      role = USER_ROLES.SPEAKER;
      assignedSpeakerId = "quynhmai";
    } else if (email.includes("maianh")) {
      role = USER_ROLES.SPEAKER;
      assignedSpeakerId = "maianh";
    }

    this.currentUser = {
      id: fbUser.uid,
      name: fbUser.displayName || fbUser.email.split("@")[0] || "Người dùng Firebase",
      email: fbUser.email,
      role: role,
      speakerId: assignedSpeakerId,
      avatar: fbUser.photoURL || (role === USER_ROLES.ADMIN ? "👑" : "👩‍💼"),
      isFirebase: true
    };

    this.persistUser();
    this.notifyListeners();
  }

  static logout() {
    this.currentUser = PRESET_ACCOUNTS.viewer;
    this.persistUser();
    this.notifyListeners();
  }

  // === KIỂM TRA PHÂN QUYỀN (PERMISSION CHECKS) ===

  // Kiểm tra xem user hiện tại có quyền sửa nội dung của speakerId này không
  static canEditSpeaker(targetSpeakerId) {
    const user = this.getCurrentUser();
    if (!user) return false;

    // Admin có quyền sửa tất cả các giảng viên
    if (user.role === USER_ROLES.ADMIN) return true;

    // Giảng viên chỉ được sửa tab của CHÍNH MÌNH
    if (user.role === USER_ROLES.SPEAKER) {
      return Boolean(user.speakerId && user.speakerId === targetSpeakerId);
    }

    // Viewer không được sửa bất kỳ ai
    return false;
  }

  // Kiểm tra quyền chỉnh sửa cấu trúc chung (thêm/xóa slide, đổi ảnh, timeline)
  static canManageStructure() {
    const user = this.getCurrentUser();
    return Boolean(user && user.role === USER_ROLES.ADMIN);
  }

  // Kiểm tra quyền khôi phục phiên bản (Rollback)
  static canRollback() {
    const user = this.getCurrentUser();
    return Boolean(user && user.role === USER_ROLES.ADMIN);
  }

  // Lấy mô tả vai trò hiển thị đẹp mắt
  static getRoleBadgeText() {
    const user = this.getCurrentUser();
    if (!user) return "Khách";
    if (user.role === USER_ROLES.ADMIN) return "👑 Quản trị viên (Admin)";
    if (user.role === USER_ROLES.SPEAKER) {
      const spName = PRESET_ACCOUNTS[user.speakerId]?.name || user.speakerId;
      return `👩‍💼 Giảng viên: ${spName}`;
    }
    return "🎓 Học viên (Chỉ xem)";
  }
}

window.USER_ROLES = USER_ROLES;
window.PRESET_ACCOUNTS = PRESET_ACCOUNTS;
window.AuthManager = AuthManager;
