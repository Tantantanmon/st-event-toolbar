// ============================================================
// EVENT TOOLBAR - index.js
// ============================================================

import { extension_settings, getContext } from '../../../extensions.js';
import {
    eventSource,
    event_types,
    setExtensionPrompt,
    saveSettingsDebounced
} from '../../../../script.js';

const EXT_NAME   = 'event-toolbar';
const INJECT_KEY = 'et-toolbar-prompt';

// ============================================================
// 기본 데이터
// ============================================================

const DEFAULT_TAGS = {
    place:    ['Bedroom', 'Bathroom', 'Living room', 'Kitchen', 'Car'],
    daily:    ['Hands touch', 'Eye contact', 'Cooking together', 'Accidental touch', 'Caught staring'],
    romance:  ['First kiss', 'Almost kiss', 'Holding hands', 'Puppy eyes', 'Whining'],
    dialogue: ['Deep talk', 'Teasing', 'Confession', 'Argument', 'Hard question'],
    memory:   ['Old memory', 'First meeting', 'Regret', 'Secret', 'Childhood'],
    contact:  ['Phone call', 'Text message', 'Voice message', 'Video call', 'Social media'],
    incident: ['Sudden visit', 'Secret revealed', 'Shocking news', 'Accident', 'Crisis'],
    conflict: ['Betrayal', 'Breakup', 'Threat', 'Walking away', 'Trust issues'],
    fight:    ['Slap', 'Cursing', 'Humiliation', 'Breaking point', 'Throwing things'],
    env:      ['Heavy rain', 'Power outage', 'First snow', 'Storm', 'Heat wave']
};

const GROUP_LABELS = {
    place:    '장소',
    daily:    '일상',
    romance:  '사랑',
    dialogue: '대화',
    memory:   '기억',
    contact:  '연락',
    incident: '사건',
    conflict: '갈등',
    fight:    '싸움',
    env:      '환경'
};

const GROUP_PROMPT = {
    place:    (tags) => `The scene takes place in: ${tags.join(', ')}`,
    daily:    (tags) => `Naturally create a moment where: ${tags.join(', ')}`,
    romance:  (tags) => `Naturally create a romantic moment: ${tags.join(', ')}`,
    dialogue: (tags) => `The conversation shifts to: ${tags.join(', ')}`,
    memory:   (tags) => `Bring up a memory or past event: ${tags.join(', ')}`,
    contact:  (tags) => `This happens through: ${tags.join(', ')}`,
    incident: (tags) => `The following event occurs suddenly: ${tags.join(', ')}`,
    conflict: (tags) => `Introduce conflict: ${tags.join(', ')}`,
    fight:    (tags) => `Escalate into a physical or verbal fight: ${tags.join(', ')}`,
    env:      (tags) => `The environment changes: ${tags.join(', ')}`
};

const GROUPS = Object.keys(DEFAULT_TAGS);

// ============================================================
// 상태
// ============================================================

let popupOpen    = false;
let currentTab   = 'home';
let currentTbGroup = 'place';
let tbSelected   = {}; // { groupId: [tagName, ...] }

// ============================================================
// 설정 헬퍼
// ============================================================

function getSettings() {
    if (!extension_settings[EXT_NAME]) {
        extension_settings[EXT_NAME] = {
            config: { toolbar_visible: true },
            world: '',
            tags: JSON.parse(JSON.stringify(DEFAULT_TAGS))
        };
    }
    if (!extension_settings[EXT_NAME].config) {
        extension_settings[EXT_NAME].config = { toolbar_visible: true };
    }
    if (!extension_settings[EXT_NAME].tags) {
        extension_settings[EXT_NAME].tags = JSON.parse(JSON.stringify(DEFAULT_TAGS));
    }
    return extension_settings[EXT_NAME];
}

function save() { saveSettingsDebounced(); }

// ============================================================
// 프롬프트 구분자
// ============================================================

function wrap(content) {
    return `=== EVENT TOOLBAR START ===\n${content}\n=== EVENT TOOLBAR END ===`;
}

// ============================================================
// Apply 실행
// ============================================================

async function applyToolbar(freeInput) {
    const settings = getSettings();
    const parts = [];

    // 세계관
    if (settings.world && settings.world.trim()) {
        parts.push(`World Setting: ${settings.world.trim()}`);
    }

    // 선택된 태그 그룹별 프롬프트
    GROUPS.forEach(group => {
        const tags = tbSelected[group];
        if (!tags || tags.length === 0) return;
        const fn = GROUP_PROMPT[group];
        if (fn) parts.push(fn(tags));
    });

    // 자유 입력
    if (freeInput && freeInput.trim()) {
        parts.push(freeInput.trim());
    }

    if (parts.length === 0) return;

    const prompt = wrap([
        'IMMEDIATE INSTRUCTION: In your very next response, you MUST —',
        parts.join('\n'),
        'Stay in character. Weave naturally into the narrative. Do not announce these events directly.'
    ].join('\n'));

    // 프롬프트 삽입 후 일반 생성 (레퍼런스 방식)
    const { setExtensionPrompt: ctxSEP, generate } = SillyTavern.getContext();
    ctxSEP(INJECT_KEY, prompt, 1, 0);
    await generate('normal', {});
    setTimeout(() => {
        try { ctxSEP(INJECT_KEY, '', 1, 0); } catch(e) {}
    }, 300);

    // 선택 초기화
    tbSelected = {};
    renderToolbarSelectedArea();
    renderToolbarTags();
}

// ============================================================
// 팝업 HTML
// ============================================================

function buildPopupHTML() {
    const settings = getSettings();
    const cfg = settings.config;

    const sidebarTabs = `
        <div class="et-sb-tab${currentTab==='home'?' active':''}" data-et-tab="home">홈</div>
        <div class="et-sb-divider"></div>
        ${GROUPS.map(g =>
            `<div class="et-sb-tab${currentTab===g?' active':''}" data-et-tab="${g}">${GROUP_LABELS[g]}</div>`
        ).join('')}
    `;

    const panels = `
        ${buildHomePanel(cfg, settings.world)}
        ${GROUPS.map(g => buildTagPanel(g, settings.tags[g] || [])).join('')}
    `;

    return `
    <div id="et-overlay">
        <div id="et-popup">
            <div class="et-sidebar">
                <div class="et-sb-logo">
                    <svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
                </div>
                <div class="et-sb-divider"></div>
                ${sidebarTabs}
                <div class="et-sb-spacer"></div>
            </div>
            <div class="et-main">${panels}</div>
        </div>
    </div>`;
}

function buildHomePanel(cfg, world) {
    return `
    <div class="et-panel${currentTab==='home'?' active':''}" id="et-panel-home">
        <div class="et-header">
            <div>
                <div class="et-header-title">Event Toolbar</div>
                <div class="et-header-sub">상황 태그 관리</div>
            </div>
        </div>
        <div class="et-scroll">
            <div class="et-home-section">
                <div class="et-home-label">Toolbar</div>
                <div class="et-toggle-card">
                    <div>
                        <div class="et-toggle-card-title">툴바 표시</div>
                        <div class="et-toggle-card-desc">채팅 입력창 위에 툴바 표시</div>
                    </div>
                    <div class="et-toggle${cfg.toolbar_visible?'':' off'}" id="et-toolbar-toggle"></div>
                </div>
            </div>
            <div class="et-home-section">
                <div class="et-home-label">World</div>
                <textarea class="et-world-textarea" id="et-world-input" rows="4"
                    placeholder="세계관 설정을 입력하세요&#10;예: 현대 한국 배경, 마법 없음...">${world||''}</textarea>
            </div>
        </div>
    </div>`;
}

function buildTagPanel(group, tags) {
    const label = GROUP_LABELS[group];
    const tagsHTML = tags.map(t => `
        <div class="et-tag-chip" data-tag="${t}" data-group="${group}">
            ${t}<span class="et-tag-chip-del" data-del-tag="${t}" data-del-group="${group}">×</span>
        </div>`).join('');

    return `
    <div class="et-panel${currentTab===group?' active':''}" id="et-panel-${group}">
        <div class="et-header">
            <div>
                <div class="et-header-title">${label}</div>
                <div class="et-header-sub">${group} tags</div>
            </div>
        </div>
        <div class="et-scroll">
            <div class="et-tag-wrap" id="et-wrap-${group}">
                ${tagsHTML}
                <div class="et-tag-add" data-add-group="${group}">+ add</div>
            </div>
        </div>
        <div class="et-panel-footer">
            <button class="et-btn-save" data-save-group="${group}">저장</button>
            <button class="et-btn-reset" data-reset-group="${group}">초기화</button>
        </div>
    </div>`;
}

// ============================================================
// 툴바 HTML
// ============================================================

function buildToolbarHTML() {
    const settings = getSettings();
    const tags = settings.tags;

    const groupTabsHTML = GROUPS.map(g =>
        `<button class="et-tb-group-tab${g===currentTbGroup?' active':''}" data-tb-group="${g}">${GROUP_LABELS[g]}</button>`
    ).join('');

    const groupTagsHTML = GROUPS.map(g => `
        <div class="et-tb-tag-group${g===currentTbGroup?' active':''}" id="et-tb-group-${g}">
            ${(tags[g]||[]).map(t => {
                const sel = (tbSelected[g]||[]).includes(t);
                return `<span class="et-tb-tag${sel?' selected':''}" data-tb-tag="${t}" data-tb-group="${g}">${t}</span>`;
            }).join('')}
            <span class="et-tb-tag-add" data-tb-add-group="${g}">+ add</span>
        </div>`).join('');

    return `
    <div id="et-toolbar">
        <div class="et-tb-group-row">
            ${groupTabsHTML}
            <button class="et-tb-close" id="et-tb-close">✕</button>
        </div>
        <div class="et-tb-tags-area">${groupTagsHTML}</div>
        <div class="et-tb-selected-area" id="et-tb-selected-area">
            <div class="et-tb-selected-label">선택됨</div>
        </div>
        <div class="et-tb-bottom-row">
            <input class="et-tb-free-input" id="et-tb-free" placeholder="직접 입력... (선택사항)" />
            <button class="et-tb-clear-btn" id="et-tb-clear">초기화</button>
            <button class="et-tb-apply-btn" id="et-tb-apply">Apply</button>
        </div>
    </div>`;
}

function renderToolbar() {
    const existing = document.getElementById('et-toolbar');
    if (existing) existing.remove();

    const cfg = getSettings().config;
    if (!cfg.toolbar_visible) return;

    const sendForm = document.getElementById('send_form');
    if (!sendForm) return;

    sendForm.insertAdjacentHTML('beforebegin', buildToolbarHTML());
    bindToolbarEvents();
}

function renderToolbarTags() {
    const settings = getSettings();
    GROUPS.forEach(g => {
        const wrap = document.getElementById(`et-tb-group-${g}`);
        if (!wrap) return;
        const addBtn = wrap.querySelector('.et-tb-tag-add');
        // 태그만 제거하고 add 버튼 유지
        wrap.querySelectorAll('.et-tb-tag').forEach(el => el.remove());
        const tagsHTML = (settings.tags[g]||[]).map(t => {
            const sel = (tbSelected[g]||[]).includes(t);
            return `<span class="et-tb-tag${sel?' selected':''}" data-tb-tag="${t}" data-tb-group="${g}">${t}</span>`;
        }).join('');
        addBtn.insertAdjacentHTML('beforebegin', tagsHTML);
    });
}

function renderToolbarSelectedArea() {
    const area = document.getElementById('et-tb-selected-area');
    if (!area) return;
    // 기존 chip 제거 (label 유지)
    area.querySelectorAll('.et-tb-selected-chip').forEach(c => c.remove());

    const allSelected = [];
    GROUPS.forEach(g => {
        (tbSelected[g]||[]).forEach(t => allSelected.push({ tag: t, group: g }));
    });

    if (allSelected.length > 0) {
        area.classList.add('show');
        allSelected.forEach(({ tag, group }) => {
            const chip = document.createElement('div');
            chip.className = 'et-tb-selected-chip';
            chip.dataset.selTag = tag;
            chip.dataset.selGroup = group;
            chip.innerHTML = `${tag}<span class="et-tb-selected-chip-del">×</span>`;
            area.appendChild(chip);
        });
    } else {
        area.classList.remove('show');
    }
}

// ============================================================
// 이벤트 바인딩 - 팝업
// ============================================================

function bindPopupEvents() {
    // 오버레이 클릭 닫기
    document.getElementById('et-overlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'et-overlay') closePopup();
    });

    // 사이드바 탭
    document.querySelectorAll('.et-sb-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            currentTab = tab.dataset.etTab;
            document.querySelectorAll('.et-sb-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.et-panel').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`et-panel-${currentTab}`)?.classList.add('active');
        });
    });

    // 툴바 토글
    document.getElementById('et-toolbar-toggle')?.addEventListener('click', function() {
        const cfg = getSettings().config;
        cfg.toolbar_visible = !cfg.toolbar_visible;
        this.classList.toggle('off', !cfg.toolbar_visible);
        save();
        renderToolbar();
    });

    // 세계관 입력
    document.getElementById('et-world-input')?.addEventListener('input', function() {
        getSettings().world = this.value;
        save();
    });

    // 태그 칩 삭제
    document.getElementById('et-popup')?.addEventListener('click', (e) => {
        // del 버튼
        if (e.target.dataset.delTag) {
            const tag   = e.target.dataset.delTag;
            const group = e.target.dataset.delGroup;
            const settings = getSettings();
            settings.tags[group] = (settings.tags[group]||[]).filter(t => t !== tag);
            // DOM에서 제거
            e.target.closest('.et-tag-chip')?.remove();
            return;
        }

        // + add 버튼
        if (e.target.dataset.addGroup) {
            const group = e.target.dataset.addGroup;
            const addBtn = e.target;
            const input = document.createElement('input');
            input.className = 'et-tag-inline-input';
            input.placeholder = 'Tag name...';
            addBtn.parentElement.insertBefore(input, addBtn);
            input.focus();
            input.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter' && input.value.trim()) {
                    const val = input.value.trim();
                    const settings = getSettings();
                    if (!settings.tags[group]) settings.tags[group] = [];
                    if (!settings.tags[group].includes(val)) {
                        settings.tags[group].push(val);
                    }
                    // DOM에 추가
                    const chip = document.createElement('div');
                    chip.className = 'et-tag-chip';
                    chip.dataset.tag = val;
                    chip.dataset.group = group;
                    chip.innerHTML = `${val}<span class="et-tag-chip-del" data-del-tag="${val}" data-del-group="${group}">×</span>`;
                    addBtn.parentElement.insertBefore(chip, input);
                    input.value = '';
                    input.focus();
                }
                if (ev.key === 'Escape') input.remove();
            });
            return;
        }

        // 저장 버튼
        if (e.target.dataset.saveGroup !== undefined) {
            save();
            renderToolbar(); // 툴바도 갱신
            // 저장 완료 피드백
            const btn = e.target;
            btn.textContent = '저장됨 ✓';
            setTimeout(() => btn.textContent = '저장', 1500);
            return;
        }

        // 초기화 버튼
        if (e.target.dataset.resetGroup !== undefined) {
            const group = e.target.dataset.resetGroup;
            if (!confirm(`"${GROUP_LABELS[group]}" 태그를 초기화할까요?`)) return;
            const settings = getSettings();
            settings.tags[group] = JSON.parse(JSON.stringify(DEFAULT_TAGS[group]));
            save();
            // 태그 패널 재렌더링
            const wrap = document.getElementById(`et-wrap-${group}`);
            if (wrap) {
                wrap.innerHTML = settings.tags[group].map(t => `
                    <div class="et-tag-chip" data-tag="${t}" data-group="${group}">
                        ${t}<span class="et-tag-chip-del" data-del-tag="${t}" data-del-group="${group}">×</span>
                    </div>`).join('') +
                    `<div class="et-tag-add" data-add-group="${group}">+ add</div>`;
            }
            renderToolbar();
            return;
        }
    });
}

// ============================================================
// 이벤트 바인딩 - 툴바
// ============================================================

function bindToolbarEvents() {
    // 그룹 탭
    document.querySelectorAll('.et-tb-group-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            currentTbGroup = tab.dataset.tbGroup;
            document.querySelectorAll('.et-tb-group-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.et-tb-tag-group').forEach(g => g.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`et-tb-group-${currentTbGroup}`)?.classList.add('active');
        });
    });

    // X 닫기
    document.getElementById('et-tb-close')?.addEventListener('click', () => {
        const cfg = getSettings().config;
        cfg.toolbar_visible = false;
        save();
        document.getElementById('et-toolbar')?.remove();
        // 팝업 열려있으면 토글 상태 갱신
        document.getElementById('et-toolbar-toggle')?.classList.add('off');
    });

    // 태그 클릭 (이벤트 위임)
    document.getElementById('et-toolbar')?.addEventListener('click', (e) => {

        // 태그 선택/해제
        if (e.target.classList.contains('et-tb-tag')) {
            const tag   = e.target.dataset.tbTag;
            const group = e.target.dataset.tbGroup;
            if (!tbSelected[group]) tbSelected[group] = [];
            const idx = tbSelected[group].indexOf(tag);
            if (idx >= 0) {
                tbSelected[group].splice(idx, 1);
                e.target.classList.remove('selected');
            } else {
                tbSelected[group].push(tag);
                e.target.classList.add('selected');
            }
            renderToolbarSelectedArea();
            return;
        }

        // + add
        if (e.target.classList.contains('et-tb-tag-add')) {
            const group  = e.target.dataset.tbAddGroup;
            const addBtn = e.target;
            const input  = document.createElement('input');
            input.className = 'et-tb-inline-input';
            input.placeholder = 'Tag name...';
            addBtn.parentElement.insertBefore(input, addBtn);
            input.focus();
            input.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter' && input.value.trim()) {
                    const val = input.value.trim();
                    const settings = getSettings();
                    if (!settings.tags[group]) settings.tags[group] = [];
                    if (!settings.tags[group].includes(val)) {
                        settings.tags[group].push(val);
                        save();
                    }
                    const chip = document.createElement('span');
                    chip.className = 'et-tb-tag';
                    chip.dataset.tbTag   = val;
                    chip.dataset.tbGroup = group;
                    chip.textContent = val;
                    addBtn.parentElement.insertBefore(chip, input);
                    input.value = '';
                    input.focus();
                    // 앱 패널도 갱신
                    syncTagToPanel(group, val);
                }
                if (ev.key === 'Escape') input.remove();
            });
            return;
        }

        // 선택된 칩 × 클릭
        if (e.target.classList.contains('et-tb-selected-chip-del')) {
            const chip  = e.target.closest('.et-tb-selected-chip');
            const tag   = chip.dataset.selTag;
            const group = chip.dataset.selGroup;
            if (tbSelected[group]) {
                tbSelected[group] = tbSelected[group].filter(t => t !== tag);
            }
            // 툴바 태그 selected 해제
            document.querySelectorAll(`.et-tb-tag[data-tb-tag="${tag}"]`).forEach(el => el.classList.remove('selected'));
            chip.remove();
            renderToolbarSelectedArea();
            return;
        }
    });

    // 초기화
    document.getElementById('et-tb-clear')?.addEventListener('click', () => {
        tbSelected = {};
        document.querySelectorAll('.et-tb-tag').forEach(t => t.classList.remove('selected'));
        document.getElementById('et-tb-free').value = '';
        renderToolbarSelectedArea();
    });

    // Apply
    document.getElementById('et-tb-apply')?.addEventListener('click', async function() {
        const freeInput = document.getElementById('et-tb-free')?.value?.trim() || '';
        const hasSelected = GROUPS.some(g => (tbSelected[g]||[]).length > 0);
        if (!hasSelected && !freeInput) return;

        this.disabled = true;
        this.textContent = '...';
        try {
            await applyToolbar(freeInput);
            document.getElementById('et-tb-free').value = '';
        } finally {
            this.disabled = false;
            this.textContent = 'Apply';
        }
    });
}

// 툴바에서 추가한 태그를 앱 패널에도 반영
function syncTagToPanel(group, val) {
    const wrap = document.getElementById(`et-wrap-${group}`);
    if (!wrap) return;
    const addBtn = wrap.querySelector('.et-tag-add');
    if (!addBtn) return;
    const chip = document.createElement('div');
    chip.className = 'et-tag-chip';
    chip.dataset.tag   = val;
    chip.dataset.group = group;
    chip.innerHTML = `${val}<span class="et-tag-chip-del" data-del-tag="${val}" data-del-group="${group}">×</span>`;
    wrap.insertBefore(chip, addBtn);
}

// ============================================================
// 팝업 열기/닫기
// ============================================================

function openPopup() {
    if (popupOpen) return;
    popupOpen = true;
    document.body.insertAdjacentHTML('beforeend', buildPopupHTML());
    bindPopupEvents();
}

function closePopup() {
    popupOpen = false;
    document.getElementById('et-overlay')?.remove();
}

// ============================================================
// 초기화
// ============================================================

eventSource.on(event_types.APP_READY, () => {
    getSettings();

    // 매직완드 메뉴 항목
    const wandMenu = document.getElementById('extensionsMenu');
    if (wandMenu) {
        const item = document.createElement('div');
        item.className = 'list-group-item flex-container flexGap5';
        item.innerHTML = '<span>⚡</span><span>Event Toolbar</span>';
        item.addEventListener('click', () => {
            wandMenu.style.display = 'none';
            openPopup();
        });
        wandMenu.appendChild(item);
    }

    // 툴바 렌더링
    renderToolbar();

    console.log('[Event Toolbar] loaded successfully.');
});

eventSource.on(event_types.CHAT_CHANGED, () => {
    renderToolbar();
    tbSelected = {};
});
