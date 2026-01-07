// Version: 1.1.0 - Responsive & Robust Save
const preview = document.getElementById('preview');
const pickSourceBtn = document.getElementById('pick-source-btn');
const pickSaveBtn = document.getElementById('pick-save-btn');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const timerDisplay = document.getElementById('recording-timer');
const statusText = document.getElementById('status-text');
const sourceStatus = document.getElementById('source-status');
const saveStatus = document.getElementById('save-status');
const systemMessage = document.getElementById('system-message');

let mediaRecorder;
let recordedChunks = [];
let startTime;
let timerInterval;
let currentStream = null;
let fileHandle = null;
let isFilePickerBlocked = false;

// Feature Detection
const supportsDisplayMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
const supportsFileSystemAccess = !!window.showSaveFilePicker;
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

/**
 * Shows a system message banner.
 */
function showMessage(text, type = 'error') {
    systemMessage.textContent = text;
    systemMessage.className = `system-message ${type}`;
    systemMessage.classList.remove('hidden');
}

/**
 * Initializes the app based on browser support.
 */
async function init() {
    // Check for Secure Context
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        showMessage("Screen recording requires a secure (HTTPS) connection. Please check your URL.", 'error');
        pickSourceBtn.disabled = true;
        return;
    }

    // Proactive Brave Tip
    if (navigator.brave && await navigator.brave.isBrave()) {
        const braveTip = document.createElement('div');
        braveTip.className = "system-message info";
        braveTip.style.marginBottom = "1rem";
        braveTip.innerHTML = "<strong>Brave User Tip:</strong> If recording fails, ensure <strong>Shields</strong> are down or set fingerprinting protection to 'Standard'.";
        systemMessage.parentNode.insertBefore(braveTip, systemMessage);
    }

    if (!supportsDisplayMedia) {
        if (isMobile) {
            showMessage("Screen recording is not supported on mobile browsers. Please use a desktop browser like Chrome, Edge, or Brave.");
        } else {
            showMessage("Your browser does not support screen recording. Please update or use a modern desktop browser.");
        }
        pickSourceBtn.disabled = true;
    }

    if (!supportsFileSystemAccess) {
        // Fallback for file picker
        pickSaveBtn.classList.add('hidden');
        saveStatus.textContent = "Auto-download mode active: Recordings will save to your Downloads folder.";
        saveStatus.style.color = "var(--text-dim)";
    }
}

/**
 * Updates the recording timer display.
 */
function updateTimer() {
    const now = Date.now();
    const diff = now - startTime;
    const hours = Math.floor(diff / 3600000).toString().padStart(2, '0');
    const minutes = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
    const seconds = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
    timerDisplay.textContent = `${hours}:${minutes}:${seconds}`;
}

/**
 * Allows user to choose the capture source.
 */
async function pickSource() {
    try {
        if (!supportsDisplayMedia) return;

        // Reset system message
        systemMessage.classList.add('hidden');

        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }

        // Constraints with fallbacks for stricter browsers (like Brave)
        const constraints = {
            video: { cursor: "always" },
            audio: true
        };

        try {
            currentStream = await navigator.mediaDevices.getDisplayMedia(constraints);
        } catch (initialErr) {
            console.warn("Initial getDisplayMedia failed, retrying with basic constraints:", initialErr);
            // Retry with minimal constraints
            currentStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        }

        preview.srcObject = currentStream;
        
        const videoTrack = currentStream.getVideoTracks()[0];
        sourceStatus.textContent = `Source: ${videoTrack.label || 'Selected Tab/Screen'}`;
        
        // Enable Start button if source is ready
        startBtn.disabled = false;

        // Handle case where user stops sharing via browser UI
        videoTrack.onended = () => {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }
            resetToInitial();
        };

    } catch (err) {
        if (err.name === 'NotAllowedError') {
            showMessage("Permission denied. Please allow screen sharing to record.", 'info');
        } else if (err.name === 'SecurityError') {
            showMessage("Security Error: Brave Shields or browser security might be blocking the capture. Try disabling Shields for this site.", 'error');
        } else {
            console.error("Error picking source:", err);
            let msg = `Error (${err.name}): ${err.message}`;
            if (navigator.userAgent.includes("Brave")) {
                msg += " (Tip: Check your Brave Shields or Fingerprinting protection settings)";
            }
            showMessage(msg);
        }
    }
}

/**
 * Allows user to choose the save location before or after recording.
 */
async function pickSaveLocation() {
    if (!supportsFileSystemAccess) return;

    try {
        fileHandle = await window.showSaveFilePicker({
            suggestedName: `recording-${new Date().getTime()}.webm`,
            types: [{
                description: 'WebM Video',
                accept: { 'video/webm': ['.webm'] },
            }],
        });
        saveStatus.textContent = `Saving to: ${fileHandle.name}`;
        saveStatus.style.color = "var(--secondary)";
    } catch (err) {
        if (err.name === 'AbortError') {
            // User cancelled, do nothing
        } else if (err.name === 'SecurityError' || err.name === 'NotAllowedError') {
            console.warn("File System Access blocked by browser:", err);
            isFilePickerBlocked = true;
            saveStatus.textContent = "Browser blocked folder access. Using Auto-download mode.";
            saveStatus.style.color = "#fca5a5";
            // Disable button to prevent repeated errors
            pickSaveBtn.disabled = true;
            pickSaveBtn.style.opacity = "0.5";
        } else {
            console.error("Error picking save location:", err);
            saveStatus.textContent = "Error setting path. Will auto-download.";
        }
    }
}

/**
 * Starts the recording.
 */
async function startRecording() {
    if (!currentStream) return;

    recordedChunks = [];
    const options = { mimeType: 'video/webm; codecs=vp9,opus' };
    
    // Check supported types
    const types = [
        'video/webm; codecs=vp9,opus',
        'video/webm; codecs=vp8,opus',
        'video/webm'
    ];
    let selectedType = types.find(type => MediaRecorder.isTypeSupported(type));
    
    if (!selectedType) {
        showMessage("Your browser doesn't support the required recording formats.");
        return;
    }

    try {
        mediaRecorder = new MediaRecorder(currentStream, { mimeType: selectedType });

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                recordedChunks.push(e.data);
            }
        };

        mediaRecorder.onstop = async () => {
            await saveRecording();
            resetToInitial();
        };

        mediaRecorder.start();
        startTime = Date.now();
        timerInterval = setInterval(updateTimer, 1000);

        // Update UI
        startBtn.disabled = true;
        stopBtn.disabled = false;
        pickSourceBtn.disabled = true;
        statusText.textContent = "Recording...";
        document.querySelector('.status-dot').style.background = "#ef4444";
        document.querySelector('.status-dot').style.boxShadow = "0 0 8px #ef4444";
    } catch (err) {
        console.error("Error starting recording:", err);
        showMessage("Failed to start recording: " + err.message);
    }
}

/**
 * Stops the recording.
 */
function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
}

/**
 * Saves the recorded video.
 */
async function saveRecording() {
    if (recordedChunks.length === 0) return;

    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    
    try {
        // Use File System Access API if available, not blocked, and fileHandle exists or user wants to pick
        if (supportsFileSystemAccess && !isFilePickerBlocked && (fileHandle || confirm("Save to specific location? (Cancel to auto-download)"))) {
            if (!fileHandle) {
                fileHandle = await window.showSaveFilePicker({
                    suggestedName: `recording-${new Date().getTime()}.webm`,
                    types: [{
                        description: 'WebM Video',
                        accept: { 'video/webm': ['.webm'] },
                    }],
                });
            }

            const writable = await fileHandle.createWritable();
            await writable.write(blob);
            await writable.close();
            return; // Successfully saved
        }
        
        // Fallback: Auto-download
        triggerDownload(blob);

    } catch (err) {
        if (err.name === 'AbortError') {
            triggerDownload(blob);
        } else {
            console.error("Error saving file:", err);
            triggerDownload(blob);
        }
    }
}

function triggerDownload(blob) {
    try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `recording-${new Date().getTime()}.webm`;
        document.body.appendChild(a); // Append to body for better browser support
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showMessage("Recording saved to Downloads folder.", 'info');
    } catch (err) {
        console.error("Download fallback failed:", err);
        showMessage("Save failed. Your browser might be blocking the download. Check your settings.", 'error');
    }
}

/**
 * Resets the entire app to initial state.
 */
function resetToInitial() {
    clearInterval(timerInterval);
    timerDisplay.textContent = "00:00:00";
    startBtn.disabled = true;
    stopBtn.disabled = true;
    pickSourceBtn.disabled = !supportsDisplayMedia;
    statusText.textContent = "Ready to Record";
    document.querySelector('.status-dot').style.background = "#10b981";
    document.querySelector('.status-dot').style.boxShadow = "0 0 8px #10b981";
    
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
    preview.srcObject = null;
    sourceStatus.textContent = "No source selected";
    
    if (!supportsFileSystemAccess) {
        saveStatus.textContent = "Auto-download mode active";
    } else {
        saveStatus.textContent = "Auto-download if not set";
    }
    fileHandle = null;
}

pickSourceBtn.addEventListener('click', pickSource);
pickSaveBtn.addEventListener('click', pickSaveLocation);
startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);

// Run initialization
init();
