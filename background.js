const SYSTEM_PROMPT = "You are 'VisionAssist', a real-time accessibility AI for a totally blind user. You are looking at a screenshot of their current webpage, along with the extracted code (DOM). Keep your answers incredibly concise, clear, and actionable. Do not describe decorative elements or colors unless asked. Prioritize telling the user the main purpose of the page, where the primary navigation is, and what interactive buttons are currently visible.";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'processContext') {
    processWithGemini(request.payload, sender.tab.id).then(sendResponse);
    return true; // Keep message channel open for async response
  }
});

async function processWithGemini(payload, tabId) {
  try {
    const data = await chrome.storage.local.get(['geminiApiKey', 'demoMode']);
    
    // --- DEMO MODE OVERRIDE ---
    if (data.demoMode) {
      console.log("Demo mode is running. Skipping Gemini API.");
      // Parse out the context to make the fake response sound real!
      const titleMatch = payload.domContext.match(/Title:\s*(.*)/);
      const h1Match = payload.domContext.match(/Primary Heading:\s*(.*)/);
      const pageTitle = titleMatch ? titleMatch[1] : "this webpage";
      const h1Text = h1Match ? h1Match[1] : "various contents";
      
      // Simulate network / AI processing delay so it looks real
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      return { 
        text: `You are currently viewing ${pageTitle}. The main primary heading on the screen says ${h1Text}. There are also several interactive links and buttons visible. What else would you like to know?` 
      };
    }
    // --------------------------

    if (!data.geminiApiKey) {
      return { error: 'API key is missing. Please set it in the extension options.' };
    }

    const { domContext, transcript } = payload;
    let screenshotDataUrl = '';
    
    // Capture the visible tab
    try {
      screenshotDataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 80 });
    } catch (e) {
      console.error("Screenshot failed", e);
    }
    
    // Format image data
    let inlineData = null;
    if (screenshotDataUrl) {
      const base64Data = screenshotDataUrl.split(',')[1];
      inlineData = {
        mimeType: 'image/jpeg',
        data: base64Data
      };
    }

    const promptText = `${SYSTEM_PROMPT}\n\nUser Query: ${transcript}\n\nExtracted Page Context:\n${domContext}`;
    
    const parts = [{ text: promptText }];
    if (inlineData) {
      parts.push({ inline_data: inlineData });
    }

    const requestBody = {
      contents: [{
        parts: parts
      }]
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${data.geminiApiKey}`;
    
    console.log("Sending request to Gemini API...");
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("API Error Response:", errorText);
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log("Gemini API Result:", result);
    
    if (result.candidates && result.candidates[0].content.parts[0].text) {
      return { text: result.candidates[0].content.parts[0].text };
    }
    return { error: 'No response from AI.' };
  } catch (err) {
    console.error(err);
    return { error: 'Failed to process the request. ' + err.message };
  }
}