document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const apiKeyInput = document.getElementById('apiKeyInput');
    const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
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
    let mediaFiles = {}; // Store references to extracted media files

    // Load saved API key if exists
    function loadSavedApiKey() {
        const savedApiKey = localStorage.getItem('whatsapp_extract_api_key');
        if (savedApiKey && apiKeyInput) {
            apiKeyInput.value = savedApiKey;
        }
    }

    // Save API key to localStorage
    function saveApiKey(apiKey) {
        if (apiKey) {
            localStorage.setItem('whatsapp_extract_api_key', apiKey);
            alert('API key saved successfully!');
        } else {
            alert('Please enter an API key to save.');
        }
    }

    // Initialize saved API key
    loadSavedApiKey();

    // Add event listener for save button
    if (saveApiKeyBtn) {
        saveApiKeyBtn.addEventListener('click', () => {
            const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
            saveApiKey(apiKey);
        });
    }

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

    // Helper function to write strings to DataView - must be defined before it's used
    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    // Enhanced function to downsample audio to reduce file size
    async function downsampleAudio(audioData, audioContext, fileName) {
        try {
            const originalBuffer = await audioContext.decodeAudioData(audioData.slice(0));
            const originalSize = audioData.byteLength;
            console.log(`Original audio size: ${(originalSize / (1024 * 1024)).toFixed(2)}MB`);
            
            // Calculate how aggressive we need to be with downsampling based on original size
            const MAX_SIZE = 25 * 1024 * 1024; // 25MB
            const sizeRatio = originalSize / MAX_SIZE;
            const compressionFactor = Math.min(Math.ceil(sizeRatio), 5); // Scale up to 5 for extremely large files
            console.log(`Size ratio: ${sizeRatio.toFixed(2)}, using compression factor: ${compressionFactor}`);
            
            // Check if we need to partition the file
            const needsPartitioning = sizeRatio > 2.5 || originalBuffer.duration > 600; // Over 2.5x size ratio or 10 minutes
            
            // If file needs partitioning, we'll use a different approach
            if (needsPartitioning) {
                console.log(`File is very large - will use partitioning approach`);
                return await partitionAndProcessAudio(originalBuffer, fileName);
            }
            
            // Target sample rate - more aggressive for larger files
            let targetSampleRate;
            if (compressionFactor >= 5) {
                targetSampleRate = 5000; // Extremely aggressive for massive files
            } else if (compressionFactor >= 4) {
                targetSampleRate = 6000; // Very aggressive for very large files
            } else if (compressionFactor >= 3) {
                targetSampleRate = 8000; // Aggressive for large files
            } else if (compressionFactor >= 2) {
                targetSampleRate = 11025; // Moderately aggressive
            } else {
                targetSampleRate = 16000; // Standard
            }
            
            console.log(`Target sample rate: ${targetSampleRate}Hz (original: ${originalBuffer.sampleRate}Hz)`);
            
            // Don't upsample, only downsample
            if (originalBuffer.sampleRate <= targetSampleRate) {
                targetSampleRate = originalBuffer.sampleRate;
            }
            
            // Always convert to mono
            const numChannels = 1;
            console.log(`Using ${numChannels} channel(s)`);
            
            // Calculate new length based on sample rate change
            const originalLength = originalBuffer.length;
            const targetLength = Math.floor(originalLength * targetSampleRate / originalBuffer.sampleRate);
            const durationSeconds = originalBuffer.duration;
            
            console.log(`Original duration: ${Math.round(durationSeconds)}s`);
            
            // Define max duration based on compression factor
            const MAX_DURATION_SEC = compressionFactor >= 4 ? 300 : // 5 mins for massive files
                                   compressionFactor >= 3 ? 600 : // 10 mins for very large files
                                   compressionFactor >= 2 ? 1200 : // 20 mins for large files
                                   1800; // 30 mins otherwise
            
            // Calculate final length based on max duration
            let finalLength = targetLength;
            let truncated = false;
            
            if (durationSeconds > MAX_DURATION_SEC) {
                finalLength = Math.floor(MAX_DURATION_SEC * targetSampleRate);
                truncated = true;
                console.log(`Audio too long (${Math.round(durationSeconds)}s), truncating to ${MAX_DURATION_SEC}s`);
            }
            
            // Create new buffer with target parameters
            const newBuffer = new AudioContext().createBuffer(numChannels, finalLength, targetSampleRate);
            
            // Mix down to mono and apply downsampling
            const newChannelData = newBuffer.getChannelData(0);
            
            // For mono conversion, average all original channels
            for (let i = 0; i < finalLength; i++) {
                const originalIndex = Math.floor(i * originalBuffer.sampleRate / targetSampleRate);
                if (originalIndex >= originalLength) break;
                
                let sum = 0;
                for (let c = 0; c < originalBuffer.numberOfChannels; c++) {
                    sum += originalBuffer.getChannelData(c)[originalIndex];
                }
                newChannelData[i] = sum / originalBuffer.numberOfChannels;
            }
            
            // Apply amplitude normalization
            let maxAmplitude = 0;
            
            // First pass: find max amplitude
            for (let i = 0; i < finalLength; i++) {
                maxAmplitude = Math.max(maxAmplitude, Math.abs(newChannelData[i]));
            }
            
            // Scale factor to normalize to 80% of max amplitude (to prevent clipping)
            const normalizationFactor = maxAmplitude > 0 ? 0.8 / maxAmplitude : 1;
            
            // Second pass: apply normalization
            for (let i = 0; i < finalLength; i++) {
                newChannelData[i] *= normalizationFactor;
            }
            
            // For large files, apply dynamic range compression
            if (compressionFactor >= 2) {
                const threshold = 0.5;  // Only compress samples above 50% amplitude
                const ratio = 2 + compressionFactor; // Higher ratio for larger files
                
                for (let i = 0; i < finalLength; i++) {
                    const sample = newChannelData[i];
                    const absSample = Math.abs(sample);
                    
                    if (absSample > threshold) {
                        // Amount above threshold
                        const excess = absSample - threshold;
                        // Compressed excess
                        const compressedExcess = excess / ratio;
                        // New absolute value
                        const newAbsSample = threshold + compressedExcess;
                        // Keep original sign
                        newChannelData[i] = sample >= 0 ? newAbsSample : -newAbsSample;
                    }
                }
            }
            
            // Convert to WAV (with reduced bit depth for large files)
            const bitDepth = compressionFactor >= 3 ? 8 : 16; // Use 8-bit for very large files
            console.log(`Using ${bitDepth}-bit depth for compression`);
            
            const wavBlob = await convertAudioToWav(newBuffer, bitDepth);
            
            // Log compression results
            console.log(`Compressed audio size: ${(wavBlob.size / (1024 * 1024)).toFixed(2)}MB`);
            console.log(`Compression ratio: ${(originalSize / wavBlob.size).toFixed(2)}x`);
            
            // If the result is still too large, fall back to emergency compression
            if (wavBlob.size > MAX_SIZE) {
                console.warn(`Warning: File is still ${(wavBlob.size / (1024 * 1024)).toFixed(2)}MB after processing. `+
                            `Trying partitioning approach...`);
                
                // Use partitioning as a fallback for files still too large
                return await partitionAndProcessAudio(originalBuffer, fileName);
            }
            
            return wavBlob;
        } catch (error) {
            console.error('Error downsampling audio:', error);
            throw error;
        }
    }

    // New function to partition audio and create manageable chunks
    async function partitionAndProcessAudio(audioBuffer, fileName) {
        const MAX_CHUNK_SIZE = 20 * 1024 * 1024; // 20MB target for chunks (leaving headroom)
        const MAX_CHUNK_DURATION = 360; // 6 minutes per chunk maximum
        const MIN_CHUNK_DURATION = 120; // 2 minutes minimum per chunk
        
        console.log(`Starting audio partitioning for ${fileName}`);
        console.log(`Original duration: ${Math.round(audioBuffer.duration)}s`);
        
        // Determine optimal chunk count
        // Balance between duration-based and size-based chunking
        let chunkCount = Math.max(
            Math.ceil(audioBuffer.duration / MAX_CHUNK_DURATION),
            Math.ceil(audioBuffer.length * audioBuffer.numberOfChannels * 4 / MAX_CHUNK_SIZE)
        );
        
        // Ensure we don't make chunks too small
        const avgChunkDuration = audioBuffer.duration / chunkCount;
        if (avgChunkDuration < MIN_CHUNK_DURATION && audioBuffer.duration > MIN_CHUNK_DURATION) {
            chunkCount = Math.floor(audioBuffer.duration / MIN_CHUNK_DURATION);
        }
        
        console.log(`Splitting audio into ${chunkCount} chunks`);
        
        // Mark that we're using partitioning approach
        window.isUsingPartitioning = true;
        window.totalChunks = chunkCount;
        window.currentChunk = 0;
        
        // Calculate chunk parameters
        const sampleRate = 16000; // Use consistent sample rate for all chunks
        const chunkDurationSecs = audioBuffer.duration / chunkCount;
        const samplesPerChunk = Math.floor(chunkDurationSecs * sampleRate);
        const originalSamplesPerChunk = Math.floor(chunkDurationSecs * audioBuffer.sampleRate);
        
        // Store processed chunks
        const processedChunks = [];
        
        // Process each chunk
        for (let i = 0; i < chunkCount; i++) {
            window.currentChunk = i + 1;
            updateProgress(
                50 + ((i / chunkCount) * 10),
                `Processing audio chunk ${i+1}/${chunkCount}...`
            );
            
            // Create a buffer for this chunk
            const chunkBuffer = new AudioContext().createBuffer(1, samplesPerChunk, sampleRate);
            const chunkData = chunkBuffer.getChannelData(0);
            
            // Calculate the range in the original buffer
            const startSample = i * originalSamplesPerChunk;
            const endSample = Math.min((i + 1) * originalSamplesPerChunk, audioBuffer.length);
            
            // Fill the chunk with resampled data
            for (let j = 0; j < samplesPerChunk; j++) {
                // Map the position in our chunk to the original buffer with resampling
                const originalPos = startSample + Math.floor(j * (endSample - startSample) / samplesPerChunk);
                
                if (originalPos < audioBuffer.length) {
                    // Average all channels for mono output
                    let sum = 0;
                    for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
                        sum += audioBuffer.getChannelData(c)[originalPos];
                    }
                    chunkData[j] = sum / audioBuffer.numberOfChannels;
                }
            }
            
            // Normalize audio levels for this chunk
            normalizeAudioLevels(chunkData);
            
            // Convert to WAV - use 16-bit for better quality
            const chunkBlob = await convertAudioToWav(chunkBuffer, 16);
            processedChunks.push(chunkBlob);
            
            console.log(`Chunk ${i+1} processed: ${(chunkBlob.size / (1024 * 1024)).toFixed(2)}MB`);
        }
        
        // Return information about the chunks rather than a single blob
        return {
            isPartitioned: true,
            chunks: processedChunks,
            chunkCount: chunkCount,
            totalDuration: audioBuffer.duration,
            fileName: fileName
        };
    }

    // Helper function to normalize audio levels in a buffer
    function normalizeAudioLevels(bufferData) {
        // Find maximum amplitude
        let maxAmplitude = 0;
        for (let i = 0; i < bufferData.length; i++) {
            maxAmplitude = Math.max(maxAmplitude, Math.abs(bufferData[i]));
        }
        
        // If we found some non-zero amplitude, normalize to 0.8 (leaving headroom)
        if (maxAmplitude > 0) {
            const normalizationFactor = 0.8 / maxAmplitude;
            for (let i = 0; i < bufferData.length; i++) {
                bufferData[i] *= normalizationFactor;
            }
        }
    }

    // Function to transcribe audio using OpenAI's Whisper API
    async function transcribeAudio(audioData, audioContext, apiKey, fileName) {
        try {
            // First check if file is too large
            if (!isFileSizeWithinLimits(audioData)) {
                console.log(`File ${fileName} exceeds 25MB limit. Attempting to process...`);
                updateProgress(50, `Large audio file detected. Processing ${fileName}...`);
            }
            
            let processedAudio;
            
            try {
                // Decode and convert audio to an appropriate format
                if (fileName.endsWith('.opus') || !isFileSizeWithinLimits(audioData)) {
                    console.log(`Processing ${fileName}. Size: ${(audioData.byteLength / (1024 * 1024)).toFixed(2)}MB`);
                    
                    // Process the audio file
                    processedAudio = await downsampleAudio(audioData, audioContext, fileName);
                    
                    // Check if we have a partitioned result
                    if (processedAudio && processedAudio.isPartitioned) {
                        console.log(`Processing partitioned audio with ${processedAudio.chunks.length} chunks`);
                        
                        // Process each chunk and concatenate the transcripts
                        let fullTranscript = '';
                        for (let i = 0; i < processedAudio.chunks.length; i++) {
                            const chunkBlob = processedAudio.chunks[i];
                            
                            updateProgress(
                                60 + ((i / processedAudio.chunks.length) * 30),
                                `Transcribing chunk ${i+1}/${processedAudio.chunks.length}...`
                            );
                            
                            // Send to OpenAI
                            const formData = new FormData();
                            formData.append('file', chunkBlob, `chunk_${i+1}_${fileName.replace('.opus', '.wav')}`);
                            formData.append('model', 'whisper-1');
                            
                            try {
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
                                
                                // Add chunk transcript to full transcript with proper spacing
                                if (fullTranscript && data.text) {
                                    fullTranscript += ' ' + data.text;
                                } else {
                                    fullTranscript = data.text;
                                }
                                
                                console.log(`Chunk ${i+1} transcription completed: ${data.text.substring(0, 100)}...`);
                            } catch (error) {
                                console.error(`Error transcribing chunk ${i+1}:`, error);
                                fullTranscript += ` [Error with part ${i+1}: ${error.message}]`;
                            }
                        }
                        
                        // Clean up and return the combined transcript
                        fullTranscript = cleanupTranscript(fullTranscript);
                        return fullTranscript;
                    }
                    
                    // For regular (non-partitioned) audio, send to OpenAI as usual
                    const formData = new FormData();
                    formData.append('file', processedAudio, fileName.replace('.opus', '.wav'));
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
                } else {
                    // For other formats that don't need processing, use as is
                    const audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
                    
                    // Send to OpenAI
                    const formData = new FormData();
                    formData.append('file', audioBlob, fileName);
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
                }
            } catch (error) {
                console.error('Error processing audio:', error);
                throw error;
            }
        } catch (error) {
            console.error('Transcription error:', error);
            throw error;
        }
    }

    // Helper function to clean up and improve partitioned transcript
    function cleanupTranscript(transcript) {
        if (!transcript) return '';
        
        // Remove duplicate words at chunk boundaries
        // First, split into sentences
        const sentences = transcript.match(/[^.!?]+[.!?]+/g) || [transcript];
        
        // Filter out duplicate sentences
        const uniqueSentences = [];
        const seenSentences = new Set();
        
        for (const sentence of sentences) {
            const trimmed = sentence.trim();
            // Use a simplified version for comparison (lowercase, remove extra spaces)
            const simplified = trimmed.toLowerCase().replace(/\s+/g, ' ');
            
            if (!seenSentences.has(simplified) && simplified.length > 5) {
                seenSentences.add(simplified);
                uniqueSentences.push(trimmed);
            }
        }
        
        // Recombine with proper spacing
        return uniqueSentences.join(' ');
    }

    // Function to convert AudioBuffer to WAV with variable bit depth
    async function convertAudioToWav(audioBuffer, bitDepth = 16) {
        // Create WAV file
        const numOfChannels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        
        // Calculate bytes per sample based on bit depth
        const bytesPerSample = bitDepth === 8 ? 1 : 2;
        
        const length = audioBuffer.length * numOfChannels * bytesPerSample + 44;
        const wavBuffer = new ArrayBuffer(length);
        const view = new DataView(wavBuffer);

        // Write WAV header
        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + audioBuffer.length * numOfChannels * bytesPerSample, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM format
        view.setUint16(22, numOfChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numOfChannels * bytesPerSample, true);
        view.setUint16(32, numOfChannels * bytesPerSample, true);
        view.setUint16(34, bitDepth, true);
        writeString(view, 36, 'data');
        view.setUint32(40, audioBuffer.length * numOfChannels * bytesPerSample, true);

        // Write PCM samples with an optimized approach to reduce memory usage
        let offset = 44;
        
        if (bitDepth === 8) {
            // 8-bit unsigned PCM - process in chunks to reduce memory impact
            const CHUNK_SIZE = 16384; // Process 16K samples at a time
            
            for (let channel = 0; channel < numOfChannels; channel++) {
                const channelData = audioBuffer.getChannelData(channel);
                
                for (let i = 0; i < audioBuffer.length; i += CHUNK_SIZE) {
                    const chunkEnd = Math.min(i + CHUNK_SIZE, audioBuffer.length);
                    
                    for (let j = i; j < chunkEnd; j++) {
                        // Convert -1.0...1.0 to 0...255
                        const sample = channelData[j];
                        const intSample = Math.max(0, Math.min(255, ((sample + 1) / 2) * 255));
                        
                        // For 8-bit, we're writing at offset + j
                        const writeOffset = 44 + j + (channel * audioBuffer.length);
                        if (writeOffset < length) {
                            view.setUint8(writeOffset, intSample);
                        }
                    }
                }
            }
        } else {
            // 16-bit signed PCM - also process in chunks
            const CHUNK_SIZE = 8192; // Process 8K samples at a time for 16-bit
            
            for (let channel = 0; channel < numOfChannels; channel++) {
                const channelData = audioBuffer.getChannelData(channel);
                
                for (let i = 0; i < audioBuffer.length; i += CHUNK_SIZE) {
                    const chunkEnd = Math.min(i + CHUNK_SIZE, audioBuffer.length);
                    
                    for (let j = i; j < chunkEnd; j++) {
                        const sample = channelData[j];
                        const intSample = Math.max(-1, Math.min(1, sample));
                        
                        // For 16-bit, we're writing at offset + (j * 2)
                        const writeOffset = 44 + (j * 2) + (channel * audioBuffer.length * 2);
                        if (writeOffset < length - 1) { // Ensure we have space for 2 bytes
                            view.setInt16(writeOffset, intSample < 0 ? intSample * 0x8000 : intSample * 0x7FFF, true);
                        }
                    }
                }
            }
        }

        // Create the final blob with proper MIME type
        return new Blob([wavBuffer], { type: 'audio/wav' });
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

            // Auto-save API key when processing starts
            saveApiKey(apiKey);

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
                mediaFiles = {}; // Reset media files object
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
                            
                            // Also store in mediaFiles for playback
                            const audioData = await zip.files[fileName].async('arraybuffer');
                            const audioBlob = new Blob([audioData], { 
                                type: fileName.endsWith('.opus') ? 'audio/ogg' : 
                                      fileName.endsWith('.mp3') ? 'audio/mpeg' :
                                      fileName.endsWith('.m4a') ? 'audio/m4a' :
                                      fileName.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg'
                            });
                            mediaFiles[fileName] = URL.createObjectURL(audioBlob);
                            
                            mediaStats.audio++;
                        } else if (fileName.match(/\.(jpg|jpeg|png|gif)$/i) || fileName.includes('PHOTO')) {
                            // Extract image files
                            try {
                                const imageData = await zip.files[fileName].async('arraybuffer');
                                const imageBlob = new Blob([imageData], { 
                                    type: fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') ? 'image/jpeg' :
                                          fileName.endsWith('.png') ? 'image/png' :
                                          fileName.endsWith('.gif') ? 'image/gif' : 'image/jpeg'
                                });
                                mediaFiles[fileName] = URL.createObjectURL(imageBlob);
                            } catch (error) {
                                console.error(`Failed to extract image ${fileName}:`, error);
                            }
                            mediaStats.photo++;
                        } else if (fileName.match(/\.(mp4|mov|avi)$/i) || fileName.includes('VIDEO')) {
                            // Extract video files (for thumbnail and playback)
                            try {
                                const videoData = await zip.files[fileName].async('arraybuffer');
                                const videoBlob = new Blob([videoData], { 
                                    type: fileName.endsWith('.mp4') ? 'video/mp4' :
                                          fileName.endsWith('.mov') ? 'video/quicktime' :
                                          fileName.endsWith('.avi') ? 'video/x-msvideo' : 'video/mp4'
                                });
                                mediaFiles[fileName] = URL.createObjectURL(videoBlob);
                            } catch (error) {
                                console.error(`Failed to extract video ${fileName}:`, error);
                            }
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

                // Add media files to structured data
                structuredData.mediaFiles = mediaFiles;

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

    // Create a lightbox for viewing images
    function createLightbox() {
        // Check if lightbox already exists
        if (document.getElementById('whatsapp-lightbox')) {
            return;
        }
        
        const lightbox = document.createElement('div');
        lightbox.id = 'whatsapp-lightbox';
        lightbox.className = 'whatsapp-lightbox';
        lightbox.innerHTML = `
            <div class="lightbox-content">
                <span class="lightbox-close">&times;</span>
                <img class="lightbox-image" src="">
                <video class="lightbox-video" controls style="display:none;"></video>
                <div class="lightbox-caption"></div>
            </div>
        `;
        
        document.body.appendChild(lightbox);
        
        // Close lightbox when clicking the close button or outside the image
        const closeBtn = document.querySelector('.lightbox-close');
        closeBtn.addEventListener('click', () => {
            lightbox.style.display = 'none';
            
            // Pause video if playing
            const video = document.querySelector('.lightbox-video');
            if (video) {
                video.pause();
            }
        });
        
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) {
                lightbox.style.display = 'none';
                
                // Pause video if playing
                const video = document.querySelector('.lightbox-video');
                if (video) {
                    video.pause();
                }
            }
        });
        
        return lightbox;
    }

    // Initialize lightbox
    createLightbox();

    // Function to show image in lightbox
    function showMediaInLightbox(mediaUrl, caption, isVideo = false) {
        const lightbox = document.getElementById('whatsapp-lightbox');
        const lightboxImage = document.querySelector('.lightbox-image');
        const lightboxVideo = document.querySelector('.lightbox-video');
        const lightboxCaption = document.querySelector('.lightbox-caption');
        
        if (isVideo) {
            lightboxVideo.src = mediaUrl;
            lightboxVideo.style.display = 'block';
            lightboxImage.style.display = 'none';
        } else {
            lightboxImage.src = mediaUrl;
            lightboxImage.style.display = 'block';
            lightboxVideo.style.display = 'none';
        }
        
        lightboxCaption.textContent = caption || '';
        lightbox.style.display = 'flex';
    }

    // Create a reusable audio player component
    function createAudioPlayer(audioUrl, durationSecs = 0) {
        const audioPlayer = document.createElement('div');
        audioPlayer.className = 'whatsapp-audio-player';
        
        // Format duration
        const minutes = Math.floor(durationSecs / 60);
        const seconds = Math.floor(durationSecs % 60);
        const formattedDuration = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
        
        audioPlayer.innerHTML = `
            <div class="audio-player-container">
                <button class="audio-play-button">
                    <span class="play-icon">▶</span>
                    <span class="pause-icon" style="display:none;">⏸</span>
                </button>
                <div class="audio-waveform">
                    <div class="audio-progress"></div>
                </div>
                <div class="audio-duration">${durationSecs > 0 ? formattedDuration : '0:00'}</div>
                <div class="audio-speed-control">
                    <button class="speed-btn active" data-speed="1">1x</button>
                    <button class="speed-btn" data-speed="1.5">1.5x</button>
                    <button class="speed-btn" data-speed="2">2x</button>
                </div>
            </div>
            <audio preload="metadata">
                <source src="${audioUrl}" type="audio/mpeg">
                Your browser does not support the audio element.
            </audio>
        `;
        
        // Set up audio player functionality after it's added to the DOM
        setTimeout(() => {
            const audio = audioPlayer.querySelector('audio');
            const playButton = audioPlayer.querySelector('.audio-play-button');
            const playIcon = audioPlayer.querySelector('.play-icon');
            const pauseIcon = audioPlayer.querySelector('.pause-icon');
            const progress = audioPlayer.querySelector('.audio-progress');
            const waveform = audioPlayer.querySelector('.audio-waveform');
            const durationDisplay = audioPlayer.querySelector('.audio-duration');
            const speedButtons = audioPlayer.querySelectorAll('.speed-btn');
            
            // Update audio duration once metadata is loaded
            audio.addEventListener('loadedmetadata', () => {
                const minutes = Math.floor(audio.duration / 60);
                const seconds = Math.floor(audio.duration % 60);
                durationDisplay.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
            });
            
            // Play/pause functionality
            playButton.addEventListener('click', () => {
                if (audio.paused) {
                    // Pause all other audio elements first
                    document.querySelectorAll('.whatsapp-audio-player audio').forEach(el => {
                        if (el !== audio && !el.paused) {
                            el.pause();
                            const playerContainer = el.closest('.whatsapp-audio-player');
                            playerContainer.querySelector('.play-icon').style.display = 'inline-block';
                            playerContainer.querySelector('.pause-icon').style.display = 'none';
                        }
                    });
                    
                    audio.play();
                    playIcon.style.display = 'none';
                    pauseIcon.style.display = 'inline-block';
                } else {
                    audio.pause();
                    playIcon.style.display = 'inline-block';
                    pauseIcon.style.display = 'none';
                }
            });
            
            // Speed control functionality
            speedButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    // Remove active class from all buttons
                    speedButtons.forEach(b => b.classList.remove('active'));
                    
                    // Add active class to clicked button
                    btn.classList.add('active');
                    
                    // Set playback rate
                    const speed = parseFloat(btn.getAttribute('data-speed'));
                    audio.playbackRate = speed;
                    
                    // Update timing calculations for the progress display
                    updateTimeDisplay();
                });
            });
            
            // Function to update time display based on current playback rate
            function updateTimeDisplay() {
                const currentMin = Math.floor(audio.currentTime / 60);
                const currentSec = Math.floor(audio.currentTime % 60);
                durationDisplay.textContent = `${currentMin}:${currentSec < 10 ? '0' : ''}${currentSec}`;
            }
            
            // Update progress bar
            audio.addEventListener('timeupdate', () => {
                const percent = (audio.currentTime / audio.duration) * 100;
                progress.style.width = `${percent}%`;
                
                // Update time display
                updateTimeDisplay();
            });
            
            // Reset when ended
            audio.addEventListener('ended', () => {
                audio.currentTime = 0;
                progress.style.width = '0%';
                playIcon.style.display = 'inline-block';
                pauseIcon.style.display = 'none';
                
                // Reset time display to total duration
                const minutes = Math.floor(audio.duration / 60);
                const seconds = Math.floor(audio.duration % 60);
                durationDisplay.textContent = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
            });
            
            // Allow clicking on waveform to seek
            waveform.addEventListener('click', (e) => {
                const rect = waveform.getBoundingClientRect();
                const pos = (e.clientX - rect.left) / rect.width;
                audio.currentTime = pos * audio.duration;
            });
        }, 0);
        
        return audioPlayer;
    }

    // Process URLs in message content to create link previews
    function processMessageLinks(content) {
        // Regular expression to find URLs
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urls = content.match(urlRegex);
        
        if (!urls || urls.length === 0) {
            return { content, linkPreviews: [] };
        }
        
        // Keep track of link previews to add after the message
        const linkPreviews = [];
        
        // Convert URLs to clickable links
        let processedContent = content.replace(urlRegex, (url) => {
            // Add to link previews
            linkPreviews.push(url);
            
            // Return clickable link
            return `<a href="${url}" target="_blank" class="message-link">${url}</a>`;
        });
        
        return { content: processedContent, linkPreviews };
    }

    // Create link preview element
    function createLinkPreview(url) {
        const previewEl = document.createElement('div');
        previewEl.className = 'link-preview';
        
        // Extract domain for display
        let domain = "";
        try {
            domain = new URL(url).hostname;
        } catch (e) {
            domain = url;
        }
        
        previewEl.innerHTML = `
            <div class="link-preview-content">
                <div class="link-preview-domain">${domain}</div>
                <div class="link-preview-title">${url}</div>
            </div>
        `;
        
        // Make the entire preview clickable
        previewEl.addEventListener('click', () => {
            window.open(url, '_blank');
        });
        
        return previewEl;
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
            let linkPreviewEls = [];

            // Add sender name for all messages in a dialogue, or only received messages in a group
            if (isDialogue || !isFromMe) {
                senderHtml = `<div class="message-sender">${msg.sender}</div>`;
            }

            // Format content based on message type
            switch (msg.type) {
                case 'text':
                    // Process links in the text
                    const { content: processedContent, linkPreviews } = processMessageLinks(msg.content);
                    contentHtml = `<div class="message-content">${formatMessageText(processedContent)}</div>`;
                    
                    // Create link previews
                    linkPreviews.forEach(url => {
                        linkPreviewEls.push(createLinkPreview(url));
                    });
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
                            <div class="audio-message-container">
                                <div class="audio-player-wrapper"></div>
                                <div class="audio-transcript-text">${formatAudioTranscription(msg.content)}</div>
                            </div>
                        </div>
                    `;
                    break;

                case 'photo':
                    // Check if we have the actual image file
                    const imageSrc = data.mediaFiles && data.mediaFiles[msg.fileName];
                    if (imageSrc) {
                        contentHtml = `
                            <div class="message-content">
                                <div class="image-container">
                                    <img src="${imageSrc}" alt="Image" class="chat-image" data-filename="${msg.fileName}">
                                </div>
                            </div>
                        `;
                    } else {
                        contentHtml = `
                            <div class="message-content">
                                <span class="media-indicator">📷</span> 
                                Photo: ${msg.fileName || ''}
                            </div>
                        `;
                    }
                    break;

                case 'video':
                    // Check if we have the actual video file
                    const videoSrc = data.mediaFiles && data.mediaFiles[msg.fileName];
                    if (videoSrc) {
                        contentHtml = `
                            <div class="message-content">
                                <div class="video-container">
                                    <video class="chat-video" data-filename="${msg.fileName}">
                                        <source src="${videoSrc}" type="video/mp4">
                                        Your browser does not support video playback.
                                    </video>
                                    <div class="video-play-overlay">
                                        <div class="video-play-button">▶</div>
                                    </div>
                                </div>
                            </div>
                        `;
                    } else {
                        contentHtml = `
                            <div class="message-content">
                                <span class="media-indicator">🎥</span> 
                                Video: ${msg.fileName || ''}
                            </div>
                        `;
                    }
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
            
            // Add link previews after the message if needed
            linkPreviewEls.forEach(previewEl => {
                const linkPreviewContainer = document.createElement('div');
                linkPreviewContainer.className = `message-link-preview ${isFromMe ? 'sent' : 'received'}`;
                linkPreviewContainer.appendChild(previewEl);
                messagesContainer.appendChild(linkPreviewContainer);
            });
            
            // Set up media interactions for this message
            if (msg.type === 'photo' && data.mediaFiles && data.mediaFiles[msg.fileName]) {
                const img = messageEl.querySelector('.chat-image');
                if (img) {
                    img.addEventListener('click', () => {
                        showMediaInLightbox(data.mediaFiles[msg.fileName], msg.fileName);
                    });
                }
            }
            
            if (msg.type === 'video' && data.mediaFiles && data.mediaFiles[msg.fileName]) {
                const videoContainer = messageEl.querySelector('.video-container');
                if (videoContainer) {
                    videoContainer.addEventListener('click', () => {
                        showMediaInLightbox(data.mediaFiles[msg.fileName], msg.fileName, true);
                    });
                }
            }
            
            // Add audio player for audio messages
            if (msg.type === 'audio' && msg.fileName && data.mediaFiles && data.mediaFiles[msg.fileName]) {
                const audioPlayerWrapper = messageEl.querySelector('.audio-player-wrapper');
                if (audioPlayerWrapper) {
                    const audioPlayer = createAudioPlayer(data.mediaFiles[msg.fileName]);
                    audioPlayerWrapper.appendChild(audioPlayer);
                }
            }
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
        structuredData.messages.sort((a, b) => {
            const timestampA = a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp);
            const timestampB = b.timestamp instanceof Date ? a.timestamp : new Date(b.timestamp);
            return timestampA - timestampB;
        });

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
