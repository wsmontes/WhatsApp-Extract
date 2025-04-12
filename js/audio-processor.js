/**
 * Audio Processing Module
 * Handles audio file processing, conversion, and transcription
 */

/**
 * Check if file size is within OpenAI's limits (25MB)
 * @param {ArrayBuffer} arrayBuffer - Audio file data
 * @returns {boolean} - Whether file is within size limits
 */
export function isFileSizeWithinLimits(arrayBuffer) {
    const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25MB in bytes
    return arrayBuffer.byteLength <= MAX_SIZE_BYTES;
}

/**
 * Write strings to DataView for WAV file generation
 * @param {DataView} view - DataView to write to
 * @param {number} offset - Offset position
 * @param {string} string - String to write
 */
export function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

/**
 * Downsample audio to reduce file size
 * @param {ArrayBuffer} audioData - Original audio data
 * @param {AudioContext} audioContext - Audio context
 * @param {string} fileName - Original file name
 * @returns {Blob|Object} - Processed audio blob or partitioned chunks
 */
export async function downsampleAudio(audioData, audioContext, fileName) {
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
        
        // Apply audio processing
        normalizeAudioLevels(newChannelData);
        
        // For large files, apply dynamic range compression
        if (compressionFactor >= 2) {
            applyDynamicRangeCompression(newChannelData, compressionFactor);
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

/**
 * Apply dynamic range compression to audio buffer
 * @param {Float32Array} bufferData - Audio buffer data
 * @param {number} compressionFactor - Compression intensity factor
 */
function applyDynamicRangeCompression(bufferData, compressionFactor) {
    const threshold = 0.5;  // Only compress samples above 50% amplitude
    const ratio = 2 + compressionFactor; // Higher ratio for larger files
    
    for (let i = 0; i < bufferData.length; i++) {
        const sample = bufferData[i];
        const absSample = Math.abs(sample);
        
        if (absSample > threshold) {
            // Amount above threshold
            const excess = absSample - threshold;
            // Compressed excess
            const compressedExcess = excess / ratio;
            // New absolute value
            const newAbsSample = threshold + compressedExcess;
            // Keep original sign
            bufferData[i] = sample >= 0 ? newAbsSample : -newAbsSample;
        }
    }
}

/**
 * Partition audio into manageable chunks
 * @param {AudioBuffer} audioBuffer - Original audio buffer
 * @param {string} fileName - Original file name
 * @returns {Object} - Partitioned audio information
 */
export async function partitionAndProcessAudio(audioBuffer, fileName) {
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
        
        // Update progress if needed - this requires a callback now that we've moved to a module
        if (window.updateProgress) {
            window.updateProgress(
                50 + ((i / chunkCount) * 10),
                `Processing audio chunk ${i+1}/${chunkCount}...`
            );
        }
        
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

/**
 * Normalize audio levels in a buffer
 * @param {Float32Array} bufferData - Audio buffer data
 */
export function normalizeAudioLevels(bufferData) {
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

/**
 * Convert AudioBuffer to WAV with variable bit depth
 * @param {AudioBuffer} audioBuffer - Audio buffer to convert
 * @param {number} bitDepth - Bit depth (8 or 16)
 * @returns {Blob} - WAV file as Blob
 */
export async function convertAudioToWav(audioBuffer, bitDepth = 16) {
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

/**
 * Analyze audio properties
 * @param {ArrayBuffer} audioData - Audio data
 * @param {AudioContext} audioContext - Audio context
 * @returns {Promise<Object>} - Audio properties
 */
export function analyzeAudio(audioData, audioContext) {
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

/**
 * Transcribe audio using OpenAI's Whisper API
 * @param {ArrayBuffer} audioData - Audio data
 * @param {AudioContext} audioContext - Audio context
 * @param {string} apiKey - OpenAI API key
 * @param {string} fileName - Audio file name
 * @returns {Promise<string>} - Transcription text
 */
export async function transcribeAudio(audioData, audioContext, apiKey, fileName) {
    try {
        // First check if file is too large
        if (!isFileSizeWithinLimits(audioData)) {
            console.log(`File ${fileName} exceeds 25MB limit. Attempting to process...`);
            // Update progress
            if (window.updateProgress) {
                window.updateProgress(50, `Large audio file detected. Processing ${fileName}...`);
            }
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
                        
                        if (window.updateProgress) {
                            window.updateProgress(
                                60 + ((i / processedAudio.chunks.length) * 30),
                                `Transcribing chunk ${i+1}/${processedAudio.chunks.length}...`
                            );
                        }
                        
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
                    return cleanupTranscript(fullTranscript);
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

/**
 * Clean up and improve partitioned transcript
 * @param {string} transcript - Raw transcript
 * @returns {string} - Cleaned transcript
 */
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

/**
 * Check if a file is an audio file
 * @param {string} fileName - File name
 * @returns {boolean} - Whether file is an audio file
 */
export function isAudioFile(fileName) {
    return fileName.match(/\.(opus|mp3|m4a|wav|ogg)$/i) || 
           fileName.includes('PTT-') ||
           fileName.includes('audio');
}
