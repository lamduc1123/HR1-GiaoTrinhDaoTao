// Hệ thống Đồng bộ Đám mây Firebase & Quản lý Phiên bản (Realtime Cloud Sync & Versioning)
// Hỗ trợ cả Firebase Realtime Database và Cloud Firestore
// Dự án Giáo Án HR1Vietnam Holdings

class CloudDB {
  static isFirebaseInitialized = false;
  static rtdb = null;      // Firebase Realtime Database (Ưu tiên)
  static firestore = null; // Cloud Firestore (Dự phòng)
  static auth = null;
  static unsubscribeCurriculum = null;
  static syncStatusListeners = [];
  static remoteUpdateListeners = [];

  static STATUS = {
    DISCONNECTED: "disconnected", // Chưa cấu hình Firebase / Offline mode
    CONNECTING: "connecting",
    CONNECTED: "connected",       // Đang kết nối Realtime
    SYNCING: "syncing",
    ERROR: "error"
  };

  static currentStatus = CloudDB.STATUS.DISCONNECTED;

  // Khởi tạo Firebase SDK
  static async init() {
    const config = window.FirebaseConfigManager ? window.FirebaseConfigManager.getConfig() : null;

    if (!config || !config.apiKey || !config.projectId) {
      console.log("ℹ️ Firebase chưa được cấu hình. Hệ thống chạy ở chế độ Cục bộ (Local Mode).");
      this.setStatus(this.STATUS.DISCONNECTED, "Chế độ Cục bộ (Chưa kết nối Firebase)");
      return false;
    }

    try {
      this.setStatus(this.STATUS.CONNECTING, "Đang kết nối tới Firebase...");

      // Kiểm tra sự tồn tại của thư viện Firebase SDK toàn cục
      if (!window.firebase) {
        throw new Error("Thư viện Firebase SDK chưa được tải từ CDN");
      }

      // Khởi tạo Firebase App nếu chưa có
      if (!firebase.apps.length) {
        firebase.initializeApp(config);
      }

      // Khởi tạo Realtime Database (ưu tiên nếu có databaseURL và SDK)
      if (firebase.database && config.databaseURL) {
        this.rtdb = firebase.database();
        console.log("🔥 Đã kết nối Firebase Realtime Database:", config.databaseURL);
      }

      // Khởi tạo Firestore nếu có SDK
      if (firebase.firestore) {
        try {
          this.firestore = firebase.firestore();
        } catch (e) {
          console.warn("Firestore không sẵn sàng:", e);
        }
      }

      if (firebase.auth) {
        this.auth = firebase.auth();
        this.auth.onAuthStateChanged((user) => {
          if (user && window.AuthManager) {
            window.AuthManager.setFirebaseUser(user);
          }
        });
      }

      this.isFirebaseInitialized = Boolean(this.rtdb || this.firestore);

      if (!this.isFirebaseInitialized) {
        throw new Error("Không thể khởi tạo cơ sở dữ liệu Firebase (cả Realtime Database và Firestore đều không khả dụng)");
      }

      this.setStatus(this.STATUS.CONNECTED, "Đã kết nối Firebase (Đồng bộ thời gian thực)");

      // Bắt đầu lắng nghe dữ liệu thời gian thực
      this.listenToCurriculumUpdates();

      return true;
    } catch (err) {
      console.error("Lỗi kết nối Firebase:", err);
      this.setStatus(this.STATUS.ERROR, `Lỗi Firebase: ${err.message}`);
      return false;
    }
  }

  static setStatus(status, message = "") {
    this.currentStatus = status;
    this.syncStatusListeners.forEach(fn => {
      try { fn(status, message); } catch(e) {}
    });
  }

  static onStatusChange(fn) {
    if (typeof fn === "function") {
      this.syncStatusListeners.push(fn);
      fn(this.currentStatus, "");
    }
  }

  static onRemoteUpdate(fn) {
    if (typeof fn === "function") {
      this.remoteUpdateListeners.push(fn);
    }
  }

  // === REALTIME LISTENER CHO GIÁO ÁN ===
  static listenToCurriculumUpdates() {
    // 1. Ưu tiên Realtime Database
    if (this.rtdb) {
      const ref = this.rtdb.ref("curriculums/ca1_holding");
      ref.on("value", (snapshot) => {
        const data = snapshot.val();
        if (data) {
          console.log("⚡ Nhận cập nhật thời gian thực từ Realtime Database:", data.updatedBy);
          this.remoteUpdateListeners.forEach(fn => {
            try { fn(data); } catch(e) { console.error("Lỗi xử lý remote update:", e); }
          });
        } else {
          console.log("Tài liệu giáo án chưa có trên Realtime DB, sẽ khởi tạo khi lưu lần đầu.");
        }
      }, (error) => {
        console.error("Lỗi Realtime DB listener:", error);
        this.setStatus(this.STATUS.ERROR, `Lỗi đồng bộ: ${error.message}`);
      });
      return;
    }

    // 2. Dự phòng Cloud Firestore
    if (this.firestore) {
      if (this.unsubscribeCurriculum) {
        this.unsubscribeCurriculum();
      }
      const docRef = this.firestore.collection("curriculums").doc("ca1_holding");
      this.unsubscribeCurriculum = docRef.onSnapshot(
        (doc) => {
          if (doc.exists) {
            const data = doc.data();
            console.log("⚡ Nhận cập nhật thời gian thực từ Firestore:", data.updatedBy);
            this.remoteUpdateListeners.forEach(fn => {
              try { fn(data); } catch(e) { console.error("Lỗi xử lý remote update:", e); }
            });
          }
        },
        (error) => {
          console.error("Lỗi Firestore listener:", error);
          this.setStatus(this.STATUS.ERROR, `Lỗi đồng bộ: ${error.message}`);
        }
      );
    }
  }

  // === LƯU DỮ LIỆU & GHI NHẬN PHIÊN BẢN MỚI ===
  static async saveCurriculum(payload, changeSummary = "") {
    const user = window.AuthManager ? window.AuthManager.getCurrentUser() : { name: "Ẩn danh", role: "admin" };

    const timestamp = Date.now();
    const versionTag = "v" + new Date().toISOString().slice(2, 10).replace(/-/g, "") + "." + Math.floor(timestamp % 10000);

    const docData = {
      ...payload,
      versionTag: versionTag,
      updatedAt: timestamp,
      updatedBy: {
        id: user.id || "guest",
        name: user.name || "Người dùng",
        email: user.email || "",
        role: user.role || "speaker",
        speakerId: user.speakerId || null
      },
      lastChangeSummary: changeSummary || `Cập nhật bởi ${user.name}`
    };

    // 1. Lưu dự phòng LocalStorage
    this.saveToLocalStorage(docData);

    const versionRecord = {
      versionTag: versionTag,
      timestamp: timestamp,
      createdAtStr: new Date(timestamp).toLocaleString("vi-VN"),
      author: docData.updatedBy,
      changeSummary: docData.lastChangeSummary,
      snapshot: docData
    };

    // 2. Ghi lên Firebase (Realtime Database hoặc Firestore)
    if (this.isFirebaseInitialized) {
      try {
        this.setStatus(this.STATUS.SYNCING, "Đang đồng bộ lên đám mây...");

        if (this.rtdb) {
          // Ghi dữ liệu chính
          await this.rtdb.ref("curriculums/ca1_holding").set(docData);
          // Ghi bản ghi phiên bản
          await this.rtdb.ref("curriculum_versions").push(versionRecord);
        } else if (this.firestore) {
          await this.firestore.collection("curriculums").doc("ca1_holding").set(docData);
          await this.firestore.collection("curriculum_versions").add(versionRecord);
        }

        this.setStatus(this.STATUS.CONNECTED, `Đã đồng bộ phiên bản ${versionTag} lên đám mây!`);
        return { success: true, versionTag, online: true };
      } catch (err) {
        console.error("Lỗi khi đẩy lên Firebase:", err);
        this.setStatus(this.STATUS.ERROR, `Lỗi đồng bộ: ${err.message}`);
        this.saveLocalVersionRecord(versionRecord);
        return { success: true, versionTag, online: false, error: err.message };
      }
    } else {
      this.saveLocalVersionRecord(versionRecord);
      return { success: true, versionTag, online: false };
    }
  }

  // === LỊCH SỬ PHIÊN BẢN (VERSION HISTORY) ===
  static async getVersionHistory() {
    if (this.isFirebaseInitialized) {
      try {
        if (this.rtdb) {
          const snapshot = await this.rtdb.ref("curriculum_versions")
            .orderByChild("timestamp")
            .limitToLast(30)
            .once("value");

          const list = [];
          snapshot.forEach((child) => {
            list.unshift({ id: child.key, ...child.val() });
          });
          return list;
        } else if (this.firestore) {
          const querySnapshot = await this.firestore.collection("curriculum_versions")
            .orderBy("timestamp", "desc")
            .limit(30)
            .get();

          const list = [];
          querySnapshot.forEach(doc => {
            list.push({ id: doc.id, ...doc.data() });
          });
          return list;
        }
      } catch (e) {
        console.warn("Không thể lấy versions từ Firebase, đọc từ LocalStorage:", e);
      }
    }

    return this.getLocalVersionRecords();
  }

  // === KHÔI PHỤC PHIÊN BẢN (ROLLBACK) ===
  static async rollbackToVersion(versionRecord) {
    if (!window.AuthManager || !window.AuthManager.canRollback()) {
      throw new Error("Chỉ Quản trị viên (Admin) mới có quyền khôi phục phiên bản!");
    }

    if (!versionRecord || !versionRecord.snapshot) {
      throw new Error("Dữ liệu phiên bản không hợp lệ để khôi phục");
    }

    const summary = `Khôi phục về phiên bản [${versionRecord.versionTag}] (tạo lúc ${versionRecord.createdAtStr})`;
    return await this.saveCurriculum(versionRecord.snapshot, summary);
  }

  // Local Storage Helpers
  static saveToLocalStorage(data) {
    try {
      localStorage.setItem("hr1_curriculum_cache", JSON.stringify(data));
      if (data.userEdits) localStorage.setItem("hutechLectureEdits", JSON.stringify(data.userEdits));
      if (data.customSections) localStorage.setItem("hutechCustomSections", JSON.stringify(data.customSections));
      if (data.timeEdits) localStorage.setItem("hutechTimeEdits", JSON.stringify(data.timeEdits));
      if (data.hiddenSections) localStorage.setItem("hutechHiddenSections", JSON.stringify(data.hiddenSections));
      if (data.customSpeakers) localStorage.setItem("hutechCustomSpeakers", JSON.stringify(data.customSpeakers));
      if (data.slideImageEdits) localStorage.setItem("hutechSlideImageEdits", JSON.stringify(data.slideImageEdits));
    } catch (e) {}
  }

  static getLocalCurriculum() {
    try {
      const cached = localStorage.getItem("hr1_curriculum_cache");
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return null;
  }

  static saveLocalVersionRecord(record) {
    try {
      const records = this.getLocalVersionRecords();
      records.unshift(record);
      const trimmed = records.slice(0, 25);
      localStorage.setItem("hr1_local_versions", JSON.stringify(trimmed));
    } catch (e) {}
  }

  static getLocalVersionRecords() {
    try {
      const saved = localStorage.getItem("hr1_local_versions");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  }
}

window.CloudDB = CloudDB;
