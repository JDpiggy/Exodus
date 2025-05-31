// docs/js/calendar.js

// Helper function to convert "HH:MM" (24-hour) to "H:MM AM/PM"
function formatTime12Hour(timeString24) {
    if (!timeString24 || typeof timeString24 !== 'string' || !timeString24.includes(':')) {
        return ""; // Return empty or original if format is unexpected
    }
    const [hoursString, minutesString] = timeString24.split(':');
    const hours24 = parseInt(hoursString, 10);
    const minutes = parseInt(minutesString, 10);

    if (isNaN(hours24) || isNaN(minutes)) {
        return timeString24; // Return original if parsing failed
    }

    const ampm = hours24 >= 12 ? 'PM' : 'AM';
    let hours12 = hours24 % 12;
    hours12 = hours12 ? hours12 : 12; // Convert 0 to 12 for 12 AM/PM (hour '0' should be '12' AM)

    const minutesPadded = String(minutes).padStart(2, '0');

    return `${hours12}:${minutesPadded} ${ampm}`;
}


document.addEventListener('DOMContentLoaded', () => {
    // Ensure Firebase and db object are available.
    if (typeof firebase === 'undefined' || typeof db === 'undefined') {
        console.error("CRITICAL: Firebase or db object is not available in calendar.js. Check script loading order and firebase-config.js.");
        // alert("Firebase services not loaded correctly for calendar. Application might not work. Check console.");
        return;
    }

    // --- DOM Elements ---
    const monthYearDisplay = document.getElementById('monthYearDisplay');
    const calendarGrid = document.getElementById('calendarGrid');
    const prevMonthBtn = document.getElementById('prevMonthBtn');
    const nextMonthBtn = document.getElementById('nextMonthBtn');
    const addEventBtn = document.getElementById('addEventBtn');

    const eventModal = document.getElementById('eventModal');
    const closeModalBtn = eventModal ? eventModal.querySelector('.modal .close-btn') : null;
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

    // --- Announcement DOM Elements ---
    const announcementsList = document.getElementById('announcementsList');
    const announcementForm = document.getElementById('announcementForm');
    const announcementMessageInput = document.getElementById('announcementMessage');
    const postAnnouncementBtn = document.getElementById('postAnnouncementBtn');

    // --- CONFIGURATION & STATE ---
    const emptyDayBackgrounds = [ 'images/yo-gurt' ]; // Ensure this path and filename (with extension) are correct
    let bgIndex = 0;
    let currentDate = new Date();
    let currentMonthEvents = [];
    let unsubscribeFirestoreListener = null;
    let unsubscribeAnnouncementsListener = null;

    const eventsCollection = db.collection('events');
    const announcementsCollection = db.collection('announcements');


    // --- UI Initialization based on Role ---
    function initializeUIForRole() {
        const currentRole = localStorage.getItem('exodusUserRole');
        console.log("calendar.js: Initializing/Updating UI for role:", currentRole);
        if (addEventBtn) {
            if (currentRole === 'uploader') {
                addEventBtn.style.display = 'inline-block';
            } else {
                addEventBtn.style.display = 'none';
            }
        }
        if (announcementForm) {
            if (currentRole === 'uploader') {
                announcementForm.style.display = 'block';
            } else {
                announcementForm.style.display = 'none';
            }
        }
    }

    // Listen for role updates from auth.js
    window.addEventListener('exodusUserRoleUpdated', (event) => {
        console.log("calendar.js: Received exodusUserRoleUpdated event, new role:", event.detail.role);
        initializeUIForRole(); // Update UI elements like buttons
        
        if (event.detail.role && event.detail.role !== "pending") { // User is logged in and approved
             fetchAndListenForEvents(currentDate.getFullYear(), currentDate.getMonth());
             fetchAndListenForAnnouncements();
        } else { // User logged out or pending
            if (unsubscribeFirestoreListener) unsubscribeFirestoreListener();
            if (unsubscribeAnnouncementsListener) unsubscribeAnnouncementsListener();
            currentMonthEvents = [];
            if(calendarGrid) calendarGrid.innerHTML = "<p style='text-align:center;'>Please log in to view events.</p>";
            if(announcementsList) announcementsList.innerHTML = "<p style='text-align:center;'>Log in to see announcements.</p>";
            if(monthYearDisplay) monthYearDisplay.textContent = "Calendar";
        }
    });


    // --- Firestore Event Fetching ---
    function fetchAndListenForEvents(year, month) {
        if (!localStorage.getItem('exodusUserUID')) { // Don't fetch if not logged in
            console.log("calendar.js: No user logged in, skipping event fetch.");
            if(calendarGrid) calendarGrid.innerHTML = "<p style='text-align:center;'>Please log in to view events.</p>";
            return;
        }
        console.log(`calendar.js: Fetching events for ${year}-${month + 1}`);
        if (unsubscribeFirestoreListener) {
            unsubscribeFirestoreListener();
        }
        const monthPadded = String(month + 1).padStart(2, '0');
        const firstDayOfMonthStr = `${year}-${monthPadded}-01`;
        const daysInThisMonth = new Date(year, month + 1, 0).getDate();
        const lastDayOfMonthStr = `${year}-${monthPadded}-${String(daysInThisMonth).padStart(2, '0')}`;

        unsubscribeFirestoreListener = eventsCollection
            .where('date', '>=', firstDayOfMonthStr)
            .where('date', '<=', lastDayOfMonthStr)
            .orderBy('date') // Consider adding .orderBy('startTime') if you have a composite index
            .onSnapshot(snapshot => {
                console.log("calendar.js: Event snapshot received.");
                currentMonthEvents = [];
                snapshot.forEach(doc => {
                    currentMonthEvents.push({ id: doc.id, ...doc.data() });
                });
                currentMonthEvents.sort((a,b) => (a.startTime || "00:00").localeCompare(b.startTime || "00:00"));
                renderCalendar(currentDate);
            }, error => {
                console.error("calendar.js: Error fetching events from Firestore: ", error);
                if (calendarGrid) calendarGrid.innerHTML = "<p style='color:red;text-align:center;'>Error loading events. Check console.</p>";
            });
    }

    // --- Calendar Rendering ---
    function renderCalendar(dateToRender) {
        if (!calendarGrid || !monthYearDisplay) { return; }
        console.log("calendar.js: Rendering calendar for", dateToRender.toLocaleDateString());
        calendarGrid.innerHTML = '';
        bgIndex = 0;
        const year = dateToRender.getFullYear();
        const month = dateToRender.getMonth();
        monthYearDisplay.textContent = `${dateToRender.toLocaleString('default', { month: 'long' })} ${year}`;
        
        const todayObj = new Date(); // For highlighting current day

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

            // Highlight current day
            if (day === todayObj.getDate() && month === todayObj.getMonth() && year === todayObj.getFullYear()) {
                dayCell.classList.add('current-day');
            }
            
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
                    const startTime12 = event.startTime ? formatTime12Hour(event.startTime) : '';
                    const endTime12 = event.endTime ? formatTime12Hour(event.endTime) : '';
                    let timeDisplay = startTime12;
                    if (endTime12) { timeDisplay += ` - ${endTime12}`; }

                    eventEl.innerHTML = `
                        <span class="event-time">${timeDisplay}</span>
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
                if (emptyDayBackgrounds.length > 0 && emptyDayBackgrounds[0]) {
                    dayCell.style.backgroundImage = `url('${emptyDayBackgrounds[bgIndex % emptyDayBackgrounds.length]}')`;
                    bgIndex++;
                }
            }
            dayCell.appendChild(eventListEl);
            const currentRoleOnRender = localStorage.getItem('exodusUserRole');
            if (currentRoleOnRender === 'uploader') {
                dayCell.classList.add('uploader-clickable'); // Use specific class if needed
                dayCell.addEventListener('click', (e) => {
                    if (e.target === dayCell || e.target === dayNumberEl) {
                        openEventModal(null, cellDateStr);
                    }
                });
            }
            calendarGrid.appendChild(dayCell);
        }
    }

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
            eventModalTitle.textContent = currentRoleForModal === 'uploader' ? 'Edit Event' : 'View Event';
            eventIdInput.value = event.id;
            eventDateInput.value = event.date;
            startTimeInput.value = event.startTime || '';
            endTimeInput.value = event.endTime || '';
            locationInput.value = event.location || '';
            descriptionInput.value = event.description || '';
            if (currentRoleForModal === 'uploader') {
                deleteEventBtn.style.display = 'inline-block';
                setFormEditable(true);
            } else {
                setFormEditable(false);
            }
        } else { // Adding new event
            eventModalTitle.textContent = 'Add New Event';
            if (dateForNewEvent) eventDateInput.value = dateForNewEvent;
            setFormEditable(true); // Assumes only 'uploader' can trigger this path
        }
        eventModal.style.display = 'block';
    }

    function setFormEditable(isEditable) {
        if(!eventDateInput) return; // Guard clause if elements aren't found
        eventDateInput.disabled = !isEditable;
        startTimeInput.disabled = !isEditable;
        endTimeInput.disabled = !isEditable;
        locationInput.disabled = !isEditable;
        descriptionInput.disabled = !isEditable;
        if(saveEventBtn) saveEventBtn.style.display = isEditable ? 'inline-block' : 'none';
        
        const currentEventId = eventIdInput.value;
        const currentRoleForEdit = localStorage.getItem('exodusUserRole');
        if (isEditable && currentEventId && currentRoleForEdit === 'uploader') {
             if(deleteEventBtn) deleteEventBtn.style.display = 'inline-block';
        } else {
            if(deleteEventBtn) deleteEventBtn.style.display = 'none';
        }
    }

    function closeEventModal() { 
         if(eventModal) eventModal.style.display = 'none';
    }

    if (eventForm) {
        eventForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const currentRoleForSubmit = localStorage.getItem('exodusUserRole');
            if (currentRoleForSubmit !== 'uploader') {
                console.warn("calendar.js: Non-uploader tried to submit event form.");
                return;
            }
            const eventData = { 
                date: eventDateInput.value,
                startTime: startTimeInput.value,
                endTime: endTimeInput.value || null, // Store null if empty for consistency
                location: locationInput.value,
                description: descriptionInput.value,
            };
            const currentEventIdVal = eventIdInput.value;
            if (currentEventIdVal) {
                eventsCollection.doc(currentEventIdVal).update(eventData)
                    .then(() => { console.log("Event updated!"); closeEventModal(); })
                    .catch(error => { console.error("Error updating event: ", error); alert("Error updating event: " + error.message); });
            } else {
                eventsCollection.add(eventData)
                    .then(() => { console.log("Event added!"); closeEventModal(); })
                    .catch(error => { console.error("Error adding event: ", error); alert("Error adding event: " + error.message); });
            }
        });
    }

    if (deleteEventBtn) {
        deleteEventBtn.addEventListener('click', () => {
            const currentRoleForDelete = localStorage.getItem('exodusUserRole');
            if (currentRoleForDelete !== 'uploader') { return; }
            const currentEventIdVal = eventIdInput.value;
            if (currentEventIdVal && confirm('Are you sure you want to delete this event?')) {
                eventsCollection.doc(currentEventIdVal).delete()
                    .then(() => { console.log("Event deleted!"); closeEventModal(); })
                    .catch(error => { console.error("Error deleting event: ", error); alert("Error deleting event: " + error.message); });
            }
        });
    }

    // --- Announcement Functions ---
    function fetchAndListenForAnnouncements() {
        if (!announcementsList || !localStorage.getItem('exodusUserUID')) {
            if(announcementsList) announcementsList.innerHTML = "<p style='text-align:center;'>Log in to see announcements.</p>";
            return;
        }
        console.log("calendar.js: Fetching announcements...");

        if (unsubscribeAnnouncementsListener) {
            unsubscribeAnnouncementsListener();
        }

        unsubscribeAnnouncementsListener = announcementsCollection
            .orderBy('timestamp', 'desc')
            .limit(20)
            .onSnapshot(snapshot => {
                if (!announcementsList) return; // Check again in case element removed
                announcementsList.innerHTML = '';
                if (snapshot.empty) {
                    announcementsList.innerHTML = '<p>No announcements yet.</p>';
                    return;
                }
                snapshot.forEach(doc => {
                    const announcement = doc.data();
                    const item = document.createElement('div');
                    item.classList.add('announcement-item');

                    let timestampStr = 'Processing...';
                    if (announcement.timestamp && typeof announcement.timestamp.toDate === 'function') {
                        timestampStr = announcement.timestamp.toDate().toLocaleString([], { month:'short', day:'numeric', hour: 'numeric', minute:'2-digit', hour12: true });
                    } else if (announcement.timestamp) { // If it's already a string or number
                        timestampStr = new Date(announcement.timestamp).toLocaleString([], { month:'short', day:'numeric', hour: 'numeric', minute:'2-digit', hour12: true });
                    }


                    item.innerHTML = `
                        <div class="announcement-author">${announcement.authorDisplayName || 'System'}</div>
                        <div class="announcement-timestamp">${timestampStr}</div>
                        <div class="announcement-message">${(announcement.message || '').replace(/\n/g, '<br>')}</div>
                    `;
                    announcementsList.appendChild(item);
                });
            }, error => {
                console.error("Error fetching announcements:", error);
                if(announcementsList) announcementsList.innerHTML = '<p style="color:red;">Error loading announcements.</p>';
            });
    }

    if (postAnnouncementBtn && announcementMessageInput) {
        postAnnouncementBtn.addEventListener('click', () => {
            const message = announcementMessageInput.value.trim();
            const userDisplayName = localStorage.getItem('userDisplayName');
            const userUID = localStorage.getItem('exodusUserUID');
            const userRole = localStorage.getItem('exodusUserRole');

            if (userRole !== 'uploader') {
                alert("You do not have permission to post announcements.");
                return;
            }
            if (!message) {
                alert("Announcement message cannot be empty.");
                return;
            }
            if (!userDisplayName || !userUID) {
                alert("User information missing. Cannot post. Please re-login.");
                console.error("Cannot post announcement: displayName or UID missing from localStorage");
                return;
            }

            announcementsCollection.add({
                message: message,
                authorDisplayName: userDisplayName,
                authorUID: userUID,
                timestamp: firebase.firestore.FieldValue.serverTimestamp() // v8 style for server timestamp
            }).then(() => {
                console.log("Announcement posted!");
                announcementMessageInput.value = '';
            }).catch(error => {
                console.error("Error posting announcement:", error);
                alert("Error posting announcement: " + error.message);
            });
        });
    }


    // --- Event Listeners for Calendar Navigation & Modal ---
    if (prevMonthBtn) { prevMonthBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); fetchAndListenForEvents(currentDate.getFullYear(), currentDate.getMonth()); }); }
    if (nextMonthBtn) { nextMonthBtn.addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); fetchAndListenForEvents(currentDate.getFullYear(), currentDate.getMonth()); }); }

    if (addEventBtn) {
        addEventBtn.addEventListener('click', () => {
            const currentRoleForAdd = localStorage.getItem('exodusUserRole');
            if (currentRoleForAdd === 'uploader') {
                const today = new Date();
                const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                openEventModal(null, todayStr);
            }
        });
    }

    if (closeModalBtn) closeModalBtn.addEventListener('click', closeEventModal);
    window.addEventListener('click', (event) => { 
        if (eventModal && event.target == eventModal) {
            closeEventModal();
        }
    });

    // --- Initial Load ---
    if (localStorage.getItem('exodusUserUID') && localStorage.getItem('exodusUserRole') !== 'pending') {
        console.log("calendar.js: User UID and valid role found on initial load, initializing UI and fetching data.");
        initializeUIForRole(); // Initialize based on whatever role is already in localStorage
        fetchAndListenForEvents(currentDate.getFullYear(), currentDate.getMonth());
        fetchAndListenForAnnouncements();
    } else if (localStorage.getItem('exodusUserRole') === 'pending') {
        console.log("calendar.js: User account is pending approval.");
        if(calendarGrid) calendarGrid.innerHTML = "<p style='text-align:center;'>Your account is awaiting approval.</p>";
        if(announcementsList) announcementsList.innerHTML = "<p style='text-align:center;'>Account pending approval.</p>";
        initializeUIForRole(); // Ensure uploader buttons are hidden
    }
    else {
        console.log("calendar.js: No user UID in localStorage on initial load. Waiting for auth state update.");
        if(calendarGrid) calendarGrid.innerHTML = "<p style='text-align:center;'>Please log in to view events.</p>";
        if(announcementsList) announcementsList.innerHTML = "<p style='text-align:center;'>Log in to see announcements.</p>";
    }
});
