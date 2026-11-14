document.addEventListener('DOMContentLoaded', () => {
    initPriemkaTovaryPage();
    setupMobileEventListeners();
});

// === АДАПТИВНАЯ РАСКЛАДКА КАРТОЧЕК ПРИЁМКИ ===
// Сами карточки не меняются — меняется только их количество (3 → 2 → 1).
// Если не помещается даже одна карточка — боковая панель прячется и открывается кнопкой-крышечкой.
const RC = {
    CARD_MIN_W: 300,   // минимальная ширина одной карточки, px
    GAP: 15,           // расстояние между карточками, px (как в CSS)
    PANEL_W: 280,      // ширина боковой панели, px (как в CSS)
    LAYOUT_GAP: 20,    // расстояние между карточками и панелью, px
    TOGGLE_W: 34,      // ширина кнопки-крышечки, px
    MAX_CARDS: 3,
    IMG_MIN_H: 48      // картинка товара сжимается почти до предела; кнопка «Показать картинку» — только если ниже этого (и только у карточек товаров)
};
// Допустимые коды: товар — ровно 10 цифр, коробка — TRBX + 10 цифр (14 символов), без пробелов
const PRODUCT_CODE_LEN = 10;
const BOX_CODE_LEN = 14;
const MAX_INPUT_LEN = BOX_CODE_LEN;   // главное поле приёмки принимает и товар, и коробку
function limitInputLength(el, max = PRODUCT_CODE_LEN) {
    if (!el) return;
    el.setAttribute('maxlength', String(max));
    el.addEventListener('input', () => {
        if (el.value.length > max) el.value = el.value.slice(0, max);
    });
}

let rcVisibleCount = RC.MAX_CARDS;

let rcRaf = null;

function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// Возвращает true, если количество карточек изменилось
function syncReceptionLayout() {
    const layout = document.querySelector('.reception-layout-desktop');
    if (!layout || window.innerWidth <= 768) return false;

    const total = layout.clientWidth;
    if (!total) return false; // блок сейчас скрыт

    const fit = (w) => Math.max(0, Math.floor((w + RC.GAP) / (RC.CARD_MIN_W + RC.GAP)));

    let count, collapsed;
    const withPanel = fit(total - RC.PANEL_W - RC.LAYOUT_GAP);
    if (withPanel >= 1) {
        count = Math.min(RC.MAX_CARDS, withPanel);
        collapsed = false;
    } else {
        count = Math.max(1, Math.min(RC.MAX_CARDS, fit(total - RC.TOGGLE_W)));
        collapsed = true;
    }

    layout.classList.toggle('panel-collapsed', collapsed);
    if (!collapsed) layout.classList.remove('panel-open');

    const changed = count !== rcVisibleCount;
    rcVisibleCount = count;
    return changed;
}

// Картинку товара сжимаем, пока это возможно. Кнопка «Показать картинку» — только когда картинка
// уже ужата до минимума и всё равно не помещается. Только у карточек товаров: у коробки её нет никогда.
function updateCardImages() {
    document.querySelectorAll('#reception-history-grid .reception-card-new').forEach(card => {
        const box = card.querySelector('.rc-center-image-container');
        if (!box) return;
        if (card.classList.contains('rc-box')) {
            card.classList.remove('img-collapsed');
            return;
        }
        card.classList.toggle('img-collapsed', box.clientHeight < RC.IMG_MIN_H);
    });
}

// Панель «Время поставки» + затемнение фона за ней
function setDeliveryPanel(open) {
    const panel = document.getElementById('delivery-time-panel');
    const overlay = document.getElementById('dt-overlay');
    if (!panel) return;
    panel.classList.toggle('visible', open);
    if (overlay) overlay.classList.toggle('visible', open);
    if (open && typeof window.renderDeliveries === 'function') window.renderDeliveries();
}

// Состояния картинки карточки: загрузка / ошибка (фиолетовый спиннер на сером) / загружена
function bindCardImage(card, imageUrl) {
    const frame = card.querySelector('.rc-img-frame');
    const img = frame && frame.querySelector('img');
    if (!img) return;
    let retries = 0;

    const setState = (state) => {
        frame.classList.remove('is-loading', 'is-error', 'is-loaded');
        frame.classList.add(state);
    };
    const onLoad = () => setState('is-loaded');
    const onError = () => {
        setState('is-error'); // спиннер остаётся, пока картинка не загрузится
        if (retries < 3) {
            retries++;
            setTimeout(() => {
                if (!img.isConnected) return;
                setState('is-loading');
                img.src = imageUrl + (imageUrl.includes('?') ? '&' : '?') + 'r=' + Date.now();
            }, 4000);
        }
    };

    setState('is-loading');
    img.addEventListener('load', onLoad);
    img.addEventListener('error', onError);
    if (img.complete) {
        if (img.naturalWidth > 0) onLoad(); else onError();
    }
}

function setupReceptionLayout() {
    const layout = document.querySelector('.reception-layout-desktop');
    if (!layout) return;

    const onResize = () => {
        cancelAnimationFrame(rcRaf);
        rcRaf = requestAnimationFrame(() => {
            if (syncReceptionLayout()) renderReceptionHistory();
            else updateCardImages();
        });
    };

    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(onResize).observe(layout);
    window.addEventListener('resize', onResize);

    document.getElementById('rsp-toggle')?.addEventListener('click', (e) => {
        e.stopPropagation();
        layout.classList.toggle('panel-open');
    });
    document.querySelector('.reception-main-area')?.addEventListener('click', () => {
        layout.classList.remove('panel-open');
    });
}

function getActualCell(cell, cellChanges) {
    return (cellChanges && cellChanges[cell]) ? cellChanges[cell] : cell;
}

// === УТИЛИТА ДЛЯ ТОЧНОЙ ДАТЫ МСК ===
function getMSKDateString(dateStringOrObj) {
    const d = new Date(dateStringOrObj || new Date());
    // Получаем точное UTC время в миллисекундах
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    // Сдвигаем на +3 часа (МСК)
    const mskDate = new Date(utc + (3600 * 1000 * 3));
    const y = mskDate.getFullYear();
    const m = String(mskDate.getMonth() + 1).padStart(2, '0');
    const day = String(mskDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function initPriemkaTovaryPage () {
    if(typeof window.generateDeliveriesForToday === 'function') window.generateDeliveriesForToday();
    if(typeof window.renderDeliveries === 'function') window.renderDeliveries();
    
    clearHistoryAtMidnight();
    // Проверяем наступление полуночи каждую минуту
    setInterval(clearHistoryAtMidnight, 60000);

    // Коробки хранятся 36 часов: чистим при старте и каждую минуту
    purgeExpiredBoxes();
    setInterval(() => {
        if (purgeExpiredBoxes() && document.getElementById('reception-history-grid')) renderReceptionHistory();
    }, 60000);
    syncReceptionLayout();
    setupReceptionLayout();
    renderReceptionHistory();
    
    const input = document.getElementById('product-code');
    if(input) input.focus();
    limitInputLength(document.getElementById('product-code'), BOX_CODE_LEN);   // товар (10 цифр) или коробка (TRBX + 10 цифр)
    ['modal-input-field', 'qc-input-1', 'qc-input-2'].forEach(id => limitInputLength(document.getElementById(id), PRODUCT_CODE_LEN));
    
    document.getElementById('reception-btn')?.addEventListener('click', () => processReception());
    document.getElementById('simulate-qr-btn')?.addEventListener('click', simulateQRScan);
    if(input) input.addEventListener('keypress', (e) => { if (e.key === 'Enter') processReception(); });
    
    document.getElementById('accept-no-barcode-btn')?.addEventListener('click', () => startNoBarcodeFlow());
    document.getElementById('delivery-time-btn')?.addEventListener('click', () => setDeliveryPanel(true));
    document.getElementById('close-delivery-panel-btn')?.addEventListener('click', () => setDeliveryPanel(false));
    // Клик по затемнённому фону или Esc — закрывают панель
    document.getElementById('dt-overlay')?.addEventListener('click', () => setDeliveryPanel(false));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setDeliveryPanel(false); });

    // Esc закрывает модалку быстрой смены ячейки
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeQuickCell(); closeQrZoom(); } });
    setupQrZoom();
    setupClientPvzModal();

    setDefectMode(false);
    setupQuickCellModal();

    // Иконка edit.svg на карточке → страница смены ячейки
    document.getElementById('reception-history-grid')?.addEventListener('click', (e) => {
        if (e.target.closest('.rc-edit-btn')) location.href = 'p2.html';
    });

    document.addEventListener('scan', (e) => {
        const code = String(e.detail.code || '').trim();
        const input = document.getElementById('product-code');
        const modalInput = document.getElementById('modal-input-field');
        const modal = document.getElementById('input-modal');

        // Максимум 14 символов (TRBX + 10 цифр) — слишком длинный код не принимаем
        if (code.length > MAX_INPUT_LEN) {
            if (input) input.value = '';
            showAlert(`Код длиннее ${MAX_INPUT_LEN} символов. Отсканируйте ещё раз`, true);
            return;
        }

        if (isQuickCellOpen()) {
            qcHandleInput(code);
        } else if (modal && modal.classList.contains('visible') && modalInput) {
            modalInput.value = code;
            document.getElementById('modal-submit-btn').click();
        } else if (document.body.contains(input) && !document.querySelector('.fullscreen-modal.visible')) {
            if (window.innerWidth > 768) {
                input.value = code;
                processReception();
            } else {
                processReception({code: code});
            }
        }
    });
}

function setupMobileEventListeners() {
    const moreBtn = document.getElementById('mobile-more-btn');
    const moreMenu = document.getElementById('mobile-more-menu-content');
    
    if(moreBtn && moreMenu) {
        moreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            moreMenu.classList.toggle('visible');
        });
        
        document.addEventListener('click', (e) => {
            if (!moreBtn.contains(e.target) && !moreMenu.contains(e.target)) {
                moreMenu.classList.remove('visible');
            }
        });
    }

    const dotsBtn = document.getElementById('mobile-dots-btn');
    if(dotsBtn) {
        dotsBtn.addEventListener('click', () => {
             startNoBarcodeFlow();
        });
    }
    
    document.getElementById('mobile-problems-qr-btn')?.addEventListener('click', () => {
        document.getElementById('mobile-more-menu-content').classList.remove('visible');
        startNoBarcodeFlow();
    });
    
    document.getElementById('mobile-exit-btn')?.addEventListener('click', () => {
        const uid = firebase.auth().currentUser ? firebase.auth().currentUser.uid : null;
        if (uid) sessionStorage.removeItem('userCache_' + uid);
        firebase.auth().signOut();
    });

    const scanBtn = document.getElementById('mobile-start-scan-btn');
    const camOverlay = document.getElementById('mobile-camera-overlay');
    const closeCam = document.getElementById('close-cam-btn');
    let html5QrCode = null;
    
    if(scanBtn && camOverlay) {
        scanBtn.addEventListener('click', () => {
            camOverlay.style.display = 'flex';
            if (!html5QrCode) {
                html5QrCode = new Html5Qrcode("cam-reader-container");
            }
            html5QrCode.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                (decodedText) => {
                    if (PRODUCT_CODE_RE.test(decodedText) || BOX_CODE_RE.test(decodedText)) {
                        html5QrCode.stop().then(() => {
                            camOverlay.style.display = 'none';
                            playScannerSound();
                            processReception({ code: decodedText });
                        }).catch(err => {
                            console.error("Остановка сканера с ошибкой", err);
                        });
                    }
                },
                (errorMessage) => {}
            ).catch((err) => {
                console.error("Camera error:", err);
                showAlert('Ошибка доступа к камере. Разрешите использование камеры.', true);
                camOverlay.style.display = 'none';
            });
        });
        
        closeCam.addEventListener('click', () => {
            if (html5QrCode && html5QrCode.isScanning) {
                html5QrCode.stop().then(() => {
                    camOverlay.style.display = 'none';
                }).catch(err => {
                    camOverlay.style.display = 'none';
                });
            } else {
                camOverlay.style.display = 'none';
            }
        });
    }

    document.getElementById('m-res-next-btn')?.addEventListener('click', () => {
        document.getElementById('m-result-screen').style.display = 'none';
        document.getElementById('mobile-start-scan-btn').click();
    });
}

function simulateQRScan() {
    const min = 1000000000;
    const max = 9999999999;
    const randomCode = Math.floor(Math.random() * (max - min + 1)) + min;
    const input = document.getElementById('product-code');
    if(input) input.value = randomCode;
    
    playScannerSound();
    setTimeout(() => { processReception({ code: randomCode.toString() }); }, 200);
}

const modalState = { type: null, subType: null, tempCode: null, tempProduct: null };

function playScannerSound() { 
    const s = document.getElementById('scanner-sound'); 
    if (s) { s.currentTime = 0; s.play().catch(e => {}); } 
}

function playDeclineSound() {
    const s = document.getElementById('decline-sound');
    if (s) { s.currentTime = 0; s.play().catch(e => {}); }
}

function playSound(filename) {
    return new Promise((resolve) => {
        const audio = new Audio(filename);
        audio.onended = resolve;
        audio.play().catch(e => { console.log('Audio error:', e); resolve(); });
    });
}

function clearHistoryAtMidnight() {
    const todayStr = getMSKDateString();
    const lastClearDate = localStorage.getItem('wb_pvz_lastHistoryClearDate');
    
    if (lastClearDate !== todayStr) {
        // Наступил новый день по МСК!
        localStorage.setItem('wb_pvz_lastHistoryClearDate', todayStr);
        
        // Поставки НЕ стираем — они хранятся за всё время, receptionHistoryLog тоже не трогаем.
        // Перерисовываем UI. Функция отрисовки сама скроет старые товары.
        if (document.getElementById('reception-history-grid')) {
            renderReceptionHistory();
        }
        
        if(typeof window.generateDeliveriesForToday === 'function') window.generateDeliveriesForToday();
        if(typeof window.renderDeliveries === 'function') window.renderDeliveries();
    }
}

// ===================== КОДЫ И РЕЖИМЫ =====================
const DEFECT_QR_CODE = 'brak_brak_';          // QR «отметить брак»
const BOX_CODE_RE = /^TRBX\d{10}$/i;          // коробка: TRBX + 10 цифр (всего 14 символов, без пробелов)
const PRODUCT_CODE_RE = /^\d{10}$/;           // товар: ровно 10 цифр
const CELL_QR_RE = /^num_(\d{6})$/i;          // QR ячейки: num_000001 → ячейка 1

let defectModeActive = false;

// Режим брака: QR в правой панели краснеет, меняются тексты. Экран не меняется.
function setDefectMode(on) {
    defectModeActive = !!on;
    document.getElementById('brak-qr-wrap')?.classList.toggle('is-active', defectModeActive);
    document.getElementById('brak-qr-zoom-wrap')?.classList.toggle('is-active', defectModeActive);
    const title = document.getElementById('brak-qr-title');
    if (title) title.textContent = defectModeActive ? 'Отсканируйте товар для брака' : 'QR-код для брака до приемки';
    const def = document.getElementById('brak-info-default');
    const act = document.getElementById('brak-info-active');
    if (def) def.style.display = defectModeActive ? 'none' : '';
    if (act) act.style.display = defectModeActive ? '' : 'none';
}

// Увеличенный QR брака: по центру экрана, фон прозрачный
function closeQrZoom() {
    document.getElementById('qr-zoom-overlay')?.classList.remove('visible');
}
function setupQrZoom() {
    const overlay = document.getElementById('qr-zoom-overlay');
    const wrap = document.getElementById('brak-qr-wrap');
    if (!overlay || !wrap) return;
    wrap.addEventListener('click', (e) => {
        e.stopPropagation();
        overlay.classList.add('visible');
        // фокус остаётся в поле ввода — сканер продолжает работать
        document.getElementById('product-code')?.focus();
    });
    // Клик в пустом месте закрывает; клик по самому QR — нет
    overlay.addEventListener('click', (e) => {
        if (!e.target.closest('.qr-zoom-wrap')) closeQrZoom();
    });
}

// Отметить товар браком и в списке принятых, и в истории (карточки рисуются из истории)
function markDefective(code, isDef) {
    const userData = getUserData();
    let changed = false;
    [userData.receptionItems, userData.receptionHistoryLog].forEach(list => {
        (list || []).forEach(it => {
            if (it.code === code && it.isDefective !== isDef) { it.isDefective = isDef; changed = true; }
        });
    });
    if (changed) saveUserData(userData);
}

// «TRBX0123456789» -> «TRBX» серым + «0123456789» чёрным; пусто -> прочерк
function formatBoxCodeHTML(code) {
    const c = String(code || '');
    if (!c) return '—';
    return `<span style="color: var(--text-secondary-color);">${escapeHtml(c.slice(0, 4))}</span> <b>${escapeHtml(c.slice(4))}</b>`;
}

// Принятые коробки хранятся 36 часов с момента приёмки, потом удаляются
const BOX_TTL_MS = 36 * 60 * 60 * 1000;

function isBoxExpired(box) {
    const t = box && box.date ? new Date(box.date).getTime() : NaN;
    return isNaN(t) || (Date.now() - t) >= BOX_TTL_MS;
}

// Удаляет просроченные коробки (36 часов). Товары и текущая сессия не затрагиваются.
// Возвращает true, если что-то удалили (данные при этом уже сохранены).
function purgeExpiredBoxes() {
    const userData = getUserData();
    const boxes = userData.receptionBoxes;
    if (!Array.isArray(boxes) || !boxes.length) return false;

    const fresh = boxes.filter(b => !isBoxExpired(b));
    if (fresh.length === boxes.length) return false;

    // Удаляется только сама коробка. Товары остаются и хранят код своей коробки (boxCode) — ничего не переназначаем.
    // Текущая сессия тоже не трогается: она заканчивается сама, когда в ней закончатся товары.
    userData.receptionBoxes = fresh;
    saveUserData(userData);
    return true;
}

// Все карточки (товары за сегодня + коробки, которым нет 36 часов), новые первыми
function getTodayEntries(userData) {
    const todayStr = getMSKDateString();
    const isToday = (it) => it.date && getMSKDateString(it.date) === todayStr;
    const products = (userData.receptionHistoryLog || []).filter(isToday);
    const boxes = (userData.receptionBoxes || []).filter(b => !isBoxExpired(b));
    return products.concat(boxes).sort((a, b) => new Date(b.date) - new Date(a.date));
}

// Ячейка, которая не «перенаправлена» через cellChanges
function pickFreeRandomCell(cellChanges) {
    let cell;
    for (let i = 0; i < 30; i++) {
        cell = (Math.floor(Math.random() * 900) + 1).toString().padStart(3, '0');
        if (!cellChanges[cell]) break;
    }
    return cell;
}

// Ячейка, однозначно вычисляемая из кода товара (без random): 001–900
function cellFromProductCode(code) {
    return String((Number(code) % 900) + 1).padStart(3, '0');
}

function sameCell(a, b) {
    return parseInt(a, 10) === parseInt(b, 10);
}

// ===================== КОРОБКА (TRBX) =====================
// Сессия = «товары принимаются из этой коробки». В КАЖДОЙ сессии случайное число товаров (3–15):
//  • отсканировали НОВУЮ коробку — сразу открывается новая сессия (со своим случайным числом товаров);
//    повторный скан уже принятой коробки сессию не открывает — только звук box_already_accepted.mp3;
//  • товары в сессии закончились, а новую коробку не отсканировали — сама открывается новая сессия
//    со случайной коробкой и снова случайным числом товаров, и так далее.
// Состояние: userData.boxSession = { code, left, manual, openedAt }
//   left   — сколько товаров ещё поместится в эту сессию
//   manual — true: коробку отсканировали; false: случайная
const VBOX_MIN_ITEMS = 3;
const VBOX_MAX_ITEMS = 15;

function randomBoxCode() {
    return 'TRBX' + String(Math.floor(Math.random() * 10000000000)).padStart(10, '0');
}

function randomSessionSize() {
    return VBOX_MIN_ITEMS + Math.floor(Math.random() * (VBOX_MAX_ITEMS - VBOX_MIN_ITEMS + 1));
}

function openBoxSession(userData, code, manual) {
    userData.boxSession = { code, left: randomSessionSize(), manual: !!manual, openedAt: new Date().toISOString() };
    return userData.boxSession;
}

// Возвращает { code, closed }: код коробки для нового товара и признак, что этот товар был ПОСЛЕДНИМ
// в сессии и сессия закрылась (тогда играет last_product.mp3). Сессия сохраняется вместе с userData.
function assignBoxCodeForNewItem(userData) {
    let session = userData.boxSession;

    // Сессии нет или в ней закончились товары — открываем новую со случайной коробкой
    if (!session || !(session.left > 0)) {
        session = openBoxSession(userData, randomBoxCode(), false);
    }

    session.left -= 1;
    const code = session.code;

    // Товары в сессии закончились — сессия закрывается
    const closed = session.left <= 0;
    userData.boxSession = closed ? null : session;
    return { code, closed };
}

// Приём коробки = открытие СЕССИИ: «товары сейчас принимаются из этой коробки».
// У коробки нет ячейки и она никому не выдаётся — это только отметка, из какой коробки идёт приёмка.
function acceptBox(code) {
    purgeExpiredBoxes(); // коробки старше 36 часов удаляем до поиска

    const userData = getUserData();
    const boxes = userData.receptionBoxes || [];
    let box = boxes.find(b => b.code === code);
    const isRepeat = !!box;

    // Повторный скан уже принятой коробки: только звук box_already_accepted.mp3, ни карточки, ни новой сессии
    if (isRepeat) {
        playSound('box_already_accepted.mp3');
        showMobileResult(box, '-', true);
        return;
    }

    // Новая коробка: только box_accepted.mp3 (last_product.mp3 при скане коробки НЕ играет).
    // Если до этого была открытая сессия — она просто заменяется новой.
    playSound('box_accepted.mp3');

    // Новая коробка: карточка + новая сессия со случайным числом товаров (3–15)
    box = { code, isBox: true, cell: '-', name: 'Коробка', image: 'boxp.svg', date: new Date().toISOString() };
    boxes.unshift(box);
    if (boxes.length > 50) boxes.length = 50;
    userData.receptionBoxes = boxes;
    openBoxSession(userData, code, true);
    delete userData.virtualBox;
    saveUserData(userData);
    renderReceptionHistory();
    showMobileResult(box, '-', false);
}

// Находка излишка: товар уходит в «Возвраты» со статусом «на проверке» (от 1 до 30 минут).
// В приёмке карточки нет — только красное уведомление внизу и зелёное «+1» у серой плашки пункта «Возврат» в навигации.
// Когда проверка закончится (см. processSurplusChecks в p_shared.js): либо выпадет ячейка — товар окажется в ячейках и в «Принять снова»,
// либо ячейки не будет — карточка останется в «Возвратах» без плашки «на проверке» (ячейка «-», тот же ШК, «Товар - излишек»),
// либо товар просто исчезнет.
function registerSurplus(userData, code, options, cellChanges) {
    let productObj = options && options.product;
    if (!productObj) {
        const dataSrc = Math.random() < 0.09 ? adultProductData : productData;
        productObj = dataSrc[Math.floor(Math.random() * dataSrc.length)];
    }
    const now = Date.now();
    const item = {
        code: code,
        barcode: Math.floor(1000000000 + Math.random() * 9000000000).toString(),
        cell: '',                                         // ячейку назначат, когда проверка закончится
        name: productObj.name || 'Товар',
        image: productObj.image || '',
        price: productObj.price !== undefined ? productObj.price : 0,
        isAdult: !!productObj.isAdult,
        isFragile: !!productObj.isFragile,
        size: productObj.size || '',
        color: productObj.color || '',
        packageContents: productObj.packageContents || '',
        isReturnable: productObj.isReturnable !== undefined ? productObj.isReturnable : true,
        isRefusal: productObj.isRefusal === true,
        productLink: productObj.productLink || '',
        status: 'checking',
        outcome: window.surplusRollOutcome(),              // 'cell' 87% — ячейка; 'none' 12% — останется в «Возвратах»; 'lost' 1% — исчезнет
        foundAt: now,
        checkUntil: now + window.surplusRollCheckMs(),     // 1–30 минут
        date: new Date(now).toISOString()
    };
    userData.surplusItems = (Array.isArray(userData.surplusItems) ? userData.surplusItems : []).concat(item);
    saveUserData(userData);

    playDeclineSound();
    // Только красное уведомление внизу (без уведомления в колокольчике)
    showAlert('Излишек! Товар отправлен в раздел Возвраты на проверку', true, true); // silent: уже играет decline.mp3
    if (typeof updateAllBadges === 'function') updateAllBadges();   // серая плашка у «Возврат» обновляется сразу
    if (typeof window.showNavPlusOne === 'function') window.showNavPlusOne();
}

let lastProcessedCode = null;
let lastProcessedTime = 0;

function processReception(options = {}) {
    const input = document.getElementById('product-code');
    const rawCode = options.code || (input ? input.value.trim() : '');
    const code = String(rawCode);

    // === БЛОКИРОВКА ДВОЙНЫХ СРАБАТЫВАНИЙ (DEBOUNCE) ===
    if (!code && !options.isNoBarcode) return;

    // Максимум 14 символов (TRBX + 10 цифр)
    if (code.length > MAX_INPUT_LEN) {
        if (input) { input.value = ''; input.focus(); }
        showAlert(`Максимум ${MAX_INPUT_LEN} символов`, true);
        return;
    }

    const now = Date.now();
    if (code && code === lastProcessedCode && (now - lastProcessedTime) < 800) {
        if (input && input.value !== '') {
            input.value = ''; // Очищаем поле от дублей
        }
        return; 
    }
    lastProcessedCode = code;
    lastProcessedTime = now;

    if (input && input.value !== '') {
        input.value = '';
        input.focus();
    }
    // ===================================================

    // QR брака: экран не меняем, QR краснеет; повторный скан — отмена
    if (code.toLowerCase() === DEFECT_QR_CODE) {
        setDefectMode(!defectModeActive);
        if (defectModeActive) playSound('scan_defective_good.mp3');
        return;
    }

    // Коробка: TRBX + 10 цифр
    if (BOX_CODE_RE.test(code)) {
        acceptBox(code.toUpperCase());
        return;
    }

    // Допустимо ТОЛЬКО: 10 цифр (товар) или TRBX + 10 цифр (коробка, уже обработана выше). Пробелы и всё остальное — ошибка.
    // Исключение — приёмка без ШК: там код вводится вручную в своём окне (4–10 символов).
    const isValidCode = PRODUCT_CODE_RE.test(code);

    if (!options.isNoBarcode && !isValidCode) { 
        showAlert('Введите 10 цифр или TRBX + 10 цифр без пробелов', true);
        return; 
    }
    
    setTimeout(() => {
        const userData = getUserData();
        const receptionItems = userData.receptionItems || [];
        const receptionHistory = userData.receptionHistoryLog || [];
        const cellChanges = userData.cellChanges || {};
        const existingItem = receptionItems.find(item => item.code === code);
        
        if (existingItem) {
            const actualCell = getActualCell(existingItem.cell, cellChanges);

            // Режим брака: отмечаем уже принятый товар браком
            if (defectModeActive) {
                markDefective(code, true);
                setDefectMode(false);
                renderReceptionHistory();
                speakNumber(actualCell);
                showMobileResult({ ...existingItem, isDefective: true }, actualCell, true);
                return;
            }

            // Излишек, который сам попал в ячейку после проверки и лежит в «Принять снова»: в «Приёмке» его принимать
            // необязательно, но если отсканировали — это его приёмка: good_already_accepted.mp3 НЕ играет (только в этом случае),
            // карточка уходит из «Принять снова», товар попадает в историю приёмки.
            if (existingItem.fromSurplus) {
                delete existingItem.fromSurplus;
                userData.surplusItems = (Array.isArray(userData.surplusItems) ? userData.surplusItems : [])
                    .filter(s => !(s && s.code === code && s.status === 'ready'));
                const hist = userData.receptionHistoryLog || [];
                const histEntry = { ...existingItem, date: new Date().toISOString() };
                hist.unshift(histEntry);
                if (hist.length > 50) hist.pop();
                userData.receptionHistoryLog = hist;
                const matchedSurplusOrder = addItemToActiveOrderIfCellMatches(userData, existingItem);
                saveUserData(userData);

                speakNumber(actualCell).then(() => {
                    if (existingItem.isFragile) return playSound('delicate_good.mp3');
                });
                renderReceptionHistory();
                showMobileResult(histEntry, actualCell, false);
                if (typeof window.onSurplusChanged === 'function') window.onSurplusChanged();
                if (matchedSurplusOrder) openClientPvzModal(matchedSurplusOrder);
                return;
            }

            // Повторный скан ПОСЛЕДНЕГО товара → «Быстрая смена ячейки»
            const lastProduct = getTodayEntries(userData).find(it => !it.isBox);
            if (lastProduct && lastProduct.code === code) {
                openQuickCell(existingItem.code, actualCell, false);
                return;
            }

            speakNumber(actualCell).then(() => { 
                if (existingItem.isFragile) {
                    playSound('delicate_good.mp3').then(() => {
                        playSound('good_already_accepted.mp3');
                    });
                } else {
                    playSound('good_already_accepted.mp3'); 
                }
            });
            showAlert(`Товар уже в ячейке ${parseInt(actualCell)}`, false);
            showMobileResult(existingItem, actualCell, true);
            return;
        }

        // ===== ИЗЛИШКИ =====
        const surplusList = Array.isArray(userData.surplusItems) ? userData.surplusItems : [];
        const knownSurplus = surplusList.find(s => s && s.code === code);

        // Излишек без назначенной ячейки — остаётся в «Возвратах»
        if (knownSurplus && knownSurplus.status === 'unassigned') {
            playDeclineSound();
            showAlert('Это излишек: ячейка не назначена, он в разделе Возвраты', true, true);
            return;
        }
        // Излишек ещё на проверке — принять нельзя
        if (knownSurplus && knownSurplus.status !== 'ready') {
            playDeclineSound();
            showAlert('Излишек на проверке. Проверка занимает от 1 до 30 минут', true, true);
            return;
        }
        // Излишек не прошёл проверку и лежит в «Возвратах» — его переупаковывают и отправляют в возвратную коробку
        const surplusInReturns = (userData.returnsItems || []).find(i => i && i.source === 'surplus' && !i.confirmed && String(i.code) === code);
        if (surplusInReturns) {
            playDeclineSound();
            showAlert('Это излишек: он в разделе Возвраты. Переупакуйте его и добавьте в возвратную коробку', true, true);
            return;
        }
        // Излишек проверен, ячейка появилась — принимаем как обычный товар
        const readySurplus = knownSurplus || null;
        if (readySurplus) {
            userData.surplusItems = surplusList.filter(s => s !== readySurplus);
        } else if (Math.random() < 0.03) {
            // «Излишек» возможен только у нового товара: уходит в «Возвраты» на проверку, в приёмке не показываем
            registerSurplus(userData, code, options, cellChanges);
            return;
        }

        let assignedCell;
        const lastItem = receptionHistory[0];
        if (readySurplus) { assignedCell = readySurplus.cell || pickFreeRandomCell(cellChanges); } else
        
        if (lastItem && Math.random() < 0.55) {
            assignedCell = getActualCell(lastItem.cell, cellChanges);
            // Если эта ячейка «перенаправлена» через cellChanges — выбираем свободную
            if (cellChanges[assignedCell] && cellChanges[assignedCell] !== assignedCell) assignedCell = pickFreeRandomCell(cellChanges);
        } else {
            assignedCell = pickFreeRandomCell(cellChanges);
        }
        
        let productObj;
        if (readySurplus) {
            productObj = readySurplus;
        } else if (options.product) {
            productObj = options.product;
        } else {
            const shouldBeAdult = Math.random() < 0.09;
            const dataSrc = shouldBeAdult ? adultProductData : productData;
            productObj = dataSrc[Math.floor(Math.random() * dataSrc.length)];
        }

        // Коробка сессии (или случайная); closed = true, если это последний товар сессии
        const boxAssign = assignBoxCodeForNewItem(userData);
        const sessionBoxCode = boxAssign.code;

        // Озвучка: ячейка → (хрупкий товар) → (сессия закрыта: last_product.mp3)
        speakNumber(assignedCell).then(() => {
            const fragile = productObj.isFragile ? playSound('delicate_good.mp3') : Promise.resolve();
            return fragile.then(() => { if (boxAssign.closed) playSound('last_product.mp3'); });
        });

        const barcode = Math.floor(1000000000 + Math.random() * 9000000000).toString();
        const markAsDefective = !!options.isDefective || defectModeActive;
        
        const newItem = { 
            code, 
            barcode, 
            cell: assignedCell, 
            name: productObj.name, 
            image: productObj.image, 
            price: productObj.price, 
            date: new Date().toISOString(), 
            isDefective: markAsDefective, 
            isAdult: productObj.isAdult || false,
            isNoBarcode: options.isNoBarcode || false,
            isFragile: productObj.isFragile || false,
            size: productObj.size || '',
            color: productObj.color || '',
            packageContents: productObj.packageContents || '',
            isReturnable: productObj.isReturnable !== undefined ? productObj.isReturnable : true,
            isRefusal: productObj.isRefusal === true, // отказной товар
            productLink: productObj.productLink || '',
            boxCode: sessionBoxCode // из какой коробки принят: коробка сессии или случайная
        };

        receptionItems.push(newItem);
        receptionHistory.unshift(newItem); 
        
        if(receptionHistory.length > 50) receptionHistory.pop();
        
        userData.receptionItems = receptionItems;
        userData.receptionHistoryLog = receptionHistory;

        // Если ячейка совпала с ячейкой активного заказа (клиент сейчас на ПВЗ) — товар сам переходит в этот заказ
        const matchedOrderItem = addItemToActiveOrderIfCellMatches(userData, newItem);

        saveUserData(userData);

        // Брак «сработал» — выходим из режима
        if (defectModeActive) setDefectMode(false);
        
        renderReceptionHistory();
        showMobileResult(newItem, assignedCell, false);

        // Модалка «Клиент находится на ПВЗ» (товар уже в заказе, закрыть можно как угодно)
        if (matchedOrderItem) openClientPvzModal(matchedOrderItem);

    }, 150);
}

// ===================== КЛИЕНТ НА ПВЗ: ТОВАР ПОПАЛ В ЯЧЕЙКУ АКТИВНОГО ЗАКАЗА =====================
// Никаких шансов: если ячейка принятого товара совпала с ячейкой заказа, который сейчас обслуживается
// (userData.activeOrders), товар сразу добавляется в этот заказ, а на экране появляется модалка
// «Клиент находится на ПВЗ». Закрыть модалку (крестик / клик по пустому месту / Esc) — товар всё равно уже в заказе.
// «Перейти к выдаче» просто открывает index.html.

// Ячейки заказа как числа: «305» → [305], у курьера «305, 410» → [305, 410]
function orderCellNumbers(order) {
    return String(order && order.cell != null ? order.cell : '')
        .split(',')
        .map(c => c.trim())
        .filter(c => /^\d+$/.test(c))
        .map(c => parseInt(c, 10));
}

// Добавляет принятый товар в активный заказ с той же ячейкой. Возвращает товар заказа или null, если совпадения нет.
// Данные не сохраняет — это делает вызывающий код (saveUserData).
function addItemToActiveOrderIfCellMatches(userData, newItem) {
    const orders = Array.isArray(userData.activeOrders) ? userData.activeOrders : [];
    const cellNum = parseInt(newItem && newItem.cell, 10);
    if (!orders.length || isNaN(cellNum)) return null;

    const order = orders.find(o => o && Array.isArray(o.items) && orderCellNumbers(o).includes(cellNum));
    if (!order) return null;
    if (order.items.some(i => String(i.code) === String(newItem.code))) return null;

    // Оплата нового товара: у курьера всегда оплачено, у клиента — как у остальных товаров заказа
    let isPaid = false;
    if (order.type === 'courier') {
        isPaid = true;
    } else if (order.items.length) {
        isPaid = order.items.every(i => !!i.isPaid);
    }

    const isRefusal = newItem.isRefusal === true;
    const orderItem = {
        ...newItem,
        isReturnable: newItem.isReturnable !== undefined ? !!newItem.isReturnable : true,
        isRefusal: isRefusal,
        isNonRefusable: isRefusal,
        isAdult: !!newItem.isAdult,
        isVerified: false,                 // товар ещё нужно проверить в выдаче
        status: 'selected',                // «Выдать»
        isChecked: true,
        isFromReturn: false,
        isDefective: !!newItem.isDefective,
        isPaid: isPaid,
        isNoBarcode: !!newItem.isNoBarcode,
        isLost: false,
        addedAfterStart: true
    };
    order.items.push(orderItem);

    // Конфигурация заказа: сумма, проверка, возраст
    if (!order.paymentDetails || typeof order.paymentDetails !== 'object') {
        order.paymentDetails = { method: 'Расчет...', discount: 0, total: 0 };
    }
    order.paymentDetails.total = (Number(order.paymentDetails.total) || 0) + (Number(newItem.price) || 0);

    // Заказ снова требует проверки: новый товар ещё не проверен (остальные остаются проверенными)
    order.isVerified = false;
    if (orderItem.isAdult) {
        order.ageVerified = false;
        delete order.ageState;
        delete order.ageBannerClosed;
    }
    return orderItem;
}

function buildClientPvzCardHtml(item) {
    const adult = !!item.isAdult;
    const imageContent = adult
        ? '<img src="adult.svg" alt="" style="width:100%;">'
        : (item.image ? `<img src="${escapeHtml(item.image)}" alt="">` : '📦');
    const blur = adult ? ' adult-blur-text' : '';

    const code = String(item.code || '');
    const codeGrey = escapeHtml(code.slice(0, 6));
    const codeBlack = escapeHtml(code.slice(6));
    const name = escapeHtml(item.name || 'Товар');
    const size = escapeHtml(item.size || '—');
    const color = escapeHtml(item.color || '—');
    const pkg = escapeHtml(item.packageContents || '—');
    const barcode = String(item.barcode || '');
    const barcodeHtml = barcode
        ? `<span class="pv-barcode-num">${escapeHtml(barcode)}</span><img src="copy.svg" class="pv-copy-btn" data-copy="${escapeHtml(barcode)}" title="Копировать баркод">`
        : '<span class="pv-barcode-num">—</span>';

    return `
    <div class="pv-item-card unverified">
        <div class="pv-item-image">${imageContent}</div>
        <div class="pv-item-details">
            <div class="pv-code-line">
                <span class="pv-code-digits"><span class="pv-code-grey">${codeGrey}</span><span class="pv-code-black">${codeBlack}</span></span>
                <img src="copy.svg" class="pv-copy-btn" data-copy="${escapeHtml(code)}" title="Копировать ШК">
            </div>
            <div class="pv-name-line${blur}" title="${name}">${name}</div>
            <div class="pv-meta-row${blur}">
                <span>Размер: <b>${size}</b></span>
                <span>Цвет: <b>${color}</b></span>
            </div>
            <div class="pv-package-line${blur}">Комплектация: <b>${pkg}</b></div>
            <div class="pv-barcode-line">Баркод: ${barcodeHtml}</div>
        </div>
    </div>`;
}

function isClientPvzModalOpen() {
    const m = document.getElementById('client-pvz-modal');
    return !!m && m.classList.contains('visible');
}

function openClientPvzModal(item) {
    const modal = document.getElementById('client-pvz-modal');
    const holder = document.getElementById('cap-card');
    if (!modal || !holder) return;
    holder.innerHTML = buildClientPvzCardHtml(item);
    toggleModal('client-pvz-modal', true);
}

function closeClientPvzModal() {
    if (!isClientPvzModalOpen()) return;
    toggleModal('client-pvz-modal', false);
    const input = document.getElementById('product-code');
    if (input && window.innerWidth > 768) setTimeout(() => input.focus(), 50);
}

function setupClientPvzModal() {
    const modal = document.getElementById('client-pvz-modal');
    if (!modal) return;

    document.getElementById('cap-close-x')?.addEventListener('click', closeClientPvzModal);
    document.getElementById('cap-go-issue')?.addEventListener('click', () => { window.location.href = 'index.html'; });

    // Клик по пустому месту (затемнённому фону) закрывает модалку
    modal.addEventListener('click', (e) => { if (e.target === modal) closeClientPvzModal(); });

    // Копирование ШК / баркода из карточки
    modal.addEventListener('click', (e) => {
        const btn = e.target.closest('.pv-copy-btn');
        if (!btn) return;
        const text = btn.getAttribute('data-copy') || '';
        if (!text) return;
        const done = () => { btn.classList.add('copied'); setTimeout(() => btn.classList.remove('copied'), 700); };
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(done).catch(() => {});
        } else {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.focus(); ta.select();
            try { document.execCommand('copy'); done(); } catch (err) { /* не критично */ }
            document.body.removeChild(ta);
        }
    });

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeClientPvzModal(); });
}

// ===================== БЫСТРАЯ СМЕНА ЯЧЕЙКИ =====================
const qcState = { code: null, oldCell: null, virtual: false, step: 1 };
let qcLastInput = { value: null, time: 0 };
let qcHideTimer = null;

function qcEl(id) { return document.getElementById(id); }

function isQuickCellOpen() {
    const m = qcEl('quick-cell-modal');
    return !!m && m.classList.contains('visible');
}

function showQuickCellModal(show) {
    const modal = qcEl('quick-cell-modal');
    if (!modal) return;
    clearTimeout(qcHideTimer);
    if (show) {
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('visible'), 10);
    } else {
        modal.classList.remove('visible');
        qcHideTimer = setTimeout(() => { modal.style.display = 'none'; }, 300);
    }
}

function qcShowStep(step) {
    qcState.step = step;
    qcEl('qc-step-scan').style.display = step === 1 ? '' : 'none';
    qcEl('qc-step-result').style.display = step === 2 ? '' : 'none';

    const video = qcEl('qc-video');
    if (video) {
        if (step === 1) { video.currentTime = 0; video.play().catch(() => {}); }
        else video.pause();
    }
    const inp = qcEl(step === 1 ? 'qc-input-1' : 'qc-input-2');
    if (inp) { inp.value = ''; setTimeout(() => inp.focus(), 60); }
}

function startQuickCellProcess(code, oldCell, virtual) {
    qcState.code = code;
    qcState.oldCell = String(oldCell);
    qcState.virtual = !!virtual;
    qcLastInput = { value: null, time: 0 };
    qcShowStep(1);
}

function openQuickCell(code, oldCell, virtual) {
    startQuickCellProcess(code, oldCell, virtual);
    showQuickCellModal(true);
}

function closeQuickCell() {
    if (!isQuickCellOpen()) return;
    showQuickCellModal(false);
    qcEl('qc-video')?.pause();
    qcState.code = null;
    document.getElementById('product-code')?.focus();
}

// Общий вход для модалки (Enter, галочка, сканер). Одинаковый код дважды за секунду не обрабатываем.
function qcHandleInput(rawValue) {
    const value = String(rawValue || '').trim();
    if (!value || !qcState.code) return;
    if (value.length > PRODUCT_CODE_LEN) {
        showAlert(`Максимум ${PRODUCT_CODE_LEN} символов`, true);
        return;
    }
    const now = Date.now();
    if (value === qcLastInput.value && (now - qcLastInput.time) < 1000) return;
    qcLastInput = { value, time: now };

    if (qcState.step === 1) qcHandleCellCode(value);
    else qcHandleNextProduct(value);
}

// Шаг 1: пришёл QR ячейки num_000000
function qcHandleCellCode(value) {
    const m = CELL_QR_RE.exec(value);
    if (!m) {
        showAlert('Отсканируйте QR-код ячейки (формат num_000000)', true);
        return;
    }
    const cellNum = parseInt(m[1], 10);   // num_010540 → 10540
    if (cellNum < 1) {
        showAlert('Некорректный номер ячейки', true);
        return;
    }
    const oldCell = qcState.oldCell;
    if (sameCell(oldCell, cellNum)) {
        showAlert(`Товар уже находится в ячейке ${cellNum}`, true);
        return;
    }

    const newCell = String(cellNum).padStart(3, '0');
    const userData = getUserData();
    const cellChanges = userData.cellChanges || {};

    // Переносить можно строго в ПУСТУЮ ячейку: если там уже есть товары — ошибка
    const occupied = (userData.receptionItems || []).some(i => sameCell(getActualCell(i.cell, cellChanges), cellNum));
    if (occupied) {
        playSound('cell_occupied.mp3');
        showAlert(`Ячейка ${cellNum} занята. Отсканируйте пустую ячейку`, true, true);
        return;
    }

    // Сколько товаров в старой ячейке (у товара, которого нет в базе, — минимум он сам)
    const inOldCell = (userData.receptionItems || []).filter(i => sameCell(getActualCell(i.cell, cellChanges), oldCell));
    const total = Math.max(1, inOldCell.length);

    // Запоминаем на товарах «старая → новая» для карточки (до изменения cellChanges)
    [userData.receptionItems, userData.receptionHistoryLog].forEach(list => {
        (list || []).forEach(i => {
            if (sameCell(getActualCell(i.cell, cellChanges), oldCell)) {
                i.cellMove = { from: parseInt(oldCell, 10), to: cellNum };
            }
        });
    });

    // Переносим товары: старая ячейка освобождается, они переезжают в новую
    const keys = new Set();
    inOldCell.forEach(i => keys.add(i.cell));
    (userData.receptionHistoryLog || []).forEach(i => {
        if (sameCell(getActualCell(i.cell, cellChanges), oldCell)) keys.add(i.cell);
    });
    if (keys.size) {
        keys.forEach(k => { cellChanges[k] = newCell; });
        userData.cellChanges = cellChanges;
    }
    saveUserData(userData);
    renderReceptionHistory();

    qcEl('qc-total').textContent = total;
    qcEl('qc-old').textContent = parseInt(oldCell, 10);
    qcEl('qc-new').textContent = cellNum;
    qcShowStep(2);
}

// Шаг 2: отсканирован следующий товар (10 цифр) → процесс заново
function qcHandleNextProduct(value) {
    if (!PRODUCT_CODE_RE.test(value)) {
        showAlert('Введите 10-значный код товара', true);
        return;
    }
    const userData = getUserData();
    const cellChanges = userData.cellChanges || {};
    const item = (userData.receptionItems || []).find(i => i.code === value);

    if (item) {
        startQuickCellProcess(item.code, getActualCell(item.cell, cellChanges), false);
    } else {
        // Такого товара нет — ячейка строго по коду (один и тот же код всегда даёт одну и ту же ячейку)
        startQuickCellProcess(value, cellFromProductCode(value), true);
    }
}

function setupQuickCellModal() {
    const bind = (inputId, btnId) => {
        const inp = qcEl(inputId);
        const submit = () => { if (!inp) return; const v = inp.value; inp.value = ''; qcHandleInput(v); inp.focus(); };
        inp?.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
        qcEl(btnId)?.addEventListener('click', submit);
    };
    bind('qc-input-1', 'qc-submit-1');
    bind('qc-input-2', 'qc-submit-2');

    qcEl('qc-close-x')?.addEventListener('click', closeQuickCell);
    qcEl('qc-close-btn')?.addEventListener('click', closeQuickCell);
}

function showMobileResult(item, cell, isRepeat) {
    if (window.innerWidth > 768) return;
    
    const scanScreen = document.getElementById('m-scan-screen');
    const resScreen = document.getElementById('m-result-screen');
    
    scanScreen.style.display = 'none';
    resScreen.style.display = 'flex';

    const defBlock = document.querySelector('.m-defective-block');

    // Коробка: ячейки нет, информации о товаре нет
    if (item.isBox) {
        if (defBlock) defBlock.style.display = 'none';
        document.getElementById('m-res-cell').textContent = '-';
        document.getElementById('m-res-sound-btn').onclick = () => { playSound(isRepeat ? 'box_already_accepted.mp3' : 'box_accepted.mp3'); };
        const boxImg = document.getElementById('m-res-img');
        boxImg.src = 'boxp.svg';
        boxImg.style.filter = 'none';
        const bc = String(item.code);
        document.getElementById('m-res-code').innerHTML = `${escapeHtml(bc.slice(0, 4))} <b>${escapeHtml(bc.slice(4))}</b>`; // TRBX серым, 10 цифр чёрным
        document.getElementById('m-res-brand').textContent = '';
        document.getElementById('m-res-name').textContent = 'Коробка';
        ['m-res-barcode', 'm-res-box', 'm-res-size', 'm-res-color', 'm-res-package', 'm-res-returnable', 'm-res-link'].forEach(id => {
            const el = document.getElementById(id); if (el) el.innerHTML = '';
        });
        document.getElementById('m-res-price').textContent = '';
        return;
    }
    if (defBlock) defBlock.style.display = '';

    document.getElementById('m-res-cell').textContent = parseInt(cell, 10);
    
    const sndBtn = document.getElementById('m-res-sound-btn');
    sndBtn.onclick = () => { 
        speakNumber(cell).then(() => { 
            if (item.isFragile) {
                return playSound('delicate_good.mp3').then(() => {
                    playSound('good_already_accepted.mp3');
                });
            }
            playSound('good_already_accepted.mp3'); 
        }); 
    };

    const imgEl = document.getElementById('m-res-img');
    
    if (item.isAdult) {
        imgEl.src = 'adult.svg';
        imgEl.style.filter = 'blur(5px)';
    } else {
        imgEl.src = item.image || 'https://placehold.co/1200x800/png?text=No+Image';
        imgEl.style.filter = 'none';
    }

    const codeStr = item.code.toString();
    const codeFormatted = codeStr.length >= 4 ? `${codeStr.slice(0, -4)} <b>${codeStr.slice(-4)}</b>` : `<b>${codeStr}</b>`;
    document.getElementById('m-res-code').innerHTML = codeFormatted;
    
    const nameEl = document.getElementById('m-res-name');
    const brandEl = document.getElementById('m-res-brand');
    let fullName = item.name || '';
    
    let brandText = 'BRAND';
    let nameText = fullName;
    
    if (fullName.includes('/')) {
        const parts = fullName.split('/');
        brandText = parts[0].trim();
        nameText = parts.slice(1).join('/').trim(); 
    }
    
    brandEl.textContent = brandText;
    nameEl.textContent = nameText;
    
    const barcodeEl = document.getElementById('m-res-barcode');
    if (barcodeEl && item.barcode) {
        barcodeEl.innerHTML = `Баркод: <b style="color: var(--text-primary-color);">${item.barcode}</b>`;
    } else if (barcodeEl) {
        barcodeEl.innerHTML = '';
    }

    // ДОБАВЛЕНО: Вывод новых параметров в мобильном виде
    const boxSrcEl = document.getElementById('m-res-box');
    if (boxSrcEl) boxSrcEl.innerHTML = `<b>Коробка:</b> ${formatBoxCodeHTML(item.boxCode)}`;
    document.getElementById('m-res-size').innerHTML = item.size ? `<b>Размер:</b> ${item.size}` : '';
    document.getElementById('m-res-color').innerHTML = item.color ? `<b>Цвет:</b> ${item.color}` : '';
    document.getElementById('m-res-package').innerHTML = item.packageContents ? `<b>Компл.:</b> ${item.packageContents}` : '';
    document.getElementById('m-res-returnable').innerHTML = item.isReturnable !== undefined ? (item.isReturnable ? `<span style="color: #2e7d32;">Возвратный товар</span>` : `<span style="color: #c62828;">Невозвратный товар</span>`) : '';
    document.getElementById('m-res-link').innerHTML = item.productLink ? `<a href="${item.productLink}" target="_blank" style="color: var(--primary); text-decoration: underline;">Ссылка на товар</a>` : '';

    document.getElementById('m-res-price').textContent = item.price ? `${item.price} BYN` : '';

    const defCheck = document.getElementById('m-res-defective-check');
    defCheck.checked = item.isDefective;
    
    defCheck.onclick = () => {
        markDefective(item.code, defCheck.checked);
        renderReceptionHistory();
    };
}

function renderReceptionHistory() {
    const userData = getUserData();
    const allReceptionItems = userData.receptionItems || [];
    const cellChanges = userData.cellChanges || {};
    
    const gridContainer = document.getElementById('reception-history-grid');
    
    if(!gridContainer) return;
    gridContainer.innerHTML = '';
    gridContainer.style.gridTemplateColumns = `repeat(${rcVisibleCount}, minmax(0, 1fr))`;
    
    // Товары и коробки за сегодня, новые первыми
    const todayHistory = getTodayEntries(userData);
    
    // Сколько карточек показывать — решает syncReceptionLayout() (3, 2 или 1)
    const itemsToDisplay = todayHistory.slice(0, rcVisibleCount);

    if (itemsToDisplay.length === 0) {
        gridContainer.innerHTML = `
        <div class="empty-message" style="grid-column: 1 / -1; margin-top:20px; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%;">
            <img src="scan_qr.png" alt="Scan QR" style="width:120px; height:120px; object-fit:contain; margin-bottom:15px; opacity:0.8;">
            <div style="font-size:1.1rem; color:var(--text-primary-color); font-weight:500;">Начните процесс приемки, отсканировав QR-код на упаковке</div>
        </div>`;
        return;
    }

    itemsToDisplay.forEach((item, index) => {
        const isBox = !!item.isBox;
        const isLatest = index === 0;
        const styleClass = isLatest ? 'latest' : 'historic';

        // Ячейка: у коробки её нет — показываем «-»
        let displayCell = '-';
        let itemsInCell = 0;
        if (!isBox) {
            const actualCell = getActualCell(item.cell, cellChanges);
            displayCell = parseInt(actualCell, 10);
            itemsInCell = allReceptionItems.filter(i => getActualCell(i.cell, cellChanges) === actualCell).length;
        }
        const blurClass = item.isAdult ? 'adult-blur-text' : '';

        // Номер ячейки: после смены — «старая → новая», шрифт подстраивается под ширину
        const mv = (!isBox && item.cellMove && sameCell(item.cellMove.to, displayCell)) ? item.cellMove : null;
        const cellNumberHTML = mv
            ? `<span class="rc-cell-number rc-cell-move" style="--cw:${(String(mv.from).length + String(displayCell).length) * 0.58 + 1.2}">
                   <span class="rc-cell-old">${mv.from}</span>
                   <img class="rc-move-arrow" src="arrow_forward_fill.png" alt="→" draggable="false">
                   <span class="rc-cell-new">${displayCell}</span>
               </span>`
            : `<span class="rc-cell-number" style="--cw:${Math.max(1, String(displayCell).length) * 0.58}">${displayCell}</span>`;

        // Картинка: коробка — boxp.svg, для 18+ — заглушка, настоящую картинку не открываем
        const imageUrl = isBox ? 'boxp.svg' : (item.isAdult ? 'adult.svg' : (item.image || 'https://placehold.co/1200x800/png?text=No+Image'));
        let imageContent;
        if (isBox) {
            imageContent = `<img src="boxp.svg" class="rc-box-svg" alt="Коробка" draggable="false">`;
        } else if (item.isAdult) {
            imageContent = `<img src="adult.svg" class="adult-svg-icon" alt="18+" draggable="false" onmousedown="return false" style="user-select: none; -webkit-user-drag: none;">`;
        } else {
            imageContent = `<img src="${escapeHtml(imageUrl)}" alt="Товар">`;
        }

        // Значок «хрупкий товар» поверх картинки, в левом верхнем углу
        const fragileHTML = (!isBox && item.isFragile) ? `
            <div class="rc-fragile-badge">
                <img src="delicate.svg" alt="Хрупкое" draggable="false">
                <div class="rc-fragile-tip">Товар может повредиться</div>
            </div>` : '';

        // Брак: красная лента строго в области картинки + плашка «БРАК» (видна, если картинка скрыта)
        const defectHTML = (!isBox && item.isDefective) ? `
            <div class="rc-defect-ribbon"><span>${'БРАК '.repeat(40)}</span></div>
            <div class="rc-defect-badge">БРАК</div>` : '';

        // Код: начало серое, последние 4 символа чёрные
        // Коробка: «TRBX» серым, 10 цифр чёрным. Товар: последние 4 цифры чёрные.
        const codeStr = String(item.code);
        const splitAt = isBox ? 4 : Math.max(codeStr.length - 4, 0);
        const codeFormatted = (codeStr.length > splitAt && splitAt > 0)
            ? `${escapeHtml(codeStr.slice(0, splitAt))} <b>${escapeHtml(codeStr.slice(splitAt))}</b>`
            : `<b>${escapeHtml(codeStr)}</b>`;

        const nameText = escapeHtml(isBox ? 'Коробка' : (item.name || ''));
        const colorHTML = item.color ? `<span class="rc-param">Цвет: <b>${escapeHtml(item.color)}</b></span>` : '';
        const sizeHTML = item.size ? `<span class="rc-param">Размер: <b>${escapeHtml(item.size)}</b></span>` : '';
        const barcodeHTML = item.barcode ? `Баркод: <b>${escapeHtml(item.barcode)}</b>` : '';
        const packHTML = item.packageContents ? `Комплектация: ${escapeHtml(item.packageContents)}` : '';

        // Иконка edit.svg — на всех карточках, кроме коробки
        const editHTML = isBox ? '' : `<button type="button" class="rc-edit-btn" title="Сменить ячейку"><img src="edit.svg" alt="Изменить" draggable="false"></button>`;

        // Блок «Информация по товарам клиента». У коробки его нет — это место занимает большая картинка.
        const infoBlockHTML = isBox ? '' : `
            <div class="rc-gray-block rc-info-block">
                 <span class="rc-info-title">Информация по товарам клиента:</span>
                 <div class="rc-info-value"><b>На ячейке:</b> <span class="highlight-digit">${itemsInCell}</span></div>
            </div>`;

        // Нижняя часть: у коробки только код и «Коробка»
        const bottomHTML = isBox ? `
            <div class="rc-bottom-info">
                <div class="rc-code">${codeFormatted}</div>
                <div class="rc-name">${nameText}</div>
                <div class="rc-params"></div>
                <div class="rc-barcode"></div>
                <div class="rc-boxsrc"></div>
                <div class="rc-pack"></div>
            </div>` : `
            <div class="rc-bottom-info">
                <div class="rc-code">${codeFormatted}</div>
                <div class="rc-name ${blurClass}" ${item.isAdult ? '' : `title="${nameText}"`}>${nameText}</div>
                <div class="rc-params ${blurClass}">${colorHTML}${sizeHTML}</div>
                <div class="rc-barcode">${barcodeHTML}</div>
                <div class="rc-boxsrc">Коробка: ${formatBoxCodeHTML(item.boxCode)}</div>
                <div class="rc-pack ${blurClass}">${packHTML}</div>
            </div>`;

        const card = document.createElement('div');
        card.className = `reception-card-new ${styleClass}${item.isAdult ? ' rc-adult' : ''}${isBox ? ' rc-box' : ''}`;
        card.innerHTML = `
            ${editHTML}
            <div class="rc-gray-block rc-cell-block">
                <span class="rc-cell-label">Ячейка</span>
                ${cellNumberHTML}
            </div>
            ${infoBlockHTML}
            <div class="rc-center-image-container">
                <div class="rc-img-frame is-loading">
                    ${imageContent}
                    <div class="rc-img-spinner"><div class="spinner"></div></div>
                    <button type="button" class="rc-show-img-btn"><i class="fas fa-image"></i> Показать картинку</button>
                    <div class="rc-adult-text">Товар 18+</div>
                </div>
                ${defectHTML}
                ${fragileHTML}
            </div>
            ${bottomHTML}
        `;

        card.querySelector('.rc-show-img-btn').addEventListener('click', () => {
            window.open(imageUrl, '_blank', 'noopener');
        });
        bindCardImage(card, imageUrl);
        
        gridContainer.appendChild(card);
    });

    updateCardImages();
}

function startNoBarcodeFlow() {
    modalState.type = 'no_barcode';
    const title = document.getElementById('reason-modal-title');
    const btnContainer = document.getElementById('reason-buttons-container');
    const radioContainer = document.getElementById('reason-radio-container');
    const confirmBtn = document.getElementById('reason-confirm-btn');

    title.textContent = "Приёмка без ШК";
    btnContainer.innerHTML = '';
    btnContainer.style.display = 'flex';
    
    radioContainer.style.display = 'none';
    confirmBtn.style.display = 'none';

    const reasons = { 'missing': 'ШК отсутствует', 'damaged': 'ШК поврежден' };
    
    for (const [key, value] of Object.entries(reasons)) {
        const btn = document.createElement('button');
        btn.className = 'secondary-btn';
        btn.textContent = value;
        btn.onclick = () => { 
            modalState.subType = key;
            toggleModal('reason-modal', false); 
            processNoBarcodeStep1(); 
        };
        btnContainer.appendChild(btn);
    }
    toggleModal('reason-modal', true);
}

function processNoBarcodeStep1() {
    const { subType } = modalState;
    const modalTitle = document.getElementById('input-modal-title');
    const modalPrompt = document.getElementById('input-modal-prompt');
    const inputField = document.getElementById('modal-input-field');
    const submitBtn = document.getElementById('modal-submit-btn');
    const cancelBtn = document.getElementById('modal-cancel-btn');
    const linkAction = document.getElementById('modal-link-action');
    const productDisplay = document.getElementById('modal-product-display');
    
    productDisplay.style.display = 'none';
    inputField.style.display = 'block';
    cancelBtn.style.display = 'none';
    submitBtn.textContent = 'Продолжить';
    inputField.value = '';
    
    if (subType === 'missing') {
        modalTitle.textContent = 'ШК Отсутствует';
        modalPrompt.textContent = 'Отсканируйте баркод или введите ШК баркода';
        linkAction.style.display = 'block';
        
        linkAction.onclick = () => {
            toggleModal('input-modal', false);
            moveToReturns({ isUnknown: true });
        };
    } else {
        modalTitle.textContent = 'ШК Поврежден';
        modalPrompt.textContent = 'Введите цифры под ШК';
        linkAction.style.display = 'none';
    }

    submitBtn.onclick = () => {
        const val = inputField.value.trim();
        
        if (val.length < 4 || val.length > PRODUCT_CODE_LEN) { 
            showAlert('Некорректный стикер или данные!', true); 
            return;
        }
        
        modalState.tempCode = val;
        processConfirmationStep();
    };

    toggleModal('input-modal', true);
    inputField.focus();
}

function processConfirmationStep() {
    const modalTitle = document.getElementById('input-modal-title');
    const modalPrompt = document.getElementById('input-modal-prompt');
    const inputField = document.getElementById('modal-input-field');
    const submitBtn = document.getElementById('modal-submit-btn');
    const cancelBtn = document.getElementById('modal-cancel-btn');
    const linkAction = document.getElementById('modal-link-action');
    const productDisplay = document.getElementById('modal-product-display');
    
    let dataSrc = productData;
    
    if (Math.random() < 0.04) dataSrc = adultProductData;
    
    const randomProduct = dataSrc[Math.floor(Math.random() * dataSrc.length)];
    modalState.tempProduct = randomProduct;

    modalTitle.textContent = 'Подтвердите товар';
    modalPrompt.textContent = 'Возможно, это этот товар?';
    inputField.style.display = 'none';
    linkAction.style.display = 'none';
    
    productDisplay.style.display = 'flex';
    
    // ДОБАВЛЕНО: Вывод дополнительной информации в окне подтверждения "без ШК"
    productDisplay.innerHTML = `
        <div style="display: flex; align-items: center; gap: 15px; width: 100%; text-align: left; background: var(--gray-lightest); padding: 10px; border-radius: 8px;">
            <div style="width: 120px; height: 80px; flex-shrink:0;">
                <img src="${randomProduct.image}" style="width:100%; height:100%; object-fit:contain;" alt="Img">
            </div>
            <div>
                <div style="font-weight: bold; color: var(--primary);">${modalState.tempCode}</div>
                <div style="font-size: 0.9rem; color: var(--text-secondary-color);">${randomProduct.name}</div>
                <div style="font-size: 0.8rem; margin-top: 4px; line-height: 1.3;">
                    ${randomProduct.size ? `Размер: ${randomProduct.size}<br>` : ''}
                    ${randomProduct.color ? `Цвет: ${randomProduct.color}<br>` : ''}
                    ${randomProduct.isReturnable !== undefined ? (randomProduct.isReturnable ? '<span style="color: #2e7d32;">Возвратный</span>' : '<span style="color: #c62828;">Невозвратный</span>') : ''}
                </div>
            </div>
        </div>
    `;
    
    submitBtn.textContent = 'Да';
    cancelBtn.style.display = 'inline-block';
    cancelBtn.textContent = 'Нет';
    
    submitBtn.onclick = () => {
        toggleModal('input-modal', false);
        
        const isDef = (modalState.type === 'defective');
        const isNoBar = (modalState.type === 'no_barcode');
        
        processReception({
            code: modalState.tempCode,
            product: modalState.tempProduct,
            isDefective: isDef,
            isNoBarcode: isNoBar
        });
    };

    cancelBtn.onclick = () => {
        toggleModal('input-modal', false);
        moveToReturns({ isUnknown: true });
    };
}

function moveToReturns(details = {}) {
    const userData = getUserData();
    const returnsItems = userData.returnsItems || [];
    
    let newItem;
    
    if (details.isUnknown) {
        newItem = {
            code: '?',
            name: 'Товар-излишек',
            image: 'box_delivery.svg',
            cell: '0',
            date: new Date().toISOString(),
            isDefective: (modalState.type === 'defective'), 
            confirmed: false
        };
    } else {
        newItem = {
            code: details.code || '?',
            name: details.name || 'Товар-излишек',
            image: details.image || 'box_delivery.svg',
            cell: '0',
            date: new Date().toISOString(),
            isDefective: (modalState.type === 'defective'),
            confirmed: false
        };
    }

    returnsItems.push(newItem);
    userData.returnsItems = returnsItems;
    saveUserData(userData);
    
    alert("Товар системно перемещен в раздел Возвраты. Поместите его в возвратную коробку как обычный товар.");
}