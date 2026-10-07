// Quản lý Giao diện Lịch sử Phiên bản (Version History UI & Rollback)
// Dự án Giáo Án HR1Vietnam Holdings

class VersionHistoryUI {
  static modalEl = null;
  static currentVersions = [];

  static init() {
    this.modalEl = document.getElementById("versionModal");
    const openBtn = document.getElementById("versionHistoryBtn");
    const closeBtn = document.getElementById("closeVersionModal");

    if (openBtn) {
      openBtn.addEventListener("click", () => this.open());
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", () => this.close());
    }

    if (this.modalEl) {
      this.modalEl.addEventListener("click", (e) => {
        if (e.target === this.modalEl) this.close();
      });
    }
  }

  static async open() {
    if (!this.modalEl) return;
    this.modalEl.classList.add("open");
    this.modalEl.setAttribute("aria-hidden", "false");
    await this.loadAndRenderList();
  }

  static close() {
    if (!this.modalEl) return;
    this.modalEl.classList.remove("open");
    this.modalEl.setAttribute("aria-hidden", "true");
  }

  static async loadAndRenderList() {
    const listContainer = document.getElementById("versionList");
    if (!listContainer) return;

    listContainer.innerHTML = `<div class="version-loading">⏳ Đang tải lịch sử phiên bản...</div>`;

    try {
      this.currentVersions = await window.CloudDB.getVersionHistory();

      if (!this.currentVersions || !this.currentVersions.length) {
        listContainer.innerHTML = `
          <div class="version-empty">
            <p>Chưa có phiên bản nào được ghi nhận.</p>
            <small>Mỗi lần bạn hoặc giảng viên bấm "Lưu thay đổi", hệ thống sẽ tự động tạo một phiên bản mới tại đây.</small>
          </div>
        `;
        return;
      }

      const isAdmin = window.AuthManager && window.AuthManager.canRollback();

      listContainer.innerHTML = this.currentVersions.map((v, index) => {
        const dateStr = v.createdAtStr || new Date(v.timestamp).toLocaleString("vi-VN");
        const author = v.author || { name: "Hệ thống", role: "admin" };
        const authorBadge = author.role === "admin"
          ? `<span class="v-badge admin">👑 Admin: ${author.name}</span>`
          : `<span class="v-badge speaker">👩‍💼 ${author.name}</span>`;

        return `
          <div class="version-item ${index === 0 ? 'is-latest' : ''}" data-version-id="${v.id || index}">
            <div class="version-item-header">
              <div class="v-tag-row">
                <span class="v-tag">${v.versionTag || ('v1.' + (this.currentVersions.length - index))}</span>
                ${index === 0 ? '<span class="v-tag-current">Bản hiện tại</span>' : ''}
                <span class="v-time">${dateStr}</span>
              </div>
              <div class="v-author">
                ${authorBadge}
              </div>
            </div>
            <div class="version-summary">
              💬 <strong>Ghi chú:</strong> ${v.changeSummary || 'Cập nhật nội dung giáo án'}
            </div>
            <div class="version-actions">
              <button type="button" class="v-btn preview-btn" data-preview-index="${index}">👁️ Xem chi tiết</button>
              ${isAdmin && index !== 0 ? `
                <button type="button" class="v-btn rollback-btn" data-rollback-index="${index}">🔄 Khôi phục bản này</button>
              ` : ''}
            </div>
          </div>
        `;
      }).join("");

      // Gắn sự kiện cho các nút
      listContainer.querySelectorAll("[data-preview-index]").forEach(btn => {
        btn.addEventListener("click", () => {
          const idx = parseInt(btn.dataset.previewIndex, 10);
          this.previewVersion(this.currentVersions[idx]);
        });
      });

      listContainer.querySelectorAll("[data-rollback-index]").forEach(btn => {
        btn.addEventListener("click", async () => {
          const idx = parseInt(btn.dataset.rollbackIndex, 10);
          await this.confirmRollback(this.currentVersions[idx]);
        });
      });

    } catch (e) {
      listContainer.innerHTML = `<div class="version-error">❌ Lỗi khi nạp phiên bản: ${e.message}</div>`;
    }
  }

  static previewVersion(versionRecord) {
    if (!versionRecord || !versionRecord.snapshot) {
      alert("Không có dữ liệu chi tiết cho phiên bản này.");
      return;
    }
    const snap = versionRecord.snapshot;
    const author = versionRecord.author?.name || "Không rõ";
    const time = versionRecord.createdAtStr || new Date(versionRecord.timestamp).toLocaleString("vi-VN");

    const info = `
--- THÔNG TIN PHIÊN BẢN ${versionRecord.versionTag} ---
Người chỉnh sửa: ${author} (${versionRecord.author?.role || 'speaker'})
Thời gian: ${time}
Ghi chú thay đổi: ${versionRecord.changeSummary}

Số lượng slide/phần học: ${(snap.sections?.length || 14) + (snap.customSections?.length || 0)} phần
Số lượt sửa lời giảng: ${Object.keys(snap.userEdits || {}).length} đoạn

Bạn có muốn áp dụng dữ liệu phiên bản này vào màn hình xem không?
    `.trim();

    if (confirm(info + "\n\n(Bấm OK để nạp tạm vào màn hình để kiểm tra)")) {
      if (window.applyCurriculumSnapshot) {
        window.applyCurriculumSnapshot(snap, false);
        this.close();
        alert(`Đang xem tạm phiên bản ${versionRecord.versionTag}. Nếu muốn quay lại bản mới nhất, hãy tải lại trang.`);
      }
    }
  }

  static async confirmRollback(versionRecord) {
    if (!window.AuthManager || !window.AuthManager.canRollback()) {
      alert("Chỉ Quản trị viên (Admin) mới có quyền khôi phục phiên bản.");
      return;
    }

    const confirmMsg = `CẢNH BÁO: Bạn có chắc chắn muốn khôi phục toàn bộ giáo án về phiên bản [${versionRecord.versionTag}] tạo lúc ${versionRecord.createdAtStr} bởi ${versionRecord.author?.name}?\n\nThao tác này sẽ ghi đè bản mới nhất và lưu một mốc phiên bản rollback mới cho tất cả người xem.`;

    if (!confirm(confirmMsg)) return;

    try {
      const res = await window.CloudDB.rollbackToVersion(versionRecord);
      if (res.success) {
        alert(`Thành công! Đã khôi phục về phiên bản [${versionRecord.versionTag}]. Mã phiên bản mới là: ${res.versionTag}`);
        this.close();
        if (window.applyCurriculumSnapshot) {
          window.applyCurriculumSnapshot(versionRecord.snapshot, true);
        }
      }
    } catch (e) {
      alert("Lỗi khôi phục: " + e.message);
    }
  }
}

window.VersionHistoryUI = VersionHistoryUI;
