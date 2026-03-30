// Context Extraction
function extractPageContext() {
  const title = document.title || 'No Title';
  const h1 = document.querySelector('h1') ? document.querySelector('h1').innerText : 'No H1';
  
  // Extract visible paragraphs
  const paragraphs = Array.from(document.querySelectorAll('p'))
    .filter(p => {
      const rect = p.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(p).visibility !== 'hidden';
      return isVisible && p.innerText.trim().length > 20; // Only get substantial text, not tiny labels
    })
    .map(p => p.innerText.trim())
    .slice(0, 3); // Limit to first 3 paragraphs to save token space
  
  const buttonsAndLinks = Array.from(document.querySelectorAll('button, a'))
    .filter(el => {
      const rect = el.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
      return isVisible && el.innerText.trim() !== '';
    })
    .map(el => `${el.tagName.toLowerCase()}: ${el.innerText.trim()}`)
    .slice(0, 15); // Slightly reduced since we added paragraphs

  let context = `Title: ${title}\nPrimary Heading: ${h1}\n\nVisible Text/Paragraphs:\n${paragraphs.join('\n\n')}\n\nInteractive Elements:\n${buttonsAndLinks.join('\n')}`;
  
  // Cap at ~1500 chars so it doesn't break limits
  if (context.length > 1500) {
    context = context.substring(0, 1497) + '...';
  }
  return context;
}

// Audio Feedback (Beeps)
let audioCtx;
function playBeep(frequency, duration, type = 'sine') {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  console.log('Playing beep...');
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  oscillator.start();
  gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + duration);
  setTimeout(() => oscillator.stop(), duration * 1000);
}

// Text to Speech
function speakText(text) {
  console.log("Speaking: ", text);
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Sometimes voices aren't loaded immediately
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      // Pick a default english voice if available
      const enVoice = voices.find(v => v.lang.startsWith('en'));
      if (enVoice) utterance.voice = enVoice;
    }
    
    utterance.onerror = (e) => console.error("SpeechSynthesis error:", e);
    window.speechSynthesis.speak(utterance);
  } else {
    console.error("speechSynthesis not supported");
  }
}

// Voice Recognition
function startListening() {
  console.log('startListening called');
  if (!('webkitSpeechRecognition' in window)) {
    console.error('webkitSpeechRecognition not supported in this browser.');
    speakText("Speech recognition is not supported in this browser.");
    return;
  }
  
  const recognition = new webkitSpeechRecognition();
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    console.log('Speech recognition started');
    playBeep(440, 0.2); // Listening beep
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    console.log('Transcript retrieved:', transcript);
    handleUserVoiceAction(transcript);
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    speakText("Sorry, I could not hear you.");
  };

  recognition.onend = () => {
    console.log('Speech recognition ended');
  };

  try {
    recognition.start();
    console.log('Speech recognition start requested');
  } catch (e) {
    console.error('Error starting recognition:', e);
  }
}

// Core Workflow
async function handleUserVoiceAction(transcript) {
  playBeep(880, 0.4, 'triangle'); // Processing beep
  
  const domContext = extractPageContext();
  
  try {
    chrome.runtime.sendMessage({
      action: 'processContext',
      payload: { domContext, transcript }
    }, response => {
      if (chrome.runtime.lastError) {
        console.error("Chrome runtime error:", chrome.runtime.lastError.message);
        
        if (chrome.runtime.lastError.message.includes("Extension context invalidated")) {
           speakText("The extension was reloaded. Please refresh the page to continue using VisionAssist.");
           return;
        }

        speakText("Error communicating with background process.");
        return;
      }
      
      console.log("Received response from background:", response);
      if (response) {
        if (response.error) {
          console.error("Background script returned error:", response.error);
          speakText(response.error);
        } else if (response.text) {
          // Attempt to parse JSON action commands
          try {
            const jsonStr = response.text.match(/\{.*"action".*\}/s);
            if (jsonStr) {
              const cmd = JSON.parse(jsonStr[0]);
              if (cmd.action === 'search' && cmd.query) {
                speakText(`Searching Wikipedia for ${cmd.query}...`);
                // Wait briefly so speech can start before page unloads
                setTimeout(() => {
                  window.location.href = `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(cmd.query)}`;
                }, 1500);
                return; // Stop here
              }
            }
          } catch(e) {
            // Not JSON or failed to parse, proceed to normal speech output
          }
          speakText(response.text);
        } else {
          speakText("I am sorry, I did not understand the response.");
        }
      } else {
         console.error("Response was undefined");
         speakText("No response received from the assistant.");
      }
    });
  } catch (err) {
    console.error("Caught synchronous error during sendMessage:", err);
    if (err.message && err.message.includes("Extension context invalidated")) {
        speakText("The extension was reloaded. Please refresh the page to continue.");
    }
  }
}

// Global Keyboard Listener: Alt + V
document.addEventListener('keydown', (e) => {
  if (e.altKey && e.code === 'KeyV') {
    e.preventDefault();
    console.log("Alt + V pressed! Starting VisionAssist...");
    startListening();
  }
});