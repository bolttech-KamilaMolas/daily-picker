// ALFinator — Daily Standup Picker for ALF Team
// Auto-fetches Excel from GitHub repo, shared history via Firebase

(function () {
    'use strict';

    // --- FIREBASE CONFIG ---
    const firebaseConfig = {
        apiKey: "AIzaSyD4-D3dN22UlqKc8-PLfdwQl83vmbdbh4s",
        authDomain: "alfinator.firebaseapp.com",
        databaseURL: "https://alfinator-default-rtdb.europe-west1.firebasedatabase.app",
        projectId: "alfinator",
        storageBucket: "alfinator.firebasestorage.app",
        messagingSenderId: "476621019100",
        appId: "1:476621019100:web:d4929e269c4abdf694e119"
    };

    firebase.initializeApp(firebaseConfig);
    const db = firebase.database();

    // --- CONFIG ---
    const EXCEL_URL = 'https://bolttech-kamilamolas.github.io/daily-picker/data/capacity.xlsx';

    const EXCLUDED_MEMBERS = [
        'Kamila Molas',
        'Adrian Słabicki',
        'Szymon Bartnik'
    ];

    // --- STATE ---
    let teamData = [];
    let weekColumns = [];
    let currentWeek = null;
    let disabledMembers = new Set();
    let weekHistory = []; // shared via Firebase

    // --- DOM REFS ---
    const loadingSection = document.getElementById('loadingSection');
    const errorSection = document.getElementById('errorSection');
    const retryBtn = document.getElementById('retryBtn');
    const pickerSection = document.getElementById('pickerSection');
    const todayLabel = document.getElementById('todayLabel');
    const membersList = document.getElementById('membersList');
    const pickBtn = document.getElementById('pickBtn');
    const resultSection = document.getElementById('resultSection');
    const resultName = document.getElementById('resultName');
    const rerollBtn = document.getElementById('rerollBtn');
    const historySection = document.getElementById('historySection');
    const historyList = document.getElementById('historyList');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');

    // --- FIREBASE HISTORY ---
    function getWeekKey() {
        // History persists until all members are picked (not weekly reset)
        // Use current week as namespace only for grouping
        return (currentWeek || 'unknown').replace(/[.#$/\[\]]/g, '_');
    }

    function getHistoryRef() {
        return db.ref('history/current');
    }

    function listenToHistory() {
        getHistoryRef().on('value', (snapshot) => {
            const data = snapshot.val();
            weekHistory = data ? Object.values(data) : [];
            renderMembers();
            renderHistory();
        });
    }

    function stopListeningHistory() {
        getHistoryRef().off();
    }

    function addToHistory(name) {
        const entry = {
            name: name,
            date: new Date().toLocaleDateString('pl-PL', {
                weekday: 'long', day: 'numeric', month: 'long'
            }),
            timestamp: new Date().toISOString()
        };
        getHistoryRef().push(entry);
    }

    function clearWeekHistory() {
        getHistoryRef().remove();
        resultSection.classList.add('hidden');
    }

    function getWeekHistory() {
        return weekHistory;
    }

    // --- FETCH EXCEL FROM REPO ---
    async function fetchExcelFromRepo() {
        try {
            const response = await fetch(EXCEL_URL + '?t=' + Date.now());
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const arrayBuffer = await response.arrayBuffer();
            parseExcelBuffer(arrayBuffer);
        } catch (err) {
            console.error('Failed to fetch Excel:', err);
            loadingSection.classList.add('hidden');
            errorSection.classList.remove('hidden');
        }
    }

    // --- EXCEL PARSING ---
    function parseExcelBuffer(arrayBuffer) {
        try {
            const data = new Uint8Array(arrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });

            const sheetName = workbook.SheetNames.find(
                n => n.toLowerCase().includes('capacity')
            ) || workbook.SheetNames[0];

            const sheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

            processSheetData(json);
        } catch (err) {
            alert('Błąd parsowania pliku: ' + err.message);
            console.error(err);
            loadingSection.classList.add('hidden');
            errorSection.classList.remove('hidden');
        }
    }

    function processSheetData(rows) {
        let headerRowIndex = -1;
        let nameCol = -1, surnameCol = -1, fullNameCol = -1, teamCol = -1;

        for (let i = 0; i < Math.min(rows.length, 20); i++) {
            const row = rows[i].map(c => String(c).trim().toUpperCase());
            const ni = row.indexOf('NAME');
            const si = row.indexOf('SURNAME');
            const ti = row.findIndex(c => c === 'TEAM');

            if (ni !== -1 && si !== -1 && ti !== -1) {
                headerRowIndex = i;
                nameCol = ni;
                surnameCol = si;
                teamCol = ti;
                fullNameCol = row.indexOf('FULL NAME');
                break;
            }
        }

        if (headerRowIndex === -1) {
            loadingSection.classList.add('hidden');
            errorSection.classList.remove('hidden');
            return;
        }

        const headerRow = rows[headerRowIndex];
        weekColumns = [];

        const dateColIndex = headerRow.findIndex(
            c => String(c).trim().toUpperCase() === 'DATE'
        );
        const startCol = dateColIndex !== -1 ? dateColIndex + 1 : teamCol + 1;

        for (let c = startCol; c < headerRow.length; c++) {
            const val = headerRow[c];
            if (val !== '' && val !== undefined && val !== null) {
                let label = '';
                if (typeof val === 'number' && val > 40000) {
                    const date = excelDateToJS(val);
                    label = formatDateLabel(date);
                } else {
                    label = String(val).trim();
                }
                if (label) weekColumns.push({ label, colIndex: c });
            }
        }

        teamData = [];
        for (let i = headerRowIndex + 1; i < rows.length; i++) {
            const row = rows[i];
            const name = String(row[nameCol] || '').trim();
            const surname = String(row[surnameCol] || '').trim();
            const team = String(row[teamCol] || '').trim().toUpperCase();

            if (!name || !team) continue;
            if (team !== 'ALF') continue;

            const fullName = fullNameCol !== -1
                ? String(row[fullNameCol] || '').trim() || `${name} ${surname}`
                : `${name} ${surname}`;

            const isExcluded = EXCLUDED_MEMBERS.some(
                ex => fullName.toLowerCase() === ex.toLowerCase()
            );
            if (isExcluded) continue;

            const weeks = {};
            weekColumns.forEach(wc => {
                weeks[wc.label] = parseAvailability(row[wc.colIndex]);
            });

            teamData.push({ name, surname, fullName, team, weeks });
        }

        if (teamData.length === 0) {
            loadingSection.classList.add('hidden');
            errorSection.classList.remove('hidden');
            return;
        }

        showPickerSection();
    }

    function parseAvailability(cellValue) {
        if (cellValue === null || cellValue === undefined || cellValue === '') return 0;
        const str = String(cellValue).trim();
        if (str.endsWith('%')) return parseFloat(str) / 100;
        const num = parseFloat(str);
        if (!isNaN(num)) return num > 1 ? num / 100 : num;
        return 0;
    }

    function excelDateToJS(serial) {
        const utcDays = Math.floor(serial - 25569);
        return new Date(utcDays * 86400 * 1000);
    }

    function formatDateLabel(date) {
        const day = date.getDate();
        const months = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze',
            'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
        return `${day} ${months[date.getMonth()]}`;
    }

    // --- WEEK DETECTION ---
    function findCurrentWeek() {
        const today = new Date();
        let bestMatch = weekColumns.length - 1;

        for (let i = 0; i < weekColumns.length; i++) {
            const weekDate = parseDateLabel(weekColumns[i].label);
            if (weekDate) {
                const nextWeekDate = i + 1 < weekColumns.length
                    ? parseDateLabel(weekColumns[i + 1].label)
                    : new Date(9999, 0, 1);
                if (today >= weekDate && today < nextWeekDate) {
                    bestMatch = i;
                    break;
                }
            }
        }
        return bestMatch;
    }

    function parseDateLabel(label) {
        const months = { 'sty': 0, 'lut': 1, 'mar': 2, 'kwi': 3, 'maj': 4, 'cze': 5,
            'lip': 6, 'sie': 7, 'wrz': 8, 'paź': 9, 'lis': 10, 'gru': 11 };
        const parts = label.toLowerCase().split(/\s+/);
        if (parts.length >= 2) {
            const day = parseInt(parts[0]);
            const month = months[parts[1]];
            if (!isNaN(day) && month !== undefined) {
                return new Date(new Date().getFullYear(), month, day);
            }
        }
        return null;
    }

    // --- UI ---
    function showPickerSection() {
        loadingSection.classList.add('hidden');
        errorSection.classList.add('hidden');
        pickerSection.classList.remove('hidden');
        historySection.classList.remove('hidden');

        const currentIdx = findCurrentWeek();
        currentWeek = weekColumns[currentIdx]?.label;

        const today = new Date();
        const dayOfWeek = today.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            todayLabel.innerHTML = '📅 <strong>Weekend</strong> — losowanie dostępne w dni robocze';
            pickBtn.disabled = true;
            pickBtn.textContent = '🏖️ Weekend';
        } else {
            const dateStr = today.toLocaleDateString('pl-PL', {
                weekday: 'long', day: 'numeric', month: 'long'
            });
            todayLabel.innerHTML = `📅 Dziś: <strong>${dateStr}</strong>`;
        }

        loadDisabledMembers();
        listenToHistory(); // Start Firebase real-time listener
    }

    function renderMembers() {
        membersList.innerHTML = '';
        const usedNames = weekHistory.map(h => h.name);
        const membersForWeek = getMembersForWeek();

        if (membersForWeek.length === 0) {
            membersList.innerHTML = '<p class="empty-state">Brak osób w tym tygodniu</p>';
            pickBtn.disabled = true;
            return;
        }

        membersForWeek.forEach(member => {
            const isUsed = usedNames.includes(member.fullName);
            const isDisabled = disabledMembers.has(member.fullName);

            const label = document.createElement('label');
            label.className = 'member-toggle';
            if (isDisabled) label.classList.add('unchecked');
            else if (isUsed) label.classList.add('used');

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = !isDisabled;
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    disabledMembers.delete(member.fullName);
                } else {
                    disabledMembers.add(member.fullName);
                }
                saveDisabledMembers();
                renderMembers();
            });

            const text = document.createTextNode(
                member.fullName + (isUsed && !isDisabled ? ' ✓' : '')
            );

            label.appendChild(checkbox);
            label.appendChild(text);
            membersList.appendChild(label);
        });

        const today = new Date();
        const dayOfWeek = today.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) return; // weekend block stays

        const eligible = getEligibleMembers();
        if (eligible.length === 0) {
            pickBtn.disabled = true;
            pickBtn.textContent = '✅ Wszyscy już prowadzili!';
        } else {
            pickBtn.disabled = false;
            pickBtn.innerHTML = '<span class="btn-icon">🎲</span> Losuj!';
        }
    }

    function getMembersForWeek() {
        if (!currentWeek) return [];
        return teamData.filter(m => {
            const availability = m.weeks[currentWeek];
            return availability && availability > 0;
        });
    }

    function getAvailableMembers() {
        return getMembersForWeek().filter(m => !disabledMembers.has(m.fullName));
    }

    function getEligibleMembers() {
        const available = getAvailableMembers();
        const usedNames = weekHistory.map(h => h.name);
        return available.filter(m => !usedNames.includes(m.fullName));
    }

    // --- DISABLED MEMBERS (localStorage - resets daily) ---
    function getDisabledKey() {
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        return `alfinator-disabled-${today}`;
    }

    function loadDisabledMembers() {
        try {
            // Clean up old days
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('alfinator-disabled-') && key !== getDisabledKey()) {
                    localStorage.removeItem(key);
                }
            }
            const stored = localStorage.getItem(getDisabledKey());
            disabledMembers = stored ? new Set(JSON.parse(stored)) : new Set();
        } catch {
            disabledMembers = new Set();
        }
    }

    function saveDisabledMembers() {
        localStorage.setItem(getDisabledKey(), JSON.stringify([...disabledMembers]));
    }

    // --- RANDOM PICK ---
    function pickRandom() {
        const eligible = getEligibleMembers();
        if (eligible.length === 0) return null;
        return eligible[Math.floor(Math.random() * eligible.length)];
    }

    function animatePick(callback) {
        pickerSection.classList.add('picking');
        resultSection.classList.remove('hidden');
        resultName.textContent = '...';

        const eligible = getEligibleMembers();
        let count = 0;
        const interval = setInterval(() => {
            resultName.textContent = eligible[Math.floor(Math.random() * eligible.length)].fullName;
            count++;
            if (count >= 15) {
                clearInterval(interval);
                pickerSection.classList.remove('picking');
                callback();
            }
        }, 100);
    }

    function doPick() {
        const picked = pickRandom();
        if (!picked) {
            alert('Brak dostępnych osób do wylosowania!');
            return;
        }
        animatePick(() => {
            resultName.textContent = picked.fullName;
            addToHistory(picked.fullName); // saves to Firebase

            // Check if all available members have been picked — auto-reset
            setTimeout(() => {
                const available = getAvailableMembers();
                const usedNames = weekHistory.map(h => h.name);
                const remaining = available.filter(m => !usedNames.includes(m.fullName));
                if (remaining.length === 0 && available.length > 0) {
                    // All picked — auto clear for next round
                    setTimeout(() => {
                        clearWeekHistory();
                    }, 3000); // wait 3s so users see the last pick
                }
            }, 500);
        });
    }

    function renderHistory() {
        if (weekHistory.length === 0) {
            historyList.innerHTML = '<p class="empty-state">Nikt jeszcze nie losował w tym tygodniu</p>';
            return;
        }
        historyList.innerHTML = weekHistory.map((h, idx) => `
            <div class="history-item">
                <span class="name">${idx + 1}. ${h.name}</span>
                <span class="date">${h.date}</span>
            </div>
        `).join('');
    }

    // --- EVENTS ---
    pickBtn.addEventListener('click', doPick);

    rerollBtn.addEventListener('click', () => {
        // Remove last entry from Firebase
        getHistoryRef().limitToLast(1).once('value', (snapshot) => {
            snapshot.forEach(child => child.ref.remove());
        });
        doPick();
    });

    clearHistoryBtn.addEventListener('click', () => {
        if (confirm('Wyczyścić historię tego tygodnia? (dla wszystkich!)')) {
            clearWeekHistory();
        }
    });

    retryBtn.addEventListener('click', () => {
        errorSection.classList.add('hidden');
        loadingSection.classList.remove('hidden');
        fetchExcelFromRepo();
    });

    // --- INIT ---
    fetchExcelFromRepo();

})();