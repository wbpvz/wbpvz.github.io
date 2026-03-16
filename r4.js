function initVozvratUtilPage () {
    renderDisposalItems();
}

function renderDisposalItems() {
    const container = document.getElementById('disposal-container');
    const countEl = document.getElementById('disposal-count');
    const disposeAllBtn = document.getElementById('dispose-all-btn');
    const userData = getUserData();
    const allItems = userData.receptionItems || [];
    const cellChanges = userData.cellChanges || {};
    const fourteenDaysAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);

    const itemsToDispose = allItems.filter(item => new Date(item.date).getTime() < fourteenDaysAgo);

    countEl.textContent = itemsToDispose.length;
    container.innerHTML = '';

    if (itemsToDispose.length === 0) {
        container.innerHTML = '<div class="empty-message" style="grid-column: 1 / -1;"><img src="utilization.png" alt="Утиль"><br>Нет товаров для утилизации</div>';
        disposeAllBtn.disabled = true;
        return;
    }

    disposeAllBtn.disabled = false;
    disposeAllBtn.onclick = () => {
        // ИЗМЕНЕНО: Вызов модального окна
        const modal = document.getElementById('disposal-confirm-modal');
        if (!modal) { // Запасной вариант, если модальное окно не найдено
            if (confirm(`Вы уверены, что хотите утилизировать ${itemsToDispose.length} товар(ов)? Это действие необратимо.`)) {
                disposeAllItems(itemsToDispose);
            }
            return;
        }
        
        document.getElementById('disposal-confirm-text').textContent = `Вы уверены, что хотите утилизировать товары в количестве: ${itemsToDispose.length}?`;
        
        document.getElementById('disposal-confirm-btn').onclick = () => {
            toggleModal('disposal-confirm-modal', false);
            disposeAllItems(itemsToDispose);
        };
        
        document.getElementById('disposal-cancel-btn').onclick = () => {
            toggleModal('disposal-confirm-modal', false);
        };

        modal.querySelector('.close-modal-btn').onclick = () => {
             toggleModal('disposal-confirm-modal', false);
        };
        
        toggleModal('disposal-confirm-modal', true);
    };

    itemsToDispose.forEach(item => {
        const actualCell = getActualCell(item.cell, cellChanges);
        const card = document.createElement('div');
        card.className = 'reception-card-new';
        card.innerHTML = `
            ${item.isDefective ? '<div class="defective-overlay">БРАК</div>' : ''}
            <div class="cell-header">
                <span class="cell-title">Ячейка</span>
                <span class="cell-number">${parseInt(actualCell, 10)}</span>
            </div>
            <div class="product-image-container">
                 <span class="product-emoji">${item.image || '📦'}</span>
            </div>
            <div class="product-details-new">
                <span class="main-code">${item.code}</span>
                <div class="product-name" style="font-size: 0.9rem; color: var(--text-secondary-color);">${item.name}</div>
                <div class="cell-meta-row" style="font-size: 0.8rem; margin-top: 5px;">
                    Принят: ${new Date(item.date).toLocaleDateString('ru-RU')}
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function disposeAllItems(itemsToDispose) {
    let userData = getUserData();
    let allItems = userData.receptionItems || [];
    const codesToDispose = new Set(itemsToDispose.map(item => item.code));

    const updatedItems = allItems.filter(item => !codesToDispose.has(item.code));
    userData.receptionItems = updatedItems;
    saveUserData(userData);

    showAlert(`Все ${itemsToDispose.length} товар(ов) утилизированы`, false);
    renderDisposalItems();
}