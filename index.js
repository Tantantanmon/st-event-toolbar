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

const EXT_NAME    = 'event-toolbar';
const INJECT_KEY  = 'et-toolbar-prompt';
const STYLE_KEY   = 'et-style-prompt';
const TONE_KEY    = 'et-tone-prompt';

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
    env:      ['Heavy rain', 'Power outage', 'First snow', 'Storm', 'Heat wave'],
    time:     ['A few hours later', 'The next day', '3 days later', 'A week later', 'A month later']};

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
    env:      '환경',
    time:     '시간'
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
    env:      (tags) => `The environment changes: ${tags.join(', ')}`,
    time:     (tags) => `Time skip — ${tags.join(', ')}`
};

// 기본 그룹 (고정)
const BASE_GROUPS = Object.keys(DEFAULT_TAGS);
// 커스텀 그룹 포함 전체 그룹 (동적)
let GROUPS = [...BASE_GROUPS];

// ============================================================
// 상태
// ============================================================

let popupOpen      = false;
let currentTab     = 'home';
let currentTbGroup = 'place';
let tbSelected     = {};
let tbCollapsed    = false;
let currentCharKey = null;

// ============================================================
// 설정 헬퍼
// ============================================================

function getSettings() {
    if (!extension_settings[EXT_NAME]) {
        extension_settings[EXT_NAME] = {
            config:       { toolbar_visible: true, fontSize: 1.0 },
            tags:         JSON.parse(JSON.stringify(DEFAULT_TAGS)),
            customGroups: [],
            globalStyles: [],
            chars:        {}
        };
    }
    const s = extension_settings[EXT_NAME];
    if (!s.config)                s.config        = { toolbar_visible: true, fontSize: 1.0 };
    if (s.config.fontSize == null) s.config.fontSize = 1.0;
    if (!s.tags)                  s.tags          = JSON.parse(JSON.stringify(DEFAULT_TAGS));
    if (!s.customGroups)          s.customGroups  = [];
    if (!s.globalStyles)          s.globalStyles  = [];
    if (!s.chars)                 s.chars         = {};
    return s;
}

function getCharKey() {
    try {
        const c = SillyTavern.getContext();
        const char = c?.characters?.[c?.characterId];
        if (!char) return 'default';
        return `${char.name}_${char.avatar}`.replace(/[^a-zA-Z0-9가-힣_]/g, '_');
    } catch(e) { return 'default'; }
}

function getCharData() {
    const settings = getSettings();
    const key = getCharKey();
    if (!settings.chars[key]) settings.chars[key] = { activeStyleId: null, tone: '', toneOpen: false };
    if (settings.chars[key].tone == null) settings.chars[key].tone = '';
    return settings.chars[key];
}

// GROUPS 동적 갱신
function refreshGroups() {
    const settings = getSettings();
    GROUPS = [...BASE_GROUPS, ...(settings.customGroups || []).map(g => g.id)];
}

// 글쓰기 스타일 프롬프트 삽입
function updateStylePrompt() {
    const settings  = getSettings();
    const charData  = getCharData();
    const active    = (settings.globalStyles || []).find(s => s.id === charData.activeStyleId);
    const { setExtensionPrompt: ctxSEP } = SillyTavern.getContext();
    if (active && active.prompt && active.prompt.trim()) {
        ctxSEP(STYLE_KEY, wrap(`Writing Style:\n${active.prompt.trim()}`), 1, 1);
    } else {
        ctxSEP(STYLE_KEY, '', 1, 1);
    }
}

// 캐릭터 말투 프롬프트 삽입
function updateTonePrompt() {
    const charData = getCharData();
    const { setExtensionPrompt: ctxSEP } = SillyTavern.getContext();
    if (charData.tone && charData.tone.trim()) {
        ctxSEP(TONE_KEY, wrap(`Character Voice:\n${charData.tone.trim()}`), 1, 2);
    } else {
        ctxSEP(TONE_KEY, '', 1, 2);
    }
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

    // 선택된 태그 그룹별 프롬프트 (주체 포함)
    GROUPS.forEach(group => {
        const selected = tbSelected[group];
        if (!selected || selected.length === 0) return;

        // 주체별로 그룹핑
        const bySubject = {};
        selected.forEach(({ tag, subject }) => {
            if (!bySubject[subject]) bySubject[subject] = [];
            bySubject[subject].push(tag);
        });

        Object.entries(bySubject).forEach(([subject, tags]) => {
            const fn = GROUP_PROMPT[group];
            let base = fn ? fn(tags) : `${group}: ${tags.join(', ')}`;

            if (subject === 'c2u')  base = `{{char}} does this TO {{user}}: ${tags.join(', ')}`;
            else if (subject === 'u2c')  base = `{{user}} does this TO {{char}}: ${tags.join(', ')}`;
            else if (subject === 'char') base = `{{char}} independently — ${tags.join(', ')}`;
            else if (subject === 'user') base = `{{user}} independently — ${tags.join(', ')}`;

            parts.push(base);
        });
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

    const { setExtensionPrompt: ctxSEP, generate } = SillyTavern.getContext();
    ctxSEP(INJECT_KEY, prompt, 1, 0);
    await generate('normal', {});
    setTimeout(() => {
        try { ctxSEP(INJECT_KEY, '', 1, 0); } catch(e) {}
    }, 300);

    tbSelected = {};
    renderToolbarSelectedArea();
    renderToolbarTags();
}

// ============================================================
// 팝업 HTML
// ============================================================

function buildPopupInnerHTML() {
    const settings = getSettings();
    const cfg = settings.config;
    refreshGroups();

    const customGroupTabs = (settings.customGroups || []).map(g =>
        `<div class="et-sb-tab${currentTab===g.id?' active':''}" data-et-tab="${g.id}">${g.label}</div>`
    ).join('');

    const sidebarTabs = `
        <div class="et-sb-tab${currentTab==='home'?' active':''}" data-et-tab="home">홈</div>
        <div class="et-sb-divider"></div>
        ${BASE_GROUPS.map(g =>
            `<div class="et-sb-tab${currentTab===g?' active':''}" data-et-tab="${g}">${GROUP_LABELS[g]}</div>`
        ).join('')}
        ${customGroupTabs}
        <div class="et-sb-add-group" id="et-sb-add-group">+</div>
    `;

    const customGroupPanels = (settings.customGroups || []).map(g =>
        buildTagPanel(g.id, settings.tags[g.id] || [], g.label, true)
    ).join('');

    const panels = `
        ${buildHomePanel(cfg)}
        ${BASE_GROUPS.map(g => buildTagPanel(g, settings.tags[g] || [], GROUP_LABELS[g], false)).join('')}
        ${customGroupPanels}
    `;

    return `
        <div class="et-sidebar">
            <div class="et-sb-logo">
                <svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
            </div>
            <div class="et-sb-divider"></div>
            ${sidebarTabs}
            <div class="et-sb-spacer"></div>
        </div>
        <div class="et-main">${panels}</div>`;
}

function buildHomePanel(cfg) {
    const settings  = getSettings();
    const charData  = getCharData();
    const styles    = settings.globalStyles || [];
    const activeId  = charData.activeStyleId;
    const fontSize  = settings.config.fontSize || 1.0;
    const tone      = charData.tone || '';
    const toneOpen  = charData.toneOpen || false;

    const stylesHTML = styles.map((s) => `
        <div class="et-style-item${s.open?' open':''}" data-style-id="${s.id}">
            <div class="et-style-header" data-style-toggle="${s.id}">
                <div class="et-style-radio${s.id===activeId?' on':''}" data-style-select="${s.id}"></div>
                <div class="et-style-name">${s.name}</div>
                <div class="et-style-status${s.id===activeId?' active':''}">${s.id===activeId?'ON':'OFF'}</div>
                <div class="et-style-chevron">▾</div>
            </div>
            <div class="et-style-body">
                <textarea class="et-style-textarea" data-style-textarea="${s.id}" rows="4">${s.prompt||''}</textarea>
                <div class="et-style-actions">
                    <button class="et-style-save" data-style-save="${s.id}">저장</button>
                    <button class="et-style-del" data-style-del="${s.id}">삭제</button>
                </div>
            </div>
        </div>`).join('');

    return `
    <div class="et-panel${currentTab==='home'?' active':''}" id="et-panel-home">
        <div class="et-header">
            <div>
                <div class="et-header-title">Event Toolbar</div>
            </div>
            <button class="et-popup-close" id="et-popup-close">✕</button>
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
                <div class="et-home-label">Font Size</div>
                <div class="et-font-row">
                    <span class="et-font-label">A</span>
                    <input class="et-font-slider" id="et-font-slider" type="range"
                        min="0.85" max="1.3" step="0.05" value="${fontSize}" />
                    <span class="et-font-label" style="font-size:16px;">A</span>
                </div>
            </div>
            <div class="et-home-section">
                <div class="et-home-label">Writing Style</div>
                ${stylesHTML}
                <button class="et-style-add" id="et-style-add">+ 스타일 추가</button>
            </div>
            <div class="et-home-section">
                <div class="et-home-label">Voice</div>
                <div class="et-style-item${toneOpen?' open':''}" id="et-tone-item">
                    <div class="et-style-header" id="et-tone-toggle">
                        <div class="et-style-name" style="font-size:12px;color:#9ca3af;">캐릭터 말투 (이 캐릭터에만 적용)</div>
                        <div class="et-style-chevron">▾</div>
                    </div>
                    <div class="et-style-body">
                        <textarea class="et-style-textarea" id="et-tone-textarea" rows="5"
                            placeholder="예: {{char}} speaks in short, clipped sentences. Low voice, never raises it...">${tone}</textarea>
                        <div class="et-style-actions">
                            <button class="et-style-save" id="et-tone-save">저장</button>
                            <button class="et-style-del" id="et-tone-clear">지우기</button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="et-home-section">
                <div class="et-home-label">Danger Zone</div>
                <button class="et-reset-all-btn" id="et-reset-all">전체 초기화</button>
            </div>
        </div>
    </div>`;
}

function buildTagPanel(group, tags, label, isCustom) {
    label = label || GROUP_LABELS[group] || group;
    const tagsHTML = tags.map(t => `
        <div class="et-tag-chip" data-tag="${t}" data-group="${group}">
            ${t}<span class="et-tag-chip-del" data-del-tag="${t}" data-del-group="${group}">×</span>
        </div>`).join('');

    return `
    <div class="et-panel${currentTab===group?' active':''}" id="et-panel-${group}">
        <div class="et-header">
            <div>
                <div class="et-header-title">${label}</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
                <button class="et-group-del-btn" data-del-group="${group}">그룹 삭제</button>
                <button class="et-popup-close" data-close-popup>✕</button>
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
    refreshGroups();

    const groupTabsHTML = GROUPS.map(g => {
        const label = GROUP_LABELS[g] || (settings.customGroups.find(c=>c.id===g)?.label) || g;
        return `<button class="et-tb-group-tab${g===currentTbGroup?' active':''}" data-tb-group="${g}">${label}</button>`;
    }).join('');

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
            <div class="et-tb-groups-scroll">
                ${groupTabsHTML}
            </div>
            <div class="et-tb-buttons">
                <button class="et-tb-collapse" id="et-tb-collapse">${tbCollapsed?'▲':'▼'}</button>
                <button class="et-tb-close" id="et-tb-close">✕</button>
            </div>
        </div>
        <div class="et-tb-collapsible${tbCollapsed?' hidden':''}" id="et-tb-collapsible">
            <div class="et-tb-tags-area">${groupTagsHTML}</div>
            <div class="et-tb-selected-area" id="et-tb-selected-area">
                <div class="et-tb-selected-label">선택됨</div>
            </div>
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
        wrap.querySelectorAll('.et-tb-tag').forEach(el => el.remove());
        const selected = tbSelected[g] || [];
        const tagsHTML = (settings.tags[g]||[]).map(t => {
            const isSel = selected.some(s => s.tag === t);
            return `<span class="et-tb-tag${isSel?' selected':''}" data-tb-tag="${t}" data-tb-group="${g}">${t}</span>`;
        }).join('');
        addBtn.insertAdjacentHTML('beforebegin', tagsHTML);
    });
}

function renderToolbarSelectedArea() {
    const area = document.getElementById('et-tb-selected-area');
    if (!area) return;
    area.querySelectorAll('.et-tb-selected-chip').forEach(c => c.remove());

    const subjectLabel = { c2u:'C→U', u2c:'U→C', char:'C', user:'U', '':'' };
    const allSelected = [];
    GROUPS.forEach(g => {
        (tbSelected[g]||[]).forEach(({ tag, subject }) => {
            allSelected.push({ tag, subject, group: g });
        });
    });

    if (allSelected.length > 0) {
        area.classList.add('show');
        allSelected.forEach(({ tag, subject, group }) => {
            const chip = document.createElement('div');
            chip.className = 'et-tb-selected-chip';
            chip.dataset.selTag = tag;
            chip.dataset.selGroup = group;
            const subLabel = subjectLabel[subject] || '';
            chip.innerHTML = `${tag}${subLabel?` <span class="et-tb-chip-subject">${subLabel}</span>`:''}
                <span class="et-tb-selected-chip-del">×</span>`;
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

    // X 버튼 닫기
    document.getElementById('et-popup-close')?.addEventListener('click', () => closePopup());

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

    // 커스텀 그룹 추가 버튼
    document.getElementById('et-sb-add-group')?.addEventListener('click', () => {
        const name = prompt('그룹 이름 입력:');
        if (!name || !name.trim()) return;
        const label = name.trim();
        const id = 'cg_' + Date.now();
        const settings = getSettings();
        settings.customGroups.push({ id, label });
        settings.tags[id] = [];
        save();
        closePopup();
        openPopup();
        currentTab = id;
    });

    // 툴바 토글
    document.getElementById('et-toolbar-toggle')?.addEventListener('click', function() {
        const cfg = getSettings().config;
        cfg.toolbar_visible = !cfg.toolbar_visible;
        this.classList.toggle('off', !cfg.toolbar_visible);
        save();
        renderToolbar();
    });

    // 폰트 크기 슬라이더
    document.getElementById('et-font-slider')?.addEventListener('input', function() {
        const val = parseFloat(this.value);
        document.getElementById('et-popup').style.transform = `scale(${val})`;
        document.getElementById('et-popup').style.transformOrigin = 'center center';
        getSettings().config.fontSize = val;
        save();
    });

    // Voice 아코디언 토글
    document.getElementById('et-tone-toggle')?.addEventListener('click', () => {
        const charData = getCharData();
        charData.toneOpen = !charData.toneOpen;
        save();
        document.getElementById('et-tone-item')?.classList.toggle('open', charData.toneOpen);
    });

    // Voice 저장
    document.getElementById('et-tone-save')?.addEventListener('click', function() {
        const ta = document.getElementById('et-tone-textarea');
        if (!ta) return;
        const charData = getCharData();
        charData.tone = ta.value;
        save();
        updateTonePrompt();
        this.textContent = '저장됨 ✓';
        setTimeout(() => this.textContent = '저장', 1500);
    });

    // Voice 지우기
    document.getElementById('et-tone-clear')?.addEventListener('click', () => {
        if (!confirm('말투를 지울까요?')) return;
        const ta = document.getElementById('et-tone-textarea');
        if (ta) ta.value = '';
        const charData = getCharData();
        charData.tone = '';
        save();
        updateTonePrompt();
    });

    // 글쓰기 스타일 추가 (전역 풀)
    document.getElementById('et-style-add')?.addEventListener('click', () => {
        const name = prompt('스타일 이름:');
        if (!name || !name.trim()) return;
        const settings = getSettings();
        settings.globalStyles.push({
            id: 'style_' + Date.now(),
            name: name.trim(),
            prompt: '',
            open: true
        });
        save();
        refreshHomePanel();
    });

    // 전체 초기화
    document.getElementById('et-reset-all')?.addEventListener('click', () => {
        if (!confirm('모든 데이터를 초기화할까요? 되돌릴 수 없습니다.')) return;
        delete extension_settings[EXT_NAME];
        getSettings(); // 기본값으로 복구
        save();
        tbSelected = {};
        refreshGroups();
        renderToolbar();
        closePopup();
        openPopup();
    });

    // 팝업 이벤트 위임
    document.getElementById('et-popup')?.addEventListener('click', (e) => {

        // X 버튼 (모든 탭)
        if (e.target.dataset.closePopup !== undefined || e.target.id === 'et-popup-close') {
            closePopup();
            return;
        }

        // 글쓰기 스타일 아코디언 토글
        if (e.target.dataset.styleToggle !== undefined) {
            const id = e.target.dataset.styleToggle;
            const settings = getSettings();
            const style = settings.globalStyles.find(s => s.id === id);
            if (style) { style.open = !style.open; save(); }
            e.target.closest('.et-style-item')?.classList.toggle('open');
            return;
        }

        // 글쓰기 스타일 라디오 선택 (전역 풀 + 캐릭터별 선택)
        if (e.target.dataset.styleSelect !== undefined) {
            e.stopPropagation();
            const id = e.target.dataset.styleSelect;
            const charData = getCharData();
            charData.activeStyleId = charData.activeStyleId === id ? null : id;
            save();
            updateStylePrompt();
            refreshHomePanel();
            return;
        }

        // 글쓰기 스타일 저장
        if (e.target.dataset.styleSave !== undefined) {
            const id = e.target.dataset.styleSave;
            const settings = getSettings();
            const style = settings.globalStyles.find(s => s.id === id);
            const ta = document.querySelector(`[data-style-textarea="${id}"]`);
            if (style && ta) style.prompt = ta.value;
            save();
            updateStylePrompt();
            const btn = e.target;
            btn.textContent = '저장됨 ✓';
            setTimeout(() => btn.textContent = '저장', 1500);
            return;
        }

        // 글쓰기 스타일 삭제
        if (e.target.dataset.styleDel !== undefined) {
            if (!confirm('스타일을 삭제할까요?')) return;
            const id = e.target.dataset.styleDel;
            const settings = getSettings();
            settings.globalStyles = settings.globalStyles.filter(s => s.id !== id);
            // 이 스타일 선택한 캐릭터 초기화
            Object.values(settings.chars).forEach(c => {
                if (c.activeStyleId === id) c.activeStyleId = null;
            });
            save();
            updateStylePrompt();
            refreshHomePanel();
            return;
        }

        // 그룹 삭제 (기본 + 커스텀)
        if (e.target.dataset.delGroup !== undefined) {
            const group = e.target.dataset.delGroup;
            const label = GROUP_LABELS[group] || group;
            if (!confirm(`"${label}" 그룹을 삭제할까요?\n기본 그룹은 초기화로 복구 가능해요.`)) return;
            const settings = getSettings();
            // 커스텀 그룹이면 목록에서도 제거
            settings.customGroups = settings.customGroups.filter(g => g.id !== group);
            // 태그 데이터 삭제
            delete settings.tags[group];
            // BASE_GROUPS에서도 제거 (런타임)
            const idx = BASE_GROUPS.indexOf(group);
            if (idx >= 0) BASE_GROUPS.splice(idx, 1);
            // GROUP_LABELS, GROUP_PROMPT에서도 제거
            delete GROUP_LABELS[group];
            delete GROUP_PROMPT[group];
            save();
            refreshGroups();
            currentTab = 'home';
            closePopup();
            openPopup();
            return;
        }

        // 태그 삭제 버튼 (× 클릭)
        if (e.target.dataset.delTag !== undefined) {
            const tag   = e.target.dataset.delTag;
            const group = e.target.dataset.delGroup;
            const settings = getSettings();
            settings.tags[group] = (settings.tags[group]||[]).filter(t => t !== tag);
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
            const saveTag = (val) => {
                const settings = getSettings();
                if (!settings.tags[group]) settings.tags[group] = [];
                if (!settings.tags[group].includes(val)) settings.tags[group].push(val);
                const chip = document.createElement('div');
                chip.className = 'et-tag-chip';
                chip.dataset.tag = val;
                chip.dataset.group = group;
                chip.innerHTML = `${val}<span class="et-tag-chip-del" data-del-tag="${val}" data-del-group="${group}">×</span>`;
                addBtn.parentElement.insertBefore(chip, input);
            };

            input.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter' && input.value.trim()) {
                    saveTag(input.value.trim());
                    input.value = '';
                    input.focus();
                }
                if (ev.key === 'Escape') input.remove();
            });
            input.addEventListener('blur', () => {
                if (input.value.trim()) saveTag(input.value.trim());
                input.remove();
            });
            return;
        }

        // 저장 버튼
        if (e.target.dataset.saveGroup !== undefined) {
            save();
            renderToolbar();
            const btn = e.target;
            btn.textContent = '저장됨 ✓';
            setTimeout(() => btn.textContent = '저장', 1500);
            return;
        }

        // 초기화 버튼
        if (e.target.dataset.resetGroup !== undefined) {
            const group = e.target.dataset.resetGroup;
            const isCustom = !BASE_GROUPS.includes(group);
            if (isCustom) {
                if (!confirm('커스텀 그룹 태그를 초기화할까요?')) return;
                getSettings().tags[group] = [];
            } else {
                if (!confirm(`"${GROUP_LABELS[group]}" 태그를 초기화할까요?`)) return;
                getSettings().tags[group] = JSON.parse(JSON.stringify(DEFAULT_TAGS[group]));
            }
            save();
            const wrap = document.getElementById(`et-wrap-${group}`);
            if (wrap) {
                const tags = getSettings().tags[group] || [];
                wrap.innerHTML = tags.map(t => `
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

function refreshHomePanel() {
    const cfg = getSettings().config;
    const newHTML = buildHomePanel(cfg);
    const oldPanel = document.getElementById('et-panel-home');
    if (!oldPanel) return;
    oldPanel.outerHTML = newHTML;

    // 폰트 슬라이더
    document.getElementById('et-font-slider')?.addEventListener('input', function() {
        const val = parseFloat(this.value);
        document.getElementById('et-popup').style.transform = `scale(${val})`;
        document.getElementById('et-popup').style.transformOrigin = 'center center';
        getSettings().config.fontSize = val;
        save();
    });

    // Voice
    document.getElementById('et-tone-toggle')?.addEventListener('click', () => {
        const charData = getCharData();
        charData.toneOpen = !charData.toneOpen;
        save();
        document.getElementById('et-tone-item')?.classList.toggle('open', charData.toneOpen);
    });
    document.getElementById('et-tone-save')?.addEventListener('click', function() {
        const ta = document.getElementById('et-tone-textarea');
        if (!ta) return;
        const charData = getCharData();
        charData.tone = ta.value;
        save();
        updateTonePrompt();
        this.textContent = '저장됨 ✓';
        setTimeout(() => this.textContent = '저장', 1500);
    });
    document.getElementById('et-tone-clear')?.addEventListener('click', () => {
        if (!confirm('말투를 지울까요?')) return;
        const ta = document.getElementById('et-tone-textarea');
        if (ta) ta.value = '';
        const charData = getCharData();
        charData.tone = '';
        save();
        updateTonePrompt();
    });

    document.getElementById('et-popup-close')?.addEventListener('click', () => closePopup());
    document.getElementById('et-toolbar-toggle')?.addEventListener('click', function() {
        const cfg = getSettings().config;
        cfg.toolbar_visible = !cfg.toolbar_visible;
        this.classList.toggle('off', !cfg.toolbar_visible);
        save();
        renderToolbar();
    });
    document.getElementById('et-style-add')?.addEventListener('click', () => {
        const name = prompt('스타일 이름:');
        if (!name || !name.trim()) return;
        const settings = getSettings();
        settings.globalStyles.push({
            id: 'style_' + Date.now(),
            name: name.trim(),
            prompt: '',
            open: true
        });
        save();
        refreshHomePanel();
    });
    document.getElementById('et-reset-all')?.addEventListener('click', () => {
        if (!confirm('모든 데이터를 초기화할까요? 되돌릴 수 없습니다.')) return;
        delete extension_settings[EXT_NAME];
        getSettings();
        save();
        tbSelected = {};
        refreshGroups();
        renderToolbar();
        closePopup();
        openPopup();
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

    // 접기/펼치기
    document.getElementById('et-tb-collapse')?.addEventListener('click', function() {
        tbCollapsed = !tbCollapsed;
        document.getElementById('et-tb-collapsible')?.classList.toggle('hidden', tbCollapsed);
        this.textContent = tbCollapsed ? '▲' : '▼';
    });

    // X 닫기
    document.getElementById('et-tb-close')?.addEventListener('click', () => {
        const cfg = getSettings().config;
        cfg.toolbar_visible = false;
        save();
        document.getElementById('et-toolbar')?.remove();
        document.getElementById('et-toolbar-toggle')?.classList.add('off');
    });

    // 태그 클릭 (이벤트 위임)
    document.getElementById('et-toolbar')?.addEventListener('click', (e) => {

        // 주체 미니팝업 버튼 선택
        if (e.target.classList.contains('et-tb-subject-btn')) {
            const popup  = e.target.closest('.et-tb-subject-popup');
            const tag    = popup.dataset.tag;
            const group  = popup.dataset.group;
            const subject = e.target.dataset.subject;
            popup.remove();

            if (!tbSelected[group]) tbSelected[group] = [];
            // 이미 있으면 제거 후 재추가
            tbSelected[group] = tbSelected[group].filter(s => s.tag !== tag);
            tbSelected[group].push({ tag, subject });

            // 태그 선택 표시
            document.querySelectorAll(`.et-tb-tag[data-tb-tag="${tag}"][data-tb-group="${group}"]`)
                .forEach(el => el.classList.add('selected'));
            renderToolbarSelectedArea();
            return;
        }

        // 태그 클릭 → 주체 미니팝업 표시
        if (e.target.classList.contains('et-tb-tag')) {
            const tag   = e.target.dataset.tbTag;
            const group = e.target.dataset.tbGroup;

            // 이미 선택된 태그면 해제
            const existing = (tbSelected[group]||[]).find(s => s.tag === tag);
            if (existing) {
                tbSelected[group] = tbSelected[group].filter(s => s.tag !== tag);
                e.target.classList.remove('selected');
                renderToolbarSelectedArea();
                return;
            }

            // 기존 팝업 제거
            document.querySelectorAll('.et-tb-subject-popup').forEach(p => p.remove());

            // 미니팝업 생성
            const popup = document.createElement('div');
            popup.className = 'et-tb-subject-popup';
            popup.dataset.tag   = tag;
            popup.dataset.group = group;
            popup.innerHTML = `
                <button class="et-tb-subject-btn" data-subject="c2u">C→U</button>
                <button class="et-tb-subject-btn" data-subject="u2c">U→C</button>
                <button class="et-tb-subject-btn" data-subject="char">C</button>
                <button class="et-tb-subject-btn" data-subject="user">U</button>
                <button class="et-tb-subject-btn" data-subject="">없음</button>
            `;

            // 태그 바로 아래 삽입
            e.target.insertAdjacentElement('afterend', popup);

            // 외부 클릭시 닫기
            setTimeout(() => {
                document.addEventListener('click', function closePopupFn(ev) {
                    if (!popup.contains(ev.target) && ev.target !== e.target) {
                        popup.remove();
                        document.removeEventListener('click', closePopupFn);
                    }
                });
            }, 10);
            return;
        }

        // + add (툴바)
        if (e.target.classList.contains('et-tb-tag-add')) {
            const group  = e.target.dataset.tbAddGroup;
            const addBtn = e.target;
            const input  = document.createElement('input');
            input.className = 'et-tb-inline-input';
            input.placeholder = 'Tag name...';
            addBtn.parentElement.insertBefore(input, addBtn);
            input.focus();

            const saveTbTag = (val) => {
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
                syncTagToPanel(group, val);
            };

            input.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter' && input.value.trim()) {
                    saveTbTag(input.value.trim());
                    input.value = '';
                    input.focus();
                }
                if (ev.key === 'Escape') input.remove();
            });
            input.addEventListener('blur', () => {
                if (input.value.trim()) saveTbTag(input.value.trim());
                input.remove();
            });
            return;
        }

        // 선택된 칩 × 클릭
        if (e.target.classList.contains('et-tb-selected-chip-del')) {
            const chip  = e.target.closest('.et-tb-selected-chip');
            const tag   = chip.dataset.selTag;
            const group = chip.dataset.selGroup;
            if (tbSelected[group]) {
                tbSelected[group] = tbSelected[group].filter(s => s.tag !== tag);
            }
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

function isMobile() {
    try { return window.matchMedia('(max-width:430px),(pointer:coarse)').matches; }
    catch { return window.innerWidth <= 430; }
}

// ============================================================
// 팝업 열기/닫기
// ============================================================

function openPopup() {
    if (popupOpen) return;
    if (document.getElementById('et-overlay')) return;
    popupOpen = true;

    const mobile = isMobile();

    const overlay = document.createElement('div');
    overlay.id = 'et-overlay';
    overlay.style.cssText = `position:fixed;top:0;left:0;width:100vw;height:100vh;height:100dvh;z-index:99999;display:flex;background:rgba(0,0,0,0.45);backdrop-filter:blur(2px);${mobile?'align-items:flex-end;justify-content:center;':'align-items:center;justify-content:center;'}`;
    overlay.addEventListener('click', e => { if (e.target === overlay) closePopup(); });
    overlay.addEventListener('touchstart', e => { if (e.target === overlay) closePopup(); }, { passive: true });

    const popup = document.createElement('div');
    popup.id = 'et-popup';
    popup.style.cssText = mobile
        ? 'position:relative;display:flex;width:100%;height:92dvh;border-radius:24px 24px 0 0;overflow:hidden;background:#fff;box-shadow:0 -8px 40px rgba(0,0,0,0.15);'
        : 'position:relative;display:flex;width:min(480px,95vw);height:min(88vh,740px);border-radius:18px;overflow:hidden;background:#fff;box-shadow:0 8px 40px rgba(0,0,0,0.12);';

    popup.innerHTML = buildPopupInnerHTML();
    // 저장된 폰트 크기 적용
    const fontSize = getSettings().config.fontSize || 1.0;
    if (fontSize !== 1.0) {
        popup.style.transform = `scale(${fontSize})`;
        popup.style.transformOrigin = 'center center';
    }
    overlay.appendChild(popup);
    document.body.appendChild(overlay);
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
    refreshGroups();

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
    currentCharKey = getCharKey();
    renderToolbar();
    updateStylePrompt();
    updateTonePrompt();

    console.log('[Event Toolbar] loaded successfully.');
});

eventSource.on(event_types.CHAT_CHANGED, () => {
    currentCharKey = getCharKey();
    renderToolbar();
    updateStylePrompt();
    updateTonePrompt();
    tbSelected = {};
});
