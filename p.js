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
    IMG_MIN_H: 110     // если область картинки ниже — вместо картинки кнопка «Показать картинку»
};
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

// Если область картинки слишком низкая — показываем кнопку «Показать картинку»
function updateCardImages() {
    document.querySelectorAll('#reception-history-grid .reception-card-new').forEach(card => {
        const box = card.querySelector('.rc-center-image-container');
        if (!box) return;
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
    syncReceptionLayout();
    setupReceptionLayout();
    renderReceptionHistory();
    
    const input = document.getElementById('product-code');
    if(input) input.focus();
    
    document.getElementById('reception-btn')?.addEventListener('click', () => processReception());
    document.getElementById('simulate-qr-btn')?.addEventListener('click', simulateQRScan);
    if(input) input.addEventListener('keypress', (e) => { if (e.key === 'Enter') processReception(); });
    
    document.getElementById('accept-no-barcode-btn')?.addEventListener('click', () => startNoBarcodeFlow());
    document.getElementById('delivery-time-btn')?.addEventListener('click', () => setDeliveryPanel(true));
    document.getElementById('close-delivery-panel-btn')?.addEventListener('click', () => setDeliveryPanel(false));
    // Клик по затемнённому фону или Esc — закрывают панель
    document.getElementById('dt-overlay')?.addEventListener('click', () => setDeliveryPanel(false));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setDeliveryPanel(false); });

    // Обработчики нового флоу для брака
    document.getElementById('defect-submit-btn')?.addEventListener('click', submitDefectCode);
    document.getElementById('defect-product-code')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitDefectCode();
    });
    
    document.getElementById('defect-cancel-btn')?.addEventListener('click', () => {
        document.getElementById('desktop-defect-screen').style.display = 'none';
        document.getElementById('main-reception-container').style.display = 'flex';
        document.getElementById('product-code')?.focus();
    });

    document.addEventListener('scan', (e) => {
        const code = e.detail.code;
        const input = document.getElementById('product-code');
        const modalInput = document.getElementById('modal-input-field');
        const modal = document.getElementById('input-modal');

        if (modal && modal.classList.contains('visible') && modalInput) {
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

function submitDefectCode() {
    const input = document.getElementById('defect-product-code');
    const code = input ? input.value.trim() : '';
    
    if (!/^\d{10}$/.test(code)) {
        showAlert('Введите 10-значный код товара', true);
        return;
    }
    document.getElementById('desktop-defect-screen').style.display = 'none';
    document.getElementById('main-reception-container').style.display = 'flex';
    processReception({ code: code, isDefective: true });
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
                    if (/^\d{10}$/.test(decodedText)) {
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
        
        // Очищаем дневные поставки, но receptionHistoryLog НЕ трогаем
        const userData = getUserData();
        userData.deliveries = null; 
        saveUserData(userData);
        
        // Перерисовываем UI. Функция отрисовки сама скроет старые товары.
        if (document.getElementById('reception-history-grid')) {
            renderReceptionHistory();
        }
        
        if(typeof window.generateDeliveriesForToday === 'function') window.generateDeliveriesForToday();
        if(typeof window.renderDeliveries === 'function') window.renderDeliveries();
    }
}

let lastProcessedCode = null;
let lastProcessedTime = 0;

function processReception(options = {}) {
    const input = document.getElementById('product-code');
    const code = options.code || (input ? input.value.trim() : '');

    // === БЛОКИРОВКА ДВОЙНЫХ СРАБАТЫВАНИЙ (DEBOUNCE) ===
    if (!code && !options.isNoBarcode) return;

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

    if (code === 'brak_brak_') {
        document.getElementById('main-reception-container').style.display = 'none';
        
        const defectScreen = document.getElementById('desktop-defect-screen');
        if (defectScreen) {
            defectScreen.style.display = 'flex';
            
            const defectInput = document.getElementById('defect-product-code');
            if (defectInput) {
                defectInput.value = '';
                defectInput.focus();
            }
        }
        return;
    }

    let isValidCode = /^\d{10}$/.test(code);

    if (!options.isNoBarcode && !options.code && !isValidCode) { 
        showAlert(`Введите 10-значный код товара`, true);
        return; 
    }
    
    setTimeout(() => {
        if (Math.random() < 0.03) {
            playDeclineSound();
            showAlert('Излишек! Отсканируйте еще раз или перейдите в раздел Принять снова', true);
            return;
        }

        const userData = getUserData();
        const receptionItems = userData.receptionItems || [];
        const receptionHistory = userData.receptionHistoryLog || [];
        const existingItem = receptionItems.find(item => item.code === code);
        
        if (existingItem) {
            const actualCell = getActualCell(existingItem.cell, userData.cellChanges);
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

        let assignedCell;
        const lastItem = receptionHistory[0];
        
        if (lastItem && Math.random() < 0.55) assignedCell = getActualCell(lastItem.cell, userData.cellChanges);
        else assignedCell = (Math.floor(Math.random() * 900) + 1).toString().padStart(3, '0');
        
        let productObj;
        if (options.product) {
            productObj = options.product;
        } else {
            const shouldBeAdult = Math.random() < 0.09;
            const dataSrc = shouldBeAdult ? adultProductData : productData;
            productObj = dataSrc[Math.floor(Math.random() * dataSrc.length)];
        }

        speakNumber(assignedCell).then(() => {
            if (productObj.isFragile) {
                playSound('delicate_good.mp3');
            }
        });

        const barcode = Math.floor(1000000000 + Math.random() * 9000000000).toString();
        
        // ДОБАВЛЕНО: Записываем в базу товара (объект newItem) новые данные
        const newItem = { 
            code, 
            barcode, 
            cell: assignedCell, 
            name: productObj.name, 
            image: productObj.image, 
            price: productObj.price, 
            date: new Date().toISOString(), 
            isDefective: options.isDefective || false, 
            isAdult: productObj.isAdult || false,
            isNoBarcode: options.isNoBarcode || false,
            isFragile: productObj.isFragile || false,
            // Новые свойства, которые берутся из products.js:
            size: productObj.size || '',
            color: productObj.color || '',
            packageContents: productObj.packageContents || '',
            isReturnable: productObj.isReturnable !== undefined ? productObj.isReturnable : true,
            isRefusal: productObj.isRefusal === true, // отказной товар
            productLink: productObj.productLink || ''
        };

        receptionItems.push(newItem);
        receptionHistory.unshift(newItem); 
        
        if(receptionHistory.length > 50) receptionHistory.pop();
        
        userData.receptionItems = receptionItems;
        userData.receptionHistoryLog = receptionHistory;
        saveUserData(userData);
        
        renderReceptionHistory();
        showMobileResult(newItem, assignedCell, false);

    }, 150);
}

function showMobileResult(item, cell, isRepeat) {
    if (window.innerWidth > 768) return;
    
    const scanScreen = document.getElementById('m-scan-screen');
    const resScreen = document.getElementById('m-result-screen');
    
    scanScreen.style.display = 'none';
    resScreen.style.display = 'flex';

    document.getElementById('m-res-cell').textContent = parseInt(cell, 10);
    
    const sndBtn = document.getElementById('m-res-sound-btn');
    sndBtn.onclick = () => { 
        speakNumber(cell).then(() => { 
            if (item.isFragile) {
                playSound('delicate_good.mp3').then(() => {
                    playSound('good_already_accepted.mp3');
                });
            } else {
                playSound('good_already_accepted.mp3'); 
            }
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
    document.getElementById('m-res-size').innerHTML = item.size ? `<b>Размер:</b> ${item.size}` : '';
    document.getElementById('m-res-color').innerHTML = item.color ? `<b>Цвет:</b> ${item.color}` : '';
    document.getElementById('m-res-package').innerHTML = item.packageContents ? `<b>Компл.:</b> ${item.packageContents}` : '';
    document.getElementById('m-res-returnable').innerHTML = item.isReturnable !== undefined ? (item.isReturnable ? `<span style="color: #2e7d32;">Возвратный товар</span>` : `<span style="color: #c62828;">Невозвратный товар</span>`) : '';
    document.getElementById('m-res-link').innerHTML = item.productLink ? `<a href="${item.productLink}" target="_blank" style="color: var(--primary); text-decoration: underline;">Ссылка на товар</a>` : '';

    document.getElementById('m-res-price').textContent = item.price ? `${item.price} BYN` : '';

    const defCheck = document.getElementById('m-res-defective-check');
    defCheck.checked = item.isDefective;
    
    defCheck.onclick = () => {
        const isDef = defCheck.checked;
        const userData = getUserData();
        
        const targetItem = userData.receptionItems.find(i => i.code === item.code);
        if(targetItem) {
            targetItem.isDefective = isDef;
            saveUserData(userData);
            renderReceptionHistory();
        }
    };
}

function renderReceptionHistory() {
    const userData = getUserData();
    const receptionHistory = userData.receptionHistoryLog || [];
    const allReceptionItems = userData.receptionItems || [];
    const cellChanges = userData.cellChanges || {};
    
    const gridContainer = document.getElementById('reception-history-grid');
    
    if(!gridContainer) return;
    gridContainer.innerHTML = '';
    gridContainer.style.gridTemplateColumns = `repeat(${rcVisibleCount}, minmax(0, 1fr))`;
    
    const todayStr = getMSKDateString();
    
    const todayHistory = receptionHistory.filter(item => {
        if (!item.date) return false;
        return getMSKDateString(item.date) === todayStr;
    });
    
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
        const actualCell = getActualCell(item.cell, cellChanges);
        const displayCell = parseInt(actualCell, 10);
        const isLatest = index === 0;
        const styleClass = isLatest ? 'latest' : 'historic';
        const itemsInCell = allReceptionItems.filter(i => getActualCell(i.cell, cellChanges) === actualCell).length;
        const blurClass = item.isAdult ? 'adult-blur-text' : '';

        // Картинка: для 18+ — заглушка, настоящую картинку не открываем
        const imageUrl = item.isAdult ? 'adult.svg' : (item.image || 'https://placehold.co/1200x800/png?text=No+Image');
        const imageContent = item.isAdult
            ? `<img src="adult.svg" class="adult-svg-icon" alt="18+" draggable="false" onmousedown="return false" style="user-select: none; -webkit-user-drag: none;">`
            : `<img src="${escapeHtml(imageUrl)}" alt="Товар">`;

        // Значок «хрупкий товар» поверх картинки, в левом верхнем углу
        const fragileHTML = item.isFragile ? `
            <div class="rc-fragile-badge">
                <img src="delicate.svg" alt="Хрупкое" draggable="false">
                <div class="rc-fragile-tip">Товар может повредиться</div>
            </div>` : '';

        // Код: первые 6 цифр серые, пробел, последние 4 чёрные
        const codeStr = String(item.code);
        const codeFormatted = codeStr.length > 4
            ? `${escapeHtml(codeStr.slice(0, -4))} <b>${escapeHtml(codeStr.slice(-4))}</b>`
            : `<b>${escapeHtml(codeStr)}</b>`;

        const nameText = escapeHtml(item.name || '');
        const colorHTML = item.color ? `<span class="rc-param">Цвет: <b>${escapeHtml(item.color)}</b></span>` : '';
        const sizeHTML = item.size ? `<span class="rc-param">Размер: <b>${escapeHtml(item.size)}</b></span>` : '';
        const barcodeHTML = item.barcode ? `Баркод: <b>${escapeHtml(item.barcode)}</b>` : '';
        const packHTML = item.packageContents ? `Комплектация: ${escapeHtml(item.packageContents)}` : '';

        const card = document.createElement('div');
        card.className = `reception-card-new ${styleClass}${item.isAdult ? ' rc-adult' : ''}`;
        card.innerHTML = `
            ${item.isDefective ? '<div class="defective-diagonal-stripe"></div>' : ''}
            <div class="rc-gray-block rc-cell-block">
                <span class="rc-cell-label">Ячейка</span>
                <span class="rc-cell-number">${displayCell}</span>
            </div>
            <div class="rc-gray-block rc-info-block">
                 <span class="rc-info-title">Информация по товарам клиента:</span>
                 <div class="rc-info-value"><b>На ячейке:</b> <span class="highlight-digit">${itemsInCell}</span></div>
            </div>
            <div class="rc-center-image-container">
                <div class="rc-img-frame is-loading">
                    ${imageContent}
                    <div class="rc-img-spinner"><div class="spinner"></div></div>
                    <button type="button" class="rc-show-img-btn"><i class="fas fa-image"></i> Показать картинку</button>
                    <div class="rc-adult-text">Товар 18+</div>
                </div>
                ${fragileHTML}
            </div>
            <div class="rc-bottom-info">
                <div class="rc-code">${codeFormatted}</div>
                <div class="rc-name ${blurClass}" ${item.isAdult ? '' : `title="${nameText}"`}>${nameText}</div>
                <div class="rc-params ${blurClass}">${colorHTML}${sizeHTML}</div>
                <div class="rc-barcode">${barcodeHTML}</div>
                <div class="rc-pack ${blurClass}">${packHTML}</div>
            </div>
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
        
        if (val.length < 4) { 
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