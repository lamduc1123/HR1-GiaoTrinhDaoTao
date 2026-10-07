// Cấu hình Firebase cho dự án Giáo Án HR1
// Có thể dán trực tiếp cấu hình từ Firebase Console tại đây
// hoặc nhập trực tiếp từ giao diện web (nút 'Cài đặt Firebase' trên thanh công cụ)

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCCVzWKGak26axAkWhyXsn7zt2ggxSkGUg",
  authDomain: "hr1-legal-portal.firebaseapp.com",
  databaseURL: "https://hr1-legal-portal-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "hr1-legal-portal",
  storageBucket: "hr1-legal-portal.firebasestorage.app",
  messagingSenderId: "1079991627887",
  appId: "1:1079991627887:web:0317ef1e61c3cc08579d9a"
};

class FirebaseConfigManager {
  static STORAGE_KEY = "hr1_firebase_config";

  static getConfig() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.apiKey && parsed.projectId) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Lỗi đọc Firebase config từ localStorage:", e);
    }
    return DEFAULT_FIREBASE_CONFIG;
  }

  static saveConfig(config) {
    if (!config || !config.apiKey || !config.projectId) {
      throw new Error("Cấu hình Firebase không hợp lệ (cần ít nhất apiKey và projectId)");
    }
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(config));
  }

  static resetConfig() {
    localStorage.removeItem(this.STORAGE_KEY);
  }

  static isConfigured() {
    const cfg = this.getConfig();
    return Boolean(cfg && cfg.apiKey && cfg.projectId && cfg.apiKey.trim().length > 5);
  }
}

window.FirebaseConfigManager = FirebaseConfigManager;
