# GIÁO ÁN CA 1 HR1VIETNAM HOLDINGS — CLOUD REALTIME & PHÂN QUYỀN

Hệ thống giáo án điện tử đa thiết bị, tích hợp **Firebase Firestore Realtime Sync**, **Phân quyền biên tập theo Giảng viên (RBAC)** và **Quản lý lịch sử phiên bản (Version History & Rollback)**.

---

## 🌟 Điểm nổi bật trong kiến trúc mới

1. **Phân quyền độc lập theo Giảng viên (RBAC)**:
   - **Giảng viên (Hải Hà, Quỳnh Mai, Mai Anh, ...)**: Chỉ có quyền chỉnh sửa giáo án trong tab của **chính mình**. Khi chuyển sang tab của giảng viên khác, giao diện tự động chuyển sang chế độ **Chỉ xem (Read-only)** kèm thông báo khóa quyền.
   - **Quản trị viên (Admin)**: Toàn quyền chỉnh sửa mọi giảng viên, sửa cấu trúc slide, thay ảnh, đổi timeline và khôi phục (Rollback) phiên bản.
   - **Học viên / Khách xem (Viewer)**: Không hiển thị nút chỉnh sửa; tự động nhận các cập nhật mới nhất từ giảng viên theo thời gian thực.

2. **Đồng bộ thời gian thực đa thiết bị (Firebase Firestore)**:
   - Khi bất kỳ ai chỉnh sửa và bấm lưu: dữ liệu đẩy thẳng lên Firestore.
   - Toàn bộ máy học viên và giảng viên khác đang mở trang sẽ **tự động đồng bộ ngay lập tức** mà không cần reload trang.
   - Chế độ **Offline / Local Mode dự phòng**: Nếu chưa kết nối Firebase hoặc mất mạng, hệ thống vẫn hoạt động mượt mà bằng LocalStorage mà không bao giờ bị lỗi.

3. **Ghi nhận lịch sử phiên bản (Version History)**:
   - Mỗi lần lưu sẽ tự động sinh một mã phiên bản (vd: `v261006.1284`), lưu lại thời gian, người thực hiện, ghi chú thay đổi và bản chụp (snapshot) dữ liệu.
   - Có cửa sổ **"Lịch sử"** xem timeline và cho phép Admin **Khôi phục (Rollback)** về bất kỳ phiên bản nào trước đó.

---

## 👥 Danh sách tài khoản & Mã PIN xác thực mặc định

Bạn có thể bấm vào huy hiệu vai trò ở góc trên bên phải để đổi tài khoản:

| Vai trò | Tên hiển thị | Quyền hạn | Mã PIN mặc định |
| :--- | :--- | :--- | :--- |
| **Admin** | Quản Trị Viên | Toàn quyền tất cả các tab + cấu trúc slide + Rollback | `1234` |
| **Giảng viên** | Hải Hà | Chỉ sửa tab **Hải Hà** | `1111` |
| **Giảng viên** | Quỳnh Mai | Chỉ sửa tab **Quỳnh Mai** | `2222` |
| **Giảng viên** | Mai Anh | Chỉ sửa tab **Mai Anh** | `3333` |
| **Học viên** | Học viên / Khách | Chỉ xem (Realtime sync) | *(Bỏ trống)* |

---

## ⚡ Hướng dẫn kết nối Firebase Cloud Sync (2 phút)

1. Mở [Firebase Console](https://console.firebase.google.com/) và bấm **Add project** (Tạo dự án mới, miễn phí).
2. Vào mục **Build > Firestore Database** > Bấm **Create database** (chọn mode *Test mode* để bắt đầu nhanh).
3. Vào **Project Settings** (biểu tượng bánh răng) > chọn tab **General** > cuộn xuống mục *Your apps* và chọn biểu tượng Web `(</>)`.
4. Copy đoạn mã JSON `firebaseConfig`:
   ```json
   {
     "apiKey": "AIzaSy...",
     "authDomain": "ten-du-an.firebaseapp.com",
     "projectId": "ten-du-an",
     "storageBucket": "ten-du-an.appspot.com",
     "messagingSenderId": "...",
     "appId": "..."
   }
   ```
5. Mở ứng dụng Giáo án trên trình duyệt, bấm vào nút trạng thái đám mây **"🟡 Chế độ Cục bộ (Local)"** ở góc trên bên trái, dán đoạn JSON vào và bấm **Lưu & Kết nối Đám mây**. Đèn báo sẽ chuyển sang **🟢 Realtime Cloud Synced**!

*(File `firestore.rules` kèm sẵn trong source code để bạn paste vào tab Rules của Firestore).*

---

## 📂 Cấu trúc mã nguồn

```
HR1_GIAO_AN_PORTABLE_SOURCE/
├── index.html               # Trang chính chứa layout, các modal đăng nhập, lịch sử, cấu hình
├── css/style.css            # Stylesheet toàn bộ ứng dụng, hiệu ứng modal & print PDF
├── js/
│   ├── data-default.js      # Dữ liệu 14 slide bài giảng gốc
│   ├── firebase-config.js   # Quản lý cấu hình kết nối Firebase
│   ├── auth.js              # Quản lý vai trò (RBAC) & phân quyền biên tập
│   ├── db.js                # Quản lý Firestore Realtime Sync, Offline cache & Versioning
│   ├── version-history.js   # Giao diện Lịch sử phiên bản & Rollback
│   └── app.js               # Logic điều khiển, render UI & Rich Text Editor
├── assets/slides/           # 14 hình ảnh slide bài giảng
├── firestore.rules          # Quy tắc bảo mật Firestore
├── start.sh                 # Script chạy local server
└── README.md                # Tài liệu hướng dẫn
```

---

## 🚀 Triển khai lên GitHub Pages / Firebase Hosting

### 1. Đưa lên GitHub & Bật GitHub Pages
```bash
git init
git add .
git commit -m "feat: Nâng cấp kiến trúc Cloud Sync, RBAC và Versioning"
git branch -M main
git remote add origin https://github.com/<username>/<repo-name>.git
git push -u origin main
```
Sau đó vào GitHub Repo: **Settings > Pages > Branch `main` / root (`/`) > Save**.

### 2. Triển khai lên Firebase Hosting (tùy chọn)
```bash
npm install -g firebase-tools
firebase login
firebase init hosting
firebase deploy
```
