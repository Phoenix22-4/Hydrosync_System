export const handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (error) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const { message, documentation } = body;
  if (!message || typeof message !== 'string') {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required field: message' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not found in environment');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server configuration missing Gemini API key.' }) };
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const systemPrompt = `You are HydroSync AI, a friendly and knowledgeable water system assistant. You help users understand their water tank levels, pump status, and troubleshoot issues. Speak in simple, everyday language that anyone can understand — like a helpful neighbour who knows about water systems. Keep answers short and practical. If someone asks something not about water systems, you can still help but gently guide them back.\n\nHere is what you know about HydroSync:\n${documentation || 'HydroSync is a smart water management system that monitors tank levels and controls a pump automatically.'}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }]
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: message }]
          }
        ],
        generationConfig: { temperature: 0.7, maxOutputTokens: 500 },
      }),
    });

    if (!response.ok) {
      const errData = await response.text();
      console.error('Gemini API error:', response.status, errData);
      return { statusCode: response.status, headers, body: JSON.stringify({ error: `Gemini API error: ${errData}` }) };
    }

    const data = await response.json();
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return { statusCode: 200, headers, body: JSON.stringify({ result: resultText }) };
  } catch (error) {
    console.error('AI function error:', error.message || error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: `Failed to generate AI response: ${error.message || 'Unknown error'}` }) };
  }
};
