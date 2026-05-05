import { GoogleGenAI } from '@google/genai';

export const handler = async (event) => {
  // CORS headers for all responses
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (error) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  const { message, documentation } = body;
  if (!message || typeof message !== 'string') {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing required field: message' }),
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not found in environment');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Server configuration missing Gemini API key. Please set GEMINI_API_KEY in Netlify environment variables.' }),
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    // Use correct model name - gemini-1.5-flash or gemini-pro
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text: message }],
        },
      ],
      config: {
        systemInstruction: `You are HydroSync AI, a smart assistant for the HydroSync water management application. Use the following documentation to answer questions accurately and in a friendly, conversational tone. Do not copy-paste the documentation verbatim. If the user asks something not in the documentation, answer using your general knowledge but remain focused on water system management.

USER DOCUMENTATION:
${documentation || 'No extra documentation provided.'}`,
        temperature: 0.7,
      },
    });

    // Extract text from response
    const resultText = response.text || (response.candidates?.[0]?.content?.parts?.[0]?.text) || '';
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ result: resultText }),
    };
  } catch (error) {
    console.error('AI function error:', error.message || error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: `Failed to generate AI response: ${error.message || 'Unknown error'}` }),
    };
  }
};
