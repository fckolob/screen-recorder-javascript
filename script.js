const preview = document.getElementById('preview');
const pickSourceBtn = document.getElementById('pick-source-btn');
const pickSaveBtn = document.getElementById('pick-save-btn');
const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const timerDisplay = document.getElementById('recording-timer');
const statusText = document.getElementById('status-text');
const sourceStatus = document.getElementById('source-status');
const saveStatus = document.getElementById('save-status');

let mediaRecorder;
let recordedChunks = [];
let startTime;
let timerInterval;
let currentStream = null;
let fileHandle = null;

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
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }

        currentStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: "always", displaySurface: "browser" },
            audio: { echoCancellation: true, noiseSuppression: true }
        });

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
        console.error("Error picking source:", err);
        sourceStatus.textContent = "Error selecting source.";
    }
}

/**
 * Allows user to choose the save location before or after recording.
 */
async function pickSaveLocation() {
    try {
        fileHandle = await window.showSaveFilePicker({
            suggestedName: `recording-${new Date().getTime()}.webm`,
            types: [{
                description: 'WebM Video',
                accept: { 'video/webm': ['.webm'] },
            }],
        });
        saveStatus.textContent = `Saving to: ${fileHandle.name}`;
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.error("Error picking save location:", err);
            saveStatus.textContent = "Error setting save path.";
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
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm';
    }

    mediaRecorder = new MediaRecorder(currentStream, options);

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
        // If fileHandle wasn't pre-selected, ask now
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
        alert(`Saved successfully to ${fileHandle.name}`);

    } catch (err) {
        if (err.name === 'AbortError') {
            // Fallback to auto-download if cancelled
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `recording-${new Date().getTime()}.webm`;
            a.click();
            URL.revokeObjectURL(url);
            alert("Save cancelled. Downloaded to default folder.");
        } else {
            console.error("Error saving file:", err);
            alert("Error saving file.");
        }
    }
}

/**
 * Resets the entire app to initial state.
 */
function resetToInitial() {
    clearInterval(timerInterval);
    timerDisplay.textContent = "00:00:00";
    startBtn.disabled = true; // Needs source again
    stopBtn.disabled = true;
    pickSourceBtn.disabled = false;
    statusText.textContent = "Ready to Record";
    document.querySelector('.status-dot').style.background = "#10b981";
    document.querySelector('.status-dot').style.boxShadow = "0 0 8px #10b981";
    
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
    preview.srcObject = null;
    sourceStatus.textContent = "No source selected";
    saveStatus.textContent = "Auto-download if not set";
    fileHandle = null;
}

pickSourceBtn.addEventListener('click', pickSource);
pickSaveBtn.addEventListener('click', pickSaveLocation);
startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
