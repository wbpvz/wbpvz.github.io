document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('stats-container')) {
        initBoxStatsPage();
    }
});

function initBoxStatsPage () {
    let allDeliveries = {};
    let activeFilters = { period: 'all' };
    let pendingFilters = { ...activeFilters };

    function getMoscowDateString(date = new Date()) {
        const moscowOffset = 3 * 60;
        const localOffset = -date.getTimezoneOffset();
        const moscowTime = new Date(date.getTime() + (moscowOffset - localOffset) * 60000);
        return moscowTime.toISOString().split('T')[0];
    }
    
    function generateOrGetDeliveries() {
        let userData = getUserData();
        allDeliveries = userData.deliveryHistory || {};
        const todayStr = getMoscowDateString();

        if (!allDeliveries[todayStr]) {
            allDeliveries[todayStr] = [];
            
            // Night delivery
            allDeliveries[todayStr].push(createDelivery("Ночная"));

            // Day delivery
            allDeliveries[todayStr].push(createDelivery("Дневная"));
            
            // Rare second night delivery
            if (Math.random() < 0.2) {
                allDeliveries[todayStr].push(createDelivery("Ночная (доп.)"));
            }

            userData.deliveryHistory = allDeliveries;
            saveUserData(userData);
        }
    }
    
    function createDelivery(name) {
        let boxes;
        if (Math.random() < 0.75) {
            boxes = 10 + Math.floor(Math.random() * 16);
        } else {
            boxes = Math.floor(Math.random() * 51);
        }
        const minSkuPerBox = 5;
        const maxSkuPerBox = 15;
        const estimatedSKU = boxes * (minSkuPerBox + Math.floor(Math.random() * (maxSkuPerBox - minSkuPerBox + 1)));

        return {
            name: name,
            plannedBoxes: boxes,
            estimatedSKU: estimatedSKU,
            acceptedSKU: Math.floor(estimatedSKU * (0.95 + Math.random() * 0.1)) // Simulate actual accepted count
        };
    }


    function applyAndRender() {
        activeFilters = { ...pendingFilters };
        const container = document.getElementById('stats-container');
        container.innerHTML = '';
        
        let sortedDates = Object.keys(allDeliveries).sort((a, b) => new Date(b) - new Date(a));
        const { period } = activeFilters;

        if (period && period !== 'all') {
            const now = new Date();
            let startDate = new Date();
            if (period === 'week') startDate.setDate(now.getDate() - 7);
            else if (period === 'month') startDate.setMonth(now.getMonth() - 1);
            else if (period === '3month') startDate.setMonth(now.getMonth() - 3);
            sortedDates = sortedDates.filter(dateStr => new Date(dateStr) >= startDate);
        }

        if(sortedDates.length === 0) {
            container.innerHTML = `<div class="empty-message">Нет данных за выбранный период</div>`;
            return;
        }

        sortedDates.forEach(dateStr => {
            const deliveriesForDay = allDeliveries[dateStr];
            
            const dayGroup = document.createElement('div');
            dayGroup.className = 'delivery-day-group';

            const displayDate = new Date(dateStr);
            const userFriendlyDate = new Date(displayDate.getTime() + displayDate.getTimezoneOffset() * 60000).toLocaleDateString('ru-RU');

            let totalBoxes = 0;
            let totalSKU = 0;
            let deliveryInstancesHtml = '';

            deliveriesForDay.forEach(delivery => {
                totalBoxes += delivery.plannedBoxes;
                totalSKU += delivery.acceptedSKU;
                deliveryInstancesHtml += `
                    <div class="delivery-instance">
                        <h4><i class="fas fa-shipping-fast"></i> ${delivery.name}</h4>
                        <div class="stat-row">
                            <span>Коробок:</span>
                            <span class="stat-value">${delivery.plannedBoxes}</span>
                        </div>
                        <div class="stat-row">
                            <span>ШК (примерно):</span>
                            <span class="stat-value">~${delivery.estimatedSKU}</span>
                        </div>
                        <div class="stat-row">
                            <span>Принято ШК (точно):</span>
                            <span class="stat-value">${delivery.acceptedSKU}</span>
                        </div>
                    </div>
                `;
            });
            
            dayGroup.innerHTML = `
                <h2><i class="fas fa-calendar-day"></i> Поставки за ${userFriendlyDate}</h2>
                <div class="delivery-instances-container">
                    ${deliveryInstancesHtml}
                </div>
                <div class="delivery-day-summary">
                    <span>Итого за день:</span>
                    <span>Коробок: <strong>${totalBoxes}</strong></span>
                    <span>Принято ШК: <strong>${totalSKU}</strong></span>
                </div>
            `;
            container.appendChild(dayGroup);
        });
        renderActiveFilterPills();
    }
    
    function renderActiveFilterPills() {
        const container = document.getElementById('active-filters-container');
        container.innerHTML = '';
        const { period } = activeFilters;
        let pillText = '';

        if (period) {
            pillText = {
                'all': 'Все', 'week': 'За неделю', 'month': 'За месяц', '3month': 'За 3 месяца'
            }[period];
        }
        if(pillText) container.innerHTML = `<div class="filter-pill">${pillText}</div>`;
    }

    function updateModalView() {
        document.querySelectorAll('#filter-modal .secondary-btn[data-period]').forEach(b => b.classList.remove('selected'));
        if (pendingFilters.period) {
            document.querySelector(`#filter-modal [data-period="${pendingFilters.period}"]`)?.classList.add('selected');
        }
    }

    document.getElementById('open-filter-modal-btn').addEventListener('click', () => {
        pendingFilters = { ...activeFilters };
        updateModalView();
        toggleModal('filter-modal', true);
    });
    
    document.querySelectorAll('#filter-modal [data-period]').forEach(btn => {
        btn.addEventListener('click', () => {
            pendingFilters.period = btn.dataset.period;
            updateModalView();
        });
    });

    document.getElementById('apply-filters-btn').addEventListener('click', () => {
        applyAndRender();
        toggleModal('filter-modal', false);
    });
    
    document.getElementById('clear-filters-btn').addEventListener('click', () => {
        pendingFilters = { period: 'all' };
        updateModalView();
    });

    generateOrGetDeliveries();
    applyAndRender();
}
