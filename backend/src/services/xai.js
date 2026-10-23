// xai.js - xAI Grok AI coach service export
const geminiService = require('./gemini');

module.exports = {
  createXaiService: geminiService.createXaiService,
  createGeminiService: geminiService.createGeminiService,
  adviceResponseSchema: geminiService.adviceResponseSchema,
  geminiResponseSchema: geminiService.geminiResponseSchema,
  sanitizeText: geminiService.sanitizeText,
};
