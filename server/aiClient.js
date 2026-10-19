// tiny OpenAI-compatible chat client

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const REQUEST_TIMEOUT_MS = 180000;
const RETRY_DELAY_MS = 1500;

export function getAiConfig() {
  const apiKey = process.env.AI_API_KEY || '';
  const trailingSlashes = new RegExp('/\+$');
  const baseUrl = (process.env.AI_BASE_URL || DEFAULT_BASE_URL).replace(trailingSlashes, '');
  const model = process.env.AI_MODEL || 'gpt-6-luna';

  return {
    apiKey: apiKey,
    baseUrl: baseUrl,
    model: model,
    enabled: Boolean(apiKey)
  };
}

async function requestChatCompletion(config, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(config.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + config.apiKey
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      const error = new Error(
        'AI request failed with status ' + response.status + ': ' + errorBody.slice(0, 300)
      );

      error.isTemporary = response.status === 429 || response.status >= 500;
      throw error;
    }

    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('The AI request took too long and was cancelled.');
      timeoutError.isTemporary = true;
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function chatCompletion({
  systemPrompt,
  userPrompt,
}) {
  const config = getAiConfig();

  if (!config.enabled) {
    const error = new Error('AI_API_KEY is not configured.');
    error.code = 'AI_NOT_CONFIGURED';
    throw error;
  }

  const payload = {
    model: config.model,
    reasoning_effort: 'medium',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  };

  let lastError;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await requestChatCompletion(config, payload);
    } catch (error) {
      lastError = error;

      if (!error.isTemporary || attempt === 2) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  throw lastError;
}
