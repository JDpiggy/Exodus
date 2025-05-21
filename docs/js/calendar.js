// docs/js/calendar.js

document.addEventListener('DOMContentLoaded', () => {
    // Ensure Firebase and db object are available.
    // 'db' should be globally defined by firebase-config.js or available as firebase.firestore()
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        console.error("CRITICAL: Firebase or db object is not available in calendar.js. Check script loading order and firebase-config.js.");
        alert("Firebase services not loaded correctly for calendar. Application might not work. Check console.");
        return; // Stop execution if Firebase db is not ready
    }

    const userRole = localStorage.getItem('exodusUserRole');
    const userUID = localStorage.getItem('exodusUserUID');

    // Fallback if auth.js hasn't fully processed yet (e.g., direct navigation to index.html)
    // The onAuthStateChanged in auth.js is the primary handler for redirection.
    if (!userRole || !userUID) {
        console.warn("calendar.js: User role or UID not found in localStorage. Auth listener in auth.js should handle redirection if not logged in.");
        // If a user is truly not logged in, auth.js will redirect them.
        // If they are logged in but localStorage is stale, auth.js's onAuthStateChanged should refresh it.
        // For now, we proceed, but UI elements dependent on role might not show correctly until auth.js updates localStorage.
    }

    const monthYearDisplay = document.getElementById('monthYearDisplay');
    const calendarGrid = document.getElementById('calendarGrid');
    const prevMonthBtn = document.getElementById('prevMonthBtn');
    const nextMonthBtn = document.getElementById('nextMonthBtn');
    const addEventBtn = document.getElementById('addEventBtn');

    const eventModal = document.getElementById('eventModal');
    const closeModalBtn = eventModal ? eventModal.querySelector('.close-btn') : null; // Check if eventModal exists
    const eventForm = document.getElementById('eventForm');
    const eventModalTitle = document.getElementById('eventModalTitle');
    const eventIdInput = document.getElementById('eventId');
    const eventDateInput = document.getElementById('eventDate');
    const startTimeInput = document.getElementById('startTime');
    const endTimeInput = document.getElementById('endTime');
    const locationInput = document.getElementById('location');
    const descriptionInput = document.getElementById('description');
    const deleteEventBtn = document.getElementById('deleteEventBtn');
    const saveEventBtn = document.getElementById('saveEventBtn');

    // --- CONFIGURATION ---
    const emptyDayBackgrounds = [
        'images/yo-gurt', // Ensure this (and extension if any) is correct
        // 'images/bg-empty-2.jpg',
        // 'images/bg-empty-3.jpg',
    ];
    let bgIndex = 0;

    let currentDate = new Date();
    let currentMonthEvents = [];
    let unsubscribeFirestoreListener = null; // To store the unsubscribe function

    const eventsCollection = db.collection('events');

    // --- UI Initialization based on Role ---
    function initializeUIForRole() {
        const currentRole = localStorage.getItem('exodusUserRole'); // Get latest role
        console.log("calendar.js: Initializing UI for role:", currentRole);
        if (addEventBtn) {
            if (currentRole === 'admin') {
                addEventBtn.style.display = 'inline-block';
            } else {
                addEventBtn.style.display = 'none';
            }
        }
    }
    initializeUIForRole(); // Call it once on load
    // Optionally, listen for a custom event from auth.js if role can change dynamically post-load
    // window.addEventListener('userRoleChanged', initializeUIForRole);


    // --- Firestore Event Fetching (Real-time) ---
    function fetchAndListenForEvents(year, month) {
        console.log(`calendar.js: Fetching events for ${year}-${month + 1}`);
        // Unsubscribe from previous listener if it exists
        if (unsubscribeFirestoreListener) {
            unsubscribeFirestoreListener();
            console.log("calendar.js: Unsubscribed from previous Firestore listener.");
        }

        // Construct start and end dates for the query for the current month
        // Firestore dates are best stored as Timestamps or YYYY-MM-DD strings.
        // If storing as YYYY-MM-DD string:
        const monthPadded = String(month + 1).padStart(2, '0');
        const firstDayOfMonthStr = `${year}-${monthPadded}-01`;
        const daysInThisMonth = new Date(year, month + 1, 0).getDate();
        const lastDayOfMonthStr = `${year}-${monthPadded}-${String(daysInThisMonth).padStart(2, '0')}`;

        unsubscribeFirestoreListener = eventsCollection
            .where('date', '>=', firstDayOfMonthStr)
            .where('date', '<=', lastDayOfMonthStr)
            .orderBy('date') // Order by date, then by startTime within the day
            // .orderBy('startTime') // Firestore requires composite index for this
            .onSnapshot(snapshot => {
                console.log("calendar.js: Firestore snapshot received.");
                currentMonthEvents = [];
                snapshot.forEach(doc => {
                    currentMonthEvents.push({ id: doc.id, ...doc.data() });
                });
                // Sort by start time client-side if not done by Firestore query
                currentMonthEvents.sort((a,b) => (a.startTime || "00:00").localeCompare(b.startTime || "00:00"));
                renderCalendar(currentDate);
            }, error => {
                console.error("calendar.js: Error fetching events from Firestore: ", error);
                if (calendarGrid) calendarGrid.innerHTML = "<p style='color:red;text-align:center;'>Error loading events. Check console.</p>";
            });
    }

    // --- Calendar Rendering ---
    function renderCalendar(dateToRender) {
        if (!calendarGrid || !monthYearDisplay) {
            console.error("calendar.js: Calendar grid or month display element not found for rendering.");
            return;
        }
        console.log("calendar.js: Rendering calendar for", dateToRender.toLocaleDateString());
        calendarGrid.innerHTML = '';
        bgIndex = 0;
        const year = dateToRender.getFullYear();
        const month = dateToRender.getMonth();

        monthYearDisplay.textContent = `${dateToRender.toLocaleString('default', { month: 'long' })} ${year}`;

        const firstDayOfMonthDateObj = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const startingDayOfWeek = firstDayOfMonthDateObj.getDay();

        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayNames.forEach(dayName => {
            const dayHeaderEl = document.createElement('div');
            dayHeaderEl.classList.add('calendar-day-header');
            dayHeaderEl.textContent = dayName;
            calendarGrid.appendChild(dayHeaderEl);
        });

        for (let i = 0; i < startingDayOfWeek; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.classList.add('calendar-day', 'other-month');
            calendarGrid.appendChild(emptyCell);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const dayCell = document.createElement('div');
            dayCell.classList.add('calendar-day');
            
            const dayNumberEl = document.createElement('span');
            dayNumberEl.classList.add('day-number');
            dayNumberEl.textContent = day;
            dayCell.appendChild(dayNumberEl);

            const cellDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayEvents = currentMonthEvents.filter(event => event.date === cellDateStr);
            
            const eventListEl = document.createElement('div');
            eventListEl.classList.add('event-list');

            if (dayEvents.length > 0) {
                dayEvents.forEach(event => {
                    const eventEl = document.createElement('div');
                    eventEl.classList.add('event-item');
                    eventEl.innerHTML = `
                        <span class="event-time">${event.startTime || ''} - ${event.endTime || ''}</span>
                        <span class="event-title">${(event.description || 'No Title').substring(0, 20)}${(event.description || '').length > 20 ? '...' : ''}</span>
                    `;
                    eventEl.dataset.eventId = event.id;
                    eventEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        openEventModal(event);
                    });
                    eventListEl.appendChild(eventEl);
                });
            } else {
                dayCell.classList.add('empty-day');
                if (emptyDayBackgrounds.length > 0 && emptyDayBackgrounds[0]) { // Check if array is not empty and has valid entry
                    dayCell.style.backgroundImage = `url('${emptyDayBackgrounds[bgIndex % emptyDayBackgrounds.length]}')`;
                    bgIndex++;
                }
            }
            dayCell.appendChild(eventListEl);
            const currentRoleOnRender = localStorage.getItem('exodusUserRole');
            if (currentRoleOnRender === 'admin') {
                dayCell.classList.add('admin-clickable');
                dayCell.addEventListener('click', (e) => {
                    if (e.target === dayCell || e.target === dayNumberEl) {
                        openEventModal(null, cellDateStr);
                    }
                });
            }
            calendarGrid.appendChild(dayCell);
        }
    }
    // --- THIS IS A GUESS FOR YOUR ERROR AT calendar.js:255. ---
    // Often errors like "Unexpected token ')'" are due to a missing semicolon on the line before,
    // or a function call without parameters but with parentheses like someFunction() where it wasn't expected,
    // or an object/array with a trailing comma before a closing brace/bracket when not allowed by the JS engine (older browsers).
    // Check line 255 and its surroundings very carefully.
    // If line 255 was the end of the `renderCalendar` function, ensure the closing `}` is correct.
    // For example, if line 254 was `calendarGrid.appendChild(dayCell);` and 255 was `}` then it should be fine.
    // But if there was something like `calendarGrid.appendChild(dayCell());` (extra parens), that would be an error.
    // **WITHOUT SEEING LINE 255, THIS IS A SHOT IN THE DARK.**

    // --- Event Modal Logic ---
    function openEventModal(event = null, dateForNewEvent = null) {
        if (!eventModal || !eventForm || !eventModalTitle || !eventIdInput || !eventDateInput || !startTimeInput || !endTimeInput || !locationInput || !descriptionInput || !deleteEventBtn || !saveEventBtn) {
            console.error("calendar.js: One or more modal elements are missing from the DOM.");
            return;
        }
        const currentRoleForModal = localStorage.getItem('exodusUserRole');
        eventForm.reset();
        eventIdInput.value = '';
        deleteEventBtn.style.display = 'none';

        if (event) {
            eventModalTitle.textContent = currentRoleForModal === 'admin' ? 'Edit Event' : 'View Event';
            eventIdInput.value = event.id;
            eventDateInput.value = event.date;
            startTimeInput.value = event.startTime;
            endTimeInput.value = event.endTime;
            locationInput.value = event.location || '';
            descriptionInput.value = event.description;

            if (currentRoleForModal === 'admin') {
                deleteEventBtn.style.display = 'inline-block';
                setFormEditable(true);
            } else {
                setFormEditable(false);
            }
        } else {
            eventModalTitle.textContent = 'Add New Event';
            if (dateForNewEvent) {
                eventDateInput.value = dateForNewEvent;
            }
            setFormEditable(true); // Only admins should be able to trigger 'add new'
        }
        eventModal.style.display = 'block';
    }

    function setFormEditable(isEditable) {
        eventDateInput.disabled = !isEditable;
        startTimeInput.disabled = !isEditable;
        endTimeInput.disabled = !isEditable;
        locationInput.disabled = !isEditable;
        descriptionInput.disabled = !isEditable;
        saveEventBtn.style.display = isEditable ? 'inline-block' : 'none';
        
        const currentEventId = eventIdInput.value; // Get current event ID for delete button logic
        if (isEditable && currentEventId) { // Editable and there's an event ID (editing mode for admin)
             deleteEventBtn.style.display = 'inline-block';
        } else {
            deleteEventBtn.style.display = 'none';
        }
    }

    function closeEventModal() {
        if(eventModal) eventModal.style.display = 'none';
    }

    if (eventForm) {
        eventForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const currentRoleForSubmit = localStorage.getItem('exodusUserRole');
            if (currentRoleForSubmit !== 'admin') {
                console.warn("calendar.js: Non-admin tried to submit event form.");
                return; // Should not happen if UI is correct
            }
            const eventData = {
                date: eventDateInput.value,
                startTime: startTimeInput.value,
                endTime: endTimeInput.value,
                location: locationInput.value,
                description: descriptionInput.value,
                // lastUpdated: firebase.firestore.FieldValue.serverTimestamp() // v8 style
            };
            const currentEventIdVal = eventIdInput.value;

            if (currentEventIdVal) {
                eventsCollection.doc(currentEventIdVal).update(eventData)
                    .then(() => { console.log("Event updated!"); closeEventModal(); })
                    .catch(error => { console.error("Error updating event: ", error); alert("Error: " + error.message); });
            } else {
                // eventData.createdByUID = localStorage.getItem('exodusUserUID'); // Optional
                // eventData.createdAt = firebase.firestore.FieldValue.serverTimestamp(); // Optional
                eventsCollection.add(eventData)
                    .then(() => { console.log("Event added!"); closeEventModal(); })
                    .catch(error => { console.error("Error adding event: ", error); alert("Error: " + error.message); });
            }
        });
    }

    if (deleteEventBtn) {
        deleteEventBtn.addEventListener('click', () => {
            const currentRoleForDelete = localStorage.getItem('exodusUserRole');
            if (currentRoleForDelete !== 'admin') {
                console.warn("calendar.js: Non-admin tried to delete event.");
                return;
            }
            const currentEventIdVal = eventIdInput.value;
            if (currentEventIdVal && confirm('Are you sure you want to delete this event?')) {
                eventsCollection.doc(currentEventIdVal).delete()
                    .then(() => { console.log("Event deleted!"); closeEventModal(); })
                    .catch(error => { console.error("Error deleting event: ", error); alert("Error: " + error.message); });
            }
        });
    }

    // --- Event Listeners for Calendar Navigation & Modal ---
    if (prevMonthBtn) {
        prevMonthBtn.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            fetchAndListenForEvents(currentDate.getFullYear(), currentDate.getMonth());
        });
    }

    if (nextMonthBtn) {
        nextMonthBtn.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            fetchAndListenForEvents(currentDate.getFullYear(), currentDate.getMonth());
        });
    }

    if (addEventBtn) { // Event listener for addEventBtn already handled by UI init based on role for display
        addEventBtn.addEventListener('click', () => {
            const currentRoleForAdd = localStorage.getItem('exodusUserRole');
            if (currentRoleForAdd === 'admin') {
                 // Get current date in YYYY-MM-DD format
                const today = new Date();
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0'); // Months are 0-indexed
                const dd = String(today.getDate()).padStart(2, '0');
                const todayStr = `${yyyy}-${mm}-${dd}`;
                openEventModal(null, todayStr);
            }
        });
    }

    if (closeModalBtn) closeModalBtn.addEventListener('click', closeEventModal);
    
    window.addEventListener('click', (event) => {
        if (eventModal && event.target == eventModal) { // Check if eventModal exists
            closeEventModal();
        }
    });

    // --- Initial Load ---
    // Check if user details are present, then fetch.
    // auth.js onAuthStateChanged will handle redirection if not logged in.
    // It will also update localStorage with role if user is logged in.
    // We rely on that having happened or happening very soon.
    if (localStorage.getItem('exodusUserUID')) {
        console.log("calendar.js: User UID found, proceeding with initial event fetch.");
        initializeUIForRole(); // Re-check role for UI elements just in case
        fetchAndListenForEvents(currentDate.getFullYear(), currentDate.getMonth());
    } else {
        console.log("calendar.js: No user UID in localStorage on initial load. Waiting for auth state listener.");
        // The onAuthStateChanged in auth.js should kick in, set localStorage, and potentially redirect.
        // If this page (index.html) remains visible, the listener in auth.js should lead to role setting,
        // then the user can interact, or a refresh might be needed if this script runs too early.
        // A robust way is to have auth.js dispatch a custom event like 'authStateReady' or 'userRoleSet'
        // and calendar.js listens for it before calling fetchAndListenForEvents.
        // For simplicity now, we assume auth.js will sort it out quickly.
    }
});
