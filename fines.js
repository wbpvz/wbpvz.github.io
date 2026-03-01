function initFinesPage () {
    const finesData = [
        { type: 'Некорректная утилизация', description: 'Картонные коробки не были сложены согласно инструкции, что привело к задержке вывоза.', min: 15, max: 30 },
        { type: 'Нарушение графика работы', description: 'Пункт выдачи был открыт на 15 минут позже установленного графика без уважительной причины.', min: 50, max: 75 },
        { type: 'Жалоба клиента', description: 'Зафиксирована и подтверждена жалоба клиента на медленное обслуживание.', min: 20, max: 40 },
        { type: 'Потеря товара на складе', description: 'Товар не был найден в ячейке во время выдачи заказа, что привело к отмене.', min: 100, max: 150 },
        { type: 'Низкий рейтинг', description: 'Средний рейтинг ПВЗ за неделю опустился ниже порогового значения 4.8.', min: 40, max: 60 }
    ];

    function maybeGenerateFine() {
        const userData = getUserData();
        // Убедимся, что userData.data существует
        if (!userData) userData = {}; 
        
        const lastFineDate = userData.lastFineCheckDate;
        const today = new Date().toISOString().split('T')[0];

        if (lastFineDate === today) return; // Проверяем только раз в день

        userData.lastFineCheckDate = today;
        
        if (Math.random() > 0.85) { // 15% шанс на штраф в день
            const fineTemplate = finesData[Math.floor(Math.random() * finesData.length)];
            const amount = Math.floor(Math.random() * (fineTemplate.max - fineTemplate.min + 1) + fineTemplate.min);
            
            const newFine = {
                id: Date.now(),
                type: fineTemplate.type,
                description: fineTemplate.description,
                amount: amount,
                date: new Date().toISOString(),
                status: 'active'
            };

            if (!userData.fines) userData.fines = [];
            userData.fines.unshift(newFine);
            showAlert(`Выписан новый штраф: ${newFine.type}`, true);
        }
        saveUserData(userData);
    }

    function renderFines() {
        const userData = getUserData();
        const fines = userData.fines || [];
        const activeContainer = document.getElementById('active-fines-container');
        const paidContainer = document.getElementById('paid-fines-container');
        
        activeContainer.innerHTML = '';
        paidContainer.innerHTML = '';

        const activeFines = fines.filter(f => f.status === 'active');
        const paidFines = fines.filter(f => f.status === 'paid');

        if (activeFines.length === 0) {
            activeContainer.innerHTML = `<div class="empty-message"><i class="fas fa-check-circle"></i><div>Активных штрафов нет</div></div>`;
        } else {
            activeFines.forEach(fine => activeContainer.appendChild(createFineCard(fine)));
        }
        
        if (paidFines.length === 0) {
            paidContainer.innerHTML = `<div class="empty-message"><i class="fas fa-history"></i><div>Нет погашенных штрафов</div></div>`;
        } else {
            paidFines.forEach(fine => paidContainer.appendChild(createFineCard(fine)));
        }

        attachPayButtonListeners();
    }

    function createFineCard(fine) {
        const card = document.createElement('div');
        card.className = `fine-card ${fine.status}`;
        
        const payButtonHTML = fine.status === 'active' 
            ? `<button class="primary-btn pay-fine-btn" data-fine-id="${fine.id}"><i class="fas fa-wallet"></i> Оплатить</button>`
            : `<span>Оплачено ${new Date(fine.paidDate).toLocaleDateString('ru-RU')}</span>`;

        card.innerHTML = `
            <div class="fine-header">
                <span class="fine-type">${fine.type}</span>
                <span class="fine-amount">${fine.amount.toFixed(2)} BYN</span>
            </div>
            <p class="fine-description">${fine.description}</p>
            <div class="fine-footer">
                <span class="fine-date">Выписан: ${new Date(fine.date).toLocaleDateString('ru-RU')}</span>
                ${payButtonHTML}
            </div>
        `;
        return card;
    }

    function attachPayButtonListeners() {
        document.querySelectorAll('.pay-fine-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const fineId = parseInt(e.currentTarget.dataset.fineId, 10);
                const btnRef = e.currentTarget;

                btnRef.disabled = true;
                btnRef.innerHTML = `<div class="button-spinner"></div> <span>Оплата...</span>`;

                setTimeout(() => {
                    let userData = getUserData();
                    const fineIndex = (userData.fines || []).findIndex(f => f.id === fineId);
                    
                    if (fineIndex > -1) {
                        userData.fines[fineIndex].status = 'paid';
                        userData.fines[fineIndex].paidDate = new Date().toISOString();
                        saveUserData(userData);
                        showAlert('Штраф успешно оплачен', false);
                        renderFines();
                    }
                }, 1500);
            });
        });
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelector('.tab-btn.active').classList.remove('active');
            btn.classList.add('active');
            
            const activeTab = btn.dataset.tab;
            document.getElementById('active-fines-container').style.display = activeTab === 'active' ? 'block' : 'none';
            document.getElementById('paid-fines-container').style.display = activeTab === 'paid' ? 'block' : 'none';
        });
    });

    // Инициализация
    maybeGenerateFine();
    renderFines();
}