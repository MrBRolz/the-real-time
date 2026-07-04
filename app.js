// TempoTrack Client-side Application Logic

// ==========================================
// 1. STATE & GLOBAL CONFIGURATION
// ==========================================
let state = {
  records: [],
  activeTimer: null,
  theme: 'dark',
  activeView: 'dashboard',
  filters: {
    month: 'all',
    year: new Date().getFullYear()
  },
  analyticsYear: new Date().getFullYear(),
  
  // Cloud Sync state
  syncPassphrase: null,
  syncLastTime: null,
  isSyncing: false,
  syncError: null
};

let timerInterval = null;
let hoursChartInstance = null;
let syncInterval = null;

// ==========================================
// 2. LIFECYCLE & INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  setupEventListeners();
  render();
});

// Load records, active timer, theme from localStorage
function initApp() {
  // Load Theme
  const savedTheme = localStorage.getItem('tempotrack_theme');
  if (savedTheme) {
    state.theme = savedTheme;
  } else {
    // Detect system preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    state.theme = prefersDark ? 'dark' : 'light';
  }
  applyTheme();

  // Load Records
  const savedRecords = localStorage.getItem('tempotrack_records');
  if (savedRecords) {
    try {
      state.records = JSON.parse(savedRecords);
    } catch (e) {
      console.error('Failed to parse records', e);
      state.records = [];
    }
  } else {
    // Start with empty records list instead of mock data
    state.records = [];
    saveRecordsToStorage();
  }

  // Load Active Timer
  const savedTimer = localStorage.getItem('tempotrack_timer');
  if (savedTimer) {
    try {
      state.activeTimer = JSON.parse(savedTimer);
      
      // Migrate legacy activeTimer schema if needed
      if (state.activeTimer && typeof state.activeTimer.accumulatedMs === 'undefined') {
        state.activeTimer.accumulatedMs = 0;
        state.activeTimer.isPaused = false;
      }
      
      resumeActiveTimer();
    } catch (e) {
      console.error('Failed to parse active timer', e);
      state.activeTimer = null;
    }
  }

  // Set default manual log date to today in quick manual form
  const todayStr = getLocalDateString(new Date());
  const manualDateInput = document.getElementById('manualDate');
  if (manualDateInput) {
    manualDateInput.value = todayStr;
  }

  // Setup segment toggles for time-entry mode selection
  setupSegmentToggles('quickManualForm', 'manualTimeRow', 'manualHoursRow', 'manualStart', 'manualEnd', 'manualHoursInput');
  setupSegmentToggles('modalManualForm', 'modalManualTimeRow', 'modalManualHoursRow', 'modalManualStart', 'modalManualEnd', 'modalManualHoursInput');

  // Render recent notes chips
  updateRecentChips();

  // Initialize Lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Populate Filter Dropdowns
  populateFilterYears();

  // Load Cloud Sync settings
  const savedSyncId = localStorage.getItem('tempotrack_sync_passphrase');
  if (savedSyncId) {
    state.syncPassphrase = savedSyncId;
    
    // Initial sync
    syncWithCloud();
    
    // Set 60-second periodic auto-sync
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(syncWithCloud, 60000);
  } else {
    updateSyncUI();
  }
}

// Save records helper
function saveRecordsToStorage() {
  localStorage.setItem('tempotrack_records', JSON.stringify(state.records));
  
  // Push changes to cloud if sync is enabled
  pushToCloud();
}

// ==========================================
// 3. THEME MANAGEMENT
// ==========================================
function applyTheme() {
  const body = document.body;
  const themeToggleIcon = document.getElementById('themeIcon');
  const mobileThemeToggleIcon = document.querySelector('#mobileThemeToggleBtn i');
  const themeText = document.getElementById('themeText');

  if (state.theme === 'light') {
    body.classList.add('light-theme');
    
    if (themeToggleIcon) themeToggleIcon.setAttribute('data-lucide', 'moon');
    if (mobileThemeToggleIcon) mobileThemeToggleIcon.setAttribute('data-lucide', 'moon');
    if (themeText) themeText.textContent = 'Dark Mode';
  } else {
    body.classList.remove('light-theme');
    
    if (themeToggleIcon) themeToggleIcon.setAttribute('data-lucide', 'sun');
    if (mobileThemeToggleIcon) mobileThemeToggleIcon.setAttribute('data-lucide', 'sun');
    if (themeText) themeText.textContent = 'Light Mode';
  }

  // Refresh icons
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('tempotrack_theme', state.theme);
  applyTheme();
  
  // Re-render chart if it exists because grid lines / text colors change with themes
  if (state.activeView === 'analytics') {
    renderChart();
  }
}

// ==========================================
// 4. TIMER / CHECK-IN / CHECK-OUT LOGIC
// ==========================================
function startTimer() {
  if (state.activeTimer) return;

  const noteInput = document.getElementById('timerNote');
  const noteText = noteInput ? noteInput.value.trim() : '';

  state.activeTimer = {
    startTime: Date.now(),
    accumulatedMs: 0,
    isPaused: false,
    note: noteText
  };

  localStorage.setItem('tempotrack_timer', JSON.stringify(state.activeTimer));
  resumeActiveTimer();
  showToast('Checked in! Timer started.', 'success');
}

function resumeActiveTimer() {
  const startBtn = document.getElementById('startTimerBtn');
  const pauseBtn = document.getElementById('pauseTimerBtn');
  const resumeBtn = document.getElementById('resumeTimerBtn');
  const stopBtn = document.getElementById('stopTimerBtn');
  const noteInput = document.getElementById('timerNote');
  const clock = document.getElementById('timerClock');

  if (!state.activeTimer) return;

  // Lock notes while timer is active
  if (noteInput) {
    noteInput.value = state.activeTimer.note || '';
    noteInput.disabled = true;
  }

  // Set up button displays based on running/paused state
  if (startBtn) startBtn.style.display = 'none';
  if (stopBtn) stopBtn.style.display = 'flex';

  if (state.activeTimer.isPaused) {
    if (pauseBtn) pauseBtn.style.display = 'none';
    if (resumeBtn) resumeBtn.style.display = 'flex';
    if (clock) clock.classList.remove('running');
    
    // Static clock update
    updateTimerClock();
  } else {
    if (pauseBtn) pauseBtn.style.display = 'flex';
    if (resumeBtn) resumeBtn.style.display = 'none';
    if (clock) clock.classList.add('running');

    // Clear existing interval just in case
    if (timerInterval) clearInterval(timerInterval);

    // Update clock tick immediately and run interval
    updateTimerClock();
    timerInterval = setInterval(updateTimerClock, 1000);
  }
}

function pauseTimer() {
  if (!state.activeTimer || state.activeTimer.isPaused) return;

  // Stop ticking
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  // Accumulate running time
  const additionalElapsed = Date.now() - state.activeTimer.startTime;
  state.activeTimer.accumulatedMs += additionalElapsed;
  state.activeTimer.isPaused = true;

  // Save state
  localStorage.setItem('tempotrack_timer', JSON.stringify(state.activeTimer));

  // Toggle UI
  const pauseBtn = document.getElementById('pauseTimerBtn');
  const resumeBtn = document.getElementById('resumeTimerBtn');
  const clock = document.getElementById('timerClock');

  if (pauseBtn) pauseBtn.style.display = 'none';
  if (resumeBtn) resumeBtn.style.display = 'flex';
  if (clock) clock.classList.remove('running');

  updateTimerClock();
  showToast('Timer paused.', 'success');
}

function resumeTimer() {
  if (!state.activeTimer || !state.activeTimer.isPaused) return;

  // Reset starting point
  state.activeTimer.startTime = Date.now();
  state.activeTimer.isPaused = false;

  // Save state
  localStorage.setItem('tempotrack_timer', JSON.stringify(state.activeTimer));

  // Toggle UI
  const pauseBtn = document.getElementById('pauseTimerBtn');
  const resumeBtn = document.getElementById('resumeTimerBtn');
  const clock = document.getElementById('timerClock');

  if (pauseBtn) pauseBtn.style.display = 'flex';
  if (resumeBtn) resumeBtn.style.display = 'none';
  if (clock) clock.classList.add('running');

  // Start ticking
  if (timerInterval) clearInterval(timerInterval);
  updateTimerClock();
  timerInterval = setInterval(updateTimerClock, 1000);

  showToast('Timer resumed.', 'success');
}

function updateTimerClock() {
  const clock = document.getElementById('timerClock');
  if (!state.activeTimer || !clock) return;

  let elapsedMs = state.activeTimer.accumulatedMs;
  if (!state.activeTimer.isPaused) {
    elapsedMs += (Date.now() - state.activeTimer.startTime);
  }
  
  const secs = Math.floor((elapsedMs / 1000) % 60);
  const mins = Math.floor((elapsedMs / (1000 * 60)) % 60);
  const hours = Math.floor(elapsedMs / (1000 * 60 * 60));

  const format = (val) => String(val).padStart(2, '0');
  clock.textContent = `${format(hours)}:${format(mins)}:${format(secs)}`;
}

function stopTimer() {
  if (!state.activeTimer) return;

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  // Calculate final duration
  let elapsedMs = state.activeTimer.accumulatedMs;
  if (!state.activeTimer.isPaused) {
    elapsedMs += (Date.now() - state.activeTimer.startTime);
  }

  const totalHours = Math.max(0.01, parseFloat((elapsedMs / (1000 * 60 * 60)).toFixed(2)));

  const startDate = new Date(Date.now() - elapsedMs);
  const endDate = new Date();

  const newRecord = {
    id: 'rec_' + Date.now() + Math.random().toString(36).substr(2, 5),
    date: getLocalDateString(startDate),
    startTime: getLocalTimeString(startDate),
    endTime: getLocalTimeString(endDate),
    totalHours: totalHours,
    note: state.activeTimer.note || 'Timer session log',
    method: 'Timer'
  };

  // Add record
  state.records.unshift(newRecord);
  saveRecordsToStorage();

  // Clear Active Timer
  state.activeTimer = null;
  localStorage.removeItem('tempotrack_timer');

  // Reset UI
  const startBtn = document.getElementById('startTimerBtn');
  const pauseBtn = document.getElementById('pauseTimerBtn');
  const resumeBtn = document.getElementById('resumeTimerBtn');
  const stopBtn = document.getElementById('stopTimerBtn');
  const noteInput = document.getElementById('timerNote');
  const clock = document.getElementById('timerClock');

  if (startBtn) startBtn.style.display = 'flex';
  if (pauseBtn) pauseBtn.style.display = 'none';
  if (resumeBtn) resumeBtn.style.display = 'none';
  if (stopBtn) stopBtn.style.display = 'none';
  
  if (noteInput) {
    noteInput.value = '';
    noteInput.disabled = false;
  }
  if (clock) {
    clock.classList.remove('running');
    clock.textContent = '00:00:00';
  }

  // Refresh
  showToast('Checked out! Time log saved.', 'success');
  updateRecentChips();
  populateFilterYears();
  render();
}

// ==========================================
// 5. VIEW NAVIGATION
// ==========================================
function switchView(viewName) {
  state.activeView = viewName;

  // Toggle active views
  document.querySelectorAll('.view-section').forEach(section => {
    section.classList.remove('active');
  });
  
  const activeSection = document.getElementById(`${viewName}-view`);
  if (activeSection) {
    activeSection.classList.add('active');
  }

  // Toggle nav links active states
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('data-view') === viewName) {
      link.classList.add('active');
    }
  });

  // Mobile sidebar auto-close
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar && sidebar.classList.contains('open')) {
    sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('show');
  }

  // Trigger page specific renders
  render();
}

// ==========================================
// 6. RECORD OPERATIONS (ADD, EDIT, DELETE)
// ==========================================

// Validate overlapping and time ranges
function validateTimeRange(startStr, endStr) {
  const [startH, startM] = startStr.split(':').map(Number);
  const [endH, endM] = endStr.split(':').map(Number);
  
  const startVal = startH * 60 + startM;
  const endVal = endH * 60 + endM;

  return endVal > startVal;
}

// Calculate hours duration from HH:MM strings
function calculateHoursDuration(startStr, endStr) {
  const [startH, startM] = startStr.split(':').map(Number);
  const [endH, endM] = endStr.split(':').map(Number);
  
  const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);
  return parseFloat((durationMinutes / 60).toFixed(2));
}

// Segment toggle helper
function setupSegmentToggles(formId, timeRowId, hoursRowId, startId, endId, hoursInputId) {
  const form = document.getElementById(formId);
  if (!form) return;

  const rangeBtn = form.querySelector('.segment-toggle button:first-child');
  const hoursBtn = form.querySelector('.segment-toggle button:last-child');
  const timeRow = document.getElementById(timeRowId);
  const hoursRow = document.getElementById(hoursRowId);
  const startInput = document.getElementById(startId);
  const endInput = document.getElementById(endId);
  const hoursInput = document.getElementById(hoursInputId);

  if (!rangeBtn || !hoursBtn || !timeRow || !hoursRow || !startInput || !endInput || !hoursInput) return;

  rangeBtn.addEventListener('click', () => {
    rangeBtn.classList.add('active');
    hoursBtn.classList.remove('active');
    timeRow.style.display = 'grid';
    hoursRow.style.display = 'none';

    // Toggle requirements
    startInput.required = true;
    endInput.required = true;
    hoursInput.required = false;
  });

  hoursBtn.addEventListener('click', () => {
    hoursBtn.classList.add('active');
    rangeBtn.classList.remove('active');
    timeRow.style.display = 'none';
    hoursRow.style.display = 'block';

    // Toggle requirements
    startInput.required = false;
    endInput.required = false;
    hoursInput.required = true;
  });
}

// Helper to calculate end time string given start and hours duration
function calculateEndTimeFromHours(startTimeStr, durationHours) {
  const [h, m] = startTimeStr.split(':').map(Number);
  const totalStartMins = h * 60 + m;
  const totalEndMins = Math.round(totalStartMins + durationHours * 60);
  
  const endH = Math.floor(totalEndMins / 60) % 24;
  const endM = totalEndMins % 60;
  
  const format = (val) => String(val).padStart(2, '0');
  return `${format(endH)}:${format(endM)}`;
}

// Manual Time Entry Submit (Dashboard form)
function handleQuickManualSubmit(e) {
  e.preventDefault();

  const dateInput = document.getElementById('manualDate');
  const startInput = document.getElementById('manualStart');
  const endInput = document.getElementById('manualEnd');
  const hoursInput = document.getElementById('manualHoursInput');
  const noteInput = document.getElementById('manualNote');
  const isDirectHours = document.getElementById('toggleHoursBtn').classList.contains('active');

  if (!dateInput || !startInput || !endInput || !hoursInput || !noteInput) return;

  const date = dateInput.value;
  const note = noteInput.value.trim();
  let startTime, endTime, hours;

  if (isDirectHours) {
    hours = parseFloat(hoursInput.value);
    if (isNaN(hours) || hours <= 0 || hours > 24) {
      showToast('Please enter a valid hours duration (0.05 to 24 hrs).', 'error');
      return;
    }
    startTime = '09:00';
    endTime = calculateEndTimeFromHours(startTime, hours);
  } else {
    startTime = startInput.value;
    endTime = endInput.value;
    if (!validateTimeRange(startTime, endTime)) {
      showToast('End time must be after start time! For overnight shifts, log two separate entries.', 'error');
      return;
    }
    hours = calculateHoursDuration(startTime, endTime);
  }

  const newRecord = {
    id: 'rec_' + Date.now() + Math.random().toString(36).substr(2, 5),
    date: date,
    startTime: startTime,
    endTime: endTime,
    totalHours: hours,
    note: note,
    method: 'Manual'
  };

  state.records.unshift(newRecord);
  saveRecordsToStorage();

  // Reset fields
  noteInput.value = '';
  startInput.value = '';
  endInput.value = '';
  hoursInput.value = '';
  dateInput.value = getLocalDateString(new Date());

  showToast('Manual log saved successfully.', 'success');
  updateRecentChips();
  populateFilterYears();
  render();
}

// Manual Time Entry Submit (History Modal form)
function handleModalManualSubmit(e) {
  e.preventDefault();

  const dateInput = document.getElementById('modalManualDate');
  const startInput = document.getElementById('modalManualStart');
  const endInput = document.getElementById('modalManualEnd');
  const hoursInput = document.getElementById('modalManualHoursInput');
  const noteInput = document.getElementById('modalManualNote');
  const isDirectHours = document.getElementById('modalToggleHoursBtn').classList.contains('active');

  if (!dateInput || !startInput || !endInput || !hoursInput || !noteInput) return;

  const date = dateInput.value;
  const note = noteInput.value.trim();
  let startTime, endTime, hours;

  if (isDirectHours) {
    hours = parseFloat(hoursInput.value);
    if (isNaN(hours) || hours <= 0 || hours > 24) {
      showToast('Please enter a valid hours duration (0.05 to 24 hrs).', 'error');
      return;
    }
    startTime = '09:00';
    endTime = calculateEndTimeFromHours(startTime, hours);
  } else {
    startTime = startInput.value;
    endTime = endInput.value;
    if (!validateTimeRange(startTime, endTime)) {
      showToast('End time must be after start time!', 'error');
      return;
    }
    hours = calculateHoursDuration(startTime, endTime);
  }

  const newRecord = {
    id: 'rec_' + Date.now() + Math.random().toString(36).substr(2, 5),
    date: date,
    startTime: startTime,
    endTime: endTime,
    totalHours: hours,
    note: note,
    method: 'Manual'
  };

  state.records.unshift(newRecord);
  saveRecordsToStorage();
  
  closeModal('manualEntryModal');

  // Reset modal form
  document.getElementById('modalManualForm').reset();
  
  // Restore default inputs view in modal
  document.getElementById('modalToggleRangeBtn').click();

  showToast('Log Entry added successfully.', 'success');
  updateRecentChips();
  populateFilterYears();
  render();
}

// Render Recent Note tags
function updateRecentChips() {
  // Extract last unique notes (limit to 4)
  const uniqueNotes = [];
  for (let i = 0; i < state.records.length; i++) {
    const note = state.records[i].note.trim();
    if (note && !uniqueNotes.includes(note) && !note.startsWith('Timer session log') && !note.startsWith('Quick log session')) {
      uniqueNotes.push(note);
    }
    if (uniqueNotes.length >= 4) break;
  }

  const timerChipsContainer = document.getElementById('timer-chips-container');
  const timerChips = document.getElementById('timer-chips');
  const manualChipsContainer = document.getElementById('manual-chips-container');
  const manualChips = document.getElementById('manual-chips');
  const modalChipsContainer = document.getElementById('modal-chips-container');
  const modalChips = document.getElementById('modal-chips');

  const populateContainer = (container, chipsEl, list) => {
    if (!container || !chipsEl) return;
    if (list.length === 0) {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'flex';
    chipsEl.innerHTML = '';
    list.forEach(noteText => {
      const chip = document.createElement('span');
      chip.className = 'note-chip';
      chip.textContent = noteText;
      chip.title = `Click to copy: "${noteText}"`;
      chipsEl.appendChild(chip);
    });
  };

  populateContainer(timerChipsContainer, timerChips, uniqueNotes);
  populateContainer(manualChipsContainer, manualChips, uniqueNotes);
  populateContainer(modalChipsContainer, modalChips, uniqueNotes);

  // Add click handlers to chips
  const bindChipClick = (chipsEl, textareaId) => {
    if (!chipsEl) return;
    chipsEl.querySelectorAll('.note-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const textarea = document.getElementById(textareaId);
        if (textarea) {
          textarea.value = chip.textContent;
          // If active timer notes are being updated, sync the note in state
          if (textareaId === 'timerNote' && state.activeTimer) {
            state.activeTimer.note = chip.textContent;
            localStorage.setItem('tempotrack_timer', JSON.stringify(state.activeTimer));
          }
        }
      });
    });
  };

  bindChipClick(timerChips, 'timerNote');
  bindChipClick(manualChips, 'manualNote');
  bindChipClick(modalChips, 'modalManualNote');
}

// Preset button click handler
function handlePresetClick(hours) {
  const noteInput = document.getElementById('manualNote');
  const noteText = noteInput && noteInput.value.trim() ? noteInput.value.trim() : 'Quick log session';

  const startTime = '09:00';
  const endTime = calculateEndTimeFromHours(startTime, hours);
  const todayStr = getLocalDateString(new Date());

  const newRecord = {
    id: 'rec_preset_' + Date.now() + Math.random().toString(36).substr(2, 5),
    date: todayStr,
    startTime: startTime,
    endTime: endTime,
    totalHours: hours,
    note: noteText,
    method: 'Manual'
  };

  state.records.unshift(newRecord);
  saveRecordsToStorage();

  // Clear note input if it was a default
  if (noteInput && noteInput.value.trim() === '') {
    noteInput.value = '';
  }

  showToast(`Logged ${hours} hours for today!`, 'success');
  updateRecentChips();
  populateFilterYears();
  render();
}

// Edit Record Action
function openEditModal(recordId) {
  const record = state.records.find(r => r.id === recordId);
  if (!record) return;

  document.getElementById('editRecordId').value = record.id;
  document.getElementById('editDate').value = record.date;
  document.getElementById('editStart').value = record.startTime;
  document.getElementById('editEnd').value = record.endTime;
  document.getElementById('editMethod').value = record.method;
  document.getElementById('editNote').value = record.note;

  openModal('editModal');
}

function handleEditFormSubmit(e) {
  e.preventDefault();

  const id = document.getElementById('editRecordId').value;
  const date = document.getElementById('editDate').value;
  const startTime = document.getElementById('editStart').value;
  const endTime = document.getElementById('editEnd').value;
  const method = document.getElementById('editMethod').value;
  const note = document.getElementById('editNote').value.trim();

  if (!validateTimeRange(startTime, endTime)) {
    showToast('End time must be after start time!', 'error');
    return;
  }

  const hours = calculateHoursDuration(startTime, endTime);

  const recordIndex = state.records.findIndex(r => r.id === id);
  if (recordIndex === -1) return;

  // Update record fields
  state.records[recordIndex] = {
    ...state.records[recordIndex],
    date: date,
    startTime: startTime,
    endTime: endTime,
    totalHours: hours,
    method: method,
    note: note
  };

  // Re-sort records by date descending (and start time if dates match)
  state.records.sort((a, b) => {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }
    return b.startTime.localeCompare(a.startTime);
  });

  saveRecordsToStorage();
  closeModal('editModal');
  showToast('Record updated successfully.', 'success');
  updateRecentChips();
  populateFilterYears();
  render();
}

// Delete Record Action
function deleteRecord(recordId) {
  if (!confirm('Are you sure you want to delete this log entry? This action is permanent.')) return;

  state.records = state.records.filter(r => r.id !== recordId);
  saveRecordsToStorage();

  showToast('Record deleted.', 'success');
  updateRecentChips();
  populateFilterYears();
  render();
}

// ==========================================
// 7. RENDER & METRIC CALCULATIONS
// ==========================================
function render() {
  if (state.activeView === 'dashboard') {
    renderDashboard();
  } else if (state.activeView === 'history') {
    renderHistory();
  } else if (state.activeView === 'analytics') {
    renderAnalytics();
  }
}

// Main Dashboard Renderer
function renderDashboard() {
  const hoursTodayEl = document.getElementById('hours-today');
  const hoursWeekEl = document.getElementById('hours-week');
  const hoursMonthEl = document.getElementById('hours-month');
  const hoursYearEl = document.getElementById('hours-year');

  const todayDateEl = document.getElementById('stat-today-date');
  const monthNameEl = document.getElementById('stat-month-name');
  const yearNameEl = document.getElementById('stat-year-name');

  const today = new Date();
  
  // Format labels
  if (todayDateEl) todayDateEl.textContent = today.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  if (monthNameEl) monthNameEl.textContent = today.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  if (yearNameEl) yearNameEl.textContent = `Year ${today.getFullYear()} logs`;

  // Compute Metrics
  let todayTotal = 0;
  let weekTotal = 0;
  let monthTotal = 0;
  let yearTotal = 0;

  const todayStr = getLocalDateString(today);
  const currentWeekRange = getCurrentWeekRange();
  const currentMonthYear = { month: today.getMonth(), year: today.getFullYear() };
  const currentYear = today.getFullYear();

  state.records.forEach(rec => {
    const recHours = parseFloat(rec.totalHours) || 0;
    const recDate = new Date(rec.date + 'T00:00:00'); // parse local

    // Today Check
    if (rec.date === todayStr) {
      todayTotal += recHours;
    }

    // Week Check
    if (recDate >= currentWeekRange.start && recDate <= currentWeekRange.end) {
      weekTotal += recHours;
    }

    // Month Check (When new month begins, this starts from zero naturally because month doesn't match!)
    if (recDate.getMonth() === currentMonthYear.month && recDate.getFullYear() === currentMonthYear.year) {
      monthTotal += recHours;
    }

    // Year Check
    if (recDate.getFullYear() === currentYear) {
      yearTotal += recHours;
    }
  });

  // Render to DOM
  if (hoursTodayEl) hoursTodayEl.textContent = todayTotal.toFixed(2);
  if (hoursWeekEl) hoursWeekEl.textContent = weekTotal.toFixed(2);
  if (hoursMonthEl) hoursMonthEl.textContent = monthTotal.toFixed(2);
  if (hoursYearEl) hoursYearEl.textContent = yearTotal.toFixed(2);
}

// History / Logs Table Renderer
function renderHistory() {
  const tableBody = document.getElementById('history-table-body');
  const emptyState = document.getElementById('history-empty-state');
  if (!tableBody) return;

  tableBody.innerHTML = '';

  // Filter Records
  const filtered = state.records.filter(rec => {
    const recDate = new Date(rec.date + 'T00:00:00');
    
    // Year filter
    const yearMatches = state.filters.year === 'all' || recDate.getFullYear() === parseInt(state.filters.year);
    
    // Month filter
    const monthMatches = state.filters.month === 'all' || recDate.getMonth() === parseInt(state.filters.month);

    return yearMatches && monthMatches;
  });

  if (filtered.length === 0) {
    if (emptyState) emptyState.style.display = 'flex';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  filtered.forEach(rec => {
    const tr = document.createElement('tr');
    
    // Format display date
    const dateObj = new Date(rec.date + 'T00:00:00');
    const displayDate = dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

    // Badge styling
    const badgeClass = rec.method === 'Timer' ? 'badge-timer' : 'badge-manual';
    const badgeIcon = rec.method === 'Timer' ? 'hourglass' : 'plus';

    tr.innerHTML = `
      <td style="font-weight: 500;">${displayDate}</td>
      <td>
        <span class="badge ${badgeClass}">
          <i data-lucide="${badgeIcon}" style="width: 12px; height: 12px;"></i>
          ${rec.method}
        </span>
      </td>
      <td style="font-variant-numeric: tabular-nums;">${rec.startTime} - ${rec.endTime}</td>
      <td style="font-weight: 600; font-variant-numeric: tabular-nums; color: var(--accent-primary);">${rec.totalHours.toFixed(2)} hrs</td>
      <td><div class="note-cell" title="${escapeHtml(rec.note)}">${escapeHtml(rec.note)}</div></td>
      <td>
        <div class="action-buttons">
          <button class="action-btn edit" data-id="${rec.id}" title="Edit log details">
            <i data-lucide="edit-2" style="width: 16px; height: 16px;"></i>
          </button>
          <button class="action-btn delete" data-id="${rec.id}" title="Delete log entry">
            <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
          </button>
        </div>
      </td>
    `;
    tableBody.appendChild(tr);
  });

  // Re-create icons in table
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Setup click listeners for action buttons
  tableBody.querySelectorAll('.action-btn.edit').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.getAttribute('data-id')));
  });
  
  tableBody.querySelectorAll('.action-btn.delete').forEach(btn => {
    btn.addEventListener('click', () => deleteRecord(btn.getAttribute('data-id')));
  });
}

// Analytics Renderer
function renderAnalytics() {
  const chartTitleText = document.getElementById('chart-title-text');
  if (chartTitleText) {
    chartTitleText.textContent = `Annual Distribution (${state.analyticsYear})`;
  }
  
  renderChart();
  renderMonthlyBreakdownList();
}

function renderChart() {
  const canvas = document.getElementById('hoursChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  // Compute monthly sums for the selected year
  const monthlySums = Array(12).fill(0);
  state.records.forEach(rec => {
    const recDate = new Date(rec.date + 'T00:00:00');
    if (recDate.getFullYear() === state.analyticsYear) {
      const month = recDate.getMonth();
      monthlySums[month] += parseFloat(rec.totalHours) || 0;
    }
  });

  const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Cleanup existing chart
  if (hoursChartInstance) {
    hoursChartInstance.destroy();
  }

  // Detect style tokens for chart color configuration
  const isLight = document.body.classList.contains('light-theme');
  const gridColor = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
  const textColor = isLight ? '#4b5563' : '#9ca3af';
  const primaryAccent = getComputedStyle(document.documentElement).getPropertyValue('--accent-primary').trim() || 'rgb(99, 102, 241)';

  hoursChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: monthLabels,
      datasets: [{
        label: 'Work Hours',
        data: monthlySums.map(v => parseFloat(v.toFixed(2))),
        backgroundColor: primaryAccent,
        borderRadius: 6,
        hoverBackgroundColor: isLight ? 'hsl(250, 84%, 48%)' : 'hsl(250, 84%, 66%)'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: isLight ? '#ffffff' : '#1e293b',
          titleColor: isLight ? '#1f2937' : '#f3f4f6',
          bodyColor: isLight ? '#4b5563' : '#d1d5db',
          borderColor: isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)',
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: {
            label: function(context) {
              return ` ${context.parsed.y} hours logged`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            display: false
          },
          ticks: {
            color: textColor,
            font: {
              family: 'Inter',
              size: 11
            }
          }
        },
        y: {
          grid: {
            color: gridColor
          },
          ticks: {
            color: textColor,
            font: {
              family: 'Inter',
              size: 11
            },
            callback: function(value) {
              return value + 'h';
            }
          }
        }
      }
    }
  });
}

function renderMonthlyBreakdownList() {
  const listContainer = document.getElementById('monthly-breakdown-list');
  if (!listContainer) return;

  listContainer.innerHTML = '';

  const monthlySums = Array(12).fill(0);
  let yearTotal = 0;

  state.records.forEach(rec => {
    const recDate = new Date(rec.date + 'T00:00:00');
    if (recDate.getFullYear() === state.analyticsYear) {
      const month = recDate.getMonth();
      const hours = parseFloat(rec.totalHours) || 0;
      monthlySums[month] += hours;
      yearTotal += hours;
    }
  });

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June', 
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  let hasData = false;

  monthNames.forEach((monthName, index) => {
    const sum = monthlySums[index];
    if (sum > 0) {
      hasData = true;
      const pct = yearTotal > 0 ? ((sum / yearTotal) * 100).toFixed(1) : 0;
      
      const item = document.createElement('div');
      item.className = 'breakdown-item';
      item.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <span class="breakdown-month">${monthName}</span>
          <span style="font-size: 0.75rem; color: var(--text-muted);">${pct}% of annual hours</span>
        </div>
        <span class="breakdown-value">${sum.toFixed(2)} hrs</span>
      `;
      listContainer.appendChild(item);
    }
  });

  if (!hasData) {
    listContainer.innerHTML = `
      <div style="text-align: center; padding: 40px 10px; color: var(--text-muted); font-size: 0.9rem;">
        No records found for the year ${state.analyticsYear}.
      </div>
    `;
  }
}

// ==========================================
// 8. DATA EXPORT / IMPORT
// ==========================================
function exportToCsv() {
  if (state.records.length === 0) {
    showToast('No records to export.', 'error');
    return;
  }

  // Header row
  let csvContent = 'ID,Date,Method,Start Time,End Time,Total Hours,Note\r\n';

  state.records.forEach(rec => {
    const id = rec.id;
    const date = rec.date;
    const method = rec.method;
    const start = rec.startTime;
    const end = rec.endTime;
    const hours = rec.totalHours;
    
    // Escape double quotes in notes
    const escapedNote = '"' + rec.note.replace(/"/g, '""') + '"';

    csvContent += `${id},${date},${method},${start},${end},${hours},${escapedNote}\r\n`;
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `tempotrack_export_${getLocalDateString(new Date())}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('CSV exported successfully.', 'success');
}

function exportToJson() {
  if (state.records.length === 0) {
    showToast('No records to export.', 'error');
    return;
  }

  const jsonContent = JSON.stringify(state.records, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `tempotrack_backup_${getLocalDateString(new Date())}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('JSON backup exported.', 'success');
}

function handleJsonImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      const imported = JSON.parse(evt.target.result);
      
      // Validate schema
      if (!Array.isArray(imported)) {
        throw new Error('Imported data must be a JSON array of records');
      }

      // Check if it looks like correct object properties
      const isValid = imported.every(rec => {
        return typeof rec === 'object' &&
               rec !== null &&
               'date' in rec &&
               'startTime' in rec &&
               'endTime' in rec &&
               'totalHours' in rec &&
               'note' in rec &&
               'method' in rec;
      });

      if (!isValid) {
        throw new Error('One or more records are missing required properties.');
      }

      if (confirm(`This will import ${imported.length} records and overwrite your existing logs. Do you wish to continue?`)) {
        // Format IDs to ensure they are unique if missing/conflicting
        state.records = imported.map((rec, i) => ({
          ...rec,
          id: rec.id || 'rec_imported_' + Date.now() + '_' + i
        }));

        // Sort descending
        state.records.sort((a, b) => {
          if (a.date !== b.date) {
            return b.date.localeCompare(a.date);
          }
          return b.startTime.localeCompare(a.startTime);
        });

        saveRecordsToStorage();
        updateRecentChips();
        populateFilterYears();
        render();
        showToast(`Successfully imported ${imported.length} records!`, 'success');
      }
    } catch (err) {
      showToast('Error importing file: ' + err.message, 'error');
      console.error(err);
    }
    // Reset file input so same file can be selected again
    e.target.value = '';
  };
  reader.readAsText(file);
}

// ==========================================
// 9. EVENT LISTENERS SETUP
// ==========================================
function setupEventListeners() {
  // Navigation Links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.getAttribute('data-view');
      switchView(view);
    });
  });

  // Mobile navigation trigger
  const menuToggle = document.getElementById('menuToggleBtn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  
  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      if (overlay) overlay.classList.toggle('show');
    });
  }

  if (overlay) {
    overlay.addEventListener('click', () => {
      if (sidebar) sidebar.classList.remove('open');
      overlay.classList.remove('show');
    });
  }

  // Theme Toggler
  const themeBtn = document.getElementById('themeToggleBtn');
  const mobileThemeBtn = document.getElementById('mobileThemeToggleBtn');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
  if (mobileThemeBtn) mobileThemeBtn.addEventListener('click', toggleTheme);

  // Timer Buttons
  const startBtn = document.getElementById('startTimerBtn');
  const pauseBtn = document.getElementById('pauseTimerBtn');
  const resumeBtn = document.getElementById('resumeTimerBtn');
  const stopBtn = document.getElementById('stopTimerBtn');
  if (startBtn) startBtn.addEventListener('click', startTimer);
  if (pauseBtn) pauseBtn.addEventListener('click', pauseTimer);
  if (resumeBtn) resumeBtn.addEventListener('click', resumeTimer);
  if (stopBtn) stopBtn.addEventListener('click', stopTimer);

  // Quick Manual Log Form
  const quickForm = document.getElementById('quickManualForm');
  if (quickForm) quickForm.addEventListener('submit', handleQuickManualSubmit);

  // Manual Entry Dialog Open/Close (History tab button)
  const addLogBtn = document.getElementById('historyAddLogBtn');
  if (addLogBtn) {
    addLogBtn.addEventListener('click', () => {
      const todayStr = getLocalDateString(new Date());
      document.getElementById('modalManualDate').value = todayStr;
      
      // Ensure the range tab is default in modal
      const modalRangeBtn = document.getElementById('modalToggleRangeBtn');
      if (modalRangeBtn) modalRangeBtn.click();
      
      openModal('manualEntryModal');
    });
  }
  
  const closeManualBtn = document.getElementById('closeManualModalBtn');
  const cancelManualBtn = document.getElementById('cancelManualModalBtn');
  if (closeManualBtn) closeManualBtn.addEventListener('click', () => closeModal('manualEntryModal'));
  if (cancelManualBtn) cancelManualBtn.addEventListener('click', () => closeModal('manualEntryModal'));
  
  const modalManualForm = document.getElementById('modalManualForm');
  if (modalManualForm) modalManualForm.addEventListener('submit', handleModalManualSubmit);

  // Edit Dialog Open/Close
  const closeEditBtn = document.getElementById('closeEditModalBtn');
  const cancelEditBtn = document.getElementById('cancelEditModalBtn');
  if (closeEditBtn) closeEditBtn.addEventListener('click', () => closeModal('editModal'));
  if (cancelEditBtn) cancelEditBtn.addEventListener('click', () => closeModal('editModal'));
  
  const editForm = document.getElementById('editForm');
  if (editForm) editForm.addEventListener('submit', handleEditFormSubmit);

  // Dropdown Filter Listeners (History Logs tab)
  const filterMonth = document.getElementById('filterMonth');
  const filterYear = document.getElementById('filterYear');

  if (filterMonth) {
    filterMonth.addEventListener('change', (e) => {
      state.filters.month = e.target.value;
      renderHistory();
    });
  }

  if (filterYear) {
    filterYear.addEventListener('change', (e) => {
      state.filters.year = e.target.value;
      renderHistory();
    });
  }

  // Analytics Year Listener
  const analyticsYearSelect = document.getElementById('analyticsYearSelect');
  if (analyticsYearSelect) {
    analyticsYearSelect.addEventListener('change', (e) => {
      state.analyticsYear = parseInt(e.target.value) || new Date().getFullYear();
      renderAnalytics();
    });
  }

  // CSV/JSON Export & JSON Import triggers
  const csvBtn = document.getElementById('exportCsvBtn');
  const jsonBtn = document.getElementById('exportJsonBtn');
  const importBtn = document.getElementById('importJsonBtn');
  const fileInput = document.getElementById('importFile');

  if (csvBtn) csvBtn.addEventListener('click', exportToCsv);
  if (jsonBtn) jsonBtn.addEventListener('click', exportToJson);
  if (importBtn && fileInput) {
    importBtn.addEventListener('click', () => fileInput.click());
  }
  if (fileInput) {
    fileInput.addEventListener('change', handleJsonImport);
  }

  // Preset Buttons Bindings
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const hours = parseFloat(btn.getAttribute('data-hours'));
      if (!isNaN(hours)) {
        handlePresetClick(hours);
      }
    });
  });

  // Clear All Logs trigger
  const clearAllBtn = document.getElementById('clearAllBtn');
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to delete all time logs permanently? This cannot be undone.')) {
        state.records = [];
        saveRecordsToStorage();
        updateRecentChips();
        populateFilterYears();
        render();
        showToast('All time logs deleted.', 'success');
      }
    });
  }

  // Cloud Sync Modal Event Listeners
  const syncIndicatorBtn = document.getElementById('syncStatusIndicatorBtn');
  if (syncIndicatorBtn) {
    syncIndicatorBtn.addEventListener('click', () => {
      // Prefill passphrase field
      const passphraseInput = document.getElementById('syncPassphrase');
      if (passphraseInput) {
        passphraseInput.value = localStorage.getItem('tempotrack_sync_passphrase') || '';
      }
      updateSyncUI();
      openModal('syncModal');
    });
  }

  const closeSyncBtn = document.getElementById('closeSyncModalBtn');
  const cancelSyncBtn = document.getElementById('cancelSyncModalBtn');
  if (closeSyncBtn) closeSyncBtn.addEventListener('click', () => closeModal('syncModal'));
  if (cancelSyncBtn) cancelSyncBtn.addEventListener('click', () => closeModal('syncModal'));

  const saveSyncBtn = document.getElementById('saveSyncBtn');
  if (saveSyncBtn) {
    saveSyncBtn.addEventListener('click', () => {
      const passphraseInput = document.getElementById('syncPassphrase');
      const passphrase = passphraseInput ? passphraseInput.value.trim() : '';
      
      if (passphrase === '') {
        showToast('Please enter a valid sync passphrase.', 'error');
        return;
      }
      
      // Save settings
      localStorage.setItem('tempotrack_sync_passphrase', passphrase);
      state.syncPassphrase = passphrase;
      
      closeModal('syncModal');
      showToast('Cloud sync enabled with passphrase!', 'success');
      
      // Trigger sync
      syncWithCloud();
      
      // Start auto sync interval
      if (syncInterval) clearInterval(syncInterval);
      syncInterval = setInterval(syncWithCloud, 60000);
    });
  }

  const disableSyncBtn = document.getElementById('disableSyncBtn');
  if (disableSyncBtn) {
    disableSyncBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to disable Cloud Sync? Your logs will remain safe locally, but will no longer sync to other devices.')) {
        localStorage.removeItem('tempotrack_sync_passphrase');
        localStorage.removeItem('tempotrack_last_sync_timestamp');
        state.syncPassphrase = null;
        state.syncLastTime = null;
        state.syncError = null;
        
        if (syncInterval) {
          clearInterval(syncInterval);
          syncInterval = null;
        }
        
        closeModal('syncModal');
        updateSyncUI();
        showToast('Cloud Sync disabled. App is now local-only.', 'success');
      }
    });
  }
}

// ==========================================
// 10. UTILITIES & MODAL CONTROLS
// ==========================================
function openModal(modalId) {
  const overlay = document.getElementById(modalId);
  if (overlay) {
    overlay.classList.add('open');
  }
}

function closeModal(modalId) {
  const overlay = document.getElementById(modalId);
  if (overlay) {
    overlay.classList.remove('open');
  }
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMessage');
  const toastIcon = document.getElementById('toastIcon');

  if (!toast || !toastMsg) return;

  toastMsg.textContent = message;
  toast.className = 'toast'; // reset class
  toast.classList.add(type);

  if (toastIcon) {
    if (type === 'success') {
      toastIcon.setAttribute('data-lucide', 'check');
    } else {
      toastIcon.setAttribute('data-lucide', 'alert-circle');
    }
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  toast.classList.add('show');

  // Hide after 3.5s
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

// Dynamic dropdown generator for years active in the logs
function populateFilterYears() {
  const historyYearSelect = document.getElementById('filterYear');
  const analyticsYearSelect = document.getElementById('analyticsYearSelect');

  if (!historyYearSelect && !analyticsYearSelect) return;

  // Extract all years from records
  const years = new Set();
  years.add(new Date().getFullYear()); // Always include current year

  state.records.forEach(rec => {
    const y = new Date(rec.date + 'T00:00:00').getFullYear();
    if (!isNaN(y)) {
      years.add(y);
    }
  });

  const sortedYears = Array.from(years).sort((a, b) => b - a); // descending

  // Populate History select
  if (historyYearSelect) {
    const currentVal = historyYearSelect.value || 'all';
    historyYearSelect.innerHTML = '<option value="all">All Years</option>';
    sortedYears.forEach(year => {
      const opt = document.createElement('option');
      opt.value = year;
      opt.textContent = year;
      historyYearSelect.appendChild(opt);
    });
    // Restore or select current
    historyYearSelect.value = currentVal;
    state.filters.year = historyYearSelect.value;
  }

  // Populate Analytics select
  if (analyticsYearSelect) {
    const currentVal = parseInt(analyticsYearSelect.value) || new Date().getFullYear();
    analyticsYearSelect.innerHTML = '';
    sortedYears.forEach(year => {
      const opt = document.createElement('option');
      opt.value = year;
      opt.textContent = year;
      analyticsYearSelect.appendChild(opt);
    });
    analyticsYearSelect.value = currentVal;
    state.analyticsYear = parseInt(analyticsYearSelect.value);
  }
}

// Get YYYY-MM-DD string in local timezone
function getLocalDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Get HH:MM string in local timezone
function getLocalTimeString(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// Find Monday and Sunday bounds of the current week (local time)
function getCurrentWeekRange() {
  const today = new Date();
  const day = today.getDay();
  // distance to Monday: Monday = 1, Sunday = 0
  const distanceToMon = day === 0 ? -6 : 1 - day;
  
  const monday = new Date(today);
  monday.setDate(today.getDate() + distanceToMon);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { start: monday, end: sunday };
}

// HTML escape helper
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==========================================
// 11. MOCK DATA GENERATOR
// ==========================================
function getMockData() {
  // Generate some interesting mock data for a freelancer in the current year
  const currentYear = new Date().getFullYear();
  const mockLogs = [];
  
  // Create logs spread over the last 3-4 months
  const now = new Date();
  const projectNotes = [
    'Developed homepage hero sections & landing responsive layouts',
    'Configured database relations & optimized API endpoints',
    'Conducted UI design system review & resolved typography hierarchy',
    'Prepared freelance project estimates, billing, and timeline roadmaps',
    'Client alignment meeting & requirements gathering workshop',
    'Resolved responsiveness issues on safari & critical build bugs',
    'Configured CI/CD integrations on GitHub and set up Vercel staging site',
    'Added unit tests for payment webhook handling & tested API auth tokens'
  ];

  // Add 15 records spread across different months
  for (let i = 1; i <= 18; i++) {
    // Generate dates in the current year
    const month = Math.max(0, now.getMonth() - Math.floor(i / 4));
    const day = Math.floor(Math.random() * 25) + 1;
    const logDate = new Date(currentYear, month, day);
    
    // Don't add mock records in the future
    if (logDate > now) continue;

    const startH = Math.floor(Math.random() * 4) + 8; // 8am - 11am
    const duration = Math.floor(Math.random() * 5) + 2; // 2 - 6 hrs
    const endH = startH + duration;
    
    const startM = Math.random() > 0.5 ? '30' : '00';
    const endM = Math.random() > 0.5 ? '30' : '00';

    const dateString = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const startString = `${String(startH).padStart(2, '0')}:${startM}`;
    const endString = `${String(endH).padStart(2, '0')}:${endM}`;
    const calculatedHours = calculateHoursDuration(startString, endString);

    mockLogs.push({
      id: 'rec_mock_' + i,
      date: dateString,
      startTime: startString,
      endTime: endString,
      totalHours: calculatedHours,
      note: projectNotes[i % projectNotes.length],
      method: Math.random() > 0.45 ? 'Timer' : 'Manual'
    });
  }

  // Sort descending by date
  return mockLogs.sort((a, b) => b.date.localeCompare(a.date));
}

// ==========================================
// 12. CLOUD DATABASE SYNC LOGIC (Netlify Database)
// ==========================================

async function syncWithCloud() {
  const passphrase = localStorage.getItem('tempotrack_sync_passphrase');
  if (!passphrase) return;

  state.isSyncing = true;
  updateSyncUI();

  try {
    const res = await fetch(`/api/sync?key=${encodeURIComponent(passphrase)}`);

    let cloudRecords = [];
    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    } else {
      cloudRecords = await res.json();
    }

    if (!Array.isArray(cloudRecords)) {
      cloudRecords = [];
    }

    // Smart Merge Algorithm using last sync timestamp
    const lastSyncTimestamp = parseFloat(localStorage.getItem('tempotrack_last_sync_timestamp')) || 0;
    const cloudMap = new Map(cloudRecords.map(r => [r.id, r]));
    const recordsToKeep = [];

    // 1. Process local records
    state.records.forEach(rec => {
      if (cloudMap.has(rec.id)) {
        // Keep the cloud version (handles updates/edits)
        recordsToKeep.push(cloudMap.get(rec.id));
      } else {
        // Record is missing in the cloud.
        // Check if it was deleted on another device or is a new local offline record.
        let createdAt = 0;
        if (rec.id.startsWith('rec_mock_')) {
          createdAt = 0; // Mock data is old
        } else {
          const match = rec.id.match(/^rec_(\d+)/);
          if (match) {
            createdAt = parseInt(match[1]);
          }
        }

        if (createdAt < lastSyncTimestamp) {
          // Previously synced, so missing from cloud means it was deleted by another device.
          // Discard it (delete locally).
          console.log(`Sync: deleting record locally since it is missing in the cloud and was created before last sync: ${rec.id}`);
        } else {
          // Created locally after our last sync (offline record). Keep it.
          recordsToKeep.push(rec);
        }
      }
    });

    // 2. Add any cloud records we don't have locally
    const localIds = new Set(state.records.map(r => r.id));
    cloudRecords.forEach(rec => {
      if (!localIds.has(rec.id)) {
        recordsToKeep.push(rec);
      }
    });

    state.records = recordsToKeep;
    state.records.sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));

    localStorage.setItem('tempotrack_records', JSON.stringify(state.records));

    // Push merged back to cloud to ensure parity
    await pushToCloudDirect(passphrase, state.records);

    // Save sync timestamp
    localStorage.setItem('tempotrack_last_sync_timestamp', Date.now().toString());

    state.syncLastTime = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    state.syncError = null;
  } catch (err) {
    console.error('Cloud Sync Error:', err);
    state.syncError = err.message;
  } finally {
    state.isSyncing = false;
    updateSyncUI();
    render();
  }
}

async function pushToCloud() {
  const passphrase = localStorage.getItem('tempotrack_sync_passphrase');
  if (!passphrase) return;

  try {
    await pushToCloudDirect(passphrase, state.records);
    
    // Save sync timestamp
    localStorage.setItem('tempotrack_last_sync_timestamp', Date.now().toString());

    state.syncLastTime = new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    state.syncError = null;
  } catch (err) {
    console.error('Cloud Push Error:', err);
    state.syncError = err.message;
  } finally {
    updateSyncUI();
  }
}

async function pushToCloudDirect(passphrase, records) {
  const res = await fetch(`/api/sync?key=${encodeURIComponent(passphrase)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(records)
  });
  if (!res.ok) {
    throw new Error(`HTTP error! status: ${res.status}`);
  }
}

// Update Cloud Sync status components in HTML UI
function updateSyncUI() {
  const sidebarIndicator = document.getElementById('syncStatusIndicatorBtn');
  const sidebarIcon = document.getElementById('syncStatusIcon');
  const sidebarText = document.getElementById('syncStatusText');
  
  const modalStatus = document.getElementById('syncModalStatus');
  const modalLastTime = document.getElementById('syncModalLastTime');
  const lastTimeRow = document.getElementById('syncLastTimeRow');
  const disableSyncBtn = document.getElementById('disableSyncBtn');
  const saveSyncBtn = document.getElementById('saveSyncBtn');

  const passphrase = state.syncPassphrase;

  if (!sidebarIndicator) return;

  if (!passphrase) {
    // 1. Local mode (Sync disabled)
    sidebarIndicator.className = 'sync-status-indicator';
    if (sidebarIcon) sidebarIcon.setAttribute('data-lucide', 'cloud-off');
    if (sidebarText) sidebarText.textContent = 'Sync: Local Only';
    
    if (modalStatus) {
      modalStatus.textContent = 'Disconnected (Local)';
      modalStatus.style.color = 'var(--text-muted)';
    }
    if (lastTimeRow) lastTimeRow.style.display = 'none';
    if (disableSyncBtn) disableSyncBtn.style.display = 'none';
    if (saveSyncBtn) {
      const btnSpan = saveSyncBtn.querySelector('span');
      if (btnSpan) btnSpan.textContent = 'Enable Sync';
    }
  } 
  
  else if (state.isSyncing) {
    // 2. Syncing in progress
    sidebarIndicator.className = 'sync-status-indicator active';
    if (sidebarIcon) sidebarIcon.setAttribute('data-lucide', 'refresh-cw');
    if (sidebarText) sidebarText.textContent = 'Syncing...';
    
    if (modalStatus) {
      modalStatus.textContent = 'Synchronizing...';
      modalStatus.style.color = 'var(--timer-amber)';
    }
    if (lastTimeRow) lastTimeRow.style.display = 'flex';
    if (modalLastTime) modalLastTime.textContent = state.syncLastTime || 'Never';
    if (disableSyncBtn) disableSyncBtn.style.display = 'flex';
  } 
  
  else if (state.syncError) {
    // 3. Database connection or network error
    sidebarIndicator.className = 'sync-status-indicator active';
    if (sidebarIcon) sidebarIcon.setAttribute('data-lucide', 'cloud-lightning');
    if (sidebarText) sidebarText.textContent = 'Sync Offline';
    
    if (modalStatus) {
      modalStatus.innerHTML = `<span style="font-size: 0.8rem;">Offline / Connection Error</span>`;
      modalStatus.style.color = 'var(--timer-red)';
    }
    if (lastTimeRow) lastTimeRow.style.display = 'flex';
    if (modalLastTime) modalLastTime.textContent = state.syncLastTime || 'Never';
    if (disableSyncBtn) disableSyncBtn.style.display = 'flex';
    if (saveSyncBtn) {
      const btnSpan = saveSyncBtn.querySelector('span');
      if (btnSpan) btnSpan.textContent = 'Retry / Save';
    }
  } 
  
  else {
    // 4. Synced successfully
    sidebarIndicator.className = 'sync-status-indicator active';
    if (sidebarIcon) sidebarIcon.setAttribute('data-lucide', 'cloud');
    if (sidebarText) sidebarText.textContent = 'Sync: Active';
    
    if (modalStatus) {
      modalStatus.textContent = 'Connected & Synced';
      modalStatus.style.color = 'var(--timer-green)';
    }
    if (lastTimeRow) lastTimeRow.style.display = 'flex';
    if (modalLastTime) modalLastTime.textContent = state.syncLastTime || 'Just now';
    if (disableSyncBtn) disableSyncBtn.style.display = 'flex';
    if (saveSyncBtn) {
      const btnSpan = saveSyncBtn.querySelector('span');
      if (btnSpan) btnSpan.textContent = 'Update Key';
    }
  }

  // Refresh Lucide icons inside indicators
  if (window.lucide) {
    window.lucide.createIcons();
  }
}
