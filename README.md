# WhatsApp Chat Extractor & Transcriber

A web-based tool to extract WhatsApp chat exports, transcribe audio messages using OpenAI's Whisper API, and merge them with the text chat for easier reading and searching.

## Features

- Opens WhatsApp chat exports (ZIP format)
- Parses chat text
- Identifies multiple message types:
  - Regular text messages
  - Audio messages (opus, mp3, etc.)
  - Photos and videos
  - Stickers
  - Documents
  - Links/URLs
- Transcribes audio messages using OpenAI's Whisper API
- Automatically handles large audio files (downsampling files > 25MB)
- Merges transcriptions with the chat text
- Displays media in an interactive WhatsApp-like interface:
  - Audio player with playback speed controls (1x, 1.5x, 2x)
  - Clickable images with lightbox view
  - Video player with thumbnail preview
  - Link previews
- Exports the result as a TXT file or PDF

## How to Use

1. Export your WhatsApp chat:
   - Open a WhatsApp chat
   - Tap the three dots (⋮) > More > Export chat
   - Choose "Include media" to get audio files
   - Share the resulting ZIP file to your computer

2. Using the application:
   - Open index.html in a modern web browser
   - Enter your OpenAI API key (required for transcription)
   - Click "Choose File" and select your WhatsApp chat ZIP
   - Click "Process ZIP File"
   - Wait for processing to complete
   - Browse through the WhatsApp-style chat view or switch to raw text
   - Use the audio player speed controls to adjust playback speed
   - Click "Download as TXT" or "Download as PDF" to save the chat

## OpenAI API Integration

This tool uses the OpenAI Whisper API for high-quality audio transcription:

1. You must provide your own OpenAI API key
2. API usage will count toward your OpenAI account usage and may incur charges
3. The audio is sent directly from your browser to OpenAI's servers using your API key
4. No audio data is stored on our servers
5. Files larger than 25MB are automatically downsampled to meet OpenAI's size limits

You can get an API key from [OpenAI's website](https://platform.openai.com/account/api-keys).

## Supported WhatsApp Export Formats

The tool has been tested with different WhatsApp export formats, including:

```
[2025-03-13, 5:17:38 PM] Sender: Message text
[2025-03-13, 5:47:51 PM] Sender: ‎<attached: 00000004-AUDIO-2025-03-13-17-47-51.opus>
```

As well as other common formats like:

```
13/03/2025, 17:17 - Sender: Message text
```

## Limitations

- The current implementation requires an OpenAI API key for audio transcription.
- WhatsApp exports can vary in format, so parsing may not work perfectly for all cases.
- ZIP files with many large audio files may cause browser performance issues.
- Very large audio files (>25MB) will be automatically downsampled, which may affect transcription quality.

## License

MIT
