let allActiveOrders = [];
let currentOrder = null;
let isLostItemsVerificationMode = false;
let isFindingOrder = false;

let courierSpeechTimeouts = [];
let isCourierSpeaking = false;

// --- ГЛОБАЛЬНЫЕ БЛОКИРОВКИ ОТ ДВОЙНЫХ СРАБАТЫВАНИЙ ---
let lastSoundPlayTime = 0;
const SOUND_THROTTLE = 500; // Задержка между звуками 500мс

let lastVerifyTime = 0;
const VERIFY_THROTTLE = 500; // Задержка между сканированиями 500мс

const successSound = document.getElementById('success-sound');
const scannerSound = document.getElementById('scanner-sound');
const errorSound = document.getElementById('error-sound');

function canPlaySound() {
    const now = Date.now();
    if (now - lastSoundPlayTime < SOUND_THROTTLE) return false;
    lastSoundPlayTime = now;
    return true;
}

function playCustomSound(filename, force = false) {
    if (!force && !canPlaySound()) return;
    const audio = new Audio(filename);
    audio.play().catch(e => console.log('Audio play error:', e));
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function initIndexPage() {
    const splashScreen = document.getElementById('splash-screen');
    const serverLoadScreen = document.getElementById('server-loading-screen');
    const isInternalNav = sessionStorage.getItem('internalNavigation') === 'true';
    const showServerLoad = sessionStorage.getItem('showServerLoading') === 'true';

    if (window.innerWidth <= 768) {
        initMobileIssueUI();
    }

    if(splashScreen) {
        splashScreen.style.display = 'none';
        splashScreen.classList.add('hidden');
    }

    if (isInternalNav || showServerLoad) {
        if(serverLoadScreen) serverLoadScreen.style.display = 'flex';
        sessionStorage.removeItem('internalNavigation');
        sessionStorage.removeItem('showServerLoading');
        setTimeout(() => {
            if(serverLoadScreen) serverLoadScreen.style.display = 'none';
            loadActiveOrders();
            if (window.innerWidth <= 768) renderMobileActiveOrders();
            else showMainScreen();
        }, showServerLoad ? 2000 : 800); 
    } else {
        loadActiveOrders();
        if (window.innerWidth <= 768) renderMobileActiveOrders();
        else showMainScreen();
    }

    setupNavigationWithLoading();
    attachMainEventListeners(); 
}

let mobileStream = null;

function initMobileIssueUI() {
    document.getElementById('m-issue-home').style.display = 'flex';
    
    document.getElementById('m-manual-search-btn').onclick = () => {
        document.getElementById('m-issue-home').style.display = 'none';
        document.getElementById('m-issue-manual-input').style.display = 'flex';
        document.getElementById('m-manual-step-phone').style.display = 'block';
        document.getElementById('m-manual-step-code').style.display = 'none';
        document.getElementById('m-phone-input-field').value = '';
        document.getElementById('m-phone-input-field').focus();
    };

    document.getElementById('m-manual-back-home').onclick = () => {
        document.getElementById('m-issue-manual-input').style.display = 'none';
        document.getElementById('m-issue-home').style.display = 'flex';
    };

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

    document.getElementById('m-manual-back-phone').onclick = () => {
         document.getElementById('m-manual-step-code').style.display = 'none';
         document.getElementById('m-manual-step-phone').style.display = 'block';
    };

    document.getElementById('m-code-search-btn').onclick = () => {
         const digits = Array.from(document.querySelectorAll('.m-digit-input')).map(input => input.value).join('');
         const phone = document.getElementById('m-phone-input-field').value;
         
         if (digits.length === 6) { 
             const loader = document.getElementById('m-search-loader');
             loader.style.display = 'flex';
             
             setTimeout(() => {
                 loader.style.display = 'none';
                 const orderId = `${phone}-${digits}`;
                 processAndFindOrder(orderId);
                 showMobileIssueMainView();
             }, 1000);
         } else {
             alert('Введите полный код (6 цифр)');
         }
    };

    document.getElementById('m-scan-qr-btn').onclick = () => {
        startMobileCamera('m-camera-video', 'm-camera-overlay');
    };

    document.getElementById('m-cam-close-btn').onclick = () => {
        stopMobileCamera();
        document.getElementById('m-camera-overlay').style.display = 'none';
    };
    
    document.getElementById('m-cam-simulate-btn').onclick = () => {
         simulateMobileScanResult();
    };

    document.getElementById('m-verify-trigger-btn').onclick = () => {
        if (!currentOrder) return;
        document.getElementById('m-issue-main-view').style.display = 'none';
        document.getElementById('m-issue-verify-screen').style.display = 'block';
        updateMobileVerifyUI();
        startMobileCamera('m-verify-video', null);
    };

    document.getElementById('m-verify-back-btn').onclick = () => {
        stopMobileCamera();
        document.getElementById('m-issue-verify-screen').style.display = 'none';
        document.getElementById('m-issue-main-view').style.display = 'flex';
    };

    document.getElementById('m-verify-show-list-btn').onclick = () => {
        renderMobileVerifyListModal();
        toggleModal('m-verify-list-modal', true);
    };

    document.getElementById('m-verify-sim-scan').onclick = () => {
        mobileVerifyItemAction();
    };
    
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
            switchToOrder(order.identifier);
        };

        const totalItems = order.items.length;
        const displayCell = formatCellDisplay(order.cell);

        let imagesHtml = '';
        const previewItems = order.items.slice(0, 2);
        previewItems.forEach(item => {
            const imgUrl = item.isAdult ? 'adult.svg' : (item.image || 'https://placehold.co/100/png?text=Box');
            imagesHtml += `<div class="m-ord-img-box"><img src="${imgUrl}"></div>`;
        });
        
        if (totalItems > 2) {
            const remain = totalItems - 2;
            imagesHtml += `<div class="m-ord-img-box more-count">+${remain}</div>`;
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
    
    document.getElementById('m-issue-home').style.display = 'none';
    document.getElementById('m-issue-manual-input').style.display = 'none';
    document.getElementById('m-camera-overlay').style.display = 'none';
    
    const view = document.getElementById('m-issue-main-view');
    view.style.display = 'flex';

    document.getElementById('m-iv-cell').innerHTML = formatCellDisplay(currentOrder.cell);
    document.getElementById('m-iv-count').textContent = currentOrder.items.length;
    document.getElementById('m-iv-phone').textContent = currentOrder.name || 'Клиент';
    
    speakNumber(currentOrder.cell);
}

async function startMobileCamera(videoElementId, overlayId) {
    if (overlayId) document.getElementById(overlayId).style.display = 'flex';
    
    const video = document.getElementById(videoElementId);
    if (!video) return;

    try {
        mobileStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = mobileStream;
    } catch (err) {
        console.warn("Camera access failed:", err);
    }
}

function stopMobileCamera() {
    if (mobileStream) {
        mobileStream.getTracks().forEach(track => track.stop());
        mobileStream = null;
    }
}

function simulateMobileScanResult() {
    stopMobileCamera();
    document.getElementById('m-camera-overlay').innerHTML = '<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%;"><div class="spinner"></div><p style="color:white; margin-top:20px;">Поиск...</p></div>';
    
    setTimeout(() => {
        document.getElementById('m-camera-overlay').style.display = 'none';
        document.getElementById('m-camera-overlay').innerHTML = `
            <button class="m-cam-close-btn" id="m-cam-close-btn">&times;</button>
            <div class="m-cam-view">
                 <video id="m-camera-video" autoplay playsinline muted></video>
                 <div class="m-cam-frame"></div>
                 <div class="m-cam-text" id="m-cam-status-text">Наведите на QR код</div>
                 <button id="m-cam-simulate-btn" class="secondary-btn" style="position: absolute; bottom: 20px;">Симуляция скана</button>
            </div>`;
        initMobileIssueUI();

        const randomPhone = Math.floor(1000 + Math.random() * 9000);
        const randomCode = Math.floor(100000 + Math.random() * 900000); 
        const orderId = `${randomPhone}-${randomCode}`;
        processAndFindOrder(orderId);
    }, 3000);
}

function updateMobileVerifyUI() {
    if (!currentOrder) return;
    const remaining = currentOrder.items.filter(i => !i.isVerified).length;
    document.getElementById('m-verify-cells').innerHTML = formatCellDisplay(currentOrder.cell);
    document.getElementById('m-verify-remain-count').textContent = `${remaining} шт`;
    
    if (remaining === 0) {
        stopMobileCamera();
        alert("Все товары проверены!");
        document.getElementById('m-issue-verify-screen').style.display = 'none';
        document.getElementById('m-issue-main-view').style.display = 'flex';
        currentOrder.isVerified = true;
    }
}

function mobileVerifyItemAction() {
    if (!currentOrder) return;
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
        const imageContent = item.isAdult ? `<img src="adult.svg" style="width:100%">` : (item.image ? `<img src="${item.image}" style="width:100%; object-fit:contain;">` : '📦');
        const nameClass = item.isAdult ? 'product-name-row adult-blur-text' : 'product-name-row';
        const codeClass = 'product-code-row';

        div.innerHTML = `
            <div class="hc-image" style="width:50px; height:50px;">
                <div class="product-image-mid">${imageContent}</div>
            </div>
            <div class="hc-info">
                <div class="${nameClass}">${item.name}</div>
                <div class="${codeClass}">${item.code}</div>
            </div>
        `;
        container.appendChild(div);
    });
}

function cancelCourierVerification() {
    if (currentOrder) {
        finishOrderSession(currentOrder.identifier);
        showMainScreen();
    }
}

function cancelLostItemsVerification() {
    isLostItemsVerificationMode = false;
    showOrderViewScreen();
}

function createPackageOnlyOrder() {
    const modal = document.getElementById('empty-order-modal');
    const orderId = modal && modal.dataset.orderId ? modal.dataset.orderId : `PKG-${Date.now()}`;
    const identifierInput = document.getElementById('order-identifier-input');
    const identifier = identifierInput && identifierInput.value ? identifierInput.value.trim() : orderId.split('-')[0];
    const name = `+375(••) ••• ${identifier.slice(0, 2)} ${identifier.slice(2, 4)}`;

    currentOrder = {
        cell: "-",
        identifier: orderId,
        name: name,
        type: 'client',
        isVerified: true,
        ageVerified: true,
        items: [],
        packages: { 'майка': 0, 'средний': 0, 'большой': 0 },
        paymentDetails: { method: "Оплата при получении", discount: 0, total: 0 }
    };
    allActiveOrders.push(currentOrder);
    saveActiveOrders();
    
    if (window.innerWidth <= 768) {
        renderMobileActiveOrders();
    } else {
        renderActiveOrders();
        switchToOrder(orderId);
    }
}

// === ЛОГИКА ДЛЯ ВЫДАЧИ СЕРТИФИКАТОВ ===
let certStartNumber = 50897;

function openCertModal() {
    toggleModal('certificate-modal', true);
    document.getElementById('cert-step-1').style.display = 'flex';
    document.getElementById('cert-step-2').style.display = 'none';
    document.getElementById('cert-step-3').style.display = 'none';
    document.getElementById('cert-back-btn').style.display = 'inline-flex';
    document.getElementById('cert-client-code').value = '';
}

function closeCertModal() {
    toggleModal('certificate-modal', false);
}

function goToCertStep2() {
    const code = document.getElementById('cert-client-code').value;
    if (code.length !== 6) {
        showAlert('Введите корректный 6-значный код клиента', true);
        return;
    }
    
    document.getElementById('cert-step-1').style.display = 'none';
    document.getElementById('cert-step-2').style.display = 'flex';
    
    renderCertificates();
    updateCertTotal();
}

function renderCertificates() {
    const container = document.getElementById('cert-list-container');
    container.innerHTML = '';
    
    for (let i = 0; i < 8; i++) {
        const certNum = certStartNumber + i;
        const card = document.createElement('div');
        card.className = 'cert-card-item';
        card.innerHTML = `
            <div class="cert-badge-num">№${certNum}</div>
            <div class="checkbox-wrapper-purple">
                <input type="checkbox" class="cert-checkbox">
            </div>
            <img src="gift.png" alt="Gift">
        `;
        
        const checkbox = card.querySelector('input');
        card.addEventListener('click', (e) => {
            if(e.target !== checkbox) {
                checkbox.checked = !checkbox.checked;
            }
            if (checkbox.checked) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
            updateCertTotal();
        });
        
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
            updateCertTotal();
        });
        
        container.appendChild(card);
    }
}

function updateCertTotal() {
    const selected = document.querySelectorAll('.cert-checkbox:checked').length;
    document.getElementById('cert-total-selected').textContent = selected;
}

function goToCertStep3() {
    const selectedCount = document.querySelectorAll('.cert-checkbox:checked').length;
    if (selectedCount === 0) {
        showAlert('Выберите хотя бы один сертификат', true);
        return;
    }
    
    document.getElementById('cert-step-2').style.display = 'none';
    document.getElementById('cert-step-3').style.display = 'flex';
    document.getElementById('cert-back-btn').style.display = 'none'; 
    
    certStartNumber += selectedCount;
}

function finishCertProcess() {
    closeCertModal();
}
// ============================================

function attachMainEventListeners() {
    const identifierInput = document.getElementById('order-identifier-input');
    const clientCodeInput = document.getElementById('client-code');
    const findBtn = document.getElementById('find-order-btn');

    if (identifierInput) {
        identifierInput.addEventListener('input', handleIdentifierInput);
    }
    
    if (clientCodeInput) {
        clientCodeInput.addEventListener('input', checkFindButtonVisibility);
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
    
    // Делегирование обработчиков
    document.addEventListener('click', (e) => {
        // Подробнее
        const detailsBtn = e.target.closest('.more-details-btn');
        if (detailsBtn) {
            e.stopPropagation();
            const code = detailsBtn.dataset.code;
            if (code && currentOrder) {
                const item = currentOrder.items.find(i => String(i.code) === String(code));
                if (item) openProductDetailModal(item); // Убрано условие проверки на 18+
            }
        }
        
        // Кнопка выдачи
        if (e.target.id === 'issue-btn') handleIssueClick();
        
        // Кнопка снятия с примерки
        if (e.target.id === 'remove-from-fit-btn') markSelectedForReturn();
    });

    document.getElementById('toggle-select-all-checkbox')?.addEventListener('change', toggleSelectAll);
    
    document.getElementById('cancel-courier-btn')?.addEventListener('click', cancelCourierVerification);
    document.getElementById('back-from-lost-btn')?.addEventListener('click', cancelLostItemsVerification);
    
    const productCardsGrid = document.getElementById('product-cards');
    if (productCardsGrid) {
        productCardsGrid.addEventListener('click', handleProductCardClick);
    }
    
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

    document.getElementById('empty-order-back-btn')?.addEventListener('click', () => {
        toggleModal('empty-order-modal', false);
        showMainScreen();
    });
    
    document.getElementById('empty-order-package-btn')?.addEventListener('click', () => {
        toggleModal('empty-order-modal', false);
        createPackageOnlyOrder();
    });

    document.getElementById('overlay')?.addEventListener('click', () => {
        const helpMenu = document.getElementById('help-menu');
        if (helpMenu && helpMenu.classList.contains('visible')) toggleModal('help-menu', false);
    });

    setupSuccessScreenRatingStars();
    document.getElementById('ss-skip-rating-btn')?.addEventListener('click', handleRatingSubmit);
    document.getElementById('ss-submit-rating-btn')?.addEventListener('click', handleRatingSubmit);

    // События для сертификатов
    document.getElementById('issue-certificate-btn')?.addEventListener('click', openCertModal);
    document.getElementById('cert-back-btn')?.addEventListener('click', closeCertModal);
    document.getElementById('cert-next-step-1')?.addEventListener('click', goToCertStep2);
    document.getElementById('cert-issue-final-btn')?.addEventListener('click', goToCertStep3);
    document.getElementById('cert-finish-btn')?.addEventListener('click', finishCertProcess);
    
    const certCodeInput = document.getElementById('cert-client-code');
    if (certCodeInput) {
        certCodeInput.addEventListener('input', function(e) {
            this.value = this.value.replace(/\D/g, '').slice(0, 6);
        });
        certCodeInput.addEventListener('keypress', e => { if (e.key === 'Enter') goToCertStep2(); });
    }

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

function playScannerSound() { 
    if (!canPlaySound()) return;
    if (scannerSound) { scannerSound.currentTime = 0; scannerSound.play().catch(e => {}); } 
}
function playSuccessSound() { 
    if (!canPlaySound()) return;
    if (successSound) { successSound.currentTime = 0; successSound.play().catch(e => {}); } 
}
function playErrorSound() { 
    if (!canPlaySound()) return;
    if (errorSound) { errorSound.currentTime = 0; errorSound.play().catch(e => {}); } 
}

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
    if (cell == null) return 'N/A';
    const cellStr = String(cell);
    if (cellStr === '-') return '-';
    if (cellStr.includes(',')) {
        return cellStr.split(',').map(c => c.trim().replace(/^0+(?=\d)/, '')).join(', ');
    }
    return cellStr.replace(/^0+(?=\d)/, '');
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
             if (code.length >= 10) { 
                document.getElementById('client-code').value = code.slice(4, 10);
                checkFindButtonVisibility();
                findOrder();
             }
         } else {
             document.getElementById('client-code').value = code.slice(0, 6);
             checkFindButtonVisibility();
             findOrder();
         }
    }
}

function handleIdentifierInput(e) {
    const value = e.target.value;
    const clientCodeGroup = document.getElementById('client-code-group');
    clientCodeGroup.style.display = value.length === 4 ? 'block' : 'none';
    if (value.length === 4) document.getElementById('client-code').focus();
    checkFindButtonVisibility();
}

function checkFindButtonVisibility() {
    const phoneVal = document.getElementById('order-identifier-input').value.trim();
    const codeVal = document.getElementById('client-code').value.trim();
    const btn = document.getElementById('find-order-btn');
    
    if (phoneVal.length === 4 && codeVal.length === 6) {
        btn.style.display = 'inline-flex';
    } else {
        btn.style.display = 'none';
    }
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
                <div class="pd-price-row">${(item.price || 0).toFixed(2)} <span class="byn-icon-css"></span></div>
                <div class="pd-desc-block"><div class="pd-label">Описание:</div><div class="pd-desc-text">${item.name || 'Товар без описания'}</div></div>
                <a href="${item.link || 'https://www.wildberries.by'}" target="_blank" class="pd-link-btn">Перейти к товару</a>
            </div>
        </div>`;
    toggleModal('product-details-modal', true);
}

function togglePaymentDetails() {
    const content = document.getElementById('payment-details-content');
    const textSpan = document.getElementById('payment-details-text');
    const icon = document.getElementById('payment-details-icon');
    if (!content || !textSpan) return;
    const isHidden = content.style.display === 'none' || content.style.display === '';
    
    if (isHidden) { 
        content.style.display = 'flex'; 
        textSpan.textContent = "Свернуть";
        if(icon) { icon.classList.remove('fa-chevron-down'); icon.classList.add('fa-chevron-up'); }
        updatePaymentDetails(); 
    } else { 
        content.style.display = 'none'; 
        textSpan.textContent = "Подробнее";
        if(icon) { icon.classList.remove('fa-chevron-up'); icon.classList.add('fa-chevron-down'); }
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
    
    if (!/^\d{4}$/.test(identifier) || !/^\d{6}$/.test(clientCode)) {
        showAlert('Введите 4 цифры телефона и 6 цифр кода клиента', true);
        return;
    }
    
    isFindingOrder = true; 
    playScannerSound();
    
    const orderId = `${identifier}-${clientCode}`;
    
    const initialScreen = document.getElementById('initial-screen-wrapper');
    const spinnerScreen = document.getElementById('finding-order-spinner');
    if(initialScreen) initialScreen.style.display = 'none';
    if(spinnerScreen) spinnerScreen.style.display = 'flex';
    
    setTimeout(() => {
        if(spinnerScreen) spinnerScreen.style.display = 'none';
        
        const existingOrder = allActiveOrders.find(o => o.identifier === orderId);
        
        if(existingOrder) { 
            switchToOrder(orderId);
        } else {
            processAndFindOrder(orderId);
        }
        
        setTimeout(() => { isFindingOrder = false; }, 500);
    }, 3000);
}

function processAndFindOrder(orderId) {
    const userData = getUserData() || {}; 
    const codesInActiveOrders = new Set(allActiveOrders.flatMap(o => o.items.map(i => i.code)));
    const codesInReturns = new Set((userData.returnsItems || []).map(i => i.code));

    const availableItems = (userData.receptionItems || []).filter(item =>
        !codesInActiveOrders.has(item.code) && !codesInReturns.has(item.code)
    );

    if (availableItems.length < 1) {
        const modal = document.getElementById('empty-order-modal');
        if (modal) {
            modal.dataset.orderId = orderId;
            toggleModal('empty-order-modal', true);
        }
        return;
    }

    let orderItems, cell, name, type;
    const isCourier = Math.random() < 0.20;
    
    const identifierInput = document.getElementById('order-identifier-input');
    const identifier = identifierInput ? identifierInput.value.trim() : orderId.split('-')[0];

    if (isCourier) {
        type = 'courier';
        let random11 = Math.floor(10000000000 + Math.random() * 90000000000).toString();
        name = `Курьер ID: ${random11}`;
        const availableCells = [...new Set(availableItems.map(i => String(i.cell)))];
        if (availableCells.length === 0) { showAlert('Нет доступных ячеек.', true); return; }
        
        // 85% - 1 ячейка, 13% - 2 ячейки, 2% - 3 ячейки
        let maxPossibleCells = Math.min(availableCells.length, 3);
        let numCells = 1; 
        let rand = Math.random();
        if (rand > 0.98) numCells = 3;
        else if (rand > 0.85) numCells = 2;
        numCells = Math.min(numCells, maxPossibleCells);
        
        const selectedCells = availableCells.sort(() => 0.5 - Math.random()).slice(0, numCells);
        orderItems = availableItems.filter(item => selectedCells.includes(String(item.cell)));
        cell = selectedCells.join(', ');
        if(orderItems.length === 0) { showAlert('Ошибка формирования заказа.', true); return; }
    } else {
        type = 'client';
        const clientCode = document.getElementById('client-code') ? document.getElementById('client-code').value.trim() : '000000';
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
        let isReturnable = i.isReturnable !== undefined ? i.isReturnable : true;
        
        if (i.isReturnable === undefined) {
            if (nameLower.includes('телефон') || nameLower.includes('машина') || nameLower.includes('техника')) isReturnable = false;
            if (i.isAdult) isReturnable = false;
        }
        
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
        cell, identifier, name, type, isVerified: false, ageVerified: false, items: finalItems,
        packages: { 'майка': 0, 'средний': 0, 'большой': 0 },
        paymentDetails: { method: method, discount: 0, total: rawTotal }
    };
}

function proceedWithOrder(orderId) {
    const order = allActiveOrders.find(o => o.identifier === orderId);
    if(!order) return;
    currentOrder = order;
    if (currentOrder.isVerified) { 
        showOrderViewScreen(); 
    } else { 
        showPreVerificationScreen(); 
    }
    renderActiveOrders();
}

function switchToOrder(orderId) {
    const order = allActiveOrders.find(o => o.identifier === orderId);
    if (!order) return;

    const hasAdult = order.items.some(i => i.isAdult);
    
    if (hasAdult && !order.ageVerified) {
        currentOrder = order; 
        toggleModal('age-verification-modal', true);
        
        const yesBtn = document.getElementById('age-verify-yes-btn');
        const noBtn = document.getElementById('age-verify-no-btn');
        
        yesBtn.onclick = () => {
            order.ageVerified = true;
            saveActiveOrders();
            toggleModal('age-verification-modal', false);
            proceedWithOrder(orderId);
        };
        
        noBtn.onclick = () => {
            toggleModal('age-verification-modal', false);
            order.items = order.items.filter(i => !i.isAdult);
            
            if (order.items.length === 0) {
                finishOrderSession(orderId);
                showAlert('В заказе остались только товары 18+. Заказ удален.', false);
                showMainScreen();
            } else {
                saveActiveOrders();
                proceedWithOrder(orderId);
            }
        };
    } else {
        proceedWithOrder(orderId);
    }
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

    if (currentOrder.type === 'courier') {
        pvScreen.classList.remove('pv-client-mode');
    } else {
        pvScreen.classList.add('pv-client-mode');
    }

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
    const isCourier = currentOrder.type === 'courier';

    const clientLeftHeader = document.getElementById('pv-client-left-header');
    const courierHeaderBlock = document.getElementById('pv-grey-header-block');
    const courierTitle = document.getElementById('pv-courier-title');
    const cellLabel = document.getElementById('pv-cell-label');
    const courierMainStats = document.getElementById('pv-main-stats-courier');

    const courierStatsGrid = document.getElementById('pv-courier-stats');
    const cancelCourierBtn = document.getElementById('cancel-courier-btn');
    const backFromLostBtn = document.getElementById('back-from-lost-btn');

    const videoContainer = document.getElementById('pv-video-container');
    const clientSuccessMsg = document.getElementById('pv-client-success-msg');

    const unpaidWarning = document.getElementById('pv-unpaid-warning');
    const skipBtn = document.getElementById('skip-all-verification-btn');
    const pvBottomControls = document.getElementById('pv-bottom-controls-wrapper');

    let verifiedItems, unverifiedItems;
    let totalCount = itemsToProcess.length;
    let verifiedCountTotal = 0;

    if (isLostItemsVerificationMode) {
        const currentlyLost = itemsToProcess.filter(i => i.isLost).length;
        const found = itemsToProcess.filter(i => i.wasLost).length;
        totalCount = currentlyLost + found;
        verifiedCountTotal = found;

        unverifiedItems = itemsToProcess.filter(i => i.isLost);
        verifiedItems = itemsToProcess.filter(i => !i.isLost && i.wasLost);
    } else {
        verifiedItems = itemsToProcess.filter(i => i.isVerified); 
        unverifiedItems = itemsToProcess.filter(i => !i.isVerified);
        verifiedCountTotal = itemsToProcess.filter(i => i.isVerified && !i.isLost).length;
    }

    const hasUnpaid = itemsToProcess.some(i => !i.isPaid);

    if(courierHeaderBlock) courierHeaderBlock.style.display = 'block';

    if (isCourier || isLostItemsVerificationMode) {
        if(clientLeftHeader) clientLeftHeader.style.display = 'none';
        
        if(courierTitle) courierTitle.style.display = 'block';
        if(cellLabel) cellLabel.style.display = 'none';

        if(unpaidWarning) unpaidWarning.style.display = 'none';

        if (cancelCourierBtn) cancelCourierBtn.style.display = (!isLostItemsVerificationMode && isCourier) ? 'flex' : 'none';
        if (backFromLostBtn) backFromLostBtn.style.display = isLostItemsVerificationMode ? 'flex' : 'none';
        if (skipBtn) skipBtn.style.display = (!isLostItemsVerificationMode && isCourier) ? 'none' : 'inline-flex';
        if (pvBottomControls) pvBottomControls.style.display = (!isLostItemsVerificationMode && isCourier) ? 'none' : 'flex';

        if (isLostItemsVerificationMode) {
            courierTitle.textContent = `Отсканируйте утерянные товары из ячейки: ${verifiedCountTotal} из ${totalCount}`;
            if(courierStatsGrid) courierStatsGrid.style.display = 'none';
            if(courierMainStats) {
                courierMainStats.style.display = 'none';
            }
        } else {
            courierTitle.textContent = `Отсканируйте товары из ячейки:`;
            if(courierMainStats) courierMainStats.style.display = 'none';
            if(courierStatsGrid) {
                courierStatsGrid.style.display = 'grid';
                document.getElementById('pv-courier-verified-val').textContent = `${verifiedCountTotal} из ${totalCount}`;
                document.getElementById('pv-courier-notfound-val').textContent = currentOrder.items.filter(i => i.isLost).length;
                document.getElementById('pv-courier-damaged-val').textContent = currentOrder.items.filter(i => i.isNoBarcode && i.isVerified).length;
            }
        }

        let hasScanned;
        if (isLostItemsVerificationMode) {
            hasScanned = itemsToProcess.some(i => i.wasLost);
        } else {
            hasScanned = itemsToProcess.some(i => i.isVerified);
        }

        if (hasScanned) {
            if (videoContainer) videoContainer.style.display = 'none';
            if (clientSuccessMsg) clientSuccessMsg.style.display = 'block';
        } else {
            if (videoContainer) videoContainer.style.display = 'flex';
            if (clientSuccessMsg) clientSuccessMsg.style.display = 'none';
        }

    } else { 
        if(clientLeftHeader) clientLeftHeader.style.display = 'block';
        if(courierTitle) courierTitle.style.display = 'none';
        if(cellLabel) cellLabel.style.display = 'block';
        if(courierMainStats) courierMainStats.style.display = 'none';
        if(courierStatsGrid) courierStatsGrid.style.display = 'none';

        if(cancelCourierBtn) cancelCourierBtn.style.display = 'none';
        if(backFromLostBtn) backFromLostBtn.style.display = 'none';

        if (skipBtn) skipBtn.style.display = 'inline-flex';
        if (pvBottomControls) pvBottomControls.style.display = 'flex';

        document.getElementById('pv-verified-count-client').textContent = verifiedCountTotal;
        document.getElementById('pv-total-count-client').textContent = totalCount;

        if (verifiedCountTotal === 0) {
            if(videoContainer) videoContainer.style.display = 'flex';
            if(clientSuccessMsg) clientSuccessMsg.style.display = 'none';
        } else {
            if(videoContainer) videoContainer.style.display = 'none';
            if(clientSuccessMsg) clientSuccessMsg.style.display = 'block';
        }

        if (hasUnpaid) {
            if(unpaidWarning) unpaidWarning.style.display = 'block';
        } else {
            if(unpaidWarning) unpaidWarning.style.display = 'none';
        }
    }

    document.getElementById('pv-cell-display').innerHTML = formatCellDisplay(currentOrder.cell);
    
    const verifiedContainer = document.getElementById('pv-verified-items-list');
    verifiedContainer.innerHTML = ''; 
    verifiedContainer.style.display = 'flex';

    verifiedItems.slice().reverse().forEach(item => {
        const imageContent = item.isAdult ? `<img src="adult.svg" style="width:100%;">` : (item.image ? `<img src="${item.image}" style="width:100%; object-fit:contain;">` : '📦');
        const lostClass = item.isLost ? ' lost-ultra-red' : '';
        const nameClass = item.isAdult ? 'product-name-pv adult-blur-text' : 'product-name-pv';
        const codeClass = 'product-code';

        verifiedContainer.innerHTML += `
        <div class="pv-item-card verified${lostClass}">
            <div class="pv-item-image">
                ${imageContent}
                <img src="plus.svg" class="more-details-btn" data-code="${item.code}" title="Подробнее">
            </div>
            <div class="pv-item-details">
                <div class="${codeClass}">${item.code}</div>
                <div class="${nameClass}">${item.name || 'Товар'}</div>
            </div>
        </div>`;
    });

    const unverifiedContainer = document.getElementById('pv-unverified-items-list');
    unverifiedContainer.innerHTML = '';
    
    unverifiedItems.forEach(item => {
        const imageContent = item.isAdult ? `<img src="adult.svg" style="width:100%;">` : (item.image ? `<img src="${item.image}" style="width:100%; object-fit:contain;">` : '📦');
        const noBarcodeBadge = item.isNoBarcode ? '<div class="no-barcode-badge-pv">Без ШК</div>' : '';
        const nameClass = item.isAdult ? 'product-name-pv adult-blur-text' : 'product-name-pv';
        const codeClass = 'product-code';

        let buttonsHtml = '';
        if (isLostItemsVerificationMode) buttonsHtml += `<button class="skip-one-btn" data-action="skip-lost" data-code="${item.code}">Не сканировать</button>`;
        else {
            if (isCourier && item.isNoBarcode) buttonsHtml += `<button class="skip-one-btn" data-action="skip" data-code="${item.code}">Без ШК</button>`;
            if (isCourier) buttonsHtml += `<button class="skip-one-btn" data-action="notfound" data-code="${item.code}">Не найден</button>`;
            if (!isCourier) buttonsHtml += `<button class="skip-one-btn" data-action="skip" data-code="${item.code}">Не сканировать</button>`;
        }
        unverifiedContainer.innerHTML += `
        <div class="pv-item-card unverified">
            <div class="pv-item-image">
                ${noBarcodeBadge}${imageContent}
                <img src="plus.svg" class="more-details-btn" data-code="${item.code}" title="Подробнее">
            </div>
            <div class="pv-item-details">
                <div class="${codeClass}">${item.code}</div>
                <div class="${nameClass}">${item.name || 'Товар'}</div>
            </div>
            <div class="pv-card-actions">${buttonsHtml}</div>
        </div>`;
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
    const now = Date.now();
    if (now - lastVerifyTime < VERIFY_THROTTLE) return; 
    lastVerifyTime = now;

    if (!currentOrder) return;
    const input = document.getElementById('pre-verification-code');
    const code = input.value.trim();
    if (!code) return; 

    if (code.length !== 9) {
        playCustomSound('failScan.mp3');
        showAlert('Штрихкод должен содержать ровно 9 цифр!', true);
        return;
    }

    let itemToVerify = isLostItemsVerificationMode ? 
        currentOrder.items.find(item => item.isLost && item.code === code) : 
        currentOrder.items.find(item => !item.isVerified && item.code === code);
        
    if (!itemToVerify) {
        itemToVerify = isLostItemsVerificationMode ? 
            currentOrder.items.find(item => item.isLost) : 
            currentOrder.items.find(item => !item.isVerified);
    }

    if (itemToVerify) { 
        if (isLostItemsVerificationMode) { 
            itemToVerify.isLost = false; 
            itemToVerify.wasLost = true; 
        } else {
            itemToVerify.isVerified = true;
        }

        playCustomSound('successScan.mp3'); 
        input.value = ''; 
        input.focus(); 
        
        const video = document.getElementById('pv-video-container');
        const successMsg = document.getElementById('pv-client-success-msg');
        if (video) video.style.display = 'none';
        if (successMsg) successMsg.style.display = 'block';
        
        updatePVState(code); 
    } else { 
        playCustomSound('failScan.mp3'); 
        showAlert('Все товары уже проверены!', true); 
    }
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
            playCustomSound('please.mp3', true); 
        } else {
            playCustomSound('please.mp3', true); 
            setTimeout(() => showOrderViewScreen(), 500);
        }
    }
}

function showOrderViewScreen() {
    document.getElementById('pre-verification-screen').style.display = 'none';
    document.getElementById('initial-screen-wrapper').style.display = 'none';
    document.getElementById('issue-from-return-screen').style.display = 'none';
    document.getElementById('success-screen').style.display = 'none';
    document.getElementById('order-view-container').style.display = 'grid'; 
    
    const isPackageOnly = currentOrder.items.length === 0;

    if (isPackageOnly) {
        document.getElementById('order-products-right-panel').style.display = 'none';
        if(document.getElementById('remove-from-fit-btn')) document.getElementById('remove-from-fit-btn').style.display = 'none';
        document.getElementById('order-view-container').style.gridTemplateColumns = '1fr';
        document.getElementById('order-info-left-panel').style.maxWidth = '500px';
        document.getElementById('order-info-left-panel').style.margin = '0 auto';
    } else {
        document.getElementById('order-products-right-panel').style.display = 'flex';
        if(document.getElementById('remove-from-fit-btn')) document.getElementById('remove-from-fit-btn').style.display = 'block';
        document.getElementById('order-view-container').style.gridTemplateColumns = '240px 1fr';
        document.getElementById('order-info-left-panel').style.maxWidth = 'none';
        document.getElementById('order-info-left-panel').style.margin = '0';
    }

    renderProductCards(); 
    updateUIData();
}

function renderProductCards() {
    if (!currentOrder) return;
    const container = document.getElementById('product-cards');
    if (!container) return;
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
        
        const codeDisplayFinal = codeDisplay;
        const nameClass = item.isAdult ? 'v-name-row adult-blur-text' : 'v-name-row';

        const defectiveOverlay = item.isDefective ? `<div class="defective-ribbon"><span>БРАК</span></div>` : '';
        const defectiveBtnText = item.isDefective ? 'Отменить брак' : 'Брак';
        const defectiveBtn = (!isForIssue) ? `<button class="defective-btn" data-code="${item.code}">${defectiveBtnText}</button>` : '';
        const returnIconSrc = item.isReturnable ? 'return.svg' : 'no_return.svg';

        const extraInfoHtml = `
            <div class="v-extra-info" title="Цвет: ${item.color || '-'}, Размер: ${item.size || '-'}">Цвет: ${item.color || '-'}, Размер: ${item.size || '-'}</div>
            <div class="v-extra-info" title="Комплектация: ${item.config || '-'}">Комплектация: ${item.config || '-'}</div>
        `;

        const card = document.createElement('div'); 
        card.className = cardClass;
        card.dataset.code = item.code; 
        
        card.innerHTML = `
            <div class="vertical-img-container">
                 ${imageContent}
                 <img src="plus.svg" class="more-details-btn" data-code="${item.code}" title="Подробнее">
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
                 <div class="v-code-row">${codeDisplayFinal}</div>
                 <div class="${nameClass}">${item.name || 'Товар'}</div>
                 ${extraInfoHtml}
                 <div class="v-price-row">
                    <img src="wallet.svg" class="wallet-icon-small">
                    ${(item.price || 0).toFixed(2)} <span class="byn-icon-css"></span>
                 </div>
                 ${defectiveBtn}
            </div>
        `;
        container.appendChild(card);
        if (isForIssue) card.querySelector(`#check-${item.code}`).addEventListener('change', (e) => toggleItemSelection(e, item.code));
    });
}

function updateRecommendedPackages() {
    const container = document.getElementById('recommended-pkg-container');
    if (!container || !currentOrder) return;
    
    if (currentOrder.type !== 'courier' || currentOrder.items.length === 0) {
        container.style.display = 'none';
        return;
    }

    const itemsCount = currentOrder.items.filter(i => i.status === 'selected' && !i.isLost).length;
    if (itemsCount === 0) {
        container.style.display = 'none';
        return;
    }

    let recText = '';
    if (itemsCount <= 2) {
        recText = 'Пакет-майка — 1 шт.';
    } else if (itemsCount <= 4) {
        recText = 'Пакет средний — 1 шт.';
    } else if (itemsCount <= 7) {
        recText = 'Пакет большой — 1 шт.';
    } else {
        recText = 'Пакет большой — 2 шт.';
    }

    container.innerHTML = `
        <div class="recommended-pkg-banner">
            <i class="fas fa-info-circle" style="font-size: 1.4rem;"></i>
            <div>
                <div style="font-weight: bold; margin-bottom: 2px;">Рекомендуемое количество пакетов для выдачи:</div>
                <div style="font-size: 1.1rem; color: #000; font-weight: bold;">${recText}</div>
            </div>
        </div>
    `;
    container.style.display = 'block';
}

function updateUIData() {
    if (!currentOrder) return;
    const itemsToShow = currentOrder.items.filter(i => !i.isLost); 
    const checkedItems = itemsToShow.filter(i => i.isChecked && i.status === 'selected');
    const totalPackages = Object.values(currentOrder.packages || {}).reduce((sum, count) => sum + count, 0);

    const checkedUnpaidItems = itemsToShow.filter(i => !i.isPaid && i.isChecked && i.status === 'selected');
    const totalSum = checkedUnpaidItems.reduce((sum, item) => sum + (item.price || 0), 0);
    let finalSum = totalSum - (currentOrder.paymentDetails.discount || 0);
    if (finalSum < 0 || checkedUnpaidItems.length === 0) finalSum = 0; 

    updateRecommendedPackages();

    const scrollArea = document.getElementById('order-info-scroll-area');
    if (scrollArea) {
        let isPaymentDetailsOpen = false;
        const oldContent = document.getElementById('payment-details-content');
        if (oldContent && oldContent.style.display === 'flex') {
            isPaymentDetailsOpen = true;
        }

        let html = '';

        if (currentOrder.type === 'courier') {
            const courierIdMatch = currentOrder.name.match(/ID: (\d+)/);
            const courierId = courierIdMatch ? courierIdMatch[1] : '12345678901';
            
            html += `
                <div class="courier-layout">
                    <div class="ol-label-black">ID курьера</div>
                    <div class="ol-val-bold">${courierId}</div>

                    <div class="order-gray-block text-right">
                        <div class="ol-label-small">Ячейка</div>
                        <div class="cell-medium">${formatCellDisplay(currentOrder.cell)}</div>
                    </div>

                    <div class="ol-label-black">Товаров</div>
                    <div class="ol-val-bold" style="font-size: 1.6rem;">${checkedItems.length} из ${itemsToShow.filter(i => i.status === 'selected').length}</div>
            `;
            
            const lostCount = currentOrder.items.filter(i => i.isLost).length;
            if (lostCount > 0) {
                html += `<div id="lost-items-trigger" class="lost-trigger-left">Просканировать утерянные (${lostCount})</div>`;
            }
            html += `</div>`;
        } else {
            const identifier = currentOrder.identifier.split('-')[0] || '0000';
            const last4 = identifier.slice(-4).padStart(4, '0');

            const selectedItems = itemsToShow.filter(i => i.status === 'selected');
            const allPaid = selectedItems.every(i => i.isPaid);
            const nonePaid = selectedItems.every(i => !i.isPaid);
            let methodText = "";
            if (allPaid) methodText = "Сразу";
            else if (nonePaid) methodText = "Оплата при получении";
            else methodText = "Сразу, При получении";

            html += `
                <div class="client-layout">
                    <div class="ol-label-black">Клиент</div>
                    <div class="ol-phone">
                        <span style="color: var(--text-secondary-color)">+375 (••) ••• </span><span style="color: #000; letter-spacing: -1px;">${last4.slice(0,2)} ${last4.slice(2)}</span>
                    </div>

                    <div class="order-gray-block text-right">
                        <div class="ol-label-small">Ячейка</div>
                        <div class="cell-large-thin">${formatCellDisplay(currentOrder.cell)}</div>
                    </div>

                    <div class="ol-label-black">Товаров</div>
                    <div class="ol-val-bold" style="font-size: 1.6rem;">${checkedItems.length} из ${itemsToShow.filter(i => i.status === 'selected').length}</div>
                    
                    <hr class="full-hr">

                    <div class="package-block">
                        <button id="add-package-btn" class="dashed-add-btn"><i class="fas fa-plus"></i></button>
                        <div class="package-info-right">
                            <div class="ol-label-black">Пакетов</div>
                            <div class="ol-val-bold" style="font-size: 1.6rem;">${totalPackages}</div>
                        </div>
                    </div>

                    <hr class="full-hr">

                    <div class="payment-block">
                        <div class="ol-label-gray">К оплате</div>
                        <div class="payment-total">
                            <img src="wallet.svg" alt="wallet" class="wallet-icon-purple">
                            <span class="price-val-purple">${finalSum.toFixed(2)} <span class="byn-icon-css"></span></span>
                        </div>

                        <div id="payment-details-toggle-btn" class="details-toggle-right">
                            <span id="payment-details-text">${isPaymentDetailsOpen ? 'Свернуть' : 'Подробнее'}</span>
                            <i id="payment-details-icon" class="fas fa-chevron-${isPaymentDetailsOpen ? 'up' : 'down'}"></i>
                        </div>

                        <div class="payment-details-content" id="payment-details-content" style="display: ${isPaymentDetailsOpen ? 'flex' : 'none'};">
                            <div class="payment-detail-row">
                                <span>Тип оплаты</span>
                                <span id="payment-details-method">${methodText}</span>
                            </div>
                            <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 5px 0;">
                            <div class="payment-detail-row">
                                <span>Сумма</span>
                                <span id="payment-details-total">${totalSum.toFixed(2)} <span class="byn-icon-css"></span></span>
                            </div>
                            <div class="payment-detail-row">
                                <span>Скидка</span>
                                <span id="payment-details-discount">${(currentOrder.paymentDetails.discount||0).toFixed(2)} <span class="byn-icon-css"></span></span>
                            </div>
                            <hr style="border: 0; border-top: 1px solid var(--border-color); margin: 5px 0;">
                            <div class="payment-detail-row" style="font-weight: bold;">
                                <span>Итого</span>
                                <span id="payment-details-final">${finalSum.toFixed(2)} <span class="byn-icon-css"></span></span>
                            </div>
                        </div>
                    </div>
            `;
            
            const lostCount = currentOrder.items.filter(i => i.isLost).length;
            if (lostCount > 0) {
                html += `<div id="lost-items-trigger" class="lost-trigger-right">Просканировать утерянные (${lostCount})</div>`;
            }
            
            html += `</div>`;
        }

        scrollArea.innerHTML = html;

        // Перепривязка событий для динамических элементов
        const pkgBtn = document.getElementById('add-package-btn');
        if (pkgBtn) pkgBtn.addEventListener('click', () => togglePackageModal(true));

        const toggleBtn = document.getElementById('payment-details-toggle-btn');
        if (toggleBtn) toggleBtn.addEventListener('click', togglePaymentDetails);

        const lostTrigger = document.getElementById('lost-items-trigger');
        if (lostTrigger) lostTrigger.addEventListener('click', startLostItemsVerification);
    }

    const issueBtn = document.getElementById('issue-btn');
    if (issueBtn) {
        if (currentOrder.type === 'courier') {
            issueBtn.textContent = "Выдать";
            const hasLost = currentOrder.items.some(i => i.isLost);
            if (hasLost) {
                issueBtn.disabled = true;
                issueBtn.style.opacity = '0.5';
                issueBtn.style.cursor = 'not-allowed';
            } else {
                issueBtn.disabled = false;
                issueBtn.style.opacity = '1';
                issueBtn.style.cursor = 'pointer';
            }
        } else {
            const hasUnpaidSelected = checkedItems.some(i => !i.isPaid);
            if (currentOrder.items.length === 0) {
                issueBtn.textContent = "Выдать";
            } else {
                issueBtn.textContent = hasUnpaidSelected ? "Оплатить и выдать" : "Выдать";
            }
            issueBtn.disabled = false;
            issueBtn.style.opacity = '1';
            issueBtn.style.cursor = 'pointer';
        }
    }

    const removeBtn = document.getElementById('remove-from-fit-btn');
    if (removeBtn) {
        removeBtn.disabled = checkedItems.length === 0;
    }

    const selectAllCheckbox = document.getElementById('toggle-select-all-checkbox');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = itemsToShow.length > 0 && itemsToShow.filter(i => i.status === 'selected').every(i => i.isChecked);
    }
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

    const elMethod = document.getElementById('payment-details-method');
    const elTotal = document.getElementById('payment-details-total');
    const elDiscount = document.getElementById('payment-details-discount');
    const elFinal = document.getElementById('payment-details-final');

    if(elMethod) elMethod.textContent = methodText;
    if(elTotal) elTotal.innerHTML = `${totalSum.toFixed(2)} <span class="byn-icon-css"></span>`;
    if(elDiscount) elDiscount.innerHTML = `${discount.toFixed(2)} <span class="byn-icon-css"></span>`;
    if(elFinal) elFinal.innerHTML = `${final.toFixed(2)} <span class="byn-icon-css"></span>`;
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
    let itemToReturnIndex = items.findIndex(i => i.status === 'selected' && !i.isLost && i.isReturnable && String(i.code) === code);
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
        showAlert('В заказе нет товаров для возврата с таким ШК.', true);
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
                <div style="font-size:0.9rem; color:grey;">${pkg.price} <span class="byn-icon-css"></span></div>
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
    
    document.getElementById('initial-screen-wrapper').style.display = 'flex';

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
    checkFindButtonVisibility();
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
    if (!/^\d{4}$/.test(identifier) || !/^\d{6}$/.test(clientCode)) { showAlert('Введите 4 цифры телефона и 6 цифр кода клиента', true); return; }

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
        const nameClass = item.isAdult ? 'product-name-row adult-blur-text' : 'product-name-row';
        const codeClass = 'product-code-row';

        div.innerHTML = `<div class="hc-left"><div class="checkbox-wrapper-purple"><input type="checkbox" id="restore-check-${index}" class="restore-checkbox" checked></div></div><div class="hc-image"><div class="product-image-mid">${imageContent}</div></div><div class="hc-info"><div class="${codeClass}">${item.code}</div><div class="${nameClass}">${item.name || 'Товар'}</div></div>`;
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
        isVerified: true, ageVerified: true, isFromReturn: true,
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

function showAlert(message, isError = false) {
    const existingAlert = document.querySelector('.alert-message');
    if (existingAlert && existingAlert.textContent === message) return;

    if (existingAlert) existingAlert.remove();
    const alert = document.createElement('div'); alert.className = 'alert-message'; alert.textContent = message;
    alert.style.background = isError ? 'var(--error)' : 'var(--success)';
    if (isError && typeof playErrorSound === 'function') playErrorSound();
    document.body.appendChild(alert);
    setTimeout(() => { if (document.body.contains(alert)) document.body.removeChild(alert); }, 4000);
}

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