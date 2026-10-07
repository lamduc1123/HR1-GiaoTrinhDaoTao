// Ứng dụng Quản lý Giáo Án HR1Vietnam Holdings — Phiên bản Đám mây & Phân quyền Biên tập
// Tích hợp: Realtime Firebase Firestore + RBAC Role Permissions + Version History

(function() {
  // 1. Dữ liệu mặc định
  const sections = window.defaultSections || [];
  const slideImages = {
    "1": "assets/slides/slide-01.png",
    "2": "assets/slides/slide-02.png",
    "3": "assets/slides/slide-03.png",
    "4": "assets/slides/slide-04.png",
    "5": "assets/slides/slide-05.png",
    "6": "assets/slides/slide-06.png",
    "7": "assets/slides/slide-07.png",
    "8": "assets/slides/slide-08.png",
    "9": "assets/slides/slide-09.png",
    "10": "assets/slides/slide-10.png",
    "11": "assets/slides/slide-11.png",
    "12": "assets/slides/slide-12.png",
    "13": "assets/slides/slide-13.png",
    "14": "assets/slides/slide-14.png"
  };

  // 2. Trạng thái ứng dụng
  let userEdits = {};
  let customSections = [];
  let timeEdits = {};
  let slideImageEdits = {};
  let hiddenSections = [];
  let customSpeakers = [];

  const baseSpeakers = {
    haiha: { name: "Hải Hà", initials: "HH" },
    quynhmai: { name: "Quỳnh Mai", initials: "QM" },
    maianh: { name: "Mai Anh", initials: "MA" }
  };
  let speakers = { ...baseSpeakers };
  let currentSpeaker = localStorage.getItem("hutechSpeaker") || "haiha";
  let isEditing = false;
  let hasPendingRemoteChanges = false;
  let remotePendingData = null;

  // Nạp dữ liệu từ LocalStorage cache ban đầu
  function loadLocalInitialState() {
    try { userEdits = JSON.parse(localStorage.getItem("hutechLectureEdits") || "{}"); } catch(e) {}
    try { customSections = JSON.parse(localStorage.getItem("hutechCustomSections") || "[]"); } catch(e) {}
    customSections = customSections.map(x => ({ ...x, saved: (typeof x.saved === 'boolean' ? x.saved : true) }));
    try { timeEdits = JSON.parse(localStorage.getItem("hutechTimeEdits") || "{}"); } catch(e) {}
    try { slideImageEdits = JSON.parse(localStorage.getItem("hutechSlideImageEdits") || "{}"); } catch(e) {}
    try { hiddenSections = [...new Set(JSON.parse(localStorage.getItem("hutechHiddenSections") || "[]"))]; } catch(e) {}
    try { customSpeakers = JSON.parse(localStorage.getItem("hutechCustomSpeakers") || "[]"); } catch(e) {}

    customSpeakers.forEach(sp => {
      if (sp && sp.id && sp.name) {
        speakers[sp.id] = { name: sp.name, initials: sp.initials || getInitials(sp.name) };
      }
    });

    if (!speakers[currentSpeaker]) currentSpeaker = "haiha";
  }

  // Tiện ích
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[m]);
  }

  function getInitials(name) {
    return String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() || '')
      .join('') || 'GV';
  }

  function slugifyName(name) {
    return String(name || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '') || ('speaker' + Date.now());
  }

  function classify(text) {
    const t = text.trim();
    if (/^(CÂU HỎI|\?|Chị hỏi:|Hỏi tiếp:|Trước khi .*hỏi:)/i.test(t) || /\?$/.test(t)) return "question";
    if (/^(TL:|Đáp án|Đáp án gợi ý:)/i.test(t)) return "answer";
    if (/^(BÀI TẬP|THỰC HÀNH|Sau khi .*chia|Sau phần này có thể cho|Cho các nhóm)/i.test(t)) return "activity";
    if (/^(CHỐT NỘI DUNG|Chốt lại)/i.test(t)) return "close";
    if (/^[-+*•]/.test(t)) return "bullet";
    return "";
  }

  function formatPara(text) {
    const c = classify(text);
    let safe = esc(text);
    safe = safe.replace(/^(CÂU HỎI TƯƠNG TÁC|BÀI TẬP NHÓM|CHỐT NỘI DUNG)(\s*)/i, '<span class="label">$1</span>$2');
    return `<p class="${c}">${safe}</p>`;
  }

  function lectureValueToHtml(value) {
    if (value && typeof value === 'object' && typeof value.html === 'string') return value.html;
    if (Array.isArray(value)) return value.length ? value.map(formatPara).join('') : '';
    if (typeof value === 'string') return value;
    return '';
  }

  function cleanLectureHtml(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('.empty').forEach(n => {
      if (n.textContent.trim() === 'Nhập lời giảng tại đây...') n.remove();
    });
    const html = clone.innerHTML.trim();
    const text = clone.innerText?.trim() || clone.textContent?.trim() || '';
    return text ? html : '';
  }

  function sectionTime(s) {
    return (timeEdits[s.id] ?? s.time ?? '').trim();
  }

  function getSlideImage(slide) {
    return slideImageEdits[String(slide)] || slideImages[String(slide)] || '';
  }

  function buildRenderSections() {
    const list = sections.filter(s => !hiddenSections.includes(s.id)).map(s => ({ ...s, isCustom: false }));
    customSections.forEach(extra => {
      const item = { ...extra, isCustom: true, lectures: {} };
      const afterIndex = list.findIndex(x => x.id === extra.afterId);
      if (afterIndex >= 0) list.splice(afterIndex + 1, 0, item);
      else list.push(item);
    });
    return list.filter(s => !hiddenSections.includes(s.id));
  }

  function getDisplayTitles(renderSections) {
    const counts = {};
    renderSections.forEach(s => { counts[s.slide] = (counts[s.slide] || 0) + 1; });
    const seen = {};
    const map = {};
    renderSections.forEach(s => {
      seen[s.slide] = (seen[s.slide] || 0) + 1;
      const original = String(s.title || `SLIDE ${s.slide}`);
      const suffix = original.replace(/^SLIDE\s+\d+(?:\.\d+)?\s*[—-]?\s*/i, '').trim();
      const number = counts[s.slide] > 1 ? `${s.slide}.${seen[s.slide]}` : `${s.slide}`;
      map[s.id] = suffix ? `SLIDE ${number} — ${suffix}` : `SLIDE ${number}`;
    });
    return map;
  }

  // === XỬ LÝ TOAST THÔNG BÁO ===
  function showToast(message, type = 'info') {
    let toast = document.getElementById('appToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'appToast';
      toast.className = 'app-toast';
      document.body.appendChild(toast);
    }
    toast.innerHTML = message;
    toast.className = `app-toast show ${type}`;
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, 4500);
  }

  // === RENDER GIAO DIỆN CHÍNH ===
  function render() {
    const content = document.getElementById("content");
    const renderSections = buildRenderSections();
    const displayTitles = getDisplayTitles(renderSections);

    // Kiểm tra quyền biên tập cho giảng viên hiện tại
    const user = window.AuthManager.getCurrentUser();
    const canEditCurrentSpeaker = window.AuthManager.canEditSpeaker(currentSpeaker);
    const canManageStructure = window.AuthManager.canManageStructure();

    // Cập nhật trạng thái nút 'Chỉnh sửa'
    updateEditButtonUI(canEditCurrentSpeaker);

    content.innerHTML = renderSections.map((s) => {
      const editKey = `${currentSpeaker}::${s.id}`;
      const lectureValue = (userEdits[editKey] !== undefined) ? userEdits[editKey] : (s.lectures?.[currentSpeaker] || []);
      const bodyHtml = lectureValueToHtml(lectureValue);
      const body = bodyHtml || '<p class="empty">Nhập lời giảng tại đây...</p>';
      const pending = s.isCustom && s.saved === false;
      const lectureEditable = (isEditing && canEditCurrentSpeaker) || pending;

      return `
        <article class="lesson ${pending ? 'pending-section' : ''}" id="${s.id}">
          <div class="lesson-head">
            <h3>${esc(displayTitles[s.id] || s.title)}</h3>
            <div class="lesson-actions">
              <div class="lesson-time" data-section-id="${s.id}" contenteditable="${isEditing && canManageStructure ? 'true' : 'false'}" spellcheck="false">${esc(sectionTime(s))}</div>
              ${canManageStructure ? `
                <button class="add-section-btn" type="button" data-add-after="${s.id}" title="Nhân thêm phần này (Admin)" aria-label="Nhân thêm phần">+</button>
                ${pending ? `<button class="confirm-section-btn" type="button" data-confirm-section="${s.id}" title="Lưu phần vừa thêm" aria-label="Lưu phần vừa thêm">✓</button>` : ''}
                <button class="delete-section-btn" type="button" data-delete-section="${s.id}" title="Xóa slide/phần này (Admin)" aria-label="Xóa slide/phần này">×</button>
              ` : ''}
            </div>
          </div>
          <div class="lesson-grid">
            <div class="slide-pane">
              <div class="slide-frame" data-slide="${s.slide}" title="Bấm để phóng to ảnh">
                <img src="${getSlideImage(s.slide)}" alt="Ảnh Slide ${s.slide}">
              </div>
              <div class="slide-caption">Ảnh Slide ${s.slide}</div>
              ${canManageStructure ? `
                <div class="slide-image-actions">
                  <button class="image-edit-btn" type="button" data-change-image="${s.slide}">${slideImageEdits[String(s.slide)] ? 'Thay ảnh' : 'Thêm / thay ảnh'}</button>
                  ${slideImageEdits[String(s.slide)] ? `<button class="image-edit-btn" type="button" data-reset-image="${s.slide}">Khôi phục ảnh gốc</button>` : ''}
                  <div class="image-edit-note">Ảnh thay mới sẽ áp dụng cho tất cả phần cùng Slide ${s.slide}.</div>
                </div>
              ` : ''}
            </div>
            <div class="lecture-pane ${canEditCurrentSpeaker ? '' : 'readonly-pane'}">
              <div class="lecture-kicker-row">
                <span class="lecture-kicker">LỜI GIẢNG — ${esc(speakers[currentSpeaker]?.name || currentSpeaker)}</span>
                ${!canEditCurrentSpeaker ? `
                  <span class="permission-pill lock" title="Bạn chỉ có quyền xem nội dung của giảng viên này">🔒 Chỉ xem (Của ${esc(speakers[currentSpeaker]?.name || currentSpeaker)})</span>
                ` : `
                  <span class="permission-pill ok" title="Bạn có quyền chỉnh sửa phần này">✏️ Có quyền sửa</span>
                `}
              </div>

              ${pending ? '<div class="pending-tip">Phần này đã được nhân bản. Hãy nhập <b>LỜI GIẢNG</b>, sau đó bấm dấu <b>✓</b> nhỏ để lưu.</div>' : ''}
              ${isEditing && canEditCurrentSpeaker ? '<div class="edit-hint">💡 Đang chế độ chỉnh sửa: Bôi đen văn bản để đổi cỡ chữ, định dạng hoặc tô màu.</div>' : ''}

              ${canEditCurrentSpeaker ? `
                <div class="rich-toolbar" aria-label="Định dạng lời giảng">
                  <button class="rich-tool-btn" type="button" data-rich-cmd="bold" title="In đậm"><b>B</b></button>
                  <button class="rich-tool-btn italic" type="button" data-rich-cmd="italic" title="In nghiêng">I</button>
                  <button class="rich-tool-btn underline" type="button" data-rich-cmd="underline" title="Gạch chân">U</button>
                  <button class="rich-tool-btn strike" type="button" data-rich-cmd="strikeThrough" title="Gạch ngang">S</button>
                  <span class="rich-divider"></span>
                  <select class="rich-size-select" data-font-size title="Chọn cỡ chữ">
                    <option value="12">12 px</option>
                    <option value="13">13 px</option>
                    <option value="14" selected>14 px</option>
                    <option value="15">15 px</option>
                    <option value="16">16 px</option>
                    <option value="17">17 px</option>
                    <option value="18">18 px</option>
                    <option value="20">20 px</option>
                    <option value="22">22 px</option>
                    <option value="24">24 px</option>
                    <option value="28">28 px</option>
                    <option value="32">32 px</option>
                  </select>
                  <label class="rich-color-wrap" title="Màu chữ"><span>A</span><input type="color" data-text-color value="#303846"></label>
                  <label class="rich-color-wrap" title="Tô màu nền"><span>▰</span><input type="color" data-highlight-color value="#fff2a8"></label>
                  <button class="rich-tool-btn" type="button" data-rich-cmd="removeFormat" title="Xóa định dạng">Tx</button>
                  <span class="rich-help">Bôi đen đoạn chữ rồi chọn định dạng.</span>
                </div>
              ` : ''}

              <div class="lecture-body" data-section-id="${s.id}" contenteditable="${lectureEditable ? 'true' : 'false'}">${body}</div>
            </div>
          </div>
        </article>`;
    }).join("");

    renderSpeakerTabs();
    bindActionListeners();
    bindImageZoom();
    bindRichTextEditors();
  }

  // === RENDER TABS GIẢNG VIÊN ===
  function renderSpeakerTabs() {
    const wrap = document.getElementById('speakerSwitch');
    if (!wrap) return;
    const canManage = window.AuthManager.canManageStructure();

    const speakerButtons = Object.entries(speakers).map(([id, info]) => {
      const isCustom = customSpeakers.some(sp => sp.id === id);
      const isMyTab = window.AuthManager.canEditSpeaker(id);
      return `<span class="speaker-tab-wrap ${isCustom ? 'custom-speaker' : ''}">
        <button class="speaker-btn ${id === currentSpeaker ? 'active' : ''} ${isMyTab ? 'has-permission' : ''}" data-speaker="${esc(id)}" role="tab">
          ${esc(info.name)} ${isMyTab ? '✏️' : ''}
        </button>
        ${isCustom && canManage ? `<button class="speaker-delete-btn" data-delete-speaker="${esc(id)}" type="button" title="Xóa người dạy này (Admin)" aria-label="Xóa người dạy ${esc(info.name)}">×</button>` : ''}
      </span>`;
    }).join('');

    wrap.innerHTML = `${speakerButtons}${canManage ? `<button class="add-speaker-btn" id="addSpeakerBtn" type="button" title="Thêm người dạy khác (Admin)" aria-label="Thêm người dạy khác">+</button>` : ''}`;

    wrap.querySelectorAll('.speaker-btn').forEach(btn => btn.addEventListener('click', () => setSpeaker(btn.dataset.speaker)));
    wrap.querySelectorAll('[data-delete-speaker]').forEach(btn => btn.addEventListener('click', () => deleteSpeaker(btn.dataset.deleteSpeaker)));
    wrap.querySelector('#addSpeakerBtn')?.addEventListener('click', addSpeaker);
  }

  function updateEditButtonUI(canEditCurrentSpeaker) {
    const editBtn = document.getElementById('editBtn');
    if (!editBtn) return;
    const user = window.AuthManager.getCurrentUser();

    if (user.role === 'viewer') {
      editBtn.style.display = 'none';
      return;
    }

    editBtn.style.display = 'inline-block';

    if (!canEditCurrentSpeaker) {
      editBtn.disabled = true;
      editBtn.classList.add('disabled-btn');
      editBtn.textContent = '🔒 Chỉ xem';
      editBtn.title = `Bạn chỉ có quyền sửa nội dung của ${user.name}. Tab này thuộc về giảng viên khác.`;
    } else {
      editBtn.disabled = false;
      editBtn.classList.remove('disabled-btn');
      editBtn.textContent = isEditing ? '💾 Hoàn tất & Lưu' : '✏️ Chỉnh sửa';
      editBtn.title = isEditing ? 'Bấm để hoàn tất và lưu phiên bản mới' : 'Bật chế độ chỉnh sửa bài giảng';
    }
  }

  // === CHUYỂN ĐỔI GIẢNG VIÊN ===
  function setSpeaker(key) {
    const pending = getPendingSection();
    if (pending) {
      document.getElementById(pending.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      alert('Hãy bấm dấu ✓ nhỏ để lưu phần vừa thêm trước khi chuyển giảng viên.');
      return;
    }
    if (isEditing) captureAndSaveEdits("Tự động lưu khi chuyển tab");
    currentSpeaker = key;
    localStorage.setItem("hutechSpeaker", key);

    // Kiểm tra xem user có quyền sửa tab mới không, nếu không thì tắt isEditing
    if (!window.AuthManager.canEditSpeaker(currentSpeaker) && isEditing) {
      isEditing = false;
      document.body.classList.remove('editing');
      showToast(`🔒 Bạn đang xem giáo án của <b>${speakers[key]?.name}</b> (Chế độ chỉ xem).`, 'warning');
    }

    render();
  }

  // === THU THẬP VÀ LƯU THAY ĐỔI LÊN ĐÁM MÂY (FIREBASE & VERSIONING) ===
  async function captureAndSaveEdits(summaryNote = "") {
    const user = window.AuthManager.getCurrentUser();
    const canEditCurrent = window.AuthManager.canEditSpeaker(currentSpeaker);
    const canManageStructure = window.AuthManager.canManageStructure();

    let hasChanges = false;

    // Chỉ lưu tab hiện tại nếu có quyền
    if (canEditCurrent) {
      document.querySelectorAll('.lecture-body[data-section-id]').forEach(el => {
        const sid = el.dataset.sectionId;
        const custom = customSections.find(x => x.id === sid);
        if (custom && custom.saved === false) return;
        const key = `${currentSpeaker}::${sid}`;
        const newHtml = cleanLectureHtml(el);
        if (!userEdits[key] || userEdits[key].html !== newHtml) {
          userEdits[key] = { html: newHtml };
          hasChanges = true;
        }
      });
    }

    if (canManageStructure) {
      document.querySelectorAll('.lesson-time[data-section-id]').forEach(el => {
        const sid = el.dataset.sectionId;
        const newTime = el.innerText.trim();
        if (timeEdits[sid] !== newTime) {
          timeEdits[sid] = newTime;
          hasChanges = true;
        }
      });
    }

    if (!hasChanges && !summaryNote) return;

    const payload = {
      userEdits,
      customSections,
      timeEdits,
      slideImageEdits,
      hiddenSections,
      customSpeakers
    };

    const finalSummary = summaryNote || `${user.name} cập nhật giáo án tab [${speakers[currentSpeaker]?.name || currentSpeaker}]`;
    const res = await window.CloudDB.saveCurriculum(payload, finalSummary);

    if (res.online) {
      showToast(`🟢 <strong>Phiên bản ${res.versionTag}</strong> đã đồng bộ thời gian thực lên Firebase!`, 'success');
    } else {
      showToast(`💾 Đã lưu phiên bản <strong>${res.versionTag}</strong> vào bộ nhớ cục bộ.`, 'info');
    }
  }

  // === BẬT / TẮT CHẾ ĐỘ CHỈNH SỬA ===
  async function toggleEdit() {
    const canEditCurrent = window.AuthManager.canEditSpeaker(currentSpeaker);
    if (!canEditCurrent) {
      alert(`Bạn không có quyền chỉnh sửa giáo án của ${speakers[currentSpeaker]?.name}.\nHãy đăng nhập tài khoản phù hợp hoặc chọn tab của bạn.`);
      return;
    }

    const pending = getPendingSection();
    if (pending) {
      document.getElementById(pending.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      alert('Hãy nhập lời giảng và bấm dấu ✓ nhỏ để lưu phần vừa thêm trước.');
      return;
    }

    if (isEditing) {
      // Đang sửa -> bấm để hoàn tất và lưu
      await captureAndSaveEdits();
      isEditing = false;
      document.body.classList.remove('editing');
      showToast('✅ Đã lưu toàn bộ thay đổi thành công!', 'success');
    } else {
      isEditing = true;
      document.body.classList.add('editing');
      showToast('✏️ Đã bật chế độ chỉnh sửa. Bôi đen văn bản để định dạng.', 'info');
    }

    render();
  }

  // === ĐỒNG BỘ THỜI GIAN THỰC TỪ FIREBASE (REMOTE UPDATES) ===
  function handleRemoteUpdate(remoteData) {
    if (!remoteData) return;
    const author = remoteData.updatedBy?.name || "Người dùng khác";
    const user = window.AuthManager.getCurrentUser();

    // Nếu người vừa sửa chính là mình (cùng tab), bỏ qua thông báo lặp
    if (remoteData.updatedBy?.id === user.id && remoteData.updatedBy?.speakerId === user.speakerId) {
      return;
    }

    if (isEditing) {
      // Nếu đang soạn thảo, không đè màn hình mà hiện banner nhắc nhở
      hasPendingRemoteChanges = true;
      remotePendingData = remoteData;
      showToast(`⚠️ <b>${author}</b> vừa lưu phiên bản mới trên đám mây. <button id="applyRemoteBtn" class="toast-action-btn">Cập nhật ngay</button>`, 'warning');
      document.getElementById('applyRemoteBtn')?.addEventListener('click', () => {
        applyCurriculumSnapshot(remoteData, true);
        hasPendingRemoteChanges = false;
        remotePendingData = null;
      });
    } else {
      // Nếu chỉ xem, tự động áp dụng và hiển thị bản mới nhất
      applyCurriculumSnapshot(remoteData, true);
      showToast(`✨ Giáo án đã được đồng bộ bản mới nhất từ <b>${author}</b>!`, 'success');
    }
  }

  // Áp dụng snapshot dữ liệu vào ứng dụng
  window.applyCurriculumSnapshot = function(snapshot, persist = false) {
    if (!snapshot) return;
    if (snapshot.userEdits) userEdits = { ...snapshot.userEdits };
    if (snapshot.customSections) customSections = [...snapshot.customSections];
    if (snapshot.timeEdits) timeEdits = { ...snapshot.timeEdits };
    if (snapshot.slideImageEdits) slideImageEdits = { ...snapshot.slideImageEdits };
    if (snapshot.hiddenSections) hiddenSections = [...snapshot.hiddenSections];
    if (snapshot.customSpeakers) {
      customSpeakers = [...snapshot.customSpeakers];
      speakers = { ...baseSpeakers };
      customSpeakers.forEach(sp => {
        if (sp && sp.id && sp.name) {
          speakers[sp.id] = { name: sp.name, initials: sp.initials || getInitials(sp.name) };
        }
      });
    }

    if (persist) {
      window.CloudDB.saveToLocalStorage(snapshot);
    }

    render();
  };

  // Quản lý custom section / slides (Admin)
  function getPendingSection() {
    return customSections.find(x => x.saved === false) || null;
  }

  function addSectionAfter(sectionId) {
    if (!window.AuthManager.canManageStructure()) {
      alert("Chỉ Quản trị viên (Admin) mới có quyền thêm/nhân bản slide.");
      return;
    }
    const pending = getPendingSection();
    if (pending) {
      document.getElementById(pending.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      alert('Bạn đang có một phần vừa thêm chưa lưu. Hãy bấm dấu ✓ trước.');
      return;
    }
    const rendered = buildRenderSections();
    const src = rendered.find(x => x.id === sectionId);
    if (!src) return;

    const id = 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
    customSections.push({
      id,
      afterId: sectionId,
      title: src.title,
      time: sectionTime(src),
      slide: src.slide,
      saved: false
    });

    render();
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.querySelector(`.lecture-body[data-section-id="${id}"]`)?.focus();
    });
  }

  function confirmCustomSection(sectionId) {
    const item = customSections.find(x => x.id === sectionId);
    if (!item) return;
    const el = document.querySelector(`.lecture-body[data-section-id="${sectionId}"]`);
    if (el) {
      userEdits[`${currentSpeaker}::${sectionId}`] = { html: cleanLectureHtml(el) };
    }
    item.saved = true;
    captureAndSaveEdits(`Admin thêm phần học mới cho Slide ${item.slide}`);
    render();
  }

  function deleteSection(sectionId) {
    if (!window.AuthManager.canManageStructure()) {
      alert("Chỉ Quản trị viên (Admin) mới có quyền xóa slide/phần học.");
      return;
    }
    if (!confirm('Bạn có chắc muốn xóa slide/phần này không?')) return;
    const isCustom = customSections.some(x => x.id === sectionId);
    if (isCustom) {
      const removed = customSections.find(x => x.id === sectionId);
      customSections = customSections.map(x => x.afterId === sectionId ? { ...x, afterId: removed.afterId } : x).filter(x => x.id !== sectionId);
    } else {
      if (!hiddenSections.includes(sectionId)) hiddenSections.push(sectionId);
    }
    Object.keys(userEdits).filter(k => k.endsWith('::' + sectionId)).forEach(k => delete userEdits[k]);
    delete timeEdits[sectionId];
    captureAndSaveEdits(`Admin xóa phần học: ${sectionId}`);
    render();
  }

  // Quản lý người dạy (Admin)
  function addSpeaker() {
    if (!window.AuthManager.canManageStructure()) {
      alert("Chỉ Quản trị viên (Admin) mới có quyền thêm giảng viên mới.");
      return;
    }
    const name = prompt('Nhập tên giảng viên mới:');
    if (!name || !name.trim()) return;
    const cleanName = name.trim();
    const baseId = slugifyName(cleanName);
    let id = baseId;
    let i = 2;
    while (speakers[id]) { id = `${baseId}${i++}`; }

    const item = { id, name: cleanName, initials: getInitials(cleanName) };
    customSpeakers.push(item);
    speakers[id] = { name: item.name, initials: item.initials };
    currentSpeaker = id;
    localStorage.setItem("hutechSpeaker", currentSpeaker);
    captureAndSaveEdits(`Admin thêm giảng viên mới: ${cleanName}`);
    render();
  }

  function deleteSpeaker(id) {
    if (!window.AuthManager.canManageStructure()) {
      alert("Chỉ Quản trị viên (Admin) mới có quyền xóa giảng viên.");
      return;
    }
    const item = customSpeakers.find(sp => sp.id === id);
    if (!item) return;
    if (!confirm(`Bạn có chắc muốn xóa giảng viên “${item.name}” và toàn bộ lời giảng liên quan?`)) return;

    customSpeakers = customSpeakers.filter(sp => sp.id !== id);
    delete speakers[id];
    Object.keys(userEdits).filter(k => k.startsWith(id + '::')).forEach(k => delete userEdits[k]);
    if (currentSpeaker === id) {
      currentSpeaker = 'haiha';
      localStorage.setItem('hutechSpeaker', currentSpeaker);
    }
    captureAndSaveEdits(`Admin xóa giảng viên: ${item.name}`);
    render();
  }

  // Thay đổi ảnh slide (Admin)
  async function chooseSlideImage(slide) {
    if (!window.AuthManager.canManageStructure()) {
      alert("Chỉ Quản trị viên (Admin) mới có quyền thay ảnh slide.");
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp,image/gif';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) { input.remove(); return; }
      try {
        const dataUrl = await resizeImageForStorage(file);
        slideImageEdits[String(slide)] = dataUrl;
        await captureAndSaveEdits(`Admin cập nhật hình ảnh Slide ${slide}`);
        render();
      } catch (err) {
        alert(err?.message || 'Không thể xử lý ảnh đã chọn.');
      } finally {
        input.remove();
      }
    }, { once: true });
    input.click();
  }

  function resetSlideImage(slide) {
    if (!window.AuthManager.canManageStructure()) {
      alert("Chỉ Quản trị viên (Admin) mới có quyền khôi phục ảnh slide.");
      return;
    }
    if (!slideImageEdits[String(slide)]) return;
    if (!confirm(`Khôi phục ảnh gốc của Slide ${slide}?`)) return;
    delete slideImageEdits[String(slide)];
    captureAndSaveEdits(`Admin khôi phục ảnh gốc Slide ${slide}`);
    render();
  }

  function resizeImageForStorage(file, maxW = 1800, maxH = 1200, quality = 0.92) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Không đọc được file ảnh.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('File đã chọn không phải ảnh hợp lệ.'));
        img.onload = () => {
          let w = img.naturalWidth, h = img.naturalHeight;
          const scale = Math.min(1, maxW / w, maxH / h);
          w = Math.max(1, Math.round(w * scale));
          h = Math.max(1, Math.round(h * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/webp', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // === RICH TEXT FORMATTING ===
  let activeLecture = null;
  let savedLectureRange = null;

  function saveLectureSelection() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !activeLecture) return;
    const range = sel.getRangeAt(0);
    const common = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    if (common && activeLecture.contains(common)) savedLectureRange = range.cloneRange();
  }

  function restoreLectureSelection() {
    if (!activeLecture || !savedLectureRange) return false;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedLectureRange);
    return true;
  }

  function applyRichCommand(cmd, value = null) {
    if (!activeLecture) return;
    activeLecture.focus();
    restoreLectureSelection();
    try { document.execCommand('styleWithCSS', false, true); } catch (e) {}
    document.execCommand(cmd, false, value);
    saveLectureSelection();
    activeLecture.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function applyFontSizePx(px) {
    if (!activeLecture) return;
    const size = parseInt(px, 10);
    if (!size || size < 10 || size > 48) return;
    activeLecture.focus();
    restoreLectureSelection();
    try { document.execCommand('styleWithCSS', false, false); } catch (e) {}
    document.execCommand('fontSize', false, '7');
    activeLecture.querySelectorAll('font[size="7"]').forEach(font => {
      const span = document.createElement('span');
      span.style.fontSize = size + 'px';
      while (font.firstChild) span.appendChild(font.firstChild);
      font.replaceWith(span);
    });
    saveLectureSelection();
    activeLecture.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function bindRichTextEditors() {
    document.querySelectorAll('.lecture-pane').forEach(pane => {
      const body = pane.querySelector('.lecture-body');
      const toolbar = pane.querySelector('.rich-toolbar');
      if (!body || !toolbar) return;
      const canEdit = body.getAttribute('contenteditable') === 'true';
      if (!canEdit) return;

      const activate = () => {
        activeLecture = body;
        document.querySelectorAll('.rich-toolbar').forEach(tb => tb.classList.toggle('show', tb === toolbar));
        saveLectureSelection();
      };
      body.addEventListener('focus', activate);
      body.addEventListener('mouseup', () => {
        activeLecture = body;
        saveLectureSelection();
        toolbar.classList.add('show');
      });
      body.addEventListener('keyup', () => {
        activeLecture = body;
        saveLectureSelection();
        toolbar.classList.add('show');
      });
      toolbar.addEventListener('mousedown', e => {
        if (e.target.closest('button')) e.preventDefault();
        activeLecture = body;
        restoreLectureSelection();
      });
      toolbar.querySelectorAll('[data-rich-cmd]').forEach(btn => btn.addEventListener('click', () => {
        activeLecture = body;
        applyRichCommand(btn.dataset.richCmd, btn.dataset.richValue || null);
      }));
      toolbar.querySelector('[data-font-size]')?.addEventListener('change', e => {
        activeLecture = body;
        applyFontSizePx(e.target.value);
      });
      toolbar.querySelector('[data-text-color]')?.addEventListener('input', e => {
        activeLecture = body;
        applyRichCommand('foreColor', e.target.value);
      });
      toolbar.querySelector('[data-highlight-color]')?.addEventListener('input', e => {
        activeLecture = body;
        applyRichCommand('hiliteColor', e.target.value);
      });
    });
  }

  // === LIGHTBOX PHÓNG TO ẢNH ===
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightboxImg");
  function bindImageZoom() {
    document.querySelectorAll(".slide-frame").forEach(el => {
      el.addEventListener("click", () => {
        const img = el.querySelector('img');
        if (lightboxImg) lightboxImg.src = img?.src || getSlideImage(el.dataset.slide);
        if (lightbox) {
          lightbox.classList.add("open");
          lightbox.setAttribute("aria-hidden", "false");
        }
      });
    });
  }
  function closeLb() {
    if (lightbox) {
      lightbox.classList.remove("open");
      lightbox.setAttribute("aria-hidden", "true");
    }
    if (lightboxImg) lightboxImg.src = "";
  }
  document.getElementById("closeLightbox")?.addEventListener("click", closeLb);
  lightbox?.addEventListener("click", e => { if (e.target === lightbox) closeLb(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeLb(); });

  // === BIND CÁC NÚT HÀNH ĐỘNG TRÊN TỪNG SLIDE ===
  function bindActionListeners() {
    document.querySelectorAll('[data-add-after]').forEach(btn => btn.addEventListener('click', () => addSectionAfter(btn.dataset.addAfter)));
    document.querySelectorAll('[data-confirm-section]').forEach(btn => btn.addEventListener('click', () => confirmCustomSection(btn.dataset.confirmSection)));
    document.querySelectorAll('[data-delete-section]').forEach(btn => btn.addEventListener('click', () => deleteSection(btn.dataset.deleteSection)));
    document.querySelectorAll('[data-change-image]').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); chooseSlideImage(btn.dataset.changeImage); }));
    document.querySelectorAll('[data-reset-image]').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); resetSlideImage(btn.dataset.resetImage); }));
  }

  // === QUẢN LÝ GIAO DIỆN TOPBAR: NGƯỜI DÙNG & FIREBASE STATUS ===
  function updateTopbarUI() {
    const user = window.AuthManager.getCurrentUser();
    const userBtn = document.getElementById('userProfileBtn');
    const userRoleBadge = document.getElementById('userRoleBadge');

    if (userBtn && userRoleBadge) {
      userRoleBadge.innerHTML = window.AuthManager.getRoleBadgeText();
      userBtn.title = `Đang đăng nhập: ${user.name} (${user.email || user.role})`;
    }
  }

  function updateFirebaseStatusUI(status, msg) {
    const badge = document.getElementById('cloudStatusBadge');
    if (!badge) return;

    if (status === window.CloudDB.STATUS.CONNECTED) {
      badge.className = 'cloud-status-badge connected';
      badge.innerHTML = '🟢 Realtime Cloud Synced';
      badge.title = 'Đang đồng bộ trực tiếp với Firebase Firestore. Mọi thay đổi đều được cập nhật tức thì tới tất cả người xem.';
    } else if (status === window.CloudDB.STATUS.CONNECTING || status === window.CloudDB.STATUS.SYNCING) {
      badge.className = 'cloud-status-badge syncing';
      badge.innerHTML = '🔄 Đang đồng bộ...';
    } else if (status === window.CloudDB.STATUS.ERROR) {
      badge.className = 'cloud-status-badge error';
      badge.innerHTML = '🔴 Lỗi đám mây';
      badge.title = msg;
    } else {
      badge.className = 'cloud-status-badge local';
      badge.innerHTML = '🟡 Chế độ Cục bộ (Local)';
      badge.title = 'Chưa kết nối Firebase. Bấm vào để cài đặt cấu hình Firebase và kích hoạt đồng bộ đám mây.';
    }
  }

  // === KHỞI TẠO CÁC MODAL: TÀI KHOẢN & FIREBASE SETTINGS ===
  function setupModals() {
    // 1. Auth / Account Modal
    const authModal = document.getElementById('authModal');
    const userBtn = document.getElementById('userProfileBtn');
    const closeAuthBtn = document.getElementById('closeAuthModal');

    if (userBtn && authModal) {
      userBtn.addEventListener('click', () => {
        authModal.classList.add('open');
        authModal.setAttribute('aria-hidden', 'false');
      });
    }
    if (closeAuthBtn && authModal) {
      closeAuthBtn.addEventListener('click', () => {
        authModal.classList.remove('open');
        authModal.setAttribute('aria-hidden', 'true');
      });
    }

    // Xử lý chọn tài khoản nhanh
    document.querySelectorAll('[data-login-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const accId = btn.dataset.loginPreset;
        const pinInput = document.getElementById('pinInput')?.value || '';
        try {
          window.AuthManager.loginPreset(accId, pinInput);
          authModal.classList.remove('open');
          showToast(`Đã chuyển sang vai trò: <b>${window.AuthManager.getRoleBadgeText()}</b>`, 'success');
          render();
        } catch (e) {
          alert(e.message);
        }
      });
    });

    // 2. Firebase Settings Modal
    const firebaseModal = document.getElementById('firebaseModal');
    const cloudBadge = document.getElementById('cloudStatusBadge');
    const closeFirebaseBtn = document.getElementById('closeFirebaseModal');
    const saveFirebaseBtn = document.getElementById('saveFirebaseConfigBtn');

    if (cloudBadge && firebaseModal) {
      cloudBadge.addEventListener('click', () => {
        const curConfig = window.FirebaseConfigManager.getConfig();
        const jsonInput = document.getElementById('firebaseConfigJson');
        if (jsonInput) {
          jsonInput.value = (curConfig && curConfig.apiKey) ? JSON.stringify(curConfig, null, 2) : '';
        }
        firebaseModal.classList.add('open');
        firebaseModal.setAttribute('aria-hidden', 'false');
      });
    }
    if (closeFirebaseBtn && firebaseModal) {
      closeFirebaseBtn.addEventListener('click', () => {
        firebaseModal.classList.remove('open');
        firebaseModal.setAttribute('aria-hidden', 'true');
      });
    }
    if (saveFirebaseBtn && firebaseModal) {
      saveFirebaseBtn.addEventListener('click', async () => {
        const jsonInput = document.getElementById('firebaseConfigJson');
        try {
          const cfg = JSON.parse(jsonInput.value.trim());
          window.FirebaseConfigManager.saveConfig(cfg);
          firebaseModal.classList.remove('open');
          showToast('Đang kết nối lại Firebase với cấu hình mới...', 'info');
          await window.CloudDB.init();
        } catch (e) {
          alert("Lỗi định dạng JSON Firebase Config: " + e.message);
        }
      });
    }
  }

  // === KHỞI CHẠY HỆ THỐNG ===
  async function initApp() {
    loadLocalInitialState();
    window.AuthManager.init();
    updateTopbarUI();

    // Đăng ký lắng nghe thay đổi vai trò
    window.AuthManager.subscribe(() => {
      updateTopbarUI();
      render();
    });

    // Gắn sự kiện nút Edit
    document.getElementById('editBtn')?.addEventListener('click', toggleEdit);

    // Tự động lưu bản nháp khi gõ
    document.addEventListener('input', e => {
      const lecture = e.target.closest('.lecture-body[data-section-id]');
      const sid = lecture?.dataset.sectionId;
      const custom = sid ? customSections.find(x => x.id === sid) : null;
      if (custom && custom.saved === false) return;
      if (isEditing && (lecture || e.target.closest('.lesson-time'))) {
        clearTimeout(window.__editTimer);
        window.__editTimer = setTimeout(() => captureAndSaveEdits("Tự động lưu"), 1200);
      }
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('.lecture-pane')) {
        document.querySelectorAll('.rich-toolbar').forEach(tb => tb.classList.remove('show'));
      }
    });

    // Thiết lập các Modal
    setupModals();
    window.VersionHistoryUI.init();

    // Đăng ký lắng nghe trạng thái kết nối Cloud
    window.CloudDB.onStatusChange((status, msg) => {
      updateFirebaseStatusUI(status, msg);
    });

    // Đăng ký nhận cập nhật thời gian thực từ Firestore
    window.CloudDB.onRemoteUpdate((data) => {
      handleRemoteUpdate(data);
    });

    // Khởi tạo kết nối Firebase
    await window.CloudDB.init();

    // Render giao diện ban đầu
    render();
  }

  // Kích hoạt khi trang web sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

})();
