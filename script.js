let allActiveOrders = [];
let currentOrder = null;
let isLostItemsVerificationMode = false;
let isFindingOrder = false;

let courierSpeechTimeouts = [];
let isCourierSpeaking = false;

const successSound = document.getElementById('success-sound');
const scannerSound = document.getElementById('scanner-sound');
const errorSound = document.getElementById('error-sound');

function playCustomSound(filename) {
    const audio = new Audio(filename);
    audio.play().catch(e => console.log('Audio play error:', e));
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

document.addEventListener('DOMContentLoaded', () => {
    initIndexPage();
});

function initIndexPage() {
    const splashScreen = document.getElementById('splash-screen');
    const serverLoadScreen = document.getElementById('server-loading-screen');
    const isInternalNav = sessionStorage.getItem('internalNavigation') === 'true';

    if (window.innerWidth <= 768) {
        initMobileIssueUI();
    }

    if (isInternalNav) {
        if(splashScreen) {
            splashScreen.style.display = 'none';
            splashScreen.classList.add('hidden');
        }
        if(serverLoadScreen) serverLoadScreen.style.display = 'flex';
        sessionStorage.removeItem('internalNavigation');
        setTimeout(() => {
            if(serverLoadScreen) serverLoadScreen.style.display = 'none';
            loadActiveOrders();
            if (window.innerWidth <= 768) renderMobileActiveOrders();
            else showMainScreen();
        }, 800); 
    } else {
        if(serverLoadScreen) serverLoadScreen.style.display = 'flex';
        setTimeout(() => {
            if(splashScreen) {
                splashScreen.classList.add('hidden');
                setTimeout(() => splashScreen.style.display = 'none', 500);
            }
            setTimeout(() => {
                if(serverLoadScreen) serverLoadScreen.style.display = 'none';
                loadActiveOrders();
                if (window.innerWidth <= 768) renderMobileActiveOrders();
                else showMainScreen();
            }, 2000); 
        }, 3000); 
    }

    setupNavigationWithLoading();
    attachMainEventListeners(); 
}
let mobileStream = null;

function initMobileIssueUI() {
    // Навигация (меню "Выдать" активно)
    document.getElementById('m-issue-home').style.display = 'flex';
    
    // Клик по трем точкам (ручной поиск)
    document.getElementById('m-manual-search-btn').onclick = () => {
        document.getElementById('m-issue-home').style.display = 'none';
        document.getElementById('m-issue-manual-input').style.display = 'flex';
        document.getElementById('m-manual-step-phone').style.display = 'block';
        document.getElementById('m-manual-step-code').style.display = 'none';
        document.getElementById('m-phone-input-field').value = '';
        document.getElementById('m-phone-input-field').focus();
    };

    // Назад из телефона
    document.getElementById('m-manual-back-home').onclick = () => {
        document.getElementById('m-issue-manual-input').style.display = 'none';
        document.getElementById('m-issue-home').style.display = 'flex';
    };

    // Далее (Телефон -> Код)
    document.getElementById('m-phone-next-btn').onclick = () => {
        const phone = document.getElementById('m-phone-input-field').value;
        if (phone.length === 4) {
            document.getElementById('m-manual-step-phone').style.display = 'none';
            document.getElementById('m-manual-step-code').style.display = 'block';
            document.getElementById('m-display-phone-header').textContent = `...${phone}`;
            setupDigitInputs();
        } else {
            alert('Введите 4 цифры');
        }
    };

    // Назад из кода
    document.getElementById('m-manual-back-phone').onclick = () => {
         document.getElementById('m-manual-step-code').style.display = 'none';
         document.getElementById('m-manual-step-phone').style.display = 'block';
    };

    // Поиск (Код)
    document.getElementById('m-code-search-btn').onclick = () => {
         const digits = Array.from(document.querySelectorAll('.m-digit-input')).map(input => input.value).join('');
         const phone = document.getElementById('m-phone-input-field').value;
         
         if (digits.length === 5) {
             const loader = document.getElementById('m-search-loader');
             loader.style.display = 'flex';
             
             // Имитация поиска
             setTimeout(() => {
                 loader.style.display = 'none';
                 // Создаем фейковый заказ или ищем существующий
                 const orderId = `${phone}-${digits}`;
                 processAndFindOrder(orderId); // Используем существующую логику
                 showMobileIssueMainView();
             }, 1000);
         } else {
             alert('Введите полный код (5 цифр)');
         }
    };

    // Сканирование QR (Кнопка на главной)
    document.getElementById('m-scan-qr-btn').onclick = () => {
        startMobileCamera('m-camera-video', 'm-camera-overlay');
    };

    // Закрыть камеру
    document.getElementById('m-cam-close-btn').onclick = () => {
        stopMobileCamera();
        document.getElementById('m-camera-overlay').style.display = 'none';
    };
    
    // Симуляция сканирования в камере
    document.getElementById('m-cam-simulate-btn').onclick = () => {
         simulateMobileScanResult();
    };

    // Кнопка "Проверить товары"
    document.getElementById('m-verify-trigger-btn').onclick = () => {
        if (!currentOrder) return;
        document.getElementById('m-issue-main-view').style.display = 'none';
        document.getElementById('m-issue-verify-screen').style.display = 'block';
        updateMobileVerifyUI();
        startMobileCamera('m-verify-video', null); // Запускаем камеру для проверки
    };

    // Назад из проверки
    document.getElementById('m-verify-back-btn').onclick = () => {
        stopMobileCamera();
        document.getElementById('m-issue-verify-screen').style.display = 'none';
        document.getElementById('m-issue-main-view').style.display = 'flex';
    };

    // Смотреть товары (модалка)
    document.getElementById('m-verify-show-list-btn').onclick = () => {
        renderMobileVerifyListModal();
        toggleModal('m-verify-list-modal', true);
    };

    // Симуляция сканирования при проверке
    document.getElementById('m-verify-sim-scan').onclick = () => {
        // Симулируем ввод 9 цифр
        mobileVerifyItemAction();
    };
    
    // Озвучка повторная
    document.getElementById('m-iv-speaker-btn').onclick = () => {
        if(currentOrder) speakNumber(currentOrder.cell);
    };
}

function setupDigitInputs() {
    const inputs = document.querySelectorAll('.m-digit-input');
    inputs.forEach((input, index) => {
        input.value = '';
        input.oninput = () => {
            if (input.value.length === 1 && index < inputs.length - 1) {
                inputs[index + 1].focus();
            }
        };
        input.onkeydown = (e) => {
            if (e.key === 'Backspace' && input.value === '' && index > 0) {
                inputs[index - 1].focus();
            }
        };
    });
    inputs[0].focus();
}

function renderMobileActiveOrders() {
    const list = document.getElementById('m-active-orders-list');
    const countSpan = document.getElementById('m-active-orders-count');
    if(!list) return;

    list.innerHTML = '';
    countSpan.textContent = allActiveOrders.length;

    allActiveOrders.forEach(order => {
        const card = document.createElement('div');
        card.className = 'm-active-order-card';
        card.onclick = () => {
            currentOrder = order;
            showMobileIssueMainView();
        };

        const totalItems = order.items.length;
        const displayCell = formatCellDisplay(order.cell);

        // Preview images logic
        let imagesHtml = '';
        const previewItems = order.items.slice(0, 2);
        previewItems.forEach(item => {
             // ИСПРАВЛЕНИЕ: Картинка тегом img
            const imgUrl = item.isAdult ? 'adult.svg' : (item.image || 'https://placehold.co/100/png?text=Box');
            imagesHtml += `<div class="m-ord-img-box"><img src="${imgUrl}"></div>`;
        });
        
        if (totalItems > 2) {
            const remain = totalItems - 2;
            imagesHtml += `<div class="m-ord-img-box more-count">+${remain}</div>`;
        } else if (totalItems < 2 && totalItems > 0) {
            // Если всего 1 товар, добиваем пустым (опционально) или оставляем как есть
        }

        card.innerHTML = `
            <div class="m-ord-left">
                <div class="m-ord-cell">${displayCell}</div>
                <div class="m-ord-count">${totalItems} шт.</div>
            </div>
            <div class="m-ord-right">
                ${imagesHtml}
            </div>
        `;
        list.appendChild(card);
    });
}

function showMobileIssueMainView() {
    if (!currentOrder) return;
    
    // Скрываем другие экраны
    document.getElementById('m-issue-home').style.display = 'none';
    document.getElementById('m-issue-manual-input').style.display = 'none';
    document.getElementById('m-camera-overlay').style.display = 'none';
    
    const view = document.getElementById('m-issue-main-view');
    view.style.display = 'flex';

    document.getElementById('m-iv-cell').innerHTML = formatCellDisplay(currentOrder.cell);
    document.getElementById('m-iv-count').textContent = currentOrder.items.length;
    document.getElementById('m-iv-phone').textContent = currentOrder.name || 'Клиент';
    
    // Озвучка при открытии
    speakNumber(currentOrder.cell);
}

// Работа с камерой
async function startMobileCamera(videoElementId, overlayId) {
    if (overlayId) document.getElementById(overlayId).style.display = 'flex';
    
    const video = document.getElementById(videoElementId);
    if (!video) return;

    try {
        mobileStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = mobileStream;
    } catch (err) {
        console.warn("Camera access failed (likely not HTTPS or blocked):", err);
        // Fallback already handled by simulate buttons
    }
}

function stopMobileCamera() {
    if (mobileStream) {
        mobileStream.getTracks().forEach(track => track.stop());
        mobileStream = null;
    }
}

function simulateMobileScanResult() {
    // Симуляция сканирования из Главного меню -> Создает заказ
    stopMobileCamera();
    const loader = document.createElement('div');
    loader.className = 'spinner'; 
    // В реальном коде лучше наложить оверлей
    document.getElementById('m-camera-overlay').innerHTML = '<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%;"><div class="spinner"></div><p style="color:white; margin-top:20px;">Поиск...</p></div>';
    
    setTimeout(() => {
        document.getElementById('m-camera-overlay').style.display = 'none';
        // Восстанавливаем верстку оверлея
        document.getElementById('m-camera-overlay').innerHTML = `
            <button class="m-cam-close-btn" id="m-cam-close-btn">&times;</button>
            <div class="m-cam-view">
                 <video id="m-camera-video" autoplay playsinline muted></video>
                 <div class="m-cam-frame"></div>
                 <div class="m-cam-text" id="m-cam-status-text">Наведите на QR код</div>
                 <button id="m-cam-simulate-btn" class="secondary-btn" style="position: absolute; bottom: 20px;">Симуляция скана</button>
            </div>`;
        // Перепривязываем события (так как перезаписали HTML)
        initMobileIssueUI();

        // Логика создания
        const randomPhone = Math.floor(1000 + Math.random() * 9000);
        const randomCode = Math.floor(10000 + Math.random() * 90000);
        const orderId = `${randomPhone}-${randomCode}`;
        processAndFindOrder(orderId);
        showMobileIssueMainView();
    }, 3000);
}

// Логика проверки (Verify)
function updateMobileVerifyUI() {
    if (!currentOrder) return;
    const remaining = currentOrder.items.filter(i => !i.isVerified).length;
    document.getElementById('m-verify-cells').innerHTML = formatCellDisplay(currentOrder.cell);
    document.getElementById('m-verify-remain-count').textContent = `${remaining} шт`;
    
    if (remaining === 0) {
        // Все проверено
        stopMobileCamera();
        alert("Все товары проверены!");
        document.getElementById('m-issue-verify-screen').style.display = 'none';
        document.getElementById('m-issue-main-view').style.display = 'flex';
        currentOrder.isVerified = true;
    }
}

function mobileVerifyItemAction() {
    if (!currentOrder) return;
    // Находим первый непроверенный
    const item = currentOrder.items.find(i => !i.isVerified);
    if (item) {
        playCustomSound('successScan.mp3');
        item.isVerified = true;
        updateMobileVerifyUI();
    }
}

function renderMobileVerifyListModal() {
    const container = document.getElementById('m-verify-list-container');
    container.innerHTML = '';
    if(!currentOrder) return;

    const remainingItems = currentOrder.items.filter(i => !i.isVerified);
    
    if (remainingItems.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px;">Все товары найдены</div>';
        return;
    }

    remainingItems.forEach(item => {
        const div = document.createElement('div');
        div.className = 'product-card horizontal-compact';
        // ИСПРАВЛЕНИЕ: Картинка тегом img
        const imageContent = item.isAdult ? `<img src="adult.svg" style="width:100%">` : (item.image ? `<img src="${item.image}" style="width:100%; object-fit:contain;">` : '📦');

        div.innerHTML = `
            <div class="hc-image" style="width:50px; height:50px;">
                <div class="product-image-mid">${imageContent}</div>
            </div>
            <div class="hc-info">
                <div class="product-name-row">${item.name}</div>
                <div class="product-code-row">${item.code}</div>
            </div>
        `;
        container.appendChild(div);
    });
}

function attachMainEventListeners() {
    const identifierInput = document.getElementById('order-identifier-input');
    const clientCodeInput = document.getElementById('client-code');
    const findBtn = document.getElementById('find-order-btn');

    if (identifierInput) identifierInput.addEventListener('input', handleIdentifierInput);
    
    if (clientCodeInput) {
        clientCodeInput.addEventListener('keydown', e => { 
            if (e.key === 'Enter') { 
                e.preventDefault(); 
                e.stopImmediatePropagation(); 
                findOrder(); 
            } 
        });
    }

    if (findBtn) {
        findBtn.replaceWith(findBtn.cloneNode(true));
        document.getElementById('find-order-btn').addEventListener('click', findOrder);
    }

    document.getElementById('pre-verify-btn')?.addEventListener('click', preVerifyItemByInput);
    document.getElementById('pre-verification-code')?.addEventListener('keypress', e => { if (e.key === 'Enter') preVerifyItemByInput(); });
    document.getElementById('pre-verification-code')?.addEventListener('input', function(e) {
        this.value = this.value.replace(/[^0-9]/g, '').slice(0, 9);
    });
    
    document.getElementById('skip-all-verification-btn')?.addEventListener('click', skipAllVerification);
    document.getElementById('issue-btn')?.addEventListener('click', handleIssueClick);
    document.getElementById('remove-from-fit-btn')?.addEventListener('click', markSelectedForReturn);
    document.getElementById('toggle-select-all-checkbox')?.addEventListener('change', toggleSelectAll);
    document.getElementById('add-package-btn')?.addEventListener('click', () => togglePackageModal(true));
    
    const productCardsGrid = document.getElementById('product-cards');
    if (productCardsGrid) {
        productCardsGrid.addEventListener('click', handleProductCardClick);
        productCardsGrid.addEventListener('dblclick', handleProductCardDoubleClick); 
    }
    
    document.getElementById('payment-details-toggle-btn')?.addEventListener('click', togglePaymentDetails);
    document.getElementById('lost-items-trigger')?.addEventListener('click', startLostItemsVerification);
    document.getElementById('courier-lost-ok-btn')?.addEventListener('click', () => {
        toggleModal('courier-lost-alert-modal', false);
        showOrderViewScreen();
    });

    document.getElementById('issue-from-return-btn-main')?.addEventListener('click', showIssueFromReturnScreen);
    document.getElementById('back-to-main-btn')?.addEventListener('click', showMainScreen);
    document.getElementById('issue-return-identifier-input')?.addEventListener('input', handleReturnIdentifierInput);
    document.getElementById('find-return-items-btn')?.addEventListener('click', findReturnCells);
    document.getElementById('issue-return-client-code')?.addEventListener('keypress', e => { if (e.key === 'Enter') findReturnCells(); });
    
    document.getElementById('cancel-restore-btn')?.addEventListener('click', () => toggleModal('restore-items-selection-modal', false));
    document.getElementById('confirm-restore-btn')?.addEventListener('click', proceedToRestoreItems);

    document.getElementById('next-client-btn')?.addEventListener('click', handleNextClientClick);
    document.getElementById('pf-modal-back-btn')?.addEventListener('click', () => toggleModal('payment-fail-modal', false));
    document.getElementById('pf-modal-retry-btn')?.addEventListener('click', () => {
        toggleModal('payment-fail-modal', false);
        processIssue(); 
    });

    document.getElementById('issue-item-search-btn')?.addEventListener('click', removeItemFromFittingBySearch);
    document.getElementById('issue-item-search')?.addEventListener('keypress', e => { if (e.key === 'Enter') removeItemFromFittingBySearch(); });

    document.getElementById('courier-continue-btn')?.addEventListener('click', handleCourierContinue);
    document.getElementById('courier-back-btn')?.addEventListener('click', handleCourierBack);
    document.getElementById('courier-audio-toggle-btn')?.addEventListener('click', toggleCourierAudio);

    document.querySelector('#packages-modal .close-modal-btn')?.addEventListener('click', () => togglePackageModal(false));
    document.getElementById('close-package-modal-btn')?.addEventListener('click', () => togglePackageModal(false));
    document.querySelector('#product-details-modal .close-modal-btn')?.addEventListener('click', () => toggleModal('product-details-modal', false));

    document.getElementById('overlay')?.addEventListener('click', () => {
        const helpMenu = document.getElementById('help-menu');
        if (helpMenu && helpMenu.classList.contains('visible')) toggleModal('help-menu', false);
    });

    setupSuccessScreenRatingStars();
    document.getElementById('ss-skip-rating-btn')?.addEventListener('click', handleRatingSubmit);
    document.getElementById('ss-submit-rating-btn')?.addEventListener('click', handleRatingSubmit);

    document.addEventListener('scan', handleScanEvent);
}

function setupNavigationWithLoading() {
    const navButtons = [
        { id: 'nav-issue-btn', url: null }, 
        { id: 'nav-reception-btn', url: 'p.html' },
        { id: 'nav-returns-btn', url: 'returns.html' }
    ];
    navButtons.forEach(btnInfo => {
        const btn = document.getElementById(btnInfo.id);
        if(!btn) return;
        btn.onclick = (e) => {
            if (btn.classList.contains('active')) return; 
            sessionStorage.setItem('internalNavigation', 'true');
            const serverLoad = document.getElementById('server-loading-screen');
            if(serverLoad) serverLoad.style.display = 'flex';
            if (btnInfo.url) {
                setTimeout(() => { window.location.href = btnInfo.url; }, 200); 
            }
        };
    });
}

function playScannerSound() { if (scannerSound) { scannerSound.currentTime = 0; scannerSound.play().catch(e => {}); } }
function playSuccessSound() { if (successSound) { successSound.currentTime = 0; successSound.play().catch(e => {}); } }
function playErrorSound() { if (errorSound) { errorSound.currentTime = 0; errorSound.play().catch(e => {}); } }

function loadActiveOrders() {
    const userData = getUserData() || {};
    allActiveOrders = userData.activeOrders || [];
}
function saveActiveOrders() {
    let userData = getUserData() || {};
    userData.activeOrders = allActiveOrders;
    saveUserData(userData);
}

function formatCellDisplay(cell) {
    if (typeof cell !== 'string' && typeof cell !== 'number') return 'N/A';
    const cellStr = String(cell);
    if (cellStr.includes(',')) return cellStr.split(',').map(c => parseInt(c.trim(), 10)).join('<br>');
    return parseInt(cellStr, 10);
}

function handleScanEvent(e) {
    const code = e.detail.code;
    const preVerificationScreen = document.getElementById('pre-verification-screen');
    const orderViewContainer = document.getElementById('order-view-container');

    if (preVerificationScreen && preVerificationScreen.style.display !== 'none') {
        document.getElementById('pre-verification-code').value = code;
        preVerifyItemByInput();
    } else if (orderViewContainer && orderViewContainer.style.display === 'grid') {
        document.getElementById('issue-item-search').value = code;
        removeItemFromFittingBySearch();
    } else {
         const identifierInput = document.getElementById('order-identifier-input');
         const clientCodeGroup = document.getElementById('client-code-group');
         
         if (clientCodeGroup.style.display === 'none') {
             identifierInput.value = code.slice(0, 4);
             handleIdentifierInput({ target: identifierInput });
             if (code.length >= 9) {
                document.getElementById('client-code').value = code.slice(4, 9);
                findOrder();
             }
         } else {
             document.getElementById('client-code').value = code.slice(0, 5);
             findOrder();
         }
    }
}

function handleIdentifierInput(e) {
    const value = e.target.value;
    const clientCodeGroup = document.getElementById('client-code-group');
    clientCodeGroup.style.display = value.length === 4 ? 'block' : 'none';
    if (value.length === 4) document.getElementById('client-code').focus();
}

function handleReturnIdentifierInput(e) {
    const value = e.target.value;
    const clientCodeGroup = document.getElementById('issue-return-client-code-group');
    clientCodeGroup.style.display = value.length === 4 ? 'block' : 'none';
    if (value.length === 4) document.getElementById('issue-return-client-code').focus();
}

function handleProductCardClick(e) {
    if (e.target.closest('.defective-btn')) {
        e.stopPropagation();
        const code = e.target.closest('.defective-btn').dataset.code;
        toggleDefectiveStatus(code);
        return;
    }
    if (e.target.closest('.checkbox-wrapper-purple')) {
        return; 
    }
}

function handleProductCardDoubleClick(e) {
    if (e.target.closest('.defective-btn') || e.target.closest('.checkbox-wrapper-purple')) {
        return;
    }
    const card = e.target.closest('.product-card');
    if (card) {
        const code = card.dataset.code;
        if (code && currentOrder) {
            const item = currentOrder.items.find(i => i.code === code);
            if (item) openProductDetailModal(item);
        }
    }
}

function toggleDefectiveStatus(code) {
    if (!currentOrder) return;
    const item = currentOrder.items.find(i => i.code === code);
    if (item) {
        item.isDefective = !item.isDefective;
        saveActiveOrders();
        renderProductCards();
    }
}

function openProductDetailModal(item) {
    const modal = document.getElementById('product-details-modal');
    const container = document.getElementById('pd-modal-content');
    
    const paidClass = item.isPaid ? 'success-bg' : 'error-bg';
    const paidText = item.isPaid ? 'Оплачено' : 'Не оплачено';
    const paymentBadge = `<span class="pd-badge ${paidClass}">${paidText}</span>`;
    
    const imageContent = item.isAdult ? `<img src="adult.svg" style="width:100%">` : (item.image ? `<img src="${item.image}" style="width:100%; object-fit:contain;">` : '📦');

    let receptionDateStr = item.date ? new Date(item.date).toLocaleString('ru-RU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute:'2-digit' }) : "Неизвестно";
    const cellToDisplay = item.cell ? item.cell : currentOrder.cell;
    const returnStatusIcon = item.isReturnable ? 'return.svg' : 'no_return.svg';
    const returnStatusText = item.isReturnable ? 'Возвратный товар' : 'Невозвратный';
    const returnStatusClass = item.isReturnable ? 'success-text' : 'error-text';

    container.innerHTML = `
        <div class="pd-layout">
            <div class="pd-image-col"><div class="pd-image-wrapper">${imageContent}</div></div>
            <div class="pd-info-col">
                <div class="pd-header-row"><div class="pd-return-status ${returnStatusClass}"><img src="${returnStatusIcon}">${returnStatusText}</div>${paymentBadge}</div>
                <div class="pd-row"><span class="pd-label">Время приемки:</span><span class="pd-value">${receptionDateStr}</span></div>
                <div class="pd-row"><span class="pd-label">Ячейка:</span><span class="pd-value">${formatCellDisplay(cellToDisplay)}</span></div>
                <div class="pd-row"><span class="pd-label">ШК:</span><span class="pd-value" style="font-family: 'Roboto Mono', monospace;">${item.code}</span></div>
                <div class="pd-price-row">${(item.price || 0).toFixed(2)} BYN</div>
                <div class="pd-desc-block"><div class="pd-label">Описание:</div><div class="pd-desc-text">${item.name || 'Товар без описания'}</div></div>
                <a href="https://www.wildberries.by" target="_blank" class="pd-link-btn">Перейти к товару</a>
            </div>
        </div>`;
    toggleModal('product-details-modal', true);
}

function togglePaymentDetails() {
    const content = document.getElementById('payment-details-content');
    const textSpan = document.getElementById('payment-details-text');
    if (!content || !textSpan) return;
    const isHidden = content.style.display === 'none' || content.style.display === '';
    
    if (isHidden) { 
        content.style.display = 'flex'; 
        textSpan.textContent = "Скрыть";
        updatePaymentDetails(); 
    } else { 
        content.style.display = 'none'; 
        textSpan.textContent = "Подробнее";
    }
}

function handleNextClientClick() {
    if(currentOrder) finishOrderSession(currentOrder.identifier);
    document.getElementById('success-screen').style.display = 'none';
    showMainScreen();
}

function findOrder() {
    if (isFindingOrder) return;
    
    const identifier = document.getElementById('order-identifier-input').value.trim();
    const clientCode = document.getElementById('client-code').value.trim();
    
    if (!/^\d{4}$/.test(identifier) || !/^\d{5}$/.test(clientCode)) {
        showAlert('Введите 4 цифры телефона и 5 цифр кода клиента', true);
        return;
    }
    
    isFindingOrder = true; 
    playScannerSound();
    
    const orderId = `${identifier}-${clientCode}`;
    const existingOrder = allActiveOrders.find(o => o.identifier === orderId);
    
    if(existingOrder) { 
        switchToOrder(orderId);
        setTimeout(() => { isFindingOrder = false; }, 1000);
        return; 
    }
    
    processAndFindOrder(orderId);
    setTimeout(() => { isFindingOrder = false; }, 1000);
}

function processAndFindOrder(orderId) {
    const userData = getUserData() || {}; 
    const codesInActiveOrders = new Set(allActiveOrders.flatMap(o => o.items.map(i => i.code)));
    const codesInReturns = new Set((userData.returnsItems || []).map(i => i.code));

    const availableItems = (userData.receptionItems || []).filter(item =>
        !codesInActiveOrders.has(item.code) && !codesInReturns.has(item.code)
    );

    if (availableItems.length < 1) {
        showAlert('Нет доступных товаров для создания заказа (пустая приемка).', true); 
        return;
    }

    let orderItems, cell, name, type;
    const isCourier = Math.random() < 0.25;
    
    const identifierInput = document.getElementById('order-identifier-input');
    const identifier = identifierInput ? identifierInput.value.trim() : orderId.split('-')[0];

    if (isCourier) {
        type = 'courier';
        name = `Курьер ID: ${Math.floor(10000000 + Math.random() * 90000000).toString()}`;
        const availableCells = [...new Set(availableItems.map(i => String(i.cell)))];
        if (availableCells.length === 0) { showAlert('Нет доступных ячеек.', true); return; }
        const maxPossibleCells = Math.min(availableCells.length, 5); 
        const numCells = Math.floor(Math.random() * maxPossibleCells) + 1; 
        const selectedCells = availableCells.sort(() => 0.5 - Math.random()).slice(0, numCells);
        orderItems = availableItems.filter(item => selectedCells.includes(String(item.cell)));
        cell = selectedCells.join(', ');
        if(orderItems.length === 0) { showAlert('Ошибка формирования заказа.', true); return; }
    } else {
        type = 'client';
        const clientCode = document.getElementById('client-code') ? document.getElementById('client-code').value.trim() : '00000';
        name = `+375(••) ••• ${identifier.slice(0, 2)} ${identifier.slice(2, 4)}`;
        const randomItem = availableItems[Math.floor(Math.random() * availableItems.length)];
        cell = String(randomItem.cell);
        orderItems = availableItems.filter(item => String(item.cell) === cell);
    }

    setupCurrentOrder(cell, orderItems, orderId, name, type);
    allActiveOrders.push(currentOrder);
    saveActiveOrders();
    
    if (window.innerWidth <= 768) {
        renderMobileActiveOrders();
    } else {
        renderActiveOrders();
        switchToOrder(orderId);
    }
}

function setupCurrentOrder(cell, items, identifier, name, type) {
    let finalItems = items.map(i => {
        const nameLower = (i.name || '').toLowerCase();
        let isReturnable = true;
        if (nameLower.includes('телефон') || nameLower.includes('машина') || nameLower.includes('техника')) isReturnable = false;
        if (i.isAdult) isReturnable = false;
        
        let isPaid = false;
        if (type === 'courier') {
            isPaid = true; 
        } else {
             isPaid = Math.random() < 0.5;
        }

        return {
            ...i, isReturnable: isReturnable, isVerified: false, status: 'selected',
            isChecked: true, isFromReturn: i.isFromReturn || false, isDefective: i.isDefective || false,
            isPaid: isPaid, isNoBarcode: i.isNoBarcode || false, isLost: false
        };
    });

    const rawTotal = items.reduce((sum, item) => sum + (item.price || 0), 0);
    let method = "Расчет...";

    currentOrder = {
        cell, identifier, name, type, isVerified: false, items: finalItems,
        packages: { 'майка': 0, 'средний': 0, 'большой': 0 },
        paymentDetails: { method: method, discount: 0, total: rawTotal }
    };
}

async function showPreVerificationScreen() {
    if (!currentOrder) return;
    if (currentOrder.isVerified) { showOrderViewScreen(); return; }

    const loader = document.getElementById('global-loader-overlay');
    loader.style.display = 'flex';
    isLostItemsVerificationMode = false;

    document.getElementById('initial-screen-wrapper').style.display = 'none';
    document.getElementById('order-view-container').style.display = 'none';
    document.getElementById('issue-from-return-screen').style.display = 'none';
    document.getElementById('success-screen').style.display = 'none';

    renderPreVerificationContent();
    const pvScreen = document.getElementById('pre-verification-screen');
    pvScreen.style.display = 'flex';
    pvScreen.style.flexDirection = 'column';

    await delay(300); 
    loader.style.display = 'none';
    document.getElementById('pre-verification-code').focus();

    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }

    try {
        let cellToSpeak = String(currentOrder.cell);
        const parts = cellToSpeak.split(',');

        for (let i = 0; i < parts.length; i++) {
            const rawPart = parts[i].trim();
            await speakNumber(rawPart);
            if (i < parts.length - 1) {
                 await delay(400);
            }
        }
        await playSoundPromise('goods.mp3');

        const count = currentOrder.items.length;
        await speakNumber(count);

        const hasUnpaid = currentOrder.items.some(i => !i.isPaid);
        if (hasUnpaid) {
             await delay(300);
             await playSoundPromise('payment_on_delivery.mp3');
        }

    } catch (err) {
        console.error("Audio sequence error:", err);
    }
}

function skipAllVerification() {
    if (!currentOrder) return;
    if (isLostItemsVerificationMode) {
        currentOrder.items.forEach(item => {
            if (item.isLost) {
                item.isLost = false;
                item.wasLost = true;
                item.isVerified = true;
            }
        });
        isLostItemsVerificationMode = false;
        showAlert("Все утерянные товары найдены!", false);
        saveActiveOrders();
        showOrderViewScreen();
        return;
    }
    
    currentOrder.items.forEach(item => {
        if (!item.isVerified) item.isVerified = true;
    });
    checkAllVerified();
}

function startLostItemsVerification() {
    if (!currentOrder) return;
    isLostItemsVerificationMode = true;
    document.getElementById('order-view-container').style.display = 'none';
    const pvScreen = document.getElementById('pre-verification-screen');
    pvScreen.style.display = 'flex';
    pvScreen.style.flexDirection = 'column';
    renderPreVerificationContent(); 
}

function renderPreVerificationContent(justScannedCode = null) {
    if (!currentOrder) return;
    let itemsToProcess = currentOrder.items;

    if (isLostItemsVerificationMode) {
        const currentlyLost = itemsToProcess.filter(i => i.isLost).length;
        const found = itemsToProcess.filter(i => i.wasLost).length; 
        const totalLostInitially = currentlyLost + found; 
        
        document.querySelector('.pv-grey-header-block h3').textContent = `Просканируйте утерянные (${totalLostInitially - currentlyLost} из ${totalLostInitially}):`;
        document.getElementById('pv-verified-count').textContent = totalLostInitially - currentlyLost;
        document.getElementById('pv-total-count').textContent = totalLostInitially;
    } else {
        const totalCount = itemsToProcess.length;
        const verifiedCountTotal = itemsToProcess.filter(i => i.isVerified).length;
        document.getElementById('pv-verified-count').textContent = verifiedCountTotal;
        document.getElementById('pv-total-count').textContent = totalCount;
        document.querySelector('.pv-grey-header-block h3').textContent = `Отсканируйте товары из ячейки (${verifiedCountTotal} из ${totalCount}):`;
    }
    
    document.getElementById('pv-cell-display').innerHTML = formatCellDisplay(currentOrder.cell);
    const isCourier = currentOrder.type === 'courier';
    const courierStatsBlock = document.getElementById('pv-courier-stats');
    
    if (isCourier) {
        courierStatsBlock.style.display = 'flex';
        document.getElementById('pv-courier-damaged-val').textContent = currentOrder.items.filter(i => i.isNoBarcode && i.isVerified).length;
        document.getElementById('pv-courier-notfound-val').textContent = currentOrder.items.filter(i => i.isLost).length;
    } else { courierStatsBlock.style.display = 'none'; }
    
    let verifiedItems, unverifiedItems;
    if (isLostItemsVerificationMode) {
        unverifiedItems = itemsToProcess.filter(i => i.isLost); 
        verifiedItems = itemsToProcess.filter(i => !i.isLost && i.wasLost); 
    } else {
        verifiedItems = itemsToProcess.filter(i => i.isVerified); 
        unverifiedItems = itemsToProcess.filter(i => !i.isVerified);
    }
    
    const verifiedContainer = document.getElementById('pv-verified-items-list');
    verifiedContainer.innerHTML = ''; verifiedContainer.style.display = 'flex';
    if (justScannedCode) verifiedContainer.innerHTML += `<div class="pv-scan-success-message"><i class="fas fa-check-circle"></i> Товар отсканирован!</div>`;

    verifiedItems.slice().reverse().forEach(item => {
        const imageContent = item.isAdult ? `<img src="adult.svg" style="width:100%;">` : (item.image ? `<img src="${item.image}" style="width:100%; object-fit:contain;">` : '📦');
        verifiedContainer.innerHTML += `<div class="pv-item-card verified"><div class="pv-item-image">${imageContent}</div><div class="pv-item-details"><div class="product-code">${item.code}</div><div class="product-name-pv">${item.name || 'Товар'}</div></div></div>`;
    });

    const unverifiedContainer = document.getElementById('pv-unverified-items-list');
    unverifiedContainer.innerHTML = '';
    unverifiedItems.forEach(item => {
        const imageContent = item.isAdult ? `<img src="adult.svg" style="width:100%;">` : (item.image ? `<img src="${item.image}" style="width:100%; object-fit:contain;">` : '📦');
        const noBarcodeBadge = item.isNoBarcode ? '<div class="no-barcode-badge-pv">Без ШК</div>' : '';
        let buttonsHtml = '';
        if (isLostItemsVerificationMode) buttonsHtml += `<button class="skip-one-btn" data-action="skip-lost" data-code="${item.code}">Не сканировать</button>`;
        else {
            if (isCourier && item.isNoBarcode) buttonsHtml += `<button class="skip-one-btn" data-action="skip" data-code="${item.code}">Не сканировать</button>`;
            if (isCourier) buttonsHtml += `<button class="skip-one-btn" data-action="notfound" data-code="${item.code}">Не найден</button>`;
            if (!isCourier) buttonsHtml += `<button class="skip-one-btn" data-action="skip" data-code="${item.code}">Не сканировать</button>`;
        }
        unverifiedContainer.innerHTML += `<div class="pv-item-card unverified"><div class="pv-item-image">${noBarcodeBadge}${imageContent}</div><div class="pv-item-details"><div class="product-code">${item.code}</div><div class="product-name-pv">${item.name || 'Товар'}</div></div><div class="pv-card-actions">${buttonsHtml}</div></div>`;
    });

    unverifiedContainer.querySelectorAll('.skip-one-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const code = e.target.dataset.code; const action = e.target.dataset.action;
            const item = currentOrder.items.find(i => i.code === code);
            if (!item) return;
            if (action === 'skip') item.isVerified = true;
            else if (action === 'notfound') { item.isVerified = true; item.isLost = true; }
            else if (action === 'skip-lost') { item.isLost = false; item.wasLost = true; }
            updatePVState(code);
        });
    });
}

function updatePVState(lastCode = null) { saveActiveOrders(); renderPreVerificationContent(lastCode); checkAllVerified(); }

function preVerifyItemByInput() {
    if (!currentOrder) return;
    const input = document.getElementById('pre-verification-code');
    const code = input.value.trim();
    if (!code) return; 

    let itemToVerify = isLostItemsVerificationMode ? currentOrder.items.find(item => item.isLost) : currentOrder.items.find(item => !item.isVerified);
    if (isLostItemsVerificationMode && itemToVerify) { itemToVerify.isLost = false; itemToVerify.wasLost = true; }
    else if (itemToVerify) itemToVerify.isVerified = true;
    
    if (itemToVerify) { playCustomSound('successScan.mp3'); input.value = ''; input.focus(); updatePVState(code); }
    else { playCustomSound('failScan.mp3'); showAlert('Все товары проверены или код не найден', true); }
}

function checkAllVerified() {
    if (!currentOrder) return;
    if (isLostItemsVerificationMode) {
        if (currentOrder.items.filter(i => i.isLost).length === 0) {
            isLostItemsVerificationMode = false; showAlert("Все утерянные товары найдены!", false); showOrderViewScreen();
        } return;
    }
    if (currentOrder.items.every(item => item.isVerified)) {
        currentOrder.isVerified = true; saveActiveOrders();
        const lostCount = currentOrder.items.filter(i => i.isLost).length;
        if (currentOrder.type === 'courier' && lostCount > 0) {
            document.getElementById('courier-lost-msg').textContent = `В заказе курьера утеряны товары: ${lostCount} шт.`;
            toggleModal('courier-lost-alert-modal', true);
        } else {
            playCustomSound('please.mp3'); setTimeout(() => showOrderViewScreen(), 500);
        }
    }
}

function showOrderViewScreen() {
    document.getElementById('pre-verification-screen').style.display = 'none';
    document.getElementById('initial-screen-wrapper').style.display = 'none';
    document.getElementById('issue-from-return-screen').style.display = 'none';
    document.getElementById('success-screen').style.display = 'none';
    document.getElementById('order-view-container').style.display = 'grid'; 
    renderProductCards(); updateUIData();
    document.getElementById('payment-details-content').style.display = 'none';
    
    const textSpan = document.getElementById('payment-details-text');
    if(textSpan) textSpan.textContent = "Подробнее";

    const lostCount = currentOrder.items.filter(i => i.isLost).length;
    const lostTrigger = document.getElementById('lost-items-trigger');
    if (lostCount > 0) { lostTrigger.style.display = 'block'; lostTrigger.textContent = `Просканировать утерянные (${lostCount})`; } 
    else { lostTrigger.style.display = 'none'; }

    const isCourier = currentOrder.type === 'courier';
    const packagesBlock = document.getElementById('packages-controls-container');
    const paymentBlock = document.getElementById('payment-details-collapsible');
    if (isCourier) { if(packagesBlock) packagesBlock.style.display = 'none'; if(paymentBlock) paymentBlock.style.display = 'none'; } 
    else { if(packagesBlock) packagesBlock.style.display = 'flex'; if(paymentBlock) paymentBlock.style.display = 'block'; }
}

function renderProductCards() {
    if (!currentOrder) return;
    const container = document.getElementById('product-cards');
    container.innerHTML = '';
    const isCourier = currentOrder.type === 'courier';
    
    currentOrder.items.forEach(item => {
        if (item.isLost) return;
        const isForIssue = item.status === 'selected';
        let cardClass = 'product-card vertical'; 
        if (!isForIssue) cardClass += ' returned-item'; 
        
        const imageContent = item.isAdult ? `<img src="adult.svg" style="width:100%; height:100%;">` : (item.image ? `<img src="${item.image}" style="width:100%; height:100%; object-fit:contain;">` : '<span style="font-size:3rem">📦</span>');
        
        const checkboxState = item.isChecked ? 'checked' : '';
        const checkboxDisabled = !isForIssue ? 'disabled' : '';
        
        let paymentBadge = '';
        if (!isCourier) paymentBadge = item.isPaid ? `<span class="payment-badge paid">Оплачено</span>` : `<span class="payment-badge unpaid">Не оплачено</span>`;

        let codeStr = String(item.code);
        let codeDisplay = codeStr;
        if (codeStr.length >= 4) {
            codeDisplay = codeStr.slice(0, -4) + '<b>' + codeStr.slice(-4) + '</b>';
        }

        const defectiveOverlay = item.isDefective ? `<div class="defective-ribbon"><span>БРАК</span></div>` : '';
        const defectiveBtnText = item.isDefective ? 'Отменить брак' : 'Брак';
        const defectiveBtn = (!isForIssue) ? `<button class="defective-btn" data-code="${item.code}">${defectiveBtnText}</button>` : '';
        const returnIconSrc = item.isReturnable ? 'return.svg' : 'no_return.svg';

        const card = document.createElement('div'); 
        card.className = cardClass;
        card.dataset.code = item.code; 
        
        card.innerHTML = `
            <div class="vertical-img-container">
                 ${imageContent}
                 ${defectiveOverlay}
                 <div class="v-overlay-top-left">
                     <div class="checkbox-wrapper-purple">
                        <input type="checkbox" id="check-${item.code}" ${checkboxState} ${checkboxDisabled}>
                     </div>
                     <img src="${returnIconSrc}" class="card-return-icon">
                 </div>
                 <div class="v-overlay-top-right">
                    ${paymentBadge}
                 </div>
            </div>
            <div class="vertical-info">
                 <div class="v-code-row">${codeDisplay}</div>
                 <div class="v-name-row">${item.name || 'Товар'}</div>
                 <div class="v-price-row">
                    <img src="wallet.svg" class="wallet-icon-small">
                    ${(item.price || 0).toFixed(2)} BYN
                 </div>
                 ${defectiveBtn}
            </div>
        `;
        container.appendChild(card);
        if (isForIssue) card.querySelector(`#check-${item.code}`).addEventListener('change', (e) => toggleItemSelection(e, item.code));
    });
}

function updateUIData() {
    if (!currentOrder) return;
    const itemsToShow = currentOrder.items.filter(i => !i.isLost); 
    const checkedItems = itemsToShow.filter(i => i.isChecked && i.status === 'selected');
    const totalPackages = Object.values(currentOrder.packages || {}).reduce((sum, count) => sum + count, 0);

    document.getElementById('cell-number').innerHTML = formatCellDisplay(currentOrder.cell);
    if (currentOrder.type === 'courier') {
        const courierId = (currentOrder.name.match(/ID: (\d+)/) || [])[1] || '????';
        document.getElementById('display-identifier').textContent = `Курьер ID: ${courierId}`;
        document.getElementById('issue-btn').textContent = "Выдать товары";
    } else {
        document.getElementById('display-identifier').textContent = `Клиент: ${currentOrder.name}`;
        const hasUnpaidSelected = checkedItems.some(i => !i.isPaid);
        document.getElementById('issue-btn').textContent = hasUnpaidSelected ? "Оплатить и выдать" : "Выдать товары";
    }

    document.getElementById('selected-count').textContent = checkedItems.length;
    document.getElementById('total-count-selected').textContent = itemsToShow.filter(i => i.status === 'selected').length;
    document.getElementById('total-packages-display').textContent = totalPackages;
    
    document.getElementById('remove-from-fit-btn').disabled = checkedItems.length === 0;
    document.getElementById('toggle-select-all-checkbox').checked = itemsToShow.length > 0 && itemsToShow.filter(i => i.status === 'selected').every(i => i.isChecked);

    const checkedUnpaidItems = itemsToShow.filter(i => !i.isPaid && i.isChecked && i.status === 'selected');
    const totalSum = checkedUnpaidItems.reduce((sum, item) => sum + (item.price || 0), 0);
    let finalSum = totalSum - (currentOrder.paymentDetails.discount || 0);
    if (finalSum < 0 || checkedUnpaidItems.length === 0) finalSum = 0; 
    document.getElementById('total-price-value').textContent = `${finalSum.toFixed(2)} BYN`;
    
    updatePaymentDetails();
}

function updatePaymentDetails() {
    if (!currentOrder || currentOrder.type === 'courier') return;
    const itemsToShow = currentOrder.items.filter(i => !i.isLost);
    const selectedItems = itemsToShow.filter(i => i.status === 'selected');
    const checkedUnpaidItems = selectedItems.filter(i => !i.isPaid && i.isChecked);
    const totalSum = checkedUnpaidItems.reduce((sum, item) => sum + (item.price || 0), 0);
    const discount = checkedUnpaidItems.length > 0 ? (currentOrder.paymentDetails.discount || 0) : 0;
    let final = totalSum - discount;
    if(final < 0) final = 0;
    const allPaid = selectedItems.every(i => i.isPaid);
    const nonePaid = selectedItems.every(i => !i.isPaid);
    let methodText = "";
    if (allPaid) {
        methodText = "Сразу";
    } else if (nonePaid) {
        methodText = "Оплата при получении";
    } else {
        methodText = "Сразу, При получении";
    }
    document.getElementById('payment-details-method').textContent = methodText;
    document.getElementById('payment-details-total').textContent = `${totalSum.toFixed(2)} BYN`;
    document.getElementById('payment-details-discount').textContent = `${discount.toFixed(2)} BYN`;
    document.getElementById('payment-details-final').textContent = `${final.toFixed(2)} BYN`;
}

function toggleItemSelection(event, code) {
    if (!currentOrder) return;
    const item = currentOrder.items.find(i => i.code === code);
    if (item) item.isChecked = event.target.checked;
    saveActiveOrders(); updateUIData();
}
function toggleSelectAll(event) {
    if (!currentOrder) return;
    const isChecked = event.target.checked;
    currentOrder.items.forEach(i => { if (i.status === 'selected' && !i.isLost) i.isChecked = isChecked; });
    saveActiveOrders(); renderProductCards(); updateUIData();
}
function markSelectedForReturn() {
    if (!currentOrder) return;
    const checkedItems = currentOrder.items.filter(i => i.isChecked && i.status === 'selected' && !i.isLost);
    if (checkedItems.find(i => !i.isReturnable)) { showAlert(`Товар невозвратный.`, true); playErrorSound(); return; }
    let itemsReturned = 0;
    currentOrder.items.forEach(item => {
        if (item.isChecked && item.status === 'selected' && !item.isLost) { item.status = 'returned'; item.isChecked = false; itemsReturned++; }
    });
    if(itemsReturned > 0) {
        showAlert(`${itemsReturned} снято с примерки.`, false);
        playCustomSound('otkaz.mp3'); 
    }
    saveActiveOrders(); renderProductCards(); updateUIData();
}

function removeItemFromFittingBySearch() {
    if (!currentOrder) return;
    const input = document.getElementById('issue-item-search');
    const code = input.value.trim();
    if (code.length !== 9) return;
    const items = currentOrder.items;
    let itemToReturnIndex = items.findIndex(i => i.status === 'selected' && !i.isLost && i.isReturnable);
    if (itemToReturnIndex !== -1) {
        const itemToReturn = items[itemToReturnIndex];
        playCustomSound('otkaz.mp3'); 
        itemToReturn.status = 'returned'; 
        itemToReturn.isChecked = false;
        items.splice(itemToReturnIndex, 1); 
        items.unshift(itemToReturn);
        showAlert(`Товар снят с примерки.`, false);
        saveActiveOrders(); 
        renderProductCards(); 
        updateUIData();
    } else { 
        showAlert('В заказе нет товаров для возврата.', true);
        playErrorSound(); 
    }
    input.value = ''; 
    input.focus();
}

function togglePackageModal(show) {
    const modal = document.getElementById('packages-modal');
    if (!modal) return;
    if (show) { renderPackageModal(); toggleModal('packages-modal', true); } 
    else toggleModal('packages-modal', false);
}

function renderPackageModal() {
    const container = document.getElementById('package-modal-body');
    if (!currentOrder || !currentOrder.packages) return;
    
    const packages = [
        { key: 'майка', name: 'Пакет-майка', price: '0.00', img: '1.png' },
        { key: 'средний', name: 'Пакет средний', price: '0.00', img: '23.png' },
        { key: 'большой', name: 'Пакет большой', price: '0.00', img: '23.png', isLarge: true }
    ];

    container.innerHTML = `<div class="package-list-container"></div>`;
    const listDiv = container.querySelector('.package-list-container');

    packages.forEach(pkg => {
        const count = currentOrder.packages[pkg.key] || 0;
        const row = document.createElement('div');
        row.className = 'package-list-item';
        const imgClass = pkg.isLarge ? 'pkg-img-wrapper large' : 'pkg-img-wrapper';
        
        row.innerHTML = `
            <div class="${imgClass}">
                <img src="${pkg.img}" alt="${pkg.name}">
            </div>
            <div class="pkg-name">
                <div style="font-weight:500;">${pkg.name}</div>
                <div style="font-size:0.9rem; color:grey;">${pkg.price} BYN</div>
            </div>
            <div class="pkg-controls">
                <button class="pkg-btn minus" data-key="${pkg.key}">-</button>
                <div class="pkg-count" style="font-weight:bold; width:20px; text-align:center;">${count}</div>
                <button class="pkg-btn plus" data-key="${pkg.key}">+</button>
            </div>
        `;
        listDiv.appendChild(row);
    });

    listDiv.querySelectorAll('.pkg-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const key = e.target.dataset.key;
            const isPlus = e.target.classList.contains('plus');
            let currentVal = currentOrder.packages[key] || 0;
            if (isPlus) currentVal++; else if (currentVal > 0) currentVal--;
            currentOrder.packages[key] = currentVal;
            saveActiveOrders(); updateUIData(); renderPackageModal();
        });
    });
}

function handleIssueClick() {
    const btn = document.getElementById('issue-btn');
    if (btn.classList.contains('loading-spinner-inside') || !currentOrder) return;
    
    if (currentOrder.type === 'courier') {
        const courierCode = Math.floor(100000 + Math.random() * 900000).toString();
        document.querySelector('.courier-code-display').textContent = courierCode;
        document.getElementById('courier-modal-title').textContent = 'Сообщите код курьеру';
        
        document.getElementById('courier-modal-body').style.display = 'block';
        document.getElementById('courier-modal-loader').style.display = 'none';
        
        updateCourierAudioButtonUI(false);
        
        toggleModal('courier-code-modal', true);
        playSoundPromise('tell_code_to_courier.mp3');
        return;
    }
    processIssue();
}

function toggleCourierAudio() {
    const codeText = document.querySelector('.courier-code-display').textContent;
    if (isCourierSpeaking) {
        stopCourierAudio();
    } else {
        speakCourierCode(codeText);
    }
}

function updateCourierAudioButtonUI(isSpeaking) {
    const btn = document.getElementById('courier-audio-toggle-btn');
    if (!btn) return;
    
    if (isSpeaking) {
        btn.innerHTML = '<i class="fas fa-stop"></i> Стоп';
        btn.classList.add('red-outline-btn');
    } else {
        btn.innerHTML = '<i class="fas fa-play"></i> Озвучить';
        btn.classList.remove('red-outline-btn');
    }
}

function speakCourierCode(code) {
    if (!('speechSynthesis' in window)) return;
    stopCourierAudio(); 
    isCourierSpeaking = true;
    updateCourierAudioButtonUI(true);

    const digits = code.split('');
    let delay = 0;

    digits.forEach((digit, index) => {
        const id = setTimeout(() => {
            if (!isCourierSpeaking) return; 
            const utterance = new SpeechSynthesisUtterance(digit);
            utterance.lang = 'ru-RU';
            utterance.rate = 1.0; 
            window.speechSynthesis.speak(utterance);
            
            if (index === digits.length - 1) {
                 const resetId = setTimeout(() => {
                     isCourierSpeaking = false;
                     updateCourierAudioButtonUI(false);
                     courierSpeechTimeouts = [];
                 }, 1200); 
                 courierSpeechTimeouts.push(resetId);
            }
        }, delay);
        courierSpeechTimeouts.push(id);
        delay += 1000; 
    });
}

function stopCourierAudio() {
    courierSpeechTimeouts.forEach(id => clearTimeout(id));
    courierSpeechTimeouts = [];
    window.speechSynthesis.cancel();
    isCourierSpeaking = false;
    updateCourierAudioButtonUI(false);
}

function handleCourierBack() {
    stopCourierAudio();
    toggleModal('courier-code-modal', false);
}

function handleCourierContinue() {
    stopCourierAudio();
    document.getElementById('courier-modal-title').textContent = 'Обработка данных';
    document.getElementById('courier-modal-body').style.display = 'none';
    document.getElementById('courier-modal-loader').style.display = 'flex';
    
    setTimeout(() => {
        toggleModal('courier-code-modal', false);
        processIssue(true); 
    }, 3000);
}

function processIssue(isCourier = false) {
    const btn = document.getElementById('issue-btn');
    btn.classList.add('loading-spinner-inside');
    setTimeout(() => {
        btn.classList.remove('loading-spinner-inside');
        finalizeIssue();
    }, 1500); 
}

function finalizeIssue() {
    if (!currentOrder) return;
    let userData = getUserData() || {};
    const issuedItems = currentOrder.items.filter(i => i.status === 'selected' && i.isChecked && !i.isLost);
    const returnedItems = currentOrder.items.filter(i => (i.status === 'returned' || (i.status === 'selected' && !i.isChecked)) && !i.isLost);
    const issuedCodes = new Set(issuedItems.map(i => i.code));

    if (issuedItems.length > 0) {
        userData.receptionItems = (userData.receptionItems || []).filter(item => !issuedCodes.has(item.code));
        
        // СОХРАНЕНИЕ ИСТОРИИ ВЫДАЧИ
        if (!userData.issuedHistory) userData.issuedHistory = [];
        const historyEntry = {
            id: currentOrder.identifier,
            date: new Date().toISOString(),
            cell: currentOrder.cell,
            items: issuedItems
        };
        userData.issuedHistory.unshift(historyEntry);
    }
    
    if (returnedItems.length > 0) {
        if (!userData.returnsItems) userData.returnsItems = [];
        returnedItems.forEach(retItem => {
            if (!userData.returnsItems.some(existing => existing.code === retItem.code)) {
                userData.returnsItems.unshift({ ...retItem, confirmed: false, date: new Date().toISOString() });
            }
        });
    }
    saveUserData(userData);
    showSuccessScreen(issuedItems, returnedItems);
}

function showMainScreen() {
    currentOrder = null;
    isLostItemsVerificationMode = false;
    
    document.getElementById('order-view-container').style.display = 'none';
    document.getElementById('pre-verification-screen').style.display = 'none';
    document.getElementById('issue-from-return-screen').style.display = 'none';
    document.getElementById('success-screen').style.display = 'none';
    document.getElementById('initial-screen-wrapper').style.display = 'block';

    if (window.innerWidth <= 768) {
        initMobileIssueUI();
    }

    const orderInput = document.getElementById('order-identifier-input');
    if (orderInput) {
        orderInput.value = '';
        orderInput.focus();
    }
    
    document.getElementById('client-code').value = '';
    document.getElementById('client-code-group').style.display = 'none';
    renderActiveOrders();
}

function showIssueFromReturnScreen() {
    document.getElementById('initial-screen-wrapper').style.display = 'none';
    document.getElementById('order-view-container').style.display = 'none';
    document.getElementById('pre-verification-screen').style.display = 'none';
    document.getElementById('success-screen').style.display = 'none';
    document.getElementById('issue-from-return-screen').style.display = 'block';
    
    document.getElementById('issue-return-identifier-input').value = '';
    document.getElementById('issue-return-client-code').value = '';
    document.getElementById('issue-return-client-code-group').style.display = 'none';
    document.getElementById('restore-cells-list').innerHTML = '<div class="empty-state-text">Введите данные слева и нажмите "Найти", чтобы увидеть доступные ячейки.</div>';
    document.getElementById('issue-return-identifier-input').focus();
}

function showSuccessScreen(issuedItems, returnedItems) {
    if (!currentOrder) return;
    document.getElementById('order-view-container').style.display = 'none';
    
    if (currentOrder.type === 'courier') {
        document.getElementById('ss-client-name').textContent = currentOrder.name; 
        playCustomSound('order_delivered_rate_courier.mp3');
    } else {
        const lastFourDigits = currentOrder.identifier.split('-')[0];
        const clientName = `+375(••) ••• ${lastFourDigits.slice(0, 2)} ${lastFourDigits.slice(2, 4)}`;
        document.getElementById('ss-client-name').textContent = clientName;
        playCustomSound('Thanks.mp3');
    }
    
    document.getElementById('ss-cell-number').innerHTML = formatCellDisplay(currentOrder.cell);
    document.getElementById('ss-issued-count').textContent = issuedItems.length;
    document.getElementById('ss-returned-count').textContent = returnedItems.length;
    document.getElementById('success-screen-title').textContent = "Выдача товаров завершена";
    
    const ratingBlock = document.getElementById('ss-rating-block');
    const nextClientBtn = document.getElementById('next-client-btn');
    const infoBox = document.getElementById('success-screen-info-box');
    
    if (currentOrder.type === 'courier') {
        ratingBlock.style.display = 'block'; nextClientBtn.style.display = 'none'; infoBox.style.display = 'none'; 
        currentSuccessScreenRating = 0; updateSuccessScreenStars(0); document.getElementById('ss-courier-feedback-text').value = '';
    } else {
        ratingBlock.style.display = 'none'; nextClientBtn.style.display = 'block'; infoBox.style.display = 'flex';
    }
    document.getElementById('success-screen').style.display = 'flex'; 
}

let foundReturnGroups = []; 
let returnIdentifierCached = ''; 

function findReturnCells() {
    const identifier = document.getElementById('issue-return-identifier-input').value.trim();
    const clientCode = document.getElementById('issue-return-client-code').value.trim();
    if (!/^\d{4}$/.test(identifier) || !/^\d{5}$/.test(clientCode)) { showAlert('Введите 4 цифры телефона и 5 цифр кода клиента', true); return; }

    let userData = getUserData() || {};
    let allReturns = userData.returnsItems || [];
    const items = allReturns.filter(i => !i.confirmed);
    
    if (items.length === 0) { document.getElementById('restore-cells-list').innerHTML = '<div class="empty-state-text">Нет товаров для возврата.</div>'; return; }

    returnIdentifierCached = identifier;
    const groups = {}; 
    items.forEach(item => {
        const cellKey = item.cell;
        if (!groups[cellKey]) groups[cellKey] = { cell: cellKey, items: [], type: 'client', id: identifier };
        groups[cellKey].items.push(item);
    });
    foundReturnGroups = Object.values(groups);
    renderRestoreCellsList(foundReturnGroups, identifier);
}

function renderRestoreCellsList(groups, inputId) {
    const list = document.getElementById('restore-cells-list');
    list.innerHTML = '';
    if (groups.length > 1) {
        const allCard = document.createElement('div'); allCard.className = 'restore-cell-card';
        allCard.innerHTML = `<div class="restore-header">Клиент: ...${inputId}</div><div class="restore-cell-info">ВСЕ ЯЧЕЙКИ (${groups.length})</div><div style="font-size: 0.9rem; color: gray;">Всего товаров: ${groups.reduce((sum, g) => sum + g.items.length, 0)}</div>`;
        allCard.onclick = () => openRestoreItemsModal(groups.flatMap(g => g.items));
        list.appendChild(allCard);
    }
    groups.forEach(group => {
        const div = document.createElement('div'); div.className = 'restore-cell-card';
        const isCourier = Math.random() > 0.8; 
        const title = isCourier ? `Курьер: ID ${Math.floor(Math.random()*10000)}` : `Клиент: ...${inputId}`;
        div.innerHTML = `<div class="restore-header">${title}</div><div class="restore-cell-info">Ячейка: ${group.cell}</div><div style="font-size: 0.9rem; color: gray;">Товаров: ${group.items.length}</div>`;
        div.onclick = () => openRestoreItemsModal(group.items);
        list.appendChild(div);
    });
}

function openRestoreItemsModal(items) {
    const list = document.getElementById('restore-items-list');
    list.innerHTML = '';
    items.forEach((item, index) => {
        const div = document.createElement('div'); div.className = 'product-card horizontal-compact'; div.style.border = '1px solid var(--border-color)';
        const imageContent = item.isAdult ? `<img src="adult.svg" style="width:100%">` : (item.image ? `<img src="${item.image}" style="width:100%; object-fit:contain;">` : '📦');

        div.innerHTML = `<div class="hc-left"><div class="checkbox-wrapper-purple"><input type="checkbox" id="restore-check-${index}" class="restore-checkbox" checked></div></div><div class="hc-image"><div class="product-image-mid">${imageContent}</div></div><div class="hc-info"><div class="product-code-row">${item.code}</div><div class="product-name-row">${item.name || 'Товар'}</div></div>`;
        div.querySelector('input').itemData = item;
        list.appendChild(div);
    });
    toggleModal('restore-items-selection-modal', true);
}

function proceedToRestoreItems() {
    const list = document.getElementById('restore-items-list');
    const checkboxes = list.querySelectorAll('.restore-checkbox');
    const itemsToRestore = [];
    checkboxes.forEach(cb => { if(cb.checked) itemsToRestore.push(cb.itemData); });

    if (itemsToRestore.length === 0) { showAlert('Выберите хотя бы один товар.', true); return; }
    toggleModal('restore-items-selection-modal', false);

    let userData = getUserData() || {};
    const codesToRestore = new Set(itemsToRestore.map(i => i.code));
    userData.returnsItems = (userData.returnsItems || []).filter(i => !codesToRestore.has(i.code));
    saveUserData(userData);

    const enteredPhone = document.getElementById('issue-return-identifier-input').value;
    const finalName = `+375 29 1${enteredPhone}`; 
    const uniqueCells = [...new Set(itemsToRestore.map(i => i.cell))].join(', ');

    const newOrder = {
        cell: uniqueCells, identifier: `RESTORE-${Date.now()}`, name: finalName, type: 'client', 
        isVerified: true, isFromReturn: true,
        items: itemsToRestore.map(item => ({ ...item, status: 'selected', isChecked: true, isReturnable: true })),
        packages: { 'майка': 0, 'средний': 0, 'большой': 0 },
        paymentDetails: { method: "Оплата при получении", discount: 0, total: 0 } 
    };

    allActiveOrders.unshift(newOrder); saveActiveOrders(); switchToOrder(newOrder.identifier);
}

function renderActiveOrders() {
    const sidebar = document.getElementById('sidebar-orders');
    sidebar.innerHTML = '';
    const addUserBtn = document.createElement('div');
    addUserBtn.className = `add-user-btn ${!currentOrder ? 'highlighted' : ''}`;
    addUserBtn.innerHTML = '<img src="add-user.svg" alt="Новый клиент">';
    addUserBtn.onclick = () => { currentOrder = null; showMainScreen(); };
    sidebar.appendChild(addUserBtn);

    allActiveOrders.forEach(order => {
        const orderEl = document.createElement('div');
        orderEl.className = `active-order ${currentOrder && order.identifier === currentOrder.identifier ? 'highlighted' : ''}`;
        const fromReturnIcon = order.isFromReturn ? '<i class="fas fa-undo from-return-icon"></i>' : '';
        const countSup = `<sup>${order.items.length}</sup>`;
        let displayCell = order.cell;
        if (order.type === 'courier' && typeof displayCell === 'string' && displayCell.includes(',')) displayCell = displayCell.split(',')[0].trim(); 
        orderEl.innerHTML = `<div class="order-info-wrapper">${fromReturnIcon}<span class="order-cell">${formatCellDisplay(displayCell)}${countSup}</span></div>`;
        orderEl.onclick = () => switchToOrder(order.identifier);
        sidebar.appendChild(orderEl);
    });
    
    const badge = document.getElementById('order-count-badge');
    if (badge) { badge.textContent = allActiveOrders.length; badge.style.display = allActiveOrders.length > 0 ? 'flex' : 'none'; }
}

function finishOrderSession(orderId) { allActiveOrders = allActiveOrders.filter(o => o.identifier !== orderId); saveActiveOrders(); renderActiveOrders(); }
function switchToOrder(orderId) {
    const order = allActiveOrders.find(o => o.identifier === orderId);
    if (order) { currentOrder = order; if(currentOrder.isVerified) showOrderViewScreen(); else showPreVerificationScreen(); renderActiveOrders(); }
}
let currentSuccessScreenRating = 0;
function setupSuccessScreenRatingStars() {
    const starsContainer = document.getElementById('ss-courier-stars-container');
    if (!starsContainer) return;
    const stars = starsContainer.querySelectorAll('.star');
    stars.forEach(star => { star.addEventListener('click', () => { currentSuccessScreenRating = parseInt(star.dataset.value); updateSuccessScreenStars(currentSuccessScreenRating); }); });
}
function updateSuccessScreenStars(rating) {
    const starsContainer = document.getElementById('ss-courier-stars-container');
    if (!starsContainer) return;
    starsContainer.querySelectorAll('.star').forEach(s => { const i = s.querySelector('i'); if (parseInt(s.dataset.value) <= rating) { s.classList.add('selected'); i.classList.remove('far'); i.classList.add('fas'); } else { s.classList.remove('selected'); i.classList.remove('fas'); i.classList.add('far'); } });
}
function handleRatingSubmit() { handleNextClientClick(); }

function toggleModal(modalId, show) {
    const modal = document.getElementById(modalId);
    const overlay = document.getElementById('overlay');
    if (!modal) return;
    if (show) {
        if (modalId === 'help-menu') { modal.classList.add('visible'); overlay?.classList.add('visible'); } 
        else { modal.style.display = 'flex'; setTimeout(() => modal.classList.add('visible'), 10); }
    } else {
        if (modalId === 'help-menu') { modal.classList.remove('visible'); overlay?.classList.remove('visible'); } 
        else { 
            modal.classList.remove('visible'); 
            setTimeout(() => { modal.style.display = 'none'; }, 300); 
            if (modalId === 'search-modal') {
                const searchInput = document.getElementById('search-item-code');
                const searchResult = document.getElementById('search-result-container');
                if (searchInput) searchInput.value = '';
                if (searchResult) searchResult.innerHTML = '';
            }
        }
    }
}