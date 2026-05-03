const MAX_CARDBOARD_UNITS = 16;

function initVozvratKartonPage() {
    renderCardboardBoxStickers();
    
    document.getElementById('create-cardboard-box-btn').addEventListener('click', () => {
        toggleModal('create-cardboard-box-modal', true);
        document.getElementById('new-cardboard-box-code').focus();
        document.getElementById('new-cardboard-box-code').value = '';
    });
    
    document.getElementById('close-create-cardboard-box-modal').addEventListener('click', () => {
        toggleModal('create-cardboard-box-modal', false);
    });

    document.getElementById('submit-new-cardboard-box-btn').addEventListener('click', createCardboardBox);
}


function createCardboardBox() {
    const input = document.getElementById('new-cardboard-box-code');
    const code = input.value.trim();
    if (!/^\d{9}$/.test(code)) {
        showAlert('Введите корректный 9-значный ШК коробки', true); return;
    }
    const userData = getUserData();
    let boxes = userData.cardboardBoxes || [];
    if (boxes.some(box => box.id === code)) {
        showAlert('Коробка с таким ШК уже существует', true); return;
    }
    const newBox = { id: code, createdAt: new Date().toISOString(), closedAt: null, quantity: 0, isClosed: false };
    boxes.unshift(newBox);
    userData.cardboardBoxes = boxes;
    saveUserData(userData);
    toggleModal('create-cardboard-box-modal', false);
    renderCardboardBoxStickers();
    showAlert(`Коробка для картона ${code} создана`, false);
}

function renderCardboardBoxStickers() {
    const container = document.getElementById('cardboard-boxes-top-bar');
    const userData = getUserData();
    let boxes = userData.cardboardBoxes || [];
    container.querySelectorAll('.box-sticker').forEach(el => el.remove());
    boxes.forEach(box => {
        const sticker = document.createElement('div');
        sticker.className = `box-sticker ${box.isClosed ? 'closed' : 'open'}`;
        sticker.textContent = box.id;
        sticker.dataset.boxId = box.id;
        sticker.onclick = () => {
            document.querySelectorAll('.box-sticker').forEach(s => s.classList.remove('selected'));
            sticker.classList.add('selected');
            renderCardboardBoxDetails(box.id);
        };
        container.appendChild(sticker);
    });
}

function renderCardboardBoxDetails(boxId) {
    const infoContainer = document.getElementById('cardboard-box-info-container');
    const detailsContainer = document.getElementById('cardboard-box-details-container');
    const userData = getUserData();
    const boxes = userData.cardboardBoxes || [];
    const box = boxes.find(b => b.id === boxId);
    if (!box) {
        infoContainer.innerHTML = `<div class="empty-message">Коробка не найдена</div>`;
        detailsContainer.innerHTML = '<div class="empty-message">Детали не выбраны</div>';
        return;
    }
    const controlsHTML = box.isClosed ? '' : `
        <h3>Укажите количество</h3>
        <div class="input-group">
            <label for="cardboard-quantity">Количество единиц картона:</label>
            <input type="number" id="cardboard-quantity" min="0" max="${MAX_CARDBOARD_UNITS}" value="${box.quantity}">
        </div>
        <div class="cardboard-controls">
            <button id="save-cardboard-quantity-btn" class="secondary-btn">Сохранить</button>
            <button id="close-cardboard-box-btn" class="primary-btn">Закрыть коробку</button>
        </div>
    `;
    infoContainer.innerHTML = `
        <h3>Коробка: ${box.id}</h3>
        <div class="box-meta-info">
            <span>Статус: <strong style="color: ${box.isClosed ? 'var(--error)' : 'var(--success)'};">${box.isClosed ? 'Закрыта' : 'Открыта'}</strong></span>
            <span>Количество: <strong>${box.quantity} / ${MAX_CARDBOARD_UNITS}</strong></span>
            <span>Создана: <strong>${new Date(box.createdAt).toLocaleDateString('ru-RU')}</strong></span>
            ${box.closedAt ? `<span>Закрыта: <strong>${new Date(box.closedAt).toLocaleDateString('ru-RU')}</strong></span>` : ''}
        </div>
    `;
    detailsContainer.innerHTML = controlsHTML || `<p>Коробка закрыта. Количество: <strong>${box.quantity}</strong></p>`;
    if (!box.isClosed) {
        document.getElementById('save-cardboard-quantity-btn').onclick = () => saveCardboardQuantity(boxId, false);
        document.getElementById('close-cardboard-box-btn').onclick = () => saveCardboardQuantity(boxId, true);
    }
}

function saveCardboardQuantity(boxId, shouldClose) {
    const quantityInput = document.getElementById('cardboard-quantity');
    const quantity = quantityInput ? parseInt(quantityInput.value, 10) : 0;
    if (isNaN(quantity) || quantity < 0 || quantity > MAX_CARDBOARD_UNITS) {
        showAlert(`Введите количество от 0 до ${MAX_CARDBOARD_UNITS}`, true); return;
    }
    const userData = getUserData();
    let boxes = userData.cardboardBoxes || [];
    const boxIndex = boxes.findIndex(b => b.id === boxId);
    if (boxIndex > -1) {
        boxes[boxIndex].quantity = quantity;
        if (shouldClose) {
            boxes[boxIndex].isClosed = true;
            boxes[boxIndex].closedAt = new Date().toISOString();
        }
        userData.cardboardBoxes = boxes;
        saveUserData(userData);
        renderCardboardBoxStickers();
        renderCardboardBoxDetails(boxId);
        showAlert(shouldClose ? `Коробка ${boxId} закрыта` : `Количество для коробки ${boxId} сохранено`, false);
    }
}