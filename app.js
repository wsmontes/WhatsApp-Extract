document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const apiKeyInput = document.getElementById('apiKeyInput');
    const zipFileInput = document.getElementById('zipFileInput');
    const processButton = document.getElementById('processButton');
    const progressSection = document.getElementById('progressSection');
    const progressBar = document.getElementById('progressBar');
    const statusText = document.getElementById('statusText');
    const currentFile = document.getElementById('currentFile');
    const viewOptions = document.getElementById('viewOptions');
    const whatsappViewSection = document.getElementById('whatsappViewSection');
    const rawTextSection = document.getElementById('rawTextSection');
    const resultContainer = document.getElementById('resultContainer');
    const downloadTextButton = document.getElementById('downloadTextButton');
    const downloadPdfButton = document.getElementById('downloadPdfButton');
    const whatsappViewBtn = document.getElementById('whatsappViewBtn');
    const rawTextBtn = document.getElementById('rawTextBtn');

    // Global variables
    let processedText = '';
    let chatLines = [];
    let audioFiles = [];
    let transcriptions = {};

    // Define the updateProgress function
    function updateProgress(percent, message) {
        if (progressBar) {
            progressBar.style.width = `${percent}%`;
        }
        if (statusText) {
            statusText.textContent = message;
        }
    }

    // Helper function to check if a file is an audio file
    function isAudioFile(fileName) {
        return fileName.match(/\.(opus|mp3|m4a|wav|ogg)$/i) || 
               fileName.includes('PTT-') ||
               fileName.includes('audio');
    }

    // Function to check if file size is within OpenAI's limits (25MB)
    function isFileSizeWithinLimits(arrayBuffer) {
        const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25MB in bytes
        return arrayBuffer.byteLength <= MAX_SIZE_BYTES;
    }

    // Function to downsample audio to reduce file size
    async function downsampleAudio(audioData, audioContext) {
        try {
            const originalBuffer = await audioContext.decodeAudioData(audioData);
            
            // Target sample rate (16000Hz is good for speech)
            const targetSampleRate = 16000;
            
            // Don't upsample, only downsample
            if (originalBuffer.sampleRate <= targetSampleRate) {
                return await convertAudioToWav(originalBuffer);
            }
            
            // Calculate new length based on sample rate change
            const originalLength = originalBuffer.length;
            const targetLength = Math.floor(originalLength * targetSampleRate / originalBuffer.sampleRate);
            const newBuffer = new AudioContext().createBuffer(1, targetLength, targetSampleRate);
            
            // Get original audio data and downsample
            const originalData = originalBuffer.getChannelData(0);
            const newData = newBuffer.getChannelData(0);
            
            // Simple downsampling - can be improved with better algorithms
            for (let i = 0; i < targetLength; i++) {
                const originalIndex = Math.floor(i * originalBuffer.sampleRate / targetSampleRate);
                newData[i] = originalData[originalIndex];
            }
            
            // Convert to WAV
            return await convertAudioToWav(newBuffer);
        } catch (error) {
            console.error('Error downsampling audio:', error);
            throw error;
        }
    }

    // Function to convert AudioBuffer to WAV
    async function convertAudioToWav(audioBuffer) {
        // Create WAV file
        const numOfChannels = 1; // Mono
        const sampleRate = audioBuffer.sampleRate;
        const length = audioBuffer.length * numOfChannels * 2 + 44;
        
        const wavBuffer = new ArrayBuffer(length);
        const view = new DataView(wavBuffer);

        // Write WAV header
        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + audioBuffer.length * numOfChannels * 2, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numOfChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numOfChannels * 2, true);
        view.setUint16(32, numOfChannels * 2, true);
        view.setUint16(34, 16, true);
        writeString(view, 36, 'data');
        view.setUint32(40, audioBuffer.length * numOfChannels * 2, true);

        // Write PCM samples
        let offset = 44;
        const channelData = audioBuffer.getChannelData(0);
        for (let i = 0; i < audioBuffer.length; i++) {
            const sample = channelData[i];
            const intSample = Math.max(-1, Math.min(1, sample));
            view.setInt16(offset, intSample < 0 ? intSample * 0x8000 : intSample * 0x7FFF, true);
            offset += 2;
        }

        return new Blob([wavBuffer], { type: 'audio/wav' });
    }

    // Function to convert .opus files to .wav
    async function convertOpusToWav(audioData, audioContext) {
        try {
            const audioBuffer = await audioContext.decodeAudioData(audioData);
            const offlineContext = new OfflineAudioContext(
                audioBuffer.numberOfChannels,
                audioBuffer.length,
                audioBuffer.sampleRate
            );
            const source = offlineContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(offlineContext.destination);
            source.start(0);
            const renderedBuffer = await offlineContext.startRendering();

            // Convert the rendered buffer to a WAV Blob
            const wavBlob = audioBufferToWav(renderedBuffer);
            return wavBlob;
        } catch (error) {
            console.error('Error converting .opus to .wav:', error);
            throw error;
        }
    }

    // Helper function to convert AudioBuffer to WAV Blob
    function audioBufferToWav(buffer) {
        const numOfChannels = buffer.numberOfChannels;
        const length = buffer.length * numOfChannels * 2 + 44;
        const wavBuffer = new ArrayBuffer(length);
        const view = new DataView(wavBuffer);

        // Write WAV header
        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + buffer.length * numOfChannels * 2, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numOfChannels, true);
        view.setUint32(24, buffer.sampleRate, true);
        view.setUint32(28, buffer.sampleRate * numOfChannels * 2, true);
        view.setUint16(32, numOfChannels * 2, true);
        view.setUint16(34, 16, true);
        writeString(view, 36, 'data');
        view.setUint32(40, buffer.length * numOfChannels * 2, true);

        // Write PCM samples
        let offset = 44;
        for (let i = 0; i < buffer.length; i++) {
            for (let channel = 0; channel < numOfChannels; channel++) {
                const sample = buffer.getChannelData(channel)[i];
                const intSample = Math.max(-1, Math.min(1, sample));
                view.setInt16(offset, intSample < 0 ? intSample * 0x8000 : intSample * 0x7FFF, true);
                offset += 2;
            }
        }

        return new Blob([wavBuffer], { type: 'audio/wav' });
    }

    // Helper function to write strings to DataView
    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    // Function to transcribe audio using OpenAI's Whisper API
    async function transcribeAudio(audioData, audioContext, apiKey, fileName) {
        try {
            // Check if demo mode is enabled
            const demoMode = document.getElementById('demoModeToggle') && 
                             document.getElementById('demoModeToggle').checked;
            
            if (demoMode) {
                // Simulate transcription for demo mode
                await new Promise(resolve => setTimeout(resolve, 500));
                const audioInfo = await analyzeAudio(audioData, audioContext);
                const durationText = audioInfo.duration !== 'unknown' 
                    ? `about ${Math.round(audioInfo.duration)} seconds` 
                    : 'unknown duration';
                return `[Demo transcription: This is a simulated result for a ${durationText} audio file. Enable real API mode to use Whisper.]`;
            }
            
            // First check if file is too large
            if (!isFileSizeWithinLimits(audioData)) {
                console.log(`File ${fileName} exceeds 25MB limit. Attempting to downsample...`);
                updateProgress(50, `Large audio file detected. Downsampling ${fileName}...`);
            }
            
            let audioBlob;
            
            try {
                // Decode and convert audio to an appropriate format
                if (fileName.endsWith('.opus') || !isFileSizeWithinLimits(audioData)) {
                    // If file is opus or too large, convert it
                    const decodedBuffer = await audioContext.decodeAudioData(audioData.slice(0));
                    
                    // Create a mono, downsampled version if needed
                    let processedBuffer;
                    if (!isFileSizeWithinLimits(audioData)) {
                        // Create a lower sample rate version
                        const offlineCtx = new OfflineAudioContext(
                            1, // mono
                            Math.floor(decodedBuffer.duration * 16000), // target sample rate
                            16000 // target sample rate
                        );
                        
                        const source = offlineCtx.createBufferSource();
                        source.buffer = decodedBuffer;
                        source.connect(offlineCtx.destination);
                        source.start(0);
                        
                        processedBuffer = await offlineCtx.startRendering();
                    } else {
                        processedBuffer = decodedBuffer;
                    }
                    
                    // Convert to WAV
                    audioBlob = await convertAudioToWav(processedBuffer);
                } else {
                    // For other formats, use as is
                    audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
                }
                
                // Check final size after processing
                if (audioBlob.size > 25 * 1024 * 1024) {
                    throw new Error(`File is still too large (${Math.round(audioBlob.size/1024/1024)}MB) after processing. Maximum size is 25MB.`);
                }
                
                // Send to OpenAI
                const formData = new FormData();
                formData.append('file', audioBlob, fileName.replace('.opus', '.wav'));
                formData.append('model', 'whisper-1');
                
                const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: formData
                });
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || response.statusText || 'Unknown error'}`);
                }
                
                const data = await response.json();
                return data.text;
            } catch (error) {
                console.error('Error processing audio:', error);
                throw error;
            }
        } catch (error) {
            console.error('Transcription error:', error);
            throw error;
        }
    }

    // Function to analyze audio properties
    async function analyzeAudio(audioData, audioContext) {
        return new Promise((resolve, reject) => {
            try {
                audioContext.decodeAudioData(
                    audioData,
                    (buffer) => {
                        const duration = buffer.duration;
                        const sampleRate = buffer.sampleRate;
                        const channels = buffer.numberOfChannels;
                        resolve({ duration, sampleRate, channels });
                    },
                    (error) => {
                        console.error('Error decoding audio:', error);
                        reject(error);
                    }
                );
            } catch (error) {
                console.error('Audio analysis error:', error);
                reject(error);
            }
        });
    }

    // Process button click handler
    if (processButton) {
        processButton.addEventListener('click', async () => {
            if (!zipFileInput || !zipFileInput.files[0]) {
                alert('Please select a ZIP file first.');
                return;
            }

            const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
            if (!apiKey) {
                alert('Please enter your OpenAI API key for transcription.');
                return;
            }

            try {
                console.log('Starting processing of ZIP file:', zipFileInput.files[0].name);
                // Show progress section
                if (progressSection) {
                    progressSection.style.display = 'block';
                }

                updateProgress(0, 'Reading ZIP file...');

                // Read the ZIP file
                const zipFile = zipFileInput.files[0];
                const zip = await JSZip.loadAsync(zipFile);
                console.log('ZIP file loaded, contents:', Object.keys(zip.files));

                // Extract chat text file
                updateProgress(10, 'Extracting chat text...');
                let chatFile = null;

                // Look for common WhatsApp chat file names
                const possibleChatFiles = ['_chat.txt', 'chat.txt', 'WhatsApp Chat.txt'];
                for (const fileName of possibleChatFiles) {
                    if (zip.files[fileName]) {
                        chatFile = zip.files[fileName];
                        console.log('Found chat file:', fileName);
                        break;
                    }
                }

                // If chat file not found, try to find it using regex
                if (!chatFile) {
                    console.log('No standard chat file found, searching with regex...');
                    for (const fileName in zip.files) {
                        if (fileName.match(/chat.*\.txt$/i) && !zip.files[fileName].dir) {
                            chatFile = zip.files[fileName];
                            console.log('Found chat file with regex:', fileName);
                            break;
                        }
                    }
                }

                if (!chatFile) {
                    console.error('No chat file found in the ZIP');
                    throw new Error('Chat text file not found in the ZIP. Please ensure this is a valid WhatsApp chat export.');
                }

                // Parse chat text
                const chatText = await chatFile.async('text');
                console.log('Chat text extracted, first 200 chars:', chatText.substring(0, 200));
                console.log('Total chat text length:', chatText.length);

                chatLines = parseChatText(chatText);
                console.log(`Parsed ${chatLines.length} chat lines`);
                updateProgress(20, 'Identifying audio files...');

                // Find audio files in the ZIP
                audioFiles = [];
                let mediaStats = {
                    audio: 0,
                    photo: 0,
                    video: 0,
                    sticker: 0,
                    document: 0,
                    other: 0,
                };

                console.log('Scanning for media files...');
                for (const fileName in zip.files) {
                    if (!zip.files[fileName].dir) {
                        if (isAudioFile(fileName)) {
                            console.log('Found audio file:', fileName);
                            audioFiles.push({
                                name: fileName,
                                file: zip.files[fileName]
                            });
                            mediaStats.audio++;
                        } else if (fileName.match(/\.(jpg|jpeg|png|gif)$/i) || fileName.includes('PHOTO')) {
                            mediaStats.photo++;
                        } else if (fileName.match(/\.(mp4|mov|avi)$/i) || fileName.includes('VIDEO')) {
                            mediaStats.video++;
                        } else if (fileName.match(/\.(webp)$/i) || fileName.includes('STICKER')) {
                            mediaStats.sticker++;
                        } else if (fileName.match(/\.(pdf|doc|docx|xls)$/i) || fileName.includes('DOCUMENT')) {
                            mediaStats.document++;
                        } else if (!fileName.endsWith('.txt')) {
                            mediaStats.other++;
                        }
                    }
                }

                console.log('Media stats:', mediaStats);
                updateProgress(30, `Found ${audioFiles.length} audio files.`);

                // Process audio files
                if (audioFiles.length > 0) {
                    console.log('Beginning audio processing...');
                    // Create audio context for analysis
                    const AudioContext = window.AudioContext || window.webkitAudioContext;
                    const audioContext = new AudioContext();

                    let count = 0;
                    for (const audioFile of audioFiles) {
                        count++;
                        console.log(`\n==== PROCESSING AUDIO FILE ${count}/${audioFiles.length} ====`);
                        console.log(`File name: ${audioFile.name}`);

                        updateProgress(
                            30 + (50 * count / audioFiles.length),
                            `Analyzing audio files (${count}/${audioFiles.length})...`
                        );
                        if (currentFile) {
                            currentFile.textContent = `Processing: ${audioFile.name}`;
                        }

                        try {
                            // Get audio data as ArrayBuffer
                            const audioData = await audioFile.file.async('arraybuffer');
                            console.log(`Audio file ${audioFile.name} loaded, size: ${audioData.byteLength} bytes`);

                            // Transcribe the audio using OpenAI's Whisper API
                            const transcript = await transcribeAudio(audioData, audioContext, apiKey, audioFile.name);
                            console.log(`Transcription result for ${audioFile.name}:`, transcript);

                            console.log(`ADDING TRANSCRIPT MAPPING: ${audioFile.name} -> ${transcript}`);
                            transcriptions[audioFile.name] = transcript;
                        } catch (error) {
                            console.error(`Failed to transcribe ${audioFile.name}:`, error);
                            transcriptions[audioFile.name] = `[Audio transcription failed: ${error.message}]`;
                        }
                    }

                    console.log("\n==== ALL TRANSCRIPTIONS GENERATED ====");
                    for (const fileName in transcriptions) {
                        console.log(`${fileName}: ${transcriptions[fileName]}`);
                    }
                }

                // Update to display both raw text and WhatsApp-style view
                updateProgress(90, 'Merging transcriptions with chat...');
                console.log('Beginning merge of chat and transcriptions');
                console.log('Number of transcriptions:', Object.keys(transcriptions).length);

                // Get both raw text and structured data for the UI
                const { rawText, structuredData } = mergeChatWithTranscriptions(chatLines, transcriptions);
                processedText = rawText;
                console.log('Processing complete!');

                // Display the results
                if (resultContainer) {
                    resultContainer.textContent = processedText;
                }
                renderWhatsAppView(structuredData);

                // Show the view options and WhatsApp view
                if (viewOptions) {
                    viewOptions.style.display = 'block';
                }
                if (whatsappViewSection) {
                    whatsappViewSection.style.display = 'block';
                }
                if (rawTextSection) {
                    rawTextSection.style.display = 'none';
                }
                updateProgress(100, 'Processing complete!');
                console.log('Processing complete!');
            } catch (error) {
                console.error('Error processing ZIP file:', error);
                updateProgress(0, `Error: ${error.message}`);
            }
        });
    }

    // Add a demo simulation function
    async function simulateTranscription(audioData, audioContext, fileName) {
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate API delay
        
        try {
            const audioInfo = await analyzeAudio(audioData, audioContext);
            const durationText = audioInfo.duration !== 'unknown' 
                ? `about ${Math.round(audioInfo.duration)} seconds` 
                : 'unknown duration';
                
            return `[Demo transcription: This is a simulated result for a ${durationText} audio file. Enable real API mode to use Whisper.]`;
        } catch (error) {
            return `[Demo transcription: This is a simulated result for an audio file. Enable real API mode to use Whisper.]`;
        }
    }

    // Download button handlers
    if (downloadTextButton) {
        downloadTextButton.addEventListener('click', () => {
            if (!processedText) return;

            const blob = new Blob([processedText], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = 'WhatsApp_Chat_With_Transcriptions.txt';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }

    if (downloadPdfButton) {
        downloadPdfButton.addEventListener('click', () => {
            const element = document.getElementById('whatsappContainer');
            if (!element) return;

            // Set some PDF options
            const opt = {
                margin: 10,
                filename: 'WhatsApp_Chat_With_Transcriptions.pdf',
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            // Generate the PDF
            html2pdf().set(opt).from(element).save();
        });
    }

    if (whatsappViewBtn) {
        whatsappViewBtn.addEventListener('click', function() {
            this.classList.add('active');
            if (rawTextBtn) rawTextBtn.classList.remove('active');
            if (whatsappViewSection) whatsappViewSection.style.display = 'block';
            if (rawTextSection) rawTextSection.style.display = 'none';
        });
    }

    if (rawTextBtn) {
        rawTextBtn.addEventListener('click', function() {
            this.classList.add('active');
            if (whatsappViewBtn) whatsappViewBtn.classList.remove('active');
            if (whatsappViewSection) whatsappViewSection.style.display = 'none';
            if (rawTextSection) rawTextSection.style.display = 'block';
        });
    }

    // Analyze audio sources and classify them by speaker
    function analyzeAudioSources(messages) {
        // Extract just audio transcripts
        const audioMessages = messages.filter(msg => msg.type === 'audio');

        if (audioMessages.length < 2) return messages;

        // Group by sender first
        const senderGroups = {};
        audioMessages.forEach(msg => {
            if (!senderGroups[msg.sender]) {
                senderGroups[msg.sender] = [];
            }
            senderGroups[msg.sender].push(msg);
        });

        // For each sender, analyze if there might be multiple voices
        Object.keys(senderGroups).forEach(sender => {
            const messages = senderGroups[sender];
            // Simple heuristic: if message lengths vary significantly, might be different speakers
            if (messages.length >= 3) {
                const avgLength = messages.reduce((sum, msg) => sum + msg.content.length, 0) / messages.length;
                const stdDev = Math.sqrt(messages.reduce((sum, msg) => {
                    return sum + Math.pow(msg.content.length - avgLength, 2);
                }, 0) / messages.length);

                // If high variance, might be different speakers
                if (stdDev > avgLength * 0.5) {
                    // Group by message length patterns (rough approximation of voice patterns)
                    const shortMessages = messages.filter(msg => msg.content.length < avgLength * 0.7);
                    const mediumMessages = messages.filter(msg => 
                        msg.content.length >= avgLength * 0.7 && msg.content.length <= avgLength * 1.3);
                    const longMessages = messages.filter(msg => msg.content.length > avgLength * 1.3);

                    shortMessages.forEach(msg => {
                        msg.voiceGroup = `${sender} (Brief)`;
                        msg.voiceClass = 'voice-brief';
                    });

                    mediumMessages.forEach(msg => {
                        msg.voiceGroup = `${sender}`;
                        msg.voiceClass = 'voice-normal';
                    });

                    longMessages.forEach(msg => {
                        msg.voiceGroup = `${sender} (Detailed)`;
                        msg.voiceClass = 'voice-detailed';
                    });
                }
            }

            // Look for name references in the content
            messages.forEach(msg => {
                // Look for patterns like "Tell X", "Ask Y", "Say to Z"
                const nameRefPattern = /\b(?:tell|ask|say to|from|for)\s+([A-Z][a-z]+)\b/i;
                const match = msg.content.match(nameRefPattern);
                if (match && match[1]) {
                    const potentialName = match[1];
                    // Check if this name exists in our participants list
                    if (potentialName.length > 2 && potentialName !== sender) {
                        msg.mentionedPerson = potentialName;
                        if (!msg.voiceGroup) {
                            msg.voiceGroup = `${sender} → ${potentialName}`;
                            msg.voiceClass = 'voice-mention';
                        }
                    }
                }
            });
        });

        return messages;
    }

    // Render the WhatsApp-style interface
    function renderWhatsAppView(data) {
        // Set chat title and participants
        document.getElementById('chatTitle').textContent = data.title || 'WhatsApp Chat';
        document.getElementById('participantsInfo').textContent = data.participants.join(', ');

        // Get container for messages
        const messagesContainer = document.getElementById('messagesContainer');
        messagesContainer.innerHTML = '';

        // Analyze audio sources to identify different speakers/sources
        const analyzedMessages = analyzeAudioSources(data.messages);

        // Determine if we're in a dialogue (exactly 2 participants)
        const isDialogue = data.participants.length === 2;

        // Process each message
        let currentDay = null;

        analyzedMessages.forEach(msg => {
            // Check if it's a new day
            const messageDate = new Date(msg.timestamp);
            const day = messageDate.toDateString();

            if (day !== currentDay) {
                currentDay = day;
                // Add date divider
                const dateDivider = document.createElement('div');
                dateDivider.className = 'date-divider';
                dateDivider.innerHTML = `
                    <div class="date-badge">${day}</div>
                `;
                messagesContainer.appendChild(dateDivider);
            }

            // Create message element
            const messageEl = document.createElement('div');
            messageEl.className = 'message message-tail';

            // Determine if message is sent or received
            const myName = data.participants[0]; // Assuming first participant is "me"
            const isFromMe = msg.sender === myName;
            messageEl.classList.add(isFromMe ? 'sent' : 'received');

            // Add special class for audio transcripts
            if (msg.type === 'audio') {
                messageEl.classList.add('audio-transcript');
            }

            // Format time
            const time = messageDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Structure content based on message type
            let contentHtml = '';
            let senderHtml = '';

            // Add sender name for all messages in a dialogue, or only received messages in a group
            if (isDialogue || !isFromMe) {
                senderHtml = `<div class="message-sender">${msg.sender}</div>`;
            }

            // Format content based on message type
            switch (msg.type) {
                case 'text':
                    contentHtml = `<div class="message-content">${formatMessageText(msg.content)}</div>`;
                    break;

                case 'audio':
                    // If we have a voice group, show it
                    let voiceLabel = '';
                    if (msg.voiceGroup && msg.voiceGroup !== msg.sender) {
                        const voiceClass = msg.voiceClass || '';
                        voiceLabel = `<div class="audio-source-label ${voiceClass}">${msg.voiceGroup}</div>`;
                    }

                    contentHtml = `
                        <div class="message-content">
                            ${voiceLabel}
                            <span class="media-indicator">🔊</span> 
                            ${formatAudioTranscription(msg.content)}
                        </div>
                    `;
                    break;

                case 'photo':
                    contentHtml = `
                        <div class="message-content">
                            <span class="media-indicator">📷</span> 
                            Photo: ${msg.fileName || ''}
                        </div>
                    `;
                    break;

                case 'video':
                    contentHtml = `
                        <div class="message-content">
                            <span class="media-indicator">🎥</span> 
                            Video: ${msg.fileName || ''}
                        </div>
                    `;
                    break;

                case 'sticker':
                    contentHtml = `
                        <div class="message-content">
                            <span class="media-indicator">🏷️</span> 
                            Sticker
                        </div>
                    `;
                    break;

                case 'document':
                    contentHtml = `
                        <div class="message-content">
                            <span class="media-indicator">📄</span> 
                            Document: ${msg.fileName || ''}
                        </div>
                    `;
                    break;

                default:
                    contentHtml = `<div class="message-content">${msg.content || ''}</div>`;
            }

            // Build the message HTML
            messageEl.innerHTML = `
                ${senderHtml}
                ${contentHtml}
                <div class="message-meta">
                    <span class="message-time">${time}</span>
                </div>
            `;

            // Add to containers
            messagesContainer.appendChild(messageEl);
        });

        // Scroll to the bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Format regular text messages with line breaks and links
    function formatMessageText(text) {
        if (!text) return '';

        // Convert URLs to clickable links
        text = text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');

        // Convert line breaks to <br>
        return text.replace(/\n/g, '<br>');
    }

    // Format audio transcription into natural sentences
    function formatAudioTranscription(text) {
        if (!text) return '';

        // Remove any "[Audio content]" or similar prefixes
        text = text.replace(/\[Audio .*?\]:\s*/g, '');

        // Split long transcriptions into more natural chunks based on punctuation
        const sentences = text.match(/[^\.!\?]+[\.!\?]+/g) || [text];

        return sentences.join('<br>');
    }

    // Enhanced version of mergeChatWithTranscriptions to return both raw text and structured data
    function mergeChatWithTranscriptions(chatLines, transcriptions) {
        console.log('\n==== STARTING MERGE PROCESS ====');
        console.log('Number of chat lines:', chatLines.length);
        console.log('Number of transcriptions:', Object.keys(transcriptions).length);

        let rawText = '';
        let structuredData = {
            title: 'WhatsApp Chat',
            participants: new Set(),
            messages: []
        };

        let audioMessagesFound = 0;
        let audioMessagesMatched = 0;

        // Process each chat line
        for (const line of chatLines) {
            if (line.type === 'message') {
                // Add participant to set
                if (line.sender) {
                    structuredData.participants.add(line.sender);
                }

                // Check if this is an audio message
                const isAudioMsg = line.message && (
                    line.message.includes('<attached: ') && 
                    (line.message.includes('.opus>') || 
                     line.message.includes('.mp3>') || 
                     line.message.includes('PTT-') || 
                     line.message.includes('audio'))
                );

                if (isAudioMsg) {
                    audioMessagesFound++;

                    // Extract the file name
                    const fileNameMatch = line.message.match(/<attached:\s*([^>]+)>/);
                    let fileName = fileNameMatch ? fileNameMatch[1].trim() : null;

                    if (fileName) {
                        // Look for a transcription of this audio file
                        let transcription = "[Audio content]";
                        let transcriptionFound = false;

                        // Try to match with a transcription
                        for (const transFileName in transcriptions) {
                            // Direct match
                            if (transFileName.includes(fileName) || fileName.includes(transFileName)) {
                                transcription = transcriptions[transFileName];
                                transcriptionFound = true;
                                audioMessagesMatched++;
                                break;
                            }

                            // Try pattern matching (date/time based)
                            const fileDate = extractDateFromFileName(fileName);
                            const transDate = extractDateFromFileName(transFileName);

                            if (fileDate && transDate && Math.abs(fileDate - transDate) < 5000) { // Within 5 seconds
                                transcription = transcriptions[transFileName];
                                transcriptionFound = true;
                                audioMessagesMatched++;
                                break;
                            }
                        }

                        // Add to structured data for WhatsApp view
                        structuredData.messages.push({
                            type: 'audio',
                            sender: line.sender,
                            timestamp: line.timestamp,
                            content: transcription,
                            fileName: fileName
                        });

                        // Add to raw text
                        rawText += `${formatChatLine(line.timestamp, line.sender)}: 🔊 AUDIO: ${transcription}\n`;
                    }
                } else {
                    // Regular text message
                    structuredData.messages.push({
                        type: 'text',
                        sender: line.sender,
                        timestamp: line.timestamp,
                        content: line.message
                    });

                    // Add to raw text
                    rawText += `${formatChatLine(line.timestamp, line.sender)}: ${line.message}\n`;
                }
            } else if (line.type === 'system') {
                // System message like "Messages to this group are now secured with end-to-end encryption"
                rawText += `--- ${line.message} ---\n`;

                // Add to structured data with special type
                structuredData.messages.push({
                    type: 'system',
                    timestamp: new Date(),
                    content: line.message
                });
            }
        }

        // Look for unmatched media files in the transcript that might be photos, videos, etc.
        for (const line of chatLines) {
            if (line.type === 'message' && line.message) {
                // Check for other media types
                const mediaPatterns = [
                    { regex: /<attached:\s*(.*\.jpg|.*\.jpeg|.*\.png)>/, type: 'photo' },
                    { regex: /<attached:\s*(.*\.mp4|.*\.mov|.*\.avi)>/, type: 'video' },
                    { regex: /<attached:\s*(.*\.webp|.*STICKER.*)>/, type: 'sticker' },
                    { regex: /<attached:\s*(.*\.pdf|.*\.doc|.*\.xls)>/, type: 'document' }
                ];

                for (const pattern of mediaPatterns) {
                    const match = line.message.match(pattern.regex);
                    if (match) {
                        const fileName = match[1].trim();

                        // Add to structured data
                        structuredData.messages.push({
                            type: pattern.type,
                            sender: line.sender,
                            timestamp: line.timestamp,
                            fileName: fileName
                        });

                        // Add to raw text
                        const icon = pattern.type === 'photo' ? '📷' : 
                                    pattern.type === 'video' ? '🎥' : 
                                    pattern.type === 'sticker' ? '🏷️' : '📄';

                        rawText += `${formatChatLine(line.timestamp, line.sender)}: ${icon} [${pattern.type.charAt(0).toUpperCase() + pattern.type.slice(1)}: ${fileName}]\n`;
                        break;
                    }
                }
            }
        }

        console.log(`\n==== MERGE COMPLETE ====`); 
        console.log(`Total audio messages found: ${audioMessagesFound}`);
        console.log(`Audio messages with matched transcriptions: ${audioMessagesMatched}`);

        // Convert participants set to array
        structuredData.participants = Array.from(structuredData.participants);

        // Sort messages by timestamp
        structuredData.messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        return { rawText, structuredData };
    }

    // Helper function to format chat timestamp and sender
    function formatChatLine(timestamp, sender) {
        return `[${formatTimestamp(timestamp)}] - ${sender}`;
    }

    // Format timestamp consistently
    function formatTimestamp(timestamp) {
        if (timestamp instanceof Date) {
            return timestamp.toLocaleString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        }
        return timestamp.toString();
    }

    // Extract date from filename (common in WhatsApp audio files)
    function extractDateFromFileName(fileName) {
        const dateMatch = fileName.match(/(\d{4})[-_]?(\d{2})[-_]?(\d{2})/);
        if (dateMatch) {
            const [_, year, month, day] = dateMatch;

            const timeMatch = fileName.match(/(\d{2})[-_]?(\d{2})[-_]?(\d{2})/);
            if (timeMatch && timeMatch.index > dateMatch.index) {
                const [__, hour, minute, second] = timeMatch;
                return new Date(year, month - 1, day, hour, minute, second).getTime();
            }
            return new Date(year, month - 1, day).getTime();
        }
        return null;
    }

    // Function to parse chat text into structured format
    function parseChatText(chatText) {
        const lines = chatText.split(/\r?\n/);

        // Detect the timestamp format
        const timestampFormat = detectTimestampFormat(chatText);
        console.log('Detected timestamp format:', timestampFormat);

        // Define regex patterns based on format
        let messageRegex;
        switch (timestampFormat) {
            case 'MM/DD/YY':
                messageRegex = /\[(\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)\]\s+([^:]+):\s*(.*)/i;
                break;
            case 'DD/MM/YYYY':
                messageRegex = /(\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}(?::\d{2})?)\s*-\s*([^:]+):\s*(.*)/i;
                break;
            case 'YYYY-MM-DD':
                messageRegex = /\[(\d{4}-\d{1,2}-\d{1,2},\s*\d{1,2}:\d{2}(?::\d{2})?)\]\s+([^:]+):\s*(.*)/i;
                break;
            default:
                // Generic fallback pattern
                messageRegex = /(?:\[|)(\d{1,4}[-\/]\d{1,2}[-\/]\d{1,4},?\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM))?)(?:\]|\s-)\s*([^:]+):\s*(.*)/i;
        }

        // System message patterns
        const systemMessagePattern = /(?:\[|)(\d{1,4}[-\/]\d{1,2}[-\/]\d{1,4},?\s*\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:AM|PM))?)(?:\]|\s-)\s*(.+)/i;

        // Process each line
        let currentMessage = null;
        const parsedLines = [];
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine) continue;

            // Check if it's a new message
            const match = trimmedLine.match(messageRegex);
            if (match) {
                // It's a new message
                const [_, timestamp, sender, message] = match;
                currentMessage = {
                    type: 'message',
                    timestamp: timestamp,
                    sender: sender.trim(),
                    message: message
                };
                parsedLines.push(currentMessage);
            } else if (currentMessage) {
                // Check if it might be a system message
                const systemMatch = trimmedLine.match(systemMessagePattern);
                if (systemMatch && !parsedLines.some(l => l.message === systemMatch[2])) {
                    // System message (no sender)
                    parsedLines.push({
                        type: 'system',
                        timestamp: systemMatch[1],
                        message: systemMatch[2]
                    });
                } else {
                    // It's a continuation of the previous message
                    currentMessage.message += '\n' + trimmedLine;
                }
            }
        }
        return parsedLines;
    }

    // Detect timestamp format from sample chat text
    function detectTimestampFormat(chatText) {
        // Sample the first few lines to detect format
        const lines = chatText.split(/\r?\n/).slice(0, 10).join('\n');

        // Check for [MM/DD/YY, HH:MM:SS AM/PM] format
        if (lines.match(/\[\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?\]/i)) {
            return 'MM/DD/YY';
        }

        // Check for DD/MM/YYYY, HH:MM - format
        if (lines.match(/\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}(?::\d{2})?\s*-/i)) {
            return 'DD/MM/YYYY';
        }

        // Check for [YYYY-MM-DD, HH:MM:SS] format
        if (lines.match(/\[\d{4}-\d{1,2}-\d{1,2},\s*\d{1,2}:\d{2}(?::\d{2})?\]/i)) {
            return 'YYYY-MM-DD';
        }

        // Default format
        return 'unknown';
    }
});
